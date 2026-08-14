import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileVectorCacheService } from './fileVectorCache.service';

/**
 * 文件向量缓存定时任务
 * 负责定期清理过期的向量缓存
 */
@Injectable()
export class FileVectorCacheSchedule {
  constructor(private readonly fileVectorCacheService: FileVectorCacheService) {}

  /**
   * 每天凌晨 2 点清理过期缓存
   */
  @Cron('0 0 2 * * *', {
    name: 'cleanExpiredVectors',
    timeZone: 'Asia/Shanghai',
  })
  async handleCleanExpiredCache() {
    try {
      const deletedCount = await this.fileVectorCacheService.cleanExpiredCache();

      if (deletedCount > 0) {
        Logger.log(
          `过期向量缓存清理完成: 删除了 ${deletedCount} 条记录`,
          'FileVectorCacheSchedule',
        );
      }
      // 静默完成，不输出日志
    } catch (error) {
      Logger.error(`过期向量缓存清理失败: ${error.message}`, 'FileVectorCacheSchedule');
    }
  }

  /**
   * 每小时输出缓存统计信息（可选，用于监控）
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'vectorCacheStats',
    timeZone: 'Asia/Shanghai',
  })
  async handleLogStats() {
    // 静默执行统计任务，不输出日志
    // 如需调试，可手动取消注释以下代码
    /*
    try {
      const stats = await this.fileVectorCacheService.getStats();
      Logger.debug(
        `向量缓存统计 - 总数: ${stats.total}, 用户文件: ${stats.userFiles}, 系统文件: ${stats.systemFiles}, 过期: ${stats.expired}`,
        'FileVectorCacheSchedule',
      );
    } catch (error) {
      Logger.error(`获取向量缓存统计失败: ${error.message}`, 'FileVectorCacheSchedule');
    }
    */
  }
}
