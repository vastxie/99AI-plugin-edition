import { handleError } from '@/common/utils';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MCPService } from './mcp.service';
import { McpActor } from './mcpAuthorization';

@Injectable()
export class McpToolService implements OnModuleInit {
  private readonly logger = new Logger(McpToolService.name);

  // MCP 初始化状态（内存中）
  private mcpInitialized = false;

  constructor(private readonly mcpService: MCPService) {}

  async onModuleInit() {
    // 初始化时可以添加其他必要的逻辑
  }

  /**
   * 确保 MCP 已初始化（单例模式）
   */
  private async ensureMcpInitialized(): Promise<void> {
    if (this.mcpInitialized) {
      return;
    }

    Logger.log('开始初始化 MCP 服务', 'McpToolService');
    await this.mcpService.initialize();
    this.mcpInitialized = true;
    Logger.log('MCP 服务初始化成功');
  }

  /**
   * 批量保存数据库操作
   * @param databaseOperations 收集的数据库操作
   * @param mcpToolResults 工具调用结果
   * @param onDatabase 数据库回调函数
   */
  private saveDatabaseOperations(
    databaseOperations: {
      toolCallsRounds: any[];
      toolCallResults: any[];
      accumulatedResults: any[];
      errors: any[];
    },
    mcpToolResults: string,
    onDatabase?: (data: any) => void,
  ): void {
    if (!onDatabase) return;

    try {
      // 保存工具调用信息
      for (const toolCallData of databaseOperations.toolCallsRounds) {
        onDatabase({
          tool_calls: toolCallData,
        });
      }

      // 保存所有工具执行结果
      for (const resultData of databaseOperations.toolCallResults) {
        onDatabase({
          tool_call_result: resultData,
        });
      }

      // 保存累积结果（只保存最后一次）
      if (databaseOperations.accumulatedResults.length > 0) {
        const lastAccumulated =
          databaseOperations.accumulatedResults[databaseOperations.accumulatedResults.length - 1];
        onDatabase({
          tool_calls_accumulated: lastAccumulated,
        });
      }

      // 保存错误信息
      for (const errorData of databaseOperations.errors) {
        onDatabase({
          tool_calls_error: errorData,
        });
      }

      // 保存最终的工具调用完整结果
      if (mcpToolResults) {
        onDatabase({
          mcpToolResults: mcpToolResults,
        });
      }

      Logger.debug(
        `批量保存完成，共保存 ${databaseOperations.toolCallResults.length} 个工具结果`,
        'McpToolService',
      );
    } catch (error) {
      Logger.error(`批量保存数据库操作失败: ${handleError(error)}`, 'McpToolService');
    }
  }

