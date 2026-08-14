import { UserStatusEnum, UserStatusErrMsg } from '@/common/constants/user.constant';
import {
  createRandomCode,
  createRandomUid,
  getClientIp,
  createRandomUniqueString,
  maskContact,
} from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { AuthConfig } from '@/common/config/auth.config';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import * as os from 'os';
import { Repository } from 'typeorm';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { UserEntity } from './../user/user.entity';
import { VerificationService } from './../verification/verification.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { SendCodeDto } from './dto/sendCode.dto';
import { SendPhoneCodeDto } from './dto/sendPhoneCode.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';
import { VerifyIdentityDto } from './dto/verifyIdentity.dto';
import { VerifyPhoneIdentityDto } from './dto/verifyPhoneIdentity.dto';
import { VerifyResetCodeDto } from './dto/verifyResetCode.dto';

@Injectable()
export class AuthService {
  private ipAddress: string;

  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    private userService: UserService,
    private jwtService: JwtService,
    private mailerService: MailerService,
    private readonly verificationService: VerificationService,
    private readonly userBalanceService: UserBalanceService,
    private readonly redisCacheService: RedisCacheService,
    private readonly globalConfigService: GlobalConfigService, // private readonly userEntity: Repository<UserEntity>
  ) {}

  async onModuleInit() {
    this.getIp();
  }

  async login(user: UserLoginDto, req: Request): Promise<string> {
    // 检查是否是验证码登录
    if (user.captchaId) {
      return await this.loginWithCaptcha({ contact: user.username, code: user.captchaId }, req);
    }

    // 密码登录流程
    const u: UserEntity = await this.userService.verifyUserCredentials(user);
    if (!u) {
      Logger.warn('登录失败: 用户凭证无效', 'AuthService');
      throw new HttpException('登录失败，用户凭证无效。', HttpStatus.UNAUTHORIZED);
    }

    const { username, id, email, role, openId, unionId, client, phone } = u;

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);

    // 生成JWT令牌
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      unionId,
      client,
      phone,
    });

    // 生成刷新令牌
    const refreshToken = createRandomUniqueString(32);

    // 从配置中获取设备限制数
    const maxDevicesConfig = await this.globalConfigService.getConfigs(['maxDevices']);
    const maxDevices = maxDevicesConfig ? parseInt(maxDevicesConfig, 10) : 3;

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token, refreshToken, maxDevices);
    Logger.debug(`用户登录成功 - UserID: ${id}`, 'AuthService');

    // 为了向后兼容，暂时只返回 accessToken
    // TODO: 前端准备好后，可以返回完整的对象 { accessToken: token, refreshToken }
    return token;
  }

  async loginWithCaptcha(body: { contact: string; code: string }, req: Request): Promise<string> {
    const { contact, code } = body;
    let email = '',
      phone = '';

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式
    const contactType = isEmail ? '邮箱' : '手机';
    Logger.debug(`验证码登录 | ${contactType}: ${maskContact(contact)}`, 'AuthService');

    if (isEmail) {
      email = contact;
    } else if (isPhone) {
      phone = contact;
    } else {
      throw new HttpException('请提供有效的邮箱地址或手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 验证短信或邮箱验证码
    const nameSpace = await this.globalConfigService.getNamespace();
    const codeKey = `${nameSpace}:loginCode:${contact}`;
    await this.requireValidOneTimeCode(codeKey, code, true, contact);
    return await this.processUserLogin(email, phone, contact, req);
  }

  // 抽取用户登录处理逻辑为独立方法
  private async processUserLogin(
    email: string,
    phone: string,
    contact: string,
    req: Request,
  ): Promise<string> {
    // 检查用户是否存在
    let u = await this.userService.getUserByContact({ email, phone });

    // 如果用户不存在，创建新用户
    if (!u) {
      Logger.log(`创建新用户 | 联系方式: ${maskContact(contact)}`, 'AuthService');

      // 创建随机用户名
      let username = createRandomUid();
      while (true) {
        const usernameTaken = await this.userService.verifyUserRegister({
          username,
        });
        if (usernameTaken) {
          break;
        }
        username = createRandomUid();
      }

      // 创建新用户对象
      const newUser: any = {
        username,
        status: UserStatusEnum.ACTIVE,
      };

      // 根据联系方式类型添加相应字段
      const isEmail = /\S+@\S+\.\S+/.test(contact);
      if (isEmail) {
        newUser.email = contact;
      } else {
        // 为手机用户创建一个随机邮箱
        newUser.email = `${createRandomUid()}@internal.invalid`;
        newUser.phone = contact;
      }

      // 创建随机密码并加密
      const randomPassword = randomBytes(32).toString('base64url');
      const hashedPassword = bcrypt.hashSync(randomPassword, AuthConfig.bcrypt.rounds);
      newUser.password = hashedPassword;

      // 保存新用户到数据库
      u = await this.userService.createUser(newUser);
      Logger.log(`用户创建成功 | 用户ID: ${u.id}`, 'AuthService');

      // 为新用户添加初始余额
      await this.userBalanceService.addBalanceToNewUser(u.id);
    }

    if (!u) {
      throw new HttpException('登录失败，用户创建失败。', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { username, id, role, openId, unionId, client } = u;

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);

    // 生成JWT令牌
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      unionId,
      client,
      phone,
    });

    // 生成刷新令牌
    const refreshToken = createRandomUniqueString(32);

    // 从配置中获取设备限制数
    const maxDevicesConfig = await this.globalConfigService.getConfigs(['maxDevices']);
    const maxDevices = maxDevicesConfig ? parseInt(maxDevicesConfig, 10) : 3;

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token, refreshToken, maxDevices);
    Logger.log(`用户登录成功 | 用户ID: ${id}`, 'AuthService');

    // 为了向后兼容，暂时只返回 accessToken
    // TODO: 前端准备好后，可以返回完整的对象 { accessToken: token, refreshToken }
    return token;
  }

  async loginByOpenId(user: UserEntity, req: Request): Promise<string> {
    const { status } = user;
    if (status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(UserStatusErrMsg[status], HttpStatus.BAD_REQUEST);
    }
    const { username, id, email, role, openId, unionId, client, phone } = user;
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      unionId,
      client,
      phone,
    });
    // 生成刷新令牌
    const refreshToken = createRandomUniqueString(32);

    await this.redisCacheService.saveToken(id, token, refreshToken);
    // 为了向后兼容，暂时只返回 accessToken
    // TODO: 前端准备好后，可以返回完整的对象 { accessToken: token, refreshToken }
    return token;
  }

  async getInfo(req: Request) {
    const { id, role } = req.user;

    if (role === 'visitor') {
      return {
        id,
        username: '游客',
        nickname: '游客',
        avatar: '',
        role: 'visitor',
      };
    }

    try {
      const result = await this.userService.getUserInfo(id);
      return result;
    } catch (error) {
      Logger.error(`获取用户信息失败: ${error.message}`, 'AuthService-getInfo');
      throw error;
    }
  }

  async updatePassword(req: Request, body: UpdatePasswordDto) {
    const { id, client } = req.user;
    if (client && Number(client) > 0) {
      throw new HttpException('无权此操作、请联系管理员！', HttpStatus.BAD_REQUEST);
    }
    const bool = await this.userService.verifyUserPassword(id, body.oldPassword);
    if (!bool) {
      throw new HttpException('旧密码错误、请检查提交', HttpStatus.BAD_REQUEST);
    }
    await this.userService.updateUserPassword(id, body.password);
    const tokens = await this.redisCacheService.getUserTokens(id);
    await this.redisCacheService.invalidateTokens(id, tokens);
    return '密码修改成功';
  }

  async updatePassByOther(req: Request, body: UpdatePassByOtherDto) {
    const { id, client } = req.user;
    if (!client) {
      throw new HttpException('无权此操作！', HttpStatus.BAD_REQUEST);
    }
    await this.userService.updateUserPassword(id, body.password);
    await this.redisCacheService.invalidateAllUserTokens(id);
    return '密码修改成功';
  }

  getIp() {
    let ipAddress: string;
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(interfaceName => {
      const interfaceInfo = interfaces[interfaceName];
      for (let i = 0; i < interfaceInfo.length; i++) {
        const alias = interfaceInfo[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          ipAddress = alias.address;
          break;
        }
      }
    });
    this.ipAddress = ipAddress;
  }

  /* 发送验证证码 */
  async sendCode(body: SendCodeDto) {
    const { contact, isLogin, isReset } = body;

    let email = '',
      phone = '';
    const code = createRandomCode();

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式

    if (!isEmail && !isPhone) {
      throw new HttpException('请提供有效的邮箱地址或手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 设置 email 或 phone 变量
    if (isEmail) {
      email = contact;
    } else if (isPhone) {
      phone = contact;
    }

    // 注册时才检查用户是否已存在
    if (!isLogin && !isReset) {
      if (isEmail) {
        const user = await this.userService.getUserByEmail(email);
        if (user) {
          throw new HttpException('该邮箱已注册！', HttpStatus.BAD_REQUEST);
        }
      } else if (isPhone) {
        const user = await this.userService.getUserByPhone(phone);
        if (user) {
          throw new HttpException('该手机号已注册！', HttpStatus.BAD_REQUEST);
        }
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    // 根据不同场景使用不同的key前缀
    let keyPrefix = 'CODE';
    if (isReset) {
      keyPrefix = 'resetCode';
    } else if (isLogin) {
      keyPrefix = 'loginCode';
    } else {
      keyPrefix = 'regCode';
    }
    const key = isReset ? `resetCode:${contact}` : `${nameSpace}:${keyPrefix}:${contact}`;

    // 发送冷却期间不重复发送，避免轰炸同一联系方式。
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0) {
      throw new HttpException(`${ttl}秒内不得重复发送验证码！`, HttpStatus.BAD_REQUEST);
    }

    // 设置 email 或 phone 变量，用于发送验证码
    if (isReset) {
      if (isEmail) {
        email = contact;
        // 检查用户是否存在
        const user = await this.userService.getUserByEmail(email);
        if (!user) {
          throw new HttpException('该邮箱未注册！', HttpStatus.BAD_REQUEST);
        }
      } else if (isPhone) {
        phone = contact;
        // 检查用户是否存在
        const user = await this.userService.getUserByPhone(phone);
        if (!user) {
          throw new HttpException('该手机号未注册！', HttpStatus.BAD_REQUEST);
        }
      }
    }

    if (isEmail) {
      try {
        await this.mailerService.sendMail({ to: email, context: { code } });
        await this.redisCacheService.storeOneTimeCode(key, code, AuthConfig.verification.codeTTL);
        Logger.log(`发送验证码 | 邮箱: ${maskContact(email)}`, 'AuthService');
      } catch (error) {
        Logger.error(`邮件发送失败: ${error.message}`, error?.stack, 'AuthService');
        throw new HttpException('验证码发送失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return `验证码发送成功、请填写验证码完成${
        isReset ? '密码重置' : isLogin ? '登录' : '注册'
      }！`;
    } else if (isPhone) {
      // 确保 phone 变量有值（因为上面只有在 !isLogin 时才设置）
      if (!phone) {
        phone = contact;
      }
      const messageInfo = { phone, code };
      await this.verificationService.sendPhoneCode(messageInfo);
      await this.redisCacheService.storeOneTimeCode(key, code, AuthConfig.verification.codeTTL);
      Logger.log(`发送验证码 | 手机: ${maskContact(phone)}`, 'AuthService');
      return `验证码发送成功、请填写验证码完成${
        isReset ? '密码重置' : isLogin ? '登录' : '注册'
      }！`;
    }
  }

  /* 发送验证证码 */
  async sendPhoneCode(body: SendPhoneCodeDto) {
    const { phone, isLogin } = body;
    // const { id } = req.user;
    const code = createRandomCode();
    // 判断 contact 是邮箱还是手机号
    const isPhone = /^\d{10,}$/.test(phone); // 根据实际需求调整正则表达式

    if (!isPhone) {
      throw new HttpException('请提供有效的手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 仅在注册流程且指定登录标记时校验已存在用户
    if (isLogin === false) {
      const isAvailable = await this.userService.verifyUserRegister({
        phone,
      });
      if (!isAvailable) {
        throw new HttpException('当前手机号已注册，请勿重复注册！', HttpStatus.BAD_REQUEST);
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${phone}`;

    // 检查Redis中是否已经有验证码且未过期
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0 && isPhone) {
      throw new HttpException(`${ttl}秒内不得重复发送验证码！`, HttpStatus.BAD_REQUEST);
    }

    const messageInfo = { phone, code };
    await this.verificationService.sendPhoneCode(messageInfo);
    await this.redisCacheService.storeOneTimeCode(key, code, AuthConfig.verification.codeTTL);
    Logger.log(`发送验证码 | 手机: ${maskContact(phone)}`, 'AuthService');

    return `验证码发送成功、请填写验证码完成${isLogin === false ? '注册' : '验证/登录'}！`;
  }

  /* create token */
  async createVisitorSession(
    body: { deviceId?: string; timezone?: string; language?: string },
    req: Request,
  ): Promise<any> {
    const sessionId = createRandomUniqueString(32);
    const ip = getClientIp(req);
    const secret = await this.redisCacheService.getJwtSecret();
    const userAgent = String(req.headers['user-agent'] || 'unknown');
    const subjectSeed = body.deviceId?.trim() || `${ip}|${userAgent}`;
    const subjectId = createHmac('sha256', secret)
      .update(`visitor-subject:${subjectSeed}`)
      .digest('hex')
      .slice(0, 40);
    const ipHash = createHmac('sha256', secret)
      .update(`visitor-ip:${ip || 'unknown'}`)
      .digest('hex')
      .slice(0, 40);
    const visitorId = `visitor:${subjectId}`;

    await this.redisCacheService.saveVisitorSession(sessionId, {
      visitorId,
      subjectId,
      ipHash,
      createdAt: new Date().toISOString(),
    });

    const token = this.jwtService.sign({
      id: visitorId,
      sid: sessionId,
      username: '游客',
      role: 'visitor',
      email: `${sessionId}@visitor.com`,
      openId: null,
      client: null,
    });

    return token;
  }

  /**
   * 刷新访问令牌
   * @param refreshToken 刷新令牌
   * @returns 新的访问令牌和刷新令牌
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // 从配置中获取设备限制数
      const maxDevicesConfig = await this.globalConfigService.getConfigs(['maxDevices']);
      const maxDevices = maxDevicesConfig ? parseInt(maxDevicesConfig, 10) : 3;

      // 调用 Redis 服务刷新 token
      const result = await this.redisCacheService.refreshToken(refreshToken, maxDevices);

      // 从新的 access token 中获取用户信息
      const tokenData = await this.redisCacheService.get({
        key: `${AuthConfig.redis.tokenDataPrefix}${result.accessToken}`,
      });
      if (!tokenData) {
        throw new HttpException('Token数据获取失败', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const { userId } = JSON.parse(tokenData);

      // 获取用户信息
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
      }

      const { username, id, email, role, openId, unionId, client, phone } = user;

      // 生成新的 JWT token
      const newJwtToken = await this.jwtService.sign({
        username,
        id,
        email,
        role,
        openId,
        unionId,
        client,
        phone,
      });

      // 更新 Redis 中的 token
      await this.redisCacheService.deleteUserToken(userId, result.accessToken);

      // 使用之前已经获取的 maxDevices
      await this.redisCacheService.saveToken(userId, newJwtToken, result.refreshToken, maxDevices);

      return { accessToken: newJwtToken, refreshToken: result.refreshToken };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('刷新Token失败', HttpStatus.UNAUTHORIZED);
    }
  }

  async verifyIdentity(req: Request, body: VerifyIdentityDto) {
    Logger.debug('开始实名认证流程');
    const { name, idCard } = body;

    const { id } = req.user;

    try {
      // 调用验证服务进行身份验证
      const result = await this.verificationService.verifyIdentity(body);

      // 输出验证结果到日志
      Logger.debug(`实名认证结果: ${result}`);

      // 检查验证结果
      if (!result) {
        throw new HttpException('身份验证错误，请检查实名信息', HttpStatus.BAD_REQUEST);
      }
      // 保存用户的实名信息
      await this.userService.saveRealNameInfo(id, name, idCard);
      return '认证成功';
    } catch (error) {
      // 处理可能的错误并记录错误信息
      Logger.error('验证过程出现错误', error);
      throw new HttpException('认证失败，请检查相关信息', HttpStatus.BAD_REQUEST);
    }
  }

  async verifyPhoneIdentity(req: Request, body: VerifyPhoneIdentityDto) {
    Logger.debug('开始手机号认证流程');
    const { phone, username, password, code } = body;
    const { id } = req.user;

    // 校验验证码是否过期或错误
    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${phone}`;
    if (code === '') {
      throw new HttpException('请输入验证码', HttpStatus.BAD_REQUEST);
    }
    await this.requireValidOneTimeCode(key, code, true, phone);

    // 验证用户名是否已存在
    if (username) {
      const usernameTaken = await this.userService.isUsernameTaken(body.username, id);
      if (usernameTaken) {
        throw new HttpException('用户名已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    // 检查手机号是否已被其他用户绑定
    const existingUserByPhone = await this.userService.getUserByPhone(phone);
    if (existingUserByPhone && existingUserByPhone.id !== id) {
      throw new HttpException('该手机号已被其他账号绑定！', HttpStatus.BAD_REQUEST);
    }

    try {
      // 保存用户的实名信息
      await this.userService.updateUserPhone(id, phone, username, password);
      await this.redisCacheService.invalidateAllUserTokens(id);
      return '认证成功';
    } catch (error) {
      // 处理可能的错误并记录错误信息
      Logger.error('验证过程出现错误', error);
      throw new HttpException('身份验证错误，请检查相关信息', HttpStatus.BAD_REQUEST);
    }
  }

  async verifyResetCode(body: VerifyResetCodeDto): Promise<any> {
    const { contact, code } = body;
    Logger.debug(`验证重置密码验证码: ${maskContact(contact)}`, 'AuthService');

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^1[3-9]\d{9}$/.test(contact);

    if (!isEmail && !isPhone) {
      throw new HttpException('请输入有效的邮箱或手机号', HttpStatus.BAD_REQUEST);
    }

    await this.requireValidOneTimeCode(`resetCode:${contact}`, code, false, contact);
    const user = isEmail
      ? await this.userService.getUserByEmail(contact)
      : await this.userService.getUserByPhone(contact);
    if (!user) {
      throw new HttpException(isEmail ? '该邮箱未注册！' : '该手机号未注册！', HttpStatus.BAD_REQUEST);
    }
    return { success: true, message: '验证成功' };
  }

  async resetPassword(body: ResetPasswordDto): Promise<any> {
    const { contact, code, password } = body;
    Logger.debug(`重置密码请求: ${maskContact(contact)}`, 'AuthService');

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^1[3-9]\d{9}$/.test(contact);

    let user: UserEntity;
    const cacheKey = `resetCode:${contact}`;

    if (isEmail) {
      await this.requireValidOneTimeCode(cacheKey, code, true, contact);
      user = await this.userService.getUserByEmail(contact);
      if (!user) {
        throw new HttpException('该邮箱未注册！', HttpStatus.BAD_REQUEST);
      }
    } else if (isPhone) {
      await this.requireValidOneTimeCode(cacheKey, code, true, contact);
      user = await this.userService.getUserByPhone(contact);
      if (!user) {
        throw new HttpException('该手机号未注册！', HttpStatus.BAD_REQUEST);
      }
    } else {
      throw new HttpException('请输入有效的邮箱或手机号', HttpStatus.BAD_REQUEST);
    }

    // 更新用户密码 - 使用原生密码，updateUserPassword 会处理加密
    await this.userService.updateUserPassword(user.id, password);
    await this.redisCacheService.invalidateAllUserTokens(user.id);

    Logger.debug(`密码重置成功，用户: ${user.username}`, 'authService');
    return { success: true, message: '密码重置成功' };
  }

  private async requireValidOneTimeCode(
    key: string,
    code: string,
    consumeOnSuccess: boolean,
    contact: string,
  ): Promise<void> {
    const result = await this.redisCacheService.verifyOneTimeCode(key, String(code), {
      consumeOnSuccess,
      maxAttempts: AuthConfig.verification.maxAttempts,
    });
    if (result === 'valid') return;

    Logger.warn(`验证码校验失败(${result}): ${maskContact(contact)}`, 'AuthService');
    if (result === 'locked') {
      throw new HttpException('验证码尝试次数过多，请重新获取', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (result === 'expired') {
      throw new HttpException('验证码不存在或已过期，请重新获取', HttpStatus.BAD_REQUEST);
    }
    throw new HttpException('验证码错误', HttpStatus.BAD_REQUEST);
  }

  async validateAuthenticatedUser(user: any): Promise<void> {
    await this.userService.checkUserStatus(user);
  }
}
