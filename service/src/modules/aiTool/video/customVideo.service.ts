import { fetchRemoteUrlBuffer } from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import OpenAI from 'openai';
import { ChatLogService } from '../../chatLog/chatLog.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { UploadService } from '../../upload/upload.service';

/**
 * 自定义视频服务
 * 支持基于 customConfig 配置的动态视频生成接口
 */
@Injectable()
export class CustomVideoService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * 解析图片 URL，支持多种格式
   * @param imageUrl - 可能是 URL 字符串或 JSON 数组字符串
   * @returns 第一个图片的 URL 字符串
   */
  private parseImageUrl(imageUrl: any): string | null {
    if (!imageUrl) return null;

    // 如果已经是字符串
    if (typeof imageUrl === 'string') {
      // 尝试解析为 JSON 数组
      if (imageUrl.startsWith('[')) {
        try {
          const parsed = JSON.parse(imageUrl);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0].url || null;
          }
        } catch (e) {
          // 不是 JSON，当作普通 URL
          return imageUrl.startsWith('http') ? imageUrl : null;
        }
      }
      // 普通字符串 URL
      return imageUrl.startsWith('http') ? imageUrl : null;
    }

    // 如果是数组
    if (Array.isArray(imageUrl) && imageUrl.length > 0) {
      return imageUrl[0].url || null;
    }

    return null;
  }

  /**
   * 获取查询工具配置
   */
  private getQueryToolConfig(customConfig: any, queryToolName: string): any {
    if (customConfig.queryTools && customConfig.queryTools[queryToolName]) {
      const queryTool = customConfig.queryTools[queryToolName];

      // 新配置: 有 syncConfig 和 asyncConfig
      if (queryTool.syncConfig && queryTool.asyncConfig) {
        return queryTool;
      }

      // 旧配置迁移: 如果有 endpoint,创建新结构
      if (queryTool.endpoint) {
        return {
          ...queryTool,
          executionMode: 'async', // 默认异步
          syncConfig: {
            timeout: 60,
            resultPath:
              queryTool.responsePaths?.imageUrl || queryTool.responsePaths?.videoUrl || 'data.url',
          },
          asyncConfig: {
            endpoint: queryTool.endpoint,
            method: queryTool.method || 'GET',
            interval: 5,
            maxAttempts: 60,
          },
        };
      }
    }

    // 向后兼容: 从 tools.query 获取
    if (customConfig.tools && customConfig.tools.query) {
      const oldQuery = customConfig.tools.query;
      return {
        ...oldQuery,
        executionMode: 'async',
        syncConfig: {
          timeout: 60,
          resultPath:
            oldQuery.responsePaths?.imageUrl || oldQuery.responsePaths?.videoUrl || 'data.url',
        },
        asyncConfig: {
          endpoint: oldQuery.endpoint,
          method: oldQuery.method || 'GET',
          interval: 5,
          maxAttempts: 60,
        },
      };
    }

    throw new Error(`查询工具 ${queryToolName} 未配置`);
  }

  /**
   * 推断查询工具名称
   */
  private inferQueryToolName(toolName: string): string {
    if (toolName.includes('video')) {
      return 'videoQuery';
    }
    if (toolName.includes('image')) {
      return 'imageQuery';
    }
    // 默认返回 videoQuery
    return 'videoQuery';
  }

  /**
   * 根据 customConfig 动态生成 Function Calling 工具定义
   */
  private generateFCTools(customConfig: any): any[] {
    const tools = [];

    for (const [toolKey, toolConfig] of Object.entries(customConfig.tools)) {
      // 移除对 query 工具的跳过逻辑，确保所有生成工具都正常处理

      const tool: any = toolConfig;

      // 跳过未启用的工具
      if (tool.enabled === false) continue;

      // 构建 Function Calling 工具定义
      const fcTool = {
        type: 'function' as const,
        function: {
          name: toolKey,
          description: tool.description || `${tool.name}`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      };

      // 检查 endpoint 是否包含占位符，如果有则自动添加为工具参数
      if (
        tool.endpoint &&
        (tool.endpoint.includes('{id}') || tool.endpoint.includes('{video_id}'))
      ) {
        // 自动添加 dynamic_endpoint 参数，让 AI 生成完整的 URL
        fcTool.function.parameters.properties['dynamic_endpoint'] = {
          type: 'string',
          description: `完整的API端点路径，需要将占位符替换为实际值。模板: ${tool.endpoint}`,
        };
        fcTool.function.parameters.required.push('dynamic_endpoint');

        Logger.log(
          `检测到动态端点 ${tool.endpoint}，已添加 dynamic_endpoint 参数`,
          'CustomVideoService',
        );
      }

      // 根据 requestParams 添加参数定义
      let hasBillingCoefficient = false;
      if (tool.requestParams && Array.isArray(tool.requestParams)) {
        for (const param of tool.requestParams) {
          // 将所有参数都添加到 FC 工具定义中，让 FC 模型自己决定如何生成
          const paramDef: any = {
            type: param.type,
            description: param.description || param.name,
          };

          // 如果是数组类型，必须添加 items 定义
          if (param.type === 'array') {
            paramDef.items = {
              type: 'string', // 默认为字符串数组，适用于URL、文本等常见场景
              description: `数组中的${param.description || param.name}项`,
            };
          }

          fcTool.function.parameters.properties[param.name] = paramDef;

          // 如果参数是必填的，添加到 required 数组
          if (param.required) {
            fcTool.function.parameters.required.push(param.name);
          }

          // 标记是否已有 billing_coefficient
          if (param.name === 'billing_coefficient') {
            hasBillingCoefficient = true;
          }
        }
      }

      // 如果 requestParams 中没有 billing_coefficient，添加默认的
      if (!hasBillingCoefficient) {
        fcTool.function.parameters.properties['billing_coefficient'] = {
          type: 'number',
          description:
            '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
        };
        fcTool.function.parameters.required.push('billing_coefficient');
      }

      // 添加 completion_reply 参数
      fcTool.function.parameters.properties['completion_reply'] = {
        type: 'string',
        description:
          '生成友好自然的完成回复，告知用户视频已生成完成，语气简洁亲切，语言与用户输入保持一致。可以简单描述视频内容或表达期待，避免固定模板化的表达',
      };
      fcTool.function.parameters.required.push('completion_reply');

      tools.push(fcTool);
    }

    return tools;
  }

  /**
   * 根据工具名获取工具配置
   */
  private getToolConfig(customConfig: any, toolKey: string): any | null {
    const tool = customConfig.tools[toolKey];
    if (!tool) {
      return null;
    }
    return tool;
  }

  /**
   * 获取默认工具（用于 FC 失败时的回退）
   */
  private getDefaultTool(customConfig: any): { toolKey: string; toolConfig: any } | null {
    const tools = customConfig.tools;

    // 优先级：text2video > image2video > video2video > 其他
    if (tools.text2video?.enabled !== false) {
      return { toolKey: 'text2video', toolConfig: tools.text2video };
    } else if (tools.image2video?.enabled !== false) {
      return { toolKey: 'image2video', toolConfig: tools.image2video };
    } else if (tools.video2video?.enabled !== false) {
      return { toolKey: 'video2video', toolConfig: tools.video2video };
    }

    // 如果没有匹配的默认工具，使用第一个启用的非 query 工具
    for (const [key, config] of Object.entries(tools)) {
      const tool: any = config;
      if (key !== 'query' && tool.enabled !== false) {
        return { toolKey: key, toolConfig: tool };
      }
    }

    return null;
  }

  /**
   * 使用 Function Calling 优化参数
   * AI 会为 video2video 工具自动生成 video_id 参数
   */
  async optimizeWithFC(
    customConfig: any,
    prompt: string,
    imageUrl?: string,
    videoUrl?: string,
    extraParam?: any,
    model?: string,
    messages?: any[],
    previousTaskId?: string,
  ): Promise<{
    parameters: any;
    completionReply: string;
    selectedTool: string;
  }> {
    try {
      // 获取 Function Calling 配置
      const {
        toolCallUrl,
        toolCallKey,
        toolCallModel,
        openaiBaseKey,
        openaiBaseUrl,
        openaiBaseModel,
      } = await this.globalConfigService.getConfigs([
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
      ]);

      // 创建 OpenAI 客户端
      const openai = new OpenAI({
        apiKey: toolCallKey || openaiBaseKey,
        baseURL: await correctApiBaseUrl(toolCallUrl || openaiBaseUrl),
        timeout: 30000,
      });

      const model = toolCallModel || openaiBaseModel;

      // 生成所有启用工具的 FC 工具定义
      const fcTools = this.generateFCTools(customConfig);

      if (fcTools.length === 0) {
        Logger.warn('没有可用的 Function Calling 工具', 'CustomVideoService');
        const defaultTool = this.getDefaultTool(customConfig);
        return {
          parameters: {},
          completionReply: '任务已提交，处理中...',
          selectedTool: defaultTool?.toolKey || 'text2video',
        };
      }

      // 构建系统消息 - 让 AI 自己根据上下文选择工具
      const toolDescriptions = fcTools
        .map((tool, index) => `${index + 1}. ${tool.function.name}: ${tool.function.description}`)
        .join('\n');

      const systemMessage = `你是一个专业的视频生成助手。你有以下工具可用：

${toolDescriptions}

请根据用户的完整对话历史和当前需求，选择最合适的工具并生成参数。

重要的工具选择规则：
1. video2video (Remix工具) 使用场景：
   - 当提供了 previousTaskId（上一个视频任务ID）时
   - 并且用户的意图是基于已有视频进行修改、延续或变化时使用
   - 判断依据包括但不限于：
     * 明确提到对"这个视频"、"上一个视频"、"刚才的视频"进行操作
     * 描述了对现有内容的修改（如"把...改成..."、"让他做..."、"加上..."）
     * 要求延续情节或动作（如"然后..."、"接下来..."、"继续..."）
     * 任何暗示基于已有视频内容的表述

2. text2video 使用场景：
   - 完全新的视频生成请求
   - 没有引用之前的视频内容
   - 用户明确要求"生成新的"、"重新生成"等

3. image2video 使用场景：
   - 提供了图片URL
   - 要求基于图片生成动态视频

动态端点生成规则：
- 如果工具参数中有 dynamic_endpoint，你必须生成完整的 API 路径
- 将模板中的占位符（如 {id}、{video_id}）替换为实际值
- 例如：模板为 /v1/videos/{id}/remix，previousTaskId 为 "video_abc123"
  则 dynamic_endpoint 应该生成为：/v1/videos/video_abc123/remix

其他注意事项：
- prompt 应该清晰、具体、富有画面感，包含：镜头类型、主体、动作、场景和光线
- completion_reply 必须与用户输入的语言保持一致（如用户用中文，回复也用中文）
- completion_reply 要友好自然，可以简单描述视频内容或表达期待，避免固定的格式，让用户感到亲切`;

      // 构建消息列表
      const fcMessages: any[] = [];
      fcMessages.push({ role: 'system', content: systemMessage });

      // 添加历史消息（包含完整上下文）
      if (messages && messages.length > 0) {
        const recentMessages = messages.slice(-10);
        for (const msg of recentMessages) {
          // 保留所有历史消息，包括最后一条
          fcMessages.push({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          });
        }
      }

      // 构建当前用户消息（包含完整上下文信息）
      let userMessage = `用户说："${prompt}"`;

      // 添加上下文信息供 FC 模型使用
      const contextInfo: string[] = [];
      if (imageUrl) {
        // 解析图片 URL（可能是对象数组格式）
        const parsedImageUrl = this.parseImageUrl(imageUrl);
        if (parsedImageUrl) {
          contextInfo.push(`图片URL: ${parsedImageUrl}`);
        }
      }
      if (videoUrl) {
        contextInfo.push(`视频URL: ${videoUrl}`);
      }
      if (model) {
        contextInfo.push(`模型: ${model}`);
      }
      if (previousTaskId) {
        contextInfo.push(`上一个视频任务ID: ${previousTaskId}`);
      }
      if (extraParam && Object.keys(extraParam).length > 0) {
        contextInfo.push(`用户选择的选项: ${JSON.stringify(extraParam)}`);
      }

      if (contextInfo.length > 0) {
        userMessage += `\n\n上下文信息：\n${contextInfo.join('\n')}`;
      }

      fcMessages.push({ role: 'user', content: userMessage });

      // 调用 Function Calling
      const response = await openai.chat.completions.create({
        model: model,
        messages: fcMessages,
        tools: fcTools,
        tool_choice: 'auto',
      });

      const toolCalls = response.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const functionArgs = JSON.parse(toolCalls[0].function.arguments);
        const calledToolName = toolCalls[0].function.name;

        Logger.log(`AI 选择的工具: ${calledToolName}`, 'CustomVideoService');

        return {
          parameters: functionArgs,
          completionReply: functionArgs.completion_reply || '任务已提交，处理中...',
          selectedTool: calledToolName,
        };
      }

      // 没有工具调用，使用默认工具
      const defaultTool = this.getDefaultTool(customConfig);
      Logger.warn('Function Calling 未返回工具调用，使用默认工具', 'CustomVideoService');
      return {
        parameters: {},
        completionReply: '任务已提交，处理中...',
        selectedTool: defaultTool?.toolKey || 'text2video',
      };
    } catch (error) {
      Logger.error(
        `Function Calling 优化失败: ${error.message}`,
        error.stack,
        'CustomVideoService',
      );

      // 失败时返回默认工具
      const defaultTool = this.getDefaultTool(customConfig);
      return {
        parameters: {},
        completionReply: '任务已提交，处理中...',
        selectedTool: defaultTool?.toolKey || 'text2video',
      };
    }
  }

  /**
   * 构建请求参数
   * FC 模型已经根据所有上下文生成了完整的参数，直接使用即可
   */
  private buildRequestParams(toolConfig: any, fcParams: any): any {
    const requestBody: any = {};

    // FC 已经生成了完整的参数，直接使用
    // 移除不需要的内部参数
    const internalParams = ['enhanced_prompt', 'completion_reply', 'billing_coefficient'];

    for (const [key, value] of Object.entries(fcParams)) {
      if (!internalParams.includes(key)) {
        requestBody[key] = value;
      }
    }

    // 验证必填参数（跳过内部参数）
    // 使用上面已定义的 internalParams

    if (toolConfig.requestParams && Array.isArray(toolConfig.requestParams)) {
      for (const param of toolConfig.requestParams) {
        // 跳过内部参数的验证
        if (internalParams.includes(param.name)) {
          continue;
        }

        if (param.required && !requestBody[param.name]) {
          Logger.warn(`必填参数 ${param.name} 缺失`, 'CustomVideoService');
        }
      }
    }
    return requestBody;
  }

  /**
   * 使用 responsePaths 配置提取响应数据
   */
  private extractResponseData(responseData: any, responsePaths: any): any {
    const extracted: any = {};

    if (!responsePaths) {
      Logger.warn('responsePaths 配置缺失', 'CustomVideoService');
      return extracted;
    }

    for (const [key, path] of Object.entries(responsePaths)) {
      const pathStr = path as string;
      const value = this.getValueByPath(responseData, pathStr);
      extracted[key] = value;
    }

    return extracted;
  }

  /**
   * 根据路径获取对象中的值
   */
  private getValueByPath(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * 映射任务状态
   */
  private mapTaskStatus(
    rawStatus: string,
    statusMapping: any,
  ): 'submitted' | 'processing' | 'success' | 'failed' {
    if (!statusMapping) {
      return 'processing';
    }

    // 检查每种状态的映射
    if (statusMapping.submitted && statusMapping.submitted.includes(rawStatus)) {
      return 'submitted';
    }
    if (statusMapping.processing && statusMapping.processing.includes(rawStatus)) {
      return 'processing';
    }
    if (statusMapping.success && statusMapping.success.includes(rawStatus)) {
      return 'success';
    }
    if (statusMapping.failed && statusMapping.failed.includes(rawStatus)) {
      return 'failed';
    }

    // 默认返回 processing
    return 'processing';
  }

  /**
   * 从 URL 下载文件到 Buffer
   */
  private async downloadFileFromUrl(url: string): Promise<{ buffer: Buffer; filename: string }> {
    try {
      const { buffer } = await fetchRemoteUrlBuffer(url, {
        timeoutMs: 30000,
        maxBytes: 25 * 1024 * 1024,
        maxRedirects: 3,
      });

      // 从 URL 中提取文件名
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1] || 'file';

      return {
        buffer,
        filename,
      };
    } catch (error) {
      Logger.error(`下载文件失败: ${error?.message || '未知错误'}`, 'CustomVideoService');
      throw new HttpException('无法下载文件', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 提交任务
   */
  async submitTask(
    toolConfig: any,
    requestBody: any,
    apiKey: string,
    apiBaseUrl: string,
    previousTaskId?: string,
  ): Promise<string> {
    try {
      // 支持 overrideUrl 和 overrideKey
      const overrideUrl = toolConfig.overrideUrl;
      const overrideKey = toolConfig.overrideKey;

      // 直接使用原始 URL，不进行格式化（因为 endpoint 已经包含完整路径）
      let baseUrl = overrideUrl || apiBaseUrl;
      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      let endpoint = toolConfig.endpoint;

      // 优先检查 AI 生成的 dynamic_endpoint（新方案）
      if (requestBody.dynamic_endpoint) {
        // 使用 AI 生成的动态端点路径
        endpoint = requestBody.dynamic_endpoint;
        Logger.log(`使用AI生成的动态端点`, 'CustomVideoService');
        // 从请求体中移除 dynamic_endpoint，因为它只是用来指定URL的
        delete requestBody.dynamic_endpoint;
      }
      // 兼容旧的 api_endpoint 参数
      else if (requestBody.api_endpoint) {
        endpoint = requestBody.api_endpoint;
        Logger.log(`使用AI生成的API端点`, 'CustomVideoService');
        delete requestBody.api_endpoint;
      }
      // 使用配置的 endpoint
      else if (endpoint) {
        if (!endpoint.startsWith('/')) {
          endpoint = `/${endpoint}`;
        }

        // 处理 URL 中的占位符（向后兼容）
        if (
          endpoint.includes('{id}') ||
          endpoint.includes('{video_id}') ||
          endpoint.includes('{task_id}')
        ) {
          const videoId = requestBody.video_id || requestBody.task_id || previousTaskId;
          if (videoId) {
            endpoint = endpoint
              .replace('{id}', videoId)
              .replace('{video_id}', videoId)
              .replace('{task_id}', videoId);
            Logger.log(
              '视频Remix：已使用任务 ID 替换 URL 中的占位符',
              'CustomVideoService',
            );
            delete requestBody.video_id;
            delete requestBody.task_id;
          }
        }

        // 处理其他 URL 占位符
        if (toolConfig.requestParams && Array.isArray(toolConfig.requestParams)) {
          for (const param of toolConfig.requestParams) {
            if (param.urlPlaceholder && endpoint.includes(`{${param.urlPlaceholder}}`)) {
              const paramValue = requestBody[param.name];
              if (paramValue) {
                endpoint = endpoint.replace(`{${param.urlPlaceholder}}`, paramValue);
                delete requestBody[param.name];
              }
            }
          }
        }
      } else {
        // 如果没有 endpoint 配置，报错
        throw new Error('缺少API端点配置');
      }

      const url = `${baseUrl}${endpoint}`;
      const method = (toolConfig.method || 'POST').toLowerCase();
      const finalApiKey = overrideKey || apiKey;

      // 检测是否使用 multipart/form-data（通过 contentType 配置）
      const useMultipart = toolConfig.contentType === 'multipart/form-data';

      Logger.log(
        `[提交视频生成任务]\n` +
          `  Method: ${method.toUpperCase()}\n` +
          `  Content-Type: ${useMultipart ? 'multipart/form-data' : 'application/json'}\n` +
          `  使用${overrideUrl ? '覆盖的' : '默认'}地址`,
        'CustomVideoService',
      );

      let response;

      if (useMultipart && method === 'post') {
        // 使用 multipart/form-data 格式
        const formData = new FormData();

        // 从配置中获取文件字段列表（标记为 isFile 的参数）
        const fileFields: string[] = [];
        if (toolConfig.requestParams && Array.isArray(toolConfig.requestParams)) {
          toolConfig.requestParams
            .filter(param => param.isFile === true)
            .forEach(param => fileFields.push(param.name));
        }

        if (fileFields.length > 0) {
          Logger.log(`使用配置的文件字段: ${fileFields.join(', ')}`, 'CustomVideoService');
        }

        for (const [key, value] of Object.entries(requestBody)) {
          // 跳过空值
          if (value === null || value === undefined || value === '') {
            continue;
          }

          // 如果是文件字段，处理单个或多个 URL
          if (fileFields.includes(key)) {
            let urls: string[] = [];

            // 解析 URL（支持数组、逗号分隔字符串、单个URL）
            if (Array.isArray(value)) {
              urls = value.filter(v => typeof v === 'string' && v.startsWith('http'));
            } else if (typeof value === 'string') {
              if (value.includes(',')) {
                // 逗号分隔的多个 URL
                urls = value.split(',').filter(v => v.trim().startsWith('http'));
              } else if (value.startsWith('http')) {
                // 单个 URL
                urls = [value];
              }
            }

            if (urls.length > 0) {
              Logger.log(`文件字段 ${key} 包含 ${urls.length} 个URL`, 'CustomVideoService');

              // 下载所有文件
              for (let i = 0; i < urls.length; i++) {
                try {
                  Logger.log(`下载文件 ${i + 1}/${urls.length}`, 'CustomVideoService');
                  const { buffer, filename } = await this.downloadFileFromUrl(urls[i]);
                  // 多次 append 同一个 key（FormData 标准支持）
                  formData.append(key, buffer, filename);
                  Logger.log(`文件 ${i + 1} 添加成功`, 'CustomVideoService');
                } catch (error) {
                  Logger.error(`下载文件 ${i + 1} 失败: ${error.message}`, 'CustomVideoService');
                  // 继续处理其他文件
                }
              }
            } else {
              // 不是 URL 格式，当作普通文本字段
              formData.append(key, String(value));
            }
          } else {
            // 普通文本字段
            formData.append(key, String(value));
          }
        }

        // 发送 multipart 请求
        response = await axios({
          method: method,
          url: url,
          data: formData,
          headers: {
            Authorization: `Bearer ${finalApiKey}`,
            ...formData.getHeaders(), // 自动设置 Content-Type 和 boundary
          },
          timeout: 30000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else {
        // 使用 JSON 格式（默认）
        response = await axios({
          method: method,
          url: url,
          data: method === 'post' ? requestBody : undefined,
          params: method === 'get' ? requestBody : undefined,
          headers: {
            Authorization: `Bearer ${finalApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        });
      }

      // 使用 responsePaths 提取任务 ID
      const extracted = this.extractResponseData(response.data, toolConfig.responsePaths);

      if (!extracted.id) {
        throw new Error('未能从响应中提取任务 ID');
      }

      Logger.log(`任务已提交`, 'CustomVideoService');
      return extracted.id;
    } catch (error) {
      if (error.response) {
        Logger.error(
          `提交任务失败 - 状态码: ${error.response.status}`,
          error.stack,
          'CustomVideoService',
        );
        throw new HttpException(
          '任务提交失败',
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else {
        Logger.error(`提交任务失败: ${error.message}`, error.stack, 'CustomVideoService');
        throw new HttpException('任务提交失败', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  /**
   * 查询任务状态
   */
  async queryTaskStatus(
    customConfig: any,
    taskId: string,
    apiKey: string,
    apiBaseUrl: string,
    toolConfig?: any,
  ): Promise<any> {
    try {
      // 从 toolConfig 获取 queryTool 名称
      const queryToolName =
        toolConfig?.queryTool || this.inferQueryToolName(toolConfig?.name || '');

      // 获取查询配置
      const queryTool = this.getQueryToolConfig(customConfig, queryToolName);

      // 直接使用原始 URL，不进行格式化
      const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      let endpoint = queryTool.endpoint;

      // 替换 endpoint 中的占位符（支持 {id} 和 {task_id}）
      endpoint = endpoint.replace('{id}', taskId).replace('{task_id}', taskId);

      if (!endpoint.startsWith('/')) {
        endpoint = `/${endpoint}`;
      }

      const url = `${baseUrl}${endpoint}`;
      const method = (queryTool.method || 'GET').toLowerCase();
      const headers = {
        Authorization: `Bearer ${apiKey}`,
      };

      const response = await axios({
        method: method,
        url: url,
        headers: headers,
        timeout: 10000,
      });

      // 使用 responsePaths 提取响应数据
      const extracted = this.extractResponseData(response.data, queryTool.responsePaths);

      // 映射状态
      const mappedStatus = this.mapTaskStatus(extracted.status, queryTool.statusMapping);

      return {
        ...extracted,
        mappedStatus,
        rawStatus: extracted.status,
      };
    } catch (error) {
      if (error.response) {
        Logger.error(
          `[查询任务状态] 请求失败，状态码: ${error.response.status}`,
          error.stack,
          'CustomVideoService',
        );
      } else {
        Logger.error(`查询任务状态失败: ${error.message}`, error.stack, 'CustomVideoService');
      }
      throw new HttpException(
        `查询任务状态失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 计算模拟进度（5分钟内从0%增长到99%）
   * @param elapsedSeconds 已过去的秒数
   * @returns 进度百分比字符串
   */
  private calculateSimulatedProgress(elapsedSeconds: number): string {
    if (elapsedSeconds < 30) {
      // 前30秒：0% -> 30% (快速启动)
      const progress = Math.floor((elapsedSeconds / 30) * 30);
      return `${progress}%`;
    } else if (elapsedSeconds < 150) {
      // 30-150秒（2.5分钟）：30% -> 70% (稳定处理)
      const progress = Math.floor(30 + ((elapsedSeconds - 30) / 120) * 40);
      return `${progress}%`;
    } else if (elapsedSeconds < 300) {
      // 150-300秒（5分钟）：70% -> 99% (缓慢收尾)
      const progress = Math.floor(70 + ((elapsedSeconds - 150) / 150) * 29);
      return `${progress}%`;
    } else {
      // 5分钟后：保持99%
      return '99%';
    }
  }

  /**
   * 轮询任务直到完成
   */
  async pollTaskUntilComplete(
    customConfig: any,
    taskId: string,
    apiKey: string,
    apiBaseUrl: string,
    toolConfig: any,
    maxRetries?: number,
    initialInterval?: number,
    onProgress?: (data: any) => Promise<void>,
  ): Promise<any> {
    // 从 toolConfig 获取 queryTool 配置
    const queryToolName = toolConfig.queryTool || this.inferQueryToolName(toolConfig.name || '');
    const queryConfig = this.getQueryToolConfig(customConfig, queryToolName);

    // 使用查询配置中的 asyncConfig
    const maxRetriesValue = maxRetries || queryConfig.asyncConfig?.maxAttempts || 180;
    const initialIntervalValue = initialInterval || queryConfig.asyncConfig?.interval || 2000;

    let retries = 0;
    let interval = initialIntervalValue;
    const maxInterval = 30000;
    const startTime = Date.now(); // 记录开始时间用于模拟进度

    while (retries < maxRetriesValue) {
      try {
        const status = await this.queryTaskStatus(
          customConfig,
          taskId,
          apiKey,
          apiBaseUrl,
          toolConfig,
        );

        // 判断是否完成：依据视频 URL 或失败状态
        const hasVideo = status.url;
        const isFailed = status.mappedStatus === 'failed' || status.failReason;

        if (hasVideo || isFailed) {
          // 有视频或失败，任务结束
          if (hasVideo) {
            status.mappedStatus = 'success';

            // 上传视频文件到存储服务
            try {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const day = String(now.getDate()).padStart(2, '0');
              const currentDate = `${year}${month}/${day}`;

              Logger.log(`开始保存视频文件`, 'CustomVideoService');
              status.url = await this.uploadService.uploadFileFromUrl({
                url: status.url,
                dir: `video/custom/${currentDate}`,
              });
              Logger.log(`视频文件保存成功`, 'CustomVideoService');
            } catch (error) {
              Logger.error(`视频文件保存失败: ${error.message}`, 'CustomVideoService');
              // 即使保存失败也返回原始URL，不影响整体流程
            }
          } else if (isFailed) {
            status.mappedStatus = 'failed';
          }
          return status;
        }

        // 如果有 onProgress 回调，更新进度
        if (onProgress) {
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

          // 计算模拟进度
          const simulatedProgress = this.calculateSimulatedProgress(elapsedSeconds);

          // 解析进度百分比为数字，支持多种格式
          const parseProgress = (progress: string | number | undefined) => {
            if (!progress) return 0;

            // 如果是数字类型
            if (typeof progress === 'number') {
              // 如果是 0-1 之间的小数（如 0.5），转换为百分比
              if (progress > 0 && progress < 1) {
                return Math.floor(progress * 100);
              }
              // 如果是整数（如 50），直接返回
              return Math.floor(progress);
            }

            // 如果是字符串类型，使用正则提取数字
            const match = progress.match(/(\d+)%?/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const apiProgressNum = parseProgress(status.progress);
          const simulatedProgressNum = parseProgress(simulatedProgress);

          // 取两者最大值，保证进度单调递增，永不倒退
          const maxProgressNum = Math.max(apiProgressNum, simulatedProgressNum);
          const progressToReport = `${maxProgressNum}%`;

          Logger.log(
            `进度更新: API=${
              status.progress || '无'
            }, 模拟=${simulatedProgress}, 最终=${progressToReport}`,
            'CustomVideoService',
          );

          await onProgress({
            progress: progressToReport,
            status: status.rawStatus,
          });
        }

        await this.sleep(interval);
        interval = Math.min(interval * 1.5, maxInterval);
        retries++;
      } catch (error) {
        Logger.error(`轮询任务状态时出错: ${error.message}`, error.stack, 'CustomVideoService');
        retries++;

        if (retries >= maxRetries) {
          throw new HttpException('任务超时，请稍后再试', HttpStatus.REQUEST_TIMEOUT);
        }

        await this.sleep(interval);
      }
    }

    throw new HttpException('任务处理超时，请稍后再试', HttpStatus.REQUEST_TIMEOUT);
  }

  /**
   * 处理自定义视频生成请求
   */
  async handleCustomVideo({
    customConfig,
    prompt,
    imageUrl,
    videoUrl,
    extraParam,
    model,
    assistantLogId,
    apiKey,
    apiBaseUrl,
    messages,
    previousTaskId,
    onSuccess,
    onFailure,
    onGenerating,
  }: {
    customConfig: any;
    prompt: string;
    imageUrl?: string;
    videoUrl?: string;
    extraParam?: any;
    model: string;
    assistantLogId: number;
    apiKey: string;
    apiBaseUrl: string;
    messages?: any[];
    previousTaskId?: string;
    onSuccess?: (data: any) => void;
    onFailure?: (data: any) => void;
    onGenerating?: (data: any) => void;
  }): Promise<any> {
    let billingCoefficient = 1; // 声明在外部，确保在 catch 中也能访问

    try {
      // 1. 使用 Function Calling 优化参数
      const fcResult = await this.optimizeWithFC(
        customConfig,
        prompt,
        imageUrl,
        videoUrl,
        extraParam,
        model,
        messages,
        previousTaskId,
      );

      // 获取工具配置
      const toolConfig = this.getToolConfig(customConfig, fcResult.selectedTool);
      if (!toolConfig) {
        throw new Error(`工具配置不存在: ${fcResult.selectedTool}`);
      }

      // 2. 提取计费系数（用于后续计费）
      const billingCoefficient = Number(fcResult.parameters.billing_coefficient) || 1;
      Logger.log(`计费系数: ${billingCoefficient}`, 'CustomVideoService');

      // 3. 构建请求参数（FC 已生成完整参数，完全信任 FC 的决策）
      const requestBody = this.buildRequestParams(toolConfig, fcResult.parameters);

      // 4. 提交任务（传递 previousTaskId 用于 remix 模式）
      const taskId = await this.submitTask(
        toolConfig,
        requestBody,
        apiKey,
        apiBaseUrl,
        previousTaskId,
      );

      // 立即返回 FC 的回复和任务ID
      if (onGenerating && fcResult.completionReply) {
        await onGenerating({
          content: fcResult.completionReply,
          taskId, // 传递任务ID
          billingCoefficient, // 传递计费系数，用于立即扣费
        });
      }

      // 4. 异步轮询任务状态
      this.pollTaskUntilComplete(
        customConfig,
        taskId,
        apiKey,
        apiBaseUrl,
        toolConfig,
        180,
        2000,
        async data => {
          // 进度回调
          if (onGenerating) {
            await onGenerating({
              progress: data.progress,
              content: `生成中... ${data.progress}`,
            });
          }
        },
      )
        .then(async result => {
          if (result.url) {
            // 有视频 URL，成功
            if (onSuccess) {
              // 直接使用 FC 生成的完成回复（已包含优化后的提示词）
              await onSuccess({
                videoUrl: result.url,
                content: fcResult.completionReply || '视频生成成功！',
                taskId,
                progress: '100%',
                billingCoefficient, // 传递计费系数
              });
            }
          } else {
            // 没有视频 URL，失败
            if (onFailure) {
              // 优先使用 failReason，这是配置中映射的字段
              const failMessage =
                result.failReason || result.fail_reason || result.error || '未知错误';
              await onFailure({
                content: `视频生成失败: ${failMessage}`,
              });
            }
          }
        })
        .catch(async error => {
          if (onFailure) {
            await onFailure({
              content: `视频生成出错: ${error.message}`,
            });
          }
        });

      Logger.debug(`正常返回的计费系数: ${billingCoefficient}`, 'CustomVideoService');
      return {
        text: fcResult.completionReply || '提交成功，视频生成中...',
        status: 2,
        billingCoefficient, // 添加计费系数
      };
    } catch (error) {
      Logger.error(`自定义视频生成失败: ${error.message}`, error.stack, 'CustomVideoService');
      Logger.debug(`异常处理中的计费系数: ${billingCoefficient}`, 'CustomVideoService');

      if (onFailure) {
        await onFailure({
          content: `视频生成失败: ${error.message}`,
        });
      }

      return {
        text: `视频生成失败: ${error.message}`,
        status: 5,
        billingCoefficient, // 保留计算出的计费系数
      };
    }
  }

  /**
   * 辅助方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
