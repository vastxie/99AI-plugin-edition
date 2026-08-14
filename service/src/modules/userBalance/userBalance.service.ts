import { RechargeType } from '@/common/constants/balance.constant';
import { createRandomUid, hideString } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { AccountLogEntity } from './accountLog.entity';
import { BalanceEntity } from './balance.entity';
import { UserBalanceEntity } from './userBalance.entity';
// import * as dayjs from 'dayjs';
import dayjs, { formatCreateOrUpdateDate, formatDate } from '@/common/utils/date';

import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { FingerprintLogEntity } from './fingerprint.entity';
import * as jwt from 'jsonwebtoken';

interface LogInfo {
  userId: number;
  rechargeType: number;
  model3Count?: number;
  model4Count?: number;
  drawMjCount?: number;
  days?: number;
  pkgName?: string;
  extent?: string;
}

interface UserBalanceInfo {
  model3Count?: number;
  model4Count?: number;
  drawMjCount?: number;
}

@Injectable()
export class UserBalanceService {
  constructor(
    @InjectRepository(BalanceEntity)
    private readonly balanceEntity: Repository<BalanceEntity>,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    @InjectRepository(AccountLogEntity)
    private readonly accountLogEntity: Repository<AccountLogEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(FingerprintLogEntity)
    private readonly fingerprintLogEntity: Repository<FingerprintLogEntity>,
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  /**
   * chatType -> RechargeType 统一映射表
   * 扣费（deductFromBalance）和退款（refundBalance）共用同一份映射，
   * 避免两边不一致导致退款查不到扣费记录。
   * 1=对话 2=图片 3=视频 4=音乐 5=其他 6=通用创意
   */
  private static readonly CHAT_TYPE_TO_RECHARGE_TYPE: Record<number, number> = {
    1: RechargeType.CHAT_DEDUCT,
    2: RechargeType.IMAGE_DEDUCT,
    3: RechargeType.VIDEO_DEDUCT,
    4: RechargeType.MUSIC_DEDUCT,
    5: RechargeType.OTHER_DEDUCT,
    6: RechargeType.OTHER_DEDUCT,
  };

  /* 新注册用户赠送消费 */
  async addBalanceToNewUser(userId: number) {
    try {
      // TODO 直接从globalConfig中获取配置
      const registerConfigs = await this.configEntity.find({
        where: {
          configKey: In([
            'registerSendStatus', // 开启注册赠送
            'registerSendModel3Count', // 注册赠送模型3聊天次数
            'registerSendModel4Count', // 注册赠送模型4聊天次数
            'registerSendDrawMjCount', // 注册赠送MJ绘画次数
          ]),
        },
      });
      const configMap: any = registerConfigs.reduce((pre, cur: any) => {
        const num = Number(cur.configVal);
        const n = Number.isInteger(num) && num > 0 ? num : 0;
        pre[cur.configKey] = n;
        return pre;
      }, {});
      let model3Count = 0;
      let model4Count = 0;
      let drawMjCount = 0;

      /* 开启注册增送 */
      if (configMap.registerSendStatus === 1) {
        model3Count = model3Count + configMap.registerSendModel3Count;
        model4Count = model4Count + configMap.registerSendModel4Count;
        drawMjCount = drawMjCount + configMap.registerSendDrawMjCount;
      }

      /* 受邀人注册赠送日志 */
      await this.saveRecordRechargeLog({
        userId,
        rechargeType: RechargeType.REG_GIFT,
        model3Count,
        drawMjCount,
        model4Count,
      });
      /* 受邀人初次注册 一次领取所有额度 */
      await this.userBalanceEntity.save({
        userId,
        model3Count,
        model4Count,
        drawMjCount,
        useTokens: 0,
      });
    } catch (error) {
      Logger.error(`注册赠送失败: ${error.message || error}`, error?.stack, 'UserBalanceService');
      throw new HttpException('注册赠送失败,请联系管理员！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 检查余额 */
  async validateBalance(req, type, amount) {
    const { id: userId, role } = req.user;

    // 访客用户直接使用访客余额验证，不创建userBalance记录
    if (role === 'visitor') {
      return this.validateVisitorBalance(req, type, amount);
    }

    let b = await this.userBalanceEntity.findOne({ where: { userId } });
    if (!b) {
      b = await this.createBaseUserBalance(userId);
    }
    /* 会员扣费key */
    const memberKey =
      type === 1
        ? 'memberModel3Count'
        : type === 2
        ? 'memberModel4Count'
        : type === 3
        ? 'memberDrawMjCount'
        : null;
    /* 非会员扣费key */
    const baseKey =
      type === 1 ? 'model3Count' : type === 2 ? 'model4Count' : type === 3 ? 'drawMjCount' : null;

    // 打印到日志
    // Logger.debug(`操作类型type: ${type}`, 'ValidateBalance');
    // Logger.debug(`会员扣费key(memberKey): ${memberKey}`, 'ValidateBalance');
    // Logger.debug(`非会员扣费key(baseKey): ${baseKey}`, 'ValidateBalance');
    /* 如果是会员 */
    if (b.packageId && b[memberKey] + b[baseKey] < amount) {
      if (b[baseKey] < amount) {
        throw new HttpException(
          `积分不足，继续体验服务，请按需选购套餐！`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
    /* 如果不是会员 */
    if (!b.packageId && b[baseKey] < amount) {
      throw new HttpException(
        `积分不足，继续体验服务，请按需选购套餐！`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return b;
  }

  /* 检查游客的余额 */
  async validateVisitorBalance(req, type, amount) {
    const baseKey =
      type === 1 ? 'model3Count' : type === 2 ? 'model4Count' : type === 3 ? 'drawMjCount' : null;
    if (!baseKey) {
      throw new HttpException('不支持的访客额度类型', HttpStatus.BAD_REQUEST);
    }

    const session = await this.redisCacheService.getVisitorSession(String(req.user.sid || ''));
    if (!session || session.visitorId !== String(req.user.id)) {
      throw new HttpException('游客会话已过期，请刷新页面。', HttpStatus.UNAUTHORIZED);
    }

    /* 判断余额 */
    const { visitorModel3Num, visitorModel4Num, visitorMJNum } =
      await this.globalConfigService.getConfigs([
        'visitorModel3Num',
        'visitorModel4Num',
        'visitorMJNum',
      ]);

    const settings = {
      model3Count: visitorModel3Num ? Number(visitorModel3Num) : 0,
      model4Count: visitorModel4Num ? Number(visitorModel4Num) : 0,
      drawMjCount: visitorMJNum ? Number(visitorMJNum) : 0,
    };

    /* 如果所有访客限额都为0，说明未开启访客模式 */
    const visitorModeEnabled =
      settings.model3Count > 0 || settings.model4Count > 0 || settings.drawMjCount > 0;
    if (!visitorModeEnabled) {
      throw new HttpException(`访客模式未开启，请先登录后使用！`, HttpStatus.UNAUTHORIZED);
    }

    /* 如果对应的模型限额为0，但其他模型有限额，则不允许使用该模型 */
    if (settings[baseKey] === 0) {
      throw new HttpException(`该模型不支持访客使用，请登录后继续！`, HttpStatus.UNAUTHORIZED);
    }

    const now = new Date();
    const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const dateKey = shanghaiNow.toISOString().slice(0, 10);
    const nextShanghaiDay = new Date(
      Date.UTC(
        shanghaiNow.getUTCFullYear(),
        shanghaiNow.getUTCMonth(),
        shanghaiNow.getUTCDate() + 1,
      ),
    );
    const ttlSeconds = Math.max(
      60,
      Math.ceil((nextShanghaiDay.getTime() - shanghaiNow.getTime()) / 1000) + 3600,
    );
    const result = await this.redisCacheService.consumeVisitorQuota({
      subjectId: session.subjectId,
      ipHash: session.ipHash,
      quotaType: baseKey,
      amount: Number(amount),
      limit: settings[baseKey],
      dateKey,
      ttlSeconds,
    });

    if (result !== 'ok') {
      throw new HttpException(
        '今日体验额度使用完毕，请登录后继续使用！',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }

  /* 判读上次更新是不是今天  */
  isUpdatedToday(date) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date >= todayStart;
  }

  async deductFromBalance(
    userId,
    deductionType,
    amount,
    UseAmount = 0,
    relatedId: number = null,
    chatType: number = 1,
  ): Promise<number | null> {
    // 访客用户不需要扣除余额，因为已经在validateBalance中处理
    if (!userId || userId === null) {
      return null;
    }

    // 确定会员和非会员账户的 keys
    const keys = {
      1: {
        member: 'memberModel3Count',
        nonMember: 'model3Count',
        token: 'useModel3Token',
        countKey: 'useModel3Count',
      },
      2: {
        member: 'memberModel4Count',
        nonMember: 'model4Count',
        token: 'useModel4Token',
        countKey: 'useModel4Count',
      },
      3: {
        member: 'memberDrawMjCount',
        nonMember: 'drawMjCount',
        token: 'useDrawMjToken',
        countKey: null,
      },
    };
    const config = keys[deductionType];
    if (!config) {
      throw new HttpException('消费类型无效！', HttpStatus.BAD_REQUEST);
    }
    const { member, nonMember, token, countKey } = config;

    return this.userBalanceEntity.manager.transaction(async manager => {
      const balanceRepo = manager.getRepository(UserBalanceEntity);
      const accountLogRepo = manager.getRepository(AccountLogEntity);

      const balance = await balanceRepo
        .createQueryBuilder('balance')
        .setLock('pessimistic_write')
        .where('balance.userId = :userId', { userId })
        .getOne();

      if (!balance) {
        throw new HttpException('缺失当前用户账户记录！', HttpStatus.BAD_REQUEST);
      }

      const memberBalance = Number(balance[member]) || 0;
      const nonMemberBalance = Number(balance[nonMember]) || 0;
      if (memberBalance + nonMemberBalance < amount) {
        throw new HttpException('消费余额失败，余额不足或账户不存在！', HttpStatus.BAD_REQUEST);
      }

      const memberDeducted = Math.min(memberBalance, amount);
      const nonMemberDeducted = amount - memberDeducted;
      const updateBalance: Record<string, number> = {
        [member]: memberBalance - memberDeducted,
        [nonMember]: nonMemberBalance - nonMemberDeducted,
        [token]: (Number(balance[token]) || 0) + UseAmount,
      };
      if (countKey) {
        updateBalance[countKey] = (Number(balance[countKey]) || 0) + amount;
      }

      const result = await balanceRepo.update({ userId }, updateBalance);
      if (result.affected === 0) {
        throw new HttpException('消费余额失败！', HttpStatus.BAD_REQUEST);
      }

      const logData: any = {
        userId,
        rechargeType:
          UserBalanceService.CHAT_TYPE_TO_RECHARGE_TYPE[chatType] || RechargeType.OTHER_DEDUCT,
        model3Count: deductionType === 1 ? amount : 0,
        model4Count: deductionType === 2 ? amount : 0,
        drawMjCount: deductionType === 3 ? amount : 0,
        days: -1,
        uid: createRandomUid(),
        relatedId: relatedId,
        // 记录从会员积分扣除的明细
        memberModel3Count: deductionType === 1 ? memberDeducted : 0,
        memberModel4Count: deductionType === 2 ? memberDeducted : 0,
        memberDrawMjCount: deductionType === 3 ? memberDeducted : 0,
        extent: UseAmount > 0 ? `消费Token: ${UseAmount}` : null,
      };

      const savedLog = await accountLogRepo.save(logData);
      return savedLog.id;
    });
  }

  /* 查询用户余额 */
  async queryUserBalance(userId: number) {
    // 访客用户返回默认余额信息
    if (!userId || userId === null) {
      return {
        packageId: null,
        model3Count: 0,
        model4Count: 0,
        drawMjCount: 0,
        memberModel3Count: 0,
        memberModel4Count: 0,
        memberDrawMjCount: 0,
        useModel3Count: 0,
        useModel4Count: 0,
        useModel3Token: 0,
        useModel4Token: 0,
        useDrawMjToken: 0,
        expirationTime: null,
        sumModel3Count: 0,
        sumModel4Count: 0,
        sumDrawMjCount: 0,
        isMember: false,
      };
    }

    try {
      const res: any = await this.userBalanceEntity.findOne({
        where: { userId },
        select: [
          'packageId',
          'model3Count',
          'model4Count',
          'drawMjCount',
          'memberModel3Count',
          'memberModel4Count',
          'memberDrawMjCount',
          'useModel3Count',
          'useModel4Count',
          'useModel3Token',
          'useModel4Token',
          'useDrawMjToken',
          'expirationTime',
        ],
      });
      if (!res) {
        const user = await this.createBaseUserBalance(userId);
        if (user) {
          return await this.queryUserBalance(userId);
        } else {
          throw new HttpException('查询当前用户余额失败！', HttpStatus.BAD_REQUEST);
        }
      }
      res.sumModel3Count = res.packageId
        ? res.model3Count + res.memberModel3Count
        : res.model3Count;
      res.sumModel4Count = res.packageId
        ? res.model4Count + res.memberModel4Count
        : res.model4Count;
      res.sumDrawMjCount = res.packageId
        ? res.drawMjCount + res.memberDrawMjCount
        : res.drawMjCount;
      res.expirationTime = res.expirationTime ? formatDate(res.expirationTime, 'YYYY-MM-DD') : null;
      // 添加会员状态判断
      res.isMember =
        !!res.packageId && res.expirationTime && new Date(res.expirationTime) > new Date();
      return res;
    } catch (error) {
      Logger.error(`查询余额失败: ${error.message || error}`, error?.stack, 'UserBalanceService');
    }
  }

  /* 记录充值日志 */
  async saveRecordRechargeLog(logInfo: LogInfo, manager?: EntityManager) {
    const {
      userId,
      rechargeType,
      model3Count,
      model4Count,
      drawMjCount,
      days = -1,
      pkgName = '',
      extent = '',
    } = logInfo;
    if (!userId) {
      throw new HttpException('当前用户不存在,记录充值日志异常', HttpStatus.BAD_REQUEST);
    }
    const uid = createRandomUid();
    const accountLogRepo = manager?.getRepository(AccountLogEntity) || this.accountLogEntity;
    return await accountLogRepo.save({
      userId,
      rechargeType,
      model3Count,
      model4Count,
      drawMjCount,
      days,
      extent,
      uid,
      pkgName,
    });
  }

  /* 创建一条基础的用户余额记录 */
  async createBaseUserBalance(
    userId: number,
    userBalanceInfo: UserBalanceInfo = {},
    manager?: EntityManager,
  ) {
    const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = userBalanceInfo;
    const userBalanceRepo = manager?.getRepository(UserBalanceEntity) || this.userBalanceEntity;
    const balance = await userBalanceRepo.findOne({ where: { userId } });
    if (balance) {
      throw new HttpException('当前用户无需创建账户信息！', HttpStatus.BAD_REQUEST);
    }
    return await userBalanceRepo.save({
      userId,
      model3Count,
      model4Count,
      drawMjCount,
    });
  }

  /* 给用户增加固定次数额度 */
  async addBalanceToUser(userId, balance, days = -1, manager?: EntityManager) {
    try {
      const userBalanceRepo = manager?.getRepository(UserBalanceEntity) || this.userBalanceEntity;
      const cramiPackageRepo =
        manager?.getRepository(CramiPackageEntity) || this.cramiPackageEntity;
      const userBalanceInfo =
        (await userBalanceRepo.findOne({
          where: { userId },
          lock: manager ? { mode: 'pessimistic_write' } : undefined,
        })) || (await this.createBaseUserBalance(userId, {}, manager));
      if (!userBalanceInfo) {
        throw new HttpException('查询用户账户信息失败！', HttpStatus.BAD_REQUEST);
      }
      const {
        model3Count,
        model4Count,
        drawMjCount,
        memberModel3Count,
        memberModel4Count,
        memberDrawMjCount,
        appCats,
      } = userBalanceInfo;
      let params = {};
      /* 是否充值会员套餐 大于0的时间天数都属于套餐 */
      if (days > 0) {
        const { packageId } = balance;
        if (!packageId) {
          throw new HttpException('缺失当前套餐ID、充值失败！', HttpStatus.BAD_REQUEST);
        }
        const pkgInfo = await cramiPackageRepo.findOne({
          where: { id: packageId },
        });
        if (!pkgInfo) {
          throw new HttpException('当前套餐不存在！', HttpStatus.BAD_REQUEST);
        }
        const { weight } = pkgInfo; // 套餐的权重 = 会员等级

        // 处理 apps 字段
        let newApps = '';
        if (balance.appCats) {
          if (!appCats) {
            // 如果原来没有 apps，直接使用新的
            newApps = balance.appCats;
          } else {
            // 如果原来有 apps，需要附加上去，先加一个逗号
            newApps = appCats + ',' + balance.appCats;
          }
        } else {
          // 如果新套餐没有 apps，保持原来的
          newApps = appCats || '';
        }

        /* 如果不是会员那么则直接充值进入并修改会员信息为会员身份 */
        if (!userBalanceInfo.packageId) {
          params = {
            memberModel3Count: memberModel3Count + balance.model3Count,
            memberModel4Count: memberModel4Count + balance.model4Count,
            memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
            expirationTime: dayjs()
              .add(days > 0 ? days : 0, 'day')
              .format('YYYY-MM-DD HH:mm:ss'),
            packageId: packageId,
            appCats: newApps,
          };
        } else {
          /* 我当前使用的套餐信息 */
          const curPackageInfo = await cramiPackageRepo.findOne({
            where: { id: userBalanceInfo.packageId },
          });
          /* 如果是会员则  充值更高或当前等级的套餐会进行时间覆盖充值余额叠加  充值低等级套餐只会叠加次数 不更新到期时间 */
          /* pkgLevel： 我当前的套餐等级 weight： 充值套餐的等级高于或等于当前套餐 则叠加时间并合并额度 */
          if (weight >= curPackageInfo.weight) {
            params = {
              memberModel3Count: memberModel3Count + balance.model3Count,
              memberModel4Count: memberModel4Count + balance.model4Count,
              memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
              expirationTime: dayjs(userBalanceInfo.expirationTime)
                .add(days > 0 ? days : 0, 'day')
                .format('YYYY-MM-DD HH:mm:ss'),
              packageId: packageId,
              appCats: newApps,
            };
          }
          /* 如果充值套餐小于当前套餐等级 只叠加次数 不延长时间 也不变更会员等级 */
          if (weight < curPackageInfo.weight) {
            params = {
              memberModel3Count: memberModel3Count + balance.model3Count,
              memberModel4Count: memberModel4Count + balance.model4Count,
              memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
              appCats: newApps,
            };
          }
        }
      }
      /* 充值不限时卡直接叠加 */
      if (days <= 0) {
        // 处理 apps 字段
        let newApps = '';
        if (balance.appCats) {
          if (!appCats) {
            // 如果原来没有 apps，直接使用新的
            newApps = balance.appCats;
          } else {
            // 如果原来有 apps，需要附加上去，先加一个逗号
            newApps = appCats + ',' + balance.appCats;
          }

          params = {
            model3Count: model3Count + balance.model3Count,
            model4Count: model4Count + balance.model4Count,
            drawMjCount: drawMjCount + balance.drawMjCount,
            appCats: newApps,
          };
        } else {
          params = {
            model3Count: model3Count + balance.model3Count,
            model4Count: model4Count + balance.model4Count,
            drawMjCount: drawMjCount + balance.drawMjCount,
          };
        }
      }
      const result = await userBalanceRepo.update({ userId }, params);
      if (result.affected === 0) {
        throw new HttpException(`${userId}充值失败`, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      Logger.error(`用户充值失败: ${error.message || error}`, error?.stack, 'UserBalanceService');
      throw new HttpException('用户充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 支付成功给用户充值套餐 */
  async addBalanceToOrder(order, manager?: EntityManager) {
    try {
      const { userId, goodsId } = order;
      const cramiPackageRepo =
        manager?.getRepository(CramiPackageEntity) || this.cramiPackageEntity;
      const pkg = await cramiPackageRepo.findOne({
        where: { id: order.goodsId },
      });
      if (!pkg) {
        throw new HttpException('非法操作、当前充值套餐暂不存在！', HttpStatus.BAD_REQUEST);
      }
      const { model3Count, model4Count, drawMjCount, days, name: pkgName, appCats } = pkg;
      const money = {
        model3Count,
        model4Count,
        drawMjCount,
        days,
        packageId: order.goodsId,
        appCats,
      };
      /* 充值进账户 */
      await this.addBalanceToUser(userId, money, days, manager);
      /* 记录充值日志 */
      await this.saveRecordRechargeLog(
        {
          userId,
          rechargeType: RechargeType.SCAN_PAY,
          model3Count,
          model4Count,
          drawMjCount,
          pkgName,
          days,
        },
        manager,
      );
    } catch (error) {
      Logger.error(`订单充值失败: ${error.message || error}`, error?.stack, 'UserBalanceService');
      throw new HttpException('充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询用户充值日志 */
  async getRechargeLog(req: Request, params) {
    const { page = 1, size = 20 } = params;
    const { id } = req.user;
    const [rows, count] = await this.accountLogEntity.findAndCount({
      where: { userId: id },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    rows.forEach((item: any) => {
      item.expireDateCn = item.days > 0 ? `${item.days}天` : '永久';
      // item.expireDateCn = item.days > 0 ? `${item.days} Days` : 'Permanent';
    });
    return { rows: formatCreateOrUpdateDate(rows), count };
  }

  /* 管理端查询用户账户变更记录 */
  async getAccountLog(req, params) {
    try {
      const { page = 1, size = 10, userId, rechargeType, packageId } = params;
      const { role } = req.user;

      // 使用 QueryBuilder 进行 JOIN 查询，避免 N+1 问题
      let queryBuilder = this.accountLogEntity
        .createQueryBuilder('accountLog')
        .leftJoinAndSelect('accountLog.user', 'user')
        .orderBy('accountLog.id', 'DESC')
        .skip((page - 1) * size)
        .take(size);

      const conditions = [];

      if (rechargeType) {
        conditions.push('accountLog.rechargeType = :rechargeType');
        queryBuilder.setParameter('rechargeType', rechargeType);
      }

      if (userId) {
        conditions.push('accountLog.userId = :userId');
        queryBuilder.setParameter('userId', userId);
      } else {
        conditions.push('accountLog.userId < 100000');
      }

      if (packageId) {
        conditions.push('accountLog.packageId LIKE :packageId');
        queryBuilder.setParameter('packageId', `%${packageId}%`);
      }

      if (conditions.length > 0) {
        queryBuilder.where(conditions.join(' AND '));
      }

      const [accountLogs, count] = await queryBuilder.getManyAndCount();

      // 直接从关联的 user 对象获取用户信息
      const rows = accountLogs.map((item: any) => {
        const user = item.user || {};
        return {
          ...item,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
        };
      });

      // 对非超级管理员隐藏敏感信息
      if (role !== 'super') {
        rows.forEach((item: any) => {
          item.email = item.email ? hideString(item.email) : '';
          item.phone = item.phone ? hideString(item.phone) : '';
        });
      }

      return { rows, count };
    } catch (error) {
      Logger.error(
        `查询用户账户失败: ${error.message || error}`,
        error?.stack,
        'UserBalanceService',
      );
      throw new HttpException('查询用户账户失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过用户id批量查询用户 */
  async queryUserBalanceByIds(ids: number[]) {
    return await this.userBalanceEntity.find({ where: { userId: In(ids) } });
  }

  /* 批量给用户充值余额 - 性能优化版本 */
  async batchAddBalanceToUsers(userIds: number[], balance: any, days = -1, reason = '批量充值') {
    if (!userIds.length || userIds.length === 0) {
      throw new HttpException('用户ID列表不能为空', HttpStatus.BAD_REQUEST);
    }

    const queryRunner = this.chatLogEntity.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 批量获取用户余额信息，确保用户存在
      const userBalances = await queryRunner.manager.find(this.userBalanceEntity.target, {
        where: { userId: In(userIds) },
      });

      if (userBalances.length !== userIds.length) {
        const foundUserIds = userBalances.map(ub => ub.userId);
        const missingUserIds = userIds.filter(id => !foundUserIds.includes(id));
        throw new HttpException(
          `以下用户不存在: ${missingUserIds.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 批量更新用户余额
      const updates = userBalances.map(ub => ({
        ...ub,
        model3Count: ub.model3Count + (balance.model3Count || 0),
        model4Count: ub.model4Count + (balance.model4Count || 0),
        drawMjCount: ub.drawMjCount + (balance.drawMjCount || 0),
        memberModel3Count: ub.memberModel3Count + (balance.memberModel3Count || 0),
        memberModel4Count: ub.memberModel4Count + (balance.memberModel4Count || 0),
        memberDrawMjCount: ub.memberDrawMjCount + (balance.memberDrawMjCount || 0),
      }));

      // 使用 save 方法进行批量更新
      await queryRunner.manager.save(this.userBalanceEntity.target, updates);

      // 批量插入账户变更日志
      const logs = userIds.map(userId => ({
        userId,
        rechargeType: RechargeType.RECHARGE_BY_ADMIN,
        model3Count: balance.model3Count || 0,
        model4Count: balance.model4Count || 0,
        drawMjCount: balance.drawMjCount || 0,
        days,
        packageId: null,
        extent: reason,
        uid: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      }));

      await queryRunner.manager.insert(this.accountLogEntity.target, logs);

      await queryRunner.commitTransaction();

      Logger.log(`批量充值成功：${userIds.length}个用户`, 'UserBalanceService-batchAddBalance');
      return {
        success: true,
        affectedUsers: userIds.length,
        totalAdded: {
          model3Count: (balance.model3Count || 0) * userIds.length,
          model4Count: (balance.model4Count || 0) * userIds.length,
          drawMjCount: (balance.drawMjCount || 0) * userIds.length,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      Logger.error(`批量充值失败: ${error.message}`, 'UserBalanceService-batchAddBalance');
      throw new HttpException(`批量充值失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 退款方法：通过查询扣费记录来精确退还积分
   * @param userId 用户ID
   * @param deductionType 扣费类型 1=普通对话 2=高级对话 3=绘画
   * @param amount 扣费金额
   * @param relatedId 关联业务记录ID（如chatLogId）
   * @param chatType 业务类型 1=对话 2=图片 3=视频 4=音乐 5=其他
   * @param reason 退款原因
   */
  async refundBalance(
    userId: number,
    deductionType: number,
    amount: number,
    relatedId: number = null,
    chatType: number = 2,
    reason: string = '任务失败退款',
  ) {
    // 访客用户不需要退款
    if (!userId || userId === null) {
      return;
    }

    try {
      // 1. 查询扣费记录
      if (!relatedId) {
        Logger.warn(
          '未提供 relatedId，无法查询扣费记录，跳过退款',
          'UserBalanceService-refundBalance',
        );
        return;
      }

      // 使用统一映射表查询扣费记录，确保和 deductFromBalance 使用同一份映射
      const expectedRechargeType =
        UserBalanceService.CHAT_TYPE_TO_RECHARGE_TYPE[chatType] || RechargeType.OTHER_DEDUCT;

      const deductLog = await this.accountLogEntity.findOne({
        where: {
          relatedId: relatedId,
          rechargeType: expectedRechargeType,
          userId: userId,
        },
        order: { id: 'DESC' },
      });

      if (!deductLog) {
        Logger.warn(
          `未找到对应的扣费记录，跳过退款 - 用户ID: ${userId}, relatedId: ${relatedId}, chatType: ${chatType}`,
          'UserBalanceService-refundBalance',
        );
        return;
      }

      // 2. 使用查询到的扣费记录执行精确退款
      return this.refundBalanceByLogId(deductLog.id, reason);
    } catch (error) {
      Logger.error(`退款失败: ${error.message}`, 'UserBalanceService-refundBalance');
    }
  }

  /**
   * 通过扣费记录ID退还积分（内部方法）
   */
  private async refundBalanceByLogId(deductLogId: number, reason: string = '任务失败退款') {
    // 如果没有传入扣费记录ID，跳过退款
    if (!deductLogId) {
      Logger.warn('未提供扣费记录ID，跳过退款', 'UserBalanceService-refundBalance');
      return;
    }

    try {
      // 1. 查询扣费记录
      const deductLog = await this.accountLogEntity.findOne({
        where: { id: deductLogId },
      });

      // 如果没有找到扣费记录，说明记录不存在或已被删除
      if (!deductLog) {
        Logger.warn(
          `未找到扣费记录 - logId: ${deductLogId}，跳过退款`,
          'UserBalanceService-refundBalance',
        );
        return;
      }

      const {
        userId,
        model3Count,
        model4Count,
        drawMjCount,
        memberModel3Count,
        memberModel4Count,
        memberDrawMjCount,
        relatedId,
      } = deductLog;

      // 访客用户不需要退款
      if (!userId || userId === null) {
        Logger.warn('扣费记录关联的是访客用户，跳过退款', 'UserBalanceService-refundBalance');
        return;
      }

      // 幂等检查：查询是否已存在针对该扣费记录的退款日志
      const existingRefund = await this.accountLogEntity.findOne({
        where: {
          userId,
          rechargeType: RechargeType.REFUND,
          relatedId: relatedId,
          model3Count: model3Count || 0,
          model4Count: model4Count || 0,
          drawMjCount: drawMjCount || 0,
        },
      });
      if (existingRefund) {
        Logger.warn(
          `该扣费记录已退款，跳过重复退款 - deductLogId: ${deductLogId}, refundLogId: ${existingRefund.id}`,
          'UserBalanceService-refundBalance',
        );
        return;
      }

      Logger.log(
        `找到扣费记录 - 用户ID: ${userId}, logId: ${deductLogId}, 总扣费: model3=${model3Count} model4=${model4Count} mj=${drawMjCount}`,
        'UserBalanceService-refundBalance',
      );

      // 2. 计算需要退还的会员积分和普通积分
      const refundMemberModel3 = memberModel3Count || 0;
      const refundMemberModel4 = memberModel4Count || 0;
      const refundMemberDrawMj = memberDrawMjCount || 0;

      const refundNonMemberModel3 = (model3Count || 0) - refundMemberModel3;
      const refundNonMemberModel4 = (model4Count || 0) - refundMemberModel4;
      const refundNonMemberDrawMj = (drawMjCount || 0) - refundMemberDrawMj;

      Logger.debug(
        `退款明细 - 会员: model3=${refundMemberModel3} model4=${refundMemberModel4} mj=${refundMemberDrawMj}, 普通: model3=${refundNonMemberModel3} model4=${refundNonMemberModel4} mj=${refundNonMemberDrawMj}`,
        'UserBalanceService-refundBalance',
      );

      // 3. 使用 SQL 原子累加退还积分，避免并发退款时 read-then-write 丢失更新
      // 只对需要退还的字段执行累加，无需退还的字段不写入 SQL
      const setClause: Record<string, () => string> = {};
      const params: Record<string, number> = { userId };

      // 退还会员积分
      if (refundMemberModel3 > 0) {
        setClause.memberModel3Count = () => 'memberModel3Count + :refundMemberModel3';
        params.refundMemberModel3 = refundMemberModel3;
      }
      if (refundMemberModel4 > 0) {
        setClause.memberModel4Count = () => 'memberModel4Count + :refundMemberModel4';
        params.refundMemberModel4 = refundMemberModel4;
      }
      if (refundMemberDrawMj > 0) {
        setClause.memberDrawMjCount = () => 'memberDrawMjCount + :refundMemberDrawMj';
        params.refundMemberDrawMj = refundMemberDrawMj;
      }

      // 退还普通积分
      if (refundNonMemberModel3 > 0) {
        setClause.model3Count = () => 'model3Count + :refundNonMemberModel3';
        params.refundNonMemberModel3 = refundNonMemberModel3;
      }
      if (refundNonMemberModel4 > 0) {
        setClause.model4Count = () => 'model4Count + :refundNonMemberModel4';
        params.refundNonMemberModel4 = refundNonMemberModel4;
      }
      if (refundNonMemberDrawMj > 0) {
        setClause.drawMjCount = () => 'drawMjCount + :refundNonMemberDrawMj';
        params.refundNonMemberDrawMj = refundNonMemberDrawMj;
      }

      // 如果没有需要退款的内容，直接返回
      if (Object.keys(setClause).length === 0) {
        Logger.warn(`扣费记录 ${deductLogId} 没有可退款的内容`, 'UserBalanceService-refundBalance');
        return;
      }

      // 4. 原子更新用户余额
      const qb = this.userBalanceEntity
        .createQueryBuilder()
        .update(UserBalanceEntity)
        .set(setClause)
        .where('userId = :userId', { userId });

      // 绑定所有参数
      Object.entries(params).forEach(([key, value]) => {
        qb.setParameter(key, value);
      });

      const result = await qb.execute();

      if (result.affected === 0) {
        Logger.warn(`用户 ${userId} 退款更新失败`, 'UserBalanceService-refundBalance');
        return;
      }

      // 6. 记录退款日志
      try {
        const logData: any = {
          userId,
          rechargeType: RechargeType.REFUND,
          model3Count: model3Count || 0,
          model4Count: model4Count || 0,
          drawMjCount: drawMjCount || 0,
          memberModel3Count: refundMemberModel3,
          memberModel4Count: refundMemberModel4,
          memberDrawMjCount: refundMemberDrawMj,
          days: -1,
          uid: createRandomUid(),
          relatedId: relatedId,
          extent: reason,
        };

        await this.accountLogEntity.save(logData);
        Logger.log(
          `退款成功 - 用户ID: ${userId}, logId: ${deductLogId}, 原因: ${reason}`,
          'UserBalanceService-refundBalance',
        );
      } catch (error) {
        // 退款日志记录失败不影响退款操作，只记录错误日志
        Logger.error(`记录退款日志失败: ${error.message}`, 'UserBalanceService-refundBalance');
      }
    } catch (error) {
      Logger.error(`退款失败: ${error.message}`, 'UserBalanceService-refundBalance');
      // 退款失败不抛出异常，避免影响主流程
    }
  }

  async inheritVisitorData(req: Request, visitorToken?: string) {
    const { id: userId } = req.user;

    if (!visitorToken) return 0;

    try {
      // 验证 visitor token 并提取 visitorId
      const secret = await this.redisCacheService.getJwtSecret();
      const decoded = jwt.verify(visitorToken, secret) as any;

      if (decoded.role !== 'visitor' || !decoded.id || !String(decoded.id).startsWith('visitor:')) {
        return 0;
      }

      // 验证 Redis session 存在
      const sessionId = String(decoded.sid || '');
      const session = await this.redisCacheService.getVisitorSession(sessionId);
      if (!session) return 0;

      if (session.visitorId !== String(decoded.id)) return 0;

      const visitorId = session.visitorId;

      // 迁移数据：把 visitorId 关联的聊天记录和分组迁移到当前用户
      await this.chatLogEntity.update({ visitorId }, { userId });
      await this.chatGroupEntity.update({ visitorId }, { userId });

      // 迁移完成后删除 visitor session
      await this.redisCacheService.del({ key: `visitor:session:${sessionId}` });

      return 1;
    } catch (error) {
      Logger.warn(`继承游客数据失败: ${error.message}`, 'UserBalanceService-inheritVisitorData');
      return 0;
    }
  }

  async getVisitorCount(req) {
    const { id, role } = req.user;
    if (role !== 'visitor') return 0;
    const countChat = await this.chatLogEntity.count({
      where: { visitorId: String(id) },
    });
    const countChatGroup = await this.chatGroupEntity.count({
      where: { visitorId: String(id) },
    });
    return countChat || countChatGroup || 0;
  }

  /**
   * 检查用户是否是会员，如果是且未过期则返回apps内容
   * @param userId 用户ID
   * @returns 返回apps数组，如果不是会员或已过期返回空数组
   */
  async getUserApps(userId: number): Promise<string[]> {
    if (!Number.isFinite(userId) || userId <= 0) {
      return [];
    }
    try {
      // 查询用户余额信息
      const userBalance = await this.userBalanceEntity.findOne({
        where: { userId },
        select: ['packageId', 'expirationTime', 'appCats'],
      });

      // 如果用户不存在或没有套餐ID，则不是会员
      if (!userBalance || !userBalance.packageId) {
        return [];
      }

      // 检查会员是否过期
      const now = new Date();
      const expirationTime = new Date(userBalance.expirationTime);

      // 如果过期时间有效且未过期，则返回apps内容
      if (expirationTime && expirationTime > now) {
        // console.log('userBalance.apps', userBalance.apps);
        return userBalance.appCats?.split(',') || [];
      }

      // 已过期，返回空数组
      return [];
    } catch (error) {
      Logger.error(
        `检查用户会员状态出错: ${error.message || error}`,
        error?.stack,
        'UserBalanceService',
      );
      return []; // 出错时返回空数组
    }
  }

  /**
   * 检查用户是否需要进行认证
   * @param userId 用户ID
   */
  async checkUserCertification(userId: number): Promise<void> {
    const userInfo = await this.userEntity.findOne({
      where: { id: userId },
    });
    const userBalance = await this.userBalanceEntity.findOne({
      where: { userId },
    });

    if (!userInfo || !userBalance) {
      return;
      // throw new HttpException(
      //   '用户信息或用户余额信息不存在',
      //   HttpStatus.NOT_FOUND
      // );
    }

    // 获取配置项
    const {
      phoneValidationMessageCount,
      identityVerificationMessageCount,
      openIdentity,
      openPhoneValidation,
    } = await this.globalConfigService.getConfigs([
      'phoneValidationMessageCount',
      'identityVerificationMessageCount',
      'openIdentity',
      'openPhoneValidation',
    ]);

    // 格式化配置项为数字类型
    const phoneValidationCount = Number(phoneValidationMessageCount);
    const identityValidationCount = Number(identityVerificationMessageCount);

    const model3Count = Number(userBalance.useModel3Count) || 0;
    const model4Count = Number(userBalance.useModel4Count) || 0;
    const totalTokens = model3Count + model4Count;

    // 检查是否开启手机号验证并且是否已经绑定手机号
    if (openPhoneValidation === '1' && totalTokens >= phoneValidationCount && !userInfo.phone) {
      throw new HttpException('请完成手机号绑定', HttpStatus.BAD_REQUEST);
    }

    // 检查是否开启实名认证并且是否已经完成实名认证
    if (
      openIdentity === '1' &&
      totalTokens >= identityValidationCount &&
      (!userInfo.realName || !userInfo.idCard)
    ) {
      throw new HttpException('请完成实名认证', HttpStatus.BAD_REQUEST);
    }

    // 如果不需要任何认证，方法直接结束，无需返回值
  }
}