  /**
   * 处理MCP工具调用（简化版：直接执行工具调用，不再进行FC判断）
   * @param toolCalls 要执行的工具调用列表
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 工具调用结果
   */
  async processMcpToolCalls(
    toolCalls: any[], // 从 UnifiedToolNode 传入的工具调用列表
    inputs: {
      timeout?: any;
      onProgress?: (data: any) => void;
      onDatabase?: (data: any) => void;
      actor?: McpActor;
    },
    result: any,
  ): Promise<string> {
    const { onProgress, onDatabase, actor } = inputs;
    let mcpToolResults = '';

    // 如果没有工具调用，直接返回空结果
    if (!toolCalls || toolCalls.length === 0) {
      return mcpToolResults;
    }

    try {
      // 直接从 Agent 获取工具映射
      const { clientToolsMap } = await this.getToolsForAgent(actor);

      Logger.log(`准备执行 ${toolCalls.length} 个MCP工具调用`, 'McpToolService');

      // 收集所有数据库操作，最后统一保存
      const databaseOperations = {
        toolCallsRounds: [], // 工具调用信息
        toolCallResults: [], // 各个工具执行结果
        accumulatedResults: [], // 累积结果
        errors: [], // 错误信息
      };

      // 直接处理传入的工具调用
      try {
        Logger.debug('开始执行工具调用', 'McpToolService');

        // 更新 result.tool_calls
        result.tool_calls = JSON.stringify(toolCalls);

        // 发送加载状态
        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function') {
            Logger.debug(`发送工具加载状态: ${toolCall.function?.name}`, 'McpToolService');
            onProgress?.({
              tool_calls_individual: {
                tool_call: toolCall,
                status: 'loading',
              },
            });
          }
        }

        // 收集工具调用数据
        const toolCallsData = {
          tool_calls: JSON.stringify(toolCalls),
          timestamp: new Date(),
        };
        databaseOperations.toolCallsRounds.push(toolCallsData);

        let currentRoundResults = '';

        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function') {
            const functionName = toolCall.function.name;
            const mappedTool = clientToolsMap[functionName];
            if (mappedTool) {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                if (Object.keys(args).length === 0) {
                  Logger.warn(
                    `工具调用参数为空: ${mappedTool.clientName}:${mappedTool.toolName}`,
                    'McpToolService',
                  );
                  const errorMsg = `调用失败，原因: 参数不完整`;
                  currentRoundResults += `\n\n【工具${functionName}】${errorMsg}`;
                  mcpToolResults += `\n\n【工具${functionName}】${errorMsg}`;

                  // 更新工具调用为错误状态
                  let toolCallsArray = JSON.parse(result.tool_calls);
                  const toolCallIndex = toolCallsArray.findIndex(
                    (tc: any) =>
                      tc.type === 'function' &&
                      tc.function?.name === functionName &&
                      tc.id === toolCall.id,
                  );
                  if (toolCallIndex !== -1) {
                    toolCallsArray[toolCallIndex].function.error = errorMsg;
                    result.tool_calls = JSON.stringify(toolCallsArray);
                  }

                  // 发送单个工具错误状态
                  onProgress?.({
                    tool_calls_individual: {
                      tool_call: {
                        ...toolCall,
                        function: {
                          ...toolCall.function,
                          error: errorMsg,
                        },
                      },
                      status: 'error',
                    },
                  });

                  // 收集工具调用失败信息，不立即保存
                  databaseOperations.toolCallResults.push({
                    tool_id: toolCall.id,
                    tool_name: functionName,
                    status: 'error',
                    error_message: errorMsg,
                    arguments: JSON.parse(toolCall.function.arguments || '{}'),
                    timestamp: new Date(),
                  });

                  continue;
                }

                // 在开始调用工具前，发送工具调用状态（此时还没有 response）
                Logger.debug(
                  `开始调用MCP工具: ${mappedTool.clientName}:${mappedTool.toolName}`,
                  'McpToolService',
                );

                // 移除这里的空文本推送，避免影响前端加载动画
                // onProgress?.({
                //   text: '',
                // });

                const toolResult = await this.mcpService.callTool(
                  mappedTool.clientName,
                  mappedTool.toolName,
                  args,
                  actor,
                );

                const toolResultStr = `\n\n【工具${functionName}】\n${JSON.stringify(
                  toolResult,
                  null,
                  2,
                )}`;

                currentRoundResults += toolResultStr;
                mcpToolResults += toolResultStr;

                // 更新已有的tool_calls记录，添加response字段
                let toolCallsArray = JSON.parse(result.tool_calls);
                const toolCallIndex = toolCallsArray.findIndex(
                  (tc: any) =>
                    tc.type === 'function' &&
                    tc.function?.name === functionName &&
                    tc.id === toolCall.id,
                );
                if (toolCallIndex !== -1) {
                  toolCallsArray[toolCallIndex].function.response = JSON.stringify(toolResult);
                  result.tool_calls = JSON.stringify(toolCallsArray);
                }

                // 发送单个工具成功状态
                Logger.debug(`发送工具成功状态: ${functionName}`, 'McpToolService');
                onProgress?.({
                  tool_calls_individual: {
                    tool_call: {
                      ...toolCall,
                      function: {
                        ...toolCall.function,
                        response: JSON.stringify(toolResult),
                      },
                    },
                    status: 'success',
                  },
                });

                // 收集工具调用成功结果，不立即保存
                databaseOperations.toolCallResults.push({
                  tool_id: toolCall.id,
                  tool_name: functionName,
                  status: 'success',
                  result: toolResult,
                  arguments: JSON.parse(toolCall.function.arguments || '{}'),
                  timestamp: new Date(),
                });
              } catch (error) {
                Logger.error(`调用MCP工具失败: ${handleError(error)}`, 'McpToolService');
                const errorMsg = handleError(error);
                let userFriendlyError = `调用失败，原因: ${errorMsg}`;

                if (errorMsg.includes('query') && errorMsg.includes('Required')) {
                  userFriendlyError = `调用失败，缺少必需的查询参数。使用此工具时必须提供搜索关键词。`;
                } else if (errorMsg.includes('Invalid input')) {
                  userFriendlyError = `调用失败，输入参数无效。请检查参数格式和类型是否正确。`;
                } else if (errorMsg.includes('rate limit')) {
                  userFriendlyError = `调用失败，已达到GitHub API速率限制。请稍后再试。`;
                }

                mcpToolResults += `\n\n【工具${functionName}】${userFriendlyError}`;

                // 更新失败的工具调用信息到tool_calls数组
                let toolCallsArray = JSON.parse(result.tool_calls);
                currentRoundResults += `\n\n【工具${functionName}】【内容：${JSON.stringify(
                  toolCallsArray,
                )}】${userFriendlyError}`;
                const toolCallIndex = toolCallsArray.findIndex(
                  (tc: any) =>
                    tc.type === 'function' &&
                    tc.function?.name === functionName &&
                    tc.id === toolCall.id,
                );
                if (toolCallIndex !== -1) {
                  toolCallsArray[toolCallIndex].function.error = userFriendlyError;
                  result.tool_calls = JSON.stringify(toolCallsArray);
                }

                // 发送单个工具错误状态
                onProgress?.({
                  tool_calls_individual: {
                    tool_call: {
                      ...toolCall,
                      function: {
                        ...toolCall.function,
                        error: userFriendlyError,
                      },
                    },
                    status: 'error',
                  },
                });

                // 收集工具调用错误信息，不立即保存
                databaseOperations.toolCallResults.push({
                  tool_id: toolCall.id,
                  tool_name: functionName,
                  status: 'error',
                  error_message: userFriendlyError,
                  error_detail: errorMsg,
                  arguments: JSON.parse(toolCall.function.arguments || '{}'),
                  timestamp: new Date(),
                });
              }
            }
          }
        }

        // 保存累积结果
        databaseOperations.accumulatedResults.push({
          accumulated_results: mcpToolResults,
          timestamp: new Date(),
        });
      } catch (error) {
        Logger.error(`工具执行失败: ${handleError(error)}`, 'McpToolService');

        // 收集失败信息
        databaseOperations.errors.push({
          error: handleError(error),
          timestamp: new Date(),
        });
      }

      Logger.debug('工具调用完成', 'McpToolService');

      // 清理空的工具调用（没有response且没有error的工具）
      if (result.tool_calls) {
        try {
          const toolCallsArray = JSON.parse(result.tool_calls);
          const originalCount = toolCallsArray.length;
          const validToolCalls = toolCallsArray.filter((call: any) => {
            const hasResponse = !!call.function?.response;
            const hasError = !!call.function?.error;
            const isValid = hasResponse || hasError;

            if (!isValid) {
              Logger.debug(`清理空工具调用: ${call.function?.name}`, 'McpToolService');
            }

            return isValid;
          });

          if (originalCount !== validToolCalls.length) {
            Logger.log(
              `最终工具调用清理: ${originalCount} -> ${validToolCalls.length}`,
              'McpToolService',
            );
            result.tool_calls = JSON.stringify(validToolCalls);

            // 发送最终清理后的工具调用状态
            onProgress?.({
              tool_calls: result.tool_calls,
            });
          }
        } catch (error) {
          Logger.warn(`清理工具调用失败: ${handleError(error)}`, 'McpToolService');
        }
      }

      // 批量保存所有收集的数据库操作
      this.saveDatabaseOperations(databaseOperations, mcpToolResults, onDatabase);
    } catch (error) {
      Logger.error(`MCP服务调用失败: ${handleError(error)}`, 'McpToolService');

      // 即时存储MCP服务失败信息
      onDatabase?.({
        mcp_service_error: {
          error: handleError(error),
          timestamp: new Date(),
        },
      });
    }

    return mcpToolResults;
  }

  /**
   * 获取工具定义供Agent使用（直接从数据库获取）
   */
  async getToolsForAgent(actor?: McpActor): Promise<{ tools: any[]; clientToolsMap: any }> {
    try {
      Logger.debug('Agent请求获取MCP工具列表...');

      // 确保MCP已初始化
      await this.ensureMcpInitialized();

      // 从MCP服务获取客户端列表
      const mcpClients = this.mcpService.getClients();
      Logger.debug(`获取到MCP客户端: ${Object.keys(mcpClients).join(', ')}`);

      const tools = [];
      const clientToolsMap = {};

      for (const [clientName, client] of Object.entries(mcpClients)) {
        if (client.tools && client.tools.length > 0) {
          for (const tool of client.tools) {
            if (!this.mcpService.canCallTool(actor, clientName, tool.name)) continue;
            const toolDefinition = {
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description || `通过 ${clientName} 客户端调用 ${tool.name} 工具`,
                parameters: tool.inputSchema || {
                  type: 'object',
                  properties: {},
                  required: [],
                },
              },
            };

            tools.push(toolDefinition);
            clientToolsMap[tool.name] = {
              clientName,
              toolName: tool.name,
            };
          }
        } else {
        }
      }

      Logger.log(`总共获取到 ${tools.length} 个MCP工具`, 'McpToolService');

      return { tools, clientToolsMap };
    } catch (error) {
      Logger.error(`获取Agent工具失败: ${handleError(error)}`);
      return { tools: [], clientToolsMap: {} };
    }
  }
}
