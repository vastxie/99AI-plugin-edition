import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';
import { createHash } from 'crypto';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('RateLimitMiddleware', () => {
  const response = () => {
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  };

  it('matches nested API routes with the global ** rule', async () => {
    const redis = { incrWithExpire: jest.fn().mockResolvedValue(1) };
    const service = new RateLimitService();
    const middleware = new RateLimitMiddleware(redis as any, service);
    const next = jest.fn();

    await middleware.use(
      { path: '/api/deep/nested/path', ip: '127.0.0.1', socket: {} } as any,
      response(),
      next,
    );

    expect(redis.incrWithExpire).toHaveBeenCalledWith(
      `rate-limit:/api/**:${createHash('sha256').update('127.0.0.1').digest('hex')}`,
      3600,
    );
    expect(redis.incrWithExpire.mock.calls[0][0]).not.toContain('127.0.0.1');
    expect(next).toHaveBeenCalled();
  });

  it('fails closed when Redis protection is unavailable on an auth route', async () => {
    const redis = { incrWithExpire: jest.fn().mockRejectedValue(new Error('redis down')) };
    const middleware = new RateLimitMiddleware(redis as any, new RateLimitService());
    const res = response();
    const next = jest.fn();

    await middleware.use(
      { path: '/api/auth/resetPassword', ip: '127.0.0.1', socket: {} } as any,
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
