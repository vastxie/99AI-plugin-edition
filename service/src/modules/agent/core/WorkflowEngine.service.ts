import { Injectable, Logger } from '@nestjs/common';
import { allWorkflows } from '../workflows';
import { NodeExecutor } from './NodeExecutor.service';
import { ExecutionContext, WorkflowConfig } from './types';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { EndNode } from '../nodes/EndNode';

/**
 * 节点ID到中文名称的映射
 */
const NODE_NAME_MAP: Record<string, string> = {
  file_analyzer: '文件分析',
  image_analyzer: '图片分析',
  tool_handler: '工具调用',
  unified_ppt: 'PPT生成',
  document_editor: '文档编辑',
  thinking_analyzer: '深度思考',
  ai_responder: 'AI回复',
  sensitive_filter: '敏感词过滤',
  question_generator: '问题推荐',
  result_formatter: '结果整理',
  flowith_processor: 'Flowith处理',
};

/**
 * 获取节点的中文名称
 */
function getNodeDisplayName(nodeId: string): string {
  return NODE_NAME_MAP[nodeId] || nodeId;
}

/**
 * 简化版工作流引擎服务
 * 负责加载工作流配置、执行工作流（暂时使用顺序执行，后续可升级为LangGraph）
 */
@Injectable()
export class WorkflowEngine {
  private workflowConfigs: Map<string, WorkflowConfig> = new Map();
  private config: any = {};

  constructor(
    private readonly nodeExecutor: NodeExecutor,
    private readonly globalConfigService: GlobalConfigService,
  ) {
    this.loadWorkflowConfigs();
  }

  /**
   * 评估条件表达式
   * @param condition 条件表达式字符串，例如 'options.pluginParam === "ppt-generation"'
   * @param context 执行上下文
   * @returns 条件是否满足
   */
  private evaluateCondition(condition: string, context: ExecutionContext): boolean {
    const options = context.options || {};
    const evaluators: Record<string, () => boolean> = {
      'options.model && options.model.includes("flowith")': () =>
        typeof options.model === 'string' && options.model.includes('flowith'),
      '(options.fileUrl && options.fileUrl.length > 0) && (options.isFileUpload === 2 || options.useKnowledgeBase === true)':
        () =>
          Boolean(options.fileUrl?.length) &&
          (options.isFileUpload === 2 || options.useKnowledgeBase === true),
      'options.imageUrl && options.imageUrl.length > 0 && (options.isImageUpload === 3 || (options.usingDeepThinking === true && options.deepThinkingType !== 3 && options.deepThinkingType !== 4))':
        () =>
          Boolean(options.imageUrl?.length) &&
          (options.isImageUpload === 3 ||
            (options.usingDeepThinking === true &&
              options.deepThinkingType !== 3 &&
              options.deepThinkingType !== 4)),
      'options.usingTool === true': () => options.usingTool === true,
      'options.pluginParam === "ppt-generation"': () =>
        options.pluginParam === 'ppt-generation',
      'options.editorContent && options.editorContent.markdown': () =>
        Boolean(options.editorContent?.markdown),
      'options.usingDeepThinking === true && options.pluginParam !== "ppt-generation"': () =>
        options.usingDeepThinking === true && options.pluginParam !== 'ppt-generation',
      'options.pluginParam !== "ppt-generation"': () =>
        options.pluginParam !== 'ppt-generation',
      'options.isSensitiveWordFilter === true && options.pluginParam !== "ppt-generation"': () =>
        options.isSensitiveWordFilter === true && options.pluginParam !== 'ppt-generation',
      'options.isGeneratePromptReference === true && options.pluginParam !== "ppt-generation"':
        () =>
          options.isGeneratePromptReference === true &&
          options.pluginParam !== 'ppt-generation',
    };

    const evaluator = evaluators[condition];
    if (!evaluator) {
      Logger.warn(`不支持的工作流条件表达式: "${condition}"`, 'WorkflowEngine');
      return false;
    }

    return evaluator();
  }

