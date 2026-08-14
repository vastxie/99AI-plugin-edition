import {
  handleError,
  normalizeReasoningContentForModel,
  shouldKeepReasoningContentForModel,
} from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { NetSearchService } from '../../aiTool/search/netSearch.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { MCPService } from '../../mcp/mcp.service';
import { McpToolService } from '../../mcp/mcpTool.service';
import { ModelsService } from '../../models/models.service';
import { AgentUpdateType, MinimalToolExecution } from '../core/AgentContent.types';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeMeta, NodeOutput } from '../core/NodeInterface';

/**
 * LLM节点 - 使用新架构
 * 支持OpenAI风格的API调用，自动处理模型配置
 */
@Injectable()
export class LLMNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'llm',
    type: 'llm',
    name: 'LLM节点',
    description: '执行大语言模型推理，支持流式输出和多模型配置',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    protected readonly modelsService: ModelsService,
    private readonly netSearchService?: NetSearchService,
    private readonly mcpToolService?: McpToolService,
    private readonly mcpService?: MCPService,
  ) {
    super(globalConfigService, modelsService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    try {
      // 检查是否有预生成的编辑总结
      const editSummaryContent = input.context.state?.editSummaryContent;
      if (editSummaryContent) {
        Logger.log('检测到预生成的编辑总结，跳过AI调用', 'LLMNode');

        // 直接使用预生成的内容，流式发送给前端
        await this.streamEditSummary(editSummaryContent, input);

        // 返回成功结果
        return {
          result: {
            success: true,
            data: {
              content: editSummaryContent,
              skippedAI: true,
            },
          },
          stateUpdates: {
            llmResponse: editSummaryContent,
          },
        };
      }

      // 获取模型名称（优先级：动态参数 > 配置 > 全局默认）
      const modelName = this.getModelName(input);

      // 从数据库获取模型配置
      const modelConfig = await this.getModelConfig(modelName, input);

      // 准备消息历史
      const messages = this.prepareMessages(input.messages, input);

      // 执行OpenAI调用
      const result = await this.executeOpenAI(messages, modelConfig, input);

      // 获取当前的共享状态
      const currentSharedState =
        input.context.state?.sharedState || input.context.state?.thinkingResult || {};

      // 合并LLM结果到共享状态
      const mergedState = this.mergeStates(currentSharedState, result);

      // 返回成功结果
      return this.createSuccessResult(mergedState, input);
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`LLM节点执行失败: ${errorMessage}`);

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
   * 流式发送编辑总结
   */
  private async streamEditSummary(content: string, input: NodeInput): Promise<void> {
    // 模拟流式输出，分块发送
    const chunkSize = 20; // 每块字符数
    const chunks = [];

    // 将内容分块
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // 逐块发送
    for (const chunk of chunks) {
      this.sendStream(input, {
        type: 'text',
        content: chunk,
      });

      // 添加小延迟，模拟流式效果
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    // 发送完成数据
    this.sendStream(input, {
      type: 'data',
      data: {
        done: true,
        totalLength: content.length,
        source: 'editSummary',
      },
    });
  }

  /**
   * 获取模型名称
   */
  private getModelName(input: NodeInput): string {
    return (
      input.dynamicParams?.model ||
      input.config.model ||
      input.context.options?.model ||
      input.globalConfig.openaiBaseModel ||
      'gpt-4o-mini'
    );
  }

  /**
   * 从数据库获取模型配置
   */
  private async getModelConfig(model: string, input: NodeInput): Promise<any> {
    try {
      // 如果上下文中有传递apiKey和proxyUrl，直接使用（这是从chat.service传递过来的）
      if (input.context.options?.apiKey && input.context.options?.proxyUrl) {
        return {
          key: input.context.options.apiKey,
          proxyUrl: input.context.options.proxyUrl,
          model: model,
          temperature: input.context.options.temperature || 0.7,
          timeout: input.context.options.timeout || 60000,
          maxTokens: input.context.options.max_tokens || 4000,
          additionalParams: input.context.options.additionalParams,
        };
      }

      // 从ModelsService获取模型详细配置
      const modelKeyInfo = await this.modelsService.getCurrentModelKeyInfo(model);

      if (!modelKeyInfo) {
        Logger.warn(`未找到模型配置: ${model}，使用默认配置`);

        // 获取全局默认配置
        const globalConfig = await this.globalConfigService.getConfigs([
          'openaiBaseKey',
          'openaiBaseUrl',
          'openaiBaseModel',
          'openaiTemperature',
        ]);

        return {
          key: globalConfig.openaiBaseKey,
          proxyUrl: globalConfig.openaiBaseUrl,
          model: globalConfig.openaiBaseModel || 'gpt-4o-mini',
          temperature: Number(globalConfig.openaiTemperature) || 0.7,
          timeout: 60000,
          maxTokens: 4000,
        };
      }

      // 获取全局temperature配置
      const globalConfig = await this.globalConfigService.getConfigs(['openaiTemperature']);
      const globalTemperature = Number(globalConfig.openaiTemperature) || 0.7;

      // 解析additionalParams中的temperature
      let additionalTemperature;
      try {
        if (modelKeyInfo.additionalParams) {
          const additionalParams =
            typeof modelKeyInfo.additionalParams === 'string'
              ? JSON.parse(modelKeyInfo.additionalParams)
              : modelKeyInfo.additionalParams;
          additionalTemperature = additionalParams.temperature;
        }
      } catch (error) {
        Logger.warn(`解析additionalParams失败: ${error}`);
      }

      // 返回模型配置
      return {
        key: modelKeyInfo.key,
        proxyUrl: modelKeyInfo.proxyUrl,
        model: modelKeyInfo.model,
        temperature: additionalTemperature || globalTemperature,
        timeout: 10 * 60 * 1000, // 统一使用10分钟超时
        maxTokens: modelKeyInfo.max_tokens || modelKeyInfo.maxModelTokens || 4000,
        additionalParams: modelKeyInfo.additionalParams,
      };
    } catch (error) {
      Logger.error(`获取模型配置失败: ${handleError(error)}`);
      throw new Error(`模型配置获取失败: ${error.message}`);
    }
  }

  /**
   * 准备消息，使用共享状态中格式化好的系统消息内容
   */
  private prepareMessages(messages: any[], input: NodeInput): any[] {
    // 深拷贝消息，避免修改原始数据
    const processedMessages = JSON.parse(JSON.stringify(messages));

    // 收集所有格式化好的系统消息
    let additionalSystemContent = '';

    // 统一从 agentData.toolExecutions 获取所有工具执行结果
    if (
      input.context.agentContent?.data?.toolExecutions &&
      input.context.agentContent?.data.toolExecutions.length > 0
    ) {
      const toolExecutions = input.context.agentContent?.data.toolExecutions;

      // 分类处理不同类型的工具执行
      const searchExecutions = [];
      const otherExecutions = [];

      for (const execution of toolExecutions) {
        // 只处理成功的执行
        if (execution.status !== 'success') continue;

        // 更精确地判断是否为搜索工具
        const isSearchTool = (() => {
          // 1. 明确的搜索工具名称
          if (
            execution.name === '联网搜索' ||
            execution.name === 'web_search' ||
            execution.name === 'search'
          ) {
            return true;
          }

          // 2. 排除MCP工具（即使名称包含search）
          if (
            execution.name.includes('_repositories') ||
            execution.name.includes('github') ||
            execution.name.startsWith('mcp_') ||
            execution.name.includes('api_')
          ) {
            return false;
          }

          // 3. 检查输出格式是否符合搜索结果格式
          if (Array.isArray(execution.output)) {
            // 搜索结果通常是数组，包含title和url
            const firstItem = execution.output[0];
            if (
              firstItem &&
              typeof firstItem === 'object' &&
              (firstItem.title || firstItem.snippet) &&
              (firstItem.url || firstItem.link)
            ) {
              return true;
            }
          }

          // 4. 检查是否是MCP格式的输出（包含content数组）
          if (
            execution.output &&
            typeof execution.output === 'object' &&
            execution.output.content &&
            Array.isArray(execution.output.content)
          ) {
            return false; // MCP格式，不是搜索结果
          }

          return false;
        })();

        if (isSearchTool) {
          searchExecutions.push(execution);
        } else {
          otherExecutions.push(execution);
        }
      }

      // 1. 处理搜索结果
      if (searchExecutions.length > 0) {
        additionalSystemContent +=
          '\n\n以下是网络搜索获取的实时信息（这些是最新、最准确的数据，请优先使用这些信息回答用户问题）：\n';

        // 收集所有搜索关键词
        const queries = searchExecutions.map(exec => exec.input).filter(Boolean);
        if (queries.length > 0) {
          additionalSystemContent += '\n搜索关键词：';
          additionalSystemContent += queries.join('、');
          additionalSystemContent += '\n\n搜索结果：\n';
        }

        // 显示所有搜索结果
        let displayedCount = 0;
        const maxToDisplay = 20;

        for (const execution of searchExecutions) {
          const results = execution.output || [];

          // 确保 results 是数组
          const resultsArray = Array.isArray(results) ? results : [];

          for (const result of resultsArray) {
            if (displayedCount >= maxToDisplay) break;

            // 清理标题和内容
            let title = (result.title || '').trim();
            let content = (result.snippet || result.content || result.description || '').trim();
            const link = result.url || result.link || '';
            const domain = result.domain || '';

            // 如果内容为空，跳过
            if (!title && !content) continue;

            // 检测并跳过包含大量乱码的内容
            const weirdCharsInTitle = (title.match(/[^\x20-\x7E\u4e00-\u9fa5]/g) || []).length;
            const weirdCharsInContent = (content.match(/[^\x20-\x7E\u4e00-\u9fa5\s\n]/g) || [])
              .length;

            if (
              (title.length > 0 && weirdCharsInTitle > title.length * 0.3) ||
              (content.length > 0 && weirdCharsInContent > content.length * 0.3)
            ) {
              continue;
            }

            // 限制标题和内容长度
            title = title.substring(0, 100);
            content = content.substring(0, 300);

            displayedCount++;
            additionalSystemContent += `[${displayedCount}] ${title}\n`;
            if (content) {
              additionalSystemContent += `${content}${content.length >= 300 ? '...' : ''}\n`;
            }
            if (domain) {
              additionalSystemContent += `来源: ${domain}\n`;
            }
            if (link) {
              additionalSystemContent += `链接: ${link}\n`;
            }
            additionalSystemContent += '\n';
          }
        }

        if (displayedCount > 0) {
          additionalSystemContent += `\n请基于以上信息回答用户问题，特别注意：
1. 优先使用搜索到的最新信息，因为它们比你的训练数据更新
2. 在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式
3. 如果搜索结果不完整或不足以回答问题，可以结合你的知识进行补充
4. 保持回答的准确性、相关性和有用性`;
        }
      }

      // 2. 处理其他工具结果（MCP等）
      if (otherExecutions.length > 0) {
        additionalSystemContent +=
          '\n\n以下是通过工具获取的实时信息（这些是最新、最准确的数据，请优先使用这些信息回答用户问题）：\n';

        otherExecutions.forEach((execution, idx) => {
          additionalSystemContent += `\n工具调用 ${idx + 1}（${execution.name}）：\n`;
          if (execution.output) {
            // 直接将输出格式化为字符串，不管什么格式
            if (typeof execution.output === 'string') {
              additionalSystemContent += `${execution.output}\n`;
            } else {
              // 对象直接JSON格式化，保留完整结构
              additionalSystemContent += `${JSON.stringify(execution.output, null, 2)}\n`;
            }
          }
        });

        additionalSystemContent += `\n请基于以上信息回答用户问题，特别注意：
1. 如果工具提供了实时数据，请优先使用这些数据，因为它们比你训练数据更新
2. 清晰地引用工具返回的信息，并解释这些信息如何回答用户问题
3. 如果工具结果不完整或不足以回答问题，可以结合你的知识进行补充
4. 保持回答的准确性、相关性和有用性`;
      }
    }

    // 从工具执行结果中查找文件分析结果（使用新格式）
    if (
      input.context.agentContent?.data?.toolExecutions &&
      input.context.agentContent?.data.toolExecutions.length > 0
    ) {
      const fileSearchExecution = input.context.agentContent?.data.toolExecutions.find(
        (tool: any) => tool.type === 'file_search' && tool.status === 'success',
      );

      if (fileSearchExecution && fileSearchExecution.output) {
        additionalSystemContent += `\n\n以下是文件内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
          fileSearchExecution.output,
        )}`;
      }
    }

    // 检查工作流状态中的图片分析结果
    const imageAnalysisResult = input.context.state?.imageAnalysisResult;
    if (imageAnalysisResult && imageAnalysisResult.imageDescription) {
      additionalSystemContent += `\n\n以下是图片内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
        imageAnalysisResult.imageDescription,
      )}`;
    }

    // 检查工作流状态中的思考结果
    const thinkingResult = input.context.state?.thinkingResult || input.context.state?.sharedState;
    if (thinkingResult && thinkingResult.systemMessage) {
      additionalSystemContent += '\n\n' + thinkingResult.systemMessage;
      // Logger.debug('已获取思考节点的系统消息');
    }

    // 如果有额外的系统消息内容，添加到消息中
    if (additionalSystemContent) {
      // Logger.debug(`准备添加额外的系统消息，总长度: ${additionalSystemContent.length}`);

      // 检查是否已存在系统消息
      const systemMessageIndex = processedMessages.findIndex(msg => msg.role === 'system');
      if (systemMessageIndex >= 0) {
        // 追加到现有系统消息
        processedMessages[systemMessageIndex].content += additionalSystemContent;
        // Logger.debug(
        //   `已追加到现有系统消息，新长度: ${processedMessages[systemMessageIndex].content.length}`,
        // );
      } else {
        // 创建新的系统消息
        processedMessages.unshift({
          role: 'system',
          content: `你是一个有用的AI助手。${additionalSystemContent}`,
        });
        // Logger.debug(`已创建新的系统消息，长度: ${additionalSystemContent.length}`);
      }

      // Logger.debug('已将格式化的系统消息附加到messages中');
    } else {
      // Logger.debug('没有额外的系统消息需要添加');
    }

    return processedMessages;
  }

  /**
   * 合并状态
   */
  private mergeStates(currentSharedState: any, result: any): any {
    // 处理reasoning_content的合并逻辑
    let finalReasoningContent = currentSharedState.reasoning_content;
    let finalFullReasoningContent = currentSharedState.full_reasoning_content || '';

    // 如果LLM节点产生了reasoning_content
    if (result.full_reasoning_content) {
      // 如果之前没有reasoning_content（表示ThinkingNode未执行或未产生思考），使用LLM的
      if (!currentSharedState.full_reasoning_content) {
        finalReasoningContent = result.reasoning_content;
        finalFullReasoningContent = result.full_reasoning_content;
      }
      // 如果之前已经有了reasoning_content（表示ThinkingNode已执行），保留之前的
      // 这是为了避免deepThinkingType === 2时，LLM节点覆盖ThinkingNode的结果
    }

    return {
      // 保留所有现有的共享状态字段（包括搜索结果）
      ...currentSharedState,

      // 使用处理后的思考内容
      reasoning_content: finalReasoningContent,
      full_reasoning_content: finalFullReasoningContent,
      thinking_enabled: currentSharedState.thinking_enabled || !!finalFullReasoningContent,
      thinking_type: currentSharedState.thinking_type,
      thinking_model: currentSharedState.thinking_model,

      // 添加LLM的回复内容
      content: result.content || [],
      full_content: result.full_content || '',

      // 其他信息
      finishReason: result.finishReason || 'stop',
      llm_executed: true,
    };
  }

  /**
   * 创建成功结果
   */
  private createSuccessResult(mergedState: any, input: NodeInput): NodeOutput {
    const outputKey = input.config.outputKey || 'llm_response';

    return {
      result: {
        success: true,
        data: mergedState,
        metadata: {
          model: this.getModelName(input),
          tokenCount: mergedState.full_content?.length || 0,
        },
      },
      stateUpdates: {
        [outputKey]: mergedState,
        sharedState: mergedState,
      },
      agentDataUpdates: {
        llm: {
          model: this.getModelName(input),
          response: mergedState.full_content,
          reasoning: mergedState.full_reasoning_content,
          executed: true,
        },
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
    };
  }

  /**
   * 执行OpenAI风格的API调用
   */
  private async executeOpenAI(messages: any[], modelConfig: any, input: NodeInput): Promise<any> {
    // 创建OpenAI客户端
    const openai = new OpenAI({
      apiKey: modelConfig.key,
      baseURL: await correctApiBaseUrl(modelConfig.proxyUrl || ''),
      timeout: modelConfig.timeout,
    });

    // 解析附加参数
    const parsedAdditionalParams = this.parseAdditionalParams(modelConfig.additionalParams);
    normalizeReasoningContentForModel(
      messages,
      modelConfig.model,
      parsedAdditionalParams,
      'LLMNode',
    );
    const nativeToolConfig = await this.prepareNativeToolConfig(input, parsedAdditionalParams);

    // 记录参数优先级处理
    if (parsedAdditionalParams.max_tokens !== undefined) {
    }
    if (parsedAdditionalParams.temperature !== undefined) {
    }

    // 从 parsedAdditionalParams 中剔除已经显式处理的参数，避免重复传递
    const {
      max_tokens: additionalMaxTokens,
      temperature: additionalTemperature,
      tools: _additionalTools,
      tool_choice: additionalToolChoice,
      nativeToolCalling: _nativeToolCalling,
      native_tool_calling: _nativeToolCallingSnake,
      nativeTools: _nativeTools,
      native_tools: _nativeToolsSnake,
      nativeToolMaxRounds: _nativeToolMaxRounds,
      native_tool_max_rounds: _nativeToolMaxRoundsSnake,
      ...otherAdditionalParams
    } = parsedAdditionalParams;

    // 构建请求参数，强制使用流式处理
    const requestParams: any = {
      model: modelConfig.model,
      messages: messages,
      stream: true, // 强制使用流式处理
      max_tokens: this.getEffectiveMaxTokens(input, modelConfig, additionalMaxTokens),
      temperature: this.getEffectiveTemperature(input, modelConfig, additionalTemperature),
      ...otherAdditionalParams, // 其他additionalParams参数直接应用
    };

    if (nativeToolConfig.enabled) {
      requestParams.tools = nativeToolConfig.tools;
      requestParams.tool_choice = additionalToolChoice || 'auto';
    }

    // 记录请求参数，特别关注 max_tokens
    Logger.log(
      `AI请求参数 [模型: ${modelConfig.model}] - max_tokens: ${
        requestParams.max_tokens || '未设置'
      }, temperature: ${requestParams.temperature}, messages: ${messages.length}条`,
      'LLMNode',
    );

    // 强制使用流式处理
    return await this.handleOpenAIStream(openai, requestParams, input, nativeToolConfig);
  }

  private async prepareNativeToolConfig(
    input: NodeInput,
    additionalParams: Record<string, any>,
  ): Promise<{
    enabled: boolean;
    tools: any[];
    clientToolsMap: Record<string, any>;
    maxRounds: number;
  }> {
    const paramTools = Array.isArray(additionalParams.tools) ? additionalParams.tools : [];
    const requested =
      additionalParams.nativeToolCalling === true ||
      additionalParams.native_tool_calling === true ||
      additionalParams.nativeTools === true ||
      additionalParams.native_tools === true ||
      paramTools.length > 0;

    const maxRounds =
      Number(additionalParams.nativeToolMaxRounds || additionalParams.native_tool_max_rounds) ||
      Number(input.context.options?.maxToolCallsPerRequest) ||
      Number(input.config.maxToolCallsPerRequest) ||
      5;

    if (!requested) {
      return { enabled: false, tools: [], clientToolsMap: {}, maxRounds };
    }

    let clientToolsMap: Record<string, any> = {};
    const tools = paramTools.length > 0 ? [...paramTools] : [this.getWebSearchToolDefinition()];

    try {
      const mcpTools = await this.mcpToolService?.getToolsForAgent(
        input.context.options?.authActor,
      );
      if (mcpTools?.clientToolsMap) {
        clientToolsMap = mcpTools.clientToolsMap;
      }
      if (paramTools.length === 0 && Array.isArray(mcpTools?.tools)) {
        tools.push(...mcpTools.tools);
      }
    } catch (error) {
      Logger.warn(`原生工具列表获取失败，将仅使用已配置工具: ${handleError(error)}`, 'LLMNode');
    }

    return {
      enabled: tools.length > 0,
      tools,
      clientToolsMap,
      maxRounds,
    };
  }

  private getWebSearchToolDefinition(): any {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索网络获取实时信息，如天气、新闻、股价、时间、位置信息等。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，应该是一个具体的查询内容',
            },
            explanation: {
              type: 'string',
              description: '搜索目的说明',
            },
          },
          required: ['query'],
        },
      },
    };
  }

  /**
   * 获取有效的max_tokens值（优先级：dynamicParams > config > additionalParams > modelConfig）
   */
  private getEffectiveMaxTokens(
    input: NodeInput,
    modelConfig: any,
    additionalMaxTokens?: number,
  ): number | undefined {
    if (input.dynamicParams?.maxTokens !== undefined) {
      // Logger.debug(`使用动态参数的maxTokens: ${input.dynamicParams.maxTokens}`);
      return input.dynamicParams.maxTokens;
    }
    if (input.config.maxTokens !== undefined) {
      // Logger.debug(`使用节点配置的maxTokens: ${input.config.maxTokens}`);
      return input.config.maxTokens;
    }
    if (additionalMaxTokens !== undefined) {
      // Logger.debug(`使用additionalParams的max_tokens: ${additionalMaxTokens}`);
      return additionalMaxTokens;
    }
    if (modelConfig.maxTokens !== undefined) {
      // Logger.debug(`使用模型配置的maxTokens: ${modelConfig.maxTokens}`);
      return modelConfig.maxTokens;
    }
    return undefined;
  }

  /**
   * 获取有效的temperature值（优先级：dynamicParams > config > additionalParams > modelConfig）
   */
  private getEffectiveTemperature(
    input: NodeInput,
    modelConfig: any,
    additionalTemperature?: number,
  ): number | undefined {
    if (input.dynamicParams?.temperature !== undefined) {
      // Logger.debug(`使用动态参数的temperature: ${input.dynamicParams.temperature}`);
      return input.dynamicParams.temperature;
    }
    if (input.config.temperature !== undefined) {
      // Logger.debug(`使用节点配置的temperature: ${input.config.temperature}`);
      return input.config.temperature;
    }
    if (additionalTemperature !== undefined) {
      // Logger.debug(`使用additionalParams的temperature: ${additionalTemperature}`);
      return additionalTemperature;
    }
    if (modelConfig.temperature !== undefined) {
      // Logger.debug(`使用模型配置的temperature: ${modelConfig.temperature}`);
      return modelConfig.temperature;
    }
    return undefined;
  }

  /**
   * 处理OpenAI流式响应
   */
  private async handleOpenAIStream(
    openai: OpenAI,
    requestParams: any,
    input: NodeInput,
    nativeToolConfig: {
      enabled: boolean;
      tools: any[];
      clientToolsMap: Record<string, any>;
      maxRounds: number;
    } = { enabled: false, tools: [], clientToolsMap: {}, maxRounds: 0 },
  ): Promise<any> {
    let finalContent = '';
    let fullReasoningContent = '';
    let actualUsage: any = null; // 用于存储API返回的实际token使用量

    try {
      const messages = requestParams.messages;
      const maxNativeRounds = nativeToolConfig.enabled
        ? Math.max(nativeToolConfig.maxRounds, 1)
        : 1;

      for (let round = 0; round < maxNativeRounds; round++) {
        normalizeReasoningContentForModel(messages, requestParams.model, requestParams, 'LLMNode');

        const stream = (await openai.chat.completions.create(
          {
            ...requestParams,
            messages,
          },
          {
            signal: input.context.abortController?.signal,
          },
        )) as any;

        let roundContent = '';
        let roundReasoningContent = '';
        const toolCallChunks = new Map<number, { id: string; name: string; arguments: string }>();

        for await (const chunk of stream) {
          if (input.context.abortController?.signal.aborted) {
            break;
          }

          const delta = chunk.choices[0]?.delta;
          const content = delta?.content || '';
          const reasoningContent = (delta as any)?.reasoning_content || '';

          // 检查是否有usage信息（一些API在最后一个chunk中返回usage）
          if (chunk.usage) {
            actualUsage = chunk.usage;
            Logger.debug(
              `[llm] token使用量 - 输入: ${chunk.usage.prompt_tokens}, 输出: ${chunk.usage.completion_tokens}, 总计: ${chunk.usage.total_tokens}`,
            );
          }

          // 处理普通内容。非原生工具模式保持原来的逐段流式输出；
          // 原生工具模式需要先判断本轮是否包含 tool_calls，因此先缓冲。
          if (content) {
            roundContent += content;
            if (!nativeToolConfig.enabled) {
              finalContent += content;
              this.sendStream(input, {
                type: 'text',
                content: content,
                metadata: {
                  nodeType: 'llm',
                  status: 'streaming',
                  full_content: finalContent,
                },
              });
            }
          }

          // 处理推理内容
          if (reasoningContent) {
            roundReasoningContent += reasoningContent;
            fullReasoningContent += reasoningContent;
            // 发送推理内容流
            this.sendStream(input, {
              type: 'data',
              data: {
                nodeType: 'llm',
                status: 'reasoning',
                reasoning_content: [{ type: 'text', text: reasoningContent }],
                full_reasoning_content: fullReasoningContent,
              },
            });
          }

          if ((delta as any)?.tool_calls) {
            for (const tc of (delta as any).tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallChunks.has(idx)) {
                toolCallChunks.set(idx, { id: '', name: '', arguments: '' });
              }
              const entry = toolCallChunks.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name += tc.function.name;
              if (tc.function?.arguments) entry.arguments += tc.function.arguments;
            }
          }
        }

        const toolCalls = this.buildToolCallsFromChunks(toolCallChunks);
        if (!nativeToolConfig.enabled || toolCalls.length === 0) {
          if (nativeToolConfig.enabled && roundContent) {
            finalContent += roundContent;
            this.sendStream(input, {
              type: 'text',
              content: roundContent,
              metadata: {
                nodeType: 'llm',
                status: 'streaming',
                full_content: finalContent,
              },
            });
          }
          break;
        }

        Logger.log(
          `[NativeTool] R${round + 1} 模型请求工具调用: ${toolCalls
            .map(tc => tc.function?.name)
            .join(', ')}`,
          'LLMNode',
        );

        const assistantMsg: any = {
          role: 'assistant',
          content: roundContent || null,
          tool_calls: toolCalls,
        };
        if (shouldKeepReasoningContentForModel(requestParams.model, requestParams)) {
          assistantMsg.reasoning_content = roundReasoningContent || '';
        }
        messages.push(assistantMsg);

        for (const toolCall of toolCalls) {
          const toolResult = await this.executeNativeToolCall(toolCall, input, nativeToolConfig);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // 流式处理完成，发送完成状态
      // this.sendStream(input, {
      //   type: 'status',
      //   status: 'completed',
      //   content: '模型生成完成',
      //   metadata: {
      //     nodeType: 'llm',
      //     finishReason: 'stop',
      //     full_content: fullContent,
      //     full_reasoning_content: fullReasoningContent,
      //   },
      // });

      // 记录 Token 使用情况 - 使用处理后的messages（包含追加的系统消息）
      const inputText = requestParams.messages.map(m => `${m.role}: ${m.content || ''}`).join('\n');
      const outputText = fullReasoningContent + finalContent;
      await this.recordTokenUsage(input, inputText, outputText, 'LLM生成回复', actualUsage);

      // 返回完整结果供后续处理使用，但不在这里触发onProgress
      return {
        full_content: finalContent,
        full_reasoning_content: fullReasoningContent,
        // 如果有reasoning_content，也返回数组格式
        reasoning_content: fullReasoningContent
          ? [{ type: 'text', text: fullReasoningContent }]
          : undefined,
        finishReason: 'stop',
      };
    } catch (error) {
      Logger.error(`OpenAI流式请求失败: ${handleError(error)}`);
      throw error;
    }
  }

  private buildToolCallsFromChunks(
    toolCallChunks: Map<number, { id: string; name: string; arguments: string }>,
  ): any[] {
    return [...toolCallChunks.keys()]
      .sort((a, b) => a - b)
      .map(index => {
        const item = toolCallChunks.get(index)!;
        if (!item.name) return null;
        return {
          id: item.id || `call_${index}_${Date.now()}`,
          type: 'function',
          function: {
            name: item.name,
            arguments: item.arguments || '{}',
          },
        };
      })
      .filter(Boolean);
  }

  private async executeNativeToolCall(
    toolCall: any,
    input: NodeInput,
    nativeToolConfig: { clientToolsMap: Record<string, any> },
  ): Promise<string> {
    const functionName = toolCall.function?.name || 'unknown_tool';
    const toolId = toolCall.id || `native_tool_${Date.now()}`;
    let args: any = {};
    try {
      args = JSON.parse(toolCall.function?.arguments || '{}');
    } catch (error) {
      args = {};
    }

    this.emitNativeToolStatus(toolId, functionName, 'loading', args, null, input);

    try {
      if (functionName === 'web_search') {
        const query = typeof args === 'string' ? args : args.query;
        if (!query) {
          throw new Error('缺少搜索关键词 query');
        }
        if (!this.netSearchService) {
          throw new Error('联网搜索服务不可用');
        }
        const searchResponse = await this.netSearchService.webSearchPro(query);
        const results = (searchResponse?.searchResults || []).slice(0, 10).map((item: any) => ({
          title: item.title || '',
          content: item.content || item.snippet || '',
          url: item.link || item.url || '',
        }));
        this.emitNativeToolStatus(toolId, '联网搜索', 'success', args, results, input);
        return JSON.stringify({ query, results });
      }

      const mappedTool = nativeToolConfig.clientToolsMap[functionName];
      if (!mappedTool || !this.mcpService) {
        throw new Error(`未找到可执行工具: ${functionName}`);
      }

      const result = await this.mcpService.callTool(
        mappedTool.clientName,
        mappedTool.toolName,
        args,
        input.context.options?.authActor,
      );
      this.emitNativeToolStatus(toolId, functionName, 'success', args, result, input);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      const errorMessage = handleError(error);
      this.emitNativeToolStatus(toolId, functionName, 'error', args, errorMessage, input);
      return `工具调用失败: ${errorMessage}`;
    }
  }

  private emitNativeToolStatus(
    toolId: string,
    name: string,
    status: string,
    inputData: any,
    output: any,
    input: NodeInput,
  ): void {
    const tool: MinimalToolExecution = {
      name,
      status,
      input: inputData,
      output,
      time: Date.now(),
    };
    this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, tool, toolId);
  }

  /**
   * 解析附加参数
   */
  private parseAdditionalParams(additionalParams?: any): any {
    if (!additionalParams) {
      return {};
    }

    try {
      let parsed = {};
      if (typeof additionalParams === 'string') {
        parsed = JSON.parse(additionalParams);
        // Logger.debug(`成功解析additionalParams字符串: ${Object.keys(parsed).join(', ')}`);
      } else if (typeof additionalParams === 'object') {
        parsed = additionalParams;
        // Logger.debug(`使用additionalParams对象: ${Object.keys(parsed).join(', ')}`);
      }

      // 记录解析到的参数
      const paramKeys = Object.keys(parsed);
      if (paramKeys.length > 0) {
        // Logger.debug(`解析到的additionalParams参数: ${paramKeys.join(', ')}`);
      }

      return parsed;
    } catch (error) {
      // Logger.warn(`解析additionalParams失败: ${error.message}`);
      return {};
    }
  }
}
