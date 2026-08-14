import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { FileVectorCacheEntity } from './fileVectorCache.entity';

/**
 * 文件向量缓存服务
 * 提供向量的保存、检索、删除功能
 * 支持用户文件（短期缓存）和系统文件（永久缓存）
 */
@Injectable()
export class FileVectorCacheService {
  constructor(
    @InjectRepository(FileVectorCacheEntity)
    private readonly fileVectorCacheRepository: Repository<FileVectorCacheEntity>,
  ) {}

  /**
   * 计算文件URL的哈希值（用作缓存键）
   */
  private calculateFileHash(fileUrl: string): string {
    return createHash('sha256').update(fileUrl).digest('hex');
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的文件大小字符串，如 "1.23 MB"
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 保存向量缓存
   * @param fileUrl 文件URL
   * @param chunks 文本分块数组
   * @param vectors 向量数组
   * @param modelInfo 使用的模型信息
   * @param options 选项
   */
  async saveVectors(
    fileUrl: string,
    chunks: any[],
    vectors: any[],
    modelInfo: string,
    options: {
      fileType?: 'user' | 'system'; // 文件类型，默认 user
      userId?: number; // 用户ID（user类型时必填）
      fileContent?: string; // 文件内容（可选）
      originalFileName?: string; // 原始文件名（可选）
      expiresInDays?: number; // 过期天数（仅user类型有效，默认3天）
    } = {},
  ): Promise<boolean> {
    try {
      const {
        fileType = 'user',
        userId,
        fileContent,
        originalFileName,
        expiresInDays = 3,
      } = options;
      const fileHash = this.calculateFileHash(fileUrl);

      // 验证必填字段
      if (fileType === 'user' && !userId) {
        throw new Error('用户文件必须提供 userId');
      }

      // 计算过期时间
      let expiresAt: Date | null = null;
      if (fileType === 'user') {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      }
      // system 文件：expiresAt 保持为 null（永不过期）

      // 计算chunks和vectors的JSON序列化大小（估算数据库占用）
      const chunksJsonSize = JSON.stringify(chunks).length;
      const vectorsJsonSize = JSON.stringify(vectors).length;
      const totalDbSize = chunksJsonSize + vectorsJsonSize;
      const dbSize = this.formatFileSize(totalDbSize);

      // 先删除旧缓存（如果存在）
      await this.fileVectorCacheRepository.delete({ fileHash });

      // 保存新缓存
      await this.fileVectorCacheRepository.save({
        fileHash,
        fileUrl,
        originalFileName: originalFileName || null,
        dbSize: dbSize,
        fileContent: fileContent || null,
        chunks: chunks as any,
        vectors: vectors as any,
        modelInfo,
        fileType,
        expiresAt,
        userId: userId || null,
      });

      Logger.log(
        `向量缓存已保存，类型: ${fileType}, 数据库大小: ${dbSize}, 过期: ${
          expiresAt || '永久'
        }`,
        'FileVectorCacheService',
      );

      return true;
    } catch (error) {
      Logger.error(`保存向量缓存失败: ${error.message}`, 'FileVectorCacheService');
      return false;
    }
  }

  /**
   * 获取向量缓存
   * @param fileUrl 文件URL
   * @returns 缓存的向量数据，如果不存在或已过期则返回 null
   */
  async getVectors(fileUrl: string): Promise<{
    chunks: any[];
    vectors: any[];
    fileContent?: string;
    originalFileName?: string;
    fileType: 'user' | 'system';
    userId?: number;
  } | null> {
    try {
      const fileHash = this.calculateFileHash(fileUrl);

      const cached = await this.fileVectorCacheRepository.findOne({
        where: { fileHash },
      });

      if (!cached) {
        return null;
      }

      // 检查是否过期
      if (cached.expiresAt && new Date() > cached.expiresAt) {
        Logger.debug('向量缓存已过期', 'FileVectorCacheService');
        // 删除过期缓存
        await this.fileVectorCacheRepository.delete({ fileHash });
        return null;
      }

      return {
        chunks: cached.chunks as any[],
        vectors: cached.vectors as any[],
        fileContent: cached.fileContent || undefined,
        originalFileName: cached.originalFileName || undefined,
        fileType: cached.fileType,
        userId: cached.userId || undefined,
      };
    } catch (error) {
      Logger.error(`获取向量缓存失败: ${error.message}`, 'FileVectorCacheService');
      return null;
    }
  }

  /**
   * 删除向量缓存
   * @param fileUrl 文件URL
   * @returns 是否删除成功
   */
  async deleteVectors(fileUrl: string): Promise<boolean> {
    try {
      const fileHash = this.calculateFileHash(fileUrl);
      const result = await this.fileVectorCacheRepository.delete({ fileHash });

      const success = (result.affected || 0) > 0;
      if (success) {
        Logger.log('向量缓存已删除', 'FileVectorCacheService');
      }

      return success;
    } catch (error) {
      Logger.error(`删除向量缓存失败: ${error.message}`, 'FileVectorCacheService');
      return false;
    }
  }

  /**
   * 批量删除用户的向量缓存
   * @param userId 用户ID
   * @returns 删除的记录数
   */
  async deleteUserVectors(userId: number): Promise<number> {
    try {
      const result = await this.fileVectorCacheRepository.delete({
        userId,
        fileType: 'user',
      });

      const deletedCount = result.affected || 0;
      if (deletedCount > 0) {
        Logger.log(`删除用户 ${userId} 的向量缓存: ${deletedCount} 条`, 'FileVectorCacheService');
      }

      return deletedCount;
    } catch (error) {
      Logger.error(`批量删除用户向量缓存失败: ${error.message}`, 'FileVectorCacheService');
      return 0;
    }
  }

  /**
   * 清理过期的缓存数据
   * @returns 删除的记录数
   */
  async cleanExpiredCache(): Promise<number> {
    try {
      const result = await this.fileVectorCacheRepository
        .createQueryBuilder()
        .delete()
        .where('expiresAt IS NOT NULL')
        .andWhere('expiresAt < :now', { now: new Date() })
        .execute();

      const deletedCount = result.affected || 0;
      if (deletedCount > 0) {
        Logger.log(`清理过期向量缓存: 删除了 ${deletedCount} 条记录`, 'FileVectorCacheService');
      }

      return deletedCount;
    } catch (error) {
      Logger.error(`清理过期缓存失败: ${error.message}`, 'FileVectorCacheService');
      return 0;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    total: number;
    userFiles: number;
    systemFiles: number;
    expired: number;
  }> {
    try {
      const [total, userFiles, systemFiles, expired] = await Promise.all([
        this.fileVectorCacheRepository.count(),
        this.fileVectorCacheRepository.count({ where: { fileType: 'user' } }),
        this.fileVectorCacheRepository.count({ where: { fileType: 'system' } }),
        this.fileVectorCacheRepository
          .createQueryBuilder()
          .where('expiresAt IS NOT NULL')
          .andWhere('expiresAt < :now', { now: new Date() })
          .getCount(),
      ]);

      return {
        total,
        userFiles,
        systemFiles,
        expired,
      };
    } catch (error) {
      Logger.error(`获取缓存统计失败: ${error.message}`, 'FileVectorCacheService');
      return { total: 0, userFiles: 0, systemFiles: 0, expired: 0 };
    }
  }

  /**
   * 获取缓存列表（分页）
   * @param fileType 文件类型 (user/system)
   * @param page 页码
   * @param pageSize 每页数量
   * @returns 缓存列表
   */
  async getList(
    fileType: 'user' | 'system',
    page = 1,
    pageSize = 10,
  ): Promise<{
    data: any[];
    total: number;
  }> {
    try {
      const [data, total] = await this.fileVectorCacheRepository.findAndCount({
        where: { fileType },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: [
          'id',
          'fileHash',
          'fileUrl',
          'fileType',
          'userId',
          // 移除 chunks 和 vectors 以避免排序内存溢出
          // 'chunks',
          // 'vectors',
          'originalFileName',
          'dbSize',
          'modelInfo',
          'createdAt',
          'expiresAt',
        ],
      });

      // 格式化返回数据
      const formattedData = data.map(item => {
        // 从 URL 中提取文件名作为后备
        const urlParts = item.fileUrl.split('/');
        const fileName = urlParts[urlParts.length - 1] || item.fileUrl;

        return {
          id: item.id,
          fileName: fileName, // 系统生成的文件名（从URL提取）
          originalFileName: item.originalFileName || null, // 原始文件名（用户上传时的文件名）
          fileUrl: item.fileUrl,
          fileType: item.fileType,
          userId: item.userId,
          fileSize: item.dbSize || '-', // 数据库大小（从数据库读取）
          modelInfo: item.modelInfo,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
        };
      });

      return { data: formattedData, total };
    } catch (error) {
      Logger.error(`获取缓存列表失败: ${error.message}`, 'FileVectorCacheService');
      return { data: [], total: 0 };
    }
  }

  /**
   * 检查缓存是否存在且有效
   * @param fileUrl 文件URL
   * @returns 是否存在有效缓存
   */
  async exists(fileUrl: string): Promise<boolean> {
    const cached = await this.getVectors(fileUrl);
    return cached !== null;
  }
}
