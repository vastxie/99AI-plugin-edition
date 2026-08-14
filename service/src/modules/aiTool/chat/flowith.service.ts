import { handleError } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';

@Injectable()
export class FlowithService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  async flowithChat(
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

      onProgress?: (data: {
        text?: string;
        content?: any[];
        reasoning_content?: [];
        networkSearchResult?: any;
        fileVectorResult?: any;
        tool_calls?: string;
        finishReason?: string;
        seeds?: any[];
      }) => void;
      onFailure?: (error: any) => void;
      abortController: AbortController;
    },
  ) {
    const {
      onFailure,
      onProgress,
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
      fullFileVectorResult: '',
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

      // Logger.debug(`Flowith请求 URL: ${url}`, 'FlowithService');
      // Logger.debug(`Flowith请求 options: ${JSON.stringify(requestOptions)}`, 'FlowithService');

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

        // 记录响应头信息
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        // Logger.debug(`响应头信息: ${JSON.stringify(headers)}`, 'FlowithService');

        // 检查Content-Type
        const contentType = response.headers.get('Content-Type');
        // Logger.debug(`响应内容类型: ${contentType}`, 'FlowithService');

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
            Logger.debug('流式响应已完成', 'FlowithService');
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
                'FlowithService',
              );

              // 根据tag类型处理不同的响应
              if (data.tag === 'final' && data.content) {
                // 过滤掉最后的[DONE]标记，但保留其他所有字符（包括换行）
                const cleanedContent = data.content.replace(/\[DONE\]$/, '');

                // 更新结果并发送给客户端
                result.full_content += cleanedContent;
                onProgress?.({
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

                  // 创建与fileVectorSearch结果格式兼容的对象，确保格式符合预期
                  const fileVectorResult = {
                    relevantContent: seedsData.map(item => item.content || '').join('\n\n'),
                    formattedResults: formattedResults,
                    similarities: seedsData.map(item => (item.nip ? parseFloat(item.nip) : 1.0)),
                    isFullText: false,
                  };

                  // 将对象转换为JSON字符串 - 用于流式传输的版本
                  const fileVectorResultStr = JSON.stringify(fileVectorResult, null, 2);

                  // 更新结果并传递格式化后的文件向量搜索结果
                  result.fileVectorResult = fileVectorResultStr;
                  onProgress?.({
                    fileVectorResult: fileVectorResultStr,
                  });
                }
              } else if (data.tag === 'searching' && data.content) {
                // 处理搜索状态更新
                onProgress?.({
                  content: [{ type: 'text', text: data.content }],
                });
              }
            } catch (error) {
              currentJsonError++;
              // 限制错误日志数量
              if (currentJsonError <= maxJsonErrors) {
                Logger.error(
                  `解析JSON失败: ${jsonStr}, 错误: ${handleError(error)}`,
                  'FlowithService',
                );
              } else if (currentJsonError === maxJsonErrors + 1) {
                Logger.error(
                  `已达到最大错误日志数量(${maxJsonErrors})，后续错误将不再逐条记录`,
                  'FlowithService',
                );
              }
            }
          }
        }

        // 处理剩余的buffer中可能有的不完整数据
        if (buffer.trim()) {
          Logger.debug(`剩余未处理的buffer: ${buffer}`, 'FlowithService');
          if (buffer.includes('data:')) {
            try {
              const jsonStr = buffer.replace('data:', '').trim();
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                // 处理最后一个数据块
                if (data.tag === 'final' && data.content) {
                  const cleanedContent = data.content.replace(/\[DONE\]$/, '');
                  result.full_content += cleanedContent;
                  onProgress?.({
                    content: [{ type: 'text', text: cleanedContent }],
                  });
                }
              }
            } catch (error) {
              Logger.error(`处理剩余buffer时出错: ${handleError(error)}`, 'FlowithService');
            }
          }
        }

        // 确保最后的内容被处理完成
        decoder.decode(); // 刷新解码器缓冲区

        // 处理完成
        result.finishReason = 'stop';
        Logger.debug(
          `流式处理完成，最终结果长度: ${result.full_content.length}字符`,
          'FlowithService',
        );

        return result;
      } catch (error) {
        if (error instanceof Error) {
          Logger.error(`Flowith请求失败: ${error.name} - ${error.message}`, 'FlowithService');
          if (error.stack) {
            Logger.debug(`错误堆栈: ${error.stack}`, 'FlowithService');
          }
        } else {
          Logger.error(`Flowith请求失败: ${handleError(error)}`, 'FlowithService');
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = handleError(error);
      // 如果是用户主动中断（返回空字符串），不记录错误也不设置错误消息
      if (errorMessage) {
        Logger.error(`Flowith对话请求失败: ${errorMessage}`, 'FlowithService');
        result.errMsg = errorMessage;
        onFailure?.(result);
      } else {
        Logger.debug('Flowith对话被用户主动中断', 'FlowithService');
      }
      return result;
    }
  }
}
