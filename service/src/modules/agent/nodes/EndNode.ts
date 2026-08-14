import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';
import { AgentUpdateType } from '../core/AgentContent.types';

/**
 * 通用结束节点 - 使用新架构
 * 负责收集和格式化工作流的最终结果
 */
@Injectable()
export class EndNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'end',
    type: 'end',
    name: '结束节点',
    description: '收集和格式化工作流的最终结果',
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
    // 使用新的增量更新系统发送开始状态（简化版）
    this.sendAgentUpdate(
      input,
      AgentUpdateType.WORKFLOW_STATUS,
      {
        workflowType: input.context.state?.workflowType || 'general',
        nodeId: 'end_node',
        nodeType: 'end',
        nodeStatus: 'collecting',
        nodeMessage: input.config.progressMessages?.start || '收集最终结果...',
      },
      `workflow_end_start_${Date.now()}`,
    );

    try {
      // 收集工作流状态
      const collectedState = this.collectWorkflowState(input);

      // 格式化最终结果
      const finalResult = await this.formatFinalResult(collectedState, input);

      // 验证结果（如果启用）
      if (input.config.validateResult) {
        this.validateResult(finalResult);
      }

      // Token 使用统计汇总
      if (input.context.tokenUsage) {
        Logger.log(
          `📊 工作流Token汇总 - ` +
            `总输入: ${input.context.tokenUsage.totalInputTokens} tokens, ` +
            `总输出: ${input.context.tokenUsage.totalOutputTokens} tokens, ` +
            `总计: ${input.context.tokenUsage.totalTokens} tokens, ` +
            `节点次数: ${input.context.tokenUsage.details.length}次`,
          'EndNode',
        );

        // 如果有 agentContent，添加到其中
        if (input.context.agentContent?.data) {
          input.context.agentContent.data.tokenUsage = input.context.tokenUsage;
        }
      }

      // 发送完成状态（简化版：移除action参数）
      this.sendAgentUpdate(
        input,
        AgentUpdateType.WORKFLOW_STATUS,
        {
          workflowType: input.context.state?.workflowType || 'general',
          nodeId: 'end_node',
          nodeType: 'end',
          nodeStatus: 'completed',
          nodeMessage: input.config.progressMessages?.end || '结果收集完成',
        },
        `workflow_end_${Date.now()}`,
      );

      // 向后兼容的完成回调 - EndNode 不需要发送状态
      // input.context.onProgress?.({
      //   nodeType: 'end',
      //   status: 'completed',
      //   statusMessage: input.config.progressMessages?.end || '结果收集完成',
      // });

      Logger.log(
        `结束节点完成 - 思考内容: ${!!finalResult.reasoning_content}, 回复内容长度: ${
          finalResult.content?.length || 0
        }`,
        'EndNode',
      );

      // 返回成功结果
      return {
        result: {
          success: true,
          data: finalResult,
          metadata: {
            contentLength: finalResult.content?.length || 0,
            hasReasoning: !!finalResult.reasoning_content,
            hasSearch: finalResult.search_enabled,
            hasPPT: !!finalResult.pptData,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'finalResult']: finalResult,
        },
      };
    } catch (error) {
      Logger.error(`结束节点执行失败: ${error.message}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `结果收集失败: ${error.message}`,
      });

      // 返回错误结果，但保持基本结构
      const errorResult = this.createErrorResult(error, input);

      return {
        result: {
          success: true, // 即使出错也标记为成功，避免整个工作流失败
          data: errorResult,
          metadata: {
            error: error.message,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'finalResult']: errorResult,
        },
      };
    }
  }

  /**
   * 收集工作流状态
   */
  private collectWorkflowState(input: NodeInput): any {
    const { state } = input.context;
    const agentData = input.context.agentContent?.data;
    const config = input.config;

    // 首先从 agentContent.data 收集数据（新架构）
    let agentDataState: any = {};
    if (agentData) {
      // 统一从 toolExecutions 收集所有工具执行结果
      if (agentData.toolExecutions && agentData.toolExecutions.length > 0) {
        const toolExecutions = agentData.toolExecutions;

        // 分离不同类型的工具执行
        const searchExecutions = toolExecutions.filter(
          exec =>
            exec.status === 'success' &&
            (exec.name === '联网搜索' || exec.name.toLowerCase().includes('search')),
        );

        const otherToolExecutions = toolExecutions.filter(
          exec =>
            exec.status === 'success' &&
            !(exec.name === '联网搜索' || exec.name.toLowerCase().includes('search')),
        );

        // 处理搜索结果
        if (searchExecutions.length > 0) {
          agentDataState.search_enabled = true;
          agentDataState.images = [];
          agentDataState.networkSearchResult = ''; // 不再需要 summary
        }

        // 处理其他工具结果（MCP等）
        if (otherToolExecutions.length > 0) {
          agentDataState.mcpEnabled = true;
          agentDataState.tool_calls = otherToolExecutions.map(exec => ({
            id: exec.id || `tool_${Date.now()}`,
            type: 'tool_calls',
            tool_calls: [
              {
                id: exec.id || `tool_${Date.now()}`,
                function: {
                  name: exec.name,
                  arguments:
                    typeof exec.input === 'string' ? exec.input : JSON.stringify(exec.input),
                  response:
                    typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output),
                  error: exec.status === 'error' ? exec.output : undefined,
                },
              },
            ],
          }));
          agentDataState.toolCallsRaw = otherToolExecutions;
          agentDataState.mcpHasResults = true;
        }
      }

      // 收集思考结果
      if (agentData.reasoning) {
        agentDataState.thinking_enabled = (agentData.reasoning as any).enabled || true;
        agentDataState.reasoning_content = agentData.reasoning?.content || '';
        agentDataState.thinking_type = (agentData.reasoning as any).type;
        agentDataState.thinking_model = (agentData.reasoning as any).model;
      }

      // 收集文件分析结果
      if (agentData.fileAnalysis) {
        agentDataState.fileAnalysisEnabled = true;
        agentDataState.fileUrl = agentData.fileAnalysis.fileUrl;
      }

      // 收集图片分析结果
      if ((agentData as any).imageAnalysis) {
        agentDataState.imageDescription = (agentData as any).imageAnalysis.analysis;
        agentDataState.imageAnalysisEnabled = true;
        agentDataState.imageUrl = (agentData as any).imageAnalysis.imageUrl;
        agentDataState.videoUrl = (agentData as any).imageAnalysis.videoUrl;
      }

      // 收集自定义数据
      if (agentData.custom) {
        // 问题推荐
        if (agentData.custom.recommendedQuestions) {
          agentDataState.recommendedQuestions = agentData.custom.recommendedQuestions;
          agentDataState.promptReference = agentData.custom.promptReference || '';
          agentDataState.questionGenerated = true;
        }
        // MCP工具结果
        if (agentData.custom.mcpToolResults) {
          agentDataState.mcpToolResults = agentData.custom.mcpToolResults;
        }
      }

      // 收集敏感词过滤结果
      if ((agentData as any).sensitiveFilter) {
        agentDataState.filtered = (agentData as any).sensitiveFilter.triggered;
        agentDataState.sensitiveWords = (agentData as any).sensitiveFilter.words || [];
      }

      // 收集PPT数据
      if (agentData.ppt) {
        agentDataState.pptData = (agentData.ppt as any).data || (agentData.ppt as any).formatted;
        agentDataState.pptOutline = agentData.ppt.outline;
      }
    }

    // 如果指定了收集键，收集并合并指定的键
    if (config.collectKeys && config.collectKeys.length > 0) {
      const merged: any = {
        // 初始化基础字段
        content: '',
        reasoning_content: '',
        thinking_enabled: false,
        llm_executed: false,

        // 初始化搜索字段
        search_enabled: false,
        images: [],
        networkSearchResult: '',

        // 初始化系统消息字段
        thinkingSystemMessage: '',
        searchSystemMessage: '',

        // 初始化敏感词过滤字段
        filteredContent: '',
        originalContent: '',
        sensitiveWords: [],
        filtered: false,

        // 初始化问题推荐字段
        promptReference: '',
        recommendedQuestions: [],
        questionGenerated: false,

        // 初始化Flowith字段
        seeds: [],
        flowithEnabled: false,

        // 初始化PPT字段
        pptData: null,
        pptOutline: null,

        // 合并 agentData 收集的数据
        ...agentDataState,
      };

      // 逐个合并状态键
      for (const key of config.collectKeys) {
        const stateValue = state[key];
        if (stateValue && typeof stateValue === 'object') {
          // 合并内容字段（使用 full_content 组装为最终的 content）
          if (stateValue.full_content) {
            merged.content += stateValue.full_content;
          } else if (stateValue.content && key === 'sharedState') {
            // 如果是 sharedState 并且有 content，也合并进去
            merged.content += stateValue.content;
          }

          // 合并思考内容字段（使用 full_reasoning_content 组装为最终的 reasoning_content）
          if (stateValue.full_reasoning_content) {
            merged.reasoning_content += stateValue.full_reasoning_content;
          } else if (stateValue.reasoning_content && key === 'sharedState') {
            // 如果是 sharedState 并且有 reasoning_content，也合并进去
            merged.reasoning_content += stateValue.reasoning_content;
          }

          // 合并搜索结果字段 - 不再保存 searchResults
          if (stateValue.searchResults && Array.isArray(stateValue.searchResults)) {
            // searchResults 现在由 toolExecutions 管理，不再单独保存
            merged.search_enabled = true; // 如果有搜索结果，标记为已启用搜索
          }
          if (stateValue.images && Array.isArray(stateValue.images)) {
            merged.images = [...merged.images, ...stateValue.images];
          }
          if (stateValue.networkSearchResult) {
            merged.networkSearchResult += stateValue.networkSearchResult;
          }

          // 合并敏感词过滤结果
          if (stateValue.filteredContent !== undefined) {
            merged.filteredContent = stateValue.filteredContent;
            merged.originalContent = stateValue.originalContent || '';
            merged.sensitiveWords = stateValue.sensitiveWords || [];
            merged.filtered = stateValue.filtered || false;
          }

          // 合并问题推荐结果
          if (stateValue.promptReference !== undefined) {
            merged.promptReference = stateValue.promptReference;
            merged.recommendedQuestions = stateValue.recommendedQuestions || [];
            merged.questionGenerated = stateValue.generated || false;
          }

          // 合并Flowith结果
          if (stateValue.seeds && Array.isArray(stateValue.seeds)) {
            merged.seeds = [...merged.seeds, ...stateValue.seeds];
            merged.flowithEnabled = true;
          }

          // 文件分析结果现在通过 toolExecutions 传递

          // 合并PPT数据
          if (stateValue.slides) {
            // 这是一个完整的PPT数据对象
            merged.pptData = stateValue;
            Logger.log(`收集到PPT数据，共${stateValue.slides.length}页`, 'EndNode');
          }
          if (stateValue.outline) {
            // 这是一个PPT大纲对象
            merged.pptOutline = stateValue;
            Logger.log(`收集到PPT大纲，共${stateValue.outline.length}项`, 'EndNode');
          }

          // 合并系统消息字段
          if (stateValue.systemMessage) {
            // 根据节点类型保存不同的系统消息
            if (stateValue.thinking_enabled) {
              merged.thinkingSystemMessage = stateValue.systemMessage;
            }
            if (stateValue.search_enabled) {
              merged.searchSystemMessage = stateValue.systemMessage;
            }
            // 如果 sharedState 中有 systemMessage 但没有特定标志，则作为搜索系统消息
            if (key === 'sharedState' && stateValue.search_enabled) {
              merged.searchSystemMessage = stateValue.systemMessage;
            }
          }

          // 合并标志字段
          if (stateValue.thinking_enabled) {
            merged.thinking_enabled = true;
          }
          if (stateValue.search_enabled) {
            merged.search_enabled = true;
          }
          if (stateValue.llm_executed) {
            merged.llm_executed = true;
          }

          // 保留其他字段（排除 fileVectorResult）
          Object.keys(stateValue).forEach(field => {
            if (
              ![
                'content',
                'full_content',
                'reasoning_content',
                'full_reasoning_content',
                'images',
                'networkSearchResult',
                'systemMessage',
                'filteredContent',
                'originalContent',
                'sensitiveWords',
                'filtered',
                'promptReference',
                'recommendedQuestions',
                'generated',
                'seeds',
                // 文件分析结果通过 toolExecutions 传递
              ].includes(field)
            ) {
              merged[field] = stateValue[field];
            }
          });
        }
      }

      return merged;
    }

    // 默认收集所有状态，优先使用sharedState，同时转换字段名
    const rawState = state.sharedState || state;

    // 处理敏感词过滤结果（如果有的话）
    const filterResult = state.filterResult;
    const questionResult = state.questionResult;
    const flowithResult = state.flowithResult;
    const pptData = state.pptData;
    const pptOutline = state.pptOutline;

    const finalState = {
      // 先合并 agentData 收集的数据作为基础
      ...agentDataState,
      // 然后合并原始状态
      ...rawState,
      // 转换字段名：使用简化的字段名
      content: agentDataState.content || rawState.full_content || rawState.content || '',
      reasoning_content:
        agentDataState.reasoning_content ||
        rawState.full_reasoning_content ||
        rawState.reasoning_content ||
        '',
      // 搜索相关字段保持原样（优先使用 agentData）
      search_enabled: agentDataState.search_enabled || rawState.search_enabled || false,
      images: agentDataState.images?.length > 0 ? agentDataState.images : rawState.images || [],
      networkSearchResult: agentDataState.networkSearchResult || rawState.networkSearchResult || '',
      // 系统消息字段处理
      thinkingSystemMessage:
        rawState.thinking_enabled && rawState.systemMessage ? rawState.systemMessage : '',
      searchSystemMessage:
        rawState.search_enabled && rawState.systemMessage ? rawState.systemMessage : '',
      // 敏感词过滤字段（优先使用 agentData）
      filteredContent: agentDataState.filteredContent || filterResult?.filteredContent || '',
      originalContent: agentDataState.originalContent || filterResult?.originalContent || '',
      sensitiveWords:
        agentDataState.sensitiveWords?.length > 0
          ? agentDataState.sensitiveWords
          : filterResult?.sensitiveWords || [],
      filtered:
        agentDataState.filtered !== undefined
          ? agentDataState.filtered
          : filterResult?.filtered || false,
      // 问题推荐字段（优先使用 agentData）
      promptReference: agentDataState.promptReference || questionResult?.promptReference || '',
      recommendedQuestions:
        agentDataState.recommendedQuestions?.length > 0
          ? agentDataState.recommendedQuestions
          : questionResult?.recommendedQuestions || [],
      questionGenerated:
        agentDataState.questionGenerated !== undefined
          ? agentDataState.questionGenerated
          : questionResult?.generated || false,
      // Flowith特殊字段
      seeds: flowithResult?.seeds || [],
      flowithEnabled: !!flowithResult && !flowithResult.skipped,

      // PPT相关字段（优先使用 agentData）
      pptData: agentDataState.pptData || pptData || null,
      pptOutline: agentDataState.pptOutline || pptOutline || null,

      // 删除旧的字段名
      full_content: undefined,
      full_reasoning_content: undefined,
    };

    return finalState;
  }

  /**
   * 格式化最终结果
   */
  private async formatFinalResult(collectedState: any, input: NodeInput): Promise<any> {
    const { options } = input.context;
    const config = input.config;

    // 基础结果结构
    const baseResult = {
      chatId: options.chatId || `workflow-${Date.now()}`,
      finishReason: collectedState.finishReason || 'stop',
      model: options.model || 'unknown',
      modelName: options.modelName || 'Workflow Engine',
      errMsg: '',
    };

    // 根据格式类型处理
    switch (config.resultFormat) {
      case 'content_only':
        return {
          ...baseResult,
          content: collectedState.content || '',
        };

      case 'thinking_only':
        return {
          ...baseResult,
          reasoning_content: collectedState.reasoning_content || '',
        };

      case 'custom':
        // TODO: 如果需要自定义格式化，可以在这里实现
        return this.applyCustomFormat(config.customFormatter, collectedState, baseResult);

      case 'full':
      default:
        // 完整格式（默认）
        return {
          ...baseResult,

          // 内容字段
          content: collectedState.content || '',

          // 思考内容字段
          reasoning_content: collectedState.reasoning_content || '',

          // 搜索相关字段
          search_enabled: collectedState.search_enabled || false,
          images: collectedState.images || [],
          networkSearchResult: collectedState.networkSearchResult || '',

          // 系统消息字段
          thinkingSystemMessage: collectedState.thinkingSystemMessage || '',
          searchSystemMessage: collectedState.searchSystemMessage || '',

          // 敏感词过滤字段
          filteredContent: collectedState.filteredContent || '',
          originalContent: collectedState.originalContent || '',
          sensitiveWords: collectedState.sensitiveWords || [],
          filtered: collectedState.filtered || false,

          // 问题推荐字段
          promptReference: collectedState.promptReference || '',
          recommendedQuestions: collectedState.recommendedQuestions || [],
          questionGenerated: collectedState.questionGenerated || false,

          // 文件分析字段
          fileAnalysisEnabled: collectedState.fileAnalysisEnabled || false,
          fileUrl: collectedState.fileUrl || '',

          // 图片分析字段
          imageDescription: collectedState.imageDescription || null,
          imageAnalysisEnabled: collectedState.imageAnalysisEnabled || false,
          imageUrl: collectedState.imageUrl || '',
          videoUrl: collectedState.videoUrl || '',

          // MCP工具调用字段
          mcpToolResults: collectedState.mcpToolResults || '',
          tool_calls: collectedState.tool_calls || [],
          toolCallsRaw: collectedState.toolCallsRaw || [],
          mcpEnabled: collectedState.mcpEnabled || false,
          mcpHasResults: collectedState.mcpHasResults || false,

          // Flowith相关字段
          seeds: collectedState.seeds || [],
          flowithEnabled: collectedState.flowithEnabled || false,

          // PPT相关字段
          pptData: collectedState.pptData || null,
          pptOutline: collectedState.pptOutline || null,

          // Token 使用统计
          tokenUsage: input.context.tokenUsage || null,
          totalTokens: input.context.tokenUsage?.totalTokens || 0,

          // 状态标志
          thinking_enabled: collectedState.thinking_enabled || false,
          thinking_type: collectedState.thinking_type,
          thinking_model: collectedState.thinking_model,
          llm_executed: collectedState.llm_executed || false,

          // agentData (包含toolExecutions等重要数据)
          agentData: input.context.agentContent?.data || {},

          // 工作流状态（始终包含，用于调试和数据库存储）
          _workflowState: collectedState,
          _executionContext: {
            model: options.model,
            chatId: options.chatId,
            timestamp: new Date().toISOString(),
            agentData: input.context.agentContent?.data || {},
          },

          // 元数据（如果启用了额外元数据）
          ...(config.includeMeta && {
            _nodeExecutionOrder: input.context.state._nodeExecutionOrder || [],
            _executionDuration: input.context.state._executionDuration || 0,
          }),
        };
    }
  }

  /**
   * 应用自定义格式化（预留扩展）
   */
  private applyCustomFormat(
    customFormatter: string | undefined,
    collectedState: any,
    baseResult: any,
  ): any {
    if (!customFormatter) {
      // 检查是否为PPT工作流
      if (collectedState.pptData) {
        Logger.log('检测到PPT工作流结果，应用PPT格式化', 'EndNode');
        return this.formatPPTResult(collectedState, baseResult);
      }

      Logger.warn('自定义格式化器未指定，使用默认格式', 'EndNode');
      return { ...baseResult, ...collectedState };
    }

    // TODO: 可以在这里实现动态格式化逻辑
    Logger.warn(`自定义格式化器 ${customFormatter} 尚未实现，使用默认格式`);
    return { ...baseResult, ...collectedState };
  }

  /**
   * 格式化PPT工作流结果
   */
  private formatPPTResult(collectedState: any, baseResult: any): any {
    const pptData = collectedState.pptData;
    const pptOutline = collectedState.pptOutline;

    return {
      ...baseResult,
      // 将PPT数据作为JSON字符串存储在content中，以便前端解析
      content: JSON.stringify({
        pptData: pptData,
        pptOutline: pptOutline,
      }),

      // PPT特定数据也单独传递，用于流式传输
      pptData: pptData,
      pptOutline: pptOutline,
      isPPTWorkflow: true,

      // 工作流执行状态
      workflowCompleted: true,

      // 保留原始状态供调试
      _workflowState: collectedState,
    };
  }

  /**
   * 验证结果完整性
   */
  private validateResult(result: any): void {
    const errors: string[] = [];

    // 基本字段验证
    if (!result.chatId) errors.push('缺少chatId字段');
    if (!result.model) errors.push('缺少model字段');
    if (result.content === undefined) errors.push('缺少content字段');

    // 如果启用了思考，验证思考相关字段
    if (result.thinking_enabled) {
      if (!result.reasoning_content) {
        errors.push('思考已启用但缺少思考内容');
      }
    }

    // 如果有错误，记录警告但不中断执行
    if (errors.length > 0) {
      Logger.warn(`结果验证发现问题: ${errors.join(', ')}`);
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: any, input: NodeInput): any {
    return {
      chatId: input.context.options.chatId || `error - ${Date.now()}`,
      finishReason: 'error',
      model: input.context.options.model || 'unknown',
      modelName: input.context.options.modelName || 'Workflow Engine',
      errMsg: error.message || '结束节点处理失败',
      content: '',
      reasoning_content: '',
      thinking_enabled: false,
      llm_executed: false,
    };
  }
}
