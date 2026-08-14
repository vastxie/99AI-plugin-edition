import { Injectable, Logger } from '@nestjs/common';
import { BadWordsService } from '../../badWords/badWords.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';

/**
 * 敏感词过滤节点 - 使用新架构
 * 检测和过滤AI生成内容中的敏感词
 */
@Injectable()
export class SensitiveFilterNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'sensitive_filter',
    type: 'sensitive_filter',
    name: '敏感词过滤节点',
    description: '检测和过滤AI生成内容中的敏感词，保护内容安全',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    private readonly badWordsService: BadWordsService,
  ) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    // 获取要过滤的内容
    const originalContent = this.extractContent(input);
    if (!originalContent) {
      Logger.warn('没有找到要过滤的内容');
      return this.createSkippedResult('no_content');
    }

    // 发送开始状态 - SensitiveFilterNode 不需要发送操作状态
    // this.sendStream(input, {
    //   type: 'status',
    //   status: 'filtering',
    //   content: input.config.progressMessages?.start || '检查敏感词...',
    // });

    try {
      // 获取用户ID（游客使用指纹ID，注册用户使用真实ID）
      const userId = input.context.options?.userId;

      // 检查敏感词
      const triggeredWords = await this.badWordsService.checkBadWords(originalContent, userId);

      let filteredContent = originalContent;
      let hasFiltered = false;

      if (triggeredWords.length > 0) {
        // 发送处理中状态 - SensitiveFilterNode 不需要发送操作状态
        // this.sendStream(input, {
        //   type: 'status',
        //   status: 'processing',
        //   content:
        //     input.config.progressMessages?.processing ||
        //     `已检测到 ${triggeredWords.length} 个敏感词`,
        // });

        // 构造正则表达式来匹配所有敏感词，转义特殊字符防止 ReDoS
        const escapedWords = triggeredWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(escapedWords.join('|'), 'gi');

        // 使用回调函数替换敏感词，每个敏感词替换为相应长度的 *
        filteredContent = originalContent.replace(regex, (matched: string) =>
          '*'.repeat(matched.length),
        );

        hasFiltered = true;

        // 发送敏感词检测数据流 - SensitiveFilterNode 不需要发送操作状态
        // this.sendStream(input, {
        //   type: 'data',
        //   data: {
        //     nodeType: 'sensitive_filter',
        //     sensitiveWords: triggeredWords,
        //     filteredCount: triggeredWords.length,
        //     status: 'filtering',
        //   },
        // });
      }

      // 构建过滤状态
      const filterState = {
        filteredContent,
        originalContent,
        sensitiveWords: triggeredWords,
        filtered: hasFiltered,
        skipped: false,
        filterTime: new Date().toISOString(),
      };

      // 发送完成状态 - SensitiveFilterNode 不需要发送操作状态
      // this.sendStream(input, {
      //   type: 'status',
      //   status: 'completed',
      //   content:
      //     input.config.progressMessages?.end ||
      //     (hasFiltered
      //       ? `敏感词过滤完成，已过滤 ${triggeredWords.length} 个敏感词`
      //       : '内容检查通过'),
      // });

      // 向后兼容的完成回调 - SensitiveFilterNode 不需要发送状态
      // input.context.onProgress?.({
      //   nodeType: 'sensitive_filter',
      //   status: 'completed',
      //   statusMessage:
      //     input.config.progressMessages?.end || (hasFiltered ? '敏感词过滤完成' : '内容检查通过'),
      //   sensitiveWordsDetected: hasFiltered,
      //   sensitiveWordsCount: triggeredWords.length,
      // });

      // 返回成功结果
      return {
        result: {
          success: true,
          data: filterState,
          metadata: {
            filtered: hasFiltered,
            sensitiveWordCount: triggeredWords.length,
            filterTime: filterState.filterTime,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'filterResult']: filterState,
          // 如果有敏感词过滤，更新共享状态中的内容
          ...(hasFiltered &&
            input.config.updateSharedState && {
              sharedState: {
                ...input.context.state?.sharedState,
                content: filteredContent,
                full_content: filteredContent,
              },
            }),
        },
        agentDataUpdates: {
          sensitiveFilter: {
            triggered: hasFiltered,
            words: triggeredWords,
            originalLength: originalContent.length,
            filteredLength: filteredContent.length,
          },
        },
      };
    } catch (error) {
      Logger.error(`敏感词过滤节点执行失败: ${error.message}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `敏感词过滤失败: ${error.message}`,
      });

      // 返回错误结果，但保持基本结构
      const errorState = {
        filteredContent: originalContent, // 出错时返回原内容
        originalContent,
        sensitiveWords: [],
        filtered: false,
        error: error.message,
        filterTime: new Date().toISOString(),
      };

      return {
        result: {
          success: true, // 即使出错也标记为成功，避免整个工作流失败
          data: errorState,
          metadata: {
            error: error.message,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'filterResult']: errorState,
        },
      };
    }
  }

  /**
   * 从上下文中提取要过滤的内容
   */
  private extractContent(input: NodeInput): string | null {
    // 优先从动态参数获取
    if (input.dynamicParams?.content) {
      return input.dynamicParams.content;
    }

    // 从配置的输入键获取
    const inputKey = input.config.inputKey || 'sharedState';
    const sourceData = input.context.state?.[inputKey] || input.context.state?.sharedState;

    // 尝试获取各种可能的内容字段
    if (sourceData?.filteredContent) {
      return sourceData.filteredContent;
    }
    if (sourceData?.full_content) {
      return sourceData.full_content;
    }
    if (sourceData?.content) {
      return sourceData.content;
    }

    // 从LLM响应中获取
    const llmResponse = input.context.state?.llm_response;
    if (llmResponse) {
      if (llmResponse.full_content) {
        return llmResponse.full_content;
      }
      if (llmResponse.content) {
        return llmResponse.content;
      }
    }

    // 从其他可能的状态中获取
    const chatResponse = input.context.state?.chat_response;
    if (chatResponse) {
      if (chatResponse.full_content) {
        return chatResponse.full_content;
      }
      if (chatResponse.content) {
        return chatResponse.content;
      }
    }

    return null;
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(reason: string): NodeOutput {
    const emptyState = {
      filteredContent: '',
      originalContent: '',
      sensitiveWords: [],
      filtered: false,
      skipped: true,
      skipReason: reason,
    };

    return {
      result: {
        success: true,
        data: emptyState,
        metadata: {
          skipped: true,
          reason,
        },
      },
      stateUpdates: {
        filterResult: emptyState,
      },
    };
  }
}
