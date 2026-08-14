import { AuthConfig } from '@/common/config/auth.config';
import { RedisCacheService } from './redisCache.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('RedisCacheService token invalidation', () => {
  const createService = () => {
    const multi = {
      zScore: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      ttl: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      zRem: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      setEx: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(undefined),
    };
    const redisClient = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      zAdd: jest.fn().mockResolvedValue(undefined),
      zRange: jest.fn().mockResolvedValue([]),
      multi: jest.fn(() => multi),
    };
    const service = new RedisCacheService(redisClient as any);

    return { service, redisClient, multi };
  };

  it('removes access token data and refresh token reverse indexes for all invalidated tokens', async () => {
    const { service, redisClient, multi } = createService();
    redisClient.get.mockImplementation((key: string) => {
      if (key === `${AuthConfig.redis.tokenDataPrefix}token-a:refresh`) {
        return Promise.resolve('refresh-a');
      }
      return Promise.resolve(null);
    });

    await service.invalidateTokens(34, ['token-a', 'token-b']);

    expect(redisClient.get).toHaveBeenCalledWith(
      `${AuthConfig.redis.tokenDataPrefix}token-a:refresh`,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      `${AuthConfig.redis.tokenDataPrefix}token-b:refresh`,
    );
    expect(multi.zRem).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 'token-a');
    expect(multi.zRem).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 'token-b');
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}token-a`);
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}token-a:refresh`);
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.refreshTokenPrefix}refresh-a`);
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}token-b`);
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}token-b:refresh`);
    expect(multi.exec).toHaveBeenCalled();
  });

  it('removes the refresh token reverse index when deleting a single user token', async () => {
    const { service, redisClient, multi } = createService();
    redisClient.get.mockResolvedValueOnce('refresh-current');

    await service.deleteUserToken(34, 'current-token');

    expect(redisClient.get).toHaveBeenCalledWith(
      `${AuthConfig.redis.tokenDataPrefix}current-token:refresh`,
    );
    expect(multi.zRem).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 'current-token');
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}current-token`);
    expect(multi.del).toHaveBeenCalledWith(
      `${AuthConfig.redis.tokenDataPrefix}current-token:refresh`,
    );
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.refreshTokenPrefix}refresh-current`);
    expect(multi.exec).toHaveBeenCalled();
  });

  it('rejects super role tokens that no longer exist in Redis', async () => {
    const { service, redisClient, multi } = createService();
    multi.exec.mockResolvedValueOnce([null, null, -2]);

    await expect(
      service.checkTokenAuth('removed-token', { user: { id: 34, role: 'super' } }),
    ).rejects.toMatchObject({
      status: 401,
    });

    expect(multi.zScore).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 'removed-token');
    expect(multi.get).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}removed-token`);
    expect(redisClient.zAdd).not.toHaveBeenCalled();
  });

  it('keeps super token existence checks but skips device-limit cleanup', async () => {
    const { service, redisClient, multi } = createService();
    multi.exec.mockResolvedValueOnce([Date.now(), JSON.stringify({ userId: 34 }), 3600]);
    redisClient.zRange.mockResolvedValueOnce(['token-a', 'token-b', 'token-c', 'token-d']);

    await expect(
      service.checkTokenAuth('token-a', { user: { id: 34, role: 'super' } }),
    ).resolves.toBe(true);

    expect(redisClient.zAdd).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, [
      {
        score: expect.any(Number),
        value: 'token-a',
      },
    ]);
    expect(redisClient.zRange).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 0, -1);
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(multi.zRem).not.toHaveBeenCalled();
  });

  it('cleans excess regular-user tokens through the unified token deletion path', async () => {
    const { service, redisClient, multi } = createService();
    multi.exec.mockResolvedValueOnce([Date.now(), JSON.stringify({ userId: 34 }), 3600]);
    redisClient.zRange.mockResolvedValueOnce(['old-token', 'token-a', 'token-b', 'token-c']);
    redisClient.get.mockResolvedValueOnce('old-refresh-token');

    await expect(
      service.checkTokenAuth('token-c', { user: { id: 34, role: 'user' } }),
    ).resolves.toBe(true);

    expect(redisClient.get).toHaveBeenCalledWith(
      `${AuthConfig.redis.tokenDataPrefix}old-token:refresh`,
    );
    expect(multi.zRem).toHaveBeenCalledWith(`${AuthConfig.redis.tokenPrefix}34`, 'old-token');
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}old-token`);
    expect(multi.del).toHaveBeenCalledWith(`${AuthConfig.redis.tokenDataPrefix}old-token:refresh`);
    expect(multi.del).toHaveBeenCalledWith(
      `${AuthConfig.redis.refreshTokenPrefix}old-refresh-token`,
    );
  });

  it('increments rate-limit keys and sets first expiry in one Redis script', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce(3);

    await expect(service.incrWithExpire('rate-limit:/api:127.0.0.1', 60)).resolves.toBe(3);

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), {
      keys: ['rate-limit:/api:127.0.0.1'],
      arguments: ['60'],
    });
  });

  it('releases a distributed lock only when its random token still matches', async () => {
    const { service, redisClient } = createService();
    redisClient.set.mockResolvedValueOnce('OK');

    const token = await service.acquireLock('wechat-user:subject', 10);
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(redisClient.set).toHaveBeenCalledWith('lock:wechat-user:subject', token, {
      EX: 10,
      NX: true,
    });

    await service.releaseLock('wechat-user:subject', token);
    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET'"), {
      keys: ['lock:wechat-user:subject'],
      arguments: [token],
    });
  });

  it('verifies OTPs through one atomic Redis script and maps lock responses', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce(-2);

    await expect(
      service.verifyOneTimeCode('resetCode:contact', '123456', {
        consumeOnSuccess: true,
        maxAttempts: 5,
      }),
    ).resolves.toBe('locked');

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('INCR'"), {
      keys: ['resetCode:contact', expect.stringMatching(/^otp:attempts:[a-f0-9]{64}$/)],
      arguments: ['123456', '5', '1'],
    });
  });

  it('consumes visitor subject and IP quota in one atomic script', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce(1);

    await expect(
      service.consumeVisitorQuota({
        subjectId: 'subject-a',
        ipHash: 'ip-a',
        quotaType: 'model3Count',
        amount: 1,
        limit: 3,
        dateKey: '2026-08-12',
        ttlSeconds: 3600,
      }),
    ).resolves.toBe('ok');

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining('subjectCurrent'), {
      keys: [
        'visitor:quota:subject:2026-08-12:subject-a:model3Count',
        'visitor:quota:ip:2026-08-12:ip-a:model3Count',
      ],
      arguments: ['1', '3', '15', '3600'],
    });
  });

  it('stores QR scenes under a hash with a short TTL and NX semantics', async () => {
    const { service, redisClient } = createService();

    await service.createQrScene(
      'browser-visible-scene',
      { purpose: 'login', pollTokenHash: 'poll-hash', confirmationCode: '123456' },
      120,
    );

    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringMatching(/^qr:scene:[a-f0-9]{64}$/),
      JSON.stringify({
        purpose: 'login',
        pollTokenHash: 'poll-hash',
        confirmationCode: '123456',
        status: 'pending',
      }),
      { EX: 120, NX: true },
    );
    expect(redisClient.set.mock.calls[0][0]).not.toContain('browser-visible-scene');
  });

  it('moves a scanned QR to awaiting confirmation without exposing the scanner identity in keys', async () => {
    const { service, redisClient } = createService();
    redisClient.get.mockResolvedValueOnce(
      JSON.stringify({ purpose: 'login', status: 'pending', confirmationCode: '123456' }),
    );
    redisClient.eval.mockResolvedValueOnce(1);

    await expect(
      service.markQrSceneScanned('scene-a', 'login', 'openid-private', { userId: 7 }),
    ).resolves.toBe('scanned');

    const evalOptions = redisClient.eval.mock.calls[0][1];
    expect(evalOptions.keys).toHaveLength(2);
    expect(evalOptions.keys.join(':')).not.toContain('openid-private');
    expect(evalOptions.keys.join(':')).not.toContain('123456');
    expect(evalOptions.arguments[0]).toBe('login');
  });

  it('confirms a QR only through the scanner-bound confirmation index', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce(1);

    await expect(service.confirmQrScene('openid-private', 'login', '123456')).resolves.toBe(
      'confirmed',
    );

    const evalOptions = redisClient.eval.mock.calls[0][1];
    expect(evalOptions.keys[0]).toMatch(/^qr:confirm:login:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(evalOptions.keys[0]).not.toContain('openid-private');
    expect(evalOptions.keys[0]).not.toContain('123456');
  });

  it('does not consume a QR scene when the browser poll token is invalid', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce('__INVALID__');

    await expect(
      service.consumeQrScene({
        sceneStr: 'scene-a',
        purpose: 'login',
        pollTokenHash: 'wrong-token-hash',
      }),
    ).resolves.toEqual({ status: 'invalid' });

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('DEL'"), {
      keys: [expect.stringMatching(/^qr:scene:[a-f0-9]{64}$/)],
      arguments: ['login', 'wrong-token-hash', ''],
    });
  });

  it('atomically returns and deletes a scanned QR result for the matching owner', async () => {
    const { service, redisClient } = createService();
    redisClient.eval.mockResolvedValueOnce(JSON.stringify({ openId: 'openid-private' }));

    await expect(
      service.consumeQrScene({ sceneStr: 'scene-bind', purpose: 'bind', ownerUserId: 7 }),
    ).resolves.toEqual({ status: 'consumed', result: { openId: 'openid-private' } });

    expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('DEL'"), {
      keys: [expect.stringMatching(/^qr:scene:[a-f0-9]{64}$/)],
      arguments: ['bind', '', '7'],
    });
  });
});
