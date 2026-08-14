import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwtAuth.guard';

@Injectable()
export class SuperAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 如果已经有用户信息（由 JwtAuthGuard 设置），直接检查角色
    if (request.user) {
      if (request.user.role === 'super') {
        return true;
      } else {
        throw new UnauthorizedException('非法操作、非超级管理员无权操作！');
      }
    }

    // 否则调用父类的 canActivate
    const isAuthorized = await super.canActivate(context);
    if (!isAuthorized) {
      return false;
    }

    const user = request.user;
    if (user && user.role === 'super') {
      return true;
    } else {
      throw new UnauthorizedException('非法操作、非超级管理员无权操作！');
    }
  }
}
