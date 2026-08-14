import { AuthConfig } from '@/common/config/auth.config';
import { RechargeType } from '@/common/constants/balance.constant';
import { VerificationEnum } from '@/common/constants/verification.constant';
import { createRandomUid, getClientIp, maskEmail, maskIpAddress } from '@/common/utils';
import { MailerService } from '../mailer/mailer.service';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Request } from 'express';
import * as _ from 'lodash';
import { Connection, In, Like, Not, Repository, UpdateResult } from 'typeorm';
import { UserRegisterDto } from '../auth/dto/authRegister.dto';
import { ConfigEntity } from '../globalConfig/config.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { UserStatusEnum, UserStatusErrMsg } from './../../common/constants/user.constant';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { RedisCacheService } from './../redisCache/redisCache.service';
import { VerificationEntity } from './../verification/verification.entity';
import { VerificationService } from './../verification/verification.service';
import { QueryAllUserDto } from './dto/queryAllUser.dto';
import { ResetUserPassDto } from './dto/resetUserPass.dto';
import { UpdateUserDto } from './dto/updateUser.dto';
import { UpdateUserStatusDto } from './dto/updateUserStatus.dto';
import { UserRechargeDto } from './dto/userRecharge.dto';
import { UserEntity } from './user.entity';

type SafeUserProfileUpdate = Pick<
  UpdateUserDto,
  'username' | 'nickname' | 'avatar' | 'customInstruction' | 'knowledgeFiles'
>;

