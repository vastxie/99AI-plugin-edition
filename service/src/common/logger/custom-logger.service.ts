import { ConsoleLogger, Injectable } from '@nestjs/common';
import util from 'util';

@Injectable()
export class CustomLoggerService extends ConsoleLogger {
  private isDev: boolean;
  private readonly sensitiveKeyPattern =
    /^(authorization|cookie|set-cookie|password|passwd|token|access[_-]?token|refresh[_-]?token|secret|api[_-]?key|key|openid|open_id|unionid|union_id|signature|credential|x-amz-.*|x-goog-.*)$/i;

  constructor() {
    super();
    this.isDev = process.env.ISDEV === 'true';
  }

  /**
   * 过滤日志消息中的敏感数据，如 Base64 编码
   * @param message 需要过滤的日志消息
   * @returns 过滤后的日志消息
   */
  private sanitizeLogMessage(message: any): string {
    // 处理空值情况
    if (message === null || message === undefined) {
      return String(message);
    }

    // 处理对象或数组
    if (typeof message === 'object') {
      try {
        // 使用 util.inspect 确保对象完全序列化，包括循环引用
        if (Array.isArray(message)) {
          // 数组特殊处理，避免JSON.parse可能的问题
          const sanitizedArray = [...message];
          this.sanitizeDeep(sanitizedArray);
          return util.inspect(sanitizedArray, { depth: null, maxArrayLength: null });
        } else {
          // 对象处理
          const clone = JSON.parse(JSON.stringify(message));
          this.sanitizeDeep(clone);
          return util.inspect(clone, { depth: null, maxArrayLength: null });
        }
      } catch (e) {
        // 如果对象无法序列化（例如循环引用），则转为字符串
        try {
          return this.sanitizeBase64String(util.inspect(message, { depth: null }));
        } catch (err) {
          return '[无法序列化的对象]';
        }
      }
    }

    // 处理字符串
    if (typeof message === 'string') {
      return this.sanitizeBase64String(message);
    }

    // 处理其他类型
    return this.sanitizeBase64String(String(message));
  }

  /**
   * 递归处理对象中的所有字符串属性
   * @param obj 需要处理的对象
   */
  private sanitizeDeep(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      // 处理数组
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value === 'string') {
          obj[i] = this.sanitizeBase64String(value);
        } else if (value && typeof value === 'object') {
          this.sanitizeDeep(value);
        }
      }
      return;
    }

    // 处理对象
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (this.sensitiveKeyPattern.test(key)) {
        obj[key] = '[REDACTED]';
        continue;
      }
      if (typeof value === 'string') {
        obj[key] = this.sanitizeBase64String(value);
      } else if (value && typeof value === 'object') {
        this.sanitizeDeep(value);
      }
    }
  }

  /**
   * 过滤字符串中的 Base64 数据
   * @param str 需要过滤的字符串
   * @returns 过滤后的字符串
   */
  private sanitizeBase64String(str: string): string {
    if (!str) return str;

    // 1. 过滤 data URL 格式的 Base64
    str = str.replace(/(data:[^;]+;base64,)[a-zA-Z0-9+/=]{20,}/g, '$1***BASE64_DATA***');

    // 2. 过滤常见的 Base64 模式 - 宽松匹配
    // 匹配至少有50个连续的Base64字符的字符串
    str = str.replace(/([a-zA-Z0-9+/=]{50})[a-zA-Z0-9+/=]{10,}/g, '$1***BASE64_DATA***');

    // 3. 特别处理可能在JSON中的Base64（引号包围的）
    str = str.replace(/"([a-zA-Z0-9+/=]{20,})"/g, function (match, p1) {
      // 只处理很可能是Base64的长字符串
      if (p1.length >= 50 && /^[a-zA-Z0-9+/=]+$/.test(p1)) {
        return '"' + p1.substring(0, 20) + '***BASE64_DATA***"';
      }
      return match;
    });

    // 4. 特别处理 url 字段中的 Base64 数据
    str = str.replace(/("url"\s*:\s*")([a-zA-Z0-9+/=]{20,})(")/g, '$1***BASE64_DATA***$3');

    // 5. 对字符串化对象、请求头和查询串中的常见凭证做兜底清洗。
    str = str.replace(
      /((?:authorization|cookie|set-cookie|password|passwd|access[_-]?token|refresh[_-]?token|secret|api[_-]?key|openid|open_id|unionid|union_id)\s*[=:]\s*)([^\s,;&}\]]+)/gi,
      '$1[REDACTED]',
    );
    str = str.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]');
    str = str.replace(
      /([?&](?:access_token|token|secret|api_key|apikey|key|sig|signature|credential|x-amz-[^=&#\s]+|x-goog-[^=&#\s]+)=)[^&#\s]+/gi,
      '$1[REDACTED]',
    );

    // 日志不需要保留外部 URL 的主机、路径或查询串；这些位置经常携带签名、任务 ID 或租户信息。
    str = str.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');
    str = str.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
    str = str.replace(/\b1[3-9]\d{9}\b/g, '[REDACTED_PHONE]');

    return str;
  }

  log(message: any, context?: string) {
    const sanitized = this.sanitizeLogMessage(message);
    super.log(sanitized, context);
  }

  error(message: any, trace?: string, context?: string) {
    const sanitized = this.sanitizeLogMessage(message);
    const sanitizedTrace = trace ? this.sanitizeLogMessage(trace) : trace;
    super.error(sanitized, sanitizedTrace, context);
  }

  warn(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.warn(sanitized, context);
    }
  }

  debug(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.debug(sanitized, context);
    }
  }

  verbose(message: any, context?: string) {
    if (this.isDev) {
      const sanitized = this.sanitizeLogMessage(message);
      super.verbose(sanitized, context);
    }
  }
}
