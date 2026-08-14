import { correctApiBaseUrl, normalizeReasoningContentForModel } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { NetSearchService } from '../../aiTool/search/netSearch.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { McpToolService } from '../../mcp/mcpTool.service';
import { MCPService } from '../../mcp/mcp.service';
import { RedisCacheService } from '../../redisCache/redisCache.service';
import { AgentUpdateType, MinimalToolExecution } from '../core/AgentContent.types';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeMeta, NodeOutput } from '../core/NodeInterface';

/**
 * 统一工具节点 - 使用FC模型统一调度所有工具
 * 支持并行调用多个工具
 */
@Injectable()
export class UnifiedToolNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'unified_tool',
    type: 'tool',
    name: '统一工具调度节点',
    description: '使用FC模型统一规划和调度所有工具调用',
    version: '1.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    private readonly netSearchService: NetSearchService,
    private readonly mcpToolService: McpToolService,
    private readonly mcpService: MCPService,
    private readonly redisCacheService: RedisCacheService,
  ) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    try {
      // 1. 检查是否启用工具
      const usingTool = this.getConfigValue(input, 'usingTool', false);

      if (!usingTool) {
        Logger.debug('工具未启用，跳过执行');
        return this.createSkipResult('工具未启用');
      }

      if (this.shouldSkipForNativeToolCalling(input)) {
        Logger.debug('已启用原生工具调用，跳过FC工具规划', 'UnifiedToolNode');
        return this.createSkipResult('原生工具调用模式');
      }

      // 2. 获取FC模型配置
      const configs = await this.globalConfigService.getConfigs([
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
        'maxToolCallsPerRequest',
      ]);

      if (!configs?.toolCallUrl || !configs?.toolCallKey || !configs?.toolCallModel) {
        Logger.warn('未配置FC模型，跳过工具调用');
        return this.createSkipResult('FC模型未配置');
      }

      // 3. 获取可用的MCP工具列表
      const { tools: mcpTools, clientToolsMap } = await this.getMcpTools(input);

      // 4. 构建所有可用工具的定义
      const availableTools = this.buildToolDefinitions(mcpTools, clientToolsMap);

      // 5. 使用FC模型生成工具调用计划
      const toolCalls = await this.generateToolCalls(input, configs, availableTools);

      if (!toolCalls || toolCalls.length === 0) {
        Logger.debug('没有生成工具调用');
        return this.createSkipResult('无需调用工具');
      }

      // 5.1 限制工具调用次数（从配置读取，默认5次）
      const maxToolCalls = Number(configs.maxToolCallsPerRequest) || 5;
      if (toolCalls.length > maxToolCalls) {
        Logger.warn(
          `FC模型生成了 ${toolCalls.length} 个工具调用，超过最大限制 ${maxToolCalls}，将只执行前 ${maxToolCalls} 个`,
        );
        toolCalls.splice(maxToolCalls); // 只保留前maxToolCalls个
      }

      // 6. 并行执行所有工具调用
      const toolResults = await this.executeToolCalls(toolCalls, input, clientToolsMap);

      // 7. 构建系统消息
      const systemMessage = this.formatToolResults(toolResults);

      // 8. 将工具结果统一存储到 toolExecutions
      // 这样 LLMNode 和其他节点可以统一读取
      const toolExecutions = toolResults.map(result => {
        if (result.type === 'search') {
          return {
            id: result.id,
            type: 'search', // 添加type字段
            name: '联网搜索',
            status: 'success',
            input: result.input || result.query,
            output: result.results,
            time: result.duration ? Date.now() - result.duration : Date.now(),
          };
        } else if (result.type === 'mcp') {
          return {
            id: result.id,
            type: 'mcp', // 添加type字段
            name: result.name,
            status: 'success',
            input: result.params,
            output: result.result,
            time: result.duration ? Date.now() - result.duration : Date.now(),
          };
        }
        return result; // 其他类型直接返回
      });

      // 9. 返回结果（统一使用 toolExecutions 格式）
      return {
        result: {
          success: true,
          data: {
            toolCount: toolResults.length,
            systemMessage,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'toolResult']: {
            tools: toolResults,
            systemMessage,
          },
        },
        agentDataUpdates: {
          toolExecutions, // 统一存储工具执行结果
        },
      };
    } catch (error) {
      Logger.error(`工具执行失败: ${error.message}`);
      return this.createErrorResult(error.message);
    }
  }

  /**
   * 获取MCP工具列表（从缓存或MCP服务）
   */
  private async getMcpTools(input: NodeInput): Promise<{ tools: any[]; clientToolsMap: any }> {
    try {
      // 直接调用mcpToolService获取工具
      const toolsData = await this.mcpToolService.getToolsForAgent(
        input.context.options?.authActor,
      );

      if (toolsData && toolsData.tools) {
        return toolsData;
      }

      Logger.warn('MCP服务返回空工具列表');
      return { tools: [], clientToolsMap: {} };
    } catch (error) {
      Logger.warn(`获取MCP工具失败: ${error.message}`);
      return { tools: [], clientToolsMap: {} };
    }
  }

  private shouldSkipForNativeToolCalling(input: NodeInput): boolean {
    const additionalParams = this.parseAdditionalParams(input.context.options?.additionalParams);
    return (
      additionalParams.nativeToolCalling === true ||
      additionalParams.native_tool_calling === true ||
      additionalParams.nativeTools === true ||
      additionalParams.native_tools === true ||
      (Array.isArray(additionalParams.tools) && additionalParams.tools.length > 0)
    );
  }

  private parseAdditionalParams(additionalParams?: any): Record<string, any> {
    if (!additionalParams) {
      return {};
    }

    if (typeof additionalParams === 'object') {
      return additionalParams;
    }

    try {
      return JSON.parse(additionalParams);
    } catch {
      return {};
    }
  }

  /**
   * 构建工具定义
   */
  private buildToolDefinitions(mcpTools: any[], clientToolsMap: any): any[] {
    const tools = [];

    // 1. 网络搜索工具
    tools.push({
      type: 'function' as const,
      function: {
        name: 'web_search',
        description:
          '搜索网络获取实时信息，如天气、新闻、股价、时间、位置信息等。请同时提供搜索关键词和搜索目的说明。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，应该是一个具体的查询内容',
            },
            explanation: {
              type: 'string',
              description:
                '【重要】搜索目的说明，使用"获取/了解/查询/确认"等动词开头，简洁说明搜索意图（例如："获取最新天气信息"、"了解股票价格"、"查询航班信息"）',
            },
          },
          required: ['query', 'explanation'],
        },
      },
    });

    // 2. MCP工具（直接使用缓存的工具定义）
    // mcpTools 已经是格式化好的工具定义了
    for (const mcpTool of mcpTools) {
      // MCP工具已经有正确的格式：
      // {
      //   type: 'function',
      //   function: {
      //     name: 'tool_name',
      //     description: '...',
      //     parameters: { type: 'object', properties: {...}, required: [...] }
      //   }
      // }
      tools.push(mcpTool);
    }

    // 存储clientToolsMap供后续使用
    (this as any)._clientToolsMap = clientToolsMap;

    return tools;
  }

  /**
   * 使用FC模型生成工具调用
   */
  private async generateToolCalls(input: NodeInput, configs: any, tools: any[]): Promise<any[]> {
    const startTime = Date.now();

    try {
      // 准备完整的消息历史
      const messages = this.prepareMessages(input);
      normalizeReasoningContentForModel(
        messages,
        configs.toolCallModel,
        undefined,
        'UnifiedToolNode',
      );

      Logger.log(
        `[FC] 开始生成工具调用 | 模型:${configs.toolCallModel} | 工具数:${tools.length} | 消息数:${messages.length}`,
        'UnifiedToolNode',
      );

      // 记录可用工具列表
      const toolNames = tools.map(t => t.function.name).join(', ');
      Logger.debug(`[FC] 可用工具: ${toolNames}`, 'UnifiedToolNode');

      const client = new OpenAI({
        apiKey: configs.toolCallKey,
        baseURL: await correctApiBaseUrl(configs.toolCallUrl),
      });

      const response = await client.chat.completions.create({
        model: configs.toolCallModel,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.8,
        max_tokens: 4000,
      });

      const duration = Date.now() - startTime;
      const message = response.choices[0]?.message;

      Logger.log(
        `[FC] 收到响应 | 耗时:${duration}ms | 有工具调用:${!!message?.tool_calls} | 调用数量:${
          message?.tool_calls?.length || 0
        }`,
        'UnifiedToolNode',
      );

      // 统计 token 使用量
      if (response.usage) {
        const tokenUsage = {
          inputTokens: response.usage.prompt_tokens || 0,
          outputTokens: response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0,
        };

        // 发送 token 使用统计
        this.sendAgentUpdate(
          input,
          AgentUpdateType.TOKEN_USAGE,
          {
            nodeId: this.meta.id,
            nodeType: this.meta.type,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            description: 'FC工具规划',
          },
          `token_usage_fc_${Date.now()}`,
        );

        // 更新累计统计
        if (input.context.tokenUsage) {
          input.context.tokenUsage.totalInputTokens += tokenUsage.inputTokens;
          input.context.tokenUsage.totalOutputTokens += tokenUsage.outputTokens;
          input.context.tokenUsage.totalTokens += tokenUsage.totalTokens;
          input.context.tokenUsage.details.push({
            nodeId: input.context.currentNodeId || this.meta.id,
            nodeType: this.meta.type,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            description: 'FC工具规划',
            timestamp: new Date().toISOString(),
          });
        }

        Logger.log(
          `🎯 [FC调用] Token使用 - 输入: ${tokenUsage.inputTokens} tokens, 输出: ${
            tokenUsage.outputTokens
          } tokens, 本次总计: ${tokenUsage.totalTokens} tokens, 累计总计: ${
            input.context.tokenUsage?.totalTokens || tokenUsage.totalTokens
          } tokens`,
        );
      }

      if (!message?.tool_calls || message.tool_calls.length === 0) {
        Logger.debug(`[FC] 模型未生成工具调用`, 'UnifiedToolNode');
        return [];
      }

      // 记录每个工具调用的详细信息
      Logger.log(`[FC] 生成 ${message.tool_calls.length} 个工具调用`, 'UnifiedToolNode');
      message.tool_calls.forEach((toolCall, index) => {
        const args = JSON.parse(toolCall.function.arguments);
        Logger.debug(
          `[FC] 工具调用${index + 1} | 名称:${toolCall.function.name} | 参数:${JSON.stringify(
            args,
          )}`,
          'UnifiedToolNode',
        );
      });

      return message.tool_calls;
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(
        `[FC] 生成工具调用失败 | 耗时:${duration}ms | 错误:${error.message} | 堆栈:${error.stack}`,
        'UnifiedToolNode',
      );
      return [];
    }
  }

  /**
   * 准备消息历史
   */
  private prepareMessages(input: NodeInput): any[] {
    const messages = input.messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: content,
      };
    });

    // 添加系统提示
    if (messages[0]?.role !== 'system') {
      messages.unshift({
        role: 'system' as const,
        content: `你是一个积极主动的智能助手，擅长利用工具获取信息。你的核心原则是：宁可多调用也不要漏掉关键信息。

【工具调用策略 - 请严格遵守】

1. 问题拆解原则（必须主动拆分）：
   - 遇到复杂问题，必须拆分成多个独立的搜索任务
   - 每个实体、地点、概念都应该单独搜索一次
   - 示例："比较深圳和北京的天气及生活成本"
     → 必须调用4次: "深圳天气"+"北京天气"+"深圳生活成本"+"北京生活成本"
   - 示例："了解特斯拉Model 3和比亚迪海豹的性能对比"
     → 必须调用3次: "特斯拉Model 3性能参数"+"比亚迪海豹性能参数"+"电动车性能对比评测"

2. 多角度搜索原则（扩展信息维度）：
   - 对于复杂话题，从不同角度搜索以获得全面信息
   - 示例："了解区块链技术"
     → 调用3次: "区块链技术原理"+"区块链应用场景"+"区块链最新发展"
   - 示例："分析某公司投资价值"
     → 调用4次: "公司财报数据"+"行业竞争格局"+"公司最新新闻"+"分析师评级"

3. 实时信息优先原则：
   - 只要涉及以下内容，必须使用web_search工具：
     * 时间相关：当前时间、日期、最新消息、今天/明天
     * 地点相关：天气、交通、当地信息、营业时间
     * 数据相关：股价、汇率、比分、排名、统计数据
     * 动态内容：新闻、事件、政策、产品发布、版本更新

4. 工具组合原则：
   - 同时需要搜索和其他功能时，必须同时调用多个工具
   - MCP工具可以与web_search工具组合使用
   - 优先选择能提供最全面信息的工具组合

5. 参数完整性原则：
   - 每次调用web_search时，必须提供query和explanation两个参数
   - query: 具体明确的搜索关键词（5-15字为佳）
   - explanation: 使用"获取/了解/查询/对比/分析/确认"等动词开头，清晰说明搜索意图

【调用示例】

用户问："帮我了解一下今天深圳的天气，顺便看看北京怎么样"
正确做法（调用2次）：
- web_search(query="深圳天气今天", explanation="获取深圳当天天气情况")
- web_search(query="北京天气今天", explanation="获取北京当天天气情况")

用户问："苹果公司最近有什么新产品发布吗？市场反响如何？"
正确做法（调用3次）：
- web_search(query="苹果公司最新产品发布", explanation="查询苹果最新产品发布信息")
- web_search(query="苹果新品市场反馈", explanation="了解市场对新品的反响")
- web_search(query="苹果新品销量数据", explanation="获取新品销售数据")

用户问："比较一下iPhone 15和华为Mate 60哪个更好"
正确做法（调用5次）：
- web_search(query="iPhone 15性能参数配置", explanation="获取iPhone 15详细规格")
- web_search(query="华为Mate 60性能参数配置", explanation="获取华为Mate 60详细规格")
- web_search(query="iPhone 15用户评价", explanation="了解iPhone 15用户反馈")
- web_search(query="华为Mate 60用户评价", explanation="了解华为Mate 60用户反馈")
- web_search(query="iPhone 15对比华为Mate 60评测", explanation="查看专业对比评测")

【重要提醒】
- 宁可多调用几次工具，也不要信息不全
- 当不确定是否需要调用时，优先选择调用
- 并行调用多个工具不会增加等待时间
- 工具调用的目的是为用户提供最准确、最全面的信息`,
      });
    }

    return messages;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(
    toolCalls: any[],
    input: NodeInput,
    clientToolsMap: any,
  ): Promise<any[]> {
    const results = [];

    // 将工具调用分为两组：搜索工具和MCP工具
    const searchCalls = [];
    const mcpCalls = [];

    for (const [index, toolCall] of toolCalls.entries()) {
      const functionName = toolCall.function.name;
      if (functionName === 'web_search') {
        searchCalls.push({ index, toolCall });
      } else {
        mcpCalls.push({ index, toolCall });
      }
    }

    // 先执行所有搜索工具
    let executionOrder = 0;
    for (const { toolCall } of searchCalls) {
      const toolId = `tool_${Date.now()}_${executionOrder}`;
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      try {
        const result = await this.executeSearch(args, toolId, input);
        if (result !== null) {
          results.push(result);
        }
      } catch (error) {
        Logger.error(`搜索工具执行失败 ${functionName}: ${error.message}`);
      }

      executionOrder++;
      // 添加小延迟以确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 再执行所有MCP工具
    for (const { toolCall } of mcpCalls) {
      const toolId = `tool_${Date.now()}_${executionOrder}`;
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      try {
        // MCP工具（工具名称已经是原始名称，不需要去掉前缀）
        const toolInfo = clientToolsMap[functionName];
        if (toolInfo) {
          const result = await this.executeMcp(functionName, args, toolId, input, toolInfo);
          if (result !== null) {
            results.push(result);
          }
        } else {
          Logger.warn(`未找到工具映射: ${functionName}`);
        }
      } catch (error) {
        Logger.error(`MCP工具执行失败 ${functionName}: ${error.message}`);
      }

      executionOrder++;
      // 添加小延迟以确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return results;
  }

  /**
   * 执行单个搜索
   */
  private async executeSearch(args: any, toolId: string, input: NodeInput): Promise<any> {
    const startTime = Date.now();

    // 提取参数
    const query = typeof args === 'string' ? args : args.query;
    const explanation = typeof args === 'object' ? args.explanation : undefined;

    // 构造完整的输入信息（包括说明）
    const fullInput = explanation ? { query, explanation } : query;

    Logger.log(
      `[工具] 开始执行搜索 | 工具ID:${toolId} | 关键词:"${query}" | 说明:${explanation || '无'}`,
      'UnifiedToolNode',
    );

    try {
      // 发送loading状态
      const loadingTool: MinimalToolExecution = {
        name: '联网搜索',
        status: 'loading',
        input: fullInput,
        output: null,
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, loadingTool, toolId);

      // 执行搜索（只使用 query 参数）
      const searchResponse = await this.netSearchService.webSearchPro(query);

      // 处理结果
      const results = searchResponse?.searchResults || [];
      const images = searchResponse?.images || [];

      const formattedResults = results.slice(0, 10).map((item: any) => ({
        title: item.title || '',
        content: item.content || item.snippet || '',
        url: item.link || item.url || '',
        domain: this.extractDomain(item.link || item.url || ''),
      }));

      // 发送成功状态
      const successTool: MinimalToolExecution = {
        name: '联网搜索',
        status: 'success',
        input: fullInput,
        output: formattedResults,
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, successTool, toolId);

      const duration = Date.now() - startTime;

      Logger.log(
        `[工具] 搜索完成 | 工具ID:${toolId} | 关键词:"${query}" | 耗时:${duration}ms | 结果数:${formattedResults.length} | 图片数:${images.length}`,
        'UnifiedToolNode',
      );

      // 记录第一个搜索结果预览
      if (formattedResults.length > 0) {
        const first = formattedResults[0];
        Logger.debug(
          `[工具] 搜索预览 | 标题:"${first.title}" | 域名:${first.domain} | 内容长度:${first.content.length}`,
          'UnifiedToolNode',
        );
      }

      return {
        id: toolId,
        type: 'search',
        query,
        input: fullInput,
        results: formattedResults,
        images,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // 发送错误状态
      const errorTool: MinimalToolExecution = {
        name: '联网搜索',
        status: 'error',
        input: fullInput,
        output: error.message,
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, errorTool, toolId);

      Logger.error(
        `[工具] 搜索失败 | 工具ID:${toolId} | 关键词:"${query}" | 耗时:${duration}ms | 错误:${error.message}`,
        'UnifiedToolNode',
      );
      return null;
    }
  }

  /**
   * 执行MCP工具
   */
  private async executeMcp(
    toolName: string,
    args: any,
    toolId: string,
    input: NodeInput,
    _toolInfo: { clientName: string; toolName: string },
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // 1. 发送loading状态
      const loadingTool: MinimalToolExecution = {
        name: toolName,
        status: 'loading',
        input: args,
        output: null,
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, loadingTool, toolId);

      // 2. 调用MCP工具
      // 直接调用MCP服务
      const result = await this.mcpService.callTool(
        _toolInfo.clientName,
        _toolInfo.toolName,
        args,
        input.context.options?.authActor,
      );

      // 3. 发送成功状态
      const successTool: MinimalToolExecution = {
        name: toolName,
        status: 'success',
        input: args,
        output: result, // 现在result是结构化数据而不是字符串
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, successTool, toolId);

      Logger.log(`MCP工具完成: ${toolName}`);

      return {
        id: toolId,
        type: 'mcp',
        name: toolName,
        params: args,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // 发送错误状态
      const errorTool: MinimalToolExecution = {
        name: toolName,
        status: 'error',
        input: args,
        output: error.message,
        time: Date.now(),
      };
      this.sendAgentUpdate(input, AgentUpdateType.TOOL_EXECUTION, errorTool, toolId);

      Logger.error(`MCP工具失败 ${toolName}: ${error.message}`);
      return null;
    }
  }

  /**
   * 格式化工具结果为系统消息
   */
  private formatToolResults(toolResults: any[]): string {
    if (!toolResults || toolResults.length === 0) {
      return '';
    }

    const messages = toolResults
      .map(result => {
        if (result.type === 'search') {
          const count = result.results?.length || 0;
          return `搜索"${result.query}"找到${count}条结果`;
        } else if (result.type === 'mcp') {
          return `${result.name}执行完成`;
        }
        return '';
      })
      .filter(msg => msg);

    return messages.join('；');
  }

  /**
   * 提取域名
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return '';
    }
  }

  /**
   * 创建跳过结果
   */
  private createSkipResult(reason: string): NodeOutput {
    return {
      result: {
        success: true,
        data: {
          skipped: true,
          reason,
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
}
