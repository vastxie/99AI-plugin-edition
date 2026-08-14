import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Connection } from 'typeorm';

interface UserInfo {
  username: string;
  password: string;
  status: number;
  email: string;
  role: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private connection: Connection) {}
  async onModuleInit() {
    await this.checkSuperAdmin();
    await this.checkSiteBaseConfig();
  }

  /**
   * 首次初始化必须由部署者显式提供管理员密码。
   * 缺少安全初始化信息时抛错，NestJS 将不会开始监听公网端口。
   */
  async checkSuperAdmin() {
    const user = await this.connection.query(`SELECT id FROM users WHERE role = ? LIMIT 1`, [
      'super',
    ]);
    if (!user || user.length === 0) {
      const username = (process.env.INITIAL_ADMIN_USERNAME || 'super').trim();
      const password = process.env.INITIAL_ADMIN_PASSWORD || '';
      const email = (process.env.INITIAL_ADMIN_EMAIL || 'admin@localhost.invalid').trim();

      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        throw new Error('INITIAL_ADMIN_USERNAME 必须为 3-32 位字母、数字、下划线或连字符');
      }
      const normalizedPassword = password.trim().toLowerCase();
      const rejectedPasswords = new Set([
        '123456',
        'changeme',
        'change_me_required',
        'replace-with-at-least-12-characters',
      ]);
      if (
        password.length < 12 ||
        rejectedPasswords.has(normalizedPassword) ||
        /^(.)\1+$/.test(password)
      ) {
        Logger.error(
          '首次启动需要设置至少 12 位的 INITIAL_ADMIN_PASSWORD，服务已拒绝初始化',
          'DatabaseService',
        );
        throw new Error('INITIAL_ADMIN_PASSWORD 未设置或不符合安全要求');
      }

      const superUserinfo = {
        username,
        password: await bcrypt.hash(password, 12),
        status: 1,
        email,
        role: 'super',
      };
      await this.createDefaultUser(superUserinfo);
    }
  }

  /* 初始化创建 超级管理员和管理员 */
  async createDefaultUser(userInfo: UserInfo) {
    try {
      const { username, password, status, email, role } = userInfo;
      await this.connection.transaction(async manager => {
        const user = await manager.query(
          'INSERT INTO users (username, password, status, email, role) VALUES (?, ?, ?, ?, ?)',
          [username, password, status, email, role],
        );
        await manager.query(
          'INSERT INTO balance (userId, balance, usesLeft, paintCount) VALUES (?, 0, 1000, 100)',
          [user.insertId],
        );
      });
      Logger.log(`初始化创建 ${role} 用户成功`, 'DatabaseService');
    } catch (error) {
      Logger.error(`创建默认超级管理员失败: ${error.message || error}`, error?.stack, 'DatabaseService');
      throw new HttpException('创建默认超级管理员失败！', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 检测有没有网站基础配置 */
  async checkSiteBaseConfig() {
    const keys = ['siteName'];
    const result = await this.connection.query(`
  SELECT COUNT(*) AS count FROM config WHERE \`configKey\` IN (${keys.map(k => `'${k}'`).join(',')})
`);
    const count = parseInt(result[0].count);
    if (count === 0) {
      await this.createBaseSiteConfig();
    }
  }

  /* 创建基础的网站数据 */
  async createBaseSiteConfig() {
    try {
      const noticeInfo = `
#### 欢迎使用 99AI Plugin Edition
 - 首次部署的管理员账号由 INITIAL_ADMIN_* 环境变量初始化。
 - 登录后请及时检查系统配置、模型密钥与公开文件策略。
`;

      const defaultConfig = [
        { configKey: 'siteName', configVal: '99AI Plugin Edition', public: 1, encrypt: 0 },
        {
          configKey: 'userDefaultAvatar',
          configVal: '',
          public: 0,
          encrypt: 0,
        },
        { configKey: 'baiduSiteId', configVal: '', public: 0, encrypt: 0 },
        {
          configKey: 'baiduToken',
          configVal: '',
          public: 0,
          encrypt: 0,
        },
        {
          configKey: 'openaiBaseUrl',
          configVal: 'https://api.openai.com',
          public: 0,
          encrypt: 0,
        },
        { configKey: 'openaiBaseKey', configVal: '', public: 0, encrypt: 0 },
        { configKey: 'noticeInfo', configVal: noticeInfo, public: 1, encrypt: 0 },
        {
          configKey: 'registerSendStatus',
          configVal: '1',
          public: 1,
          encrypt: 0,
        },
        {
          configKey: 'registerSendModel3Count',
          configVal: '30',
          public: 1,
          encrypt: 0,
        },
        {
          configKey: 'registerSendModel4Count',
          configVal: '3',
          public: 1,
          encrypt: 0,
        },
        {
          configKey: 'registerSendDrawMjCount',
          configVal: '3',
          public: 1,
          encrypt: 0,
        },
        { configKey: 'isVerifyEmail', configVal: '1', public: 1, encrypt: 0 },
        { configKey: 'model3Name', configVal: '普通积分', public: 1, encrypt: 0 },
        { configKey: 'model4Name', configVal: '高级积分', public: 1, encrypt: 0 },
        { configKey: 'drawMjName', configVal: '绘画积分', public: 1, encrypt: 0 },
      ];

      const res = await this.connection.query(
        `INSERT INTO config (configKey, configVal, public, encrypt) VALUES ${defaultConfig
          .map(
            d =>
              `('${d.configKey}', '${d.configVal.replace(/'/g, "\\'")}', '${d.public}', '${
                d.encrypt
              }')`,
          )
          .join(', ')}`,
      );
      Logger.log(
        `初始化网站配置信息成功、如您需要修改网站配置信息，请前往管理系统系统配置设置 ==============> 请注意查阅`,
        'DatabaseService',
      );
    } catch (error) {
      Logger.error(`创建默认网站配置失败: ${error.message || error}`, error?.stack, 'DatabaseService');
      throw new HttpException('创建默认网站配置失败！', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
