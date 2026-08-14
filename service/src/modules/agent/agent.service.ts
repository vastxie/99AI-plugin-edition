import { getTokenCount, handleError } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { AgentContent } from '../../types/agent';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { ExecutionContext, LLMNodeConfig } from './core/types';
import { WorkflowEngine } from './core/WorkflowEngine.service';
import { LLMNode } from './nodes/LLMNode';

// 类型定义
interface ProgressData {
  text?: string;
  content?: any[];
  reasoning_content?: any[];
  finishReason?: string;
  status?: string;
  [key: string]: any;
}

interface DatabaseData {
  content?: string;
  reasoning_content?: string;
  tool_calls?: any;
  promptReference?: any;
  totalTokens?: number;
  status?: number;
  networkSearchResult?: string;
  agent_content?: string;
  [key: string]: any;
}

interface AgentChatInputs {
  chatId?: string;
  apiKey?: string;
  model?: string;
  modelName?: string;
  temperature?: number;
  timeout?: number;
  proxyUrl?: string;
  usingDeepThinking?: boolean;
  deepThinkingType?: number;
  usingNetwork?: boolean;
  abortController?: AbortController;
  onProgress?: (data: ProgressData) => void;
  onFailure?: (error: any) => void;
  onDatabase?: (data: DatabaseData) => void;
  workflowId?: string;
  additionalParams?: any;
  messages?: any[];
  [key: string]: any;
}

/**
 * 简化版Agent服务
 * 支持LLMNode直接调用和工作流引擎两种模式
 */
