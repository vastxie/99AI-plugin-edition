import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { RefreshTokenDto } from './dto/refreshToken.dto';
import { VisitorSessionDto } from './dto/visitorSession.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { SendCodeDto } from './dto/sendCode.dto';
import { SendPhoneCodeDto } from './dto/sendPhoneCode.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';
import { VerifyIdentityDto } from './dto/verifyIdentity.dto';
import { VerifyPhoneIdentityDto } from './dto/verifyPhoneIdentity.dto';
import { VerifyResetCodeDto } from './dto/verifyResetCode.dto';

export const authBodyValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(@Body(authBodyValidationPipe) body: UserLoginDto, @Req() req: Request) {
    return this.authService.login(body, req);
  }

  @Post('visitor-session')
  @ApiOperation({ summary: '签发游客会话' })
  async createVisitorSession(
    @Body(authBodyValidationPipe) body: VisitorSessionDto,
    @Req() req: Request,
  ) {
    return this.authService.createVisitorSession(body, req);
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌' })
  async refreshToken(@Body(authBodyValidationPipe) body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('updatePassword')
  @ApiOperation({ summary: '用户更改密码' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updatePassword(@Req() req: Request, @Body(authBodyValidationPipe) body: UpdatePasswordDto) {
    return this.authService.updatePassword(req, body);
  }

  @Post('updatePassByOther')
  @ApiOperation({ summary: '管理员更改用户密码' })
  @UseGuards(JwtAuthGuard)
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updatePassByOther(
    @Req() req: Request,
    @Body(authBodyValidationPipe) body: UpdatePassByOtherDto,
  ) {
    return this.authService.updatePassByOther(req, body);
  }

  @Get('getInfo')
  @ApiOperation({ summary: '获取用户个人信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getInfo(@Req() req: Request) {
    return this.authService.getInfo(req);
  }

  @Post('sendCode')
  @ApiOperation({ summary: '发送验证码' })
  async sendCode(@Body(authBodyValidationPipe) params: SendCodeDto) {
    return this.authService.sendCode(params);
  }

  @Post('sendPhoneCode')
  @ApiOperation({ summary: '发送手机验证码' })
  async sendPhoneCode(@Body(authBodyValidationPipe) params: SendPhoneCodeDto) {
    return this.authService.sendPhoneCode(params);
  }

  @Post('verifyIdentity')
  @ApiOperation({ summary: '验证身份' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyIdentity(@Req() req: Request, @Body(authBodyValidationPipe) body: VerifyIdentityDto) {
    return this.authService.verifyIdentity(req, body);
  }

  @Post('verifyPhoneIdentity')
  @ApiOperation({ summary: '验证手机号' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyPhoneIdentity(
    @Req() req: Request,
    @Body(authBodyValidationPipe) body: VerifyPhoneIdentityDto,
  ) {
    return this.authService.verifyPhoneIdentity(req, body);
  }

  @Post('verifyResetCode')
  @ApiOperation({ summary: '验证重置密码验证码' })
  async verifyResetCode(@Body(authBodyValidationPipe) body: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(body);
  }

  @Post('resetPassword')
  @ApiOperation({ summary: '重置密码' })
  async resetPassword(@Body(authBodyValidationPipe) body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }
}
