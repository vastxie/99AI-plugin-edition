import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fetchRemoteUrlBuffer } from '@/common/utils';
import axios from 'axios';
import FormData from 'form-data';
import OpenAI from 'openai';
import { ChatLogService } from '../../chatLog/chatLog.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { UploadService } from '../../upload/upload.service';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';

@Injectable()
export class CustomImageService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly uploadService: UploadService,
  ) {}

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
    if (toolName.includes('image')) {
      return 'imageQuery';
    }
    // 默认返回 imageQuery
    return 'imageQuery';
  }

  /**
   * 从 customConfig 动态生成 Function Calling 工具
   */
  private buildFCTools(customConfig: any): any[] {
    const tools: any[] = [];

    if (!customConfig.tools) {
      return tools;
    }

    // 遍历配置的工具
    for (const [toolKey, toolConfig] of Object.entries(customConfig.tools)) {
      const tool = toolConfig as any;
      // 移除对 query 工具的跳过逻辑，确保所有生成工具都正常处理

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

      // 从 requestParams 动态构建参数
      let hasBillingCoefficient = false;
      if (tool.requestParams && Array.isArray(tool.requestParams)) {
        for (const param of tool.requestParams) {
          fcTool.function.parameters.properties[param.name] = {
            type: param.type,
            description: param.description || `${param.name} 参数`,
          };

          // 添加枚举值
          if (param.enum) {
            fcTool.function.parameters.properties[param.name].enum = param.enum;
          }

          // 添加数值范围
          if (param.minimum !== undefined) {
            fcTool.function.parameters.properties[param.name].minimum = param.minimum;
          }
          if (param.maximum !== undefined) {
            fcTool.function.parameters.properties[param.name].maximum = param.maximum;
          }

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
          '生成友好自然的完成回复，告知用户图片已生成，语气简洁亲切，语言与用户输入保持一致',
      };
      fcTool.function.parameters.required.push('completion_reply');

      tools.push(fcTool);
    }

    return tools;
  }

  /**
   * 使用 Function Calling 优化参数
   */
  private async optimizeWithFC(
    customConfig: any,
    prompt: string,
    imageUrl: string | null,
    extraParam: any,
    model: string,
    messages: any[],
    defaultApiKey: string,
    defaultApiBaseUrl: string,
  ): Promise<{
    parameters: any;
    completionReply: string;
    selectedTool: string;
  }> {
    try {
      Logger.log('[FC优化] 开始 Function Calling 参数优化', 'CustomImageService');

      // 获取 Function Calling 配置（从全局配置）
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

      Logger.debug(
        `[FC优化] 配置信息\n` +
          `  toolCallUrl: ${toolCallUrl ? '已配置' : '未配置'}\n` +
          `  toolCallKey: ${toolCallKey ? '已配置' : '未配置'}\n` +
          `  toolCallModel: ${toolCallModel || '未配置'}\n` +
          `  openaiBaseUrl: ${openaiBaseUrl ? '已配置' : '未配置'}\n` +
          `  openaiBaseModel: ${openaiBaseModel || '未配置'}`,
        'CustomImageService',
      );

      // 创建 OpenAI 客户端（优先使用 toolCall 配置，否则用 openaiBase）
      const apiKey = toolCallKey || openaiBaseKey;
      const baseURL = await correctApiBaseUrl(toolCallUrl || openaiBaseUrl);
      const fcModel = toolCallModel || openaiBaseModel;

      Logger.debug(
        `[FC优化] 使用配置\n` +
          `  API Key: ${apiKey ? '已配置' : '未配置'}\n` +
          `  Base URL: ${baseURL ? '已配置' : '未配置'}\n` +
          `  Model: ${fcModel}`,
        'CustomImageService',
      );

      if (!apiKey || !baseURL || !fcModel) {
        Logger.error('[FC优化] 缺少必需的配置', 'CustomImageService');
        throw new Error('缺少 Function Calling 配置');
      }

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
        timeout: 600000, // 提示词优化超时时间：10分钟
      });

      // 构建 FC 工具
      const fcTools = this.buildFCTools(customConfig);

      Logger.debug(`[FC优化] 构建了 ${fcTools.length} 个 FC 工具`, 'CustomImageService');

      if (fcTools.length === 0) {
        Logger.warn(
          '[FC优化] 没有可用的 Function Calling 工具，使用默认工具',
          'CustomImageService',
        );
        const defaultTool = Object.keys(customConfig.tools).find(key => key !== 'query');
        return {
          parameters: {},
          completionReply: '图片生成中...',
          selectedTool: defaultTool || 'text_to_image',
        };
      }

      // 构建系统消息
      const toolDescriptions = fcTools
        .map((tool, index) => `${index + 1}. ${tool.function.name}: ${tool.function.description}`)
        .join('\n');

      const systemMessage = `你是一个专业的图片生成助手。你有以下工具可用：

${toolDescriptions}

请根据用户的完整对话历史和当前需求，选择最合适的工具并生成参数。
注意：
- 如果对话历史中提到了图片，即使当前消息中没有，也应该考虑使用图生图
- 根据用户的实际意图选择工具，而不仅仅是最新的一条消息
- completion_reply 必须与用户输入的语言保持一致（如用户用中文，回复也用中文）
- completion_reply 要友好自然，可以简单描述图片内容或表达期待，避免固定的格式，让用户感到亲切`;

      // 构建消息列表
      const fcMessages: any[] = [];
      fcMessages.push({ role: 'system', content: systemMessage });

      // 添加历史消息（最多5轮），过滤掉图片内容和全局系统消息
      if (messages && messages.length > 0) {
        const recentMessages = messages.slice(-10); // 最近10条消息（5轮对话）

        // ✨ 过滤掉全局系统消息（只保留 user 和 assistant 消息）
        const filteredMessages = recentMessages.filter(
          msg => msg.role !== 'system' && msg.role !== 'developer',
        );

        const textOnlyMessages = filteredMessages.map(msg => {
          // 如果消息内容是数组（多模态消息），只保留文本部分
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            return { role: msg.role, content: textContent || '(图片消息)' };
          }
          // 普通文本消息直接返回
          return msg;
        });

        // 只添加有内容的消息
        const validMessages = textOnlyMessages.filter(
          msg => msg.content && msg.content.trim() !== '',
        );

        if (validMessages.length > 0) {
          fcMessages.push(...validMessages);
          Logger.debug(
            `[FC优化] 添加了 ${validMessages.length} 条历史消息（已过滤系统消息）`,
            'CustomImageService',
          );
        } else {
          Logger.debug('[FC优化] 没有有效的历史消息，跳过', 'CustomImageService');
        }
      }

      // 添加当前用户消息，包含上下文信息
      let userMessage = `用户说："${prompt}"`;

      const contextInfo: string[] = [];
      if (imageUrl) {
        contextInfo.push(`图片URL: ${imageUrl}`);
      }
      if (model) {
        contextInfo.push(`模型: ${model}`);
      }
      if (extraParam && Object.keys(extraParam).length > 0) {
        contextInfo.push(`用户选择的选项: ${JSON.stringify(extraParam)}`);
      }

      if (contextInfo.length > 0) {
        userMessage += `\n\n上下文信息：\n${contextInfo.join('\n')}`;
      }

      fcMessages.push({ role: 'user', content: userMessage });

      Logger.debug(
        `[FC优化] 准备调用 FC API\n` +
          `  Model: ${fcModel}\n` +
          `  消息数量: ${fcMessages.length}\n` +
          `  工具数量: ${fcTools.length}`,
        'CustomImageService',
      );

      // ✨ 打印完整的工具定义（用于调试）
      // 调用 Function Calling
      const response = await openai.chat.completions.create({
        model: fcModel,
        messages: fcMessages,
        tools: fcTools,
        tool_choice: 'auto',
      });

      const message = response.choices[0]?.message;

      if (!message) {
        Logger.error('[FC优化] FC 响应格式错误', 'CustomImageService');
        throw new Error('FC 响应格式错误');
      }

      if (!message.tool_calls || message.tool_calls.length === 0) {
        Logger.error('[FC优化] FC 未返回工具调用', 'CustomImageService');
        throw new Error('FC 未返回工具调用');
      }

      const toolCall = message.tool_calls[0];
      const selectedTool = toolCall.function.name;
      const parameters = JSON.parse(toolCall.function.arguments);

      Logger.log(`[FC优化] FC 选择的工具: ${selectedTool}`, 'CustomImageService');

      return {
        parameters,
        completionReply: parameters.completion_reply || '图片已生成！',
        selectedTool,
      };
    } catch (error) {
      Logger.error(
        `[FC优化] FC 优化失败: ${error.message}\n` +
          `  错误类型: ${error.constructor.name}\n` +
          `  错误堆栈: ${error.stack}`,
        'CustomImageService',
      );

      // 如果是 API 调用错误，记录更详细的信息
      if (error.response) {
        Logger.error(
          `[FC优化] API 错误状态: ${error.response.status}`,
          'CustomImageService',
        );
      }

      throw new HttpException(`参数优化失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 构建请求参数
   * FC 模型已经根据所有上下文生成了完整的参数，直接使用即可
   */
  private buildRequestParams(toolConfig: any, fcParams: any): any {
    const requestBody: any = {};

    // 排除系统内部参数
    const internalParams = ['completion_reply', 'billing_coefficient'];

    // 添加所有 FC 生成的参数
    for (const [key, value] of Object.entries(fcParams)) {
      if (!internalParams.includes(key)) {
        requestBody[key] = value;
      }
    }

    return requestBody;
  }

  /**
   * 根据 fileTransferFormat 配置转换参数中的 URL 为 base64
   */
  private async convertUrlsToBase64(requestBody: any, fileTransferFormat: string): Promise<any> {
    // 如果配置为 URL 模式，直接返回
    if (fileTransferFormat !== 'base64') {
      return requestBody;
    }

    Logger.log('检测到 base64 模式，开始转换参数中的图片 URL', 'CustomImageService');

    const converted = { ...requestBody };

    // 导入转换工具函数
    const { convertImageToBase64, extractImageUrls } = await import('@/common/utils/image.util');

    // 1. 转换 prompt 中的图片 URL
    if (converted.prompt && typeof converted.prompt === 'string') {
      const imageUrls = extractImageUrls(converted.prompt);

      if (imageUrls.length > 0) {
        Logger.log(
          `检测到 prompt 中的 ${imageUrls.length} 个图片 URL，准备转换`,
          'CustomImageService',
        );

        try {
          const base64Images = await Promise.all(imageUrls.map(url => convertImageToBase64(url)));

          // 替换 prompt 中的 URL 为 base64
          for (let i = 0; i < imageUrls.length; i++) {
            converted.prompt = converted.prompt.replace(imageUrls[i], base64Images[i]);
          }

          Logger.log('prompt 中的图片 URL 已转换为 base64', 'CustomImageService');
        } catch (error) {
          Logger.error(`转换 prompt 中的图片失败: ${error.message}`, 'CustomImageService');
          // 转换失败时保留原始 URL
        }
      }
    }

    // 2. 转换 imageUrl 参数
    if (converted.imageUrl) {
      try {
        if (Array.isArray(converted.imageUrl)) {
          // 数组形式
          converted.imageUrl = await Promise.all(
            converted.imageUrl.map(async (url: string) => {
              if (
                typeof url === 'string' &&
                (url.startsWith('http://') || url.startsWith('https://'))
              ) {
                return await convertImageToBase64(url);
              }
              return url;
            }),
          );
        } else if (typeof converted.imageUrl === 'string') {
          if (
            converted.imageUrl.startsWith('http://') ||
            converted.imageUrl.startsWith('https://')
          ) {
            converted.imageUrl = await convertImageToBase64(converted.imageUrl);
          }
        }

        Logger.log('imageUrl 参数已转换为 base64', 'CustomImageService');
      } catch (error) {
        Logger.error(`转换 imageUrl 失败: ${error.message}`, 'CustomImageService');
        // 转换失败时保留原始 URL
      }
    }

    // 3. 转换 base64Array 中的 URL（如果有 URL 混合的情况）
    if (converted.base64Array && Array.isArray(converted.base64Array)) {
      try {
        converted.base64Array = await Promise.all(
          converted.base64Array.map(async (item: string) => {
            if (
              typeof item === 'string' &&
              (item.startsWith('http://') || item.startsWith('https://'))
            ) {
              return await convertImageToBase64(item);
            }
            return item;
          }),
        );

        Logger.log('base64Array 中的 URL 已转换为 base64', 'CustomImageService');
      } catch (error) {
        Logger.error(`转换 base64Array 失败: ${error.message}`, 'CustomImageService');
        // 转换失败时保留原始值
      }
    }

    // 4. 转换其他可能的 URL 参数
    const urlParams = ['thumbUrl', 'maskImage', 'referenceImage', 'init_image', 'source_image'];
    for (const param of urlParams) {
      if (converted[param] && typeof converted[param] === 'string') {
        if (converted[param].startsWith('http://') || converted[param].startsWith('https://')) {
          try {
            converted[param] = await convertImageToBase64(converted[param]);
            Logger.log(`${param} 参数已转换为 base64`, 'CustomImageService');
          } catch (error) {
            Logger.error(`转换 ${param} 失败: ${error.message}`, 'CustomImageService');
          }
        }
      }
    }

    Logger.log('所有参数转换完成', 'CustomImageService');
    return converted;
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
      Logger.error(`下载文件失败: ${error?.message || '未知错误'}`, 'CustomImageService');
      throw new HttpException('无法下载文件', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 提交任务
   */
  private async submitTask(
    customConfig: any,
    toolConfig: any,
    requestBody: any,
    apiKey: string,
    apiBaseUrl: string,
  ): Promise<any> {
    try {
      // 支持 overrideUrl 和 overrideKey
      const overrideUrl = toolConfig.overrideUrl;
      const overrideKey = toolConfig.overrideKey;

      // 直接使用原始 URL，不进行格式化（因为 endpoint 已经包含完整路径）
      let baseUrl = overrideUrl || apiBaseUrl;
      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      let endpoint = toolConfig.endpoint.startsWith('/')
        ? toolConfig.endpoint
        : `/${toolConfig.endpoint}`;

      const url = `${baseUrl}${endpoint}`;
      const method = (toolConfig.method || 'POST').toLowerCase();
      const finalApiKey = overrideKey || apiKey;

      // 检测是否使用 multipart/form-data（通过 contentType 配置）
      const useMultipart = toolConfig.contentType === 'multipart/form-data';

      Logger.log(
        `[提交图片生成任务]\n` +
          `  Method: ${method.toUpperCase()}\n` +
          `  Content-Type: ${useMultipart ? 'multipart/form-data' : 'application/json'}\n` +
          `  使用${overrideUrl ? '覆盖的' : '默认'}地址`,
        'CustomImageService',
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
          Logger.log(`使用配置的文件字段: ${fileFields.join(', ')}`, 'CustomImageService');
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
              Logger.log(`文件字段 ${key} 包含 ${urls.length} 个URL`, 'CustomImageService');

              // 下载所有文件
              for (let i = 0; i < urls.length; i++) {
                try {
                  Logger.log(`下载文件 ${i + 1}/${urls.length}`, 'CustomImageService');
                  const { buffer, filename } = await this.downloadFileFromUrl(urls[i]);
                  // 多次 append 同一个 key（FormData 标准支持）
                  formData.append(key, buffer, filename);
                  Logger.log(`文件 ${i + 1} 添加成功`, 'CustomImageService');
                } catch (error) {
                  Logger.error(`下载文件 ${i + 1} 失败: ${error.message}`, 'CustomImageService');
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
          timeout: 600000,
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
          timeout: 600000, // 任务提交超时时间：10分钟
        });
      }

      return response;
    } catch (error) {
      if (error.response) {
        Logger.error(
          `提交任务失败 - 状态码: ${error.response.status}`,
          error.stack,
          'CustomImageService',
        );
        throw new HttpException(
          '任务提交失败',
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      Logger.error(
        `提交任务失败: ${error?.message || '未知错误'}`,
        error?.stack,
        'CustomImageService',
      );
      throw new HttpException('任务提交失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 根据路径提取值（支持通配符 * 提取数组中所有元素）
   */
  private getValueByPath(obj: any, path: string): any {
    if (!path) return undefined;

    const keys = path.split(/[\.\[\]]+/).filter(key => key);
    let current = obj;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (current === null || current === undefined) {
        return undefined;
      }

      // 支持通配符 * 提取数组中所有元素
      if (key === '*') {
        if (!Array.isArray(current)) {
          Logger.warn(`路径 ${path} 中的 * 位置不是数组`, 'CustomImageService');
          return undefined;
        }

        // 剩余路径
        const remainingPath = keys.slice(i + 1).join('.');

        // 如果没有剩余路径，直接返回数组
        if (!remainingPath) {
          return current;
        }

        // 递归提取数组中每个元素的剩余路径值
        return current
          .map(item => this.getValueByPath(item, remainingPath))
          .filter(val => val !== undefined && val !== null);
      }

      current = current[key];
    }

    return current;
  }

  /**
   * 提取响应数据
   */
  private extractResponseData(responseData: any, responsePaths: any): any {
    const extracted: any = {};

    if (!responsePaths) {
      Logger.warn('responsePaths 配置缺失', 'CustomImageService');
      return extracted;
    }

    Logger.debug('[开始提取响应数据]', 'CustomImageService');

    for (const [key, path] of Object.entries(responsePaths)) {
      const pathStr = path as string;
      const value = this.getValueByPath(responseData, pathStr);
      extracted[key] = value;

      Logger.debug(
        `提取字段 "${key}": ${value === undefined ? '未找到' : '已找到'}`,
        'CustomImageService',
      );
    }

    Logger.debug(`[提取完成] 字段数: ${Object.keys(extracted).length}`, 'CustomImageService');

    return extracted;
  }

  /**
   * 处理图片数据（URL 或 base64）
   */
  private async processImageData(imageData: string): Promise<string> {
    if (!imageData) {
      throw new Error('图片数据为空');
    }

    // 判断是 URL 还是 base64
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      // URL 格式：下载并保存
      Logger.debug(`检测到URL格式图片`, 'CustomImageService');
      return await this.downloadAndSaveImage(imageData);
    } else if (imageData.startsWith('data:image')) {
      // 标准 base64 格式（带前缀）：上传
      Logger.debug(`检测到标准base64格式图片`, 'CustomImageService');
      return await this.uploadBase64Image(imageData);
    } else if (/^[A-Za-z0-9+/=]+$/.test(imageData.substring(0, 100))) {
      // 纯 base64 格式（无前缀）：自动添加前缀后上传
      Logger.debug(`检测到纯base64格式，自动添加前缀`, 'CustomImageService');
      const base64WithPrefix = `data:image/png;base64,${imageData}`;
      return await this.uploadBase64Image(base64WithPrefix);
    } else {
      Logger.error(`不支持的图片格式`, 'CustomImageService');
      throw new Error('不支持的图片格式');
    }
  }

  /**
   * 处理多张图片数据（支持单图或多图）
   */
  private async processMultipleImageData(imageData: string | string[]): Promise<string> {
    if (!imageData) {
      throw new Error('图片数据为空');
    }

    // 如果是数组，处理多张图片
    if (Array.isArray(imageData)) {
      Logger.log(`处理多张图片，共 ${imageData.length} 张`, 'CustomImageService');

      const savedUrls: string[] = [];

      for (let i = 0; i < imageData.length; i++) {
        const url = imageData[i];
        try {
          Logger.log(`处理第 ${i + 1}/${imageData.length} 张图片`, 'CustomImageService');
          const savedUrl = await this.processImageData(url);
          savedUrls.push(savedUrl);
        } catch (error) {
          Logger.error(
            `处理第 ${i + 1} 张图片失败: ${error.message}`,
            error.stack,
            'CustomImageService',
          );
          // 继续处理其他图片，不中断
        }
      }

      if (savedUrls.length === 0) {
        throw new Error('所有图片处理失败');
      }

      // 返回逗号分隔的URL列表
      const result = savedUrls.join(',');
      Logger.log(
        `多图处理完成，成功 ${savedUrls.length}/${imageData.length} 张`,
        'CustomImageService',
      );
      return result;
    } else {
      // 单张图片
      return await this.processImageData(imageData);
    }
  }

  /**
   * 下载并保存图片
   */
  private async downloadAndSaveImage(imageUrl: string): Promise<string> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;

      Logger.log(`开始保存图片`, 'CustomImageService');

      const savedUrl = await this.uploadService.uploadFileFromUrl({
        url: imageUrl,
        dir: `images/custom/${currentDate}`,
      });

      Logger.log(`图片保存成功`, 'CustomImageService');
      return savedUrl;
    } catch (error) {
      Logger.error(`图片保存失败: ${error.message}`, 'CustomImageService');
      throw error;
    }
  }

  /**
   * 上传 base64 图片
   */
  private async uploadBase64Image(base64Data: string): Promise<string> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;

      // 提取 base64 数据
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的 base64 格式');
      }

      const imageType = matches[1];
      const base64Content = matches[2];

      // 转换为 Buffer
      const buffer = Buffer.from(base64Content, 'base64');

      // 上传
      const file = {
        buffer: buffer,
        mimetype: `image/${imageType}`,
      };

      const savedUrl = await this.uploadService.uploadFile(file, `images/custom/${currentDate}`);

      Logger.log(`Base64 图片保存成功`, 'CustomImageService');
      return savedUrl;
    } catch (error) {
      Logger.error(`Base64 图片保存失败: ${error.message}`, 'CustomImageService');
      throw error;
    }
  }

  /**
   * 查询任务状态
   */
  private async queryTaskStatus(
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
      const method = (queryTool.method || 'GET').toLowerCase();

      // 判断是路径参数还是查询参数
      let url: string;
      let params: any = undefined;
      let hasPathPlaceholder = false;

      // 处理路径中的占位符（支持 {id} 和 {task_id}）
      if (endpoint.includes('{id}') || endpoint.includes('{task_id}')) {
        hasPathPlaceholder = true;
        // 路径参数方式：/bfl/v1/get_result/{id} 或 /bfl/v1/get_result/{task_id}
        endpoint = endpoint.replace('{id}', taskId).replace('{task_id}', taskId);
        if (!endpoint.startsWith('/')) {
          endpoint = `/${endpoint}`;
        }
        url = `${baseUrl}${endpoint}`;
      } else {
        // 查询参数方式：/bfl/v1/get_result?id={id}
        if (!endpoint.startsWith('/')) {
          endpoint = `/${endpoint}`;
        }
        url = `${baseUrl}${endpoint}`;
        params = { id: taskId };
      }

      Logger.log(
        `[查询任务状态]\n` +
          `  Method: ${method.toUpperCase()}\n` +
          `  参数模式: ${params ? 'query' : hasPathPlaceholder ? 'path' : 'none'}`,
        'CustomImageService',
      );

      const response = await axios({
        method: method,
        url: url,
        params: params, // 添加查询参数支持
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 10000,
      });

      Logger.debug('[查询响应数据] 已收到响应', 'CustomImageService');

      // 提取响应数据
      const extracted = this.extractResponseData(response.data, queryTool.responsePaths);

      Logger.debug(
        `[提取的字段]\n` +
          `  status: ${extracted.status}\n` +
          `  url: ${extracted.url ? '已获取' : '未获取'}\n` +
          `  failReason: ${extracted.failReason ? '已返回' : '无'}`,
        'CustomImageService',
      );

      // 映射状态
      let mappedStatus = extracted.status;
      if (queryTool.statusMapping && extracted.status) {
        mappedStatus = queryTool.statusMapping[extracted.status] || extracted.status;
        Logger.debug(
          `[状态映射]\n` +
            `  原始状态: ${extracted.status}\n` +
            `  映射后状态: ${mappedStatus}\n` +
            `  映射规则: ${JSON.stringify(queryTool.statusMapping, null, 2)}`,
          'CustomImageService',
        );
      }

      return {
        rawStatus: extracted.status,
        mappedStatus: mappedStatus,
        imageUrl: extracted.url,
        failReason: extracted.failReason,
      };
    } catch (error) {
      Logger.error(`查询任务状态失败: ${error.message}`, error.stack, 'CustomImageService');
      throw new HttpException(
        `查询任务状态失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 轮询任务直到完成
   */
  private async pollTaskUntilComplete(
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
    const maxRetriesValue = maxRetries || queryConfig.asyncConfig?.maxAttempts || 60;
    const initialIntervalValue = initialInterval || queryConfig.asyncConfig?.interval || 1000;

    let retries = 0;
    let interval = initialIntervalValue;
    const maxInterval = 5000;

    while (retries < maxRetriesValue) {
      try {
        const status = await this.queryTaskStatus(
          customConfig,
          taskId,
          apiKey,
          apiBaseUrl,
          toolConfig,
        );

        Logger.log(
          `[轮询结果 - 第 ${retries + 1}/${maxRetries} 次]\n` +
            `  原始状态: ${status.rawStatus}\n` +
            `  映射状态: ${status.mappedStatus}\n` +
            `  图片URL: ${status.imageUrl ? '已获取' : '未获取'}\n` +
            `  失败原因: ${status.failReason ? '已返回' : '无'}`,
          'CustomImageService',
        );

        // 判断是否完成
        const hasImage = status.imageUrl;
        const isFailed = status.mappedStatus === 'failed' || status.failReason;

        Logger.debug(
          `[完成判断]\n` +
            `  hasImage: ${hasImage}\n` +
            `  isFailed: ${isFailed}\n` +
            `  imageUrl: ${status.imageUrl ? '已获取' : '未获取'}`,
          'CustomImageService',
        );

        if (hasImage || isFailed) {
          if (hasImage) {
            Logger.log('任务完成，开始处理图片', 'CustomImageService');
            status.mappedStatus = 'success';
            // 下载并保存图片（支持单图或多图）
            status.imageUrl = await this.processMultipleImageData(status.imageUrl);
          } else if (isFailed) {
            Logger.error(`任务失败，第三方返回失败状态`, 'CustomImageService');
            status.mappedStatus = 'failed';
          }
          return status;
        }

        Logger.debug(`⏳ 任务未完成，等待 ${interval}ms 后重试`, 'CustomImageService');

        // 更新进度
        if (onProgress) {
          await onProgress({
            status: status.rawStatus,
          });
        }

        await this.sleep(interval);
        interval = Math.min(interval * 1.2, maxInterval);
        retries++;
      } catch (error) {
        Logger.error(`轮询任务状态时出错: ${error.message}`, error.stack, 'CustomImageService');
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
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 处理自定义图片生成请求
   */
  async handleCustomImage({
    customConfig,
    prompt,
    imageUrl,
    extraParam,
    model,
    messages,
    apiKey,
    apiBaseUrl,
    onSuccess,
    onFailure,
    onProgress,
    onTaskSubmitted, // 新增回调：任务提交成功时调用
  }: {
    customConfig: any;
    prompt: string;
    imageUrl?: string;
    extraParam?: any;
    model: string;
    messages?: any[];
    apiKey: string;
    apiBaseUrl: string;
    onSuccess?: (data: any) => Promise<void>;
    onFailure?: (data: any) => Promise<void>;
    onProgress?: (data: any) => Promise<void>;
    onTaskSubmitted?: (data: any) => Promise<void>; // 新增：任务提交回调
  }): Promise<any> {
    const result: any = { content: '', imageUrl: '', status: 2 };

    try {
      // 1. 使用 FC 优化参数
      const fcResult = await this.optimizeWithFC(
        customConfig,
        prompt,
        imageUrl,
        extraParam,
        model,
        messages,
        apiKey,
        apiBaseUrl,
      );

      // 获取选择的工具配置
      const toolConfig = customConfig.tools[fcResult.selectedTool];
      if (!toolConfig) {
        throw new Error(`工具配置不存在: ${fcResult.selectedTool}`);
      }

      // 2. 提取计费系数（用于后续计费）
      const billingCoefficient = Number(fcResult.parameters.billing_coefficient) || 1;
      Logger.log(`计费系数: ${billingCoefficient}`, 'CustomImageService');

      // 3. 构建请求参数（FC 已生成完整参数，完全信任 FC 的决策）
      const requestBody = this.buildRequestParams(toolConfig, fcResult.parameters);

      // 4. 根据 fileTransferFormat 配置转换 URL 为 base64
      const fileTransferFormat = customConfig.fileTransferFormat || 'url';
      const finalRequestBody = await this.convertUrlsToBase64(requestBody, fileTransferFormat);

      // 5. 提交任务
      const response = await this.submitTask(
        customConfig,
        toolConfig,
        finalRequestBody,
        apiKey,
        apiBaseUrl,
      );

      // ✨ 新增：任务提交成功回调（用于在 ChatService 中执行扣费）
      if (onTaskSubmitted) {
        Logger.log('任务提交成功，调用 onTaskSubmitted 回调', 'CustomImageService');
        await onTaskSubmitted({
          billingCoefficient: billingCoefficient,
          status: 2,
        });
      }

      // 4. 根据执行模式处理结果
      if (customConfig.executionMode === 'sync') {
        // 同步模式：直接获取结果
        Logger.log('同步模式：后台等待AI返回结果', 'CustomImageService');

        const extracted = this.extractResponseData(response.data, toolConfig.responsePaths);

        if (!extracted.imageUrl) {
          Logger.error('[提取失败] 未能从响应中提取到图片URL', 'CustomImageService');
          throw new Error('响应中未找到图片URL');
        }

        // 处理图片数据（支持单图或多图）
        const savedUrl = await this.processMultipleImageData(extracted.imageUrl);

        result.imageUrl = savedUrl;
        result.content = fcResult.completionReply;
        result.status = 3;
        result.billingCoefficient = billingCoefficient; // 传递计费系数

        if (onSuccess) {
          await onSuccess(result);
        }
      } else {
        // 异步模式：轮询查询
        Logger.log('异步模式：开始轮询任务状态', 'CustomImageService');

        const extracted = this.extractResponseData(response.data, toolConfig.responsePaths);

        const taskId = extracted.id;

        if (!taskId) {
          Logger.error('[提取失败] 未能从响应中提取到任务ID', 'CustomImageService');
          throw new Error('响应中未找到任务ID');
        }

        Logger.log(`任务已提交`, 'CustomImageService');

        // 轮询直到完成
        const finalStatus = await this.pollTaskUntilComplete(
          customConfig,
          taskId,
          apiKey,
          apiBaseUrl,
          toolConfig,
          60,
          1000,
          onProgress,
        );

        if (finalStatus.mappedStatus === 'success' && finalStatus.imageUrl) {
          result.imageUrl = finalStatus.imageUrl;
          result.content = fcResult.completionReply;
          result.status = 3;
          result.billingCoefficient = billingCoefficient; // 传递计费系数

          if (onSuccess) {
            await onSuccess(result);
          }
        } else {
          // 异步模式失败：使用 API 返回的失败原因
          result.content = finalStatus.failReason || '图片生成失败';
          result.status = 4;

          if (onFailure) {
            await onFailure(result);
          }
        }
      }

      return result;
    } catch (error) {
      Logger.error(`图片生成失败: ${error.message}`, error.stack, 'CustomImageService');

      result.content = `图片生成失败: ${error.message}`;
      result.status = 4;

      if (onFailure) {
        await onFailure(result);
      }

      return result;
    }
  }
}
