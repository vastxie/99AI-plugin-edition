import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { AuthConfig } from '@/common/config/auth.config';
import { createRandomUniqueString } from '@/common/utils';
import { createHash } from 'crypto';

export type OneTimeCodeVerification = 'valid' | 'invalid' | 'expired' | 'locked';

export type QrScenePurpose = 'login' | 'bind' | 'oldWechat';

export interface QrSceneState {
  purpose: QrScenePurpose;
  status: 'pending' | 'awaiting_confirmation' | 'confirmed';
  ownerUserId?: number;
  pollTokenHash?: string;
  confirmationCode: string;
  scannerHash?: string;
  result?: Record<string, unknown>;
}

export type QrSceneConsumeResult =
  | { status: 'consumed'; result: Record<string, unknown> }
  | { status: 'pending' | 'expired' | 'invalid' };

export type QrSceneConfirmationResult = 'confirmed' | 'expired' | 'invalid' | 'already-confirmed';

const releaseLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

@Injectable()
export class RedisCacheService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType) {}

  private async deleteTokensForUser(userId: number, tokens: string[]) {
    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;
    const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
    if (!uniqueTokens.length) {
      return;
    }

    const refreshTokens = await Promise.all(
      uniqueTokens.map(token =>
        this.redisClient.get(`${AuthConfig.redis.tokenDataPrefix}${token}:refresh`),
      ),
    );
    const multi = this.redisClient.multi();

    uniqueTokens.forEach((token, index) => {
      multi.zRem(tokenKey, token);
      multi.del(`${AuthConfig.redis.tokenDataPrefix}${token}`);
      multi.del(`${AuthConfig.redis.tokenDataPrefix}${token}:refresh`);
      const refreshToken = refreshTokens[index];
      if (refreshToken) {
        multi.del(`${AuthConfig.redis.refreshTokenPrefix}${refreshToken}`);
      }
    });

    await multi.exec();
  }

  async get(body) {
    const { key } = body;
    return await this.redisClient.get(key);
  }

  async set(body, timeout = 3600) {
    const { key, val } = body;
    if (timeout && timeout > 0) {
      return await this.redisClient.set(key, val, { EX: timeout });
    }
    return await this.redisClient.set(key, val);
  }

  async getJwtSecret(): Promise<string> {
    const secret = await this.redisClient.get('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT secret not found in Redis');
    }

    return secret;
  }

  async ttl(key) {
    return await this.redisClient.ttl(key);
  }

  async del(body) {
    const { key } = body;
    await this.redisClient.del(key);
    return;
  }

  async acquireLock(key: string, ttlSeconds = 10): Promise<string | null> {
    const lockToken = createRandomUniqueString(32);
    const result = await this.redisClient.set(`lock:${key}`, lockToken, {
      EX: ttlSeconds,
      NX: true,
    });
    return result === 'OK' ? lockToken : null;
  }

  async releaseLock(key: string, lockToken: string): Promise<void> {
    await this.redisClient.eval(releaseLockScript, {
      keys: [`lock:${key}`],
      arguments: [lockToken],
    });
  }

  private getQrSceneKey(sceneStr: string): string {
    return `qr:scene:${createHash('sha256').update(sceneStr).digest('hex')}`;
  }

  private getQrConfirmationKey(
    scannerId: string,
    purpose: QrScenePurpose,
    confirmationCode: string,
  ): string {
    const subjectHash = createHash('sha256').update(scannerId).digest('hex');
    const codeHash = createHash('sha256').update(confirmationCode).digest('hex');
    return `qr:confirm:${purpose}:${subjectHash}:${codeHash}`;
  }

  /**
   * 创建一个短时二维码事务。场景值只用于微信二维码，Redis 中只保存其哈希。
   */
  async createQrScene(
    sceneStr: string,
    state: Omit<QrSceneState, 'status' | 'result'>,
    ttlSeconds = 120,
  ): Promise<void> {
    const result = await this.redisClient.set(
      this.getQrSceneKey(sceneStr),
      JSON.stringify({ ...state, status: 'pending' }),
      { EX: ttlSeconds, NX: true },
    );
    if (result !== 'OK') {
      throw new Error('二维码事务创建失败');
    }
  }

  async getQrScene(sceneStr: string): Promise<QrSceneState | null> {
    const raw = await this.redisClient.get(this.getQrSceneKey(sceneStr));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as QrSceneState;
    } catch {
      return null;
    }
  }

  /**
   * 微信扫码只能把 pending 事务推进到待确认状态，并建立“扫码者 + 用途 + 确认码”索引。
   */
  async markQrSceneScanned(
    sceneStr: string,
    purpose: QrScenePurpose,
    scannerId: string,
    result: Record<string, unknown>,
  ): Promise<'scanned' | 'expired' | 'invalid' | 'already-scanned' | 'collision'> {
    const sceneKey = this.getQrSceneKey(sceneStr);
    const scene = await this.getQrScene(sceneStr);
    if (!scene || scene.purpose !== purpose || !scene.confirmationCode) {
      return scene ? 'invalid' : 'expired';
    }
    const scannerHash = createHash('sha256').update(scannerId).digest('hex');
    const confirmationKey = this.getQrConfirmationKey(scannerId, purpose, scene.confirmationCode);
    const state = await this.redisClient.eval(
      `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local data = cjson.decode(raw)
if data.purpose ~= ARGV[1] then return -2 end
if data.status ~= 'pending' then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return -1 end
local existing = redis.call('GET', KEYS[2])
if existing and existing ~= KEYS[1] then return -3 end
data.status = 'awaiting_confirmation'
data.scannerHash = ARGV[2]
data.result = cjson.decode(ARGV[3])
redis.call('SET', KEYS[1], cjson.encode(data))
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('SET', KEYS[2], KEYS[1], 'PX', ttl)
return 1
      `,
      {
        keys: [sceneKey, confirmationKey],
        arguments: [purpose, scannerHash, JSON.stringify(result)],
      },
    );

    if (Number(state) === 1) return 'scanned';
    if (Number(state) === -1) return 'expired';
    if (Number(state) === -2) return 'invalid';
    if (Number(state) === -3) return 'collision';
    return 'already-scanned';
  }

  /**
   * 只有实际扫码者从微信端回复匹配的确认指令后，事务才进入可消费状态。
   */
  async confirmQrScene(
    scannerId: string,
    purpose: QrScenePurpose,
    confirmationCode: string,
  ): Promise<QrSceneConfirmationResult> {
    const scannerHash = createHash('sha256').update(scannerId).digest('hex');
    const confirmationKey = this.getQrConfirmationKey(scannerId, purpose, confirmationCode);
    const state = await this.redisClient.eval(
      `
local sceneKey = redis.call('GET', KEYS[1])
if not sceneKey then return -1 end
local raw = redis.call('GET', sceneKey)
if not raw then
  redis.call('DEL', KEYS[1])
  return -1
end
local data = cjson.decode(raw)
if data.purpose ~= ARGV[1] or data.scannerHash ~= ARGV[2] then return -2 end
if data.status == 'confirmed' then
  return 0
end
if data.status ~= 'awaiting_confirmation' then return -2 end
local ttl = redis.call('PTTL', sceneKey)
if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return -1
end
data.status = 'confirmed'
redis.call('SET', sceneKey, cjson.encode(data))
redis.call('PEXPIRE', sceneKey, ttl)
return 1
      `,
      {
        keys: [confirmationKey],
        arguments: [purpose, scannerHash],
      },
    );

    if (Number(state) === 1) return 'confirmed';
    if (Number(state) === 0) return 'already-confirmed';
    if (Number(state) === -1) return 'expired';
    return 'invalid';
  }

  /**
   * 仅在用途、浏览器密钥和账号归属都匹配时原子读取并删除扫码结果。
   */
  async consumeQrScene(options: {
    sceneStr: string;
    purpose: QrScenePurpose;
    pollTokenHash?: string;
    ownerUserId?: number;
  }): Promise<QrSceneConsumeResult> {
    const { sceneStr, purpose, pollTokenHash, ownerUserId } = options;
    const raw = await this.redisClient.eval(
      `
local value = redis.call('GET', KEYS[1])
if not value then return '__EXPIRED__' end
local data = cjson.decode(value)
if data.purpose ~= ARGV[1] then return '__INVALID__' end
if ARGV[2] ~= '' and (not data.pollTokenHash or data.pollTokenHash ~= ARGV[2]) then
  return '__INVALID__'
end
if ARGV[3] ~= '' and tostring(data.ownerUserId or '') ~= ARGV[3] then
  return '__INVALID__'
end
if data.status ~= 'confirmed' or not data.result then return '__PENDING__' end
redis.call('DEL', KEYS[1])
return cjson.encode(data.result)
      `,
      {
        keys: [this.getQrSceneKey(sceneStr)],
        arguments: [
          purpose,
          pollTokenHash || '',
          ownerUserId === undefined ? '' : String(ownerUserId),
        ],
      },
    );

    if (raw === '__EXPIRED__') return { status: 'expired' };
    if (raw === '__INVALID__') return { status: 'invalid' };
    if (raw === '__PENDING__') return { status: 'pending' };
    if (typeof raw !== 'string') return { status: 'invalid' };
    try {
      return { status: 'consumed', result: JSON.parse(raw) };
    } catch {
      return { status: 'invalid' };
    }
  }

  // /* 登录记录token */
  // async saveToken(userId, token) {
  //   const tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
  //   await this.invalidateTokens(userId, tokens);
  //   this.redisClient.set(`token:${userId}`, token);
  // }

  async saveToken(userId, token, refreshToken?: string, maxDevices?: number) {
    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;

    // 使用传入的maxDevices参数，如果没有传入则使用默认配置
    const deviceLimit = maxDevices || AuthConfig.device.maxDevices;

    // 获取现有tokens
    let tokens = await this.redisClient.zRange(tokenKey, 0, -1);

    // 如果超过设备限制，删除最旧的token
    if (tokens.length >= deviceLimit) {
      const tokensToRemove = tokens.slice(0, tokens.length - deviceLimit + 1);
      await this.deleteTokensForUser(userId, tokensToRemove);
    }

    // 使用事务添加新token和相关数据
    const multi = this.redisClient.multi();

    // 添加token到用户的token集合
    multi.zAdd(tokenKey, [
      {
        score: Date.now(),
        value: token,
      },
    ]);

    // 保存token数据
    multi.setEx(
      `${AuthConfig.redis.tokenDataPrefix}${token}`,
      AuthConfig.redis.tokenTTL,
      JSON.stringify({
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + AuthConfig.redis.tokenTTL * 1000,
      }),
    );

    // 如果有刷新token，保存刷新token
    if (refreshToken) {
      multi.setEx(
        `${AuthConfig.redis.tokenDataPrefix}${token}:refresh`,
        AuthConfig.redis.refreshTokenTTL,
        refreshToken,
      );

      multi.setEx(
        `${AuthConfig.redis.refreshTokenPrefix}${refreshToken}`,
        AuthConfig.redis.refreshTokenTTL,
        JSON.stringify({
          userId,
          accessToken: token,
          createdAt: Date.now(),
          expiresAt: Date.now() + AuthConfig.redis.refreshTokenTTL * 1000,
        }),
      );
    }

    // 设置用户token集合的过期时间
    multi.expire(tokenKey, AuthConfig.redis.tokenTTL);

    await multi.exec();
  }

  /* 移除老的token  */
  async invalidateTokens(userId, tokens) {
    await this.deleteTokensForUser(userId, tokens);
  }

  async invalidateAllUserTokens(userId: number): Promise<void> {
    await this.deleteTokensForUser(userId, await this.getUserTokens(userId));
  }

  /**
   * 删除单个用户token
   */
  async deleteUserToken(userId: number, token: string) {
    await this.deleteTokensForUser(userId, [token]);
  }

  /**
   * 获取用户所有的tokens
   */
  async getUserTokens(userId: number): Promise<string[]> {
    return await this.redisClient.zRange(`${AuthConfig.redis.tokenPrefix}${userId}`, 0, -1);
  }

  /**
   * 刷新Token
   */
  async refreshToken(
    refreshToken: string,
    maxDevices?: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshTokenKey = `${AuthConfig.redis.refreshTokenPrefix}${refreshToken}`;
    const refreshTokenData = await this.redisClient.get(refreshTokenKey);

    if (!refreshTokenData) {
      throw new HttpException('刷新Token无效或已过期', HttpStatus.UNAUTHORIZED);
    }

    const { userId, accessToken: oldAccessToken } = JSON.parse(refreshTokenData);

    // 生成新的access token和refresh token
    const newAccessToken = createRandomUniqueString(32);
    const newRefreshToken = createRandomUniqueString(32);

    // 删除旧的token
    await this.deleteUserToken(userId, oldAccessToken);
    await this.redisClient.del(refreshTokenKey);

    // 保存新的token，使用传入的maxDevices或默认值
    await this.saveToken(userId, newAccessToken, newRefreshToken, maxDevices);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async checkTokenAuth(token, req) {
    const { id: userId, role } = req.user;

    // 游客会话不进入 Redis token 设备管理。
    // 新格式（id 以 "visitor:" 开头）的 session 有效性已在 JwtAuthGuard.validateToken 中校验。
    // 旧格式（纯数字 id）保持无状态兼容。
    if (role === 'visitor') return true;

    const tokenKey = `${AuthConfig.redis.tokenPrefix}${userId}`;
    const tokenDataKey = `${AuthConfig.redis.tokenDataPrefix}${token}`;

    // 使用事务批量获取数据
    const multi = this.redisClient.multi();
    multi.zScore(tokenKey, token);
    multi.get(tokenDataKey);
    multi.ttl(tokenDataKey);

    const results = await multi.exec();
    const tokenScore = results[0];
    const tokenData = results[1];
    const ttl = results[2];

    // 检查token是否存在
    if (tokenScore === null || tokenScore === undefined || !tokenData) {
      Logger.error('当前token不在redis中或已过期，需要重新登录', 'RedisCacheService');
      throw new HttpException(
        '您的登录已失效（可能由于token过期或在其他设备登录），请重新登录！',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 检查token是否即将过期（少于7天），如果是则延长过期时间
    const ttlSeconds = Number(ttl);
    if (ttlSeconds > 0 && ttlSeconds < 7 * 24 * 60 * 60) {
      await this.redisClient.expire(tokenDataKey, AuthConfig.redis.tokenTTL);
    }

    // 更新token最后活跃时间
    await this.redisClient.zAdd(tokenKey, [
      {
        score: Date.now(),
        value: token,
      },
    ]);

    // 清理超过设备限制的旧token
    const tokens = await this.redisClient.zRange(tokenKey, 0, -1);
    const shouldEnforceDeviceLimit = !AuthConfig.device.checkWhitelistRoles.includes(role);
    if (shouldEnforceDeviceLimit && tokens.length > AuthConfig.device.maxDevices) {
      const tokensToRemove = tokens.slice(0, tokens.length - AuthConfig.device.maxDevices);
      await this.deleteTokensForUser(userId, tokensToRemove);
    }

    return true;
  }

  /**
   * 使用 SCAN 命令获取匹配的键，替代 KEYS 命令以避免阻塞
   * @param pattern 匹配模式
   * @param count 每次扫描的数量，默认 100
   */
  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    const keys: string[] = [];
    let cursor = 0;

    try {
      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: count,
        });

        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      return keys;
    } catch (error) {
      Logger.error(
        `扫描键失败 (${pattern}): ${error.message || error}`,
        error?.stack,
        'RedisCacheService',
      );
      return [];
    }
  }

  /**
   * 批量获取多个键的值
   * @param keys 要获取的键数组
   */
  async mget(keys: string[]): Promise<Array<string | null>> {
    try {
      return await this.redisClient.mGet(keys);
    } catch (error) {
      Logger.error(`批量获取键失败: ${error.message || error}`, error?.stack, 'RedisCacheService');
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * 批量设置多个键值对
   * @param pairs 键值对对象
   * @param ttl 过期时间（秒），可选
   */
  async mset(pairs: Record<string, string>, ttl?: number): Promise<void> {
    try {
      const pipeline = this.redisClient.multi();

      Object.entries(pairs).forEach(([key, value]) => {
        if (ttl) {
          pipeline.setEx(key, ttl, value);
        } else {
          pipeline.set(key, value);
        }
      });

      await pipeline.exec();
    } catch (error) {
      Logger.error(
        `批量设置键值失败: ${error.message || error}`,
        error?.stack,
        'RedisCacheService',
      );
      throw error;
    }
  }

  /**
   * 获取 Redis 的基本统计信息，用于监控
   */
  async getRedisStats(): Promise<any> {
    try {
      const info = await this.redisClient.info();
      const memory = await this.redisClient.info('memory');
      const stats = await this.redisClient.info('stats');

      return {
        connected: true,
        memory: this.parseRedisInfo(memory),
        stats: this.parseRedisInfo(stats),
        uptime: this.parseRedisInfo(info).uptime_in_seconds,
      };
    } catch (error) {
      Logger.error(
        `获取Redis统计失败: ${error.message || error}`,
        error?.stack,
        'RedisCacheService',
      );
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * 解析 Redis INFO 命令返回的信息
   * @param info Redis INFO 输出
   */
  private parseRedisInfo(info: string): Record<string, any> {
    const result = {};
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    });
    return result;
  }

  /**
   * 检查 Redis 连接状态
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      Logger.error(`Redis ping失败: ${error.message || error}`, error?.stack, 'RedisCacheService');
      return false;
    }
  }

  /**
   * 获取数据库大小
   */
  async dbSize(): Promise<number> {
    try {
      return await this.redisClient.dbSize();
    } catch (error) {
      Logger.error(
        `获取数据库大小失败: ${error.message || error}`,
        error?.stack,
        'RedisCacheService',
      );
      return 0;
    }
  }

  /**
   * 原子递增并设置过期时间（首次创建时）
   */
  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.redisClient.eval(
      `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
      `,
      {
        keys: [key],
        arguments: [String(ttlSeconds)],
      },
    );
    return Number(count);
  }

  private getOneTimeCodeAttemptKey(codeKey: string): string {
    return `otp:attempts:${createHash('sha256').update(codeKey).digest('hex')}`;
  }

  async storeOneTimeCode(
    codeKey: string,
    code: string | number,
    ttlSeconds: number,
  ): Promise<void> {
    const multi = this.redisClient.multi();
    multi.setEx(codeKey, ttlSeconds, String(code));
    multi.del(this.getOneTimeCodeAttemptKey(codeKey));
    await multi.exec();
  }

  /** 原子校验验证码；达到失败上限后立即作废。 */
  async verifyOneTimeCode(
    codeKey: string,
    suppliedCode: string,
    options: { consumeOnSuccess?: boolean; maxAttempts?: number } = {},
  ): Promise<OneTimeCodeVerification> {
    const result = await this.redisClient.eval(
      `
local expected = redis.call('GET', KEYS[1])
if not expected then
  redis.call('DEL', KEYS[2])
  return -1
end

local attempts = tonumber(redis.call('GET', KEYS[2]) or '0')
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return -2
end

if expected == ARGV[1] then
  if ARGV[3] == '1' then redis.call('DEL', KEYS[1]) end
  redis.call('DEL', KEYS[2])
  return 1
end

attempts = redis.call('INCR', KEYS[2])
local ttl = redis.call('TTL', KEYS[1])
redis.call('EXPIRE', KEYS[2], ttl > 0 and ttl or 600)
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return -2
end
return 0
      `,
      {
        keys: [codeKey, this.getOneTimeCodeAttemptKey(codeKey)],
        arguments: [
          String(suppliedCode),
          String(options.maxAttempts ?? 5),
          options.consumeOnSuccess === false ? '0' : '1',
        ],
      },
    );

    if (Number(result) === 1) return 'valid';
    if (Number(result) === -1) return 'expired';
    if (Number(result) === -2) return 'locked';
    return 'invalid';
  }

  async saveVisitorSession(
    sessionId: string,
    metadata: { visitorId: string; subjectId: string; ipHash: string; createdAt: string },
  ): Promise<void> {
    await this.redisClient.setEx(
      `visitor:session:${sessionId}`,
      AuthConfig.redis.tokenTTL,
      JSON.stringify(metadata),
    );
  }

  async getVisitorSession(sessionId: string): Promise<{
    visitorId: string;
    subjectId: string;
    ipHash: string;
    createdAt: string;
  } | null> {
    const raw = await this.redisClient.get(`visitor:session:${sessionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * 同时执行稳定游客主体额度与 IP 影子额度检查，避免并发超扣和会话轮换重置。
   */
  async consumeVisitorQuota(options: {
    subjectId: string;
    ipHash: string;
    quotaType: string;
    amount: number;
    limit: number;
    dateKey: string;
    ttlSeconds: number;
  }): Promise<'ok' | 'subject-limit' | 'ip-limit'> {
    const { subjectId, ipHash, quotaType, amount, limit, dateKey, ttlSeconds } = options;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(limit) || limit < 0) {
      throw new Error('Invalid visitor quota arguments');
    }

    const subjectKey = `visitor:quota:subject:${dateKey}:${subjectId}:${quotaType}`;
    const ipKey = `visitor:quota:ip:${dateKey}:${ipHash}:${quotaType}`;
    const result = await this.redisClient.eval(
      `
local subjectCurrent = tonumber(redis.call('GET', KEYS[1]) or '0')
local ipCurrent = tonumber(redis.call('GET', KEYS[2]) or '0')
local amount = tonumber(ARGV[1])
local subjectLimit = tonumber(ARGV[2])
local ipLimit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

if subjectCurrent + amount > subjectLimit then return -1 end
if ipCurrent + amount > ipLimit then return -2 end

redis.call('SET', KEYS[1], subjectCurrent + amount, 'EX', ttl)
redis.call('SET', KEYS[2], ipCurrent + amount, 'EX', ttl)
return 1
      `,
      {
        keys: [subjectKey, ipKey],
        arguments: [String(amount), String(limit), String(limit * 5), String(ttlSeconds)],
      },
    );

    if (Number(result) === -1) return 'subject-limit';
    if (Number(result) === -2) return 'ip-limit';
    return 'ok';
  }

  /**
   * 获取内存使用情况
   */
  async getMemoryUsage(): Promise<{ used: number; peak: number; fragmentation: number }> {
    try {
      const memory = await this.redisClient.info('memory');
      const parsed = this.parseRedisInfo(memory);

      return {
        used: parsed.used_memory || 0,
        peak: parsed.used_memory_peak || 0,
        fragmentation: parsed.mem_fragmentation_ratio || 0,
      };
    } catch (error) {
      Logger.error(
        `获取内存使用量失败: ${error.message || error}`,
        error?.stack,
        'RedisCacheService',
      );
      return { used: 0, peak: 0, fragmentation: 0 };
    }
  }
}
