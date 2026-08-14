import { handleError, normalizeReasoningContentForModel } from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { MCPService } from '../../mcp/mcp.service';
import { McpToolService } from '../../mcp/mcpTool.service';
import { FileVectorSearchService } from '../search/fileVectorSearch.service';
import { NetSearchService } from '../search/netSearch.service';
// 引入其他需要的模块或服务

// 定义文件源信息接口
interface FileSourceInfo {
  fileName: string;
  url: string;
  endPos: number;
}

// 定义文件对象接口
interface FileObject {
  name: string;
  url: string;
  type: string;
}

@Injectable()
export class OpenAIChatService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly mcpService: MCPService,
    private readonly netSearchService: NetSearchService,
    private readonly fileVectorSearchService: FileVectorSearchService,
    private readonly mcpToolService: McpToolService,
  ) {}

  /**
   * 处理深度思考逻辑
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   * @param mcpToolResults MCP工具调用结果
   * @returns 是否应该终止请求
   */
  private async handleDeepThinking(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      usingDeepThinking?: boolean;
      deepThinkingModel?: string;
      deepThinkingUrl?: string;
      deepThinkingKey?: string;
      fileVectorSearch?: any;
      imageDescription?: any;
      searchResults?: any[];
      deepThinkingType?: any;
      additionalParams?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
    mcpToolResults: string,
  ): Promise<boolean> {
    const {
      apiKey,
      model,
      proxyUrl,
      usingDeepThinking,
      fileVectorSearch,
      imageDescription,
      searchResults,
      abortController,
      deepThinkingType,
      additionalParams,
      onProgress,
    } = inputs;

    const {
      openaiBaseUrl,
      openaiBaseKey,
      openaiBaseModel,
      deepThinkingUrl,
      deepThinkingKey,
      deepThinkingModel,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseUrl',
      'openaiBaseKey',
      'openaiBaseModel',
      'deepThinkingUrl',
      'deepThinkingKey',
      'deepThinkingModel',
    ]);

    // 如果不使用深度思考且不是DeepSeek模型，直接返回
    if (!usingDeepThinking && deepThinkingType !== 2) {
      return false;
    }

    const deepUrl = deepThinkingType === 2 ? proxyUrl : deepThinkingUrl || openaiBaseUrl;
    const deepKey = deepThinkingType === 2 ? apiKey : deepThinkingKey || openaiBaseKey;
    const deepModel = deepThinkingType === 2 ? model : deepThinkingModel || openaiBaseModel;

    let shouldEndThinkStream = false;
    let thinkingSourceType = null; // 'reasoning_content' 或 'think_tag'

    // 处理所有消息中的imageUrl类型
    let extractedImageUrls: string[] = [];
    const processedMessages = JSON.parse(JSON.stringify(messagesHistory)).map((message: any) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        // 先提取图片URL
        const imageItems = message.content.filter((item: any) => item.type === 'image_url');
        imageItems.forEach((item: any) => {
          if (item.image_url?.url) {
            extractedImageUrls.push(item.image_url.url);
          }
        });

        // 将带有image_url类型的内容转换为普通文本
        message.content = message.content
          .filter((item: any) => item.type !== 'image_url')
          .map((item: any) => item.text || item)
          .join('');
      }
      return message;
    });

    // 添加文件向量搜索、图片描述和MCP工具结果到system消息
    const systemMessageIndex = processedMessages.findIndex((msg: any) => msg.role === 'system');
    let additionalContent = '';

    // 如果有图片描述，添加到system消息中
    if (imageDescription) {
      additionalContent += `\n\n以下是图片内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
        imageDescription,
      )}`;
    }

    // 如果从GPT Vision格式中提取到了图片URL，也添加到上下文中
    if (extractedImageUrls.length > 0 && !imageDescription) {
      // 如果没有图片描述但有提取的图片URL，添加图片URL信息
      additionalContent += `\n\n用户提供了以下图片：${extractedImageUrls.join(
        ', ',
      )}\n请结合这些图片内容回答用户问题。`;

      // 记录日志
      Logger.debug(
        `深度思考模式下检测到GPT Vision格式图片: ${extractedImageUrls.join(', ')}`,
        'OpenAIChatService',
      );
    }

    // 如果有文件向量搜索结果，添加到system消息中
    if (fileVectorSearch) {
      additionalContent += `\n\n以下是文件内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
        fileVectorSearch,
      )}`;
    }

    // 如果有网络搜索结果，添加到system消息中
    if (searchResults && searchResults.length > 0) {
      // 将 searchResult 转换为 JSON 字符串
      let searchPrompt = JSON.stringify(searchResults, null, 2);

      additionalContent += `\n\n以下是网络搜索结果（请基于这些信息回答用户问题，这些信息比你的训练数据更新）：\n${searchPrompt}`;
    }

    // 如果有MCP工具结果，添加到system消息中
    if (mcpToolResults) {
      additionalContent += `\n\n以下是通过工具获取的实时信息（这些是最新、最准确的数据，请优先使用这些信息回答用户问题）：${mcpToolResults}请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]
          \n请基于以上信息回答用户问题，特别注意：
          1. 如果工具提供了实时数据，请优先使用这些数据，因为它们比你训练数据更新
          2. 清晰地引用工具返回的信息，并解释这些信息如何回答用户问题
          3. 如果工具结果不完整或不足以回答问题，可以结合你的知识进行补充
          4. 保持回答的准确性、相关性和有用性`;
    }

    // 将额外内容添加到system消息中
    if (systemMessageIndex !== -1) {
      processedMessages[systemMessageIndex].content += additionalContent;
    } else if (additionalContent) {
      processedMessages.unshift({
        role: 'system',
        content: additionalContent,
      });
    }

    try {
      const correctedDeepUrl = await correctApiBaseUrl(deepUrl);
      const thinkOpenai = new OpenAI({
        apiKey: deepKey,
        baseURL: correctedDeepUrl,
        timeout: 10 * 60 * 1000, // 统一使用10分钟超时
      });

      Logger.debug(
        `思考流请求 - Messages: ${JSON.stringify(processedMessages)}`,
        'OpenAIChatService',
      );

      // 构建请求配置
      // 解析 additionalParams 并应用优先级逻辑
      const parsedAdditionalParams = additionalParams
        ? this.safeParseAdditionalParams(additionalParams)
        : {};
      normalizeReasoningContentForModel(
        processedMessages,
        deepModel,
        parsedAdditionalParams,
        'OpenAIChatService',
      );

      // 记录深度思考模型的参数优先级处理
      if (Object.keys(parsedAdditionalParams).length > 0) {
        Logger.debug(
          `深度思考模型使用additionalParams: ${JSON.stringify(parsedAdditionalParams)}`,
          'OpenAIChatService',
        );
      }

      // 深度思考的基础配置，additionalParams 中的所有参数都会直接应用
      const requestConfig: any = {
        model: deepModel,
        messages: processedMessages,
        stream: true,
        ...parsedAdditionalParams,
      };

      // 如果是 grok-3-mini-latest 模型，添加 reasoning_effort 参数
      // if (deepModel === 'grok-3-mini-latest') {
      //   requestConfig.reasoning_effort = 'high';
      //   Logger.debug('为grok-3-mini-latest模型添加reasoning_effort=high参数', 'OpenAIChatService');
      // }

      const stream = await thinkOpenai.chat.completions.create(requestConfig, {
        signal: abortController.signal,
      });

      // @ts-ignore - 忽略TypeScript错误，因为我们知道stream是可迭代的
      for await (const chunk of stream) {
        if (abortController.signal.aborted || shouldEndThinkStream) {
          break;
        }
        const delta = chunk.choices[0]?.delta;
        // Logger.debug(`思考流delta: ${JSON.stringify(delta)}`, 'OpenAIChatService');
        const content = delta?.content;
        const reasoning_content = (delta as any)?.reasoning_content || '';

        // 根据已确定的思考流来源类型处理数据
        if (thinkingSourceType === 'reasoning_content') {
          // 已确定使用reasoning_content字段
          if (reasoning_content) {
            Logger.debug(
              `继续接收reasoning_content思考流: ${reasoning_content}`,
              'OpenAIChatService',
            );
            result.reasoning_content = [
              {
                type: 'text',
                text: reasoning_content,
              },
            ];
            result.full_reasoning_content += reasoning_content;
            onProgress?.({
              reasoning_content: result.reasoning_content,
            });
          } else if (content && !content.includes('<think>')) {
            // 如果出现普通content，对于非DeepSeek模型终止思考流
            // 对于DeepSeek模型，将内容作为正常响应处理
            // Logger.debug(`reasoning_content模式下收到普通content: ${content}`, 'OpenAIChatService');
            if (deepThinkingType === 2) {
              result.content = [
                {
                  type: 'text',
                  text: content,
                },
              ];
              result.full_content += content;
              onProgress?.({
                content: result.content,
              });
            } else {
              shouldEndThinkStream = true;
            }
          }
          continue;
        } else if (thinkingSourceType === 'think_tag') {
          // 已确定使用think标签
          if (content) {
            if (content.includes('</think>')) {
              // 如果包含结束标签，提取剩余思考内容
              Logger.debug(`检测到</think>标签，思考流结束`, 'OpenAIChatService');
              const regex = /([\s\S]*?)<\/think>([\s\S]*)/;
              const matches = content.match(regex);

              if (matches) {
                const thinkContent = matches[1] || '';
                const remainingContent = matches[2] || '';

                if (thinkContent) {
                  result.reasoning_content = [
                    {
                      type: 'text',
                      text: thinkContent,
                    },
                  ];
                  result.full_reasoning_content += thinkContent;
                  onProgress?.({
                    reasoning_content: result.reasoning_content,
                  });
                }

                // 对于DeepSeek模型，如果有剩余内容，作为正常响应处理
                if (deepThinkingType === 2 && remainingContent) {
                  result.content = [
                    {
                      type: 'text',
                      text: remainingContent,
                    },
                  ];
                  result.full_content += remainingContent;
                  onProgress?.({
                    content: result.content,
                  });
                }
              }

              // 对于非DeepSeek模型，终止思考流
              // 对于DeepSeek模型，只标记思考流结束，但继续处理后续内容
              if (deepThinkingType !== 2) {
                shouldEndThinkStream = true;
              } else {
                thinkingSourceType = 'normal_content';
              }
            } else {
              // 继续接收think标签内的思考内容
              // Logger.debug(`继续接收think标签思考流: ${content}`, 'OpenAIChatService');
              result.reasoning_content = [
                {
                  type: 'text',
                  text: content,
                },
              ];
              result.full_reasoning_content += content;
              onProgress?.({
                reasoning_content: result.reasoning_content,
              });
            }
          }
          continue;
        } else if (thinkingSourceType === 'normal_content' && deepThinkingType === 2) {
          // DeepSeek模型在思考流结束后的正常内容处理
          if (content) {
            result.content = [
              {
                type: 'text',
                text: content,
              },
            ];
            result.full_content += content;
            onProgress?.({
              content: result.content,
            });
          }
          continue;
        }

        // 尚未确定思考流来源类型，进行检测
        if (reasoning_content) {
          // 确定使用reasoning_content字段作为思考流
          Logger.debug(
            `首次检测到reasoning_content，确定使用reasoning_content思考流方式: ${reasoning_content}`,
            'OpenAIChatService',
          );
          thinkingSourceType = 'reasoning_content';
          result.reasoning_content = [
            {
              type: 'text',
              text: reasoning_content,
            },
          ];
          result.full_reasoning_content += reasoning_content;
          onProgress?.({
            reasoning_content: result.reasoning_content,
          });
        } else if (content) {
          if (content.includes('<think>')) {
            // 确定使用think标签作为思考流
            Logger.debug(`首次检测到<think>标签，确定使用think标签思考流方式`, 'OpenAIChatService');
            thinkingSourceType = 'think_tag';

            // 提取第一个块中的内容
            const thinkContent = content.replace(/<think>/, '');
            if (thinkContent) {
              Logger.debug(
                `从<think>标签中提取的初始思考内容: ${thinkContent}`,
                'OpenAIChatService',
              );
              result.reasoning_content = [
                {
                  type: 'text',
                  text: thinkContent,
                },
              ];
              result.full_reasoning_content += thinkContent;
              onProgress?.({
                reasoning_content: result.reasoning_content,
              });

              // 如果已经包含了</think>标签，提取思考内容和剩余内容
              if (content.includes('</think>')) {
                Logger.debug('在首个块中检测到</think>标签', 'OpenAIChatService');

                const regex = /<think>([\s\S]*?)<\/think>([\s\S]*)/;
                const matches = content.match(regex);

                if (matches) {
                  const fullThinkContent = matches[1] || '';
                  const remainingContent = matches[2] || '';

                  // 更新思考内容
                  result.reasoning_content = [
                    {
                      type: 'text',
                      text: fullThinkContent,
                    },
                  ];
                  result.full_reasoning_content = fullThinkContent;
                  onProgress?.({
                    reasoning_content: result.reasoning_content,
                  });

                  // 对于DeepSeek模型，如果有剩余内容，作为正常响应处理
                  if (deepThinkingType === 2 && remainingContent) {
                    result.content = [
                      {
                        type: 'text',
                        text: remainingContent,
                      },
                    ];
                    result.full_content += remainingContent;
                    onProgress?.({
                      content: result.content,
                    });
                  }
                }

                // 对于非DeepSeek模型，终止思考流
                // 对于DeepSeek模型，只标记思考流结束，继续处理后续内容
                if (deepThinkingType !== 2) {
                  shouldEndThinkStream = true;
                } else {
                  thinkingSourceType = 'normal_content';
                }
              }
            }
          } else {
            // 没有任何思考流标记，不同模型有不同处理
            // Logger.debug(`没有检测到思考流标记，处理普通内容: ${content}`, 'OpenAIChatService');

            if (deepThinkingType === 2) {
              // DeepSeek模型直接处理为正常内容
              thinkingSourceType = 'normal_content';
              result.content = [
                {
                  type: 'text',
                  text: content,
                },
              ];
              result.full_content += content;
              onProgress?.({
                content: result.content,
              });
            } else {
              // 非DeepSeek模型终止思考流
              shouldEndThinkStream = true;
            }
          }
        }
      }

      Logger.debug('思考流处理完成', 'OpenAIChatService');

      // 如果是DeepSeek模型并且有内容，直接返回true表示应该终止请求
      return deepThinkingType === 2 && result.full_content.length > 0;
    } catch (error) {
      const errorMessage = handleError(error);

      // 如果是用户主动中断，直接返回true终止请求
      if (!errorMessage) {
        Logger.debug('深度思考被用户主动中断', 'OpenAIChatService');
        return true;
      }

      Logger.warn(`深度思考模型调用失败，将降级到常规响应: ${errorMessage}`, 'OpenAIChatService');

      // 深度思考失败时，不阻止对话继续，返回false让常规响应继续处理
      // 可以选择性地通知用户深度思考不可用
      onProgress?.({
        reasoning_content: [
          {
            type: 'text',
            text: '', // 清空思考内容
          },
        ],
      });

      return false; // 继续执行常规响应
    }
  }

  /**
   * 处理常规响应逻辑
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   * @param mcpToolResults MCP工具调用结果
   */
  private async handleRegularResponse(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      temperature: any;
      max_tokens?: any;
      fileVectorSearch?: any;
      imageDescription?: any;
      extraParam?: any;
      searchResults?: any[];
      images?: string[];
      additionalParams?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
    mcpToolResults: string,
  ): Promise<void> {
    const {
      apiKey,
      model,
      proxyUrl,
      temperature,
      max_tokens,
      fileVectorSearch,
      imageDescription,
      extraParam,
      searchResults,
      images,
      abortController,
      additionalParams,
      onProgress,
    } = inputs;

    // 步骤1: 准备和增强系统消息
    const processedMessages = this.prepareSystemMessage(
      messagesHistory,
      {
        fileVectorSearch,
        imageDescription,
        searchResults,
        images,
      },
      result,
      mcpToolResults,
    );

    // 步骤2: 处理OpenAI聊天API调用
    await this.handleOpenAIChat(
      processedMessages,
      {
        apiKey,
        model,
        proxyUrl,
        temperature,
        max_tokens,
        abortController,
        additionalParams,
        onProgress,
      },
      result,
    );
  }

  async chat(
    messagesHistory: any,
    inputs: {
      chatId: any;
      maxModelTokens?: any;
      max_tokens?: any;
      apiKey: any;
      model: any;
      modelName: any;
      temperature: any;
      modelType?: any;
      prompt?: any;
      imageUrl?: any;
      videoUrl?: any;
      isFileUpload: any;
      isImageUpload?: any;
      fileUrl?: any;
      usingNetwork?: boolean;
      usingTool?: boolean;
      proxyUrl: any;
      modelAvatar?: any;
      usingDeepThinking?: boolean;
      extraParam?: any;
      fileVectorSearch?: any;
      imageDescription?: any;
      deepThinkingType?: any;
      additionalParams?: any;
      onProgress?: (data: {
        text?: string;
        content?: [];
        reasoning_content?: [];
        tool_calls?: string;
        networkSearchResult?: string;
        fileVectorResult?: string;
        imageDescription?: string;
        finishReason?: string;
        // full_json?: string; // 编辑模式相关，已注释
      }) => void;
      onFailure?: (error: any) => void;
      onDatabase?: (data: any) => void;
      abortController: AbortController;
      authActor?: { id?: number | string; role?: string };
    },
  ) {
    const {
      chatId,
      maxModelTokens,
      max_tokens,
      apiKey,
      model,
      modelName,
      temperature,
      modelType,
      prompt,
      imageUrl,
      videoUrl,
      isFileUpload,
      isImageUpload,
      fileUrl,
      proxyUrl,
      modelAvatar,
      usingDeepThinking,
      usingNetwork,
      usingTool,
      extraParam,
      authActor,
      fileVectorSearch: existingFileVectorSearch,
      imageDescription: existingImageDescription,
      deepThinkingType,
      additionalParams,
      onProgress,
      onFailure,
      onDatabase,
      abortController,
    } = inputs;

    // 创建原始消息历史的副本
    const originalMessagesHistory = JSON.parse(JSON.stringify(messagesHistory));

    const result: any = {
      chatId,
      modelName,
      modelAvatar,
      model,
      status: 2,
      full_content: '',
      full_reasoning_content: '',
      networkSearchResult: '',
      fileVectorResult: '',
      // imageUrl: imageUrl,
      finishReason: null,
    };

    try {
      // 步骤1: 处理网络搜索 - 使用NetSearchService
      const { searchResults, images } = await this.netSearchService.processNetSearch(
        prompt || '',
        {
          usingNetwork,
          onProgress,
          onDatabase,
        },
        result,
      );

      // 步骤2: 处理文件向量搜索 - 使用FileVectorSearchService
      const fileVectorResult = await this.fileVectorSearchService.processFileVectorSearch(
        fileUrl || '',
        prompt || '',
        {
          isFileUpload,
          onProgress,
          onDatabase,
        },
        result,
      );

      // 步骤3: 处理图片描述 - 使用FileVectorSearchService
      // 如果是深度思考模式且isImageUpload===2（GPT Vision格式），强制触发图片描述
      const shouldForceImageDescription = usingDeepThinking && isImageUpload === 2;
      const imageDescription = await this.fileVectorSearchService.processImageDescription(
        imageUrl || '',
        videoUrl || '',
        {
          isImageUpload: shouldForceImageDescription ? 3 : isImageUpload, // 强制使用模式3来触发图片描述
          usingDeepThinking,
          onProgress,
          onDatabase,
        },
        result,
      );

      // 步骤4: 处理MCP工具调用 - 使用McpToolService
      // 从 result.tool_calls 获取工具调用列表
      const toolCalls = result.tool_calls ? JSON.parse(result.tool_calls) : [];
      const mcpToolResults =
        usingTool && toolCalls.length > 0
          ? await this.mcpToolService.processMcpToolCalls(
              toolCalls,
              {
                onProgress,
                onDatabase,
                actor: authActor,
              },
              result,
            )
          : '';

      // 步骤5: 处理深度思考
      const shouldEndRequest = await this.handleDeepThinking(
        messagesHistory,
        {
          apiKey,
          model,
          proxyUrl,
          usingDeepThinking,
          fileVectorSearch: fileVectorResult || existingFileVectorSearch,
          imageDescription: imageDescription || existingImageDescription,
          searchResults,
          abortController,
          deepThinkingType,
          additionalParams,
          onProgress,
        },
        result,
        mcpToolResults,
      );

      // 如果深度思考处理后应该终止请求，则直接返回结果
      if (shouldEndRequest) {
        result.content = '';
        result.reasoning_content = '';
        result.finishReason = 'stop';
        return result;
      }

      // 步骤6: 处理常规响应
      await this.handleRegularResponse(
        originalMessagesHistory,
        {
          apiKey,
          model,
          proxyUrl,
          temperature,
          max_tokens,
          fileVectorSearch: fileVectorResult || existingFileVectorSearch,
          imageDescription: imageDescription || existingImageDescription,
          extraParam,
          searchResults,
          images,
          abortController,
          additionalParams: additionalParams ? additionalParams : {},
          onProgress,
        },
        result,
        mcpToolResults,
      );

      result.content = [
        {
          type: 'text',
          text: '',
        },
      ];
      result.reasoning_content = [
        {
          type: 'text',
          text: '',
        },
      ];
      result.finishReason = 'stop';

      // 如果是编辑模式，确保full_json字段包含完整的JSON对象
      /*
      if (inputs.extraParam?.lineNumberedText && result.full_json) {
        Logger.debug(`编辑模式完成，使用流式处理中解析的JSON结果`, 'OpenAIChatService');
        try {
          // 验证full_json是有效的JSON字符串
          JSON.parse(result.full_json);
          Logger.debug(
            `最终验证通过: full_json是有效的JSON格式，长度: ${result.full_json.length}`,
            'OpenAIChatService',
          );
          // result.full_content = JSON.stringify(result.full_json.explanation);
          onProgress?.({
            full_json: JSON.stringify(result.full_json),
          });
        } catch (finalError) {
          Logger.error(
            `最终验证失败: full_json不是有效的JSON格式，清空该字段: ${handleError(finalError)}`,
            'OpenAIChatService',
          );
          // 如果不是有效的JSON，清空该字段
          result.full_json = '';
        }
      }
      */

      return result;
    } catch (error) {
      const errorMessage = handleError(error);
      // 如果是用户主动中断（返回空字符串），不记录错误也不设置错误消息
      if (errorMessage) {
        Logger.error(`对话请求失败: ${errorMessage}`, 'OpenAIChatService');
        result.errMsg = errorMessage;
        onFailure?.(result);
      } else {
        Logger.debug('对话被用户主动中断', 'OpenAIChatService');
      }
      return result;
    }
  }

  async chatFree(prompt: string, systemMessage?: string, messagesHistory?: any[], imageUrl?: any) {
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiBaseModel,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseKey',
      'openaiBaseUrl',
      'openaiBaseModel',
    ]);

    const key = openaiBaseKey;
    const proxyUrl = openaiBaseUrl;

    let requestData = [];

    if (systemMessage) {
      requestData.push({
        role: 'system',
        content: systemMessage,
      });
    }

    if (messagesHistory && messagesHistory.length > 0) {
      requestData = requestData.concat(messagesHistory);
    } else {
      if (imageUrl) {
        requestData.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        });
      } else {
        requestData.push({
          role: 'user',
          content: prompt,
        });
      }
    }

    try {
      const openai = new OpenAI({
        apiKey: key,
        baseURL: await correctApiBaseUrl(proxyUrl),
      });

      const response = await openai.chat.completions.create(
        {
          model: openaiBaseModel || 'gpt-4o-mini',
          messages: requestData,
        },
        {
          timeout: 30000,
        },
      );

      return response.choices[0].message.content;
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`全局模型调用失败: ${errorMessage}`, 'OpenAIChatService');
      return;
    }
  }

  /**
   * 准备和增强系统消息
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   * @param mcpToolResults MCP工具调用结果
   * @returns 处理后的消息历史
   */
  private prepareSystemMessage(
    messagesHistory: any,
    inputs: {
      fileVectorSearch?: any;
      imageDescription?: any;
      searchResults?: any[];
      images?: string[];
    },
    result: any,
    mcpToolResults: string,
  ): any {
    const { fileVectorSearch, imageDescription, searchResults, images } = inputs;

    // 创建消息历史的副本
    const processedMessages = JSON.parse(JSON.stringify(messagesHistory));

    // 查找系统消息
    const systemMessage = processedMessages?.find((message: any) => message.role === 'system');

    if (systemMessage) {
      const imageUrlMessages =
        processedMessages?.filter((message: any) => message.type === 'image_url') || [];

      let updatedContent = '';

      // 添加推理思考内容
      if (result.full_reasoning_content) {
        updatedContent = `\n\n以下是针对这个问题的思考推理思路（思路不一定完全正确，仅供参考）：\n${result.full_reasoning_content}`;
      }

      // 添加文件向量搜索结果
      if (fileVectorSearch) {
        updatedContent += `\n\n以下是文件内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
          fileVectorSearch,
        )}`;
      }

      // 添加图片描述结果
      if (imageDescription) {
        updatedContent += `\n\n以下是图片内容分析结果（请基于这些信息回答用户问题）：\n${JSON.stringify(
          imageDescription,
        )}`;
      }

      // 添加网络搜索结果
      if (searchResults && searchResults.length > 0) {
        // 将 searchResult 转换为 JSON 字符串
        let searchPrompt = JSON.stringify(searchResults, null, 2); // 格式化为漂亮的 JSON 字符串

        // 处理图片数据
        let imagesPrompt = '';
        if (images && images.length > 0) {
          imagesPrompt = `\n\n以下是搜索到的相关图片链接:\n${images.join('\n')}`;
        }

        const now = new Date();
        // 手动格式化为期望的格式
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');

        const currentDate = `${year}/${month}/${day} ${hour}:00`;

        updatedContent += `
          \n\n你的任务是根据用户的问题，通过下面的搜索结果提供更精确、详细、具体的回答。
          请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]，以下是搜索结果：
            ${searchPrompt}${imagesPrompt}
            在回答时，请注意以下几点：
              - 现在时间是: ${currentDate}。
              - 如果结果中包含图片链接，请在适当位置使用Markdown图片格式 ![描述](图片链接) 插入至少一张图片，让回答图文并茂。例如：![相关图片](https://example.com/image.jpg)
              - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
              - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
              - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号。你需要解读并概括用户的题目要求，选择合适的格式，充分利用搜索结果并抽取重要信息，生成符合用户要求、极具思想深度、富有创造力与专业性的答案。你的创作篇幅需要尽可能延长，对于每一个要点的论述要推测用户的意图，给出尽可能多角度的回答要点，且务必信息量大、论述详尽。
              - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
              - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
              - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
              - 你的回答应该综合多个相关网页来回答，不能只重复引用一个网页。
              - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
            `;
      }

      // 添加MCP工具结果
      if (mcpToolResults) {
        updatedContent += `\n\n以下是通过工具获取的实时信息（这些是最新、最准确的数据，请优先使用这些信息回答用户问题）：${mcpToolResults}请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]
        \n请基于以上信息回答用户问题，特别注意：
        1. 如果工具提供了实时数据，请优先使用这些数据，因为它们比你训练数据更新
        2. 清晰地引用工具返回的信息，并解释这些信息如何回答用户问题
        3. 如果工具结果不完整或不足以回答问题，可以结合你的知识进行补充
        4. 保持回答的准确性、相关性和有用性`;
      }

      // 添加图片URL消息
      if (imageUrlMessages && imageUrlMessages.length > 0) {
        imageUrlMessages.forEach((imageMessage: any) => {
          updatedContent = `${updatedContent}\n${JSON.stringify(imageMessage)}`;
        });
      }

      systemMessage.content += updatedContent;
    }

    return processedMessages;
  }

  /**
   * 处理OpenAI聊天API调用和流式响应
   * @param messagesHistory 处理后的消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   */
  private async handleOpenAIChat(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      temperature: any;
      max_tokens?: any;
      additionalParams?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<void> {
    const {
      apiKey,
      model,
      proxyUrl,
      temperature,
      max_tokens,
      abortController,
      additionalParams,
      onProgress,
    } = inputs;

    // 准备请求数据
    const streamData = {
      model,
      messages: messagesHistory,
      stream: true,
      temperature,
    };

    // 创建OpenAI实例
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: await correctApiBaseUrl(proxyUrl),
      timeout: 10 * 60 * 1000, // 统一使用10分钟超时
    });

    try {
      Logger.debug(
        `对话请求 - Messages: ${JSON.stringify(streamData.messages)}`,
        'OpenAIChatService',
      );

      // 发送流式请求
      // 解析 additionalParams 并检查参数优先级
      const parsedAdditionalParams = additionalParams
        ? this.safeParseAdditionalParams(additionalParams)
        : {};
      normalizeReasoningContentForModel(
        streamData.messages,
        model,
        parsedAdditionalParams,
        'OpenAIChatService',
      );

      // 记录参数优先级处理
      if (parsedAdditionalParams.max_tokens !== undefined) {
        Logger.debug(
          `additionalParams中的max_tokens优先生效: ${parsedAdditionalParams.max_tokens} (原值: ${max_tokens})`,
          'OpenAIChatService',
        );
      }
      if (parsedAdditionalParams.temperature !== undefined) {
        Logger.debug(
          `additionalParams中的temperature优先生效: ${parsedAdditionalParams.temperature} (原值: ${streamData.temperature})`,
          'OpenAIChatService',
        );
      }

      // 从 parsedAdditionalParams 中剔除已经显式处理的参数，避免重复传递
      const {
        max_tokens: additionalMaxTokens,
        temperature: additionalTemperature,
        ...otherAdditionalParams
      } = parsedAdditionalParams;

      const requestParams = {
        model: streamData.model,
        messages: streamData.messages,
        stream: true as const,
        max_tokens: additionalMaxTokens !== undefined ? additionalMaxTokens : max_tokens,
        temperature:
          additionalTemperature !== undefined ? additionalTemperature : streamData.temperature,
        ...otherAdditionalParams,
      };

      Logger.debug(
        `准备模型请求: model=${requestParams.model}, messages=${requestParams.messages.length}`,
        'OpenAIChatService',
      );

      const stream: any = await openai.chat.completions.create(requestParams as any, {
        signal: abortController.signal,
      });

      // 处理流式响应
      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          // 处理流式内容
          result.content = [
            {
              type: 'text',
              text: content,
            },
          ];

          result.full_content += content;
          onProgress?.({
            content: result.content,
          });
        }
      }
    } catch (error) {
      Logger.error(`OpenAI请求失败: ${handleError(error)}`, 'OpenAIChatService');
      throw error;
    }
  }

  /**
   * 将OpenAI格式的消息转换为Gemini格式
   * @param messages OpenAI格式的消息数组
   * @returns Gemini格式的contents数组和系统指令
   */
  private convertOpenAIToGeminiFormat(messages: any[]): {
    contents: any[];
    systemInstruction: string;
  } {
    const contents: any[] = [];
    let systemInstruction = '';

    for (const message of messages) {
      if (message.role === 'system') {
        // Gemini 使用 systemInstruction 而不是 system 消息
        systemInstruction += message.content + '\n';
        continue;
      }

      const parts: any[] = [];

      if (typeof message.content === 'string') {
        // 简单文本消息
        parts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        // 多模态消息（文本 + 图片等）
        for (const item of message.content) {
          if (item.type === 'text') {
            parts.push({ text: item.text });
          } else if (item.type === 'image_url') {
            // 处理图片URL，Gemini需要不同的格式
            if (item.image_url?.url?.startsWith('data:')) {
              // Base64 图片
              const [mimeType, data] = item.image_url.url.split(',');
              parts.push({
                inlineData: {
                  mimeType: mimeType.split(':')[1].split(';')[0],
                  data: data,
                },
              });
            } else {
              // 外部图片URL - Gemini可能需要先上传
              parts.push({ text: `[Image: ${item.image_url.url}]` });
            }
          }
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: parts,
        });
      }
    }

    return { contents, systemInstruction: systemInstruction.trim() };
  }

  /**
   * 处理Gemini聊天API调用和流式响应
   * @param messagesHistory 处理后的消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   */
  private async handleGeminiChat(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl?: any;
      temperature: any;
      max_tokens?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<void> {
    const { apiKey, model, proxyUrl, temperature, max_tokens, abortController, onProgress } =
      inputs;

    try {
      // 如果有自定义地址，优先使用 REST API（完全自定义）
      if (proxyUrl && proxyUrl !== 'https://generativelanguage.googleapis.com') {
        await this.handleGeminiRestAPI(messagesHistory, inputs, result);
        return;
      }

      // 使用原生 Gemini SDK（仅支持官方地址）
      const { GoogleGenAI } = await import('@google/genai');

      // 转换消息格式
      const { contents, systemInstruction } = this.convertOpenAIToGeminiFormat(messagesHistory);

      // 创建 Gemini 客户端（原生SDK不支持自定义baseURL）
      const genAI = new GoogleGenAI({ apiKey });

      // 构建请求配置
      const requestConfig: any = {
        model: model || 'gemini-2.0-flash',
        contents: contents,
      };

      // 添加系统指令
      if (systemInstruction) {
        requestConfig.config = {
          systemInstruction: systemInstruction,
          temperature: temperature,
          maxOutputTokens: max_tokens,
        };
      } else if (temperature !== undefined || max_tokens !== undefined) {
        requestConfig.config = {
          temperature: temperature,
          maxOutputTokens: max_tokens,
        };
      }

      Logger.debug(
        `Gemini原生SDK请求 - 消息数: ${contents?.length || 0}, 包含系统指令: ${Boolean(
          systemInstruction,
        )}`,
        'OpenAIChatService',
      );

      // 发送流式请求
      const response = await genAI.models.generateContentStream(requestConfig);

      // 处理流式响应
      for await (const chunk of response) {
        if (abortController.signal.aborted) {
          break;
        }

        const content = chunk.text || '';

        if (content) {
          // 处理流式内容
          result.content = [
            {
              type: 'text',
              text: content,
            },
          ];

          result.full_content += content;
          onProgress?.({
            content: result.content,
          });
        }
      }
    } catch (error) {
      Logger.error(`Gemini请求失败: ${handleError(error)}`, 'OpenAIChatService');
      throw error;
    }
  }

  /**
   * 通过REST API直接调用Gemini（支持完全自定义地址）
   * @param messagesHistory 处理后的消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   */
  private async handleGeminiRestAPI(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl?: any;
      temperature: any;
      max_tokens?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<void> {
    const { apiKey, model, proxyUrl, temperature, max_tokens, abortController, onProgress } =
      inputs;

    try {
      // 转换消息格式为Gemini REST API格式
      const { contents, systemInstruction } = this.convertOpenAIToGeminiFormat(messagesHistory);

      // 构建请求URL
      const baseUrl = proxyUrl || 'https://generativelanguage.googleapis.com';
      const modelName = model || 'gemini-2.0-flash';
      const url = `${baseUrl}/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}`;

      // 构建请求payload
      const payload: any = {
        contents: contents,
        generationConfig: {
          temperature: temperature,
        },
      };

      // 添加系统指令
      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      // 添加最大token数
      if (max_tokens) {
        payload.generationConfig.maxOutputTokens = max_tokens;
      }

      Logger.debug(
        `Gemini REST API请求 - URL: ${url}, Payload: ${JSON.stringify(payload)}`,
        'OpenAIChatService',
      );

      // 发送流式请求
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (abortController.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 处理多个JSON对象
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const chunk = JSON.parse(trimmedLine);

            // 提取内容
            const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (content) {
              // 处理流式内容
              result.content = [
                {
                  type: 'text',
                  text: content,
                },
              ];

              result.full_content += content;
              onProgress?.({
                content: result.content,
              });
            }
          } catch (parseError) {
            Logger.warn(`解析Gemini响应块失败: ${parseError}`, 'OpenAIChatService');
          }
        }
      }

      // 处理剩余的buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim());
          const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (content) {
            result.content = [
              {
                type: 'text',
                text: content,
              },
            ];

            result.full_content += content;
            onProgress?.({
              content: result.content,
            });
          }
        } catch (parseError) {
          Logger.warn(`解析最终Gemini响应块失败: ${parseError}`, 'OpenAIChatService');
        }
      }
    } catch (error) {
      Logger.error(`Gemini REST API请求失败: ${handleError(error)}`, 'OpenAIChatService');
      throw error;
    }
  }

  private safeParseAdditionalParams(additionalParams: any): any {
    if (!additionalParams) {
      return {};
    }
    if (typeof additionalParams === 'object') {
      return additionalParams;
    }

    Logger.debug(`解析additionalParams: ${additionalParams}`, 'OpenAIChatService');
    try {
      return JSON.parse(additionalParams);
    } catch (error) {
      Logger.warn(`解析additionalParams失败: ${error}`, 'OpenAIChatService');
      return {};
    }
  }
}
