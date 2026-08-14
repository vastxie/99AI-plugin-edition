import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AuthService.updatePassword', () => {
  const createService = () => {
    const userService = {
      verifyUserPassword: jest.fn(),
      updateUserPassword: jest.fn(),
    };
    const redisCacheService = {
      getUserTokens: jest.fn(),
      invalidateTokens: jest.fn(),
    };
    const service = new AuthService(
      {} as any,
      userService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      redisCacheService as any,
      {} as any,
    );

    return { service, userService, redisCacheService };
  };

  const req = { user: { id: 34, client: 0 } } as any;

  it('rejects password changes when the old password is invalid', async () => {
    const { service, userService, redisCacheService } = createService();
    userService.verifyUserPassword.mockResolvedValueOnce(false);

    await expect(
      service.updatePassword(req, { oldPassword: 'wrong-password', password: 'new-password' }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(userService.verifyUserPassword).toHaveBeenCalledWith(34, 'wrong-password');
    expect(userService.updateUserPassword).not.toHaveBeenCalled();
    expect(redisCacheService.invalidateTokens).not.toHaveBeenCalled();
  });

  it('updates password and invalidates all user tokens after old password verification', async () => {
    const { service, userService, redisCacheService } = createService();
    userService.verifyUserPassword.mockResolvedValueOnce(true);
    userService.updateUserPassword.mockResolvedValueOnce(undefined);
    redisCacheService.getUserTokens.mockResolvedValueOnce(['token-a', 'token-b']);
    redisCacheService.invalidateTokens.mockResolvedValueOnce(undefined);

    await expect(
      service.updatePassword(req, { oldPassword: 'old-password', password: 'new-password' }),
    ).resolves.toBe('密码修改成功');

    expect(userService.verifyUserPassword).toHaveBeenCalledWith(34, 'old-password');
    expect(userService.updateUserPassword).toHaveBeenCalledWith(34, 'new-password');
    expect(redisCacheService.getUserTokens).toHaveBeenCalledWith(34);
    expect(redisCacheService.invalidateTokens).toHaveBeenCalledWith(34, ['token-a', 'token-b']);
  });

  it('awaits password update before invalidating tokens', async () => {
    const { service, userService, redisCacheService } = createService();
    const updateError = new Error('update failed');
    userService.verifyUserPassword.mockResolvedValueOnce(true);
    userService.updateUserPassword.mockRejectedValueOnce(updateError);

    await expect(
      service.updatePassword(req, { oldPassword: 'old-password', password: 'new-password' }),
    ).rejects.toBe(updateError);

    expect(redisCacheService.getUserTokens).not.toHaveBeenCalled();
    expect(redisCacheService.invalidateTokens).not.toHaveBeenCalled();
  });
});
