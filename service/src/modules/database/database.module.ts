import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseService } from './database.service';
import { DatabaseCleanupService } from './cleanup.service';
import { DatabaseController } from './database.controller';

// Import all entities explicitly
import { AppEntity } from '../app/app.entity';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { AutoReplyEntity } from '../autoReply/autoReply.entity';
import { WhitelistEntity } from '../badWords/whitelist.entity';
import { ViolationLogEntity } from '../badWords/violationLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiEntity } from '../crami/crami.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MCPConfigEntity } from '../mcp/mcp.entity';
import { ModelsEntity } from '../models/models.entity';
import { OrderEntity } from '../order/order.entity';
import { PluginEntity } from '../plugin/plugin.entity';
import { Share } from '../share/share.entity';
import { SigninEntity } from '../signin/signIn.entity';
import { UserEntity } from '../user/user.entity';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { VerificationEntity } from '../verification/verification.entity';
import { PresetEntity } from '../preset/preset.entity';
import { PresetCategoryEntity } from '../presetCategory/presetCategory.entity';
import { FileVectorCacheEntity } from '../aiTool/search/fileVectorCache.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_DATABASE,
        createForeignKeyConstraints: false, // 禁用外键约束
        entities: [
          Share,
          AutoReplyEntity,
          CramiEntity,
          CramiPackageEntity,
          WhitelistEntity,
          ChatGroupEntity,
          VerificationEntity,
          SigninEntity,
          ViolationLogEntity,
          MCPConfigEntity,
          ModelsEntity,
          UserEntity,
          AccountLogEntity,
          FingerprintLogEntity,
          BalanceEntity,
          UserBalanceEntity,
          PluginEntity,
          ConfigEntity,
          ChatLogEntity,
          UserAppsEntity,
          AppCatsEntity,
          AppEntity,
          OrderEntity,
          PresetEntity,
          PresetCategoryEntity,
          FileVectorCacheEntity,
        ],
        synchronize: process.env.DB_SYNC === 'true',
        logging: false,
        charset: 'utf8mb4',
        timezone: '+08:00',
      }),
    }),
  ],
  providers: [DatabaseService, DatabaseCleanupService],
  controllers: [DatabaseController],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly connection: DataSource) {}

  async onModuleInit(): Promise<void> {
    const { database, synchronize } = this.connection.options;
    Logger.log(`MySQL 数据库 ${database} 已连接`, 'DatabaseModule');

    if (synchronize) {
      Logger.warn('数据库同步已启用 - 生产环境建议设置 DB_SYNC=false', 'DatabaseModule');
    }
  }
}