const WECHAT_IDENTITY_LOCK_TTL_SECONDS = 120;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly connection: Connection,
    private readonly verificationService: VerificationService,
    private readonly mailerService: MailerService,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
  ) {}

  /* create and verify */
  async createUserAndVerifycation(
    user: UserEntity | UserRegisterDto,
    req: Request,
  ): Promise<UserEntity> {
    const { username, email, password, client = 0 } = user;

    /* 用户是否已经在系统中 */
    const where = [{ username }, { email }];
    const u: UserEntity = await this.userEntity.findOne({ where: where });

    if (u && u.status !== UserStatusEnum.PENDING) {
      throw new HttpException('用户名或者邮箱已被注册！', HttpStatus.BAD_REQUEST);
    }

    try {
      const userInput: any = _.cloneDeep(user);
      const hashedPassword = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
      const ip = getClientIp(req);
      userInput.password = hashedPassword;
      userInput.registerIp = ip;
      userInput.client = client;

      let n: UserEntity;
      /* 如果没有注册用户则首次注册记录 如果注册了覆盖发送验证码即可 无需记录用户 */
      if (!u) {
        // 不设置默认头像，保持为空
        userInput.avatar = '';
        n = await this.userEntity.save(userInput);
      } else {
        n = u;
      }
      const emailConfigs = await this.configEntity.find({
        where: {
          configKey: In([
            'isVerifyEmail',
            'registerBaseUrl',
            'registerVerifyEmailTitle',
            'registerVerifyEmailDesc',
            'registerVerifyEmailFrom',
            'registerVerifyExpir',
          ]),
        },
      });

      const configMap: any = emailConfigs.reduce((pre, cur: any) => {
        pre[cur.configKey] = cur.configVal;
        return pre;
      }, {});

      const isVerifyEmail = configMap['isVerifyEmail'] ? Number(configMap['isVerifyEmail']) : 1;
      if (isVerifyEmail) {
        const expir = configMap['registerVerifyExpir']
          ? Number(configMap['registerVerifyExpir'])
          : 30 * 60;
        const v: VerificationEntity = await this.verificationService.createVerification(
          n,
          VerificationEnum.Registration,
          expir,
        );
        const { email } = v;

        Logger.debug(`尝试发送验证邮件到: ${maskEmail(email)}`, 'UserService');
      } else {
        /* 如果没有邮箱验证则 则直接主动注册验证通过逻辑 */
        const { id } = n;
        await this.updateUserStatus(id, UserStatusEnum.ACTIVE);
        await this.userBalanceService.addBalanceToNewUser(id);
      }
      return n;
    } catch (error) {
      Logger.error(`用户注册失败: ${error.message || error}`, error?.stack, 'UserService');
      throw error;
    }
  }

  async getSuper() {
    const user = await this.userEntity.findOne({ where: { role: 'super' } });
    return user;
  }

  /* 账号登录验证密码 扫码登录则不用 */
  async verifyUserCredentials(user): Promise<UserEntity> {
    const { username, password, uid = 0, phone } = user;
    let u = null;

    /* 三方登录的 */
    if (uid > 0) {
      u = await this.userEntity.findOne({ where: { id: uid } });
      if (!u) {
        throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
      }
      if (!bcrypt.compareSync(password, u.password)) {
        throw new HttpException('当前密码错误！', HttpStatus.BAD_REQUEST);
      }
    }

    /* 普通登录 */
    if (username && password) {
      const where: any = [{ username }, { email: username }, { phone: username }];
      u = await this.userEntity.findOne({ where: where });
      if (!u) {
        throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
      }
      if (!bcrypt.compareSync(password, u.password)) {
        throw new HttpException('当前密码错误！', HttpStatus.BAD_REQUEST);
      }
    }

    if (!u) {
      throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (u.status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(UserStatusErrMsg[u.status], HttpStatus.BAD_REQUEST);
    }

    return u;
  }

  async verifyUserPassword(userId, password) {
    if (!userId || !password) {
      return false;
    }
    const u = await this.userEntity.findOne({ where: { id: userId } });
    if (!u?.password) {
      return false;
    }
    try {
      return bcrypt.compareSync(password, u.password);
    } catch (error) {
      Logger.warn('用户密码校验失败', 'UserService');
      return false;
    }
  }

  async getUserByEmail(email: string): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { email } });
  }

  async getUserByPhone(phone: string): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { phone } });
  }

  async updateUserStatus(id: number, status: UserStatusEnum) {
    const u: UpdateResult = await this.userEntity.update({ id }, { status });
    return u.affected > 0;
  }

  async getUserStatus(id: number): Promise<number> {
    const u: UserEntity = await this.userEntity.findOne({ where: { id } });
    return u.status;
  }

  async queryUserInfoById(id: number): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { id } });
  }

  async queryOneUserInfo(userId: number): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { id: userId } });
  }

  /* 检查用户状态 */
  async checkUserStatus(user) {
    const { id: userId, role } = user;
    if (role === 'visitor') return true;
    const u = await this.userEntity.findOne({ where: { id: userId } });
    if (!u) {
      throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
    }
    if (u.status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(
        UserStatusErrMsg[u.status] || '当前账户不可用',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /* 获取用户基础信息 */
  async getUserInfo(userId: number) {
    // 检查userId是否是游客指纹ID (大于用户表中通常ID范围)
    const isVisitor = userId > 100000000; // 假设正常用户ID不会超过这个范围

    if (isVisitor) {
      Logger.debug(`检测到游客用户访问: ${userId}`, 'UserService-getUserInfo');

      // 为游客创建默认用户信息
      const visitorInfo: any = {
        username: `游客${userId}`,
        avatar: '', // 可以设置一个默认头像URL
        role: 'visitor',
        email: `${userId}@visitor.com`,
        consecutiveDays: 0,
        phone: null,
        realName: null,
        idCard: null,
        nickname: `游客${userId.toString().slice(-6)}`,
        isBindWx: false,
        customInstruction: null,
      };

      // 处理游客ID
      const processedId = (userId * 123 + 100000000).toString(36).toUpperCase().slice(-6);
      visitorInfo.id = processedId;

      // 获取游客余额
      let userBalance;
      try {
        userBalance = await this.userBalanceService.queryUserBalance(userId);
      } catch (error) {
        Logger.debug(`游客余额查询失败，使用默认值: ${error.message}`, 'UserService-getUserInfo');
        // 如果查询余额失败，提供默认余额
        userBalance = {
          packageId: null,
          model3Count: 0,
          model4Count: 0,
          drawMjCount: 0,
          memberModel3Count: 0,
          memberModel4Count: 0,
          memberDrawMjCount: 0,
          sumModel3Count: 0,
          sumModel4Count: 0,
          sumDrawMjCount: 0,
          isMember: false,
        };
      }

      return { userInfo: visitorInfo, userBalance: { ...userBalance } };
    }

    // 原有逻辑：处理正常用户（添加Redis缓存）
    const userInfoCacheKey = `user:info:${userId}`;
    // 用户资料可以缓存；余额必须读取权威数据，避免扣费后刷新页面读到旧额度。
    let userInfo: any;
    let userBalance: any;

    try {
      const cachedUserInfo = await this.redisCacheService.get({ key: userInfoCacheKey });

      if (cachedUserInfo) {
        userInfo = JSON.parse(cachedUserInfo);
      } else {
        // 缓存未命中，查询数据库
        userInfo = await this.userEntity.findOne({
          where: { id: userId },
          select: [
            'username',
            'avatar',
            'role',
            'email',
            'openId',
            'consecutiveDays',
            'phone',
            'realName',
            'idCard',
            'nickname',
            'customInstruction',
            'knowledgeFiles',
          ],
        });

        if (!userInfo) {
          throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
        }

        userInfo.isBindWx = !!userInfo?.openId;
        delete userInfo.openId;

        // 将结果缓存2小时
        const cacheTime = 2 * 60 * 60; // 2小时
        await this.redisCacheService.set(
          {
            key: userInfoCacheKey,
            val: JSON.stringify(userInfo),
          },
          cacheTime,
        );
      }

      userBalance = await this.userBalanceService.queryUserBalance(userId);
    } catch (cacheError) {
      // 缓存失败时降级到数据库查询
      Logger.warn(
        `Redis缓存获取失败，降级到数据库查询: ${cacheError.message}`,
        'UserService-getUserInfo',
      );

      userInfo = await this.userEntity.findOne({
        where: { id: userId },
        select: [
          'username',
          'avatar',
          'role',
          'email',
          'openId',
          'consecutiveDays',
          'phone',
          'realName',
          'idCard',
          'nickname',
          'customInstruction',
          'knowledgeFiles',
        ],
      });

      if (!userInfo) {
        throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
      }

      userInfo.isBindWx = !!userInfo?.openId;
      delete userInfo.openId;

      userBalance = await this.userBalanceService.queryUserBalance(userId);
    }

    // 对id进行处理
    const processedId = (userId * 123 + 100000000).toString(36).toUpperCase().slice(-6);

    // 将处理后的id放入userInfo对象中
    userInfo.id = processedId;

    return { userInfo, userBalance: { ...userBalance } };
  }

  /* 获取用户信息 */
  async getUserById(id: number) {
    return await this.userEntity.findOne({ where: { id } });
  }

  /* 通过openId获取用户信息 */
  async getUserOpenId(openId: string) {
    return await this.userEntity.findOne({ where: { openId } });
  }

  /* 通过unionId获取用户信息 */
  async getUserByUnionId(unionId: string) {
    if (!unionId) return null;
    return await this.userEntity.findOne({ where: { unionId } });
  }

  /* 创建微信用户（包含 openId 和 unionId） */
  async createUserFromWechat(openId: string, unionId?: string) {
    const userInfo = {
      username: `用户${createRandomUid()}`,
      status: UserStatusEnum.ACTIVE,
      sex: 0,
      email: `${createRandomUid()}@internal.invalid`,
      openId,
      unionId: unionId || null,
    };
    const user = await this.userEntity.save(userInfo);
    Logger.log(`创建微信用户成功 - UserID: ${user.id}`, 'UserService');
    return user;
  }

  /* 更新用户的微信 IDs（openId 和 unionId） */
  async updateWechatIds(userId: number, openId: string, unionId?: string) {
    const updateData: any = { openId };
    if (unionId) {
      updateData.unionId = unionId;
    }
    const result = await this.userEntity.update({ id: userId }, updateData);

    // 更新后清除用户缓存
    await this.clearUserCache(userId);

    Logger.log(`更新用户微信信息 - UserID: ${userId}`, 'UserService');
    return result;
  }

  /* 修改用户信息 */
  async updateInfo(body: UpdateUserDto, req: Request) {
    const { id } = req.user;
    const updateData: Partial<SafeUserProfileUpdate> = {};
    const allowFields: (keyof SafeUserProfileUpdate)[] = [
      'username',
      'nickname',
      'avatar',
      'customInstruction',
      'knowledgeFiles',
    ];

    allowFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field] as any;
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new HttpException('没有可修改的用户资料字段！', HttpStatus.BAD_REQUEST);
    }

    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('当前用户不存在！', HttpStatus.BAD_REQUEST);
    }

    // 检查是否有任何变更
    if (updateData.username && u.username === updateData.username) {
      throw new HttpException('用户名没有变更，无需更改！', HttpStatus.BAD_REQUEST);
    }
    if (updateData.nickname && u.nickname === updateData.nickname) {
      throw new HttpException('昵称没有变更，无需更改！', HttpStatus.BAD_REQUEST);
    }

    // 如果要修改用户名，检查用户名是否已被占用
    if (updateData.username) {
      const existingUser = await this.userEntity.findOne({
        where: { username: updateData.username },
      });
      if (existingUser && existingUser.id !== id) {
        throw new HttpException('用户名已被占用！', HttpStatus.BAD_REQUEST);
      }
    }

    const r = await this.userEntity.update({ id }, updateData);
    if (r.affected <= 0) {
      throw new HttpException('修改用户信息失败！', HttpStatus.BAD_REQUEST);
    }

    // 清除用户信息缓存
    await this.clearUserCache(id);

    let message = '修改用户信息成功！';
    if (updateData.username) {
      message = '修改用户名成功！';
    } else if (updateData.nickname) {
      message = '修改用户昵称成功！';
    } else if (updateData.customInstruction !== undefined) {
      message = '修改自定义指令成功！';
    }

    return message;
  }

  /* 检查用户名是否已存在 */
  async isUsernameTaken(username: string, excludeUserId?: number): Promise<boolean> {
    const where: any = { username };
    if (excludeUserId) {
      where.id = Not(excludeUserId);
    }
    const user = await this.userEntity.findOne({ where });
    return !!user;
  }

  /* 修改用户密码 */
  async updateUserPassword(userId: number, password: string) {
    const hashedPassword = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
    const r = await this.userEntity.update({ id: userId }, { password: hashedPassword });
    if (r.affected <= 0) {
      throw new HttpException('修改密码失败、请重新试试吧。', HttpStatus.BAD_REQUEST);
    }
  }

  /* 给用户充值 */
  async userRecharge(body: UserRechargeDto) {
    const { userId, model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
    await this.userBalanceService.addBalanceToUser(userId, {
      model3Count,
      model4Count,
      drawMjCount,
    });
    const res = await this.userBalanceService.saveRecordRechargeLog({
      userId,
      rechargeType: RechargeType.ADMIN_GIFT,
      model3Count,
      model4Count,
      drawMjCount,
      extent: '',
    });
    return res;
  }

  /* 查询所有用户 */
  async queryAll(query: QueryAllUserDto, req: Request) {
    const { page = 1, size = 10, username, email, status, keyword, phone, nickname } = query;
    let where = {};
    username && Object.assign(where, { username: Like(`%${username}%`) });
    email && Object.assign(where, { email: Like(`%${email}%`) });
    phone && Object.assign(where, { phone: Like(`%${phone}%`) });
    nickname && Object.assign(where, { nickname: Like(`%${nickname}%`) });
    status && Object.assign(where, { status });
    if (keyword) {
      where = [
        { username: Like(`%${keyword}%`) },
        { email: Like(`%${keyword}%`) },
        { phone: Like(`%${keyword}%`) },
        { nickname: Like(`%${keyword}%`) },
      ];
    }
    const [rows, count] = await this.userEntity.findAndCount({
      skip: (page - 1) * size,
      where,
      take: size,
      order: { createdAt: 'DESC' },
      cache: true,
      select: [
        'username',
        'avatar',
        'role',
        'sign',
        'status',
        'id',
        'email',
        'createdAt',
        'lastLoginIp',
        'phone',
        'realName',
        'idCard',
        'nickname',
      ],
    });
    // 优化：使用批量查询替代循环查询，避免 N+1 问题
    // 虽然 queryUserBalanceByIds 已经优化过，但我们可以进一步使用 JOIN 查询
    const ids = rows.map(t => t.id);
    const data = await this.userBalanceService.queryUserBalanceByIds(ids);
    rows.forEach((user: any) => (user.balanceInfo = data.find(t => t.userId === user.id)));
    req.user.role !== 'super' && rows.forEach(t => (t.email = maskEmail(t.email)));
    req.user.role !== 'super' && rows.forEach(t => (t.lastLoginIp = maskIpAddress(t.lastLoginIp)));
    req.user.role !== 'super' && rows.forEach(t => (t.phone = maskIpAddress(t.phone)));
    return { rows, count };
  }

  /* 查询单个用户详情 */
  // async queryOne({ id }) {
  //   return await this.userEntity.findOne({
  //     where: { id },
  //     select: ['username', 'avatar', 'role', 'sign', 'status'],
  //   });
  // }

  /* 修改用户状态 */
  async updateStatus(body: UpdateUserStatusDto) {
    const { id, status } = body;
    const n = await this.userEntity.findOne({ where: { id } });
    if (!n) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    // if (n.status === UserStatusEnum.PENDING) {
    //   throw new HttpException('未激活用户不可手动变更状态！', HttpStatus.BAD_REQUEST);
    // }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    // if (status === UserStatusEnum.PENDING) {
    //   throw new HttpException('不可将用户置为未激活状态！', HttpStatus.BAD_REQUEST);
    // }
    const r = await this.userEntity.update({ id }, { status });
    if (r.affected <= 0) {
      throw new HttpException('修改用户状态失败！', HttpStatus.BAD_REQUEST);
    }
    await this.redisCacheService.invalidateAllUserTokens(id);
    return '修改用户状态成功！';
  }

  /* 重置用户密码 */
  async resetUserPass(body: ResetUserPassDto) {
    const { id, password } = body;
    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    const hashPassword = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
    const raw = await this.userEntity.update({ id }, { password: hashPassword });
    if (raw.affected <= 0) {
      throw new HttpException('重置密码失败！', HttpStatus.BAD_REQUEST);
    }
    await this.redisCacheService.invalidateAllUserTokens(id);
    return '密码重置成功，用户的现有会话已全部失效';
  }

  /* 记录登录ip */
  async savaLoginIp(userId: number, ip: string) {
    return await this.userEntity.update({ id: userId }, { lastLoginIp: ip });
  }

  /* 通过openId 拿到或创建（支持 unionId） */
  async getUserFromOpenId(openId: string, sceneStr?: string, unionId?: string) {
    // 优先通过 UnionID 查找用户
    if (unionId) {
      const userByUnionId = await this.getUserByUnionId(unionId);
      if (userByUnionId) {
        Logger.log(`通过 UnionID 找到用户 - UserID: ${userByUnionId.id}`, 'UserService');
        // 如果找到了用户，更新其 OpenID（自动升级）
        await this.updateWechatIds(userByUnionId.id, openId, unionId);
        return userByUnionId;
      }
    }

    // 通过 OpenID 查找用户
    const user = await this.userEntity.findOne({ where: { openId } });
    if (!user) {
      const identityLockKeys = [openId, unionId]
        .filter((value): value is string => Boolean(value))
        .map(value =>
          crypto.createHash('sha256').update(value).digest('hex'),
        )
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort()
        .map(value => `wechat-user:${value}`);
      const acquiredLocks: Array<{ key: string; token: string }> = [];

      try {
        for (const lockKey of identityLockKeys) {
          let lockToken: string | null = null;
          for (let attempt = 0; attempt < 20 && !lockToken; attempt += 1) {
            lockToken = await this.redisCacheService.acquireLock(
              lockKey,
              WECHAT_IDENTITY_LOCK_TTL_SECONDS,
            );
            if (!lockToken) await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (!lockToken) {
            throw new HttpException('微信登录处理中，请稍后重试', HttpStatus.CONFLICT);
          }
          acquiredLocks.push({ key: lockKey, token: lockToken });
        }

        const existingUser =
          (unionId ? await this.getUserByUnionId(unionId) : null) ||
          (await this.userEntity.findOne({ where: { openId } }));
        if (existingUser) {
          if (unionId && existingUser.unionId !== unionId) {
            await this.updateWechatIds(existingUser.id, openId, unionId);
          }
          return existingUser;
        }

        const newUser = await this.createUserFromWechat(openId, unionId);
        await this.userBalanceService.addBalanceToNewUser(newUser.id);
        Logger.log(`创建微信用户成功 - UserID: ${newUser.id}`, 'UserService');
        return newUser;
      } finally {
        for (const lock of acquiredLocks.reverse()) {
          await this.redisCacheService.releaseLock(lock.key, lock.token);
        }
      }
    }

    // 如果找到了用户，且提供了 unionId，更新用户的 unionId
    if (unionId && user.unionId !== unionId) {
      await this.updateWechatIds(user.id, openId, unionId);
      Logger.log(`更新用户微信标识成功 - UserID: ${user.id}`, 'UserService');
    }

    return user;
  }

  /* 清除用户相关缓存的辅助方法 */
  async clearUserCache(userId: number) {
    try {
      const userInfoCacheKey = `user:info:${userId}`;
      const userBalanceCacheKey = `user:balance:${userId}`;

      await this.redisCacheService.del({ key: userInfoCacheKey });
      await this.redisCacheService.del({ key: userBalanceCacheKey });

      Logger.debug(`已清除用户缓存: ${userId}`, 'UserService-clearUserCache');
    } catch (error) {
      Logger.warn(`清除用户缓存失败: ${error.message}`, 'UserService-clearUserCache');
    }
  }

  async updateUserInfo(id: number, userInfo: any) {
    const user = await this.userEntity.findOne({ where: { id } });
    if (!user) {
      return;
    }
    const { nickname, sex, headimgurl } = userInfo;
    Logger.log(`更新微信用户资料 - UserID: ${id}`, 'UserService');

    const result = await this.userEntity.update(
      { id },
      { sex: sex, nickname: nickname, avatar: headimgurl },
    );

    // 更新后清除用户缓存
    await this.clearUserCache(id);

    return result;
  }

  /* 通过openId创建一个用户, 传入邀请码 是邀请人的不是自己的 */
  async createUserFromOpenId(openId: string) {
    const userDefaultAvatar = await this.globalConfigService.getConfigs(['userDefaultAvatar']);
    const userInfo = {
      // avatar: userDefaultAvatar,
      username: `用户${createRandomUid()}`,
      status: UserStatusEnum.ACTIVE,
      sex: 0,
      email: `${createRandomUid()}@internal.invalid`,
      openId,
    };
    const user = await this.userEntity.save(userInfo);
    return user;
  }

  /* 通过openId创建一个用户, 传入邀请码 是邀请人的不是自己的 */
  async createUserFromContact(params: any) {
    const { username, email, phone } = params;
    // const userDefaultAvatar = await this.globalConfigService.getConfigs([
    //   'userDefaultAvatar',
    // ]);
    // 创建 userInfo 对象时条件性地添加 email 和 phone
    const userInfo: any = {
      // avatar: userDefaultAvatar,
      username: `用户${createRandomUid()}`,
      status: UserStatusEnum.ACTIVE,
      sex: 0,
    };

    if (username) {
      userInfo.username = username;
    }

    if (email) {
      userInfo.email = email;
    }

    if (phone) {
      userInfo.phone = phone;
    }

    const user = await this.userEntity.save(userInfo);
    return user;
  }

  async getUserByContact(params: any) {
    const { username, email, phone } = params;
    const where: any = [];
    if (username) {
      where.push({ username });
    }
    if (email) {
      where.push({ email });
    }
    if (phone) {
      where.push({ phone });
    }
    return await this.userEntity.findOne({ where });
  }

  async bindWx(openId, userId, unionId?: string) {
    try {
      const user = await this.userEntity.findOne({ where: { id: userId } });
      if (!user) return { status: false, msg: '当前绑定用户不存在！' };

      // 检查 OpenID 是否已被绑定
      const bindByOpenId = await this.userEntity.findOne({ where: { openId } });
      if (bindByOpenId && bindByOpenId.id !== userId) {
        return { status: false, msg: '该微信已绑定其他账号！' };
      }

      // 如果有 UnionID，也检查 UnionID 是否已被绑定
      if (unionId) {
        const bindByUnionId = await this.userEntity.findOne({ where: { unionId } });
        if (bindByUnionId && bindByUnionId.id !== userId) {
          Logger.log(
            `微信身份已被绑定 - 已绑定用户ID: ${bindByUnionId.id}, 尝试绑定用户ID: ${userId}`,
            'UserService',
          );
          return { status: false, msg: '该微信已绑定其他账号！' };
        }
      }

      // 更新用户的 OpenID 和 UnionID
      const updateData: any = { openId };
      if (unionId) {
        updateData.unionId = unionId;
      }

      const res = await this.userEntity.update({ id: userId }, updateData);
      if (res.affected <= 0) return { status: false, msg: '绑定微信失败、请联系管理员！' };

      // 清除用户缓存
      await this.clearUserCache(userId);

      Logger.log(`微信绑定成功 - UserID: ${userId}`, 'UserService');
      return { status: true, msg: '恭喜您绑定成功、后续可直接扫码登录了！' };
    } catch (error) {
      Logger.error(`微信绑定异常: ${error.message}`, 'UserService');
      return { status: false, msg: '绑定微信失败、请联系管理员！' };
    }
  }

  async migrateWechatOpenId(input: {
    oldUserId: number;
    currentUserId: number;
    expectedOldOpenId: string;
    expectedCurrentOpenId: string;
  }): Promise<{ status: boolean; msg: string }> {
    const { oldUserId, currentUserId, expectedOldOpenId, expectedCurrentOpenId } = input;
    if (
      !Number.isSafeInteger(oldUserId) ||
      !Number.isSafeInteger(currentUserId) ||
      oldUserId <= 0 ||
      currentUserId <= 0 ||
      oldUserId === currentUserId ||
      !expectedOldOpenId ||
      !expectedCurrentOpenId ||
      expectedOldOpenId === expectedCurrentOpenId
    ) {
      return { status: false, msg: '迁移账号状态无效，请重新发起迁移' };
    }

    try {
      await this.connection.transaction(async manager => {
        const repository = manager.getRepository(UserEntity);
        const users = await repository
          .createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.id IN (:...ids)', { ids: [oldUserId, currentUserId].sort((a, b) => a - b) })
          .orderBy('user.id', 'ASC')
          .getMany();
        const oldUser = users.find(user => Number(user.id) === oldUserId);
        const currentUser = users.find(user => Number(user.id) === currentUserId);
        if (
          !oldUser ||
          !currentUser ||
          oldUser.openId !== expectedOldOpenId ||
          currentUser.openId !== expectedCurrentOpenId
        ) {
          throw new Error('WECHAT_MIGRATION_STATE_CHANGED');
        }

        const oldUnionId = oldUser.unionId || null;
        const currentUnionId = currentUser.unionId || null;

        const clearResult = await repository.update(
          { id: currentUserId, openId: expectedCurrentOpenId },
          { openId: null, unionId: null },
        );
        if (clearResult.affected !== 1) throw new Error('WECHAT_MIGRATION_STATE_CHANGED');

        const migrateResult = await repository.update(
          { id: oldUserId, openId: expectedOldOpenId },
          { openId: expectedCurrentOpenId, unionId: currentUnionId || oldUnionId },
        );
        if (migrateResult.affected !== 1) throw new Error('WECHAT_MIGRATION_STATE_CHANGED');
      });

      await Promise.all([this.clearUserCache(oldUserId), this.clearUserCache(currentUserId)]);
      return { status: true, msg: '账号迁移成功' };
    } catch (error) {
      Logger.warn(`微信账号迁移事务失败: ${error.message}`, 'UserService');
      return { status: false, msg: '账号状态已变化，请重新发起迁移' };
    }
  }

  /* 通过userId获取用户的openId */
  async getOpenIdByUserId(userId: number) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    return user?.openId;
  }

  /* 校验手机号/邮箱号注册 */
  async verifyUserRegister(params: any): Promise<boolean> {
    const { username, phone, email } = params;

    // 如果提供了手机号，就验证手机号
    if (phone) {
      const userByPhone = await this.userEntity.findOne({ where: { phone } });
      if (userByPhone) {
        // 手机号已注册，返回 false
        return false;
      }
    }

    // 如果提供了邮箱，就验证邮箱
    if (email) {
      const userByEmail = await this.userEntity.findOne({ where: { email } });
      if (userByEmail) {
        // 邮箱已注册，返回 false
        return false;
      }
    }

    // 验证用户名是否已存在
    if (username) {
      const userByUsername = await this.userEntity.findOne({
        where: { username },
      });
      if (userByUsername) {
        // 用户名已存在，返回 false
        return false;
      }
    }

    if (!phone && !email && !username) {
      return false;
    }

    // 所有检查都通过，没有发现重复的注册信息，返回 true
    return true;
  }

  /* 校验手机号注册 */
  async verifyUserRegisterByPhone(params: any) {
    const { username, password, phone, phoneCode } = params;
    const user = await this.userEntity.findOne({
      where: [{ username }, { phone }],
    });
    if (user && user.username === username) {
      throw new HttpException('用户名已存在、请更换用户名！', HttpStatus.BAD_REQUEST);
    }
    if (user && user.phone === phone) {
      throw new HttpException('当前手机号已注册、请勿重复注册！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 校验邮箱注册 */
  async verifyUserRegisterByEmail(params: any) {
    const { username, email } = params;

    // 查找数据库中是否存在该用户名或邮箱
    const user = await this.userEntity.findOne({
      where: [{ username }, { email }],
    });

    // 校验用户名是否已存在
    if (user && user.username === username) {
      Logger.warn('注册校验: 用户名已存在', 'UserService');
      throw new HttpException('用户名已存在、请更换用户名！', HttpStatus.BAD_REQUEST);
    }

    // 校验邮箱是否已被注册
    if (user && user.email === email) {
      Logger.warn(`注册校验: 邮箱 ${maskEmail(email)} 已被注册`, 'UserService');
      throw new HttpException('当前邮箱已注册、请勿重复注册！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 创建基础用户 */
  async createUser(userInfo) {
    return await this.userEntity.save(userInfo);
  }

  /* 存储实名信息 */
  async saveRealNameInfo(userId: number, realName: string, idCard: string) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    if (!user) {
      Logger.error('用户不存在', 'UserService');
    }
    await this.userEntity.update({ id: userId }, { realName, idCard });
    return;
  }

  /* 更新用户手机号，用户名，密码 */
  async updateUserPhone(userId: number, phone: string, username: string, password: string) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    const hashedPassword = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
    if (!user) {
      Logger.error('用户不存在', 'UserService');
    }
    if (!phone || !username || !hashedPassword) {
      throw new HttpException('参数错误！', HttpStatus.BAD_REQUEST);
    }
    await this.userEntity.update({ id: userId }, { phone, username, password: hashedPassword });
    return;
  }

  /* 获取所有有 openId 但没有 unionId 的用户 */
  async getUsersNeedUnionIdUpdate() {
    try {
      const users = await this.userEntity
        .createQueryBuilder('user')
        .select(['user.id', 'user.openId'])
        .where('user.openId IS NOT NULL')
        .andWhere('user.openId != :empty', { empty: '' })
        .andWhere('(user.unionId IS NULL OR user.unionId = :empty)', { empty: '' })
        .getMany();

      Logger.log(`查询到 ${users.length} 个需要更新 UnionID 的用户`, 'UserService');
      return users;
    } catch (error) {
      Logger.error(`查询需要更新 UnionID 的用户失败: ${error.message}`, 'UserService');
      throw new HttpException('查询用户失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
