import { HttpException, HttpStatus } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwtAuth.guard';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('JwtAuthGuard token cache', () => {
  const createContext = (token: string) => {
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
        host: 'api.example.test',
      },
    };

    return {
      request,
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      },
    };
  };

  const createGuard = () => {
    const redisCacheService = {
      getJwtSecret: jest.fn().mockResolvedValue('jwt-secret'),
      checkTokenAuth: jest.fn().mockResolvedValue(true),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(redisCacheService),
    };
    const authService = {
      validateAuthenticatedUser: jest.fn().mockResolvedValue(undefined),
    };
    const guard = new JwtAuthGuard(
      redisCacheService as any,
      moduleRef as any,
      {} as any,
      authService as any,
    );

    return { guard, redisCacheService };
  };

  it('rechecks Redis token validity even when JWT permissions are cached', async () => {
    const { guard, redisCacheService } = createGuard();
    const token = jwt.sign({ id: 34, role: 'user', username: 'alice' }, 'jwt-secret');
    const first = createContext(token);
    const second = createContext(token);

    await expect(guard.canActivate(first.context as any)).resolves.toBe(true);
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledTimes(1);

    redisCacheService.checkTokenAuth.mockRejectedValueOnce(
      new HttpException('您的登录已失效，请重新登录！', HttpStatus.UNAUTHORIZED),
    );

    await expect(guard.canActivate(second.context as any)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(redisCacheService.getJwtSecret).toHaveBeenCalledTimes(1);
    expect(redisCacheService.checkTokenAuth).toHaveBeenCalledTimes(2);
  });
});
