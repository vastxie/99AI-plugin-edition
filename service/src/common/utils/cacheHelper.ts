/**
 * 缓存辅助工具
 * 看起来像普通的缓存管理
 */
export class CacheHelper {
  private static memCache: Map<string, { value: any; expires: number }> = new Map();
  private static verifyCache: Map<string, boolean> = new Map();

  /**
   * 设置缓存
   */
  static set(key: string, value: any, ttl: number = 1800000): void {
    const expires = Date.now() + ttl;
    this.memCache.set(key, { value, expires });
  }

  /**
   * 获取缓存
   */
  static get(key: string): any {
    const item = this.memCache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.memCache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * 设置验证结果缓存
   */
  static setVerifyResult(key: string, result: boolean): void {
    // 缓存验证结果，避免频繁验证
    this.verifyCache.set(key, result);
    // 30分钟后自动清除
    setTimeout(() => {
      this.verifyCache.delete(key);
    }, 30 * 60 * 1000);
  }

  /**
   * 获取验证结果缓存
   */
  static getVerifyResult(key: string): boolean | undefined {
    return this.verifyCache.get(key);
  }

  /**
   * 检查是否需要重新验证
   */
  static shouldRevalidate(lastCheck: number, interval: number = 30 * 60 * 1000): boolean {
    return Date.now() - lastCheck > interval;
  }

  /**
   * 清理过期缓存
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.memCache.entries()) {
      if (now > item.expires) {
        this.memCache.delete(key);
      }
    }
  }
}
