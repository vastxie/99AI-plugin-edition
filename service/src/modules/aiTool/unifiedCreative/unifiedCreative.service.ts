import { fetchRemoteUrlBuffer } from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData = require('form-data');
import OpenAI from 'openai';
import { ChatHistoryOwner, ChatLogService } from '../../chatLog/chatLog.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { UploadService } from '../../upload/upload.service';

@Injectable()
export class UnifiedCreativeService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * 处理通用创意请求
   */
  async handleCreativeRequest({
    customConfig,
    prompt,
    groupId,
    currentImageUrl,
    currentVideoUrl,
    extraParam,
    model,
    assistantLogId,
    apiKey,
    apiBaseUrl,
    historyOwner,
    onTaskSubmitted,
    onProgress, // ✨ 解构进度回调
    onSuccess,
    onFailure,
  }: {
    customConfig: any;
    prompt: string;
    groupId: number;
    currentImageUrl?: string;
    currentVideoUrl?: string;
    extraParam?: any;
    model: string;
    assistantLogId: number;
    apiKey: string;
    apiBaseUrl: string;
    historyOwner?: ChatHistoryOwner;
    onTaskSubmitted?: (data: any) => Promise<void>;
    onProgress?: (data: any) => Promise<void>; // ✨ 添加进度回调
    onSuccess: (data: any) => Promise<void>;
    onFailure: (data: any) => Promise<void>;
  }) {
    try {
      const startTime = Date.now();

      // 1. 获取格式化的历史上下文
      const { messages: historyMessages, summary } =
        await this.chatLogService.getFormattedHistoryForFC(groupId, 5, historyOwner);

      Logger.debug(
        `[通用创意模式] 历史上下文: ${summary.totalMessages}条消息, ` +
          `图片:${summary.hasImages}, 视频:${summary.hasVideos}`,
      );

      // 2. 使用 FC 优化参数
      const fcResult = await this.optimizeWithFC({
        customConfig,
        prompt,
        historyContext: {
          messages: historyMessages,
          summary,
        },
        currentContext: {
          imageUrl: currentImageUrl,
          videoUrl: currentVideoUrl,
          extraParam,
          model,
        },
        apiKey,
        apiBaseUrl,
      });

      // ✨ FC 完成后立即调用 onTaskSubmitted（用于扣费 + 保存工具类型）
      if (onTaskSubmitted) {
        await onTaskSubmitted({
          taskId: null, // FC 阶段还没有 taskId
          billingCoefficient: fcResult.billingCoefficient || 1,
          selectedTool: fcResult.selectedTool, // ✨ 添加工具类型
          progressReply: fcResult.progressReply, // ✨ 添加进度回复
          completionReply: fcResult.completionReply, // ✨ 添加完成回复
        });
      }

      // 3. 获取工具配置
      const toolConfig = customConfig.tools[fcResult.selectedTool];
      if (!toolConfig) {
        throw new Error(`工具配置不存在: ${fcResult.selectedTool}`);
      }

      // 4. 异步处理任务（不阻塞，submitTask 内部会调用 onSuccess/onFailure）
      this.submitTask({
        toolConfig,
        parameters: fcResult.parameters,
        apiKey,
        apiBaseUrl,
        customConfig,
        selectedTool: fcResult.selectedTool, // ✨ 传递选中的工具名称
        completionReply: fcResult.completionReply, // ✨ 传递完成回复
        progressReply: fcResult.progressReply, // ✨ 传递进度回复
        onProgress, // ✨ 传递进度回调
        onSuccess,
        onFailure,
      }).catch(error => {
        Logger.error(`[任务提交异常] ${error.message}`, error.stack, 'UnifiedCreativeService');
      });
    } catch (error) {
      Logger.error(`[通用创意模式] 处理失败: ${error.message}`, error.stack);
      await onFailure({
        content: `处理失败: ${error.message}`,
      });
    }
  }

  /**
   * 使用 Function Calling 优化参数
   */
  private async optimizeWithFC({
    customConfig,
    prompt,
    historyContext,
    currentContext,
    apiKey,
    apiBaseUrl,
  }: {
    customConfig: any;
    prompt: string;
    historyContext: {
      messages: any[];
      summary: any;
    };
    currentContext: {
      imageUrl?: string;
      videoUrl?: string;
      extraParam?: any;
      model: string;
    };
    apiKey: string;
    apiBaseUrl: string;
  }): Promise<{
    parameters: any;
    completionReply: string;
    progressReply: string;
    selectedTool: string;
    billingCoefficient: number;
  }> {
    try {
      // 1. 获取 FC 配置
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

      const fcApiKey = toolCallKey || openaiBaseKey;
      const fcBaseUrl = await correctApiBaseUrl(toolCallUrl || openaiBaseUrl);
      const fcModel = toolCallModel || openaiBaseModel;

      if (!fcApiKey || !fcBaseUrl || !fcModel) {
        throw new Error('缺少 Function Calling 配置');
      }

      // 2. 构建 FC 工具
      const fcTools = this.buildFCTools(customConfig);

      if (fcTools.length === 0) {
        throw new Error('没有可用的工具');
      }

      // 3. 构建 FC 消息 (只包含当前用户消息)
      const fcMessages: any[] = [];

      // System Message
      const systemMessage = this.buildSystemMessage(fcTools);
      fcMessages.push({
        role: 'system',
        content: systemMessage,
      });

      // 当前用户消息 (历史上下文作为结构化附件)
      const contextData = this.buildContextData(historyContext, currentContext);

      fcMessages.push({
        role: 'user',
        content: this.buildUserMessage(prompt, contextData),
      });

      Logger.debug(
        `[FC优化] 准备调用 FC API, 消息数量: ${fcMessages.length}`,
        'UnifiedCreativeService',
      );

      // 4. 调用 FC API (60秒超时)
      const openai = new OpenAI({
        apiKey: fcApiKey,
        baseURL: fcBaseUrl,
        timeout: 60000,
      });

      const response = await openai.chat.completions.create({
        model: fcModel,
        messages: fcMessages,
        tools: fcTools,
        tool_choice: 'auto',
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        const fullContent = response.choices[0]?.message?.content || '';
        Logger.error(`[FC优化] FC 未返回工具调用`, 'UnifiedCreativeService');
        Logger.error(`[FC优化] 返回内容长度: ${fullContent.length} 字符`, 'UnifiedCreativeService');
        Logger.error(`[FC优化] 使用的模型: ${fcModel}`, 'UnifiedCreativeService');
        throw new Error('FC 未返回工具调用');
      }

      // 5. 解析参数
      const parameters = JSON.parse(toolCall.function.arguments);

      // 提取并移除内部参数
      const billingCoefficient = Number(parameters.billing_coefficient) || 1;
      const completionReply = parameters.completion_reply || '任务已提交';
      const progressReply = parameters.progress_reply || '任务生成中...';

      delete parameters.billing_coefficient;
      delete parameters.completion_reply;
      delete parameters.progress_reply;

      return {
        parameters,
        completionReply,
        progressReply,
        selectedTool: toolCall.function.name,
        billingCoefficient,
      };
    } catch (error) {
      Logger.error(`[FC优化] FC 优化失败: ${error.message}`, error.stack, 'UnifiedCreativeService');
      throw error;
    }
  }

  /**
   * 构建系统消息
   */
  private buildSystemMessage(fcTools: any[]): string {
    const toolDescriptions = fcTools
      .map((tool, index) => `${index + 1}. ${tool.function.name}: ${tool.function.description}`)
      .join('\n');

    return `你是一个智能创意助手,可以根据用户需求生成图片或视频。

## ⚠️ 重要要求
你必须直接调用工具函数来处理用户请求,**不要返回分析文本或解释**。每次都必须要调用一个工具。

## 可用工具
${toolDescriptions}

## 工具选择优先级
1. **优先使用绘画工具** (text2image, image2image, inpainting等)
2. **其次使用视频工具** (text2video, image2video, video2video)

## 工具选择判断规则
- **静态视觉内容** → 图片工具
  - 关键词: "图片"、"照片"、"海报"、"封面"、"设计"、"logo"
  - 关键词: "画"、"绘图"、"设计"

- **动态视觉内容** → 视频工具
  - 关键词: "视频"、"动画"、"短片"、"动态"
  - 关键词: "影片"、"剪辑"

- **引用之前的内容** → 根据类型选择
  - 提供图片URL → image2image 或 image2video
  - 提供视频URL + 修改意图 → video2video

- **无法明确判断** → 默认使用绘画工具

## URL 类型识别
- **图片**: .jpg, .png, .gif, .webp, .svg
- **视频**: .mp4, .mov, .avi, .webm
- **其他**: 根据URL路径判断

## 参数说明
- **billing_coefficient**: 计费系数,根据工具和模型设置,默认为1
- **completion_reply**: 完成回复,必须与用户语言一致,简洁友好
  - ✅ 正确示例: "已为你生成海绵宝宝图片"、"图片生成完成"、"视频已生成"
  - ❌ 错误示例: "已为你生成了**一张**海绵宝宝图片"、"生成了**4张**图片"
  - 📌 **重要**: 不要使用量词(一张、多张、几个等),保持简洁自然

## 处理模式
每个工具自定义了执行模式 (同步/异步),请按工具配置生成参数。

## 执行流程
1. 分析用户需求
2. 选择最合适的工具
3. 直接调用工具函数(不要输出分析过程)
4. 在参数中包含 completion_reply(给用户的完成提示)`;
  }

  /**
   * 构建上下文数据 (结构化 JSON)
   */
  private buildContextData(historyContext: any, currentContext: any): string {
    const data: any = {
      conversation_history: historyContext.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        urls: msg.urls,
        task_id: msg.taskId,
        custom_id: msg.customId, // ✨ 添加 MJ 按钮信息
        media_info: msg.mediaInfo, // ✨ 添加媒体尺寸信息
      })),
      summary: historyContext.summary,
    };

    // 添加当前 URLs
    if (currentContext.imageUrl || currentContext.videoUrl) {
      data.current_urls = [];

      if (currentContext.imageUrl) {
        data.current_urls.push(...this.extractUrls(currentContext.imageUrl));
      }

      if (currentContext.videoUrl) {
        data.current_urls.push(...this.extractUrls(currentContext.videoUrl));
      }
    }

    // 添加额外参数
    if (currentContext.extraParam) {
      data.extra_params = currentContext.extraParam;
    }

    // 添加上一个任务ID
    if (historyContext.summary.lastTaskId) {
      data.previous_task_id = historyContext.summary.lastTaskId;
    }

    // ✨ 添加当前任务的 customId
    if (currentContext.customId) {
      data.current_custom_id = currentContext.customId;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(prompt: string, contextData: string): string {
    return `用户说: "${prompt}"

完整上下文信息 (JSON格式):
${contextData}

请根据以上信息:
1. 分析用户的真实需求
2. 查看对话历史,理解上下文
3. 识别所有URL的类型 (图片/视频)
4. 选择最合适的工具
5. 生成正确的参数

注意: 优先使用绘画工具,其次使用视频工具。`;
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

      // 中间过渡配置: 只有 endpoint,自动补全 syncConfig 和 asyncConfig
      if (queryTool.endpoint) {
        return {
          ...queryTool,
          executionMode: 'async', // 默认异步
          syncConfig: {
            timeout: 300, // ✨ 修改默认超时为300秒（5分钟）
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

    throw new Error(`查询工具 ${queryToolName} 未配置`);
  }

  /**
   * 构建 FC 工具
   */
  private buildFCTools(customConfig: any): any[] {
    const tools: any[] = [];

    for (const [toolKey, toolConfig] of Object.entries(customConfig.tools)) {
      // 移除对 query 工具的跳过逻辑，确保所有生成工具都正常处理
      if ((toolConfig as any).enabled === false) continue;

      const fcTool = {
        type: 'function' as const,
        function: {
          name: toolKey,
          description: (toolConfig as any).description || `${toolKey}`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      };

      // 添加参数定义
      let hasBillingCoefficient = false;
      if ((toolConfig as any).requestParams && Array.isArray((toolConfig as any).requestParams)) {
        for (const param of (toolConfig as any).requestParams) {
          const paramDef: any = {
            type: param.type,
            description: param.description || `${param.name} 参数`,
          };

          // ✨ 如果是数组类型，必须添加 items 定义
          if (param.type === 'array') {
            paramDef.items = {
              type: 'string', // 默认为字符串数组，适用于URL、文本等常见场景
              description: `数组中的${param.description || param.name}项`,
            };
          }

          fcTool.function.parameters.properties[param.name] = paramDef;

          if (param.enum) {
            fcTool.function.parameters.properties[param.name].enum = param.enum;
          }

          if (param.minimum !== undefined) {
            fcTool.function.parameters.properties[param.name].minimum = param.minimum;
          }

          if (param.maximum !== undefined) {
            fcTool.function.parameters.properties[param.name].maximum = param.maximum;
          }

          if (param.required) {
            fcTool.function.parameters.required.push(param.name);
          }

          if (param.name === 'billing_coefficient') {
            hasBillingCoefficient = true;
          }
        }
      }

      // 添加默认参数
      if (!hasBillingCoefficient) {
        fcTool.function.parameters.properties['billing_coefficient'] = {
          type: 'number',
          description: '计费系数,默认为1',
        };
        fcTool.function.parameters.required.push('billing_coefficient');
      }

      fcTool.function.parameters.properties['completion_reply'] = {
        type: 'string',
        description:
          '任务完成后的友好回复（必须与用户语言一致）。简洁自然，不要使用量词如"一张"、"多张"。示例："海绵宝宝图片已生成"、"视频生成完成"',
      };
      fcTool.function.parameters.required.push('completion_reply');

      fcTool.function.parameters.properties['progress_reply'] = {
        type: 'string',
        description:
          '任务进行中的提示语（必须与用户语言一致）。简洁自然，不要使用量词。示例："正在生成海绵宝宝图片..."、"视频生成中..."',
      };
      fcTool.function.parameters.required.push('progress_reply');

      tools.push(fcTool);
    }

    return tools;
  }

  /**
   * 提交任务并处理结果（包含回调）
   */
  private async submitTask({
    toolConfig,
    parameters,
    apiKey,
    apiBaseUrl,
    customConfig,
    selectedTool, // ✨ 新增：选中的工具名称
    completionReply, // ✨ 新增：完成回复
    progressReply, // ✨ 新增：进度回复
    onProgress, // ✨ 新增：进度回调
    onSuccess,
    onFailure,
  }: {
    toolConfig: any;
    parameters: any;
    apiKey: string;
    apiBaseUrl: string;
    customConfig: any;
    selectedTool?: string; // ✨ 新增
    completionReply?: string; // ✨ 新增
    progressReply?: string; // ✨ 新增
    onProgress?: (data: any) => Promise<void>; // ✨ 新增
    onSuccess: (data: any) => Promise<void>;
    onFailure: (data: any) => Promise<void>;
  }): Promise<void> {
    // 在 try 外部声明变量，以便在 catch 中访问
    let url: string;
    let finalApiKey: string;
    let requestBody: any;

    try {
      const { endpoint, method = 'POST', overrideUrl, overrideKey, queryTool } = toolConfig;

      if (!endpoint) {
        throw new Error('工具配置缺少 endpoint');
      }

      const baseUrl = overrideUrl || apiBaseUrl;
      finalApiKey = overrideKey || apiKey;

      // 构建请求URL (处理动态端点)
      url = baseUrl + endpoint;
      if (parameters.dynamic_endpoint) {
        url = baseUrl + parameters.dynamic_endpoint;
        delete parameters.dynamic_endpoint;
      }

      // 构建请求体
      requestBody = { ...parameters };
      delete requestBody.completion_reply;

      // ✨ 获取文件传递格式配置（工具级别）
      const fileTransferFormat = toolConfig.fileTransferFormat || 'url';

      // 检测是否使用 multipart/form-data（通过 contentType 配置）
      const useMultipart = toolConfig.contentType === 'multipart/form-data';

      // OpenAI 风格图片编辑 JSON 接口要求 images 为对象数组：
      // [{ "image_url": "https://..." }]。multipart 模式需要保留 URL 列表供后续下载成文件。
      if (!useMultipart) {
        requestBody = this.normalizeImageReferenceParams(requestBody);
      }

      // ✨ 如果配置了 base64 格式且不是 multipart，转换 URL 为 base64
      if (fileTransferFormat === 'base64' && !useMultipart) {
        Logger.log(`使用 base64 格式转换文件参数`, 'UnifiedCreativeService');
        requestBody = await this.convertUrlsToBase64(requestBody, toolConfig);
      }

      // ✨ 获取 queryTool 配置（用于读取超时设置）
      const queryConfigForTimeout = queryTool
        ? this.getQueryToolConfig(customConfig, queryTool)
        : null;
      // ✨ 读取同步模式超时配置，默认300秒（5分钟）
      const syncTimeout = queryConfigForTimeout?.syncConfig?.timeout
        ? queryConfigForTimeout.syncConfig.timeout * 1000
        : 300000;

      Logger.debug(
        `[任务提交] 同步模式超时设置: ${syncTimeout}ms (${syncTimeout / 1000}秒)`,
        'UnifiedCreativeService',
      );

      let response;
      if (useMultipart && method.toLowerCase() === 'post') {
        // 使用 multipart/form-data 格式
        Logger.log(`使用 multipart/form-data 格式提交任务`, 'UnifiedCreativeService');

        const formData = new FormData();

        // 从配置中获取文件字段列表（标记为 isFile 的参数）
        const fileFields: string[] = [];
        if (toolConfig.requestParams && Array.isArray(toolConfig.requestParams)) {
          toolConfig.requestParams
            .filter((param: any) => param.isFile === true)
            .forEach((param: any) => fileFields.push(param.name));
        }

        if (fileFields.length > 0) {
          Logger.log(`使用配置的文件字段: ${fileFields.join(', ')}`, 'UnifiedCreativeService');
        }

        for (const [key, value] of Object.entries(requestBody)) {
          // 跳过空值
          if (value === null || value === undefined || value === '') {
            continue;
          }

          // 如果是文件字段，处理单个或多个 URL
          if (fileFields.includes(key)) {
            let urls: string[] = [];

            // 解析 URL（支持数组、对象数组、逗号分隔字符串、单个URL）
            if (Array.isArray(value)) {
              urls = value
                .map(v => {
                  if (typeof v === 'string') {
                    return v;
                  }

                  if (v && typeof v === 'object' && typeof (v as any).image_url === 'string') {
                    return (v as any).image_url;
                  }

                  return '';
                })
                .filter(v => v.startsWith('http'));
            } else if (typeof value === 'string') {
              if (value.includes(',')) {
                // 逗号分隔的多个 URL
                urls = value.split(',').filter(v => v.trim().startsWith('http'));
              } else if (value.startsWith('http')) {
                // 单个 URL
                urls = [value];
              }
            } else if (value && typeof value === 'object') {
              const imageUrl = (value as any).image_url;
              if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
                urls = [imageUrl];
              }
            }

            if (urls.length > 0) {
              Logger.log(`文件字段 ${key} 包含 ${urls.length} 个URL`, 'UnifiedCreativeService');

              // 下载所有文件
              for (let i = 0; i < urls.length; i++) {
                try {
                  Logger.log(`下载文件 ${i + 1}/${urls.length}`, 'UnifiedCreativeService');
                  const { buffer, filename, contentType } = await this.downloadFileFromUrl(urls[i]);
                  // 多次 append 同一个 key（FormData 标准支持）
                  formData.append(key, buffer, {
                    filename,
                    contentType,
                  });
                  Logger.log(`文件 ${i + 1} 添加成功`, 'UnifiedCreativeService');
                } catch (error) {
                  Logger.error(`下载文件 ${i + 1} 失败: ${error.message}`);
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
          method,
          url,
          headers: {
            Authorization: `Bearer ${finalApiKey}`,
            'Content-Type': 'application/json',
          },
          data: requestBody,
          timeout: syncTimeout, // ✨ 使用配置的超时时间（默认300秒）
        });
      }

      Logger.debug('[任务提交] 已收到 API 响应', 'UnifiedCreativeService');

      // ✨ 先检查是否是同步模式 (优先级高于 taskId 检查)
      const queryConfig = queryTool ? this.getQueryToolConfig(customConfig, queryTool) : null;

      if (queryConfig?.executionMode === 'sync') {
        // 同步模式: 尝试直接从响应中提取结果URL
        const resultPath = queryConfig.syncConfig.resultPath;

        Logger.debug(`[同步模式] 提取结果路径: ${resultPath}`, 'UnifiedCreativeService');

        // ✨ 使用通配符提取(支持多图)
        const resultUrl =
          resultPath.includes('[*]') || resultPath.includes('.*.')
            ? this.getValueByWildcardPath(response.data, resultPath)
            : this.getValueByPath(response.data, resultPath);

        Logger.debug('[同步模式] 已提取结果', 'UnifiedCreativeService');

        if (resultUrl) {
          const successData: any = {};

          // ✨ 判断是单个URL还是URL数组
          if (Array.isArray(resultUrl)) {
            Logger.log(
              `[同步模式] 检测到URL数组，共 ${resultUrl.length} 个`,
              'UnifiedCreativeService',
            );

            // 取第一个URL判断类型
            const firstUrl = resultUrl[0];
            const mediaType = this.detectMediaType(firstUrl);

            if (mediaType === 'image') {
              // ✨ 下载并保存多张图片到自己的存储
              const savedUrls = await this.processMediaData(resultUrl, 'image');
              successData.imageUrl = savedUrls;
            } else if (mediaType === 'video') {
              // ✨ 下载并保存多个视频到自己的存储
              const savedUrls = await this.processMediaData(resultUrl, 'video');
              successData.videoUrl = savedUrls;
            } else {
              Logger.warn(`[同步模式] 无法判断URL类型,默认作为图片处理`, 'UnifiedCreativeService');
              const savedUrls = await this.processMediaData(resultUrl, 'image');
              successData.imageUrl = savedUrls;
            }
          } else {
            // 单个URL
            // ✨ 根据URL类型判断是图片还是视频
            const mediaType = this.detectMediaType(resultUrl);

            if (mediaType === 'image') {
              // ✨ 下载并保存图片到自己的存储
              const savedUrl = await this.processImageData(resultUrl);
              successData.imageUrl = savedUrl;
            } else if (mediaType === 'video') {
              // ✨ 下载并保存视频到自己的存储
              const savedUrl = await this.processVideoData(resultUrl);
              successData.videoUrl = savedUrl;
            } else {
              // 无法判断时,默认作为图片处理
              Logger.warn('[同步模式] 无法判断URL类型，默认作为图片处理', 'UnifiedCreativeService');
              const savedUrl = await this.processImageData(resultUrl);
              successData.imageUrl = savedUrl;
            }
          }

          // ✨ 添加完成回复
          if (completionReply) {
            successData.content = completionReply;
          }

          // ✨ 添加工具类型信息
          if (selectedTool) {
            successData.toolType = selectedTool;
          }

          // ✨ 同步模式：直接返回成功（不调用 pollTaskUntilComplete）
          await onSuccess(successData);
          return;
        } else {
          Logger.error(
            `[同步模式] 无法从路径 ${resultPath} 提取URL\n` + `请检查 resultPath 配置是否正确`,
          );
          throw new Error(`[同步模式] 无法从路径 ${resultPath} 提取URL，请检查配置`);
        }
      }

      // 异步模式：需要轮询
      // ✨ 优先使用配置的 responsePaths.id 提取任务ID，如果没有配置则使用硬编码回退
      let taskId;

      if (toolConfig.responsePaths && toolConfig.responsePaths.id) {
        // 使用配置的路径提取
        const extracted = this.extractDataByPaths(response.data, toolConfig.responsePaths);
        taskId = extracted.id;
        Logger.debug(`[任务提交] 已使用配置路径提取任务ID`, 'UnifiedCreativeService');
      }

      // 如果配置提取失败，使用硬编码回退
      if (!taskId) {
        taskId =
          response.data?.result ||
          response.data?.task_id ||
          response.data?.id ||
          response.data?.data?.result ||
          response.data?.data?.task_id ||
          response.data?.data?.id;
        Logger.debug(`[任务提交] 已使用回退路径提取任务ID`, 'UnifiedCreativeService');
      }

      if (!taskId) {
        Logger.error('[任务提交] 响应中未找到任务ID', 'UnifiedCreativeService');
        throw new Error('未能获取任务ID');
      }

      Logger.log(`[任务提交] 成功提取任务ID`, 'UnifiedCreativeService');

      // ✨ 异步模式：启动轮询（不阻塞）
      this.pollTaskUntilComplete({
        customConfig,
        taskId,
        apiKey,
        apiBaseUrl,
        toolConfig,
        completionReply, // ✨ 传递完成回复
        onProgress, // ✨ 传递进度回调
        onSuccess: async (result: any) => {
          const successData: any = {};

          // ✨ 添加 taskId 到返回数据（用于后续操作如放大、变体）
          successData.taskId = taskId;
          Logger.debug(`[异步模式] 已添加 taskId 到返回数据`, 'UnifiedCreativeService');

          // ✨ 如果 result 中包含 customId，传递到返回数据（用于后续操作如放大、变体）
          if (result.customId) {
            successData.customId = result.customId;
            Logger.debug(`[异步模式] 已添加 customId 到返回数据`, 'UnifiedCreativeService');
          }

          // ✨ 判断是单个URL还是URL数组
          if (Array.isArray(result.url)) {
            Logger.log(
              `[异步模式] 检测到URL数组，共 ${result.url.length} 个`,
              'UnifiedCreativeService',
            );

            // 取第一个URL判断类型
            const firstUrl = result.url[0];
            const mediaType = this.detectMediaType(firstUrl);

            if (mediaType === 'image') {
              // ✨ 下载并保存多张图片到自己的存储
              const savedUrls = await this.processMediaData(result.url, 'image');
              successData.imageUrl = savedUrls;
            } else if (mediaType === 'video') {
              // ✨ 下载并保存多个视频到自己的存储
              const savedUrls = await this.processMediaData(result.url, 'video');
              successData.videoUrl = savedUrls;
            } else {
              Logger.warn(`[异步模式] 无法判断URL类型,默认作为图片处理`, 'UnifiedCreativeService');
              const savedUrls = await this.processMediaData(result.url, 'image');
              successData.imageUrl = savedUrls;
            }
          } else {
            // 单个URL
            // ✨ 根据URL类型判断是图片还是视频
            const mediaType = this.detectMediaType(result.url);

            if (mediaType === 'image') {
              // ✨ 下载并保存图片到自己的存储
              const savedUrl = await this.processImageData(result.url);
              successData.imageUrl = savedUrl;
            } else if (mediaType === 'video') {
              // ✨ 下载并保存视频到自己的存储
              const savedUrl = await this.processVideoData(result.url);
              successData.videoUrl = savedUrl;
            } else {
              // 无法判断时,默认作为图片处理
              Logger.warn('[异步模式] 无法判断URL类型，默认作为图片处理', 'UnifiedCreativeService');
              const savedUrl = await this.processImageData(result.url);
              successData.imageUrl = savedUrl;
            }
          }

          // ✨ 添加完成回复
          if (completionReply) {
            successData.content = completionReply;
          }

          // ✨ 添加工具类型信息
          if (selectedTool) {
            successData.toolType = selectedTool;
          }

          await onSuccess(successData);
        },
        onFailure: async (error: any) => {
          await onFailure({
            content: `任务失败: ${error.message}`,
          });
        },
      }).catch(error => {
        Logger.error(`[异步轮询失败] ${error.message}`, error.stack, 'UnifiedCreativeService');
      });
    } catch (error) {
      Logger.error(`[任务提交失败] ${error.message}`, 'UnifiedCreativeService');
      if (error.response) {
        Logger.error(`[失败详情] 响应状态: ${error.response.status}`, 'UnifiedCreativeService');
      }
      Logger.error(error.stack, 'UnifiedCreativeService');
      await onFailure({ content: `任务提交失败: ${error.message}` });
    }
  }

  /**
   * 轮询异步任务
   */
  private async pollTaskUntilComplete({
    customConfig,
    taskId,
    apiKey,
    apiBaseUrl,
    toolConfig,
    completionReply, // ✨ 新增
    onProgress, // ✨ 新增
    onSuccess,
    onFailure,
  }: any): Promise<void> {
    try {
      // 从 toolConfig 获取 queryTool 名称（必须有明确的配置）
      const queryToolName = toolConfig.queryTool;
      if (!queryToolName) {
        throw new Error(`工具 ${toolConfig.name || ''} 未配置 queryTool，无法确定查询方式`);
      }

      const queryConfig = this.getQueryToolConfig(customConfig, queryToolName);

      // ✨ 同步模式不应该进入这里，已经在 submitTask 中处理完毕
      if (queryConfig.executionMode === 'sync') {
        Logger.error(`[轮询] 错误：同步模式不应该启动轮询`, 'UnifiedCreativeService');
        throw new Error('同步模式任务不应该进入轮询流程');
      }

      await this.handleAsyncPoll({
        queryConfig,
        taskId,
        apiKey,
        apiBaseUrl,
        toolConfig,
        completionReply, // ✨ 传递完成回复
        onProgress, // ✨ 传递进度回调
        onSuccess,
        onFailure,
      });
    } catch (error) {
      Logger.error(`[轮询] 失败: ${error.message}`, 'UnifiedCreativeService');
      await onFailure(error);
    }
  }

  /**
   * 处理异步轮询
   */
  private async handleAsyncPoll({
    queryConfig,
    taskId,
    apiKey,
    apiBaseUrl,
    toolConfig,
    completionReply, // ✨ 添加完成回复
    onSuccess,
    onFailure,
    onProgress,
  }: any): Promise<void> {
    try {
      const { asyncConfig } = queryConfig;
      const maxAttempts = asyncConfig.maxAttempts || 60;
      const interval = (asyncConfig.interval || 5) * 1000;
      const overrideUrl = toolConfig.overrideUrl;
      const overrideKey = toolConfig.overrideKey;

      const baseUrl = overrideUrl || apiBaseUrl;
      const finalApiKey = overrideKey || apiKey;
      const startTime = Date.now(); // 记录开始时间用于模拟进度

      // 📋 任务提交成功，开始轮询
      Logger.log(`任务提交成功，开始轮询`, 'UnifiedCreativeService');

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));

        const endpoint = asyncConfig.endpoint.replace('{id}', taskId);
        const url = baseUrl + endpoint;

        Logger.debug(`[轮询] 第${attempt + 1}/${maxAttempts}次查询`, 'UnifiedCreativeService');

        try {
          const response = await axios({
            method: asyncConfig.method || 'GET',
            url,
            headers: {
              Authorization: `Bearer ${finalApiKey}`,
            },
            timeout: 10000,
          });

          // 📋 详细日志：输出轮询响应（仅在成功时输出，避免失败时重复）
          Logger.debug(
            `[轮询] 第${attempt + 1}次查询成功，状态码: ${response.status}`,
            'UnifiedCreativeService',
          );

          // 使用 responsePaths 提取状态和进度
          Logger.debug(
            `[轮询] responsePaths 配置: ${JSON.stringify(queryConfig.responsePaths, null, 2)}`,
            'UnifiedCreativeService',
          );

          const extracted = this.extractDataByPaths(response.data, queryConfig.responsePaths);
          const status = extracted.status;

          Logger.debug(
            `[轮询] 提取的数据 - status: ${status}, progress: ${extracted.progress || '无'}, ` +
              `videoUrl: ${extracted.videoUrl ? '已获取' : '无'}, imageUrl: ${
                extracted.imageUrl ? '已获取' : '无'
              }`,
            'UnifiedCreativeService',
          );

          // 使用 statusMapping 映射状态
          const mappedStatus = queryConfig.statusMapping
            ? queryConfig.statusMapping[status] || status
            : status;

          Logger.debug(
            `[轮询] 状态映射 - 原始: ${status}, 映射后: ${mappedStatus}`,
            'UnifiedCreativeService',
          );

          // ✨ 支持进度更新（如果 API 返回了进度）
          if (onProgress && (extracted.progress || mappedStatus === 'processing')) {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const apiProgressNum = this.parseProgress(extracted.progress);
            const simulatedProgress = this.calculateSimulatedProgress(elapsedSeconds);
            const simulatedProgressNum = this.parseProgress(simulatedProgress);

            // 取两者最大值，保证进度单调递增，永不倒退
            const maxProgressNum = Math.max(apiProgressNum, simulatedProgressNum);
            const progressToReport = `${maxProgressNum}%`;

            Logger.debug(
              `[轮询进度] API=${
                extracted.progress || '无'
              }, 模拟=${simulatedProgress}, 最终=${progressToReport}`,
            );

            await onProgress({
              progress: progressToReport,
              status: status,
              content: completionReply || `正在生成中... ${progressToReport}`, // ✨ 添加内容更新
            });
          }

          if (
            mappedStatus === 'succeeded' ||
            mappedStatus === 'completed' ||
            mappedStatus === 'success' ||
            mappedStatus === 'SUCCESS' // ✨ 添加对大写 SUCCESS 的支持
          ) {
            Logger.log(`[轮询] 任务完成`, 'UnifiedCreativeService');

            // ✨ 支持多响应路径：按优先级提取 URL
            const resultUrl =
              extracted.videoUrl ||
              extracted.imageUrl ||
              extracted.url ||
              extracted.video_url ||
              extracted.image_url;

            Logger.log('[轮询] 已提取结果 URL', 'UnifiedCreativeService');

            if (!resultUrl) {
              throw new Error('任务完成但未找到结果 URL');
            }

            // ✨ 构建返回数据，包含 URL 和完整的 API 响应
            const successData: any = { url: resultUrl };

            // ✨ 如果 API 响应中有 buttons 字段，添加到返回数据中
            if (response.data.buttons && Array.isArray(response.data.buttons)) {
              successData.customId = response.data.buttons;
              Logger.debug(
                `[轮询] 提取到 ${response.data.buttons.length} 个按钮信息`,
                'UnifiedCreativeService',
              );
            }

            await onSuccess(successData);
            return;
          }

          if (
            mappedStatus === 'failed' ||
            mappedStatus === 'error' ||
            mappedStatus === 'FAILED' || // ✨ 添加对大写 FAILED 的支持
            mappedStatus === 'ERROR' // ✨ 添加对大写 ERROR 的支持
          ) {
            Logger.error(`[轮询] 任务失败，第三方返回失败状态`, 'UnifiedCreativeService');
            await onFailure(new Error(extracted.failReason || extracted.error || '任务执行失败'));
            return;
          }
        } catch (error) {
          const isLastAttempt = attempt === maxAttempts - 1;

          if (isLastAttempt) {
            // 最后一次尝试失败，记录错误日志
            Logger.error(
              `[轮询] 第${attempt + 1}次查询失败（最后一次）: ${error.message}\n` +
                `  - 状态码: ${error.response?.status || '无'}`,
              'UnifiedCreativeService',
            );
          } else {
            // 非最后一次失败，记录警告日志并继续重试
            Logger.warn(
              `[轮询] 第${attempt + 1}/${maxAttempts}次查询失败，继续重试: ${error.message}\n` +
                `  - 状态码: ${error.response?.status || '无'}`,
              'UnifiedCreativeService',
            );
          }

          if (isLastAttempt) {
            // 最后一次尝试失败，抛出详细错误
            const finalError = new Error(
              `轮询失败（第${attempt + 1}/${maxAttempts}次）: ${error.message}\n` +
                `状态码: ${error.response?.status || '无'}`,
            );
            throw finalError;
          }
          // 继续下一次轮询
        }
      }

      Logger.error(`[轮询] 超时`, 'UnifiedCreativeService');
      await onFailure(new Error('轮询超时'));
    } catch (error) {
      Logger.error(`[异步轮询] 失败: ${error.message}`, 'UnifiedCreativeService');
      await onFailure(error);
    }
  }

  /**
   * 根据路径提取数据（支持通配符 * 提取数组所有元素）
   * 例如:
   *   - "data.0.url" -> 提取第一个URL
   *   - "data.*.url" 或 "data[*].url" -> 提取所有URL返回数组
   */
  private extractDataByPaths(data: any, paths: any): any {
    const result: any = {};

    if (!paths) return result;

    for (const [key, path] of Object.entries(paths)) {
      const pathStr = path as string;

      // ✨ 检查是否包含通配符 * 或 [*]
      if (pathStr.includes('[*]') || pathStr.includes('.*.')) {
        result[key] = this.getValueByWildcardPath(data, pathStr);
      } else {
        result[key] = this.getValueByPath(data, pathStr);
      }
    }

    return result;
  }

  /**
   * 使用通配符路径提取数据
   * 支持 "data[*].url" 或 "data.*.url" 格式
   */
  private getValueByWildcardPath(obj: any, path: string): any {
    if (!path || !obj) return undefined;

    // 标准化路径：将 [*] 替换为 .*
    const normalizedPath = path.replace(/\[\*\]/g, '.*.');

    // 分割路径
    const keys = normalizedPath.split(/[\.\[\]]+/).filter(key => key);

    // 查找通配符位置
    const wildcardIndex = keys.indexOf('*');

    if (wildcardIndex === -1) {
      // 没有通配符，使用普通路径
      return this.getValueByPath(obj, path);
    }

    // 通配符前的路径
    const beforeWildcard = keys.slice(0, wildcardIndex);
    // 通配符后的路径
    const afterWildcard = keys.slice(wildcardIndex + 1);

    // 导航到通配符位置
    let current = obj;
    for (const key of beforeWildcard) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }

    // 检查当前值是否是数组
    if (!Array.isArray(current)) {
      Logger.warn(`[通配符提取] 通配符位置 ${beforeWildcard.join('.')}.* 不是数组`);
      return undefined;
    }

    // 对数组每个元素提取后续路径
    const results: any[] = [];
    for (let i = 0; i < current.length; i++) {
      let item = current[i];
      for (const key of afterWildcard) {
        if (item === null || item === undefined) break;
        item = item[key];
      }

      if (item !== undefined && item !== null) {
        results.push(item);
      }
    }

    Logger.debug(`[通配符提取] 成功提取 ${results.length} 个值`, 'UnifiedCreativeService');

    return results;
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
   * 解析进度百分比为数字，支持多种格式
   */
  private parseProgress(progress: string | number | undefined): number {
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
  }

  /**
   * 根据路径获取值
   */
  private getValueByPath(obj: any, path: string): any {
    if (!path) return undefined;

    const keys = path.split(/[\.\[\]]+/).filter(key => key);
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
   * 判断URL是图片还是视频
   * @param url 媒体文件URL
   * @returns 'image' | 'video' | 'unknown'
   */
  private detectMediaType(url: string): 'image' | 'video' | 'unknown' {
    if (!url) return 'unknown';

    const urlLower = url.toLowerCase();

    if (urlLower.startsWith('data:image/')) {
      return 'image';
    }

    if (urlLower.startsWith('data:video/')) {
      return 'video';
    }

    // GPT Image 模型通常返回纯 base64。base64 内容可能偶然包含 /video 之类片段，
    // 不能按 URL 路径关键字判断，否则会误走视频保存。
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
      if (/^[A-Za-z0-9+/=]+$/.test(url.substring(0, 100))) {
        return 'image';
      }

      return 'unknown';
    }

    // 常见图片扩展名
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    // 常见视频扩展名
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v'];

    // 检查是否包含图片扩展名
    if (imageExtensions.some(ext => urlLower.includes(ext))) {
      return 'image';
    }

    // 检查是否包含视频扩展名
    if (videoExtensions.some(ext => urlLower.includes(ext))) {
      return 'video';
    }

    // 如果没有明确扩展名,尝试从URL路径判断
    if (urlLower.includes('/image') || urlLower.includes('/img') || urlLower.includes('/picture')) {
      return 'image';
    }

    if (urlLower.includes('/video') || urlLower.includes('/vid')) {
      return 'video';
    }

    // 无法判断,返回unknown
    return 'unknown';
  }

  /**
   * 从 URL 下载文件到 Buffer
   */
  private async downloadFileFromUrl(
    url: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    try {
      const { buffer, mimeType } = await fetchRemoteUrlBuffer(url, {
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
        contentType: this.resolveFileContentType(filename, mimeType, buffer),
      };
    } catch (error) {
      Logger.error(`下载文件失败: ${error.message}`, 'UnifiedCreativeService');
      throw new HttpException(`无法下载文件: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  private resolveFileContentType(filename: string, mimeType?: string, buffer?: Buffer): string {
    const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase();
    if (
      normalizedMimeType &&
      normalizedMimeType !== 'application/octet-stream' &&
      normalizedMimeType !== 'binary/octet-stream'
    ) {
      return normalizedMimeType;
    }

    const detectedFromBuffer = buffer ? this.detectContentTypeFromBuffer(buffer) : '';
    if (detectedFromBuffer) {
      return detectedFromBuffer;
    }

    const extension = filename.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeByExtension: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
    };

    return extension
      ? mimeByExtension[extension] || 'application/octet-stream'
      : 'application/octet-stream';
  }

  private detectContentTypeFromBuffer(buffer: Buffer): string {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length >= 8 && pngSignature.every((byte, index) => buffer[index] === byte)) {
      return 'image/png';
    }

    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    if (buffer.length >= 6) {
      const signature = buffer.subarray(0, 6).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }

    return '';
  }

  /**
   * 提取并处理多个 URL（支持数组或逗号分隔）
   */
  private extractUrls(input: string): string[] {
    if (!input) return [];

    if (input.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => item && item.url).map(item => item.url);
        }
      } catch (e) {
        Logger.debug(`JSON 解析失败: ${e.message}`, 'UnifiedCreativeService');
      }
    }

    if (input.includes(',')) {
      return input
        .split(',')
        .map(url => url.trim())
        .filter(url => url.startsWith('http'));
    }

    return input.startsWith('http') ? [input] : [];
  }

  /**
   * 兼容图片编辑接口的图片引用参数
   */
  private normalizeImageReferenceParams(requestBody: any): any {
    if (!requestBody || typeof requestBody !== 'object') {
      return requestBody;
    }

    const normalized = { ...requestBody };

    if (Array.isArray(normalized.images)) {
      normalized.images = normalized.images.map((item: any) => {
        if (typeof item === 'string') {
          return { image_url: item };
        }

        return item;
      });
    }

    if (typeof normalized.mask === 'string') {
      normalized.mask = { image_url: normalized.mask };
    }

    return normalized;
  }

  /**
   * 处理图片/视频数据（URL 或 base64）
   */
  private async processMediaData(
    mediaData: string | string[],
    mediaType: 'image' | 'video',
  ): Promise<string> {
    if (!mediaData) {
      throw new Error('媒体数据为空');
    }

    // 处理多张图片/视频
    if (Array.isArray(mediaData)) {
      Logger.debug(`处理 ${mediaData.length} 个${mediaType}`, 'UnifiedCreativeService');

      const savedUrls: string[] = [];

      for (let i = 0; i < mediaData.length; i++) {
        const url = mediaData[i];
        try {
          // ✨ 添加延迟，避免反代服务器频率限制
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟 1 秒
          }

          if (mediaType === 'image') {
            const savedUrl = await this.processImageData(url);
            savedUrls.push(savedUrl);
          } else {
            const savedUrl = await this.processVideoData(url);
            savedUrls.push(savedUrl);
          }
        } catch (error) {
          Logger.error(`处理第 ${i + 1} 个${mediaType}失败: ${error.message}`, error.stack);
          // 继续处理其他文件
        }
      }

      if (savedUrls.length === 0) {
        throw new Error('所有媒体文件处理失败');
      }

      // 返回逗号分隔的URL列表
      const result = savedUrls.join(',');
      Logger.log(
        `${mediaType}处理完成，成功 ${savedUrls.length}/${mediaData.length} 张`,
        'UnifiedCreativeService',
      );
      return result;
    } else {
      // 单个文件
      if (mediaType === 'image') {
        return await this.processImageData(mediaData);
      } else {
        return await this.processVideoData(mediaData);
      }
    }
  }

  /**
   * 处理单张图片数据
   */
  private async processImageData(imageData: string): Promise<string> {
    // 判断是 URL 还是 base64
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      // URL 格式：下载并保存
      Logger.debug(`检测到URL格式图片`, 'UnifiedCreativeService');
      return await this.downloadAndSaveImage(imageData);
    } else if (imageData.startsWith('data:image')) {
      // 标准 base64 格式（带前缀）：上传
      Logger.debug(`检测到标准base64格式图片`, 'UnifiedCreativeService');
      return await this.uploadBase64Image(imageData);
    } else if (/^[A-Za-z0-9+/=]+$/.test(imageData.substring(0, 100))) {
      // 纯 base64 格式（无前缀）：自动添加前缀后上传
      const buffer = Buffer.from(imageData, 'base64');
      const mimeType = this.detectContentTypeFromBuffer(buffer) || 'image/png';
      Logger.debug(`检测到纯base64格式，自动添加 ${mimeType} 前缀`, 'UnifiedCreativeService');
      const base64WithPrefix = `data:${mimeType};base64,${imageData}`;
      return await this.uploadBase64Image(base64WithPrefix);
    } else {
      Logger.error('不支持的图片格式', 'UnifiedCreativeService');
      throw new Error('不支持的图片格式');
    }
  }

  /**
   * 处理单个视频数据
   */
  private async processVideoData(videoUrl: string): Promise<string> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;
      const savedUrl = await this.uploadService.uploadFileFromUrl({
        url: videoUrl,
        dir: `video/custom/${currentDate}`,
      });
      Logger.log('视频保存成功', 'UnifiedCreativeService');
      return savedUrl;
    } catch (error) {
      Logger.error(`视频保存失败: ${error.message}`, 'UnifiedCreativeService');
      throw error;
    }
  }

  /**
   * 根据工具配置转换 URL 为 base64（JSON 模式下使用）
   */
  private async convertUrlsToBase64(requestBody: any, toolConfig: any): Promise<any> {
    Logger.debug(
      `[base64转换] 开始处理, requestBody keys: ${JSON.stringify(Object.keys(requestBody))}`,
      'UnifiedCreativeService',
    );
    Logger.debug(
      `[base64转换] toolConfig.requestParams: ${JSON.stringify(toolConfig.requestParams || [])}`,
      'UnifiedCreativeService',
    );

    const converted = { ...requestBody };

    // 从配置中获取文件字段列表
    const fileFields: string[] = [];
    if (toolConfig.requestParams && Array.isArray(toolConfig.requestParams)) {
      toolConfig.requestParams
        .filter((param: any) => {
          const isFile = param.isFile === true;
          Logger.debug(
            `[base64转换] 参数 ${param.name}: isFile=${isFile}, type=${param.type}`,
            'UnifiedCreativeService',
          );
          return isFile;
        })
        .forEach((param: any) => fileFields.push(param.name));
    }

    Logger.log(
      `[base64转换] 检测到文件字段: ${fileFields.length > 0 ? fileFields.join(', ') : '(无)'}`,
      'UnifiedCreativeService',
    );

    if (fileFields.length === 0) {
      Logger.debug('没有配置文件字段，跳过 base64 转换', 'UnifiedCreativeService');
      return converted;
    }

    Logger.log(
      `检测到 ${fileFields.length} 个文件字段，准备转换为 base64`,
      'UnifiedCreativeService',
    );

    // 导入转换工具函数
    const { convertImageToBase64 } = await import('@/common/utils/image.util');

    // 遍历所有文件字段进行转换
    for (const fieldName of fileFields) {
      if (!converted[fieldName]) {
        Logger.debug(`[base64转换] 字段 ${fieldName} 值为空，跳过`, 'UnifiedCreativeService');
        continue;
      }

      try {
        if (Array.isArray(converted[fieldName])) {
          // 数组形式：支持多个文件
          Logger.log(
            `转换字段 ${fieldName}（数组，${converted[fieldName].length} 项）`,
            'UnifiedCreativeService',
          );

          converted[fieldName] = await Promise.all(
            converted[fieldName].map(async (item: string, index: number) => {
              if (
                typeof item === 'string' &&
                (item.startsWith('http://') || item.startsWith('https://'))
              ) {
                Logger.debug(`转换 [${index}] URL 为 base64`, 'UnifiedCreativeService');
                return await convertImageToBase64(item);
              }
              Logger.debug(`[${index}] 不是 URL 格式，跳过`, 'UnifiedCreativeService');
              return item;
            }),
          );
        } else if (typeof converted[fieldName] === 'string') {
          // 单个字符串
          if (
            converted[fieldName].startsWith('http://') ||
            converted[fieldName].startsWith('https://')
          ) {
            Logger.log(`转换字段 ${fieldName} 为 base64`, 'UnifiedCreativeService');
            converted[fieldName] = await convertImageToBase64(converted[fieldName]);
          } else {
            Logger.debug(
              `字段 ${fieldName} 不是 URL 格式: ${converted[fieldName].substring(0, 50)}...`,
              'UnifiedCreativeService',
            );
          }
        }

        Logger.log(`字段 ${fieldName} 转换完成`, 'UnifiedCreativeService');
      } catch (error) {
        Logger.error(`转换字段 ${fieldName} 失败: ${error.message}`, 'UnifiedCreativeService');
        // 转换失败时保留原始值
      }
    }

    Logger.log('所有文件字段 base64 转换完成', 'UnifiedCreativeService');
    return converted;
  }

  /**
   * 下载并保存图片（带重试机制和回退）
   */
  private async downloadAndSaveImage(imageUrl: string): Promise<string> {
    const maxRetries = 3; // 最大重试次数
    const baseDelay = 2000; // 基础延迟 2 秒

    // ✨ 获取 MJ 反代配置（只获取一次）
    const mjProxyImgUrl = await this.globalConfigService.getConfigs(['mjProxyImgUrl']);

    // ✨ 如果是 MJ CDN 图片且配置了反代，替换 URL
    let finalUrl = imageUrl;
    if (imageUrl.includes('cdn.midjourney.com') && mjProxyImgUrl) {
      try {
        // 支持两种反代格式：
        // 1. 域名替换: https://proxy.example.com
        // 2. 路径反代: https://proxy.example.com/https/cdn.midjourney.com
        if (mjProxyImgUrl.includes('cdn.midjourney.com')) {
          // 路径反代格式：提取原始 URL 的路径部分
          const parsedUrl = new URL(imageUrl);
          finalUrl = `${mjProxyImgUrl}${parsedUrl.pathname}`;
        } else {
          // 域名替换格式：替换协议和域名
          const newUrlBase = new URL(mjProxyImgUrl);
          const parsedUrl = new URL(imageUrl);
          parsedUrl.protocol = newUrlBase.protocol;
          parsedUrl.hostname = newUrlBase.hostname;
          parsedUrl.port = newUrlBase.port || '';
          finalUrl = parsedUrl.toString();
        }
        Logger.debug('[图片下载] 使用 MJ 反代', 'UnifiedCreativeService');
      } catch (error) {
        Logger.warn(`URL 替换失败，使用原始 URL: ${error.message}`, 'UnifiedCreativeService');
        finalUrl = imageUrl;
      }
    }

    // 尝试下载并保存图片
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}${month}/${day}`;

        if (attempt > 1) {
          Logger.debug(`[图片下载] 第 ${attempt} 次重试`, 'UnifiedCreativeService');
        }

        const savedUrl = await this.uploadService.uploadFileFromUrl({
          url: finalUrl,
          dir: `images/custom/${currentDate}`,
        });

        Logger.log('图片保存成功', 'UnifiedCreativeService');
        return savedUrl;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;

        if (!isLastAttempt) {
          // 计算退避延迟（指数退避：2s, 4s）
          const delay = baseDelay * Math.pow(2, attempt - 1);
          Logger.debug(
            `[图片下载] 第 ${attempt} 次失败: ${error.message}, ${delay}ms 后重试...`,
            'UnifiedCreativeService',
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // ✨ 回退机制：所有重试都失败后，直接使用原始 URL
          Logger.warn(
            `[图片下载] 保存失败（已重试 ${maxRetries} 次），使用原始 URL: ${finalUrl}`,
            'UnifiedCreativeService',
          );
          return finalUrl;
        }
      }
    }

    // 理论上不会到这里
    return imageUrl;
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

      Logger.log('Base64 图片保存成功', 'UnifiedCreativeService');
      return savedUrl;
    } catch (error) {
      Logger.error(`Base64 图片保存失败: ${error.message}`, 'UnifiedCreativeService');
      throw error;
    }
  }
}
