import { RechargeType } from '@/common/constants/balance.constant';
import { generateCramiCode, maskCrami, maskEmail } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { In, LessThanOrEqual, Like, MoreThan, Not, Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { CramiEntity } from './crami.entity';
import { CramiPackageEntity } from './cramiPackage.entity';
import { BatchDelCramiDto } from './dto/batchDelCrami.dto';
import { CreatCramiDto } from './dto/createCrami.dto';
import { CreatePackageDto } from './dto/createPackage.dto';
import { DeletePackageDto } from './dto/deletePackage.dto';
import { QuerAllCramiDto } from './dto/queryAllCrami.dto';
import { QuerAllPackageDto } from './dto/queryAllPackage.dto';
import { UseCramiDto } from './dto/useCrami.dto';

@Injectable()
export class CramiService {
  constructor(
    @InjectRepository(CramiEntity)
    private readonly cramiEntity: Repository<CramiEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly userBalanceService: UserBalanceService,
  ) {}

  /* 查询单个套餐 */
  async queryOnePackage(id) {
    return await this.cramiPackageEntity.findOne({ where: { id } });
  }

  /* 查询所有套餐 */
  async queryAllPackage(query: QuerAllPackageDto) {
    try {
      const { page = 1, size = 10, name, status, type } = query;
      const where = {};
      name && Object.assign(where, { name: Like(`%${name}%`) });
      status && Object.assign(where, { status });
      if (type) {
        if (type > 0) {
          Object.assign(where, { days: MoreThan(0) });
        } else {
          Object.assign(where, { days: LessThanOrEqual(0) });
        }
      }
      const [rows, count] = await this.cramiPackageEntity.findAndCount({
        skip: (page - 1) * size,
        take: size,
        where,
        order: { order: 'DESC' },
      });
      return { rows, count };
    } catch (error) {
      Logger.error(`查询套餐失败: ${error.message || error}`, error?.stack, 'CramiService');
    }
  }

  /* 创建套餐 */
  async createPackage(body: CreatePackageDto) {
    const { name, weight } = body;
    const p = await this.cramiPackageEntity.findOne({
      where: [{ name }, { weight }],
    });
    if (p) {
      throw new HttpException('套餐名称或套餐等级重复、请检查！', HttpStatus.BAD_REQUEST);
    }
    // 处理 priceUsd 字段：空字符串转为 null
    if ((body.priceUsd as any) === '' || body.priceUsd === undefined || body.priceUsd === null) {
      body.priceUsd = null;
    }
    try {
      return await this.cramiPackageEntity.save(body);
    } catch (error) {
      Logger.error(`创建套餐失败: ${error.message || error}`, error?.stack, 'CramiService');
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
  }

  /* 更新套餐 E */
  async updatePackage(body) {
    const { id, name, weight } = body;
    const op = await this.cramiPackageEntity.findOne({ where: { id } });
    if (!op) {
      throw new HttpException('当前套餐不存在、请检查你的输入参数！', HttpStatus.BAD_REQUEST);
    }
    const count = await this.cramiPackageEntity.count({
      where: [
        { name, id: Not(id) },
        { weight, id: Not(id) },
      ],
    });
    if (count) {
      throw new HttpException('套餐名称或套餐等级重复、请检查！', HttpStatus.BAD_REQUEST);
    }

    // 处理 priceUsd 字段：空字符串转为 null
    if ((body.priceUsd as any) === '' || body.priceUsd === undefined || body.priceUsd === null) {
      body.priceUsd = null;
    }

    const res = await this.cramiPackageEntity.update({ id }, body);
    if (res.affected > 0) {
      return '更新套餐成功！';
    } else {
      throw new HttpException('更新套餐失败、请重试！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除套餐 */
  async delPackage(body: DeletePackageDto) {
    const { id } = body;
    const count = await this.cramiEntity.count({ where: { packageId: id } });
    if (count) {
      throw new HttpException(
        '当前套餐下存在卡密、请先删除卡密后才可删除套餐！',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.cramiPackageEntity.delete({ id });
  }

  /* 生成卡密 */
  async createCrami(body: CreatCramiDto) {
    const {
      packageId,
      count = 1,
      cramiType = 1,
      maxUseCount = 0,
      expireDays = 0,
      expireDate,
    } = body;

    // 计算卡密过期时间
    let expireTime: Date | null = null;
    if (expireDate) {
      // 优先使用指定日期
      expireTime = new Date(expireDate);
      expireTime.setHours(23, 59, 59, 999); // 设置为当天最后一刻
    } else if (expireDays > 0) {
      // 使用天数计算
      expireTime = new Date();
      expireTime.setDate(expireTime.getDate() + expireDays);
      expireTime.setHours(23, 59, 59, 999);
    }

    /* 创建有套餐的卡密 */
    if (packageId) {
      const pkg = await this.cramiPackageEntity.findOne({
        where: { id: packageId },
      });
      if (!pkg) {
        throw new HttpException(
          '当前套餐不存在、请确认您选择的套餐是否存在！',
          HttpStatus.BAD_REQUEST,
        );
      }
      const { days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0, appCats = '' } = pkg;
      const baseCrami = {
        packageId,
        days,
        model3Count,
        model4Count,
        drawMjCount,
        appCats,
        cramiType,
        maxUseCount: cramiType === 2 ? maxUseCount : 0,
        expireTime,
      };
      return await this.generateCrami(baseCrami, count);
    }
    /* 创建自定义的卡密 */
    if (!packageId) {
      const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
      if ([model3Count, model4Count, drawMjCount].every(v => !v)) {
        throw new HttpException('自定义卡密必须至少一项余额不为0️零！', HttpStatus.BAD_REQUEST);
      }
      const baseCrami = {
        days: -1,
        model3Count,
        model4Count,
        drawMjCount,
        cramiType,
        maxUseCount: cramiType === 2 ? maxUseCount : 0,
        expireTime,
      };
      return await this.generateCrami(baseCrami, count);
    }
  }

  /* 创建卡密 */
  async generateCrami(cramiInfo, count: number) {
    const cramiList = [];
    for (let i = 0; i < count; i++) {
      const code = generateCramiCode();
      const crami = this.cramiEntity.create({ ...cramiInfo, code });
      cramiList.push(crami);
    }
    return await this.cramiEntity.save(cramiList);
  }

  /* 使用卡密 */
  async useCrami(req: Request, body: UseCramiDto) {
    const { id } = req.user;
    return await this.cramiEntity.manager.transaction(async manager => {
      const crami = await manager.findOne(CramiEntity, {
        where: { code: body.code },
        lock: { mode: 'pessimistic_write' },
      });
      if (!crami) {
        throw new HttpException(
          '当前卡密不存在、请确认您输入的卡密是否正确！',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (crami.expireTime && new Date() > new Date(crami.expireTime)) {
        throw new HttpException(
          `该卡密已过期（过期时间：${new Date(crami.expireTime).toLocaleDateString()}），无法使用`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const {
        status,
        days = -1,
        model3Count = 0,
        model4Count = 0,
        drawMjCount = 0,
        packageId,
        appCats,
        cramiType,
      } = crami;

      const existingUse = crami.useIds
        ? crami.useIds
            .split(',')
            .map(uid => uid.trim())
            .includes(String(id))
        : false;
      if (existingUse) {
        throw new HttpException('您已使用过该卡密，每人仅可使用一次', HttpStatus.BAD_REQUEST);
      }

      if (cramiType === 1) {
        if (status === 1) {
          throw new HttpException(
            '当前卡密已被使用、请确认您输入的卡密是否正确！',
            HttpStatus.BAD_REQUEST,
          );
        }

        const updateResult = await manager.update(
          CramiEntity,
          { id: crami.id, status: 0 },
          { useId: id, status: 1 },
        );
        if (updateResult.affected !== 1) {
          throw new HttpException('当前卡密已被使用、请刷新后重试！', HttpStatus.BAD_REQUEST);
        }
      } else if (cramiType === 2) {
        if (crami.maxUseCount > 0 && crami.currentUseCount >= crami.maxUseCount) {
          throw new HttpException(
            `该卡密使用次数已达上限（${crami.currentUseCount}/${crami.maxUseCount}）`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const newUseIds = crami.useIds ? `${crami.useIds},${id}` : String(id);
        await manager.update(
          CramiEntity,
          { id: crami.id },
          {
            useIds: newUseIds,
            currentUseCount: crami.currentUseCount + 1,
          },
        );
      }

      const balanceInfo = {
        model3Count,
        model4Count,
        drawMjCount,
        packageId,
        appCats,
      };
      await this.userBalanceService.addBalanceToUser(id, { ...balanceInfo }, days, manager);

      await this.userBalanceService.saveRecordRechargeLog(
        {
          userId: id,
          rechargeType: RechargeType.PACKAGE_GIFT,
          model3Count,
          model4Count,
          drawMjCount,
          days,
        },
        manager,
      );

      return '使用卡密成功';
    });
  }

  /* 查询所有卡密 */
  async queryAllCrami(params: QuerAllCramiDto, req: Request) {
    const { page = 1, size = 10, status, useId } = params;
    const where = {};
    status && Object.assign(where, { status });
    useId && Object.assign(where, { useId });
    const [rows, count] = await this.cramiEntity.findAndCount({
      skip: (page - 1) * size,
      take: size,
      order: { createdAt: 'DESC' },
      where,
    });

    const packageIds = rows.map(t => t.packageId);
    const packageInfos = await this.cramiPackageEntity.find({
      where: { id: In(packageIds) },
    });

    rows.forEach((t: any) => {
      // 套餐名称
      t.packageName = packageInfos.find(p => p.id === t.packageId)?.name;

      // 卡密类型文本
      t.cramiTypeText = t.cramiType === 1 ? '单次使用' : '多次可复用';

      // 使用进度
      if (t.cramiType === 1) {
        t.useProgress = t.status === 1 ? '1/1' : '0/1';
      } else if (t.cramiType === 2) {
        const max = t.maxUseCount > 0 ? t.maxUseCount : '∞';
        t.useProgress = `${t.currentUseCount}/${max}`;
        t.useCount = t.currentUseCount;
        t.userCount = t.currentUseCount;
      }

      // 过期状态
      if (t.expireTime) {
        const now = new Date();
        const expireDate = new Date(t.expireTime);
        if (now > expireDate) {
          t.expireStatus = '已过期';
          t.isExpired = true;
        } else {
          const diffTime = expireDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays <= 7) {
            t.expireStatus = `${diffDays}天后过期`;
          } else {
            t.expireStatus = expireDate.toLocaleDateString();
          }
          t.isExpired = false;
        }
      } else {
        t.expireStatus = '永久有效';
        t.isExpired = false;
      }

      // 综合状态
      if (t.isExpired) {
        t.statusText = '已过期';
      } else if (t.cramiType === 1) {
        t.statusText = t.status === 1 ? '已使用' : '未使用';
      } else {
        if (t.currentUseCount === 0) {
          t.statusText = '未使用';
        } else if (t.maxUseCount > 0 && t.currentUseCount >= t.maxUseCount) {
          t.statusText = '已达上限';
        } else {
          t.statusText = '使用中';
        }
      }
    });

    req.user.role !== 'super' && rows.forEach((t: any) => (t.code = maskCrami(t.code)));
    return { rows, count };
  }

  /* 删除卡密 */
  async delCrami(id) {
    const c = await this.cramiEntity.findOne({ where: { id } });
    if (!c) {
      throw new HttpException(
        '当前卡密不存在、请确认您要删除的卡密是否存在！',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (c.status === 1) {
      throw new HttpException('当前卡密已被使用、已使用的卡密禁止删除！', HttpStatus.BAD_REQUEST);
    }
    return await this.cramiEntity.delete({ id });
  }

  async batchDelCrami(body: BatchDelCramiDto) {
    const { ids } = body;
    const res = await this.cramiEntity.delete(ids);
    if (res.affected > 0) {
      return '删除卡密成功！';
    } else {
      throw new HttpException('删除卡密失败、请重试！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询卡密使用详情 */
  async queryCramiUseDetail(id: number, req: Request) {
    const crami = await this.cramiEntity.findOne({ where: { id } });
    if (!crami) {
      throw new HttpException('卡密不存在', HttpStatus.BAD_REQUEST);
    }

    const result: any = {
      code: crami.code,
      cramiType: crami.cramiType,
      cramiTypeText: crami.cramiType === 1 ? '单次使用' : '多次可复用',
      maxUseCount: crami.maxUseCount,
      currentUseCount: crami.currentUseCount,
      expireTime: crami.expireTime,
      useLogs: [],
    };

    // 获取使用记录
    if (crami.cramiType === 1 && crami.useId) {
      // 单次使用卡密
      const user = await this.userEntity.findOne({ where: { id: crami.useId } });
      if (user) {
        result.useLogs = [
          {
            userId: user.id,
            username: user.username,
            useTime: crami.updatedAt,
          },
        ];
      }
    } else if (crami.cramiType === 2 && crami.useIds) {
      // 多次使用卡密
      const userIds = crami.useIds.split(',').map(uid => Number(uid.trim()));
      const users = await this.userEntity.find({ where: { id: In(userIds) } });

      result.useLogs = userIds.map(userId => {
        const user = users.find(u => u.id === userId);
        return {
          userId,
          username: user?.username || '未知用户',
          useTime: null, // 暂时无法获取具体使用时间，可以后续扩展
        };
      });
    }

    return result;
  }
}
