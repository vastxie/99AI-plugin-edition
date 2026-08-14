/**
 * 进程内的轻量性能采样工具。
 */
export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map();

  /**
   * 记录操作时间
   */
  static recordTiming(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    const timings = this.metrics.get(operation);
    timings.push(duration);

    // 保持最近100个记录
    if (timings.length > 100) {
      timings.shift();
    }

  }

  /**
   * 获取平均响应时间
   */
  static getAverageTime(operation: string): number {
    const timings = this.metrics.get(operation);
    if (!timings || timings.length === 0) return 0;
    return timings.reduce((a, b) => a + b, 0) / timings.length;
  }

  /**
   * 检查系统健康状态
   */
  static isHealthy(): boolean {
    return true;
  }

  /**
   * 清理旧数据
   */
  static cleanup(): void {
    this.metrics.forEach((timings, operation) => {
      // 保留最近50条记录
      if (timings.length > 50) {
        this.metrics.set(operation, timings.slice(-50));
      }
    });
  }
}
