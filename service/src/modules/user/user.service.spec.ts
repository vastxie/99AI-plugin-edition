import { BadRequestException, HttpException, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { UpdateUserDto } from './dto/updateUser.dto';
import { UserService } from './user.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UserService.updateInfo', () => {
  const createService = () => {
    const userEntity = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const userBalanceService = {
      addBalanceToNewUser: jest.fn().mockResolvedValue(undefined),
    };
    const redisCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      transaction: jest.fn(),
    };
    const service = new UserService(
      userEntity as any,
      connection as any,
      userBalanceService as any,
      {} as any,
      {} as any,
      {} as any,
      redisCacheService as any,
      {} as any,
    );

    return { service, userEntity, userBalanceService, redisCacheService, connection };
  };

  const req = { user: { id: 34, role: 'viewer' } } as Request;

  it('rejects forbidden profile fields at the DTO validation layer', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          nickname: 'safeName',
          role: 'super',
          status: 1,
          openId: 'evil-openid',
          unionId: 'evil-unionid',
        },
        { type: 'body', metatype: UpdateUserDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only updates explicit safe profile fields even if forbidden fields reach the service', async () => {
    const { service, userEntity } = createService();
    userEntity.findOne.mockResolvedValueOnce({
      id: 34,
      username: 'viewer34',
      nickname: 'oldName',
    });
    userEntity.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.updateInfo(
        {
          nickname: 'newName',
          role: 'super',
          status: 1,
          openId: 'evil-openid',
          unionId: 'evil-unionid',
        } as any,
        req,
      ),
    ).resolves.toBe('修改用户昵称成功！');

    expect(userEntity.update).toHaveBeenCalledWith({ id: 34 }, { nickname: 'newName' });
  });

  it('rejects requests that contain no safe profile fields', async () => {
    const { service, userEntity } = createService();

    await expect(
      service.updateInfo(
        {
          role: 'super',
          status: 1,
          openId: 'evil-openid',
          unionId: 'evil-unionid',
        } as any,
        req,
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(userEntity.update).not.toHaveBeenCalled();
  });

  it('returns false when verifying an empty password without querying bcrypt', async () => {
    const { service, userEntity } = createService();

    await expect(service.verifyUserPassword(34, '')).resolves.toBe(false);
    expect(userEntity.findOne).not.toHaveBeenCalled();
  });

  it('returns false when verifying a password for a missing user', async () => {
    const { service, userEntity } = createService();
    userEntity.findOne.mockResolvedValueOnce(null);

    await expect(service.verifyUserPassword(34, 'old-password')).resolves.toBe(false);
  });

  it('verifies the stored password hash when user and password are present', async () => {
    const { service, userEntity } = createService();
    const passwordHash = bcrypt.hashSync('old-password', 5);
    userEntity.findOne.mockResolvedValue({ id: 34, password: passwordHash });

    await expect(service.verifyUserPassword(34, 'old-password')).resolves.toBe(true);
    await expect(service.verifyUserPassword(34, 'wrong-password')).resolves.toBe(false);
  });

  it('moves both WeChat identifiers in one pessimistically locked transaction', async () => {
    const { service, connection, redisCacheService } = createService();
    const repository = {
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 7, openId: 'old-openid', unionId: 'old-unionid' },
        { id: 34, openId: 'current-openid', unionId: 'current-unionid' },
      ]),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository.update.mockResolvedValue({ affected: 1 });
    connection.transaction.mockImplementation(async callback =>
      callback({ getRepository: jest.fn().mockReturnValue(repository) }),
    );

    await expect(
      service.migrateWechatOpenId({
        oldUserId: 7,
        currentUserId: 34,
        expectedOldOpenId: 'old-openid',
        expectedCurrentOpenId: 'current-openid',
      }),
    ).resolves.toEqual({ status: true, msg: '账号迁移成功' });

    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(repository.update).toHaveBeenNthCalledWith(
      1,
      { id: 34, openId: 'current-openid' },
      { openId: null, unionId: null },
    );
    expect(repository.update).toHaveBeenNthCalledWith(
      2,
      { id: 7, openId: 'old-openid' },
      { openId: 'current-openid', unionId: 'current-unionid' },
    );
    expect(redisCacheService.del).toHaveBeenCalledTimes(4);
  });

  it('rejects same-account WeChat migration before opening a transaction', async () => {
    const { service, connection } = createService();

    await expect(
      service.migrateWechatOpenId({
        oldUserId: 7,
        currentUserId: 7,
        expectedOldOpenId: 'old-openid',
        expectedCurrentOpenId: 'current-openid',
      }),
    ).resolves.toEqual({ status: false, msg: '迁移账号状态无效，请重新发起迁移' });
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('rechecks a WeChat identity under a Redis lock before creating a user', async () => {
    const { service, userEntity, userBalanceService, redisCacheService } = createService();
    const existingUser = { id: 51, openId: 'openid', unionId: 'unionid' };
    userEntity.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser);

    await expect(service.getUserFromOpenId('openid', undefined, 'unionid')).resolves.toBe(
      existingUser,
    );

    expect(redisCacheService.acquireLock).toHaveBeenCalledWith(
      expect.stringMatching(/^wechat-user:[a-f0-9]{64}$/),
      120,
    );
    expect(redisCacheService.acquireLock).toHaveBeenCalledTimes(2);
    expect(userEntity.save).not.toHaveBeenCalled();
    expect(userBalanceService.addBalanceToNewUser).not.toHaveBeenCalled();
    expect(redisCacheService.releaseLock).toHaveBeenCalledWith(
      expect.stringMatching(/^wechat-user:[a-f0-9]{64}$/),
      'lock-token',
    );
    expect(redisCacheService.releaseLock).toHaveBeenCalledTimes(2);
  });
});
