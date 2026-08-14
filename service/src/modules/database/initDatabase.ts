import { Logger } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
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
import { PresetEntity } from '../preset/preset.entity';
import { PresetCategoryEntity } from '../presetCategory/presetCategory.entity';
import { Share } from '../share/share.entity';
import { SigninEntity } from '../signin/signIn.entity';
import { UserEntity } from '../user/user.entity';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { VerificationEntity } from '../verification/verification.entity';

loadEnv();

const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  port: parseInt(process.env.DB_PORT, 10),
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  entities: [
    // 先创建基础表
    UserEntity,
    ConfigEntity,
    ModelsEntity,
    AppCatsEntity,
    PresetCategoryEntity,

    // 然后创建依赖表
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
    AccountLogEntity,
    FingerprintLogEntity,
    BalanceEntity,
    UserBalanceEntity,
    PluginEntity,
    PresetEntity,
    ChatLogEntity,
    UserAppsEntity,
    AppEntity,
    OrderEntity,
  ],
  synchronize: true, // 启用自动同步
  charset: 'utf8mb4',
  timezone: '+08:00',
  logging: false, // 关闭日志避免过多输出
};

export async function initDatabase() {
  try {
    Logger.log('开始数据库初始化', 'Database');

    // 创建数据源但不启用自动同步
    const cleanupDataSourceOptions: DataSourceOptions = {
      ...dataSourceOptions,
      synchronize: false, // 先不同步，只连接
    };

    const cleanupDataSource = new DataSource(cleanupDataSourceOptions);
    await cleanupDataSource.initialize();
    Logger.log('数据库连接成功', 'Database');

    try {
      // 清理无效的外键引用
      Logger.log('正在清理无效的外键引用', 'Database');

      // 获取所有用户ID
      const userIds = await cleanupDataSource.query('SELECT id FROM users');
      const validUserIds = userIds.map(u => u.id);

      if (validUserIds.length > 0) {
        // 清理各个表中的无效userId引用
        const tablesToClean = [
          'chat_group',
          'chat_log',
          // 'share', // share表没有userId字段
          'signin',
          'user_apps',
          'account_log',
          'fingerprint_log',
          'balance',
          'user_balance',
          'violation_log',
          'orders',
          'mcp_config',
        ];

        for (const table of tablesToClean) {
          try {
            const result = await cleanupDataSource.query(
              `DELETE FROM \`${table}\` WHERE userId NOT IN (${validUserIds
                .map(() => '?')
                .join(',')})`,
              validUserIds,
            );
            if (result.affectedRows > 0) {
              Logger.log(`清理了表 ${table} 中的 ${result.affectedRows} 条无效记录`, 'Database');
            }
          } catch (err) {
            // 表可能不存在或没有userId列，忽略错误
          }
        }
      }
    } catch (cleanupError) {
      Logger.warn(`清理无效外键引用时出错: ${cleanupError.message}`, 'Database');
      // 继续执行，不中断初始化
    }

    // 关闭清理连接
    await cleanupDataSource.destroy();

    // 现在使用synchronize: true进行数据库同步
    const dataSource = new DataSource(dataSourceOptions);
    await dataSource.initialize();
    Logger.log('数据库结构同步成功', 'Database');

    // 关闭连接
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }

    Logger.log('数据库初始化完成', 'Database');
  } catch (error) {
    Logger.error(`数据库初始化错误: ${error.message}`, 'Database');
    if (error instanceof SyntaxError) {
      Logger.error(
        `语法错误详情: ${JSON.stringify({
          name: error.name,
          message: error.message,
          stack: error.stack,
        })}`,
        'Database',
      );
    }
  }
}
