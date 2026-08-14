import { HttpStatus } from '@nestjs/common';
import { OfficialService } from './official.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OfficialService QR transaction security', () => {
  const createService = () => {
    const userService = {
      bindWx: jest.fn(),
      getUserById: jest.fn(),
      getUserOpenId: jest.fn(),
      getUserFromOpenId: jest.fn(),
      migrateWechatOpenId: jest.fn(),
    };
    const authService = { loginByOpenId: jest.fn() };
    const globalConfigService = { getConfigs: jest.fn() };
    const redisCacheService = {
      createQrScene: jest.fn(),
      getQrScene: jest.fn(),
      markQrSceneScanned: jest.fn(),
      confirmQrScene: jest.fn(),
      consumeQrScene: jest.fn(),
    };
    const service = new OfficialService(
      {} as any,
      userService as any,
      authService as any,
      globalConfigService as any,
      {} as any,
      redisCacheService as any,
    );
    return { service, userService, authService, globalConfigService, redisCacheService };
  };

  it('binds an anonymous login QR to a separate browser poll token', async () => {
    const { service, redisCacheService } = createService();

    const result = await service.getQRSceneStr();

    expect(result.sceneStr).toHaveLength(32);
    expect(result.pollToken).toHaveLength(48);
    expect(result.confirmationCode).toMatch(/^\d{6}$/);
    expect(redisCacheService.createQrScene).toHaveBeenCalledWith(
      result.sceneStr,
      {
        purpose: 'login',
        pollTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        confirmationCode: expect.stringMatching(/^\d{6}$/),
      },
      120,
    );
    expect(redisCacheService.createQrScene.mock.calls[0][1].pollTokenHash).not.toBe(
      result.pollToken,
    );
  });

  it('rejects polling with a token that does not belong to the QR transaction', async () => {
    const { service, redisCacheService } = createService();
    redisCacheService.consumeQrScene.mockResolvedValueOnce({ status: 'invalid' });

    await expect(
      service.loginBySceneStr({} as any, { sceneStr: 'scene', pollToken: 'x'.repeat(48) }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    expect(redisCacheService.consumeQrScene).toHaveBeenCalledWith({
      sceneStr: 'scene',
      purpose: 'login',
      pollTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('returns a browser-visible pairing code for authenticated bind QR transactions', async () => {
    const { service, redisCacheService } = createService();

    const result = await service.getQRSceneStrByBind({ user: { id: 7 } });

    expect(result.sceneStr).toMatch(/\/bind$/);
    expect(result.confirmationCode).toMatch(/^\d{6}$/);
    expect(redisCacheService.createQrScene).toHaveBeenCalledWith(
      result.sceneStr,
      {
        purpose: 'bind',
        ownerUserId: 7,
        confirmationCode: result.confirmationCode,
      },
      120,
    );
  });

  it('does not bind an account during the unauthenticated WeChat callback', async () => {
    const { service, userService, redisCacheService } = createService();
    redisCacheService.getQrScene.mockResolvedValueOnce({
      purpose: 'bind',
      status: 'pending',
      ownerUserId: 7,
      confirmationCode: '123456',
    });
    redisCacheService.markQrSceneScanned.mockResolvedValueOnce('scanned');
    userService.getUserById.mockResolvedValueOnce({ id: 7, username: 'alice' });
    jest
      .spyOn(service, 'getUserInfoFromWechat')
      .mockResolvedValueOnce({ unionid: 'union-private' });

    await expect(service.scanBindWx('openid-private', 'scene/bind')).resolves.toEqual({
      status: true,
      prompt: expect.stringContaining('确认绑定 123456'),
    });

    expect(userService.bindWx).not.toHaveBeenCalled();
    expect(redisCacheService.markQrSceneScanned).toHaveBeenCalledWith(
      'scene/bind',
      'bind',
      'openid-private',
      {
        openId: 'openid-private',
        unionId: 'union-private',
      },
    );
  });

  it('binds only after the authenticated owner consumes the QR result', async () => {
    const { service, userService, redisCacheService } = createService();
    redisCacheService.consumeQrScene.mockResolvedValueOnce({
      status: 'consumed',
      result: { openId: 'openid-private', unionId: 'union-private' },
    });
    userService.bindWx.mockResolvedValueOnce({ status: true, msg: 'ok' });

    await expect(
      service.bindWxBySceneStr({ user: { id: 7 } } as any, 'scene/bind'),
    ).resolves.toEqual({ status: true, msg: 'ok' });

    expect(redisCacheService.consumeQrScene).toHaveBeenCalledWith({
      sceneStr: 'scene/bind',
      purpose: 'bind',
      ownerUserId: 7,
    });
    expect(userService.bindWx).toHaveBeenCalledWith('openid-private', 7, 'union-private');
  });

  it('requires the scanner to confirm a QR action from the same WeChat identity', async () => {
    const { service, redisCacheService } = createService();
    redisCacheService.confirmQrScene.mockResolvedValueOnce('confirmed');

    await expect(service.confirmQrAction('openid-private', '确认绑定 123456')).resolves.toBe(
      '绑定已确认，请返回浏览器。',
    );

    expect(redisCacheService.confirmQrScene).toHaveBeenCalledWith(
      'openid-private',
      'bind',
      '123456',
    );
  });

  it('does not create or update a user before the scanner explicitly confirms login', async () => {
    const { service, userService, redisCacheService } = createService();
    redisCacheService.getQrScene.mockResolvedValueOnce({
      purpose: 'login',
      status: 'pending',
      confirmationCode: '123456',
    });
    redisCacheService.markQrSceneScanned.mockResolvedValueOnce('scanned');

    await expect(service.scan('openid-private', 'scene-login')).resolves.toContain(
      '确认登录 123456',
    );

    expect(userService.getUserFromOpenId).not.toHaveBeenCalled();
    expect(redisCacheService.markQrSceneScanned).toHaveBeenCalledWith(
      'scene-login',
      'login',
      'openid-private',
      { openId: 'openid-private' },
    );
  });

  it('resolves the scanner identity only after a confirmed login QR is consumed', async () => {
    const { service, userService, authService, redisCacheService } = createService();
    redisCacheService.consumeQrScene.mockResolvedValueOnce({
      status: 'consumed',
      result: { openId: 'openid-private' },
    });
    jest.spyOn(service, 'getUserInfoFromWechat').mockResolvedValueOnce({
      unionid: 'union-private',
    });
    userService.getUserFromOpenId.mockResolvedValueOnce({ id: 7 });
    authService.loginByOpenId.mockResolvedValueOnce('jwt-result');

    await expect(
      service.loginBySceneStr({} as any, {
        sceneStr: 'scene-login',
        pollToken: 'p'.repeat(48),
      }),
    ).resolves.toBe('jwt-result');

    expect(userService.getUserFromOpenId).toHaveBeenCalledWith(
      'openid-private',
      undefined,
      'union-private',
    );
  });

  it('does not treat ordinary公众号 text as a QR confirmation', async () => {
    const { service, redisCacheService } = createService();

    await expect(service.confirmQrAction('openid-private', '你好')).resolves.toBeNull();
    expect(redisCacheService.confirmQrScene).not.toHaveBeenCalled();
  });

  it('fails closed when the WeChat callback token is not configured', async () => {
    const { service, globalConfigService } = createService();
    globalConfigService.getConfigs.mockResolvedValueOnce('');
    const forgedEmptyTokenSignature = service.sha1(['', 'nonce', '123456'].sort().join(''));

    await expect(service.verify(forgedEmptyTokenSignature, 'nonce', '123456')).resolves.toBe(
      false,
    );
  });

  it('accepts only a well-formed callback signed with the configured token', async () => {
    const { service, globalConfigService } = createService();
    globalConfigService.getConfigs.mockResolvedValueOnce('configured-secret-token');
    const signature = service.sha1(
      ['configured-secret-token', 'nonce', '123456'].sort().join(''),
    );

    await expect(service.verify(signature, 'nonce', '123456')).resolves.toBe(true);
  });

  it('rejects an old-account QR ticket owned by another user', async () => {
    const { service, redisCacheService, globalConfigService } = createService();
    redisCacheService.getQrScene.mockResolvedValueOnce({
      purpose: 'oldWechat',
      status: 'pending',
      ownerUserId: 11,
      confirmationCode: '123456',
    });

    await expect(service.getOldQRCodeTicket('scene#old', 12)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(globalConfigService.getConfigs).not.toHaveBeenCalled();
  });
});
