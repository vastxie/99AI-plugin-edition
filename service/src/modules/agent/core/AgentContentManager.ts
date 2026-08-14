import { Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import { promisify } from 'util';
import {
  AgentContentUpdate,
  AgentUpdateType,
  AgentUpdateItem,
  createIncrementalUpdate,
} from './AgentContent.types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * AgentContent 管理器
 * 统一管理 agent_content 的序列化、压缩和缓存
 */
export class AgentContentManager {
  private readonly logger = new Logger('AgentContentManager');

  // 内存缓存，避免重复序列化
  private cache = new Map<
    string,
    {
      data: any;
      serialized: string;
      compressed?: Buffer;
      timestamp: number;
    }
  >();

  // 缓存过期时间（5分钟）
  private readonly CACHE_TTL = 5 * 60 * 1000;

  // 压缩阈值（超过10KB才压缩）
  private readonly COMPRESSION_THRESHOLD = 10 * 1024;

  // 批量更新缓冲区
  private updateBuffer = new Map<string, AgentUpdateItem[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly BUFFER_FLUSH_DELAY = 100; // 100ms 批量发送

  constructor(private readonly enableCompression: boolean = true) {
    // 定期清理过期缓存
    setInterval(() => this.cleanupCache(), 60000); // 每分钟清理一次
  }

  /**
   * 添加增量更新到缓冲区（简化版）
   */
  public bufferUpdate(
    sessionId: string,
    type: AgentUpdateType,
    data: any,
    id: string,
    callback: (update: AgentContentUpdate) => void,
  ): void {
    // 获取或创建缓冲区
    if (!this.updateBuffer.has(sessionId)) {
      this.updateBuffer.set(sessionId, []);
    }

    const buffer = this.updateBuffer.get(sessionId)!;

    // 添加更新项（简化版）
    buffer.push({
      id,
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    // 清除之前的定时器
    const existingTimer = this.flushTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的批量发送定时器
    const timer = setTimeout(() => {
      this.flushUpdates(sessionId, callback);
    }, this.BUFFER_FLUSH_DELAY);

    this.flushTimers.set(sessionId, timer);

    // 如果缓冲区过大，立即发送
    if (buffer.length > 50) {
      this.flushUpdates(sessionId, callback);
    }
  }

  /**
   * 立即发送缓冲区的更新
   */
  public flushUpdates(sessionId: string, callback: (update: AgentContentUpdate) => void): void {
    const buffer = this.updateBuffer.get(sessionId);
    if (!buffer || buffer.length === 0) {
      return;
    }

    // 清除定时器
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    // 创建批量更新
    const update = createIncrementalUpdate(buffer);

    // 清空缓冲区
    this.updateBuffer.set(sessionId, []);

    // 发送批量更新
    callback(update);

    this.logger.debug(`批量发送 ${buffer.length} 个更新`);
  }

  /**
   * 序列化 agent_content
   * 使用缓存减少重复序列化
   */
  public async serialize(data: any, cacheKey?: string): Promise<string> {
    // 检查缓存
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        // 检查数据是否相同
        if (this.isDataEqual(cached.data, data)) {
          this.logger.debug(`使用缓存的序列化数据: ${cacheKey}`);
          return cached.serialized;
        }
      }
    }

    // 序列化数据
    const serialized = JSON.stringify(data);

    // 更新缓存
    if (cacheKey) {
      this.cache.set(cacheKey, {
        data: this.cloneData(data),
        serialized,
        timestamp: Date.now(),
      });
    }

    return serialized;
  }

  /**
   * 压缩数据（用于大量数据传输）
   */
  public async compress(data: string, cacheKey?: string): Promise<string | Buffer> {
    // 如果数据较小，不压缩
    if (!this.enableCompression || data.length < this.COMPRESSION_THRESHOLD) {
      return data;
    }

    // 检查缓存
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.compressed && this.isCacheValid(cached)) {
        if (cached.serialized === data) {
          this.logger.debug(`使用缓存的压缩数据: ${cacheKey}`);
          return cached.compressed;
        }
      }
    }

    try {
      // 使用 gzip 压缩
      const compressed = await gzip(data, { level: 6 });

      // 计算压缩率
      const compressionRatio = ((1 - compressed.length / data.length) * 100).toFixed(1);
      this.logger.debug(
        `数据压缩: ${data.length} -> ${compressed.length} bytes (压缩率: ${compressionRatio}%)`,
      );

      // 更新缓存
      if (cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          cached.compressed = compressed;
        }
      }

      // 返回 base64 编码的压缩数据
      return compressed.toString('base64');
    } catch (error) {
      this.logger.error(`压缩失败: ${error.message}`);
      return data;
    }
  }

  /**
   * 解压数据
   */
  public async decompress(data: string | Buffer): Promise<string> {
    if (typeof data === 'string') {
      // 检查是否是 base64 编码的压缩数据
      if (!data.startsWith('{') && !data.startsWith('[')) {
        try {
          const buffer = Buffer.from(data, 'base64');
          const decompressed = await (gunzip as any)(buffer);
          return decompressed.toString('utf-8');
        } catch {
          // 不是压缩数据，直接返回
          return data;
        }
      }
      return data;
    } else {
      const decompressed = await (gunzip as any)(data);
      return decompressed.toString('utf-8');
    }
  }

  /**
   * 优化的序列化和压缩
   * 智能决定是否需要压缩
   */
  public async optimizedSerialize(
    data: any,
    options: {
      cacheKey?: string;
      compress?: boolean;
      priority?: 'speed' | 'size';
    } = {},
  ): Promise<string> {
    const { cacheKey, compress = true, priority = 'speed' } = options;

    // 序列化
    const serialized = await this.serialize(data, cacheKey);

    // 根据优先级决定是否压缩
    if (compress && priority === 'size') {
      // 优先考虑大小，进行压缩
      const compressed = await this.compress(serialized, cacheKey);
      if (typeof compressed === 'string' && compressed.length < serialized.length) {
        return `gzip:${compressed}`;
      }
    } else if (compress && serialized.length > this.COMPRESSION_THRESHOLD * 2) {
      // 数据很大时才压缩
      const compressed = await this.compress(serialized, cacheKey);
      if (typeof compressed === 'string') {
        return `gzip:${compressed}`;
      }
    }

    return serialized;
  }

  /**
   * 智能反序列化
   * 自动检测并处理压缩数据
   */
  public async optimizedDeserialize(data: string): Promise<any> {
    let jsonString: string;

    // 检查是否是压缩数据
    if (data.startsWith('gzip:')) {
      const compressed = data.substring(5);
      jsonString = await this.decompress(compressed);
    } else {
      jsonString = await this.decompress(data);
    }

    return JSON.parse(jsonString);
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`清理了 ${cleaned} 个过期缓存`);
    }
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(cached: any): boolean {
    return Date.now() - cached.timestamp < this.CACHE_TTL;
  }

  /**
   * 比较数据是否相等（浅比较）
   */
  private isDataEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (typeof a !== typeof b) return false;

    // 对于对象，比较关键字段
    if (typeof a === 'object') {
      // 比较主要字段的长度或内容
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;

      // 简单比较，避免深度递归
      for (const key of keysA) {
        if (typeof a[key] !== typeof b[key]) return false;
        if (typeof a[key] === 'string' && a[key].length !== b[key].length) return false;
      }
    }

    return true;
  }

  /**
   * 克隆数据（用于缓存）
   */
  private cloneData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    // 简单克隆，不处理循环引用
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return data;
    }
  }

  /**
   * 清理会话相关的缓冲区
   */
  public cleanupSession(sessionId: string): void {
    // 清理缓冲区
    this.updateBuffer.delete(sessionId);

    // 清理定时器
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    // 清理相关缓存
    for (const key of this.cache.keys()) {
      if (key.startsWith(sessionId)) {
        this.cache.delete(key);
      }
    }
  }
}

// 单例实例
export const agentContentManager = new AgentContentManager();
