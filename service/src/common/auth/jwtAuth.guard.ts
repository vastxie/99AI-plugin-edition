import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { AuthConfig } from '@/common/config/auth.config';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';

import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private permissionCache = new Map<string, { permissions: any; timestamp: number }>();
  private jwtSecretCache: { secret: string; timestamp: number } | null = null;

  constructor(
    private redisCacheService: RedisCacheService,
    private readonly moduleRef: ModuleRef,
    private readonly globalConfigService: GlobalConfigService,
    private readonly authService: AuthService,
  ) {
    super();
  }

  async canActivate(context) {
    if (!this.redisCacheService) {
      this.redisCacheService = this.moduleRef.get(RedisCacheService, {
        strict: false,
      });
    }
    const request = context.switchToHttp().getRequest();
    // TODO 域名检测
    const _domain = request.headers.host;
    const token = this.extractToken(request);

    // 检查缓存。缓存只复用 JWT 解码结果，token 是否仍有效必须每次查 Redis。
    const cached = this.permissionCache.get(token);
    if (cached && Date.now() - cached.timestamp < AuthConfig.cache.permissionCacheTTL) {
      request.user = cached.permissions;
      await this.authService.validateAuthenticatedUser(request.user);
      await this.redisCacheService.checkTokenAuth(token, request);
      return true;
    }

    // 验证 token
    request.user = await this.validateToken(token);
    await this.authService.validateAuthenticatedUser(request.user);

    // 缓存权限
    this.permissionCache.set(token, {
      permissions: request.user,
      timestamp: Date.now(),
    });

    // 定期清理过期缓存
    if (this.permissionCache.size > 1000) {
      this.cleanupCache();
    }

    await this.redisCacheService.checkTokenAuth(token, request);
    return true;
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.permissionCache.entries()) {
      if (now - value.timestamp > AuthConfig.cache.permissionCacheTTL) {
        this.permissionCache.delete(key);
      }
    }
  }

  private extractToken(request) {
    if (!request.headers.authorization) {
      return null;
    }
    const parts = request.headers.authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    return parts[1];
  }

  private async validateToken(token) {
    try {
      // 获取 JWT 密钥（带缓存）
      const secret = await this.getCachedJwtSecret();
      const decoded = await jwt.verify(token, secret);

      // 如果是游客身份，必须使用新格式 token（id 以 visitor: 开头）并通过 Redis 校验
      if (decoded.role === 'visitor') {
        if (!decoded.id || !String(decoded.id).startsWith('visitor:')) {
          // 旧格式 visitor token（基于 fingerprint 的纯数字 id），拒绝
          throw new HttpException('游客会话格式已升级，请刷新页面。', HttpStatus.UNAUTHORIZED);
        }
        if (!decoded.sid) {
          throw new HttpException('游客会话格式已升级，请刷新页面。', HttpStatus.UNAUTHORIZED);
        }
        const session = await this.redisCacheService.getVisitorSession(String(decoded.sid));
        if (!session || session.visitorId !== String(decoded.id)) {
          throw new HttpException('游客会话已过期，请刷新页面。', HttpStatus.UNAUTHORIZED);
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async getCachedJwtSecret(): Promise<string> {
    const now = Date.now();

    // 检查缓存是否有效
    if (
      this.jwtSecretCache &&
      now - this.jwtSecretCache.timestamp < AuthConfig.cache.jwtSecretCacheTTL
    ) {
      return this.jwtSecretCache.secret;
    }

    // 从 Redis 获取并缓存
    const secret = await this.redisCacheService.getJwtSecret();
    this.jwtSecretCache = {
      secret,
      timestamp: now,
    };

    return secret;
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      Logger.debug(`JWT auth failed: ${err?.message || 'no user'}`, 'JwtAuthGuard');
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