  /**
   * 加载所有工作流配置
   */
  private loadWorkflowConfigs(): void {
    try {
      // 直接从代码中加载工作流配置
      for (const config of allWorkflows) {
        try {
          // 验证配置
          this.validateWorkflowConfig(config);
          this.workflowConfigs.set(config.workflow.id, config);
        } catch (error) {
          Logger.error(
            `加载工作流配置失败 ${config.workflow.id}: ${error.message}`,
            'WorkflowEngine',
          );
        }
      }

      // 打印所有已加载的工作流ID
      // const loadedIds = Array.from(this.workflowConfigs.keys());
      // Logger.log(
      //   `工作流引擎初始化，加载 ${this.workflowConfigs.size} 个工作流: ${loadedIds.join(', ')}`,
      //   'WorkflowEngine',
      // );
    } catch (error) {
      Logger.error(`加载工作流配置失败: ${error.message}`, 'WorkflowEngine');
    }
  }

  /**
   * 验证工作流配置
   */
  private validateWorkflowConfig(config: WorkflowConfig): void {
    if (!config.workflow) {
      throw new Error('工作流配置缺少 workflow 字段');
    }

    const { workflow } = config;
    if (!workflow.id || !workflow.name || !workflow.version) {
      throw new Error('工作流配置缺少必要字段: id, name, version');
    }

    if (!workflow.nodes || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      throw new Error('工作流配置缺少节点定义');
    }

    if (!workflow.flow || !Array.isArray(workflow.flow) || workflow.flow.length === 0) {
      throw new Error('工作流配置缺少流程定义');
    }

    // 验证节点ID唯一性
    const nodeIds = new Set();
    for (const node of workflow.nodes) {
      if (!node.id || !node.type) {
        throw new Error('节点配置缺少必要字段: id, type');
      }
      if (nodeIds.has(node.id)) {
        throw new Error(`重复的节点ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 验证流程引用的节点存在
    for (const flow of workflow.flow) {
      if (!flow.from || !flow.to) {
        throw new Error('流程配置缺少必要字段: from, to');
      }
      if (flow.from !== 'START' && !nodeIds.has(flow.from)) {
        throw new Error(`流程引用的节点不存在: ${flow.from}`);
      }
      if (flow.to !== 'END' && !nodeIds.has(flow.to)) {
        throw new Error(`流程引用的节点不存在: ${flow.to}`);
      }
    }
  }

  /**
   * 获取工作流配置
   */
  getWorkflowConfig(workflowId: string): WorkflowConfig | undefined {
    return this.workflowConfigs.get(workflowId);
  }

  /**
   * 获取所有工作流配置
   */
  getAllWorkflowConfigs(): WorkflowConfig[] {
    return Array.from(this.workflowConfigs.values());
  }

  /**
   * 获取工作流类型
   */
  private getWorkflowType(workflowId: string): string {
    // 根据工作流ID映射到工作流类型
    const typeMap: Record<string, string> = {
      network_search_workflow: 'search',
      ppt_outline_workflow: 'ppt',
      ppt_content_workflow: 'ppt',
      file_analysis_workflow: 'file',
      image_analysis_workflow: 'image',
      mcp_tool_workflow: 'mcp',
      thinking_workflow: 'reasoning',
    };

    return typeMap[workflowId] || 'general';
  }

  /**
   * 重新加载工作流配置
   */
  reloadWorkflowConfigs(): void {
    this.workflowConfigs.clear();
    this.loadWorkflowConfigs();
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowId: string,
    messagesHistory: any[],
    options: {
      model?: string;
      chatId?: string;
      modelName?: string;
      abortController?: AbortController;
      onProgress?: (data: any) => void;
      onError?: (error: any) => void;
      [key: string]: any;
    } = {},
  ): Promise<any> {
    const startTime = Date.now();
    // 移除开始执行工作流的日志

    // 获取工作流配置
    const config = this.getWorkflowConfig(workflowId);
    if (!config) {
      throw new Error(`工作流配置不存在: ${workflowId}`);
    }

    // 获取全局配置
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiBaseModel = 'gpt-4o-mini',
    } = await this.globalConfigService.getConfigs([
      'openaiBaseKey',
      'openaiBaseUrl',
      'openaiBaseModel',
    ]);

    // 生成工作流执行实例ID
    const workflowExecutionId = `${workflowId}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // 创建执行上下文
    const context: ExecutionContext = {
      workflowId: workflowId, // 设置工作流ID
      workflowExecutionId: workflowExecutionId, // 设置执行实例ID
      nodeExecutionSequence: 0, // 初始化节点执行序号
      nodeExecutions: [], // 初始化节点执行记录
      messages: [...messagesHistory],
      options: {
        ...options,
        model: options.model || config.workflow.config?.defaultModel || openaiBaseModel,
        // 优先使用传递过来的apiKey和proxyUrl，如果没有则使用全局配置
        apiKey: options.apiKey || openaiBaseKey,
        proxyUrl: options.proxyUrl || openaiBaseUrl,
        openaiBaseModel, // 添加工具模型配置
        openaiBaseUrl, // 添加基础URL配置
        openaiBaseKey, // 添加基础密钥配置
      },
      state: {
        // 设置工作流类型
        workflowType: this.getWorkflowType(workflowId),
        // 如果是PPT内容生成工作流，需要预先设置大纲数据
        ...(options.pptOutline ? { pptOutline: options.pptOutline } : {}),
        // 如果有选中的主题，也需要传递
        ...(options.selectedTheme ? { selectedTheme: options.selectedTheme } : {}),
        // 传递action参数，用于判断生成模式
        ...(options.action ? { action: options.action } : {}),
      },
      // 初始化Agent数据收集器 - 使用正确的嵌套结构
      agentContent: {
        metadata: {
          version: '1.0.0',
          type: 'workflow',
          workflowId: workflowId,
          timestamp: new Date().toISOString(),
          status: 'processing',
        },
        data: {
          toolExecutions: [],
          fileAnalysis: {},
          custom: {},
          ppt: null,
          tokenUsage: null, // 将在执行过程中填充
        },
        execution: {
          content: '',
          reasoning_content: '',
          thinking_enabled: false,
          llm_executed: false,
          search_enabled: false,
          images: [],
          thinkingSystemMessage: '',
          searchSystemMessage: '',
          filteredContent: '',
          originalContent: '',
          sensitiveWords: [],
          filtered: false,
          promptReference: '',
          recommendedQuestions: [],
          questionGenerated: false,
          seeds: [],
          flowithEnabled: false,
          fileAnalysisEnabled: false,
          imageDescription: null,
          analysisEnabled: false,
          skipped: false,
          skipReason: '',
          tools: [],
        },
        workflowStatus: {
          status: 'processing',
          nodeStatus: 'starting',
        },
        // 兼容旧代码的字段
        ppt: {} as any,
        fileAnalysis: {},
        reasoning: {},
        custom: {},
      },
      // 初始化Token计数器
      totalTokens: 0,
      // 初始化详细的 Token 使用记录
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
      onProgress: (data: any) => {
        // 如果有累积的完整内容，更新到状态中
        if (data.full_content !== undefined) {
          context.state.tempFullContent = data.full_content;
        }
        if (data.full_reasoning_content !== undefined) {
          context.state.tempFullReasoningContent = data.full_reasoning_content;
        }
        // 调用原始的 onProgress
        options.onProgress?.(data);
      },
      onError: options.onError || (() => {}),
      abortController: options.abortController || new AbortController(),
    };

    // Logger.debug(
    //   `工作流配置 - 模型: ${context.options.model}, 深度思考: ${options.usingDeepThinking}`,
    //   'WorkflowEngine'
    // );

    // 执行工作流中的每个节点
    let lastNodeResult: any = null;
    let currentNodeIndex = 0;

    try {
      for (const nodeConfig of config.workflow.nodes) {
        currentNodeIndex++;
        if (context.abortController.signal.aborted) {
          // 工作流被中止，调用EndNode获取部分结果
          Logger.log(
            `工作流 ${config.workflow.id} 被中止，调用EndNode获取部分结果`,
            'WorkflowEngine',
          );

          try {
            const endNode = new EndNode(this.globalConfigService);
            const endNodeConfig = {
              outputKey: config.workflow.config?.resultKey || 'finalResult',
              progressMessages: {
                start: '收集中断时的部分结果...',
                end: '部分结果收集完成',
              },
            };

            const endNodeResult = await endNode.execute(endNodeConfig, context);

            if (endNodeResult.success && endNodeResult.data) {
              const abortedResult = endNodeResult.data;
              abortedResult.finishReason = 'abort';

              if (context.agentContent?.data) {
                const agentContent = {
                  metadata: {
                    type: 'partial',
                    workflowId: context.workflowId,
                    timestamp: new Date().toISOString(),
                    status: 'interrupted',
                  },
                  data: context.agentContent?.data,
                };
                abortedResult.agent_content = JSON.stringify(agentContent);
              }

              return abortedResult;
            }
          } catch (error) {
            Logger.error(`EndNode执行失败: ${error.message}`, 'WorkflowEngine');
          }

          // 如果 EndNode 执行失败，返回基本结果
          return {
            content: context.state.tempFullContent || context.state.content || '',
            reasoning_content:
              context.state.tempFullReasoningContent || context.state.reasoning_content || '',
            finishReason: 'abort',
            totalTokens: context.totalTokens || 0,
            agent_content: context.agentContent?.data
              ? JSON.stringify({
                  metadata: {
                    type: 'partial',
                    workflowId: context.workflowId,
                    timestamp: new Date().toISOString(),
                    status: 'interrupted',
                  },
                  data: context.agentContent?.data,
                })
              : null,
          };
        }

        // 初始状态日志（稍后会合并）
        const nodeLogInfo = {
          index: currentNodeIndex,
          total: config.workflow.nodes.length,
          id: nodeConfig.id,
          type: nodeConfig.type,
          status: 'pending',
        };
        const nodeStartTime = Date.now();

        // 生成节点执行ID并更新序号
        context.nodeExecutionSequence = (context.nodeExecutionSequence || 0) + 1;
        const nodeExecutionId = `${context.workflowExecutionId}_${String(
          context.nodeExecutionSequence,
        ).padStart(3, '0')}_${nodeConfig.type}`;

        // 记录节点执行信息
        const nodeExecution = {
          nodeExecutionId: nodeExecutionId,
          nodeId: nodeConfig.id,
          nodeType: nodeConfig.type,
          sequence: context.nodeExecutionSequence,
          timestamp: nodeStartTime,
          status: 'executing' as const,
        };

        context.nodeExecutions = context.nodeExecutions || [];
        context.nodeExecutions.push(nodeExecution);

        // 将节点执行ID添加到context中，供节点使用
        context.currentNodeExecutionId = nodeExecutionId;

        // Logger.debug(`  📋 节点执行ID: ${nodeExecutionId}`, 'WorkflowEngine');

        // 检查节点是否应该执行
        if (nodeConfig.config?.enableCondition) {
          const shouldExecute = this.evaluateCondition(nodeConfig.config.enableCondition, context);
          if (!shouldExecute) {
            // 跳过节点，使用中文名称
            const displayName = getNodeDisplayName(nodeConfig.id);
            Logger.log(`跳过执行${displayName}节点`, 'WorkflowEngine');

            // 更新节点执行状态为跳过
            const executedNode = context.nodeExecutions?.find(
              n => n.nodeExecutionId === nodeExecutionId,
            );
            if (executedNode) {
              executedNode.status = 'skipped';
            }

            continue; // 跳过此节点，继续下一个
          }
        }

        // 输出节点开始执行的日志，使用中文名称
        const displayName = getNodeDisplayName(nodeConfig.id);
        Logger.log(`开始执行${displayName}节点`, 'WorkflowEngine');

        // 执行节点
        const nodeResult = await this.nodeExecutor.execute(nodeConfig, context);
        const nodeElapsedTime = Date.now() - nodeStartTime;

        if (!nodeResult.success) {
          const nodeElapsedSeconds = (nodeElapsedTime / 1000).toFixed(1);
          Logger.error(`  ❌ 节点执行失败: ${nodeResult.error}`, 'WorkflowEngine');
          Logger.error(`  - 耗时: ${nodeElapsedSeconds}s`, 'WorkflowEngine');
          throw new Error(`节点 ${nodeConfig.id} 执行失败: ${nodeResult.error}`);
        }

        // 更新状态
        if (nodeResult.stateUpdates) {
          const updateKeys = Object.keys(nodeResult.stateUpdates);
          // Logger.debug(`  📝 状态更新: ${updateKeys.join(', ')}`, 'WorkflowEngine');
          Object.assign(context.state, nodeResult.stateUpdates);
        }

        // 更新agentData（处理节点返回的agentDataUpdates）
        if (nodeResult.agentDataUpdates) {
          const agentUpdateKeys = Object.keys(nodeResult.agentDataUpdates);
          // Logger.debug(`  📊 AgentData更新: ${agentUpdateKeys.join(', ')}`, 'WorkflowEngine');

          // 确保context.agentContent存在
          if (!context.agentContent) {
            context.agentContent = { data: {} };
          }
          if (!context.agentContent.data) {
            context.agentContent.data = {};
          }

          // 合并更新到agentContent.data
          Object.keys(nodeResult.agentDataUpdates).forEach(key => {
            const updateValue = nodeResult.agentDataUpdates[key];

            // 特殊处理PPT数据，确保完整性
            if (key === 'ppt' && updateValue) {
              context.agentContent.data.ppt = updateValue;
              // Logger.debug(
              //   `  ✅ PPT数据已更新 - type: ${updateValue.type}, status: ${updateValue.status}`,
              //   'WorkflowEngine'
              // );
              // if (updateValue.output?.themes) {
              //   Logger.debug(`    - 主题数量: ${updateValue.output.themes.length}`, 'WorkflowEngine');
              // }
            } else {
              // 其他数据直接赋值
              context.agentContent.data[key] = updateValue;
            }
          });
        }

        // 更新节点执行状态为完成
        const executedNode = context.nodeExecutions?.find(
          n => n.nodeExecutionId === nodeExecutionId,
        );
        if (executedNode) {
          executedNode.status = 'completed';
        }

        lastNodeResult = nodeResult.data;

        // 获取当前节点的Token使用情况（如果有）
        let tokenInfo = '';
        if (context.tokenUsage && context.tokenUsage.details) {
          const currentNodeTokens = context.tokenUsage.details.find(
            detail => detail.nodeId === nodeConfig.id,
          );
          if (currentNodeTokens) {
            tokenInfo = `, 输入: ${currentNodeTokens.inputTokens} tokens, 输出: ${currentNodeTokens.outputTokens} tokens`;
          }
        }

        // 输出节点执行完成信息（包含Token使用）
        const nodeElapsedSeconds = (nodeElapsedTime / 1000).toFixed(1);
        Logger.log(
          `${displayName}节点执行完成，耗时: ${nodeElapsedSeconds}s${tokenInfo}`,
          'WorkflowEngine',
        );

        // 输出关键信息
        if (nodeResult.data) {
          const dataKeys = Object.keys(nodeResult.data).slice(0, 5);
          if (dataKeys.length > 0) {
            // Logger.debug(
            //   `  - 输出数据: ${dataKeys.join(', ')}${
            //     dataKeys.length < Object.keys(nodeResult.data).length ? '...' : ''
            //   }`,
            //   'WorkflowEngine'
            // );
          }
        }

        // 检查是否需要跳过剩余节点
        if (nodeResult.data?.skipRemainingNodes === true) {
          Logger.log('  ⚡ 跳过剩余节点，直接进入结束阶段');
          break; // 退出循环，直接进入结束阶段
        }
      }
    } catch (error) {
      // 如果是中止错误，调用EndNode来获取部分结果
      if (error.message?.includes('abort') || error.message?.includes('中止')) {
        Logger.log(
          `工作流 ${config.workflow.id} 执行被中断，调用EndNode获取部分结果`,
          'WorkflowEngine',
        );

        try {
          // 创建 EndNode 实例并执行
          const endNode = new EndNode(this.globalConfigService);
          const endNodeConfig = {
            outputKey: config.workflow.config?.resultKey || 'finalResult',
            progressMessages: {
              start: '收集中断时的部分结果...',
              end: '部分结果收集完成',
            },
          };

          // 执行 EndNode 来获取格式化的结果
          const endNodeResult = await endNode.execute(endNodeConfig, context);

          if (endNodeResult.success && endNodeResult.data) {
            const partialResult = endNodeResult.data;
            partialResult.finishReason = 'abort';

            // 构建agent_content（与正常完成时相同的格式）
            if (context.agentContent?.data) {
              const agentContent = {
                metadata: {
                  type: 'partial',
                  workflowId: context.workflowId,
                  timestamp: new Date().toISOString(),
                  status: 'interrupted',
                },
                data: context.agentContent?.data,
              };
              partialResult.agent_content = JSON.stringify(agentContent);
            }

            return partialResult;
          } else {
            // 如果 EndNode 执行失败，返回基本结果
            Logger.warn('EndNode执行失败，返回基本结果', 'WorkflowEngine');
            return {
              content: context.state.tempFullContent || context.state.content || '',
              reasoning_content:
                context.state.tempFullReasoningContent || context.state.reasoning_content || '',
              finishReason: 'abort',
              error: 'EndNode执行失败',
              totalTokens: context.totalTokens || 0,
              agent_content: context.agentContent?.data
                ? JSON.stringify({
                    metadata: {
                      type: 'partial',
                      workflowId: context.workflowId,
                      timestamp: new Date().toISOString(),
                      status: 'interrupted',
                    },
                    data: context.agentContent?.data,
                  })
                : null,
            };
          }
        } catch (endNodeError) {
          // 如果创建或执行 EndNode 失败，返回基本的错误结果
          Logger.error(`EndNode执行异常: ${endNodeError.message}`, 'WorkflowEngine');

          // 返回最基本的结果结构
          const basicResult: any = {
            content: context.state.tempFullContent || context.state.content || '',
            reasoning_content:
              context.state.tempFullReasoningContent || context.state.reasoning_content || '',
            finishReason: 'abort',
            error: `工作流中断，EndNode执行失败: ${endNodeError.message}`,
            totalTokens: context.totalTokens || 0,
          };

          // 如果有 agentData，添加基本的 agent_content
          if (context.agentContent?.data) {
            basicResult.agent_content = JSON.stringify({
              metadata: {
                type: 'error',
                workflowId: context.workflowId,
                timestamp: new Date().toISOString(),
                status: 'interrupted',
                error: endNodeError.message,
              },
              data: context.agentContent?.data,
            });
          }

          return basicResult;
        }
      }

      // 对于其他错误，也尝试返回包含agentData的结果
      const errorResult = {
        chatId: context.options?.chatId || `workflow-${Date.now()}`,
        content: '',
        finishReason: 'error',
        errMsg: error.message,
        model: context.options?.model || '',
        modelName: context.options?.modelName || 'Workflow Engine',
        _workflowState: context.state,
        agentContent: context.agentContent?.data, // 包含已更新的agentData
      };

      return errorResult;
    }

    // 工作流执行完成（日志在 AgentService 中统一输出）

    // 获取最终结果，优先从结束节点的输出获取
    const resultKey = config.workflow.config?.resultKey || 'finalResult';
    const finalResult = context.state[resultKey] || context.state.sharedState || context.state;

    // 构建agent_content对象（如果有agentData）
    if (context.agentContent?.data) {
      // 记录agentData内容
      // Logger.debug(
      //   `工作流完成时的agentData - 顶级键: ${Object.keys(context.agentContent?.data).join(', ')}`,
      //   'WorkflowEngine'
      // );

      // 特别记录PPT数据
      if (context.agentContent?.data.ppt) {
        const pptData = context.agentContent?.data.ppt as any;
        // Logger.debug(
        //   `agentData.ppt内容 - type:${pptData.type || '无'}, ` +
        //     `status:${pptData.status || '无'}, ` +
        //     `themes:${pptData.output?.themes?.length || 0}个, ` +
        //     `outline:${pptData.output?.pptData?.outline?.length || 0}项, ` +
        //     `error:${pptData.error || '无'}`,
        //   'WorkflowEngine'
        // );
      }

      const agentContent = {
        metadata: {
          type: 'final',
          workflowId: context.workflowId,
          timestamp: new Date().toISOString(),
          status: 'completed',
        },
        data: context.agentContent?.data,
      };

      // 将agent_content添加到最终结果
      finalResult.agent_content = JSON.stringify(agentContent);

      // 保留agentData供调试
      finalResult.agentContent = context.agentContent?.data;
      finalResult._executionContext = {
        ...finalResult._executionContext,
        agentContent: context.agentContent?.data,
      };

      // Logger.debug('已将agentData添加到finalResult', 'WorkflowEngine');
    } else {
      Logger.warn('工作流完成但context.agentContent?.data为空', 'WorkflowEngine');
    }

    // 确保 PPT 相关数据被包含在最终结果中
    if (context.state.pptTheme && !finalResult.pptTheme) {
      finalResult.pptTheme = context.state.pptTheme;
    }
    if (context.state.pptOutline && !finalResult.pptOutline) {
      finalResult.pptOutline = context.state.pptOutline;
    }
    if (context.state.pptData && !finalResult.pptData) {
      finalResult.pptData = context.state.pptData;
    }

    // 确保文件向量搜索结果被包含在最终结果中
    if (context.state.fileVectorResult && !finalResult.fileVectorResult) {
      // 如果 fileVectorResult 是一个对象，提取其中的 fileVectorResult 字段
      if (
        typeof context.state.fileVectorResult === 'object' &&
        context.state.fileVectorResult.fileVectorResult
      ) {
        finalResult.fileVectorResult = context.state.fileVectorResult.fileVectorResult;
      } else {
        finalResult.fileVectorResult = context.state.fileVectorResult;
      }
    }

    // Logger.debug(
    //   `工作流最终结果 - 来源: ${resultKey}, 思考内容: ${!!finalResult.reasoning_content}, 回复内容长度: ${
    //     finalResult.content?.length || 0
    //   }, PPT主题: ${!!finalResult.pptTheme}`,
    //   'WorkflowEngine'
    // );

    // 添加完成原因和token统计
    finalResult.finishReason = 'success';
    finalResult.totalTokens = context.totalTokens || 0;

    // 发送工作流完成的流式结束信号
    if (context.onProgress) {
      context.onProgress({
        nodeType: 'workflow',
        status: 'completed',
        statusMessage: '工作流执行完成',
        agent_content: JSON.stringify({
          metadata: {
            type: 'completed',
            workflowId: context.workflowId,
            workflowExecutionId: context.workflowExecutionId,
            nodeExecutionSequence: context.nodeExecutionSequence,
            timestamp: new Date().toISOString(),
            status: 'close',
          },
          data: {
            summary: {
              totalNodes: context.nodeExecutions?.length || 0,
              executionTime: Date.now() - startTime,
              totalTokens: context.totalTokens || 0,
            },
          },
        }),
      });
    }

    // 直接返回结束节点格式化的结果
    return finalResult;
  }

  /**
   * 构建执行顺序（简化版：假设线性流程）
   */
  private buildExecutionOrder(flows: any[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();

    // 从START开始
    let current = 'START';

    while (current !== 'END' && !visited.has(current)) {
      visited.add(current);

      if (current !== 'START') {
        order.push(current);
      }

      // 找到下一个节点
      const nextFlow = flows.find(flow => flow.from === current);
      if (nextFlow) {
        current = nextFlow.to;
      } else {
        break;
      }
    }

    return order;
  }
}
