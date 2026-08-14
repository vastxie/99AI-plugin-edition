import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FileVectorCacheService } from './fileVectorCache.service';
import { FileVectorSearchService } from './fileVectorSearch.service';
import { SuperAuthGuard } from 'src/common/auth/superAuth.guard';
import { correctApiBaseUrl } from '@/common/utils';
import OpenAI from 'openai';

/**
 * 文件向量缓存管理控制器
 * 仅限超级管理员访问
 */
@Controller('fileVectorCache')
@ApiTags('File Vector Cache')
@UseGuards(SuperAuthGuard)
export class FileVectorCacheController {
  constructor(
    private readonly fileVectorCacheService: FileVectorCacheService,
    private readonly fileVectorSearchService: FileVectorSearchService,
  ) {}

  /**
   * 获取缓存统计信息
   */
  @Get('stats')
  @ApiOperation({ summary: '获取向量缓存统计信息' })
  async getStats() {
    const stats = await this.fileVectorCacheService.getStats();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * 获取缓存列表
   */
  @Get('list')
  @ApiOperation({ summary: '获取向量缓存列表' })
  async getList(
    @Query('fileType') fileType: 'user' | 'system',
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ) {
    if (!fileType || !['user', 'system'].includes(fileType)) {
      return {
        success: false,
        message: '请提供有效的 fileType 参数 (user/system)',
      };
    }

    const pageNum = parseInt(page.toString(), 10) || 1;
    const pageSizeNum = parseInt(pageSize.toString(), 10) || 10;

    const result = await this.fileVectorCacheService.getList(fileType, pageNum, pageSizeNum);

    return {
      success: true,
      data: result.data,
      total: result.total,
    };
  }

  /**
   * 检查文件缓存是否存在
   */
  @Get('exists')
  @ApiOperation({ summary: '检查文件缓存是否存在' })
  async checkExists(@Query('fileUrl') fileUrl: string) {
    if (!fileUrl) {
      return {
        success: false,
        message: '请提供 fileUrl 参数',
      };
    }

    const exists = await this.fileVectorCacheService.exists(fileUrl);
    const cached = exists ? await this.fileVectorCacheService.getVectors(fileUrl) : null;

    return {
      success: true,
      data: {
        exists,
        cache: cached
          ? {
              fileUrl: fileUrl,
              fileType: cached.fileType,
              userId: cached.userId,
              chunkCount: cached.chunks?.length || 0,
              vectorCount: cached.vectors?.length || 0,
            }
          : null,
      },
    };
  }

  /**
   * 删除指定文件的缓存
   */
  @Delete('delete')
  @ApiOperation({ summary: '删除指定文件的向量缓存' })
  async deleteCache(@Query('fileUrl') fileUrl: string) {
    if (!fileUrl) {
      return {
        success: false,
        message: '请提供 fileUrl 参数',
      };
    }

    const success = await this.fileVectorCacheService.deleteVectors(fileUrl);

    if (success) {
      return {
        success: true,
        message: '删除成功',
      };
    } else {
      return {
        success: false,
        message: '删除失败，缓存可能不存在',
      };
    }
  }

  /**
   * 批量删除用户的所有向量缓存
   */
  @Delete('user/:userId')
  @ApiOperation({ summary: '删除指定用户的所有向量缓存' })
  async deleteUserVectors(@Param('userId') userId: string) {
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) {
      return {
        success: false,
        message: '无效的用户 ID',
      };
    }

    const count = await this.fileVectorCacheService.deleteUserVectors(userIdNum);

    return {
      success: true,
      message: `成功删除 ${count} 条向量缓存`,
      data: { deletedCount: count },
    };
  }

  /**
   * 手动清理过期缓存
   */
  @Post('clean')
  @ApiOperation({ summary: '手动清理过期的向量缓存' })
  async cleanExpired() {
    const deletedCount = await this.fileVectorCacheService.cleanExpiredCache();

    return {
      success: true,
      message: `清理完成，删除了 ${deletedCount} 条过期缓存`,
      data: { deletedCount },
    };
  }

