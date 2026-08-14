import { handleError, normalizeReasoningContentForModel } from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { ModelsService } from '../../models/models.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';

/**
 * 思考节点 - 使用新架构
 * 当启用深度思考时，调用思考模型生成思考内容
 * 将思考结果存储到工作流状态中，供后续节点使用
 */
@Injectable()
export class ThinkingNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'thinking',
    type: 'thinking',
    name: '深度思考节点',
    description: '调用思考模型进行深度推理，支持多种思考模型',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    protected readonly modelsService: ModelsService,
  ) {
    super(globalConfigService, modelsService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    Logger.log('开始执行思考节点');

    // 发送开始状态
    this.sendStream(input, {
      type: 'status',
      status: 'thinking',
      content: input.config.progressMessages?.start || '开始深度思考...',
    });

    try {
      // 获取思考模型配置
      const thinkingConfig = await this.getThinkingConfig(input);

      Logger.debug(
        `思考节点开始执行，模型: ${thinkingConfig.model}, 类型: ${thinkingConfig.type}, 支持多模态: ${thinkingConfig.supportMultimodal}`,
      );

      // 准备消息（根据模型是否支持多模态决定是否保留图片/视频）
      const messages = this.prepareMessages(input, thinkingConfig.supportMultimodal);

      // 执行思考流
      const thinkingResult = await this.executeThinking(messages, thinkingConfig, input);

      // 格式化系统消息
      const systemMessage = this.formatThinkingSystemMessage(thinkingResult.full_reasoning_content);

      // 构建共享状态
      const sharedState = {
        ...thinkingResult,
        thinking_enabled: true,
        thinking_type: thinkingConfig.type,
        thinking_model: thinkingConfig.model,
        systemMessage,
        skipped: false,
      };

      // 发送完成状态
      this.sendStream(input, {
        type: 'status',
        status: 'completed',
        content: input.config.progressMessages?.end || '深度思考完成',
      });

      // 返回成功结果
      return {
        result: {
          success: true,
          data: sharedState,
          metadata: {
            model: thinkingConfig.model,
            thinkingType: thinkingConfig.type,
            reasoningLength: thinkingResult.full_reasoning_content?.length || 0,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'thinkingResult']: sharedState,
          // 如果使用共享状态，也更新到sharedState
          ...(input.config.outputKey === 'sharedState' && { sharedState }),
        },
        agentDataUpdates: {
          reasoning: {
            content: thinkingResult.full_reasoning_content,
            model: thinkingConfig.model,
            type: thinkingConfig.type,
            enabled: true,
          },
        },
      };
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`思考节点执行失败: ${errorMessage}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: errorMessage,
      });

      // 触发错误回调
      input.context.onError?.(error);

      return this.createErrorResult(errorMessage);
    }
  }

  /**
   * 获取思考模型配置
   */
  private async getThinkingConfig(input: NodeInput): Promise<any> {
    try {
      // 优先使用动态参数
      if (input.dynamicParams?.thinkingModel) {
        return {
          model: input.dynamicParams.thinkingModel,
          url: input.dynamicParams.thinkingUrl || input.globalConfig.openaiBaseUrl,
          key: input.dynamicParams.thinkingKey || input.globalConfig.openaiBaseKey,
          type: input.dynamicParams.thinkingType || 1,
        };
      }

      // 使用节点配置
      if (input.config.thinkingModel && input.config.thinkingUrl && input.config.thinkingKey) {
        return {
          model: input.config.thinkingModel,
          url: input.config.thinkingUrl,
          key: input.config.thinkingKey,
          type: input.config.thinkingType || 1,
        };
      }

      // 获取全局深度思考配置
      const globalConfig = await this.globalConfigService.getConfigs([
        'deepThinkingUrl',
        'deepThinkingKey',
        'deepThinkingModel',
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiBaseModel',
      ]);

      // 从执行选项中获取深度思考类型
      const deepThinkingType = input.context.options?.deepThinkingType || 1;

      // 根据类型选择配置
      let modelName: string;
      let supportMultimodal = false;
      let actualType: number;

      switch (deepThinkingType) {
        case 2: // 模型思考
        case 4: // 模型思考（多模态）
          // 使用主模型作为思考模型
          modelName = input.context.options?.model || globalConfig.openaiBaseModel;
          supportMultimodal = deepThinkingType === 4; // 类型4支持多模态
          actualType = 2; // 实际类型为模型思考

          return {
            model: modelName,
            url: input.context.options?.proxyUrl || globalConfig.openaiBaseUrl,
            key: input.context.options?.apiKey || globalConfig.openaiBaseKey,
            type: actualType,
            supportMultimodal,
          };

        case 1: // 全局思考
        case 3: // 全局思考（多模态）
        default:
          // 使用专门的思考模型
          modelName =
            input.config.thinkingModel ||
            globalConfig.deepThinkingModel ||
            globalConfig.openaiBaseModel;
          supportMultimodal = deepThinkingType === 3; // 类型3支持多模态
          actualType = 1; // 实际类型为全局思考

          return {
            model: modelName,
            url:
              input.config.thinkingUrl ||
              globalConfig.deepThinkingUrl ||
              globalConfig.openaiBaseUrl,
            key:
              input.config.thinkingKey ||
              globalConfig.deepThinkingKey ||
              globalConfig.openaiBaseKey,
            type: actualType,
            supportMultimodal,
          };
      }
    } catch (error) {
      Logger.error(`获取思考模型配置失败: ${handleError(error)}`);
      throw new Error(`思考模型配置获取失败: ${error.message}`);
    }
  }

  /**
   * 准备消息
   * @param input 输入参数
   * @param supportMultimodal 是否支持多模态
   */
  private prepareMessages(input: NodeInput, supportMultimodal: boolean = false): any[] {
    // 深度复制消息历史
    const messages = JSON.parse(JSON.stringify(input.messages));

    // 准备思考消息，包含搜索结果（如果有）
    const processedMessages = this.prepareThinkingMessages(messages, input, supportMultimodal);

    // 如果思考模型支持多模态，则保留图片/视频内容
    if (supportMultimodal) {
      Logger.debug('思考模型支持多模态，保留图片/视频内容');
      return processedMessages;
    }

    // 如果不支持多模态，过滤掉图片/视频内容
    Logger.debug('思考模型不支持多模态，过滤图片/视频内容');
    return processedMessages.map((message: any) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        // 过滤掉图片和视频内容，只保留文本
        message.content = message.content
          .filter((item: any) => item.type !== 'image_url' && item.type !== 'video_url')
          .map((item: any) => item.text || item)
          .join('');
      }
      return message;
    });
  }

  /**
   * 准备思考消息，包含搜索结果
   */
  private prepareThinkingMessages(
    messages: any[],
    input: NodeInput,
    supportMultimodal: boolean = false,
  ): any[] {
    const processedMessages = [...messages];

    // 检查是否有搜索结果
    let additionalSystemContent = '';

    // 从agentData.toolExecutions获取搜索结果
    if (
      input.context.agentContent?.data?.toolExecutions &&
      input.context.agentContent?.data.toolExecutions.length > 0
    ) {
      const toolExecutions = input.context.agentContent?.data.toolExecutions;
      const searchExecutions = toolExecutions.filter(
        exec =>
          exec.status === 'success' &&
          (exec.name === '联网搜索' || exec.name.toLowerCase().includes('search')),
      );

      if (searchExecutions.length > 0) {
        additionalSystemContent += '\n\n以下是网络搜索结果，请在思考过程中参考这些最新信息：\n';

        // 显示搜索关键词
        const queries = searchExecutions.map(exec => exec.input).filter(Boolean);
        if (queries.length > 0) {
          additionalSystemContent += '搜索关键词：' + queries.join('、') + '\n\n';
        }

        // 显示搜索结果（限制数量）
        let displayedCount = 0;
        const maxResults = 10;

        for (const execution of searchExecutions) {
          const results = execution.output || [];
          for (const result of results) {
            if (displayedCount >= maxResults) break;

            const title = (result.title || '').substring(0, 100);
            const snippet = (result.snippet || result.content || '').substring(0, 150);

            if (!title && !snippet) continue;

            displayedCount++;
            additionalSystemContent += `${displayedCount}. ${title}\n${snippet}\n\n`;
          }
        }

        if (displayedCount > 0) {
          additionalSystemContent += `（显示了${displayedCount}条搜索结果）\n`;
          Logger.debug(`思考节点检测到${displayedCount}条搜索结果，已添加到消息中`);
        }
      }
    }

    // 从state获取搜索结果（兼容旧格式）
    if (!additionalSystemContent && input.context.state?.searchResult) {
      const searchResult = input.context.state.searchResult;
      if (searchResult.search_enabled && searchResult.systemMessage) {
        additionalSystemContent = `\n\n以下是网络搜索结果，请在思考过程中参考这些最新信息：${searchResult.systemMessage}`;
        Logger.debug('思考节点检测到搜索结果（旧格式），已添加到消息中');
      }
    }

    // 处理图片分析结果（只在不支持多模态时添加）
    if (!supportMultimodal) {
      // 从agentData获取图片分析结果
      if (input.context.agentContent?.data?.imageAnalysis) {
        const imageAnalysis = input.context.agentContent.data.imageAnalysis;
        if (imageAnalysis.analysis) {
          additionalSystemContent += `\n\n以下是图片内容分析结果（请基于这些信息回答用户问题）：\n${imageAnalysis.analysis}`;
          Logger.debug('思考节点检测到图片分析结果（agentData），已添加到消息中');
        }
      }

      // 从state获取图片分析结果（备选方案）
      if (input.context.state?.imageAnalysisResult) {
        const imageResult = input.context.state.imageAnalysisResult;
        if (imageResult.imageDescription) {
          // 提取描述文本
          const descriptionText =
            typeof imageResult.imageDescription === 'string'
              ? imageResult.imageDescription
              : imageResult.imageDescription?.relevantContent || null;

          if (descriptionText && !additionalSystemContent.includes(descriptionText)) {
            additionalSystemContent += `\n\n以下是图片内容分析结果（请基于这些信息回答用户问题）：\n${descriptionText}`;
            Logger.debug('思考节点检测到图片分析结果（state），已添加到消息中');
          }
        }
      }
    } else {
      Logger.debug('思考模型支持多模态，跳过添加图片分析结果到系统消息');
    }

    // 如果有额外的系统消息，添加到消息中
    if (additionalSystemContent) {
      const systemMessageIndex = processedMessages.findIndex(msg => msg.role === 'system');
      if (systemMessageIndex >= 0) {
        processedMessages[systemMessageIndex].content += additionalSystemContent;
      } else {
        processedMessages.unshift({
          role: 'system',
          content: `你是一个深度思考助手。${additionalSystemContent}`,
        });
      }
    }

    return processedMessages;
  }

  /**
   * 执行思考流
   */
  private async executeThinking(messages: any[], config: any, input: NodeInput): Promise<any> {
    const correctedUrl = await correctApiBaseUrl(config.url);
    const openai = new OpenAI({
      apiKey: config.key,
      baseURL: correctedUrl,
      timeout: config.timeout || 60000,
    });

    Logger.debug(`思考流请求 - 模型: ${config.model}, 消息数: ${messages.length}`);

    // 构建请求配置
    const requestConfig: any = {
      model: config.model,
      messages: messages,
      stream: true,
      ...config.additionalParams,
    };
    normalizeReasoningContentForModel(
      requestConfig.messages,
      config.model,
      config.additionalParams,
      'ThinkingNode',
    );

    const stream = await openai.chat.completions.create(requestConfig, {
      signal: input.context.abortController?.signal,
    });

    // 处理思考流
    let fullContent = '';
    let fullReasoningContent = '';
    let contentArray: any[] = [];
    let reasoningArray: any[] = [];
    let actualUsage: any = null; // 用于存储API返回的实际token使用量

    // @ts-ignore
    for await (const chunk of stream) {
      if (input.context.abortController?.signal.aborted) {
        break;
      }

      const delta = chunk.choices[0]?.delta;
      const content = delta?.content;
      const reasoningContent = (delta as any)?.reasoning_content || '';

      // 检查是否有usage信息
      if (chunk.usage) {
        actualUsage = chunk.usage;
        Logger.debug(`[thinking] 获取到API返回的token使用量: ${JSON.stringify(actualUsage)}`);
      }

      if (reasoningContent) {
        // 处理原生推理内容
        reasoningArray = [{ type: 'text', text: reasoningContent }];
        fullReasoningContent += reasoningContent;

        // 发送推理内容流
        this.sendStream(input, {
          type: 'data',
          data: {
            nodeType: 'thinking',
            status: 'reasoning',
            reasoning_content: reasoningArray,
            full_reasoning_content: fullReasoningContent,
          },
        });
      } else if (content) {
        // 处理 <think> 标签格式的思考内容
        if (content.includes('<think>')) {
          const thinkContent = content.replace(/<think>/, '');
          if (thinkContent) {
            reasoningArray = [{ type: 'text', text: thinkContent }];
            fullReasoningContent += thinkContent;

            this.sendStream(input, {
              type: 'data',
              data: {
                nodeType: 'thinking',
                status: 'reasoning',
                reasoning_content: reasoningArray,
                full_reasoning_content: fullReasoningContent,
              },
            });
          }
        } else if (content.includes('</think>')) {
          const regex = /([\s\S]*?)<\/think>([\s\S]*)/;
          const matches = content.match(regex);
          if (matches) {
            const thinkContent = matches[1] || '';
            if (thinkContent) {
              fullReasoningContent += thinkContent;
              reasoningArray = [{ type: 'text', text: thinkContent }];

              this.sendStream(input, {
                type: 'data',
                data: {
                  nodeType: 'thinking',
                  status: 'reasoning',
                  reasoning_content: reasoningArray,
                  full_reasoning_content: fullReasoningContent,
                },
              });
            }
          }
        } else if (fullReasoningContent.length > 0 && !content.includes('</think>')) {
          // 继续收集 <think> 标签内的内容
          fullReasoningContent += content;
          reasoningArray = [{ type: 'text', text: content }];

          this.sendStream(input, {
            type: 'data',
            data: {
              nodeType: 'thinking',
              status: 'reasoning',
              reasoning_content: reasoningArray,
              full_reasoning_content: fullReasoningContent,
            },
          });
        }
      }
    }

    // 记录 Token 使用情况
    const inputText = messages.map(m => `${m.role}: ${m.content || ''}`).join('\n');
    const outputText = fullReasoningContent + fullContent;
    await this.recordTokenUsage(input, inputText, outputText, '深度思考', actualUsage);

    return {
      content: contentArray,
      full_content: fullContent,
      reasoning_content: reasoningArray,
      full_reasoning_content: fullReasoningContent,
    };
  }

  /**
   * 格式化思考结果为系统消息
   */
  private formatThinkingSystemMessage(reasoningContent: string): string {
    if (!reasoningContent) {
      return '';
    }

    return `\n\n以下是针对这个问题的思考推理思路（思路不一定完全正确，仅供参考）：\n${reasoningContent}`;
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(): NodeOutput {
    const emptyState = {
      thinking_enabled: false,
      systemMessage: '',
      reasoning_content: undefined,
      full_reasoning_content: '',
      skipped: true,
    };

    return {
      result: {
        success: true,
        data: emptyState,
        metadata: {
          skipped: true,
          reason: 'condition_not_met',
        },
      },
      stateUpdates: {
        thinkingResult: emptyState,
        sharedState: emptyState,
      },
    };
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: string): NodeOutput {
    return {
      result: {
        success: false,
        error,
      },
      stateUpdates: {
        thinkingResult: {
          thinking_enabled: false,
          error,
        },
      },
    };
  }
}
