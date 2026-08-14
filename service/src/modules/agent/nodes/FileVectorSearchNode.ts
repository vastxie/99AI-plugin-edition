import { Injectable, Logger } from '@nestjs/common';
import { FileVectorCacheService } from '../../aiTool/search/fileVectorCache.service';
import { FileVectorSearchService } from '../../aiTool/search/fileVectorSearch.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeMeta, NodeOutput } from '../core/NodeInterface';

/**
 * 文件向量搜索节点 - 使用新架构
 * 处理文件上传和向量搜索分析
 */
@Injectable()
export class FileVectorSearchNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'file_vector_search',
    type: 'file_vector_search',
    name: '文件向量搜索节点',
    description: '分析上传的文件内容，支持向量搜索和语义分析',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    private readonly fileVectorSearchService: FileVectorSearchService,
    private readonly fileVectorCacheService: FileVectorCacheService,
  ) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    Logger.debug('开始执行文件向量搜索节点');

    // 获取文件URL和搜索关键词
    const fileUrl = this.extractFileUrl(input);
    const searchPrompt = this.extractSearchPrompt(input);

    if (!fileUrl || !searchPrompt) {
      Logger.debug('缺少文件URL或搜索关键词，跳过文件向量搜索');
      return this.createSkippedResult('missing_input');
    }

    // 提取用户ID
    const userId = input.context.options?.userId || input.context.options?.cuserId || null;

    // 解析文件URL数组
    let fileUrls: string[] = [];
    try {
      if (fileUrl.startsWith('[')) {
        const fileArray = JSON.parse(fileUrl);
        if (Array.isArray(fileArray)) {
          fileUrls = fileArray.map(f => f.url).filter(Boolean);
        }
      }
      if (fileUrls.length === 0) {
        fileUrls = [fileUrl];
      }
    } catch (e) {
      fileUrls = [fileUrl];
    }

    // 检查所有文件的缓存状态
    const cachedData: Array<{
      fileUrl: string;
      chunks: string[];
      vectors: number[][];
      originalFileName?: string;
    }> = [];
    const uncachedUrls: string[] = [];

    for (const url of fileUrls) {
      try {
        const cached = await this.fileVectorCacheService.getVectors(url);
        if (cached) {
          cachedData.push({
            fileUrl: url,
            chunks: cached.chunks,
            vectors: cached.vectors,
            originalFileName: cached.originalFileName,
          });
        } else {
          uncachedUrls.push(url);
        }
      } catch (error) {
        uncachedUrls.push(url);
      }
    }

    Logger.log(`缓存检查: ${cachedData.length}个文件有缓存, ${uncachedUrls.length}个文件无缓存`);

    // 如果所有文件都有缓存，使用缓存向量搜索（跳过向量化）
    if (uncachedUrls.length === 0 && cachedData.length > 0) {
      Logger.log(`使用缓存向量搜索: ${cachedData.length}个文件`);

      // 发送开始状态
      this.sendStream(input, {
        type: 'status',
        status: 'processing',
        content: '从缓存读取文件向量...',
      });

      // 生成唯一的工具执行ID（整个节点共用）
      const toolExecutionId = `file_search_${Date.now()}_0`;

      // 发送loading状态的工具执行
      const loadingToolExecution = {
        id: toolExecutionId,
        type: 'file_search',
        name: '文档分析（缓存）',
        status: 'loading',
        input: {
          fileUrl,
          searchPrompt,
        },
        output: null,
        time: Date.now(),
      };

      this.sendStream(input, {
        type: 'data',
        data: {
          nodeType: 'file_vector_search',
          toolExecutions: [loadingToolExecution],
        },
      });

      // 使用缓存向量进行搜索（包含用户查询向量化 + 相似度计算）
      const fileVectorResult = await this.fileVectorSearchService.searchWithCachedVectors(
        cachedData,
        searchPrompt,
      );

      return this.handleVectorSearchResult(
        input,
        fileUrl,
        searchPrompt,
        fileVectorResult,
        true,
        toolExecutionId,
      );
    }

    // 否则执行向量化流程
    Logger.log(`${uncachedUrls.length}个文件需要向量化`);

    // 发送开始状态
    this.sendStream(input, {
      type: 'status',
      status: 'processing',
      content: input.config.progressMessages?.start || '启动文件向量搜索...',
    });

    try {
      // 发送处理中状态
      this.sendStream(input, {
        type: 'status',
        status: 'processing',
        content: input.config.progressMessages?.processing || '分析文件内容中...',
      });

      // 创建结果对象用于兼容原有逻辑
      const result: any = {};

      // 生成工具执行ID
      const toolExecutionId = `file_search_${Date.now()}_0`;

      // 调用文件向量搜索服务
      const fileVectorResult = await this.fileVectorSearchService.processFileVectorSearch(
        fileUrl,
        searchPrompt,
        {
          isFileUpload: input.context.options?.isFileUpload,
          userId: userId, // 传递 userId
          onProgress: (data: any) => {
            // 构建工具执行格式（loading状态）
            const toolExecution = {
              id: toolExecutionId,
              type: 'file_search',
              name: '文档分析',
              status: 'loading',
              input: {
                fileUrl,
                searchPrompt,
              },
              output: null,
              time: Date.now(),
            };

            // 发送进度数据流
            this.sendStream(input, {
              type: 'data',
              data: {
                nodeType: 'file_vector_search',
                toolExecutions: [toolExecution],
              },
            });

            // 构建流式agent_content（统一格式）
            const streamAgentContent = {
              metadata: {
                type: 'streaming',
                workflowId: input.context.workflowId,
                nodeExecutionId: input.context.currentNodeExecutionId,
                nodeExecutionSequence: input.context.nodeExecutionSequence,
                timestamp: new Date().toISOString(),
                nodeType: 'file_vector_search',
              },
              data: {
                toolExecutions: [toolExecution],
              },
            };

            // 向后兼容的进度回调
            input.context.onProgress?.({
              nodeType: 'file_vector_search',
              status: 'processing',
              statusMessage: '正在处理文件...',
              agent_content: JSON.stringify(streamAgentContent),
            });
          },
          onDatabase: async (data: any) => {
            // onDatabase 回调已不再需要，向量缓存在 fileVectorSearch 内部保存
            // 这里只保存搜索结果到数据库（如果有需要）
          },
        },
        result,
      );

      // 向量化完成，使用统一的结果处理函数
      return this.handleVectorSearchResult(
        input,
        fileUrl,
        searchPrompt,
        fileVectorResult,
        false,
        toolExecutionId,
      );
    } catch (error) {
      Logger.error(`文件向量搜索节点执行失败: ${error.message}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `文件搜索失败: ${error.message}`,
      });

      // 返回错误结果，但保持基本结构
      const errorState = {
        fileVectorResult: null,
        searchEnabled: false,
        error: error.message,
        processTime: new Date().toISOString(),
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
          [input.config.outputKey || 'fileVectorResult']: errorState,
        },
      };
    }
  }

  /**
   * 从上下文中提取文件URL
   */
  private extractFileUrl(input: NodeInput): string | null {
    // 优先从动态参数获取
    if (input.dynamicParams?.fileUrl) {
      return input.dynamicParams.fileUrl;
    }

    // 从配置获取
    if (input.config.fileUrl) {
      return input.config.fileUrl;
    }

    // 从options中获取文件URL
    return input.context.options?.fileUrl || null;
  }

  /**
   * 从上下文中提取搜索关键词
   */
  private extractSearchPrompt(input: NodeInput): string | null {
    // 优先从动态参数获取
    if (input.dynamicParams?.searchPrompt) {
      return input.dynamicParams.searchPrompt;
    }

    // 从配置获取
    if (input.config.searchPrompt) {
      return input.config.searchPrompt;
    }

    // 从消息历史中提取用户最后一条消息作为搜索关键词
    for (let i = input.messages.length - 1; i >= 0; i--) {
      const message = input.messages[i];
      if (message.role === 'user') {
        // 处理字符串内容
        if (typeof message.content === 'string') {
          return message.content.trim();
        }

        // 处理数组内容（多模态消息）
        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'text' && item.text) {
              return item.text.trim();
            }
          }
        }
      }
    }

    // 也可以从options中获取prompt
    return input.context.options?.prompt || null;
  }

  /**
   * 生成文件分析摘要
   */
  private generateSummary(fileVectorResult: any): string {
    if (!fileVectorResult) {
      return '未找到相关内容';
    }

    // 根据结果生成摘要
    if (typeof fileVectorResult === 'string') {
      return fileVectorResult.substring(0, 200);
    }

    if (Array.isArray(fileVectorResult)) {
      return `找到 ${fileVectorResult.length} 个相关结果`;
    }

    if (typeof fileVectorResult === 'object' && fileVectorResult.summary) {
      return fileVectorResult.summary;
    }

    return '文件分析完成';
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(reason: string): NodeOutput {
    const emptyState = {
      fileVectorResult: null,
      searchEnabled: false,
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
        fileVectorResult: emptyState,
      },
    };
  }

  /**
   * 处理向量搜索结果（统一的结果处理函数）
   * @param input 输入
   * @param fileUrl 文件URL
   * @param searchPrompt 搜索提示
   * @param fileVectorResult 向量搜索结果（可以是向量化得到的，也可以是缓存搜索得到的）
   * @param usedCached 是否使用了缓存向量
   * @param toolExecutionId 工具执行ID（可选，如果不提供则生成新的）
   */
  private async handleVectorSearchResult(
    input: NodeInput,
    fileUrl: string,
    searchPrompt: string,
    fileVectorResult: any,
    usedCached: boolean,
    toolExecutionId?: string,
  ): Promise<NodeOutput> {
    // 如果没有提供 toolExecutionId，生成一个新的
    const finalToolExecutionId = toolExecutionId || `file_search_${Date.now()}_0`;

    // 发送完成状态
    this.sendStream(input, {
      type: 'status',
      status: 'completed',
      content: input.config.progressMessages?.end || '文件向量搜索完成',
    });

    // 构建搜索状态
    const searchState = {
      fileVectorResult,
      searchEnabled: true,
      skipped: false,
      fileUrl,
      searchPrompt,
      processTime: new Date().toISOString(),
      usedCachedVectors: usedCached,
      summary: this.generateSummary(fileVectorResult),
    };

    // 构建工具执行格式（完成状态）
    const completedToolExecution = {
      id: finalToolExecutionId,
      type: 'file_search',
      name: usedCached ? '文档分析（缓存）' : '文档分析',
      status: 'success',
      input: {
        fileUrl,
        searchPrompt,
      },
      output: fileVectorResult,
      time: Date.now(),
    };

    // 发送完成的数据流
    this.sendStream(input, {
      type: 'data',
      data: {
        nodeType: 'file_vector_search',
        toolExecutions: [completedToolExecution],
      },
    });
    // 构建完成的agent_content（统一格式）
    const finalAgentContent = {
      metadata: {
        type: 'streaming',
        workflowId: input.context.workflowId,
        nodeExecutionId: input.context.currentNodeExecutionId,
        nodeExecutionSequence: input.context.nodeExecutionSequence,
        timestamp: new Date().toISOString(),
        nodeType: 'file_vector_search',
      },
      data: {
        toolExecutions: [completedToolExecution],
      },
    };

    // 只通过 onProgress 发送一次完整数据，避免重复
    // 向后兼容的完成回调
    input.context.onProgress?.({
      nodeType: 'file_vector_search',
      status: 'completed',
      statusMessage: input.config.progressMessages?.end || '文件向量搜索完成',
      agent_content: JSON.stringify(finalAgentContent),
    });

    Logger.debug(`文件向量搜索完成 - 有结果: ${!!fileVectorResult}, 使用缓存: ${usedCached}`);

    // 返回成功结果
    return {
      result: {
        success: true,
        data: searchState,
        metadata: {
          fileUrl,
          searchPrompt,
          hasResults: !!fileVectorResult,
          processTime: searchState.processTime,
          usedCachedVectors: usedCached,
        },
      },
      stateUpdates: {
        [input.config.outputKey || 'fileVectorResult']: searchState,
      },
      agentDataUpdates: {
        toolExecutions: [completedToolExecution],
      },
    };
  }
}