  /**
   * 保存系统文件向量（管理员上传永久文件）
   */
  @Post('saveSystemFile')
  @ApiOperation({ summary: '保存系统文件向量（永久缓存）' })
  async saveSystemFile(
    @Body()
    body: {
      fileUrl: string;
      chunks: any[];
      vectors: any[];
      modelInfo: string;
      fileContent?: string;
      originalFileName?: string;
    },
  ) {
    const { fileUrl, chunks, vectors, modelInfo, fileContent, originalFileName } = body;

    if (!fileUrl || !chunks || !vectors || !modelInfo) {
      return {
        success: false,
        message: '缺少必要参数：fileUrl, chunks, vectors, modelInfo',
      };
    }

    const success = await this.fileVectorCacheService.saveVectors(
      fileUrl,
      chunks,
      vectors,
      modelInfo,
      {
        fileType: 'system',
        fileContent: fileContent,
        originalFileName: originalFileName,
      },
    );

    if (success) {
      return {
        success: true,
        message: '系统文件向量保存成功（永久缓存）',
        data: {
          fileUrl,
          chunkCount: chunks.length,
          vectorCount: vectors.length,
          fileType: 'system',
          expiresAt: null,
        },
      };
    } else {
      return {
        success: false,
        message: '保存失败',
      };
    }
  }

