import { correctApiBaseUrl, fetchRemoteUrlBuffer, handleError } from '@/common/utils';
import { getTokenCount } from '@/common/utils/getTokenCount';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import * as mammoth from 'mammoth';

import OpenAI from 'openai';
import pdf2md from '@opendocsg/pdf2md';
// 移除静态导入，改用动态导入
// import { parse } from 'pptxtojson';
import * as ExcelJS from 'exceljs';
import TurndownService = require('turndown');
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { FileVectorCacheService } from './fileVectorCache.service';

// 定义文件对象接口
interface FileObject {
  name: string;
  url: string;
  type: string;
}

// 定义文件源信息接口
interface FileSourceInfo {
  fileName: string;
  url: string;
  endPos: number;
}

// 定义文本块源信息接口
interface ChunkSourceInfo {
  fileName: string;
  url: string;
}

@Injectable()
export class FileVectorSearchService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly fileVectorCacheService: FileVectorCacheService,
  ) {}

  private async downloadRemoteBuffer(
    fileUrl: string,
    maxBytes = 25 * 1024 * 1024,
  ): Promise<Buffer> {
    const { buffer } = await fetchRemoteUrlBuffer(fileUrl, {
      timeoutMs: 30000,
      maxBytes,
      maxRedirects: 3,
      headers: {
        'User-Agent': '99AI-Remote-Fetch/1.0',
        Accept: '*/*',
      },
    });
    return buffer;
  }

  /**
   * 处理文件向量搜索流程
   * @param fileUrl 文件URL
   * @param prompt 搜索关键词
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 文件向量搜索结果
   */
  /**
   * 处理文件向量搜索流程（带userId）
   */
  async processFileVectorSearch(
    fileUrl: string,
    prompt: string,
    inputs: {
      isFileUpload: any;
      onProgress?: (data: any) => void;
      onDatabase?: (data: any) => void;
      userId?: number; // 添加 userId 参数
    },
    result: any,
  ): Promise<any> {
    const { isFileUpload, onProgress, onDatabase, userId } = inputs;
    let fileVectorResult = null;

    // 如果没有文件URL或不是文件上传模式，直接返回null
    if (!fileUrl || isFileUpload !== 2) {
      return fileVectorResult;
    }

    if (prompt.includes('翻译')) {
      return fileVectorResult;
    }

    try {
      Logger.log('[文件向量搜索] 开始分析文件', 'FileVectorSearchService');

      // 显示搜索中状态
      onProgress?.({
        fileVectorResult: '搜索中...\n',
      });

      // 调用文件向量搜索服务，传递 userId
      fileVectorResult = await this.fileVectorSearch(fileUrl, prompt, { userId });

      Logger.log(`[文件向量搜索] 完成`, 'FileVectorSearchService');

      // 更新结果对象
      if (fileVectorResult) {
        result.fileVectorResult = JSON.stringify(fileVectorResult, null, 2);
        onProgress?.({
          fileVectorResult: result.fileVectorResult,
        });

        // 存储数据到数据库
        onDatabase?.({
          fileVectorResult: result.fileVectorResult,
        });
      }

      return fileVectorResult;
    } catch (error) {
      Logger.error(`[文件向量搜索] 失败: ${handleError(error)}`, 'FileVectorSearchService');

      // 即时存储错误信息
      onDatabase?.({
        file_vector_search_error: {
          error: handleError(error),
          file_url: fileUrl,
          query: prompt,
          timestamp: new Date(),
        },
      });

      return null;
    }
  }

  /**
   * 处理文件向量搜索流程（带向量保存功能）
   * @param fileUrl 文件URL
   * @param prompt 搜索关键词
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 文件向量搜索结果
   */
  async processFileVectorSearchWithCache(
    fileUrl: string,
    prompt: string,
    inputs: {
      isFileUpload: any;
      onProgress?: (data: any) => void;
      onDatabase?: (data: any) => void;
      userId?: number; // 添加 userId 参数
    },
    result: any,
  ): Promise<any> {
    const { isFileUpload, onProgress, onDatabase, userId } = inputs;
    let fileVectorResult = null;

    // 如果没有文件URL或不是文件上传模式，直接返回null
    if (!fileUrl || isFileUpload !== 2) {
      return fileVectorResult;
    }

    if (prompt.includes('翻译')) {
      return fileVectorResult;
    }

    try {
      Logger.log('[文件向量搜索] 开始分析文件', 'FileVectorSearchService');

      // 显示搜索中状态
      onProgress?.({
        fileVectorResult: '搜索中...\n',
      });

      // 调用文件向量搜索服务（这将执行向量化但不保存缓存）
      fileVectorResult = await this.fileVectorSearch(fileUrl, prompt);

      Logger.log(`[文件向量搜索] 完成`, 'FileVectorSearchService');

      // 更新结果对象
      if (fileVectorResult) {
        result.fileVectorResult = JSON.stringify(fileVectorResult, null, 2);
        onProgress?.({
          fileVectorResult: result.fileVectorResult,
        });

        // 存储数据到数据库
        onDatabase?.({
          fileVectorResult: result.fileVectorResult,
        });

        // 保存向量缓存（异步，不阻塞主流程）
        if (userId && fileVectorResult.formattedResults) {
          this.saveVectorCacheFromResults(fileUrl, fileVectorResult, userId).catch(error => {
            Logger.warn(
              `向量缓存保存失败（不影响当前查询）: ${error.message}`,
              'FileVectorSearchService',
            );
          });
        }
      }

      return fileVectorResult;
    } catch (error) {
      Logger.error(`[文件向量搜索] 失败: ${handleError(error)}`, 'FileVectorSearchService');

      // 即时存储错误信息
      onDatabase?.({
        file_vector_search_error: {
          error: handleError(error),
          file_url: fileUrl,
          query: prompt,
          timestamp: new Date(),
        },
      });

      return null;
    }
  }

  /**
   * 从搜索结果保存向量缓存
   */
  private async saveVectorCacheFromResults(
    fileUrl: string,
    searchResult: any,
    userId: number,
  ): Promise<void> {
    try {
      // 解析文件URL
      let fileObjects: FileObject[] = [];
      try {
        if (fileUrl.startsWith('[')) {
          const fileArray = JSON.parse(fileUrl);
          if (Array.isArray(fileArray)) {
            fileObjects = fileArray;
          }
        }
      } catch (e) {
        Logger.error(`解析文件 URL 失败: ${e.message}`, 'FileVectorSearchService');
        return;
      }

      // 从配置中获取模型信息
      const { vectorModel, openaiBaseModel } = await this.globalConfigService.getConfigs([
        'vectorModel',
        'openaiBaseModel',
      ]);
      const modelInfo = vectorModel || openaiBaseModel;

      // 为每个文件保存缓存
      // 注意：这里我们需要重新提取文本和向量化，因为 searchResult 中没有包含向量数据
      // 所以这个方法不合适，我们需要在 fileVectorSearch 内部保存

      Logger.warn(`向量缓存保存需要重构，应该在向量化完成时直接保存`, 'FileVectorSearchService');
    } catch (error) {
      Logger.error(`保存向量缓存失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw error;
    }
  }

  /**
   * 使用缓存的向量数据进行搜索（无需重新提取文本和向量化）
   * @param cachedData 缓存的数据数组（包含chunks和vectors）
   * @param userQuery 用户查询
   * @returns 搜索结果
   */
  async searchWithCachedVectors(
    cachedData: Array<{
      fileUrl: string;
      chunks: string[];
      vectors: number[][];
      originalFileName?: string;
    }>,
    userQuery: string,
  ) {
    const { vectorUrl, vectorKey, vectorModel, openaiBaseUrl, openaiBaseKey, openaiBaseModel } =
      await this.globalConfigService.getConfigs([
        'vectorUrl',
        'vectorKey',
        'vectorModel',
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiBaseModel',
      ]);

    const baseURL = vectorUrl || openaiBaseUrl;
    const apiKey = vectorKey || openaiBaseKey;
    const modelStr = vectorModel || openaiBaseModel;

    try {
      Logger.log(
        `[缓存向量搜索] 开始处理 ${cachedData.length} 个文件，查询长度: ${userQuery.length}`,
        'FileVectorSearchService',
      );

      // 1. 准备OpenAI客户端
      const openai = new OpenAI({ baseURL, apiKey });

      Logger.log(`[缓存向量搜索] 向量 API 已配置，模型: ${modelStr}`, 'FileVectorSearchService');

      // 2. 将用户查询转换为向量
      Logger.log(`[缓存向量搜索] 正在将用户查询转换为向量`, 'FileVectorSearchService');
      let queryEmbedding;
      try {
        const startTime = Date.now();

        queryEmbedding = await openai.embeddings.create({
          model: modelStr,
          input: userQuery,
          encoding_format: 'float',
        });

        const endTime = Date.now();
        Logger.log(
          `[缓存向量搜索] 查询向量化完成，耗时: ${endTime - startTime}ms`,
          'FileVectorSearchService',
        );
      } catch (error) {
        const errorDetail = handleError(error);
        Logger.error(`[缓存向量搜索] 查询向量化失败: ${errorDetail}`, 'FileVectorSearchService');
        throw new Error(`无法将用户查询转换为向量: ${errorDetail}`);
      }

      if (
        !queryEmbedding ||
        !queryEmbedding.data ||
        !queryEmbedding.data[0] ||
        !queryEmbedding.data[0].embedding
      ) {
        throw new Error('查询向量化失败：返回数据格式不正确');
      }

      const queryVector = queryEmbedding.data[0].embedding;

      // 3. 计算所有chunks与查询的相似度
      Logger.log(`[缓存向量搜索] 计算相似度`, 'FileVectorSearchService');

      // 将所有缓存的chunks和vectors展平为一个数组
      const allChunks = cachedData.flatMap(data =>
        data.chunks.map((chunk, index) => ({
          text: chunk,
          vector: data.vectors[index],
          fileName: data.originalFileName || data.fileUrl.split('/').pop() || '未知文件',
          url: data.fileUrl,
        })),
      );

      // 计算每个chunk与查询的相似度
      const rankedChunks = allChunks
        .map(chunk => {
          try {
            const similarity = this.cosineSimilarity(queryVector, chunk.vector);
            return {
              ...chunk,
              similarity,
            };
          } catch (error) {
            Logger.warn(
              `[缓存向量搜索] 计算相似度时出错: ${handleError(error)}`,
              'FileVectorSearchService',
            );
            return {
              ...chunk,
              similarity: 0,
            };
          }
        })
        .sort((a, b) => b.similarity - a.similarity);

      // 4. 构建返回结果（与原 fileVectorSearch 返回格式一致）
      const topResults = rankedChunks.slice(0, 10); // 返回前10个最相关的文本块

      // 合并的相关内容添加文件来源标记
      const relevantContentWithSource = topResults
        .map(item => `【文件：${item.fileName}】\n${item.text}`)
        .join('\n\n');

      const formattedResults = topResults.map((item, index) => {
        return {
          content: this.processChinese(item.text),
          similarity: item.similarity.toFixed(4),
          index: index + 1,
          fileName: item.fileName,
          fileUrl: item.url,
        };
      });

      const result = {
        relevantContent: this.processChinese(relevantContentWithSource),
        formattedResults: formattedResults,
        similarities: topResults.map(item => item.similarity),
      };

      Logger.log(
        `[缓存向量搜索] 搜索完成，返回 ${topResults.length} 个相关文本块`,
        'FileVectorSearchService',
      );

      return result;
    } catch (error) {
      Logger.error(`[缓存向量搜索] 处理失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw error;
    }
  }

  async fileVectorSearch(
    fileUrl: string,
    userQuery: string,
    options?: {
      userId?: number; // 用户ID，用于保存缓存
    },
  ) {
    const {
      vectorUrl,
      vectorKey,
      vectorModel,
      openaiBaseUrl,
      openaiBaseKey,
      openaiBaseModel,
      maxUrlTextLength,
      vectorAnalysisThreshold,
      vectorMaxTokens,
      vectorOverlapTokens,
      vectorCacheExpiresDays,
    } = await this.globalConfigService.getConfigs([
      'vectorUrl',
      'vectorKey',
      'vectorModel',
      'openaiBaseUrl',
      'openaiBaseKey',
      'openaiBaseModel',
      'maxUrlTextLength',
      'vectorAnalysisThreshold',
      'vectorMaxTokens',
      'vectorOverlapTokens',
      'vectorCacheExpiresDays',
    ]);

    const maxTextLength = maxUrlTextLength ? parseInt(maxUrlTextLength, 10) : 10000;

    // 获取缓存有效期配置（默认3天）
    const cacheExpiresDays = vectorCacheExpiresDays ? parseInt(vectorCacheExpiresDays, 10) : 3;

    Logger.log(`向量缓存配置: 有效期 ${cacheExpiresDays} 天`, 'FileVectorSearchService');

    try {
      Logger.log(`开始处理文件向量搜索`, 'FileVectorSearchService');

      // 解析JSON格式的URL参数
      let fileObjects: FileObject[] = [];
      try {
        // 尝试解析JSON
        fileObjects = JSON.parse(fileUrl);
        Logger.log(
          `解析JSON格式fileUrl，包含${fileObjects.length}个文件`,
          'FileVectorSearchService',
        );
      } catch (jsonError) {
        // 如果不是JSON格式，则按照原来的逗号分隔方式处理
        Logger.log(`fileUrl非JSON格式，按逗号分隔处理`, 'FileVectorSearchService');
        const urls = fileUrl
          .split(',')
          .map(url => url.trim())
          .filter(url => url.length > 0);

        // 转换为统一格式
        fileObjects = urls.map(url => ({
          name: url.split('/').pop() || '未知文件',
          url: url,
          type: 'document',
        }));
      }

      if (fileObjects.length === 0) {
        throw new Error('无效的文件URL');
      }

      // ========== 新增：检查缓存逻辑 ==========
      // 提取所有文件的URL
      const fileUrls = fileObjects.map(f => f.url);

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

      Logger.log(
        `缓存检查: ${cachedData.length}个文件有缓存, ${uncachedUrls.length}个文件无缓存`,
        'FileVectorSearchService',
      );

      // 如果所有文件都有缓存，使用缓存向量搜索（跳过向量化）
      if (uncachedUrls.length === 0 && cachedData.length > 0) {
        Logger.log(`使用缓存向量搜索: ${cachedData.length}个文件`, 'FileVectorSearchService');
        return await this.searchWithCachedVectors(cachedData, userQuery);
      }

      // 否则继续原有的向量化流程（只处理没有缓存的文件）
      if (uncachedUrls.length > 0) {
        Logger.log(
          `${uncachedUrls.length}个文件需要向量化，继续原有流程`,
          'FileVectorSearchService',
        );
        // 过滤出需要向量化的文件对象
        fileObjects = fileObjects.filter(f => uncachedUrls.includes(f.url));
      }
      // ========== 结束：检查缓存逻辑 ==========

      // 初始化变量
      let totalCharCount = 0;
      let exceededMaxLength = false;
      // 定义向量分析阈值
      const analysisThreshold = vectorAnalysisThreshold
        ? parseInt(vectorAnalysisThreshold, 10)
        : 2000;
      let allFileContents: { content: string; fileName: string; url: string }[] = [];

      // 处理每个文件并收集内容
      for (const fileObj of fileObjects) {
        const url = fileObj.url;
        const fileName = fileObj.name || url.split('/').pop() || '未知文件';

        Logger.log('开始获取文件内容', 'FileVectorSearchService');
        let fileContent = await this.extractTextFromUrl(url);

        if (!fileContent || fileContent.trim() === '') {
          Logger.warn('无法提取文件文本内容', 'FileVectorSearchService');
          continue; // 跳过空内容，继续处理下一个URL
        }

        // 处理文本，确保正确显示中文
        fileContent = this.processChinese(fileContent);

        // 检查单个URL内容是否超过最大长度限制
        if (fileContent.length > maxTextLength) {
          Logger.warn(
            `文件内容超过限制(${maxTextLength}字符)，将被截断`,
            'FileVectorSearchService',
          );
          fileContent =
            fileContent.substring(0, maxTextLength) +
            `\n[内容已截断，超过${maxTextLength}字符限制]`;
          exceededMaxLength = true;
        }

        // 更新总字符数
        totalCharCount += fileContent.length;

        // 保存文件内容和信息
        allFileContents.push({
          content: fileContent,
          fileName,
          url,
        });
      }

      // 如果所有文件都无内容，抛出错误
      if (allFileContents.length === 0) {
        throw new Error('无法从所有文件中提取文本内容');
      }

      // 生成合并的文件内容（用于返回完整内容）
      let mergedFileContent = '';
      for (const file of allFileContents) {
        mergedFileContent += `\n\n--- 文件: ${file.fileName} ---\n\n${file.content}`;
      }
      mergedFileContent = mergedFileContent.trim();

      // 如果总内容小于向量分析阈值，直接返回全文
      if (totalCharCount < analysisThreshold) {
        Logger.log(
          `所有文件总内容长度(${totalCharCount}字符)小于向量分析阈值(${analysisThreshold}字符)，直接返回全文`,
          'FileVectorSearchService',
        );

        // 如果是单个文件，直接返回其内容
        if (allFileContents.length === 1) {
          return {
            relevantContent: allFileContents[0].content,
            formattedResults: [
              {
                content: allFileContents[0].content,
                similarity: '1.0000',
                index: 1,
                fileName: allFileContents[0].fileName,
                fileUrl: allFileContents[0].url,
              },
            ],
            similarities: [1.0],
            isFullText: true,
            skipVectorAnalysis: true,
          };
        }

        // 如果是多个文件，返回每个文件的内容和信息
        const formattedResults = allFileContents.map((file, index) => {
          return {
            content: file.content,
            similarity: '1.0000',
            index: index + 1,
            fileName: file.fileName,
            fileUrl: file.url,
          };
        });

        return {
          relevantContent: mergedFileContent, // 保留合并内容作为总概览
          formattedResults: formattedResults, // 但是返回每个文件的单独信息
          similarities: Array(allFileContents.length).fill(1.0),
          isFullText: true,
          skipVectorAnalysis: true,
          fileCount: allFileContents.length,
        };
      }

      Logger.log(
        `提取文本内容完成，总长度: ${mergedFileContent.length}字符`,
        'FileVectorSearchService',
      );

      // 如果总内容超过最大长度的3倍，发出警告（多个URL的情况）
      if (mergedFileContent.length > maxTextLength * 3) {
        Logger.warn(
          `合并内容长度(${mergedFileContent.length}字符)超过限制的3倍，处理可能变慢`,
          'FileVectorSearchService',
        );
      }

      // 对每个文件单独切片，并记录文件来源
      const textChunks: string[] = [];
      const chunkSourceMap: Record<number, ChunkSourceInfo> = {};

      // 获取切片配置（优先从配置读取，否则使用默认值）
      const chunkMaxTokens = vectorMaxTokens ? parseInt(vectorMaxTokens, 10) : 512; // 默认512 tokens
      const chunkOverlapTokens = vectorOverlapTokens ? parseInt(vectorOverlapTokens, 10) : 50; // 默认50 tokens重叠 (~10%)

      Logger.log(
        `切片配置: ${chunkMaxTokens} tokens/chunk, ${chunkOverlapTokens} tokens overlap`,
        'FileVectorSearchService',
      );

      for (const file of allFileContents) {
        // 对单个文件内容进行切片（基于token）
        const fileChunks = await this.chunkTextByTokens(
          file.content,
          chunkMaxTokens,
          chunkOverlapTokens,
        );

        // 记录每个切片的来源文件信息
        fileChunks.forEach(chunk => {
          const chunkIndex = textChunks.length;
          textChunks.push(chunk);
          chunkSourceMap[chunkIndex] = {
            fileName: file.fileName,
            url: file.url,
          };
        });

        Logger.log(`单个文件切分为 ${fileChunks.length} 个块`, 'FileVectorSearchService');
      }

      Logger.log(`所有文件共切分为 ${textChunks.length} 个块`, 'FileVectorSearchService');

      // 继续处理向量搜索
      try {
        // 验证必要的配置信息
        if (!vectorKey && !openaiBaseKey) {
          Logger.error('缺少向量化API密钥配置', 'FileVectorSearchService');
          throw new Error('缺少API密钥配置，无法进行向量搜索');
        }

        if (!vectorUrl && !openaiBaseUrl) {
          Logger.error('缺少向量化API基础URL配置', 'FileVectorSearchService');
          throw new Error('缺少API基础URL配置，无法进行向量搜索');
        }

        const apiKey = vectorKey || openaiBaseKey;
        const baseURL = await correctApiBaseUrl(vectorUrl || openaiBaseUrl);
        const model = vectorModel || openaiBaseModel;

        // 确保apiKey、baseURL和model是字符串类型
        const apiKeyStr = typeof apiKey === 'string' ? apiKey : await apiKey;
        const baseURLStr = typeof baseURL === 'string' ? baseURL : await baseURL;
        const modelStr = typeof model === 'string' ? model : await model;

        Logger.log(`使用API - 模型: ${modelStr}`, 'FileVectorSearchService');

        // 2. 创建OpenAI实例
        let openai;
        try {
          openai = new OpenAI({
            apiKey: apiKeyStr,
            baseURL: baseURL,
          });
          Logger.log('OpenAI客户端实例创建成功', 'FileVectorSearchService');
        } catch (error) {
          Logger.error(
            `OpenAI客户端实例创建失败: ${handleError(error)}`,
            'FileVectorSearchService',
          );
          throw new Error(`无法创建OpenAI客户端: ${handleError(error)}`);
        }

        Logger.log(`向量搜索 API 已配置，模型: ${modelStr}`, 'FileVectorSearchService');

        // 3. 将用户查询转换为向量
        Logger.log(
          `正在将用户查询转换为向量，查询长度: ${userQuery.length}`,
          'FileVectorSearchService',
        );
        let queryEmbedding;
        try {
          const startTime = Date.now();
          Logger.log(`开始向量化查询: ${new Date().toISOString()}`, 'FileVectorSearchService');

          queryEmbedding = await openai.embeddings.create({
            model: modelStr,
            input: userQuery,
            encoding_format: 'float',
          });

          const endTime = Date.now();
          Logger.log(`查询向量化完成，耗时: ${endTime - startTime}ms`, 'FileVectorSearchService');
        } catch (error) {
          const errorDetail = handleError(error);
          Logger.error(`查询向量化失败: ${errorDetail}`, 'FileVectorSearchService');
          Logger.error(
            `查询向量化失败上下文: 模型=${modelStr}, 查询长度=${userQuery.length}`,
            'FileVectorSearchService',
          );

          // 特定错误类型的处理
          if (
            errorDetail.includes('timeout') ||
            errorDetail.includes('ETIMEDOUT') ||
            errorDetail.includes('timed out')
          ) {
            // 超时错误
            Logger.error(
              `超时错误检测: API响应超时，请考虑增加超时设置或检查网络连接`,
              'FileVectorSearchService',
            );

            // 尝试测试与API服务器的连接
            try {
              Logger.log('尝试诊断与向量 API 服务器的连接', 'FileVectorSearchService');
              const testStartTime = Date.now();
              await axios.get(baseURL, { timeout: 5000 });
              const testEndTime = Date.now();
              Logger.log(
                `API服务器连接测试成功，响应时间: ${testEndTime - testStartTime}ms`,
                'FileVectorSearchService',
              );
            } catch (connError) {
              Logger.error(
                `API服务器连接测试失败: ${handleError(
                  connError,
                )}，这可能表明网络连接问题或API服务不可用`,
                'FileVectorSearchService',
              );
            }

            throw new Error(`向量化API请求超时。请考虑增加超时设置或检查API服务状态。`);
          } else if (
            errorDetail.includes('401') ||
            errorDetail.includes('认证') ||
            errorDetail.includes('auth')
          ) {
            // 认证错误
            Logger.error(`认证错误检测: API密钥可能无效或不正确`, 'FileVectorSearchService');
            throw new Error(`向量化API认证失败，请检查API密钥配置是否正确。`);
          } else if (errorDetail.includes('404') || errorDetail.includes('找不到')) {
            // URL错误
            Logger.error(`URL错误检测: API地址可能不存在或不正确`, 'FileVectorSearchService');
            throw new Error(`向量化API地址不存在，请检查API基础URL配置是否正确。`);
          } else {
            throw new Error(`无法将用户查询转换为向量: ${errorDetail}`);
          }
        }

        // 4. 将每个文本块转换为向量 - 使用批处理以减少API调用次数
        Logger.log('正在处理文本块向量化', 'FileVectorSearchService');

        const batchSize = 20; // OpenAI API 允许每个请求最多20个输入
        const batches = [];

        // 将文本块分成批次
        for (let i = 0; i < textChunks.length; i += batchSize) {
          batches.push(textChunks.slice(i, i + batchSize));
        }

        Logger.log(`文本分批完成，共 ${batches.length} 批`, 'FileVectorSearchService');

        // 对每个批次进行向量化
        const chunkEmbeddings = [];
        try {
          // 并行处理所有批次
          Logger.log(`开始处理文本块向量化批次`, 'FileVectorSearchService');
          const startTime = Date.now();

          // 为每个批次创建一个Promise
          const batchPromises = batches.map(async (batch, batchIndex) => {
            Logger.log(`处理第 ${batchIndex + 1}/${batches.length} 批`, 'FileVectorSearchService');

            try {
              const batchEmbedding = await openai.embeddings.create({
                model: modelStr,
                input: batch,
                encoding_format: 'float',
              });

              // 添加防御性检查，确保API返回了预期的数据结构
              if (!batchEmbedding || !batchEmbedding.data) {
                Logger.error(`向量化API返回无效数据`, 'FileVectorSearchService');
                return [];
              }

              // 检查返回的数据长度是否与输入一致
              if (batchEmbedding.data.length !== batch.length) {
                Logger.warn(
                  `向量化API返回数据长度(${batchEmbedding.data.length})与请求数量(${batch.length})不匹配`,
                  'FileVectorSearchService',
                );
              }

              // 将结果与原始文本块匹配
              const batchResults = [];
              for (let i = 0; i < batch.length; i++) {
                // 添加防御性检查，确保当前索引的数据存在
                if (
                  i < batchEmbedding.data.length &&
                  batchEmbedding.data[i] &&
                  batchEmbedding.data[i].embedding
                ) {
                  batchResults.push({
                    chunk: batch[i],
                    embedding: batchEmbedding.data[i].embedding,
                  });
                } else {
                  Logger.warn(`跳过索引 ${i} 的向量化结果，数据无效`, 'FileVectorSearchService');
                  // 继续处理而不是失败，添加一个空向量以保持索引一致性
                  batchResults.push({
                    chunk: batch[i],
                    embedding: [], // 空向量会在相似度计算时得到0分
                  });
                }
              }

              return batchResults;
            } catch (error) {
              Logger.error(
                `批次 ${batchIndex + 1} 向量化失败: ${handleError(error)}`,
                'FileVectorSearchService',
              );
              // 返回空数组而不是抛出错误，这样其他批次仍然可以继续
              return batch.map(text => ({ chunk: text, embedding: [] }));
            }
          });

          // 等待所有批次完成并合并结果
          const batchResults = await Promise.all(batchPromises);
          const endTime = Date.now();
          Logger.log(`向量化处理完成，耗时: ${endTime - startTime}ms`, 'FileVectorSearchService');

          // 合并所有批次的结果
          for (const batchResult of batchResults) {
            chunkEmbeddings.push(...batchResult);
          }

          // 4.5. 异步保存向量缓存到数据库（不阻塞当前流程）
          if (options?.userId && fileObjects) {
            this.saveVectorCacheAsync(
              fileObjects,
              textChunks,
              chunkEmbeddings,
              model,
              chunkSourceMap,
              options.userId,
              cacheExpiresDays, // 传递有效期参数
            ).catch(error => {
              Logger.warn(
                `向量缓存保存失败（不影响当前查询）: ${error.message}`,
                'FileVectorSearchService',
              );
            });
          }
        } catch (error) {
          const errorDetail = handleError(error);
          Logger.error(`文本块向量化失败: ${errorDetail}`, 'FileVectorSearchService');

          // 特定错误类型的处理
          if (
            errorDetail.includes('timeout') ||
            errorDetail.includes('ETIMEDOUT') ||
            errorDetail.includes('timed out')
          ) {
            // 超时错误
            Logger.error(`文本块向量化超时错误: API响应超时`, 'FileVectorSearchService');
            throw new Error(`文本内容向量化API请求超时，请尝试减少文本长度或增加超时设置。`);
          } else if (
            errorDetail.includes('401') ||
            errorDetail.includes('认证') ||
            errorDetail.includes('auth')
          ) {
            // 认证错误
            Logger.error(`向量化认证错误: API密钥可能无效`, 'FileVectorSearchService');
            throw new Error(`向量化API认证失败，请检查API密钥配置是否正确。`);
          } else {
            throw new Error(`无法将文本内容转换为向量: ${errorDetail}`);
          }
        }

        // 5. 计算相似度并排序
        Logger.log('计算相似度并排序', 'FileVectorSearchService');

        // 防御性检查，确保查询向量存在
        if (
          !queryEmbedding ||
          !queryEmbedding.data ||
          !queryEmbedding.data[0] ||
          !queryEmbedding.data[0].embedding
        ) {
          Logger.error('无法获取有效的查询向量', 'FileVectorSearchService');
          throw new Error('查询向量无效或不完整');
        }

        const queryVector = queryEmbedding.data[0].embedding;

        // 过滤掉无效的向量嵌入，然后进行相似度计算
        const validChunkEmbeddings = chunkEmbeddings.filter(
          item =>
            item && item.embedding && Array.isArray(item.embedding) && item.embedding.length > 0,
        );

        if (validChunkEmbeddings.length === 0) {
          Logger.warn('没有有效的文本块向量用于相似度计算', 'FileVectorSearchService');
          throw new Error('未能生成有效的文本块向量');
        }

        const rankedChunks = validChunkEmbeddings
          .map(({ chunk, embedding }, index) => {
            try {
              const similarity = this.cosineSimilarity(queryVector, embedding);
              // 查找对应索引在原始文本块中的索引
              const originalIndex = chunkEmbeddings.findIndex(item => item.chunk === chunk);
              // 获取文件来源信息
              const sourceInfo = originalIndex >= 0 ? chunkSourceMap[originalIndex] : null;

              return {
                chunk,
                similarity,
                source: sourceInfo || { fileName: '未知文件', url: '' },
              };
            } catch (error) {
              Logger.warn(`计算相似度时出错: ${handleError(error)}`, 'FileVectorSearchService');
              return {
                chunk,
                similarity: 0,
                source: { fileName: '未知文件', url: '' },
              };
            }
          })
          .sort((a, b) => b.similarity - a.similarity);

        // 6. 获取前10个最相关的文本块
        const topResults = rankedChunks.slice(0, 10);

        Logger.log(`获取到${topResults.length}个相关文本块`, 'FileVectorSearchService');

        // 7. 准备返回结果 - 优化为更结构化的返回格式，加入文件来源信息
        const formattedResults = topResults.map((item, index) => {
          return {
            content: this.processChinese(item.chunk),
            similarity: item.similarity.toFixed(4),
            index: index + 1,
            fileName: item.source.fileName,
            fileUrl: item.source.url,
          };
        });

        // 合并的相关内容添加文件来源标记
        const relevantContentWithSource = topResults
          .map(item => `【文件：${item.source.fileName}】\n${item.chunk}`)
          .join('\n\n');

        const result = {
          relevantContent: this.processChinese(relevantContentWithSource),
          formattedResults: formattedResults,
          similarities: topResults.map(item => item.similarity),
        };

        return result;
      } catch (error) {
        // 向量搜索失败，返回完整文本
        const errorDetail = handleError(error);
        Logger.error(`向量搜索失败: ${errorDetail}`, 'FileVectorSearchService');

        // 分析错误类型并给出建议
        let errorMessage = '向量搜索处理失败';
        let suggestion = '';

        if (errorDetail.includes('timeout') || errorDetail.includes('timed out')) {
          errorMessage = `API响应超时`;
          suggestion = '建议增加超时设置或检查网络连接';
        } else if (errorDetail.includes('无法创建OpenAI客户端')) {
          errorMessage = `无法初始化AI服务`;
          suggestion = '请检查API配置是否正确';
        } else if (errorDetail.includes('认证失败') || errorDetail.includes('401')) {
          errorMessage = `API认证失败`;
          suggestion = '请检查API密钥是否有效';
        } else if (errorDetail.includes('不存在') || errorDetail.includes('404')) {
          errorMessage = `API地址不存在`;
          suggestion = '请检查API URL配置';
        }

        // 创建一个包含完整文本的结果
        const result = {
          relevantContent: mergedFileContent, // 返回完整的文件内容
          formattedResults: [
            {
              content: mergedFileContent,
              similarity: '1.0000', // 设置一个默认的相似度
              index: 1,
              fileName: fileObjects.length === 1 ? fileObjects[0].name : '合并多个文件',
              fileUrl: fileObjects.length === 1 ? fileObjects[0].url : '',
            },
          ],
          similarities: [1.0],
          isFullText: true, // 添加标记表示这是完整文本
          errorInfo: {
            message: errorMessage,
            suggestion: suggestion,
            detail: errorDetail,
          },
        };

        return result;
      }
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`文件向量搜索失败: ${errorMessage}`, 'FileVectorSearchService');

      // 分析错误并提供诊断信息
      let errorType = '未知错误';
      let suggestion = '请稍后重试';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = '超时错误';
        suggestion = '建议增加超时设置或检查API服务器状态';
      } else if (errorMessage.includes('认证失败') || errorMessage.includes('401')) {
        errorType = '认证错误';
        suggestion = '请检查API密钥配置';
      } else if (errorMessage.includes('无效的文件URL')) {
        errorType = '文件链接错误';
        suggestion = '请检查文件URL是否有效';
      } else if (errorMessage.includes('无法从所有文件中提取文本内容')) {
        errorType = '文件内容提取失败';
        suggestion = '请检查文件格式是否受支持';
      }

      Logger.error(`错误类型: ${errorType}, 建议: ${suggestion}`, 'FileVectorSearchService');

      return {
        relevantContent: '',
        formattedResults: [],
        similarities: [],
        errorInfo: {
          type: errorType,
          message: errorMessage,
          suggestion: suggestion,
        },
      };
    }
  }

  /**
   * 多媒体描述服务 - 使用OpenAI分析图片和视频内容
   * @param imageUrl 图片URL，多个URL用逗号分隔
   * @param videoUrl 视频URL，多个URL用逗号分隔
   * @returns 多媒体描述结果
   */
  async imageDescription(imageUrl: string, videoUrl: string) {
    const {
      imageAnalysisUrl,
      imageAnalysisKey,
      imageAnalysisModel,
      openaiBaseUrl,
      openaiBaseKey,
      openaiBaseModel,
      maxImageCount,
    } = await this.globalConfigService.getConfigs([
      'imageAnalysisUrl',
      'imageAnalysisKey',
      'imageAnalysisModel',
      'openaiBaseUrl',
      'openaiBaseKey',
      'openaiBaseModel',
      'maxImageCount',
    ]);

    const maxMediaLimit = maxImageCount ? parseInt(maxImageCount, 10) : 5;

    try {
      const descriptions: string[] = [];
      let hasErrors = false;
      let totalMediaCount = 0;
      let limitExceeded = false;

      // 处理图片URL
      const imageUrls = imageUrl
        ? imageUrl
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0)
        : [];

      // 处理视频URL
      const videoUrls = videoUrl
        ? videoUrl
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0)
        : [];

      totalMediaCount = imageUrls.length + videoUrls.length;

      if (totalMediaCount === 0) {
        throw new Error('无效的图片或视频URL');
      }

      Logger.log(
        `开始处理多媒体描述，图片数量: ${imageUrls.length}，视频数量: ${videoUrls.length}`,
        'FileVectorSearchService',
      );

      // 合并所有媒体URL并标记类型
      const allMediaUrls = [
        ...imageUrls.map(url => ({ url, type: 'image' })),
        ...videoUrls.map(url => ({ url, type: 'video' })),
      ];

      // 检查是否超过限制
      let processMediaUrls = [...allMediaUrls];
      if (allMediaUrls.length > maxMediaLimit) {
        Logger.warn(
          `媒体URL数量(${allMediaUrls.length})超过限制(${maxMediaLimit})，只处理前${maxMediaLimit}个`,
          'FileVectorSearchService',
        );
        processMediaUrls = allMediaUrls.slice(0, maxMediaLimit);
        limitExceeded = true;
      }

      const openai = new OpenAI({
        apiKey: imageAnalysisKey || openaiBaseKey,
        baseURL: await correctApiBaseUrl(imageAnalysisUrl || openaiBaseUrl),
      });

      // 并行处理所有媒体文件
      const mediaPromises = processMediaUrls.map(async media => {
        try {
          const { url, type } = media;
          Logger.log(`开始分析${type === 'image' ? '图片' : '视频'}`, 'FileVectorSearchService');

          const isImage = type === 'image';
          const systemPrompt = isImage
            ? '你是一个专业的图片描述助手，请详细、准确地描述图片中的内容，包括场景、人物、物体、颜色、布局等重要细节。尽量提供全面的描述，帮助用户理解图片内容。'
            : '你是一个专业的视频描述助手，请详细、准确地描述视频中的内容，包括场景、人物、动作、情节、颜色、布局等重要细节。尽量提供全面的描述，帮助用户理解视频内容。';

          const userPrompt = isImage ? '详细描述下图片中的内容：' : '详细描述下视频中的内容：';

          const contentItem = isImage
            ? {
                type: 'image_url' as const,
                image_url: {
                  url: url,
                },
              }
            : {
                type: 'video_url' as any, // 使用 any 绕过 TypeScript 类型检查
                video_url: {
                  url: url,
                },
              };

          const response = await openai.chat.completions.create({
            model: imageAnalysisModel || openaiBaseModel,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userPrompt },
                  contentItem as any, // 使用 any 绕过 TypeScript 类型检查
                ],
              },
            ],
          });

          const description =
            response.choices[0]?.message?.content || `无法生成${isImage ? '图片' : '视频'}描述`;
          return {
            success: true,
            description: `${isImage ? '图片' : '视频'} [${url}]:\n${description}`,
            type,
            url,
            tokenUsage: response.usage, // 添加 token 使用信息
          };
        } catch (error) {
          Logger.error(
            `${media.type === 'image' ? '图片' : '视频'}分析失败: ${handleError(error)}`,
            'FileVectorSearchService',
          );
          return {
            success: false,
            description: `${media.type === 'image' ? '图片' : '视频'} [${media.url}]: 无法分析此${
              media.type === 'image' ? '图片' : '视频'
            }内容。可能是格式不支持、文件过大或者暂时无法访问。`,
            type: media.type,
            url: media.url,
          };
        }
      });

      // 等待所有媒体处理完成
      const results = await Promise.all(mediaPromises);

      // 收集描述结果和 token 使用信息
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalTokens = 0;

      results.forEach(result => {
        descriptions.push(result.description);
        if (!result.success) {
          hasErrors = true;
        }
        // 累加 token 使用量
        if (result.tokenUsage) {
          totalPromptTokens += result.tokenUsage.prompt_tokens || 0;
          totalCompletionTokens += result.tokenUsage.completion_tokens || 0;
          totalTokens += result.tokenUsage.total_tokens || 0;
        }
      });

      // 汇总的 token 使用信息
      const aggregatedTokenUsage = {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens,
      };

      if (limitExceeded) {
        descriptions.push(
          `\n[注意: 仅显示了前${maxMediaLimit}个媒体文件的描述，共有${totalMediaCount}个媒体文件]`,
        );
      }

      const combinedDescription = descriptions.join('\n\n');

      return {
        relevantContent: combinedDescription,
        formattedResults: [
          {
            content: combinedDescription,
            similarity: '1.0000',
            index: 1,
          },
        ],
        similarities: [1.0],
        hasPartialErrors: hasErrors,
        limitExceeded: limitExceeded,
        mediaStats: {
          totalCount: totalMediaCount,
          processedCount: processMediaUrls.length,
          imageCount: imageUrls.length,
          videoCount: videoUrls.length,
        },
        tokenUsage: aggregatedTokenUsage, // 添加汇总的 token 使用信息
      };
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`多媒体描述失败: ${errorMessage}`, 'FileVectorSearchService');

      return {
        relevantContent: '多媒体处理过程中出现错误，请检查URL是否有效，或稍后再试。',
        formattedResults: [],
        similarities: [],
        errMsg: errorMessage,
      };
    }
  }

  /**
   * 处理图片描述流程
   * @param imageUrl 图片URL
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 图片描述结果
   */
  async processImageDescription(
    imageUrl: string,
    videoUrl: string,
    inputs: {
      isImageUpload?: any;
      usingDeepThinking?: boolean;
      onProgress?: (data: any) => void;
      onDatabase?: (data: any) => void;
    },
    result: any,
  ): Promise<any> {
    const { isImageUpload, usingDeepThinking, onProgress, onDatabase } = inputs;
    let imageDescriptionResult = null;

    // 如果没有图片URL或不符合处理条件，直接返回null
    if (!imageUrl || !(isImageUpload === 3 || usingDeepThinking)) {
      return imageDescriptionResult;
    }

    try {
      Logger.log('[图片描述] 开始分析图片', 'FileVectorSearchService');

      // 显示分析中状态
      onProgress?.({
        imageDescription: '图片分析中...\n',
      });

      // 调用图片描述服务
      imageDescriptionResult = await this.imageDescription(imageUrl, videoUrl);

      Logger.log(`[图片描述] 完成`, 'FileVectorSearchService');

      // 更新结果对象
      if (imageDescriptionResult) {
        result.imageDescription = JSON.stringify(imageDescriptionResult, null, 2);
        // 注意：这里的注释是从原代码保留的
        // onProgress?.({
        //   imageDescription: result.imageDescription,
        // });

        // 存储数据到数据库
        // onDatabase?.({
        //   imageDescription: result.imageDescription
        // });

        // 添加即时数据库存储，但保持原有的注释逻辑
        onDatabase?.({
          image_description_result: {
            description: imageDescriptionResult,
            image_url: imageUrl,
            timestamp: new Date(),
          },
        });
      }

      return imageDescriptionResult;
    } catch (error) {
      Logger.error(`[图片描述] 失败: ${handleError(error)}`, 'FileVectorSearchService');

      // 即时存储错误信息
      onDatabase?.({
        image_description_error: {
          error: handleError(error),
          image_url: imageUrl,
          timestamp: new Date(),
        },
      });

      return null;
    }
  }

  private async extractTextFromUrl(fileUrl: string): Promise<string> {
    try {
      // 检查文件类型
      const fileExtension = this.getFileExtension(fileUrl);
      Logger.log(`文件类型: ${fileExtension}`, 'FileVectorSearchService');

      if (fileExtension === 'pdf') {
        // 处理PDF文件
        return await this.extractPdfText(fileUrl);
      } else if (['docx', 'doc'].includes(fileExtension)) {
        // 处理Word文档
        return await this.extractWordText(fileUrl);
      } else if (fileExtension === 'xlsx') {
        // 处理Excel表格
        return await this.extractExcelText(fileUrl);
      } else if (['pptx', 'ppt'].includes(fileExtension)) {
        // 处理PowerPoint演示文稿
        return await this.extractPowerPointText(fileUrl);
      } else if (fileExtension === 'txt') {
        // 专门处理TXT文件，使用智能结构化转换
        return await this.extractTxtText(fileUrl);
      } else if (
        [
          'md',
          // 'json',
          // 'csv',
          // 'html',
          // 'xml',
          // 'js',
          // 'ts',
          // 'css',
          // 'yaml',
          // 'yml',
          // 'log',
          // 'ini',
          // 'conf',
          // 'sh',
          // 'bat',
          // 'ps1',
          // 'py',
          // 'java',
          // 'c',
          // 'cpp',
          // 'h',
          // 'cs',
          // 'go',
          // 'rs',
          // 'php',
          // 'rb',
          // 'pl',
          // 'sql',
        ].includes(fileExtension)
      ) {
        // 处理文本文件，尝试使用二进制方式获取并转换编码
        try {
          const buffer = await this.downloadRemoteBuffer(fileUrl);

          // 尝试检测编码并转换
          let content = '';
          try {
            // 尝试UTF-8
            content = iconv.decode(buffer, 'utf-8');
          } catch (err) {
            // 如果UTF-8失败，尝试GBK/GB18030
            content = iconv.decode(buffer, 'gb18030');
          }

          // 如果内容仍然包含大量乱码，可能是其他编码
          if (this.containsJunk(content)) {
            content = iconv.decode(buffer, 'gbk');
          }

          // 清理非法字符
          content = this.cleanText(content);

          return content;
        } catch (err) {
          // 如果二进制方式失败，回退到text方式
          const textBuffer = await this.downloadRemoteBuffer(fileUrl);
          return this.cleanText(textBuffer.toString('utf-8'));
        }
      } else {
        // 对于其他未知文件类型，尝试以文本方式读取
        Logger.log(`未知文件类型: ${fileExtension}，尝试通用方法提取`, 'FileVectorSearchService');
        try {
          const buffer = await this.downloadRemoteBuffer(fileUrl);

          // 尝试不同的编码方式
          let content = '';
          try {
            content = iconv.decode(buffer, 'utf-8');
          } catch (err) {
            try {
              content = iconv.decode(buffer, 'gb18030');
            } catch (err2) {
              try {
                content = iconv.decode(buffer, 'gbk');
              } catch (err3) {
                // 最后尝试用latin1编码
                content = iconv.decode(buffer, 'latin1');
              }
            }
          }

          // 如果内容很短或看起来不像文本，可能不是文本文件
          if (content.length < 50 || this.containsHighJunk(content)) {
            throw new Error(`不支持的文件类型: ${fileExtension}`);
          }

          return this.cleanText(content);
        } catch (err) {
          throw new Error(`不支持的文件类型: ${fileExtension}`);
        }
      }
    } catch (error) {
      Logger.error(`提取文本失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw error;
    }
  }

  // 检测文本中是否包含大量乱码字符
  private containsJunk(text: string): boolean {
    // 如果文本中包含大量替换字符或其他明显的乱码字符
    const junkCharRatio = (text.match(/[\ufffd\uffef\ufffe]/g) || []).length / text.length;
    return junkCharRatio > 0.1; // 如果乱码字符超过10%，认为是乱码
  }

  // 检测文本中是否包含极高比例的乱码（用于未知文件类型）
  private containsHighJunk(text: string): boolean {
    // 计算可读字符的比例
    const readableCharCount = text.match(/[\x20-\x7E\u4e00-\u9fa5]/g)?.length || 0;
    const readableRatio = readableCharCount / text.length;

    // 如果可读字符比例低于30%，认为不是文本文件
    return readableRatio < 0.3;
  }

  /**
   * 从PDF文件中提取文本（与前端预览保持一致的处理方式）
   * @param fileUrl PDF文件的URL
   * @returns 提取的Markdown格式文本内容
   */
  private async extractPdfText(fileUrl: string): Promise<string> {
    try {
      const pdfBuffer = await this.downloadRemoteBuffer(fileUrl);

      // 使用 pdf2md 库转换为 Markdown（与前端预览一致）
      const markdownContent = await pdf2md(pdfBuffer);
      return this.cleanText(markdownContent);
    } catch (error) {
      Logger.error(`PDF解析失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw new Error('PDF解析失败');
    }
  }

  private getFileExtension(url: string): string {
    // 处理可能的URL参数
    const urlWithoutParams = url.split('?')[0];
    const fileName = urlWithoutParams.split('/').pop() || '';
    const parts = fileName.split('.');
    if (parts.length > 1) {
      return parts.pop()?.toLowerCase() || '';
    }
    return '';
  }

  /**
   * 基于Token的智能切片（推荐使用）
   * @param text 文本内容
   * @param maxTokens 最大token数（默认512）
   * @param overlapTokens 重叠token数（默认50，约为10%）
   * @returns 切片数组
   */
  private async chunkTextByTokens(
    text: string,
    maxTokens: number = 512,
    overlapTokens: number = 50,
  ): Promise<string[]> {
    const chunks: string[] = [];

    Logger.log(
      `[基于Token切片] 目标: ${maxTokens} tokens/chunk, 重叠: ${overlapTokens} tokens, 原文长度: ${text.length}字符`,
      'FileVectorSearchService',
    );

    // 预处理文本，优先按段落分割，如果段落太大则按句子分割
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);

    Logger.log(`[基于Token切片] 文本分成 ${paragraphs.length} 个段落`, 'FileVectorSearchService');

    let currentChunk = '';
    let currentTokens = 0;

    for (let paraIndex = 0; paraIndex < paragraphs.length; paraIndex++) {
      const paragraph = paragraphs[paraIndex];
      const paragraphTokens = await getTokenCount(paragraph);

      Logger.debug(
        `段落 ${paraIndex + 1}: ${paragraph.length}字符, ${paragraphTokens} tokens`,
        'FileVectorSearchService',
      );

      // 情况1: 单个段落就超过maxTokens，需要进一步分割
      if (paragraphTokens > maxTokens) {
        // 先保存当前chunk（如果有内容）
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          Logger.log(
            `[基于Token切片] 保存当前chunk: ${currentTokens} tokens`,
            'FileVectorSearchService',
          );
        }

        // 将大段落按句子分割
        const sentences = paragraph.split(/(?<=[。？！.!?])\s*/);
        let tempChunk = '';
        let tempTokens = 0;

        for (const sentence of sentences) {
          const sentenceTokens = await getTokenCount(sentence);
          const combinedTokens = tempTokens + sentenceTokens;

          if (combinedTokens > maxTokens && tempChunk.length > 0) {
            // 保存当前chunk
            chunks.push(tempChunk.trim());
            Logger.log(
              `[基于Token切片] 保存句子chunk: ${tempTokens} tokens`,
              'FileVectorSearchService',
            );

            // 计算重叠部分
            if (overlapTokens > 0 && tempTokens > overlapTokens * 2) {
              const overlapRatio = overlapTokens / tempTokens;
              const overlapCharCount = Math.floor(tempChunk.length * overlapRatio);
              tempChunk = tempChunk.slice(-overlapCharCount).trim();
              tempTokens = await getTokenCount(tempChunk);
            } else {
              tempChunk = '';
              tempTokens = 0;
            }
          }

          tempChunk += (tempChunk.length > 0 ? ' ' : '') + sentence;
          tempTokens = await getTokenCount(tempChunk);
        }

        // 保存最后一个句子chunk
        if (tempChunk.length > 0) {
          currentChunk = tempChunk;
          currentTokens = tempTokens;
        } else {
          currentChunk = '';
          currentTokens = 0;
        }

        continue;
      }

      // 情况2: 当前chunk为空，直接添加段落
      if (currentChunk.length === 0) {
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
        continue;
      }

      // 情况3: 计算添加这个段落后的总token数
      const combinedText = currentChunk + '\n\n' + paragraph;
      const combinedTokens = await getTokenCount(combinedText);

      // 如果添加段落后超过maxTokens，先保存当前chunk
      if (combinedTokens > maxTokens) {
        chunks.push(currentChunk.trim());
        Logger.log(
          `[基于Token切片] 保存段落chunk: ${currentTokens} tokens`,
          'FileVectorSearchService',
        );

        // 计算重叠部分
        if (overlapTokens > 0 && currentTokens > overlapTokens * 2) {
          const overlapRatio = overlapTokens / currentTokens;
          const overlapCharCount = Math.floor(currentChunk.length * overlapRatio);
          currentChunk = currentChunk.slice(-overlapCharCount).trim() + '\n\n' + paragraph;
          currentTokens = await getTokenCount(currentChunk);
        } else {
          currentChunk = paragraph;
          currentTokens = paragraphTokens;
        }
      } else {
        // 合并到当前chunk
        currentChunk = combinedText;
        currentTokens = combinedTokens;
      }
    }

    // 添加最后一个chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      Logger.log(
        `[基于Token切片] 保存最后chunk: ${currentTokens} tokens`,
        'FileVectorSearchService',
      );
    }

    // 如果没有生成任何chunks（极少数情况），回退到固定字符切片
    if (chunks.length === 0) {
      Logger.warn(`[基于Token切片] 未生成chunks，回退到字符切片方法`, 'FileVectorSearchService');
      return this.chunkText(text, Math.floor(maxTokens * 0.5));
    }

    // 记录实际切片统计
    const chunkTokenCounts = await Promise.all(chunks.map(c => getTokenCount(c)));
    const avgTokens = Math.round(chunkTokenCounts.reduce((a, b) => a + b, 0) / chunks.length);
    const maxChunkTokens = Math.max(...chunkTokenCounts);
    const minChunkTokens = Math.min(...chunkTokenCounts);

    Logger.log(
      `[基于Token切片] 生成${chunks.length}个chunks, 平均: ${avgTokens} tokens, 范围: ${minChunkTokens}-${maxChunkTokens} tokens`,
      'FileVectorSearchService',
    );

    return chunks;
  }

  /**
   * 按字符切片（保留用于兼容性）
   * @deprecated 推荐使用 chunkTextByTokens
   */
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    // 预处理文本，分段
    const paragraphs = text.split(/\n{2,}/);

    let currentChunk = '';
    for (const paragraph of paragraphs) {
      // 如果当前段落加上已有内容超过了chunkSize的1.5倍，就开始新的chunk
      if (currentChunk.length + paragraph.length > chunkSize * 1.5 && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // 如果单个段落超过了chunkSize，需要按句子分割
      if (paragraph.length > chunkSize) {
        // 使用较宽松的句子分隔规则，包含中文句号、问号和感叹号
        const sentences = paragraph.split(/(?<=[。？！.!?])\s*/);

        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }

          // 如果单个句子还是太长，就按固定大小分割
          if (sentence.length > chunkSize) {
            let sentenceStart = 0;
            while (sentenceStart < sentence.length) {
              const sentenceEnd = Math.min(sentenceStart + chunkSize, sentence.length);
              chunks.push(sentence.substring(sentenceStart, sentenceEnd).trim());
              sentenceStart = sentenceEnd;
            }
          } else {
            currentChunk += sentence + ' ';
          }
        }
      } else {
        currentChunk += paragraph + '\n\n';
      }
    }

    // 添加最后一个chunk（如果有）
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    // 如果没有生成任何chunks（可能因为文本内容特殊），回退到简单的分割方法
    if (chunks.length === 0) {
      while (startIndex < text.length) {
        const endIndex = Math.min(startIndex + chunkSize, text.length);
        chunks.push(text.substring(startIndex, endIndex).trim());
        startIndex = endIndex;
      }
    }

    return chunks;
  }

  /**
   * 异步保存向量缓存到数据库
   */
  private async saveVectorCacheAsync(
    fileObjects: FileObject[],
    textChunks: string[],
    chunkEmbeddings: Array<{ chunk: string; embedding: number[] }>,
    model: string,
    chunkSourceMap: Record<number, { fileName: string; url: string }>,
    userId: number,
    cacheExpiresDays: number, // 添加有效期参数
  ): Promise<void> {
    try {
      const modelInfo = typeof model === 'string' ? model : await model;

      // 按文件分组chunks和vectors
      const fileGroupMap = new Map<
        string,
        { chunks: string[]; vectors: number[][]; fileName: string }
      >();

      // 遍历所有chunks，按文件URL分组
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const embeddingData = chunkEmbeddings.find(e => e.chunk === chunk);

        if (!embeddingData || !embeddingData.embedding) {
          continue;
        }

        // 使用chunkSourceMap来确定文件
        if (chunkSourceMap && chunkSourceMap[i]) {
          const fileUrl = chunkSourceMap[i].url;
          const fileName = chunkSourceMap[i].fileName;

          if (!fileGroupMap.has(fileUrl)) {
            fileGroupMap.set(fileUrl, {
              chunks: [],
              vectors: [],
              fileName: fileName,
            });
          }

          const group = fileGroupMap.get(fileUrl)!;
          group.chunks.push(chunk);
          group.vectors.push(embeddingData.embedding);
        }
      }

      // 为每个文件保存缓存
      for (const [fileUrl, group] of fileGroupMap.entries()) {
        await this.fileVectorCacheService.saveVectors(
          fileUrl,
          group.chunks,
          group.vectors,
          modelInfo,
          {
            fileType: 'user',
            userId: userId,
            originalFileName: group.fileName,
            expiresInDays: cacheExpiresDays, // 使用配置的有效期
          },
        );
        Logger.log(
          `已保存文件向量缓存: ${group.chunks.length}个chunks, 有效期: ${cacheExpiresDays}天`,
          'FileVectorSearchService',
        );
      }
    } catch (error) {
      Logger.error(`保存向量缓存失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw error;
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    // 验证输入的向量
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      Logger.error(`余弦相似度计算失败: 输入不是有效的向量`, 'FileVectorSearchService');
      return 0;
    }

    if (vecA.length === 0 || vecB.length === 0) {
      Logger.error(`余弦相似度计算失败: 向量长度为零`, 'FileVectorSearchService');
      return 0;
    }

    // 如果向量长度不一致，使用较短的长度
    const minLength = Math.min(vecA.length, vecB.length);
    if (vecA.length !== vecB.length) {
      Logger.log(
        `向量长度不一致: ${vecA.length}vs${vecB.length}，使用${minLength}`,
        'FileVectorSearchService',
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    try {
      for (let i = 0; i < minLength; i++) {
        // 确保向量元素是数字
        const a = typeof vecA[i] === 'number' ? vecA[i] : 0;
        const b = typeof vecB[i] === 'number' ? vecB[i] : 0;

        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
      }

      // 避免除以零
      if (normA === 0 || normB === 0) {
        return 0;
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    } catch (error) {
      Logger.error(`余弦相似度计算异常: ${handleError(error)}`, 'FileVectorSearchService');
      return 0;
    }
  }

  // 处理中文文本的特殊方法
  private processChinese(text: string): string {
    if (!text) return '';

    // 移除BOM标记
    text = text.replace(/^\ufeff/, '');

    // 处理中文常见乱码
    text = text
      .replace(/\uFFFD/g, '') // 替换字符
      .replace(/[\u0000-\u0019\u001b]/g, '') // 移除控制字符
      .replace(/[\ud800-\udfff]/g, ''); // 移除代理对字符

    // 统一换行符
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 移除多余空格
    text = text.replace(/[ \t]+/g, ' ');

    // 移除多余换行
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /**
   * 从Word文档中提取文本（与前端预览保持一致的处理方式）
   * @param fileUrl Word文档的URL
   * @returns 提取的文本内容（Markdown格式）
   */
  private async extractWordText(fileUrl: string): Promise<string> {
    try {
      const buffer = await this.downloadRemoteBuffer(fileUrl);

      // 使用mammoth库转换为HTML（保留格式和结构，与前端预览一致）
      const result = await mammoth.convertToHtml({ buffer });

      // 使用Turndown将HTML转换为Markdown
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });

      const markdownContent = turndownService.turndown(result.value);
      return this.cleanText(markdownContent);
    } catch (error) {
      Logger.error(`Word文档解析失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw new Error('Word文档解析失败');
    }
  }

  /**
   * 从Excel表格中提取文本
   * @param fileUrl Excel文件的URL
   * @returns 提取的文本内容
   */
  private async extractExcelText(fileUrl: string): Promise<string> {
    try {
      const buffer = await this.downloadRemoteBuffer(fileUrl);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

      let markdownContent = '';

      // 遍历所有工作表
      workbook.eachSheet(worksheet => {
        const jsonData: unknown[][] = [];
        worksheet.eachRow({ includeEmpty: false }, row => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          jsonData.push(values);
        });

        // 如果有多个工作表，添加工作表标题
        if (workbook.worksheets.length > 1) {
          markdownContent += `## ${worksheet.name}\n\n`;
        }

        // 过滤空行
        const filteredData = jsonData.filter((row: any) =>
          row.some((cell: any) => cell !== undefined && cell !== ''),
        );

        if (filteredData.length > 0) {
          // 确保所有行都有相同的列数
          const maxCols = Math.max(...filteredData.map((row: any) => row.length));
          const normalizedData = filteredData.map((row: any) => {
            const normalizedRow = [...row];
            while (normalizedRow.length < maxCols) {
              normalizedRow.push('');
            }
            return normalizedRow.map(cell =>
              cell === undefined || cell === null ? '' : String(cell),
            );
          });

          // 转换为Markdown表格
          const table = this.createMarkdownTable(normalizedData);
          markdownContent += table + '\n\n';
        }
      });

      return this.cleanText(markdownContent);
    } catch (error) {
      Logger.error(`Excel文件解析失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw new Error('Excel文件解析失败');
    }
  }

  /**
   * 从PowerPoint演示文稿提取文本
   * @param fileUrl PowerPoint文件的URL
   * @returns 提取的文本内容
   */
  private async extractPowerPointText(fileUrl: string): Promise<string> {
    try {
      const arrayBuffer = await this.downloadRemoteBuffer(fileUrl);

      // 动态导入pptxtojson以解决ES Module兼容性问题
      const pptxtojsonModule: any = await import('pptxtojson');
      const parse =
        pptxtojsonModule.parse || pptxtojsonModule.default?.parse || pptxtojsonModule.default;

      // 使用pptxtojson库解析PPTX
      const pptxJson = await parse(arrayBuffer);

      // 转换为Markdown格式
      const markdownContent = this.convertPptxJsonToMarkdown(pptxJson);

      return this.cleanText(markdownContent);
    } catch (error) {
      Logger.error(`PowerPoint文件解析失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw new Error('PowerPoint文件解析失败');
    }
  }

  /**
   * 将PPTX JSON转换为Markdown格式
   * @param pptxJson 解析后的PPTX JSON数据
   * @returns Markdown格式的文本
   */
  private convertPptxJsonToMarkdown(pptxJson: any): string {
    let markdown = `# 演示文稿\n\n`;

    if (!pptxJson.slides || pptxJson.slides.length === 0) {
      return '# 演示文稿\n\n> 未能提取到幻灯片内容\n';
    }

    markdown += `> 总共 ${pptxJson.slides.length} 张幻灯片\n\n`;

    pptxJson.slides.forEach((slide: any, index: number) => {
      markdown += `## 幻灯片 ${index + 1}\n\n`;

      if (slide.elements && slide.elements.length > 0) {
        slide.elements.forEach((element: any) => {
          switch (element.type) {
            case 'text':
              if (element.content) {
                const textContent = this.cleanHtmlContent(element.content);
                if (textContent) {
                  // 根据字体大小或位置判断是否为标题
                  if (element.fontSize && element.fontSize > 18) {
                    markdown += `### ${textContent}\n\n`;
                  } else {
                    markdown += `${textContent}\n\n`;
                  }
                }
              }
              break;

            case 'shape':
              if (element.content) {
                const textContent = this.cleanHtmlContent(element.content);
                if (textContent) {
                  // 形状中的文本作为段落或引用
                  if (element.shapType === 'rect' || element.shapType === 'roundRect') {
                    markdown += `> ${textContent}\n\n`;
                  } else {
                    markdown += `${textContent}\n\n`;
                  }
                }
              }
              break;

            case 'table':
              if (element.data && element.data.length > 0) {
                markdown += this.convertTableToMarkdown(element.data);
              }
              break;

            case 'image':
              // 只记录图片存在，不包含base64数据
              markdown += `📷 **图片**\n\n`;
              break;

            case 'chart':
              markdown += `📊 **图表**: ${element.chartType || '未知类型'}\n\n`;
              if (element.data) {
                markdown += '```\n';
                markdown += JSON.stringify(element.data, null, 2);
                markdown += '\n```\n\n';
              }
              break;

            default:
              // 其他类型元素的通用处理
              if (element.content) {
                const textContent = this.cleanHtmlContent(element.content);
                if (textContent) {
                  markdown += `${textContent}\n\n`;
                }
              }
          }
        });
      } else {
        markdown += '> 此幻灯片无内容\n\n';
      }

      // 添加幻灯片分隔符
      if (index < pptxJson.slides.length - 1) {
        markdown += '---\n\n';
      }
    });

    return markdown;
  }

  /**
   * 表格转换为Markdown格式
   * @param tableData 表格数据
   * @returns Markdown表格
   */
  private convertTableToMarkdown(tableData: any[][]): string {
    if (!tableData || tableData.length === 0) return '';

    let markdown = '';
    tableData.forEach((row, rowIndex) => {
      markdown += '| ' + row.map(cell => String(cell || '')).join(' | ') + ' |\n';
      if (rowIndex === 0) {
        // 添加表头分隔符
        markdown += '| ' + row.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return markdown + '\n';
  }

  /**
   * 清理HTML标签，提取纯文本
   * @param htmlContent HTML内容
   * @returns 纯文本内容
   */
  private cleanHtmlContent(htmlContent: string): string {
    if (!htmlContent) return '';

    // 移除img标签（包括可能的base64图片）
    htmlContent = htmlContent.replace(/<img[^>]*>/gi, '[图片]');

    // 移除base64图片数据
    htmlContent = htmlContent.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[图片已移除]');

    // 移除HTML标签，保留文本内容
    let textContent = htmlContent.replace(/<[^>]*>/g, '');

    // 解码HTML实体（简单版本，避免使用DOM）
    textContent = textContent
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // 清理多余的空白字符
    return textContent.trim().replace(/\s+/g, ' ');
  }

  /**
   * 清理文本中的非法字符
   * @param text 需要清理的文本
   * @returns 清理后的文本
   */
  private cleanText(text: string): string {
    // 移除base64图片数据（通常以data:image开头）
    text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[图片已移除]');

    // 移除其他可能的base64数据
    text = text.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, '[二进制数据已移除]');

    // 移除常见的非法字符，并替换异常空格和控制字符
    return text
      .replace(/[\ufffd\uffef\ufffe]/g, '') // 移除替换字符和其他常见乱码
      .replace(/\r\n/g, '\n') // 统一换行符
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // 移除控制字符
      .trim();
  }

  /**
   * 智能处理TXT文件，转换为结构化Markdown格式
   * @param fileUrl TXT文件的URL
   * @returns 结构化的Markdown文本内容
   */
  private async extractTxtText(fileUrl: string): Promise<string> {
    try {
      const buffer = await this.downloadRemoteBuffer(fileUrl);

      // 使用jschardet检测编码
      let encoding = 'utf-8';
      let confidence = 0;

      try {
        const detectionResult = jschardet.detect(buffer);
        Logger.log(
          `TXT编码检测结果: ${JSON.stringify(detectionResult)}`,
          'FileVectorSearchService',
        );

        if (detectionResult && typeof detectionResult === 'object') {
          encoding = detectionResult.encoding || 'utf-8';
          confidence = detectionResult.confidence || 0;
        }
      } catch (detectError) {
        Logger.warn(
          `编码检测失败，使用默认UTF-8: ${handleError(detectError)}`,
          'FileVectorSearchService',
        );
      }

      Logger.log(`TXT文件编码: ${encoding}, 置信度: ${confidence}`, 'FileVectorSearchService');

      let textContent = '';

      try {
        // 根据检测到的编码进行解码
        if (encoding.toUpperCase().includes('UTF-8')) {
          textContent = iconv.decode(buffer, 'utf-8');
        } else if (
          encoding.toUpperCase().includes('GBK') ||
          encoding.toUpperCase().includes('GB')
        ) {
          textContent = iconv.decode(buffer, 'gbk');
        } else if (
          encoding.toUpperCase().includes('SHIFT_JIS') ||
          encoding.toUpperCase().includes('SJIS')
        ) {
          textContent = iconv.decode(buffer, 'shift_jis');
        } else if (encoding.toUpperCase().includes('BIG5')) {
          textContent = iconv.decode(buffer, 'big5');
        } else if (encoding.toUpperCase().includes('ISO-8859')) {
          textContent = iconv.decode(buffer, 'iso-8859-1');
        } else if (encoding.toUpperCase().includes('WINDOWS-1252')) {
          textContent = iconv.decode(buffer, 'windows-1252');
        } else {
          // 默认尝试UTF-8
          textContent = iconv.decode(buffer, 'utf-8');
        }
      } catch (error) {
        Logger.warn(
          `使用${encoding}解码失败，尝试UTF-8: ${handleError(error)}`,
          'FileVectorSearchService',
        );
        try {
          textContent = iconv.decode(buffer, 'utf-8');
        } catch (utf8Error) {
          Logger.warn(`UTF-8解码也失败: ${handleError(utf8Error)}`, 'FileVectorSearchService');
          // 最后的fallback：尝试其他常见编码
          try {
            textContent = iconv.decode(buffer, 'gbk');
          } catch (gbkError) {
            // 最终fallback
            textContent = buffer.toString('binary');
          }
        }
      }

      // 智能转换TXT为Markdown格式
      const markdownContent = this.convertTxtToMarkdown(textContent, encoding);

      return this.cleanText(markdownContent);
    } catch (error) {
      Logger.error(`TXT文件解析失败: ${handleError(error)}`, 'FileVectorSearchService');
      throw new Error('TXT文件解析失败');
    }
  }

  /**
   * 智能TXT转Markdown转换器（参考前端实现）
   * @param textContent 原始文本内容
   * @param encoding 文件编码
   * @returns Markdown格式的文本
   */
  private convertTxtToMarkdown(textContent: string, encoding?: string): string {
    if (!textContent) return '# 空文本文件';

    const lines = textContent.split('\n');
    let markdown = '';

    // 添加文件信息头部（如果有编码信息）
    if (encoding) {
      markdown += `# 文本文件内容\n\n> **检测编码**: ${encoding}\n\n`;
    }

    let inCodeBlock = false;
    let currentListLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 跳过空行但保留一个换行
      if (!trimmedLine) {
        if (markdown && !markdown.endsWith('\n\n')) {
          markdown += '\n';
        }
        continue;
      }

      // 检测标题：连续大写字母或以数字+点开头，且下一行是分隔符
      const nextLine = lines[i + 1]?.trim();
      const isTitle =
        // 全大写标题
        (trimmedLine.length > 2 &&
          trimmedLine === trimmedLine.toUpperCase() &&
          /^[A-Z\s\d]+$/.test(trimmedLine)) ||
        // 下一行是分隔符的标题
        (nextLine && (nextLine.match(/^[=\-]{3,}$/) || nextLine.match(/^[*#]{3,}$/))) ||
        // 数字编号标题
        /^\d+[\.\)]\s+[A-Z]/.test(trimmedLine) ||
        // 罗马数字标题
        /^[IVX]+[\.\)]\s+/.test(trimmedLine);

      if (isTitle) {
        // 检测标题级别
        let level = 1;
        if (/^\d+[\.\)]/.test(trimmedLine)) level = 2;
        if (/^[a-z]\)/.test(trimmedLine)) level = 3;

        const titleText = trimmedLine.replace(/^(\d+[\.\)]|\w+[\.\)])\s*/, '');
        markdown += `${'#'.repeat(level)} ${titleText}\n\n`;

        // 跳过下一行的分隔符
        if (nextLine && nextLine.match(/^[=\-*#]{3,}$/)) {
          i++;
        }
        continue;
      }

      // 检测列表项
      const listMatch =
        trimmedLine.match(/^(\s*)[-*+•]\s+(.+)$/) || trimmedLine.match(/^(\s*)\d+[\.\)]\s+(.+)$/);

      if (listMatch) {
        const indent = listMatch[1].length;
        const content = listMatch[2];
        const isNumbered = /^\s*\d+[\.\)]/.test(trimmedLine);

        // 计算列表级别
        const level = Math.floor(indent / 2);

        if (level > currentListLevel) {
          currentListLevel = level;
        } else if (level < currentListLevel) {
          currentListLevel = level;
        }

        const prefix = '  '.repeat(level) + (isNumbered ? '1. ' : '- ');
        markdown += `${prefix}${content}\n`;
        continue;
      } else {
        currentListLevel = 0;
      }

      // 检测代码块（缩进4个空格或以特殊字符开头）
      const isCodeLine =
        line.startsWith('    ') ||
        line.startsWith('\t') ||
        /^[\s]*[{}();]/.test(line) ||
        /^[\s]*#include|import |function |def |class |var |let |const /.test(line);

      if (isCodeLine && !inCodeBlock) {
        markdown += '```\n';
        inCodeBlock = true;
      } else if (!isCodeLine && inCodeBlock) {
        markdown += '```\n\n';
        inCodeBlock = false;
      }

      if (inCodeBlock) {
        markdown += line + '\n';
      } else {
        // 检测引用（以>开头或缩进且以引号开头）
        if (trimmedLine.startsWith('>') || (line.startsWith('  ') && /^[""]/.test(trimmedLine))) {
          const quoteText = trimmedLine
            .replace(/^>\s*/, '')
            .replace(/^[""]/, '')
            .replace(/[""]$/, '');
          markdown += `> ${quoteText}\n\n`;
          continue;
        }

        // 检测分隔线
        if (trimmedLine.match(/^[=\-*]{3,}$/)) {
          markdown += '---\n\n';
          continue;
        }

        // 检测表格（包含多个 | 分隔符）
        if (trimmedLine.includes('|') && trimmedLine.split('|').length >= 3) {
          markdown += trimmedLine + '\n';
          // 检查下一行是否需要添加表格分隔符
          const nextLineContent = lines[i + 1]?.trim();
          if (nextLineContent && !nextLineContent.includes('|')) {
            const cols = trimmedLine.split('|').length - 1;
            markdown += '|' + ' --- |'.repeat(cols) + '\n';
          }
          continue;
        }

        // 检测网址
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        let formattedLine = trimmedLine.replace(urlPattern, '[$1]($1)');

        // 检测邮箱
        const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        formattedLine = formattedLine.replace(emailPattern, '[$1](mailto:$1)');

        // 普通段落
        markdown += formattedLine + '\n\n';
      }
    }

    // 关闭未关闭的代码块
    if (inCodeBlock) {
      markdown += '```\n';
    }

    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown || '# 文本内容\n\n无法解析的文本内容';
  }

  /**
   * 创建Markdown表格（替换markdownTable库）
   * @param data 二维数组数据
   * @returns Markdown格式的表格
   */
  private createMarkdownTable(data: string[][]): string {
    if (!data || data.length === 0) return '';

    let table = '';

    data.forEach((row, rowIndex) => {
      // 转义管道符和换行符，处理空值
      const escapedRow = row.map(cell =>
        (cell || '').toString().replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, '').trim(),
      );

      table += '| ' + escapedRow.join(' | ') + ' |\n';

      // 添加表头分隔符
      if (rowIndex === 0) {
        table += '| ' + row.map(() => '---').join(' | ') + ' |\n';
      }
    });

    return table;
  }
}