@Injectable()
export class AgentService {
  private logger = new Logger(AgentService.name);

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly modelsService: ModelsService,
    private readonly llmNode: LLMNode,
    private readonly workflowEngine: WorkflowEngine,
  ) {}

  /**
   * 兼容旧的agentChat接口
   * 根据模型类型自动选择工作流：flowith模型使用flowith-chat，其他模型使用intelligent-chat
   */
  async agentChat(messagesHistory: any[], inputs: AgentChatInputs = {}): Promise<any> {
    const {
      chatId = `agent-${Date.now()}`,
      model,
      modelName = 'AI Agent',
      abortController = new AbortController(),
      onProgress,
      onFailure,
      onDatabase,
    } = inputs;

    // 根据模型类型或插件参数自动选择工作流
    let workflowId = inputs.workflowId;

    if (!workflowId) {
      // 检查是否有插件参数
      const pluginParam = inputs.pluginParam || inputs.options?.pluginParam;

      if (pluginParam === 'ppt-generation') {
        // 所有PPT相关请求都使用智能聊天工作流
        workflowId = 'intelligent-chat';
        Logger.log(`检测到PPT生成插件，使用智能聊天工作流处理PPT`, 'AgentService');
      } else if (model && model.includes('flowith')) {
        workflowId = 'flowith-chat';
        Logger.log(`检测到Flowith模型 (${model})，使用Flowith专用工作流`, 'AgentService');
      } else {
        workflowId = 'intelligent-chat'; // 默认使用智能聊天工作流
      }
    }

    // 使用工作流引擎执行（统一处理）
    return this.executeWorkflow(workflowId, messagesHistory, inputs);
  }

  /**
   * 转换进度数据格式以兼容旧接口
   */
  private transformProgressData(data: any): ProgressData {
    const compatibleData: ProgressData = {};

    if (data.content) {
      compatibleData.content = data.content;
      if (data.content[0]?.text) {
        compatibleData.text = data.content[0].text;
      }
    }

    if (data.reasoning_content) {
      compatibleData.reasoning_content = data.reasoning_content;
    }

    if (data.status === 'completed') {
      compatibleData.finishReason = 'stop';
    }

    // 传递PPT相关数据
    if (data.pptData) {
      compatibleData.pptData = data.pptData;
    }
    if (data.pptOutline) {
      compatibleData.pptOutline = data.pptOutline;
    }
    if (data.pptTheme) {
      compatibleData.pptTheme = data.pptTheme;
    }

    // 处理和转换agent_content
    if (data.agent_content) {
      try {
        // 如果agent_content是字符串，解析它
        const agentContent =
          typeof data.agent_content === 'string'
            ? JSON.parse(data.agent_content)
            : data.agent_content;

        // 确保toolExecutions数组存在
        if (agentContent.data) {
          // 如果还没有toolExecutions但有旧格式数据，创建它
          if (!agentContent.data.toolExecutions) {
            const toolExecutions = [];

            // 从networkSearch创建
            if (agentContent.data.networkSearch) {
              const ns = agentContent.data.networkSearch;
              if (ns.results?.length > 0 || ns.status === 'processing') {
                toolExecutions.push({
                  id: `search-stream-${Date.now()}`,
                  type: 'search',
                  name: '联网搜索',
                  status: ns.status === 'completed' ? 'success' : 'loading',
                  timestamp: Date.now(),
                  searchQuery: ns.currentQuery || ns.queries?.join(', ') || '',
                  searchQueries: ns.allQueries || ns.queries || [],
                  searchQueryDetails: ns.queryDetails || [],
                  searchResults: (ns.results || []).map(item => ({
                    title: item.title,
                    link: item.url || item.link,
                    snippet: item.snippet,
                    domain: item.domain || (item.url ? new URL(item.url).hostname : ''),
                    favicon: item.favicon,
                  })),
                  currentQuery: ns.currentQuery,
                  queryIndex: ns.queryIndex,
                  totalQueries: ns.totalQueries,
                });
              }
            }

            // 添加到agentContent
            if (toolExecutions.length > 0) {
              agentContent.data.toolExecutions = toolExecutions;
              Logger.debug(
                `流式更新 - 添加了${toolExecutions.length}个工具执行到agent_content`,
                'AgentService',
              );
            }
          }

          // 重新序列化
          compatibleData.agent_content = JSON.stringify(agentContent);
        } else {
          compatibleData.agent_content = data.agent_content;
        }
      } catch (e) {
        // 如果解析失败，直接传递原始数据
        compatibleData.agent_content = data.agent_content;
      }
    }

    // 传递其他数据
    return { ...compatibleData, ...data };
  }

  /**
   * 使用工作流引擎执行聊天
   */
  async executeWorkflow(
    workflowId: string,
    messagesHistory: any[],
    inputs: AgentChatInputs,
  ): Promise<any> {
    try {
      const result = await this.workflowEngine.executeWorkflow(workflowId, messagesHistory, {
        ...inputs,
        onProgress: (data: any) => {
          const transformedData = this.transformProgressData(data);
          inputs.onProgress?.(transformedData);
        },
        onError: (error: any) => {
          Logger.error(`工作流执行出错: ${handleError(error)}`, 'AgentService');
          inputs.onFailure?.(error);
        },
      });

      // 统一处理数据保存（包含日志输出）
      await this.handleDatabaseSave(result, inputs, workflowId);

      // 发送最终的agent_content到前端（通过SSE）
      // 这确保前端能够接收到完整的PPT数据
      if (result.agentData && inputs.onProgress) {
        // 构建最终的agent_content
        const finalAgentContent = {
          metadata: {
            version: '1.0.0',
            type: 'final',
            workflowId: workflowId,
            timestamp: new Date().toISOString(),
            status: 'completed',
          },
          data: result.agentData || {},
        };

        // 发送最终状态到前端
        inputs.onProgress({
          agent_content: JSON.stringify(finalAgentContent),
          status: 'completed',
          finishReason: 'stop',
          totalTokens: result.totalTokens || 0,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`工作流执行失败: ${errorMessage}`, 'AgentService');

      // 检查是否是中止错误
      const isAborted = errorMessage.includes('中止') || errorMessage.includes('abort');

      if (isAborted) {
        Logger.log(`工作流被中止，尝试保存已缓存的内容`, 'AgentService');

        // 创建一个包含已缓存内容的结果对象
        const abortedResult = {
          chatId: inputs.chatId || `workflow-${Date.now()}`,
          content: '', // 将由工作流引擎提供的部分结果填充
          reasoning_content: '',
          finishReason: 'abort',
          model: inputs.model || '',
          modelName: inputs.modelName || 'Workflow Engine',
          workflowId,
          _workflowState: {
            mode: 'workflow',
            workflowId,
            aborted: true,
            executionTime: new Date().toISOString(),
            success: false,
          },
        };

        // 尝试保存已缓存的内容到数据库
        await this.handleDatabaseSave(abortedResult, inputs, 'unknown');

        return abortedResult;
      }

      // 其他错误按原有逻辑处理
      const errorResult = {
        chatId: inputs.chatId || `workflow-${Date.now()}`,
        content: errorMessage, // 将错误消息保存到content中，确保能显示给用户
        reasoning_content: '',
        finishReason: 'error',
        model: inputs.model || '',
        modelName: inputs.modelName || 'Workflow Engine',
        errMsg: errorMessage,
        workflowId,
        _workflowState: {
          mode: 'workflow',
          workflowId,
          error: errorMessage,
          executionTime: new Date().toISOString(),
          success: false,
        },
      };

      // 保存错误状态到数据库
      await this.handleDatabaseSave(errorResult, inputs);

      inputs.onFailure?.(errorResult);
      return errorResult;
    }
  }

  /**
   * 统一处理数据库保存逻辑
   */
  private async handleDatabaseSave(
    result: any,
    inputs: AgentChatInputs,
    workflowId?: string,
  ): Promise<void> {
    if (!inputs.onDatabase) {
      return;
    }

    try {
      const dataToSave: DatabaseData = {};

      // 保存主要的聊天内容（content、reasoning_content、tool_calls等）
      // 确保 content 是字符串格式
      const rawContent = result.filteredContent || result.content || '';
      if (Array.isArray(rawContent)) {
        // 如果是数组，提取文本内容
        dataToSave.content = rawContent
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item?.text) return item.text;
            if (item?.content && typeof item.content === 'string') return item.content;
            return '';
          })
          .join('');
      } else if (typeof rawContent === 'string') {
        dataToSave.content = rawContent;
      } else {
        dataToSave.content = '';
      }

      if (result.reasoning_content) {
        dataToSave.reasoning_content = result.reasoning_content;
      }

      if (result.tool_calls) {
        dataToSave.tool_calls = result.tool_calls;
      }

      // 保存问题推荐
      if (result.promptReference) {
        dataToSave.promptReference = result.promptReference;
      }

      // 计算并保存token信息
      // 计算prompt tokens（基于输入消息）
      let totalText = '';
      const messages = inputs.messages || [];
      messages.forEach((message: any) => {
        if (typeof message.content === 'string') {
          totalText += message.content + ' ';
        } else if (Array.isArray(message.content)) {
          // 处理多模态消息
          message.content.forEach((item: any) => {
            if (item.type === 'text' && item.text) {
              totalText += item.text + ' ';
            }
          });
        }
      });

      const inputTokens = totalText ? await getTokenCount(totalText) : 0;
      const completionText = (dataToSave.reasoning_content || '') + (dataToSave.content || '');
      const outputTokens = completionText ? await getTokenCount(completionText) : 0;
      const totalTokens = inputTokens + outputTokens;

      // 保存总token数
      dataToSave.totalTokens = totalTokens || 0;

      // 根据完成原因设置状态
      if (result.finishReason === 'abort') {
        dataToSave.status = 5; // 中止状态
      } else if (result.finishReason === 'error') {
        dataToSave.status = 4; // 错误状态
      } else {
        dataToSave.status = 3; // 成功完成
      }

      // 优先从 _workflowState 中获取数据，如果没有则从 result 中获取
      const sourceData = result._workflowState || result;

      // 保存搜索结果（需要特殊处理格式，与原有逻辑保持一致）
      let processedNetworkSearchResult = null;

      // 网络搜索结果可能在多个位置：searchResults、networkSearchResult、或嵌套在 sharedState 中
      let searchResultsData = sourceData.searchResults || result.searchResults;
      let networkSearchData = sourceData.networkSearchResult || result.networkSearchResult;

      // 检查 sharedState 中是否有搜索结果
      if (!searchResultsData && sourceData.sharedState) {
        searchResultsData = sourceData.sharedState.searchResults;
      }
      if (!networkSearchData && sourceData.sharedState) {
        networkSearchData = sourceData.sharedState.networkSearchResult;
      }

      // 检查 searchResult 字段（工作流中的输出键）
      if (!searchResultsData && sourceData.searchResult) {
        searchResultsData = sourceData.searchResult.searchResults;
      }
      if (!networkSearchData && sourceData.searchResult) {
        networkSearchData = sourceData.searchResult.networkSearchResult;
      }

      // 如果还是没有找到，检查顶层是否直接有搜索结果（来自_workflowState）
      if (!searchResultsData && sourceData.search_enabled && !searchResultsData) {
        // 遍历sourceData查找任何可能包含搜索结果的字段
        for (const [key, value] of Object.entries(sourceData)) {
          if (
            value &&
            typeof value === 'object' &&
            'searchResults' in value &&
            Array.isArray(value.searchResults)
          ) {
            searchResultsData = value.searchResults;
            break;
          }
        }
      }

      // 优先使用 searchResults（这是实际包含搜索结果的字段）
      if (searchResultsData && searchResultsData.length > 0) {
        // searchResults 已经是处理后的格式，直接使用
        processedNetworkSearchResult = searchResultsData;
        dataToSave.networkSearchResult = JSON.stringify(searchResultsData, null, 2);
      } else if (networkSearchData) {
        // 如果只有 networkSearchResult，则处理它
        try {
          // 解析搜索结果并移除content部分（与原有逻辑一致）
          const searchResults =
            typeof networkSearchData === 'string'
              ? JSON.parse(networkSearchData)
              : networkSearchData;

          if (Array.isArray(searchResults)) {
            const processedResults = searchResults.map(
              (item: { [x: string]: any; content: any }) => {
                const { content, ...rest } = item; // 删除 content 部分
                return rest; // 返回剩余部分
              },
            );
            processedNetworkSearchResult = processedResults;
            dataToSave.networkSearchResult = JSON.stringify(processedResults, null, 2);
          } else {
            processedNetworkSearchResult = searchResults;
            dataToSave.networkSearchResult =
              typeof searchResults === 'string'
                ? searchResults
                : JSON.stringify(searchResults, null, 2);
          }
        } catch (parseError) {
          // 如果解析失败，直接保存原始数据
          processedNetworkSearchResult = networkSearchData;
          dataToSave.networkSearchResult = networkSearchData;
        }
      }

      // 构建统一的 AgentContent 对象
      let agentContent: AgentContent = {
        metadata: {
          version: '1.0.0',
          type: this.determineAgentType(inputs, result),
          workflowId: inputs.workflowId,
          timestamp: new Date().toISOString(),
          status:
            result.finishReason === 'stop'
              ? 'completed'
              : result.finishReason === 'abort'
              ? 'partial'
              : 'error',
        },
        data: {}, // 初始化为空对象，后面会填充
        execution: (() => {
          // 从 _workflowState 中提取执行信息，但排除工具执行数据和旧的文件分析字段
          const workflowState = result._workflowState || {};
          const {
            tools,
            toolExecutions,
            fileVectorResult,
            fileVectorSearchResult,
            fileAnalysisResult,
            ...cleanedState
          } = workflowState;

          return Object.keys(cleanedState).length > 0
            ? cleanedState
            : {
                mode: inputs.workflowId ? 'workflow' : 'simple',
                workflowId: inputs.workflowId,
                nodeType: 'unknown',
                executionTime: new Date().toISOString(),
                success: result.finishReason === 'stop',
                aborted: result.finishReason === 'abort',
              };
        })(),
        display: {
          pluginParam: this.determinePluginParam(inputs, result),
        },
      };

      // 使用 context.agentContent
      const agentContentFromContext = result.agentContent;
      if (agentContentFromContext) {
        // agentContentFromContext 实际上是 context.agentContent.data 的内容
        // 需要将它合并到 agentContent.data 中，而不是覆盖整个 agentContent
        agentContent.data = { ...agentContent.data, ...agentContentFromContext };

        // 调试日志
      }

      // 如果没有agentContent，则从原有逻辑中提取数据（仅用于旧工作流）
      if (!agentContentFromContext) {
        // 填充数据部分
        // PPT 相关数据
        const pptTheme = sourceData.pptTheme || result.pptTheme;
        const pptOutline = sourceData.pptOutline || result.pptOutline;
        const pptData = sourceData.pptData || result.pptData;

        // 构建兼容新格式的PPT数据
        if (pptTheme) {
          // 主题选择阶段
          agentContent.data.ppt = {
            type: 'theme' as const,
            status: 'completed' as const,
            statusMessage: '主题生成完成',
            input: {
              title: '',
              requirements: '',
            },
            output: {
              themes: pptTheme.themes || [],
            },
            timestamp: new Date().toISOString(),
          };
        } else if (pptData || pptOutline) {
          // 完整PPT生成阶段
          agentContent.data.ppt = {
            type: 'complete' as const,
            status: 'completed' as const,
            statusMessage: 'PPT生成完成',
            input: {
              title: pptData?.title || pptOutline?.title || '',
              requirements: '',
            },
            output: {
              pptData: pptData || {
                title: pptOutline?.title || '',
                subtitle: pptOutline?.subtitle || '',
                outline: pptOutline?.outline || [],
              },
            },
            timestamp: new Date().toISOString(),
          };
        }

        // 不再处理 fileVectorResult，文件分析通过 toolExecutions 传递

        // 推理内容
        const reasoningContent = sourceData.reasoning_content || result.reasoning_content;
        if (reasoningContent) {
          agentContent.data.reasoning = {
            content: reasoningContent,
          };
        }

        // 参考资料
        const promptReference = sourceData.promptReference || result.promptReference;
        if (promptReference) {
          agentContent.data.custom = {
            ...agentContent.data.custom,
            promptReference: promptReference,
          };
        }
      }

      // 将 AgentContent 保存到 agent_content 字段
      dataToSave.agent_content = JSON.stringify(agentContent);

      // 调试日志 - 确认toolExecutions被保存

      // 如果有数据需要保存，调用回调
      if (Object.keys(dataToSave).length > 0) {
        inputs.onDatabase(dataToSave);

        // 移除工作流完成日志
      }
    } catch (error) {
      Logger.error(`数据库保存失败: ${handleError(error)}`, 'AgentService');
      // 数据库保存失败不影响主流程
    }
  }

  /**
   * 确定Agent类型
   */
  private determineAgentType(inputs: AgentChatInputs, result: any): string {
    if (inputs.workflowId?.includes('ppt')) {
      return 'ppt';
    }
    // 通过 toolExecutions 判断是否有文件分析
    if (
      inputs.fileUrl ||
      result.agentData?.toolExecutions?.some((t: any) => t.type === 'file_search')
    ) {
      return 'fileAnalysis';
    }
    if (result.networkSearchResult) {
      return 'search';
    }
    if (result.reasoning_content) {
      return 'reasoning';
    }
    return 'chat';
  }

  /**
   * 确定插件参数
   */
  private determinePluginParam(inputs: AgentChatInputs, result: any): string {
    if (inputs.pluginParam) {
      return inputs.pluginParam;
    }
    if (inputs.workflowId?.includes('ppt')) {
      return 'ppt-generation';
    }
    if (inputs.fileUrl || result.fileAnalysisEnabled) {
      return 'file-analysis';
    }
    return '';
  }

  /**
   * 使用简单LLM节点执行聊天（原有逻辑）
   */
  async executeLLMNode(messagesHistory: any[], inputs: AgentChatInputs): Promise<any> {
    const {
      chatId = `agent-${Date.now()}`,
      model,
      modelName = 'AI Agent',
      abortController = new AbortController(),
      onProgress,
      onFailure,
    } = inputs;

    // 准备结果对象
    const result: any = {
      chatId,
      content: '',
      reasoning_content: '',
      finishReason: null,
      model: model || '',
      modelName,
      errMsg: '',
    };

    try {
      Logger.log(`开始执行简单Agent聊天，模型: ${model}`, 'AgentService');

      // 获取默认模型（如果没有指定）
      const useModel = model || (await this.getDefaultModel());

      // 配置LLM节点
      const nodeConfig: LLMNodeConfig = {
        model: useModel,
        systemPrompt: '你是一个有用的AI助手，请根据用户的问题提供准确、有帮助的回答。',
        outputKey: 'chat_response',
      };

      // 创建执行上下文
      const context: ExecutionContext = {
        messages: [...messagesHistory],
        options: {
          model: useModel,
          chatId,
          modelName,
          abortController,
        },
        state: {},
        onProgress: data => {
          const transformedData = this.transformProgressData(data);
          onProgress?.(transformedData);
        },
        onError: error => {
          Logger.error(`Agent执行出错: ${handleError(error)}`, 'AgentService');
          onFailure?.(error);
        },
        abortController,
      };

      // 执行LLM节点
      const nodeResult = await this.llmNode.execute(nodeConfig, context);

      if (!nodeResult.success) {
        throw new Error(nodeResult.error || 'LLM节点执行失败');
      }

      // 从节点结果中提取内容到结果对象，但不触发onProgress
      const llmResponse = nodeResult.data;
      if (llmResponse) {
        // 优先使用content（编辑总结等场景），否则使用full_content
        result.content = llmResponse.content || llmResponse.full_content || '';

        if (llmResponse.reasoning_content) {
          result.reasoning_content = llmResponse.full_reasoning_content || '';
        }
      }

      result.finishReason = 'stop';

      // 添加简单模式的状态信息
      result._workflowState = {
        mode: 'simple_llm',
        model: useModel,
        nodeType: 'LLM',
        executionTime: new Date().toISOString(),
        success: true,
      };

      Logger.log(`简单Agent聊天完成，结果长度: ${result.content.length}`, 'AgentService');

      return result;
    } catch (error) {
      const errorMessage = handleError(error);
      // 如果是用户主动中断（返回空字符串），不记录错误也不设置错误消息
      if (errorMessage) {
        Logger.error(`简单Agent聊天失败: ${errorMessage}`, 'AgentService');
        result.errMsg = errorMessage;
        result.finishReason = 'error';
        onFailure?.(result);
      } else {
        Logger.debug('Agent对话被用户主动中断', 'AgentService');
      }
      return result;
    }
  }

  /**
   * 获取默认模型
   */
  private async getDefaultModel(): Promise<string> {
    try {
      const config = await this.globalConfigService.getConfigs(['openaiBaseModel']);
      return config.openaiBaseModel || 'gpt-4o-mini';
    } catch (error) {
      Logger.warn(`获取默认模型失败: ${handleError(error)}`, 'AgentService');
      return 'gpt-4o-mini';
    }
  }
}
