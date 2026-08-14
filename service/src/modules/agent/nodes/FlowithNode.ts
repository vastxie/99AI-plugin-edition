import { handleError } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';

/**
 * Flowith节点 - 使用新架构
 * 直接集成Flowith API调用，处理特殊的流式响应格式
 */
@Injectable()
export class FlowithNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'flowith',
    type: 'flowith',
    name: 'Flowith节点',
    description: '集成Flowith知识库搜索和AI对话功能',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(protected readonly globalConfigService: GlobalConfigService) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    Logger.log('开始执行Flowith节点');

    // 发送开始状态
    this.sendStream(input, {
      type: 'status',
      status: 'starting',
      content: input.config.progressMessages?.start || '开始Flowith处理...',
    });

    try {
      // 检查启用条件
      if (
        input.config.enableCondition &&
        !this.evaluateCondition(input.config.enableCondition, input)
      ) {
        Logger.debug('Flowith节点条件不满足，跳过执行');

        const emptyState = {
          content: '',
          full_content: '',
          seeds: [],
          fileVectorResult: '',
          finishReason: null,
          skipped: true,
        };

        return {
          result: {
            success: true,
            data: emptyState,
            metadata: {
              skipped: true,
              reason: '条件不满足',
            },
          },
          stateUpdates: {
            [input.config.outputKey || 'flowithResult']: emptyState,
          },
          agentDataUpdates: {
            flowith: emptyState,
          },
        };
      }

      // 准备Flowith输入参数
      const flowithInputs = this.prepareFlowithInputs(input);

      // 执行Flowith聊天
      const flowithResult = await this.flowithChat(input.messages, flowithInputs, input);

      // 发送完成状态
      this.sendStream(input, {
        type: 'status',
        status: 'completed',
        content:
          input.config.progressMessages?.end ||
          `Flowith处理完成，生成内容长度: ${flowithResult.full_content.length}字符`,
      });

      // 构建流式agent_content（向后兼容）
      const finalAgentContent = {
        metadata: {
          type: 'streaming',
          workflowId: input.context.workflowId,
          nodeExecutionId: input.context.currentNodeExecutionId,
          nodeExecutionSequence: input.context.nodeExecutionSequence,
          timestamp: new Date().toISOString(),
          nodeType: 'flowith',
        },
        data: {
          flowith: flowithResult,
        },
      };

      // 向后兼容的完成回调
      input.context.onProgress?.({
        nodeType: 'flowith',
        status: 'completed',
        statusMessage:
          input.config.progressMessages?.end ||
          `Flowith处理完成，生成内容长度: ${flowithResult.full_content.length}字符`,
        agent_content: JSON.stringify(finalAgentContent),
      });

      Logger.log(
        `Flowith节点完成 - 内容长度: ${flowithResult.full_content.length}, Seeds数量: ${
          flowithResult.seeds?.length || 0
        }`,
      );

      // 返回成功结果
      return {
        result: {
          success: true,
          data: flowithResult,
          metadata: {
            contentLength: flowithResult.full_content.length,
            seedsCount: flowithResult.seeds?.length || 0,
            hasFileVector: !!flowithResult.fileVectorResult,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'flowithResult']: flowithResult,
          // 兼容性字段
          content: flowithResult.full_content,
          fileVectorResult: flowithResult.fileVectorResult,
        },
        agentDataUpdates: {
          flowith: flowithResult,
          // 如果有文件向量结果，也存储到fileAnalysis
          ...(flowithResult.fileVectorResult
            ? {
                fileAnalysis: {
                  ...input.context.agentContent?.data?.fileAnalysis,
                  flowithVector: flowithResult.fileVectorResult,
                },
              }
            : {}),
        },
      };
    } catch (error) {
      Logger.error(`Flowith节点执行失败: ${error.message}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `Flowith节点执行失败: ${error.message}`,
      });

      const errorState = {
        content: '',
        full_content: '',
        seeds: [],
        fileVectorResult: '',
        finishReason: null,
        error: error.message,
        skipped: false,
      };

      // 触发错误回调
      input.context.onError?.(error);

      return {
        result: {
          success: false,
          error: error.message,
        },
        stateUpdates: {
          [input.config.outputKey || 'flowithResult']: errorState,
        },
      };
    }
  }

  /**
   * Flowith聊天实现（从FlowithService迁移）
   */
  private async flowithChat(
    messagesHistory: any,
    inputs: {
      chatId: any;
      maxModelTokens?: any;
      apiKey: any;
      model: any;
      modelName: any;
      temperature: any;
      modelType?: any;
      flowithId?: any;
      flowithName?: any;
      prompt?: any;
      imageUrl?: any;
      isFileUpload: any;
      timeout: any;
      proxyUrl: any;
      modelAvatar?: any;
      usingDeepThinking?: boolean;
      deepThinkingModel?: string;
      deepThinkingUrl?: string;
      deepThinkingKey?: string;
      abortController: AbortController;
    },
    nodeInput: NodeInput,
  ) {
    const {
      apiKey,
      model,
      proxyUrl,
      modelName,
      timeout,
      chatId,
      modelAvatar,
      temperature,
      abortController,
      flowithId,
      flowithName,
    } = inputs;

    const result: any = {
      chatId: chatId,
      content: [],
      full_content: '',
      seeds: [],
      finishReason: null,
      model: model,
      modelName: modelName,
      errMsg: '',
      modelAvatar: modelAvatar,
      fileVectorResult: '',
    };

    try {
      const url = proxyUrl;

      // 准备请求选项
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: flowithName,
          messages: messagesHistory,
          stream: true,
          temperature,
          kb_list: [flowithId],
        }),
      };

      Logger.debug(`Flowith请求配置: model=${flowithName}, 已配置知识库=${Boolean(flowithId)}`);

      try {
        // 发送请求
        const response = await fetch(url, {
          ...requestOptions,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // 检查流是否可用
        if (!response.body) {
          throw new Error('响应没有可读流');
        }

        // 获取响应的可读流
        const reader = response.body.getReader();
        let buffer = '';
        const decoder = new TextDecoder('utf-8');
        let hasSeeds = false;
        let currentJsonError = 0;
        const maxJsonErrors = 5; // 最大容忍错误数

        // 处理流式响应
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            Logger.debug('流式响应已完成');
            break;
          }

          // 将二进制数据块转换为文本并添加到缓冲区
          buffer += decoder.decode(value, { stream: true });

          // 处理可能包含多个data:行的块
          while (buffer.includes('data:')) {
            const endIndex = buffer.indexOf('\n\n', buffer.indexOf('data:'));
            if (endIndex === -1) break; // 如果没有完整的数据块，等待更多数据

            const dataLine = buffer.substring(buffer.indexOf('data:'), endIndex + 2);
            buffer = buffer.substring(endIndex + 2);

            // 提取JSON部分
            const jsonStr = dataLine.replace('data:', '').trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              Logger.debug(
                `接收到数据: tag=${data.tag}, ${
                  data.tag === 'seeds'
                    ? '参考文章数量=' + (data.content?.length || 0)
                    : '内容长度=' + (data.content ? data.content.length : 0)
                }`,
              );

              // 根据tag类型处理不同的响应
              if (data.tag === 'final' && data.content) {
                // 过滤掉最后的[DONE]标记，但保留其他所有字符（包括换行）
                const cleanedContent = data.content.replace(/\[DONE\]$/, '');

                // 更新结果
                result.full_content += cleanedContent;

                // 发送内容流
                this.sendStream(nodeInput, {
                  type: 'data',
                  data: {
                    nodeType: 'flowith',
                    content: cleanedContent,
                  },
                });

                // 向后兼容的进度通知
                nodeInput.context.onProgress?.({
                  nodeType: 'flowith',
                  status: 'processing',
                  content: [{ type: 'text', text: cleanedContent }],
                });
              } else if (data.tag === 'seeds' && data.content) {
                hasSeeds = true;
                // 处理知识库搜索结果
                const seedsData = data.content;
                result.seeds = seedsData;

                // 构建文件向量搜索结果格式(与fileVectorSearch兼容)
                if (Array.isArray(seedsData) && seedsData.length > 0) {
                  const formattedResults = seedsData.map((item, index) => ({
                    content: item.content || '',
                    similarity: item.nip ? item.nip.toString() : '1.0000',
                    index: index + 1,
                    fileName: item.source_title || '未知文档',
                    fileUrl: item.source_id || '',
                  }));

                  // 创建与fileVectorSearch结果格式兼容的对象
                  const fileVectorResult = {
                    relevantContent: seedsData.map(item => item.content || '').join('\n\n'),
                    formattedResults: formattedResults,
                    similarities: seedsData.map(item => (item.nip ? parseFloat(item.nip) : 1.0)),
                    isFullText: false,
                  };

                  // 将对象转换为JSON字符串
                  const fileVectorResultStr = JSON.stringify(fileVectorResult, null, 2);

                  // 更新结果
                  result.fileVectorResult = fileVectorResultStr;

                  // 发送文件向量搜索结果流
                  this.sendStream(nodeInput, {
                    type: 'data',
                    data: {
                      nodeType: 'flowith',
                      fileVectorResult: fileVectorResultStr,
                      seeds: seedsData,
                    },
                  });

                  // 向后兼容的进度通知
                  nodeInput.context.onProgress?.({
                    nodeType: 'flowith',
                    status: 'processing',
                    fileVectorResult: fileVectorResultStr,
                  });
                }
              } else if (data.tag === 'searching' && data.content) {
                // 处理搜索状态更新
                this.sendStream(nodeInput, {
                  type: 'status',
                  status: 'processing',
                  content: data.content,
                });

                // 向后兼容的进度通知
                nodeInput.context.onProgress?.({
                  nodeType: 'flowith',
                  status: 'processing',
                  statusMessage: data.content,
                  content: [{ type: 'text', text: data.content }],
                });
              }
            } catch (error) {
              currentJsonError++;
              // 限制错误日志数量
              if (currentJsonError <= maxJsonErrors) {
                Logger.warn(`解析JSON失败: ${jsonStr.substring(0, 100)}...`);
              } else if (currentJsonError === maxJsonErrors + 1) {
                Logger.warn(`已达到最大错误日志数量(${maxJsonErrors})，后续错误将不再记录`);
              }
            }
          }
        }

        // 处理剩余的buffer中可能有的不完整数据
        if (buffer.trim()) {
          Logger.debug(`剩余未处理的buffer长度: ${buffer.length}`);
          if (buffer.includes('data:')) {
            try {
              const jsonStr = buffer.replace('data:', '').trim();
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                // 处理最后一个数据块
                if (data.tag === 'final' && data.content) {
                  const cleanedContent = data.content.replace(/\[DONE\]$/, '');
                  result.full_content += cleanedContent;

                  // 发送最后的内容流
                  this.sendStream(nodeInput, {
                    type: 'data',
                    data: {
                      nodeType: 'flowith',
                      content: cleanedContent,
                    },
                  });

                  nodeInput.context.onProgress?.({
                    nodeType: 'flowith',
                    status: 'processing',
                    content: [{ type: 'text', text: cleanedContent }],
                  });
                }
              }
            } catch (error) {
              Logger.warn(`处理剩余buffer时出错: ${handleError(error)}`);
            }
          }
        }

        // 确保最后的内容被处理完成
        decoder.decode(); // 刷新解码器缓冲区

        // 处理完成
        result.finishReason = 'stop';
        Logger.log(`流式处理完成，最终结果长度: ${result.full_content.length}字符`);

        return result;
      } catch (error) {
        if (error instanceof Error) {
          Logger.error(`Flowith请求失败: ${error.name} - ${error.message}`);
          if (error.stack) {
            Logger.debug(`错误堆栈: ${error.stack}`);
          }
        } else {
          Logger.error(`Flowith请求失败: ${handleError(error)}`);
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = handleError(error);
      // 如果是用户主动中断（返回空字符串），不记录错误也不设置错误消息
      if (errorMessage) {
        Logger.error(`Flowith对话请求失败: ${errorMessage}`);
        result.errMsg = errorMessage;
      } else {
        Logger.debug('Flowith对话被用户主动中断');
      }
      return result;
    }
  }

  /**
   * 准备Flowith输入参数
   */
  private prepareFlowithInputs(input: NodeInput): any {
    const options = input.context.options;

    return {
      chatId: options.chatId,
      maxModelTokens: options.maxTokens,
      apiKey: options.apiKey,
      model: options.model,
      modelName: options.modelName,
      temperature: options.temperature || 0.7,
      modelType: 1, // Flowith通常是聊天类型
      flowithId: input.config.flowithId || options.flowithId,
      flowithName: input.config.flowithName || options.flowithName || options.model,
      prompt: this.extractUserPrompt(input.messages),
      imageUrl: options.imageUrl,
      isFileUpload: options.isFileUpload || 0,
      timeout: options.timeout || 300,
      proxyUrl: options.proxyUrl,
      modelAvatar: options.modelAvatar,
      usingDeepThinking: false, // Flowith不需要深度思考
      abortController: input.context.abortController || new AbortController(),
    };
  }

  /**
   * 从消息历史中提取用户提示词
   */
  private extractUserPrompt(messages: any[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content;
        }
        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'text' && item.text) {
              return item.text;
            }
          }
        }
      }
    }
    return '';
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(condition: string, input: NodeInput): boolean {
    try {
      const options = input.context.options;

      // 支持简单的条件评估
      if (condition.includes('options.model')) {
        if (condition === 'options.model && options.model.includes("flowith")') {
          return options.model && options.model.includes('flowith');
        }
        if (condition === 'options.model.includes("flowith")') {
          return options.model && options.model.includes('flowith');
        }
        if (condition === 'options.model === "flowith"') {
          return options.model === 'flowith';
        }
      }

      // 检查动态参数
      if (input.dynamicParams?.enableFlowith !== undefined) {
        return !!input.dynamicParams.enableFlowith;
      }

      // 更复杂的条件评估可以在这里扩展
      Logger.debug(`不支持的Flowith条件表达式: ${condition}`);
      return false;
    } catch (error) {
      Logger.warn(`Flowith条件评估失败: ${condition}，错误: ${error.message}`);
      return false;
    }
  }
}