  /**
   * 上传并自动向量化文件
   */
  @Post('uploadAndVectorize')
  @ApiOperation({ summary: '上传文件并自动向量化（系统文件，永久缓存）' })
  async uploadAndVectorize(@Body() body: { fileUrl: string; originalFileName?: string }) {
    const { fileUrl, originalFileName } = body;

    Logger.debug('开始文件向量化处理', 'FileVectorCacheController');

    if (!fileUrl) {
      return {
        success: false,
        message: '请提供 fileUrl 参数',
      };
    }

    try {
      // 检查是否已经缓存
      Logger.debug('检查文件是否已存在向量缓存...', 'FileVectorCacheController');
      const cached = await this.fileVectorCacheService.getVectors(fileUrl);
      if (cached) {
        Logger.debug('文件已存在，跳过向量化', 'FileVectorCacheController');
        return {
          success: true,
          message: '文件已存在，跳过向量化',
          data: {
            fileUrl,
            chunkCount: cached.chunks?.length || 0,
            vectorCount: cached.vectors?.length || 0,
            fileType: cached.fileType,
            cached: true,
          },
        };
      }

      // 获取配置
      Logger.debug('获取向量化配置...', 'FileVectorCacheController');

      let vectorUrl: any,
        vectorKey: any,
        vectorModel: any,
        openaiBaseUrl: any,
        openaiBaseKey: any,
        openaiBaseModel: any;

      try {
        Logger.debug('调用 globalConfigService.getConfigs...', 'FileVectorCacheController');
        const startTime = Date.now();

        const config = await this.fileVectorSearchService['globalConfigService'].getConfigs([
          'vectorUrl',
          'vectorKey',
          'vectorModel',
          'openaiBaseUrl',
          'openaiBaseKey',
          'openaiBaseModel',
        ]);

        const elapsedTime = Date.now() - startTime;
        Logger.debug(`getConfigs 耗时: ${elapsedTime}ms`, 'FileVectorCacheController');

        vectorUrl = config.vectorUrl;
        vectorKey = config.vectorKey;
        vectorModel = config.vectorModel;
        openaiBaseUrl = config.openaiBaseUrl;
        openaiBaseKey = config.openaiBaseKey;
        openaiBaseModel = config.openaiBaseModel;

        Logger.debug(
          `配置获取完成: vectorUrl=${!!vectorUrl}, vectorKey=${!!vectorKey}, openaiBaseUrl=${!!openaiBaseUrl}, openaiBaseKey=${!!openaiBaseKey}`,
          'FileVectorCacheController',
        );
      } catch (error) {
        Logger.error(`获取配置失败: ${error.message}`, 'FileVectorCacheController');
        throw new Error(`获取向量化配置失败: ${error.message}`);
      }

      if (!vectorKey && !openaiBaseKey) {
        throw new Error('缺少向量化API密钥配置');
      }

      if (!vectorUrl && !openaiBaseUrl) {
        throw new Error('缺少向量化API基础URL配置');
      }

      const apiKey = vectorKey || openaiBaseKey;
      Logger.debug('准备修正向量 API BaseURL', 'FileVectorCacheController');

      let baseURL: string;
      try {
        baseURL = await correctApiBaseUrl(vectorUrl || openaiBaseUrl);
        Logger.debug('向量 API BaseURL 修正完成', 'FileVectorCacheController');
      } catch (error) {
        Logger.error(`修正 API BaseURL 失败: ${error.message}`, 'FileVectorCacheController');
        throw new Error(`修正 API BaseURL 失败: ${error.message}`);
      }

      const model = vectorModel || openaiBaseModel;
      Logger.debug(`使用模型: ${model}`, 'FileVectorCacheController');

      // 1. 提取文件文本内容
      Logger.debug('开始提取文件文本内容', 'FileVectorCacheController');
      let fileContent: string;
      try {
        fileContent = await this.fileVectorSearchService['extractTextFromUrl'](fileUrl);
        Logger.debug(
          `文件文本提取完成，内容长度: ${fileContent.length} 字符`,
          'FileVectorCacheController',
        );
      } catch (error) {
        Logger.error(`文件文本提取失败: ${error.message}`, 'FileVectorCacheController');
        throw new Error(`文件文本提取失败: ${error.message}`);
      }

      // 2. 文本分块
      Logger.debug('开始文本分块...', 'FileVectorCacheController');
      const textChunks = this.fileVectorSearchService['chunkText'](fileContent, 1000);
      Logger.debug(`文本分块完成，共 ${textChunks.length} 个分块`, 'FileVectorCacheController');

      // 3. 向量化所有分块
      Logger.debug(`开始向量化处理，模型: ${model}`, 'FileVectorCacheController');
      const openai = new OpenAI({
        apiKey: typeof apiKey === 'string' ? apiKey : await apiKey,
        baseURL,
      });

      const embeddings: number[][] = [];
      for (let i = 0; i < textChunks.length; i += 20) {
        const batch = textChunks.slice(i, i + 20);
        Logger.debug(
          `向量化进度: ${i + 1}-${Math.min(i + 20, textChunks.length)}/${textChunks.length}`,
          'FileVectorCacheController',
        );

        const response = await openai.embeddings.create({
          model: typeof model === 'string' ? model : await model,
          input: batch,
          encoding_format: 'float',
        });

        const batchEmbeddings = response.data.map((item: any) => item.embedding);
        embeddings.push(...batchEmbeddings);
      }
      Logger.debug(`向量化完成，共生成 ${embeddings.length} 个向量`, 'FileVectorCacheController');

      // 4. 保存到缓存
      Logger.debug('保存向量缓存到数据库...', 'FileVectorCacheController');
      const success = await this.fileVectorCacheService.saveVectors(
        fileUrl,
        textChunks,
        embeddings,
        typeof model === 'string' ? model : await model,
        {
          fileType: 'system',
          fileContent: fileContent,
          originalFileName: originalFileName,
        },
      );

      if (success) {
        Logger.log(
          `文件向量化成功，共 ${textChunks.length} 个分块，${embeddings.length} 个向量`,
          'FileVectorCacheController',
        );
        return {
          success: true,
          message: '文件向量化成功（永久缓存）',
          data: {
            fileUrl,
            chunkCount: textChunks.length,
            vectorCount: embeddings.length,
            modelInfo: typeof model === 'string' ? model : await model,
            fileType: 'system',
            cached: false,
          },
        };
      } else {
        return {
          success: false,
          message: '保存向量缓存失败',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || '文件向量化失败',
      };
    }
  }
}
