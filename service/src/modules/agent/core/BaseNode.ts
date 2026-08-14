/**
 * BaseNode - 所有节点的抽象基类
 * 提供统一的执行流程和通用功能
 */

import { Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { ModelsService } from '../../models/models.service';
import { ExecutionContext, INode, NodeResult } from './types';
import {
  NodeInput,
  NodeOutput,
  NodeOutputResult,
  StreamOutput,
  NodeMeta,
  NodeLifecycle,
  IExtendedNode,
} from './NodeInterface';
import {
  AgentUpdateType,
  AgentUpdateItem,
  createIncrementalUpdate,
  generateUpdateId,
} from './AgentContent.types';
import { getTokenCount } from '../../../common/utils/getTokenCount';
import { agentContentManager } from './AgentContentManager';

/**
 * 抽象基类 - 所有节点都应该继承这个类
 */
export abstract class BaseNode implements INode {
  // 节点元信息（子类必须提供）
  abstract readonly meta: NodeMeta;

  // 生命周期钩子（子类可选覆盖）
  lifecycle: NodeLifecycle = {};

  // 可选的验证和处理方法
  protected validateInput?(input: NodeInput): Promise<boolean>;
  protected processOutput?(output: NodeOutput, input: NodeInput): Promise<NodeOutput>;

  constructor(
    protected readonly globalConfigService?: GlobalConfigService,
    protected readonly modelsService?: ModelsService,
  ) {}

  /**
   * INode接口的execute方法 - 向后兼容
   */
  async execute(config: any, context: ExecutionContext): Promise<NodeResult> {
    try {
      // 准备输入
      const input = await this.prepareInput(config, context);

      // 使用新的执行流程
      const output = await this.executeNode(input);

      // 转换为旧格式
      return this.convertToLegacyResult(output, input);
    } catch (error) {
      Logger.error(`节点执行失败: ${error.message}`, error.stack, this.constructor.name);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 新的统一执行入口
   */
  async executeNode(input: NodeInput): Promise<NodeOutput> {
    const startTime = Date.now();

    try {
      // 1. 执行前钩子
      await this.lifecycle.onBeforeExecute?.(input);

      // 2. 验证输入
      if (this.validateInput) {
        const isValid = await this.validateInput(input);
        if (!isValid) {
          throw new Error('输入验证失败');
        }
      }

      // 3. 发送开始状态
      this.sendStartStatus(input);

      // 4. 执行核心逻辑
      const output = await this.process(input);

      // 5. 后处理
      const processedOutput = this.processOutput ? await this.processOutput(output, input) : output;

      // 6. 添加执行时间
      if (!processedOutput.result.metadata) {
        processedOutput.result.metadata = {};
      }
      processedOutput.result.metadata.executionTime = Date.now() - startTime;

      // 7. 无论成功还是失败，都更新上下文（确保agentDataUpdates被应用）
      this.updateContext(processedOutput, input);

      // 8. 如果节点成功，发送完成状态
      if (processedOutput.result.success) {
        this.sendCompleteStatus(processedOutput, input);
      }

      // 9. 执行后钩子
      await this.lifecycle.onAfterExecute?.(processedOutput, input);

      return processedOutput;
    } catch (error) {
      // 错误处理
      Logger.error(
        `${this.meta.name}执行失败: ${error.message}`,
        error.stack,
        this.constructor.name,
      );

      // 执行错误钩子
      await this.lifecycle.onError?.(error, input);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: error.message,
      });

      return {
        result: {
          success: false,
          error: error.message,
        },
      };
    }
  }

  /**
   * 核心处理逻辑 - 子类必须实现
   */
  protected abstract process(input: NodeInput): Promise<NodeOutput>;

  /**
   * 准备输入（默认实现）
   */
  async prepareInput(config: any, context: ExecutionContext): Promise<NodeInput> {
    // 获取全局配置
    const globalConfig = await this.getGlobalConfig();

    // 合并动态参数
    const dynamicParams = {
      ...(config.dynamicParams || {}),
      ...(context.state?.nextNodeParams || {}),
    };

    return {
      messages: context.messages,
      config,
      context,
      globalConfig,
      dynamicParams,
    };
  }

  /**
   * 获取全局配置
   */
  protected async getGlobalConfig(): Promise<NodeInput['globalConfig']> {
    if (!this.globalConfigService) {
      // 如果没有注入globalConfigService，从context中获取
      return {};
    }

    const configs = await this.globalConfigService.getConfigs([
      'openaiBaseKey',
      'openaiBaseUrl',
      'openaiBaseModel',
    ]);

    return {
      openaiBaseUrl: configs.openaiBaseUrl || '',
      openaiBaseKey: configs.openaiBaseKey || '',
      openaiBaseModel: configs.openaiBaseModel || 'gpt-4o-mini',
      ...configs,
    };
  }

  /**
   * 发送流式输出
   */
  /**
   * 发送增量更新 - 简化版
   * 只发送当前节点的状态和结果，不发送完整的agentContent
   */
  protected sendIncrementalUpdate(
    input: NodeInput,
    type: AgentUpdateType,
    data: any,
    id?: string,
  ): void {
    const updateId = id || generateUpdateId(type, this.meta.id);

    // 根据类型构建合适的数据结构
    let incrementalData: any = {};

    // 所有工具执行都统一放到 toolExecutions
    // 不管是搜索、MCP、文件分析，都是工具执行
    if (type === AgentUpdateType.TOOL_EXECUTION) {
      // 工具执行统一格式
      incrementalData.toolExecutions = [
        {
          ...data,
          id: updateId,
        },
      ];
    } else if (type === AgentUpdateType.CUSTOM) {
      // 自定义数据
      incrementalData.custom = data;
    } else if (type === AgentUpdateType.PPT) {
      // PPT 数据
      incrementalData.ppt = data;
    } else if (type === AgentUpdateType.REASONING) {
      // 推理数据
      incrementalData.reasoning = data;
    } else if (type === AgentUpdateType.WORKFLOW_STATUS) {
      // 工作流状态
      incrementalData.workflowStatus = data;
    } else if (type === AgentUpdateType.TOKEN_USAGE) {
      // Token 使用
      incrementalData.tokenUsage = data;
    } else {
      // 其他未知类型，也放到 toolExecutions（向后兼容）
      incrementalData.toolExecutions = [
        {
          ...data,
          id: updateId,
          type: type,
        },
      ];
    }

    // 构造增量更新 - 使用与最终格式一致的结构
    const incrementalUpdate = {
      metadata: {
        version: '1.0.0',
        type: 'incremental',
        workflowId: input.context.workflowId || 'unknown',
        nodeId: this.meta.id,
        timestamp: new Date().toISOString(),
        status: 'processing',
      },
      data: incrementalData,
    };

    // 发送增量更新给前端
    try {
      input.context.onProgress({
        agent_content: JSON.stringify(incrementalUpdate),
      });

      // 不记录节点更新日志
    } catch (error) {
      Logger.error(`发送增量更新失败: ${error.message}`, this.constructor.name);
    }

    // 更新内部的agentContent（统一格式）
    this.updateAgentContent(input, type, data, updateId);
  }

  /**
   * 更新内部的agentContent - 保持与最终保存格式一致
   */
  private updateAgentContent(input: NodeInput, type: AgentUpdateType, data: any, id: string): void {
    // 确保agentContent存在
    if (!input.context.agentContent) {
      input.context.agentContent = {
        metadata: {
          version: '1.0.0',
          type: this.meta.type,
          workflowId: input.context.workflowId,
          timestamp: new Date().toISOString(),
          status: 'processing',
        },
        data: {
          toolExecutions: [],
          fileAnalysis: {},
          custom: {},
          ppt: null,
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
      };
    }

    const agentContent = input.context.agentContent;

    // 根据类型更新对应的字段
    switch (type) {
      case AgentUpdateType.TOOL_EXECUTION:
        const tool = {
          id: id,
          type: data.name?.includes('搜索') || data.name?.includes('search') ? 'search' : 'tool',
          name: data.name || '工具调用',
          status: data.status || 'success',
          input: data.input,
          output: data.output,
          time: data.time || Date.now(),
          ...data,
        };

        // 查找是否已存在
        const existingIndex = agentContent.data.toolExecutions.findIndex((t: any) => t.id === id);

        if (existingIndex >= 0) {
          // 更新现有工具
          agentContent.data.toolExecutions[existingIndex] = {
            ...agentContent.data.toolExecutions[existingIndex],
            ...tool,
          };
        } else {
          // 添加新工具
          agentContent.data.toolExecutions.push(tool);
        }
        break;

      case AgentUpdateType.WORKFLOW_STATUS:
        agentContent.metadata.status = data.nodeStatus || 'processing';
        break;

      case AgentUpdateType.REASONING:
        agentContent.execution.reasoning_content = data.content || '';
        agentContent.execution.thinking_enabled = true;
        break;

      case AgentUpdateType.LLM_RESPONSE:
        agentContent.execution.content = data.content || '';
        agentContent.execution.llm_executed = true;
        break;

      case AgentUpdateType.PPT:
        agentContent.data.ppt = data;
        break;

      default:
        agentContent.data.custom[type] = data;
    }
  }

  /**
   * 发送增量更新
   */
  protected sendAgentUpdate(input: NodeInput, type: AgentUpdateType, data: any, id?: string): void {
    this.sendIncrementalUpdate(input, type, data, id);
  }

  protected sendStream(input: NodeInput, stream: StreamOutput): void {
    // 调用生命周期钩子
    this.lifecycle.onStream?.(stream, input);

    // 发送到context
    if (!input.context.onProgress) {
      Logger.warn('❌ sendStream被调用但onProgress不存在', this.constructor.name);
      return;
    }

    switch (stream.type) {
      case 'text':
        // 流式文本太频繁，不记录日志
        input.context.onProgress({
          content: [{ type: 'text', text: stream.content }],
        });
        break;

      case 'status':
        input.context.onProgress({
          status: stream.status,
          statusMessage: stream.content,
        });
        break;

      case 'progress':
        input.context.onProgress({
          progress: stream.progress,
        });
        break;

      case 'data':
        // 只记录关键数据类型
        if (stream.data?.workflowType && stream.data?.nodeStatus) {
          Logger.debug(
            `📤 发送工作流状态: ${stream.data.workflowType} - ${stream.data.nodeStatus}`,
            'BaseNode',
          );
          // 发送工作流状态的增量更新
          this.sendAgentUpdate(
            input,
            AgentUpdateType.WORKFLOW_STATUS,
            stream.data,
            `workflow_${stream.data.nodeId}_${Date.now()}`,
          );
        } else {
          // 其他 data 类型，按原方式处理
          input.context.onProgress({
            ...stream.data,
          });
        }
        break;

      case 'error':
        Logger.error(`❌ 发送error: ${stream.error}`, this.constructor.name);
        input.context.onProgress({
          error: stream.error,
          statusMessage: `错误: ${stream.error}`,
        });
        break;
    }
  }

  /**
   * 发送开始状态
   */
  protected sendStartStatus(input: NodeInput): void {
    const message = input.config.progressMessages?.start || `开始执行${this.meta.name}...`;

    this.sendStream(input, {
      type: 'status',
      status: 'starting',
      content: message,
    });
  }

  /**
   * 发送完成状态
   */
  protected sendCompleteStatus(output: NodeOutput, input: NodeInput): void {
    const message = input.config.progressMessages?.end || `${this.meta.name}执行完成`;

    this.sendStream(input, {
      type: 'status',
      status: 'completed',
      content: message,
    });
  }

  /**
   * 更新执行上下文
   */
  protected updateContext(output: NodeOutput, input: NodeInput): void {
    // 更新状态
    if (output.stateUpdates) {
      Object.assign(input.context.state, output.stateUpdates);
    }

    // 更新AgentData
    if (output.agentDataUpdates && input.context.agentContent) {
      // 确保data存在
      if (!input.context.agentContent.data) {
        input.context.agentContent.data = {};
      }

      const agentData = input.context.agentContent.data;

      Object.keys(output.agentDataUpdates).forEach(key => {
        const updateData = output.agentDataUpdates[key];

        // 特殊处理 toolExecutions - 应该是数组
        if (key === 'toolExecutions') {
          if (!agentData.toolExecutions) {
            agentData.toolExecutions = [];
          }
          // 如果更新数据是数组，添加到现有数组中
          if (Array.isArray(updateData)) {
            agentData.toolExecutions.push(...updateData);
          }
        } else if (typeof updateData === 'object' && !Array.isArray(updateData)) {
          // 对于PPT数据，直接覆盖而不是合并
          if (key === 'ppt') {
            agentData[key] = updateData;
          } else {
            // 对于其他对象类型的更新，进行合并
            if (!agentData[key]) {
              agentData[key] = {};
            }
            Object.assign(agentData[key], updateData);
          }
        } else {
          // 对于其他类型（数组、原始值等），直接赋值
          agentData[key] = updateData;
        }

        // 记录更新后的数据统计
        if (key === 'networkSearch' && updateData.results) {
        }
      });

      // 记录更新后的agentData状态
    } else if (output.agentDataUpdates && !input.context.agentContent) {
      Logger.warn('agentDataUpdates存在但context.agentContent未初始化', this.constructor.name);
    }
  }

  /**
   * 转换为旧格式结果（向后兼容）
   */
  protected convertToLegacyResult(output: NodeOutput, input: NodeInput): NodeResult {
    return {
      success: output.result.success,
      data: output.result.data || output.result.content,
      error: output.result.error,
      stateUpdates: output.stateUpdates,
    };
  }

  /**
   * 工具方法：提取最新用户消息
   */
  protected extractLatestUserMessage(messages: any[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return '';
  }

  /**
   * 工具方法：估算Token数量
   */
  protected async estimateTokens(text: string): Promise<number> {
    try {
      // 使用专业的 token 计算函数
      return await getTokenCount(text);
    } catch (error) {
      // 如果计算失败，使用简单估算
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * 记录 Token 使用情况
   * @param input - 节点输入
   * @param inputText - 输入文本（用于估算）
   * @param outputText - 输出文本（用于估算）
   * @param description - 描述
   * @param actualUsage - 实际的 token 使用量（如果 API 返回了的话）
   */
  protected async recordTokenUsage(
    input: NodeInput,
    inputText: string,
    outputText: string,
    description?: string,
    actualUsage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    },
  ): Promise<void> {
    try {
      // 优先使用 API 返回的实际 token 数，如果没有则估算
      let inputTokens: number;
      let outputTokens: number;
      let totalTokens: number;

      if (actualUsage?.prompt_tokens && actualUsage?.completion_tokens) {
        // 使用实际的 token 数
        inputTokens = actualUsage.prompt_tokens;
        outputTokens = actualUsage.completion_tokens;
        totalTokens = actualUsage.total_tokens || inputTokens + outputTokens;
      } else {
        // 估算 tokens
        inputTokens = await this.estimateTokens(inputText);
        outputTokens = await this.estimateTokens(outputText);
        totalTokens = inputTokens + outputTokens;
      }

      // 初始化 tokenUsage 如果不存在
      if (!input.context.tokenUsage) {
        input.context.tokenUsage = {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          details: [],
        };
      }

      // 累加 tokens
      input.context.tokenUsage.totalInputTokens += inputTokens;
      input.context.tokenUsage.totalOutputTokens += outputTokens;
      input.context.tokenUsage.totalTokens += totalTokens;

      // 记录详细信息（优先使用实际节点ID）
      input.context.tokenUsage.details.push({
        nodeId: input.context.currentNodeId || this.meta.id,
        nodeType: this.meta.type,
        inputTokens,
        outputTokens,
        totalTokens,
        timestamp: new Date().toISOString(),
        description: description || this.meta.name,
      });

      // 更新旧的 totalTokens 字段（保持兼容）
      input.context.totalTokens = input.context.tokenUsage.totalTokens;

      // 发送增量更新
      this.sendAgentUpdate(
        input,
        AgentUpdateType.TOKEN_USAGE,
        {
          nodeId: this.meta.id,
          nodeType: this.meta.type,
          inputTokens,
          outputTokens,
          totalTokens,
          cumulativeTotal: input.context.tokenUsage.totalTokens,
          description: description || this.meta.name,
        },
        `token_usage_${this.meta.id}_${Date.now()}`,
      );
    } catch (error) {
      Logger.error(`记录Token使用失败: ${error.message}`, this.constructor.name);
    }
  }

  /**
   * 工具方法：安全获取配置值
   */
  protected getConfigValue<T>(input: NodeInput, key: string, defaultValue: T): T {
    return (
      input.dynamicParams?.[key] ||
      input.config[key] ||
      input.context.options?.[key] ||
      defaultValue
    );
  }
}
