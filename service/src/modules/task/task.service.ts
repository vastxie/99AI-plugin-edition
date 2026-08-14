import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async refreshWechatAccessToken(): Promise<void> {
    const { wechatOfficialAppId, wechatOfficialAppSecret } =
      await this.globalConfigService.getConfigs(['wechatOfficialAppId', 'wechatOfficialAppSecret']);
    if (wechatOfficialAppId && wechatOfficialAppSecret) {
      await this.globalConfigService.getWechatAccessToken();
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshLegacyWechatAccessToken(): Promise<void> {
    const { wechatOldAppId, wechatOldSecret } = await this.globalConfigService.getConfigs([
      'wechatOldAppId',
      'wechatOldSecret',
    ]);
    if (wechatOldAppId && wechatOldSecret) {
      await this.globalConfigService.getOldWechatAccessToken();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async clearExpiredMemberships(): Promise<void> {
    const expiredBalances = await this.userBalanceEntity.find({
      where: { expirationTime: LessThanOrEqual(new Date()) },
    });

    for (const balance of expiredBalances) {
      await this.userBalanceEntity.update(
        { id: balance.id },
        {
          expirationTime: null,
          packageId: 0,
          memberModel3Count: 0,
          memberModel4Count: 0,
          memberDrawMjCount: 0,
          appCats: '',
        },
      );
      Logger.debug(`已清理过期会员余额记录 ${balance.id}`, 'TaskService');
    }
  }
}
