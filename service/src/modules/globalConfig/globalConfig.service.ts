import { formatUrl, hideString } from '@/common/utils';
import { PerformanceMonitor } from '@/common/utils/performanceMonitor';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Request } from 'express';
import * as fs from 'fs';
import { In, Repository } from 'typeorm';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { ChatLogEntity } from './../chatLog/chatLog.entity';
import { ModelsService } from './../models/models.service';
import { ConfigEntity } from './config.entity';
import { QueryConfigDto } from './dto/queryConfig.dto';
import { SetConfigDto } from './dto/setConfig.dto';
import { getChannelConfigStatus, isChannelConfigured } from './payment-config.helper';
const packageJsonContent = fs.readFileSync('package.json', 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const version = packageJson.version;
Logger.log(`当前版本: ${version}`, 'GlobalConfigService');

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  // Redis 缓存键前缀
  private readonly CACHE_PREFIX = 'globalConfig:';
  private readonly MCP_CONFIG_CACHE_KEY = 'mcp:cache:config';
  private readonly MCP_TOOLS_CACHE_KEY = 'mcp:cache:tools';

  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly modelsService: ModelsService,
    private readonly redisCacheService: RedisCacheService,
    private readonly moduleRef: ModuleRef,
  ) {}
  private globalConfigs: any = {};
  private wechatAccessToken: string;
  private wechatJsapiTicket: string;
  private oldWechatAccessToken: string;
  private oldWechatJsapiTicket: string;
  private isUpdatingConfig: boolean = false;

  private readonly paymentUrlConfigKeys = new Set([
    'payWeChatNotifyUrl',
    'payEpayNotifyUrl',
    'payEpayReturnUrl',
    'payEpayApiPayUrl',
    'payEpayApiQueryUrl',
    'alipayNotifyUrl',
    'alipayReturnUrl',
    'payHupiNotifyUrl',
    'payHupiReturnUrl',
    'payHupiGatewayUrl',
    'payMpayNotifyUrl',
    'payMpayReturnUrl',
    'payMpayApiPayUrl',
    'payMpayApiQueryUrl',
    'payLtzfNotifyUrl',
    'payLtzfReturnUrl',
    'payPalReturnUrl',
    'payPalCancelUrl',
    'stripeSuccessUrl',
    'stripeCancelUrl',
  ]);

  private isSensitiveConfigKey(configKey: string) {
    const normalizedKey = configKey.toLowerCase();
    return (
      normalizedKey.includes('secret') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('privatekey') ||
      normalizedKey.includes('publickey') ||
      normalizedKey.includes('accesskey') ||
      normalizedKey.includes('apikey') ||
      normalizedKey.includes('webhookid') ||
      normalizedKey.endsWith('key') ||
      normalizedKey.includes('password')
    );
  }

  private maskConfigValue(configKey: string, configVal: any) {
    if (!configVal) {
      return configVal;
    }
    return this.isSensitiveConfigKey(configKey) ? '**********' : configVal;
  }

  private validatePaymentUrlSettings(settings: Array<{ configKey: string; configVal: any }>) {
    if (!Array.isArray(settings)) {
      return;
    }

    for (const item of settings) {
      if (!this.paymentUrlConfigKeys.has(item.configKey) || !item.configVal) {
        continue;
      }

      try {
        const url = new URL(String(item.configVal));
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('unsupported protocol');
        }
        const hostname = url.hostname.toLowerCase();
        const isLocalhost =
          ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.local');
        if (!isLocalhost && url.protocol !== 'https:') {
          throw new Error('http not allowed for public URL');
        }
      } catch {
        throw new HttpException(
          `支付配置 ${item.configKey} 必须是 http 或 https 地址`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  async onModuleInit() {
    await this.initGetAllConfig();
  }

  /* 对外提供给其他service  */
  async getConfigs(configKey: string[]) {
    const startTime = Date.now();
    while (this.isUpdatingConfig) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 记录性能指标（隐含验证）
    PerformanceMonitor.recordTiming('config_access', Date.now() - startTime);

    if (configKey.length === 0) return;
    /* 微信token特殊处理 */
    if (configKey.includes('wechatAccessToken') && configKey.length === 1) {
      return this.wechatAccessToken;
    }
    if (configKey.includes('wechatJsapiTicket') && configKey.length === 1) {
      return this.wechatJsapiTicket;
    }
    /* 旧微信token特殊处理 */
    if (configKey.includes('oldWechatAccessToken') && configKey.length === 1) {
      return this.oldWechatAccessToken;
    }
    if (configKey.includes('oldWechatJsapiTicket') && configKey.length === 1) {
      return this.oldWechatJsapiTicket;
    }

    if (configKey.length === 1) {
      const value = this.globalConfigs[configKey[0]];
      return value;
    } else {
      const result = {};
      configKey.forEach(key => {
        result[key] = this.globalConfigs[key];
      });
      return result;
    }
  }

  /* 初始化查询所有config 不对外调用 */
  async initGetAllConfig() {
    const data = await this.configEntity.find();
    this.globalConfigs = data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});

    // 延迟初始化百度敏感词，避免在缓存更新过程中的递归调用
    setTimeout(() => {
      this.initBaiduSensitive();
    }, 100);
  }

  /* 初始化百度敏感词 拿到百度的access_token isInit: 初始化报错不检测  管理端手动修改则提示 */
  async initBaiduSensitive(isInit = true) {
    const { baiduTextApiKey, baiduTextSecretKey } = await this.getConfigs([
      'baiduTextApiKey',
      'baiduTextSecretKey',
    ]);
    if (!baiduTextApiKey || !baiduTextSecretKey) {
      // Logger.error('百度敏感词初始化失败，如果需要敏感检测、请前往后台系统配置!', 'GlobalConfigService');
      return { success: false, message: '百度API密钥或SecretKey未配置' };
    }
    const url = `https://aip.baidubce.com/oauth/2.0/token?client_id=${baiduTextApiKey}&client_secret=${baiduTextSecretKey}&grant_type=client_credentials`;
    try {
      // 百度OAuth2.0接口使用GET请求
      const response = await axios.get(url, { timeout: 10000 }); // 添加10秒超时
      if (response.data && response.data.access_token) {
        this.globalConfigs.baiduTextAccessToken = response.data.access_token;
        return { success: true, message: '百度文本审核配置成功，Token获取成功' };
      } else {
        throw new Error('获取access_token失败');
      }
    } catch (error) {
      const errorMsg =
        error?.response?.data?.error_description || error?.message || '百度API密钥配置错误';
      Logger.error(`百度敏感词配置检测失败: ${errorMsg}`, 'GlobalConfigService');
      if (!isInit) {
        throw new HttpException(`百度文本审核配置错误: ${errorMsg}`, HttpStatus.BAD_REQUEST);
      }
      return { success: false, message: `百度文本审核配置错误: ${errorMsg}` };
    }
  }

  /* 测试百度文本审核配置 */
  async testBaiduConfig() {
    try {
      const result = await this.initBaiduSensitive(false);
      if (result.success) {
        // 测试一个简单的文本审核请求
        const testText = '这是一个测试文本';
        const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${this.globalConfigs.baiduTextAccessToken}`;

        try {
          const params = new URLSearchParams();
          params.append('text', testText);
          const response = await axios.post(url, params, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            timeout: 5000,
          });

          if (response.data && response.data.conclusion) {
            return {
              success: true,
              message: '百度文本审核配置测试成功',
              detail: `Token获取成功，测试文本审核返回结果: ${response.data.conclusion}`,
            };
          }
        } catch (testError) {
          Logger.warn('百度文本审核测试请求失败，但Token获取成功', 'GlobalConfigService');
          return {
            success: true,
            message: '百度文本审核Token获取成功',
            detail: 'Token获取成功，但测试请求失败（可能是网络原因），配置应该是正确的',
          };
        }
      }
      return result;
    } catch (error) {
      return {
        success: false,
        message: error.message || '百度文本审核配置测试失败',
      };
    }
  }

  /* 定时刷新 access_token（优先使用稳定版） */
  async getWechatAccessToken(isInit = false) {
    const { wechatOfficialAppId: appId, wechatOfficialAppSecret: secret } = await this.getConfigs([
      'wechatOfficialAppId',
      'wechatOfficialAppSecret',
    ]);
    if (!appId || !secret) {
      if (!isInit) {
        Logger.warn('微信公众号未配置，相关登录与菜单功能保持关闭', 'GlobalConfigService');
      }
      return;
    }

    // 优先使用稳定版 API，失败则降级到普通版
    try {
      this.wechatAccessToken = await this.fetchStableAccessToken(appId, secret);
    } catch (error) {
      Logger.warn(`稳定版 API 失败，降级到普通版: ${error.message}`, 'GlobalConfigService');
      this.wechatAccessToken = await this.fetchBaseAccessToken(appId, secret, isInit);
    }
  }

  /* 获取微信 URL 配置（优先使用数据库配置，其次环境变量，最后默认值） */
  async getWechatUrl(type: 'open' | 'api' | 'apiToken' | 'mp'): Promise<string> {
    const configKeyMap = {
      open: 'wechatOpenUrl',
      api: 'wechatApiUrl',
      apiToken: 'wechatApiUrlToken',
      mp: 'wechatMpUrl',
    };

    const defaultUrlMap = {
      open: 'https://open.weixin.qq.com',
      api: 'https://api.weixin.qq.com',
      apiToken: 'https://api.weixin.qq.com/cgi-bin/token',
      mp: 'https://mp.weixin.qq.com',
    };

    const envKeyMap = {
      open: 'weChatOpenUrl',
      api: 'weChatApiUrl',
      apiToken: 'weChatApiUrlToken',
      mp: 'weChatMpUrl',
    };

    // 1. 优先从数据库配置读取
    const dbConfig = await this.getConfigs([configKeyMap[type]]);
    if (dbConfig && dbConfig[configKeyMap[type]]) {
      return formatUrl(dbConfig[configKeyMap[type]]);
    }

    // 2. 其次从环境变量读取
    const envValue = process.env[envKeyMap[type]];
    if (envValue) {
      return formatUrl(envValue);
    }

    // 3. 最后使用默认值
    return defaultUrlMap[type];
  }

  /* 定时刷新旧账号的 access_token（优先使用稳定版） */
  async getOldWechatAccessToken(isInit = false) {
    try {
      const { oldWechatOfficialAppId: appId, oldWechatOfficialAppSecret: secret } =
        await this.getConfigs(['oldWechatOfficialAppId', 'oldWechatOfficialAppSecret']);

      if (!appId || !secret) {
        return null;
      }

      if (process.env.ISDEV === 'true') {
        Logger.log('开发环境下，返回空token', 'GlobalConfigService');
        return null;
      }

      // 优先使用稳定版 API，失败则降级到普通版
      try {
        this.oldWechatAccessToken = await this.fetchStableAccessToken(appId, secret);
      } catch (stableError) {
        Logger.warn(
          `旧公众号稳定版 API 失败，降级到普通版: ${stableError.message}`,
          'GlobalConfigService',
        );
        this.oldWechatAccessToken = await this.fetchBaseAccessToken(appId, secret, isInit);
      }
    } catch (error) {
      Logger.error(`获取旧公众号 access_token 异常: ${error.message}`, 'GlobalConfigService');
      return null;
    }
  }

  /* 获取微信稳定版 access_token（推荐） */
  async fetchStableAccessToken(appId: string, secret: string): Promise<string> {
    if (process.env.ISDEV === 'true') {
      return '';
    }

    try {
      const Url = await this.getWechatUrl('api');
      const url = `${Url}/cgi-bin/stable_token`;

      const response = await axios.post(
        url,
        {
          grant_type: 'client_credential',
          appid: appId,
          secret: secret,
          force_refresh: false, // 使用普通模式，多次调用返回同一个 token
        },
        {
          timeout: 120000, // 120 秒超时
        },
      );

      const { errmsg, access_token, errcode, expires_in } = response.data;

      if (errmsg || errcode) {
        Logger.error(
          `获取稳定版 access_token 失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`,
          'GlobalConfigService',
        );
        return '';
      }

      if (!access_token) {
        Logger.error('未获取到稳定版 access_token', 'GlobalConfigService');
        return '';
      }

      return access_token;
    } catch (error) {
      Logger.error(`获取稳定版 access_token 异常: ${error.message}`, 'GlobalConfigService');
      throw error; // 抛出错误以便调用方降级处理
    }
  }

  /* 获取微信普通版 access_token（降级备用） */
  async fetchBaseAccessToken(appId: string, secret: string, isInit = false) {
    // 检查开发模式标志，开发模式下也应该需要获取token
    if (process.env.ISDEV === 'true') {
      return '';
    }

    try {
      const Url = await this.getWechatUrl('apiToken');
      const requestUrl = `${Url}?grant_type=client_credential&appid=${appId}&secret=${secret}`;

      const response = await axios.get(requestUrl, {
        timeout: 120000, // 120 秒超时
      });

      const { errmsg, access_token, errcode } = response.data;

      if (errmsg || errcode) {
        Logger.error(
          `获取普通版 access_token 失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`,
          'GlobalConfigService',
        );
        return '';
      }

      if (!access_token) {
        Logger.error('未获取到普通版 access_token', 'GlobalConfigService');
        return '';
      }

      return access_token;
    } catch (error) {
      Logger.error(`获取普通版 access_token 异常: ${error.message}`, 'GlobalConfigService');
      return '';
    }
  }

  /* 获取微信jsapi_ticket */
  async fetchJsapiTicket(accessToken: string) {
    if (process.env.ISDEV === 'true') {
      this.wechatJsapiTicket = '';
      return;
    }
    const Url = await this.getWechatUrl('api');
    const res = await axios.get(
      `${Url}/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`,
    );
    return res?.data?.ticket;
  }

  /* 查询所有配置信息 */
  async queryAllConfig(req: Request) {
    const configs = { ...this.globalConfigs };
    return Object.keys(configs).reduce((prev, key) => {
      prev[key] = this.maskConfigValue(key, configs[key]);
      return prev;
    }, {});
  }

  /* 前端网站的所有查阅权限的配置信息 */
  async queryFrontConfig(query, req) {
    /* 指定前端可以访问范围 */
    const allowKeys = [
      'registerSendStatus',
      'registerSendModel3Count',
      'registerSendModel4Count',
      'registerSendDrawMjCount',
      'clientHomePath',
      'clientLogoPath',
      'clientFaviconPath',
      'userDefaultAvatar',
      'isUseWxLogin',
      'siteName',
      'siteUrl',
      'siteRobotName',
      'payEpayChannel',
      'payMpayChannel',
      'payEpayApiPayUrl',
      'payEpayStatus',
      'payHupiStatus',
      'payWechatStatus',
      'payMpayStatus',
      'payLtzfStatus',
      'isAutoOpenNotice',
      'companyName',
      'filingNumber',
      'publicSecurityFilingNumber',
      'emailLoginStatus',
      'phoneLoginStatus',
      'openIdentity',
      'openPhoneValidation',
      'wechatRegisterStatus',
      'wechatSilentLoginStatus',
      'oldWechatMigrationStatus',
      'officialOldAccountSuccessText',
      'officialOldAccountFailText',
      'signInStatus',
      'signInModel3Count',
      'signInModel4Count',
      'signInMjDrawToken',
      'appMenuHeaderTips',
      'pluginFirst',
      'isVerifyEmail',
      'showWatermark',
      'showCrami',
      'ttsMode',
      'isHideDefaultPreset',
      'isHideModel3Point',
      'isHideModel4Point',
      'isHideDrawMjPoint',
      'isHidePlugin',
      'isHideSidebarApps',
      'model3Name',
      'model4Name',
      'drawMjName',
      'isModelInherited',
      'noVerifyRegister',
      'noticeInfo',
      'homeHtml',
      'isAutoOpenAgreement',
      'agreementInfo',
      'agreementTitle',
      'isEnableExternalLinks',
      'externalLinks',
      'clearCacheEnabled',
      'noticeTitle',
      'streamCacheEnabled',
      'homeWelcomeContent',
      'enableHtmlRender',
      'sideDrawingEditModel',
      'defaultLanguage',
      'enabledLanguages',
      'modelSelectorPosition',
      'uploadFileLimit',
      'uploadFileSizeLimit',
      'siteTitle',
      'siteDescription',
      'siteKeywords',
      'maxInputLength',
    ];
    const data = await this.configEntity.find({
      where: { configKey: In(allowKeys) },
    });
    const publicConfig = data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
    /* 追加一些自定义的配置 */
    const { wechatOfficialAppId, wechatOfficialAppSecret } = await this.getConfigs([
      'wechatOfficialAppId',
      'wechatOfficialAppSecret',
    ]);
    const isUseWxLogin = !!(wechatOfficialAppId && wechatOfficialAppSecret);

    /* 查看是否有本机未同步数据 */
    return { ...publicConfig, isUseWxLogin };
  }

  /* 查询配置 */
  async queryConfig(body: QueryConfigDto, req: Request) {
    const { keys } = body;
    const data = await this.configEntity.find({
      where: { configKey: In(keys) },
    });
    /* 敏感配置对任何管理角色都不返回原文，防止密钥进入浏览器 DOM。 */
    data.forEach(item => {
      if (this.isSensitiveConfigKey(item.configKey)) {
        item.configVal = this.maskConfigValue(item.configKey, item.configVal);
      }
    });

    /* 对演示账户继续隐藏非密钥型的内部配置。 */
    if (req.user.role !== 'super') {
      // data = data.filter((t) => !t.configKey.includes('Key'));
      data.forEach(item => {
        if (
          item.configKey.includes('mj') ||
          item.configKey.includes('Key') ||
          item.configKey.includes('gpt') ||
          item.configKey.includes('cos') ||
          item.configKey.includes('baidu') ||
          item.configKey.includes('ali') ||
          item.configKey.includes('tencent') ||
          item.configKey.includes('pay') ||
          item.configKey.includes('wechat') ||
          item.configKey.includes('mjProxyImgUrl') ||
          item.configKey === 'openaiBaseUrl'
        ) {
          /* 比较长的隐藏内容自定义 */
          const longKeys = [
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
            'payWeChatPlatformPublicKey',
          ];
          if (longKeys.includes(item.configKey)) {
            return (item.configVal = hideString(item.configVal, '隐私内容、非超级管理员无权查看'));
          }
          const whiteListKey = ['payEpayStatus', 'payHupiStatus', 'mjProxy', 'payLtzfStatus'];
          if (!whiteListKey.includes(item.configKey) && !item.configKey.includes('Status')) {
            item.configVal = hideString(item.configVal);
          }
        }
      });
    }

    return data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
  }

  /* 设置配置信息 */
  async setConfig(body: SetConfigDto) {
    // 设置更新标志，阻止并发读取
    this.isUpdatingConfig = true;

    try {
      const { settings } = body;
      this.validatePaymentUrlSettings(settings);

      // 使用事务确保数据一致性
      await this.configEntity.manager.transaction(async transactionalEntityManager => {
        for (const item of settings) {
          const { configKey, configVal } = item;
          const c = await transactionalEntityManager.findOne(ConfigEntity, {
            where: { configKey },
          });
          if (
            c &&
            this.isSensitiveConfigKey(configKey) &&
            configVal === this.maskConfigValue(configKey, c.configVal)
          ) {
            continue;
          }
          if (c) {
            await transactionalEntityManager.update(ConfigEntity, { configKey }, { configVal });
          } else {
            await transactionalEntityManager.save(ConfigEntity, {
              configKey,
              configVal,
            });
          }
        }
      });

      // 确保在事务成功后才更新缓存
      await this.initGetAllConfig();

      // 清除 Redis 中的配置缓存
      await this.clearConfigCache(settings.map(s => s.configKey));

      const keys = settings.map(t => t.configKey);

      /* 如果修改了百度配置，清除已缓存的token，下次使用时会自动重新获取 */
      if (keys.includes('baiduTextApiKey') || keys.includes('baiduTextSecretKey')) {
        this.globalConfigs.baiduTextAccessToken = null;
        Logger.log('百度文本审核配置已更新，已清除缓存的Token', 'GlobalConfigService');
      }

      /* 如果变更微信配置，异步刷新token，不阻塞响应 */
      if (keys.includes('wechatOfficialAppId') || keys.includes('wechatOfficialAppSecret')) {
        // 异步执行，不阻塞响应
        setImmediate(() => {
          this.getWechatAccessToken().catch(err => {
            Logger.error('微信access_token刷新失败，将在下次使用时重试', 'GlobalConfigService');
          });
        });
      }

      /* 如果修改了敏感词配置，重新加载敏感词库 */
      if (keys.includes('systemSensitiveStatus') || keys.includes('selectedVocabularies')) {
        setImmediate(() => {
          this.reloadSensitiveWords().catch(err => {
            Logger.error('敏感词库重新加载失败', 'GlobalConfigService');
          });
        });
      }

      return '设置完成！';
    } catch (error) {
      Logger.error(`配置更新失败: ${error.message}`, 'GlobalConfigService');
      throw new HttpException('设置配置信息错误！', HttpStatus.BAD_REQUEST);
    } finally {
      // 无论成功还是失败，都要释放锁
      this.isUpdatingConfig = false;
    }
  }

  /* 创建或更新配置信息 */
  async createOrUpdate(setting) {
    /* 后期追加配置非自动化的需要手动追加为public让前端查找 */
    try {
      const { configKey, configVal } = setting;
      const c = await this.configEntity.findOne({ where: { configKey } });
      if (c) {
        const res = await this.configEntity.update({ configKey }, { configVal });
      } else {
        const save = await this.configEntity.save({
          configKey,
          configVal,
        });
      }
    } catch (error) {
      Logger.error(`设置配置信息失败: ${error.message || error}`, error?.stack, 'GlobalConfigService');
      throw new HttpException('设置配置信息错误！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询公告信息 */
  async queryNotice() {
    return await this.getConfigs(['noticeInfo', 'noticeTitle']);
  }

  /* 开启多个支付规则的时候 按顺序只使用一个 - 旧版兼容 */

  /* 获取新版支付配置 - 支持多支付方式 */
  async getPaymentConfig() {
    // 获取支付方式配置
    const configs = await this.getConfigs([
      // 微信支付配置
      'paymentWechatEnabled',
      'paymentWechatChannel',
      'paymentWechatPriority',

      // 支付宝配置
      'paymentAlipayEnabled',
      'paymentAlipayChannel',
      'paymentAlipayPriority',

      // PayPal配置
      'paymentPaypalEnabled',
      'paymentPaypalChannel',
      'paymentPaypalPriority',

      // Stripe配置
      'paymentStripeEnabled',
      'paymentStripeChannel',
      'paymentStripePriority',
    ]);

    // 获取所有支付相关配置来检查渠道是否已配置
    const allPayConfigs = await this.getAllPaymentConfigs();

    const wechatChannel = configs.paymentWechatChannel || 'wechat_official';
    const alipayChannel = configs.paymentAlipayChannel || 'epay';
    const paypalChannel = configs.paymentPaypalChannel || 'paypal_official';
    const stripeChannel = configs.paymentStripeChannel || 'stripe_official';

    const wechatConfigured = isChannelConfigured(wechatChannel, allPayConfigs);
    const alipayConfigured = isChannelConfigured(alipayChannel, allPayConfigs);
    const paypalConfigured = isChannelConfigured(paypalChannel, allPayConfigs);
    const stripeConfigured = isChannelConfigured(stripeChannel, allPayConfigs);

    return {
      wechat: {
        enabled: configs.paymentWechatEnabled === '1' || configs.paymentWechatEnabled === 1,
        channel: wechatChannel,
        priority: Number(configs.paymentWechatPriority) || 1,
        configured: wechatConfigured,
      },
      alipay: {
        enabled: configs.paymentAlipayEnabled === '1' || configs.paymentAlipayEnabled === 1,
        channel: alipayChannel,
        priority: Number(configs.paymentAlipayPriority) || 2,
        configured: alipayConfigured,
      },
      paypal: {
        enabled: configs.paymentPaypalEnabled === '1' || configs.paymentPaypalEnabled === 1,
        channel: paypalChannel,
        priority: Number(configs.paymentPaypalPriority) || 3,
        configured: paypalConfigured,
      },
      stripe: {
        enabled: configs.paymentStripeEnabled === '1' || configs.paymentStripeEnabled === 1,
        channel: stripeChannel,
        priority: Number(configs.paymentStripePriority) || 4,
        configured: stripeConfigured,
      },
    };
  }

  /* 获取所有支付相关配置 */
  async getAllPaymentConfigs() {
    // 获取所有可能的支付配置键
    const paymentConfigKeys = [
      // 微信官方
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatSecret',
      'payWeChatNotifyUrl',
      'payWeChatVerifyMode',
      'payWeChatPlatformPublicKeyId',
      'payWeChatPlatformPublicKey',

      // 易支付
      'payEpayPid',
      'payEpayKey',
      'payEpayPrivateKey',
      'payEpayPublicKey',
      'payEpayNotifyUrl',
      'payEpayReturnUrl',
      'payEpayApiPayUrl',
      'payEpayApiQueryUrl',
      'payEpayApiVersion',

      // 支付宝官方
      'alipayAppId',
      'alipayPrivateKey',
      'alipayPublicKey',
      'alipayNotifyUrl',
      'alipayReturnUrl',

      // 虎皮椒
      'payHupiAppId',
      'payHupiAppSecret',
      'payHupiNotifyUrl',
      'payHupiReturnUrl',
      'payHupiGatewayUrl',

      // 码支付
      'payMpayPid',
      'payMpaySecret',
      'payMpayNotifyUrl',
      'payMpayReturnUrl',
      'payMpayApiPayUrl',
      'payMpayApiQueryUrl',

      // 蓝兔
      'payLtzfMchId',
      'payLtzfKey',
      'payLtzfNotifyUrl',
      'payLtzfReturnUrl',

      // PayPal官方
      'payPalClientId',
      'payPalClientSecret',
      'payPalMode',
      'payPalReturnUrl',
      'payPalCancelUrl',
      'payPalWebhookId',

      // Stripe官方
      'stripeSecretKey',
      'stripePublishableKey',
      'stripeMode',
      'stripeSuccessUrl',
      'stripeCancelUrl',
      'stripeWebhookSecret',
    ];

    return await this.getConfigs(paymentConfigKeys);
  }

  /* 获取支付渠道的配置状态 */
  async getPaymentChannelStatus() {
    const allConfigs = await this.getAllPaymentConfigs();
    const channels = [
      'wechat_official',
      'alipay_official',
      'epay',
      'hupi',
      'mpay',
      'ltzf',
      'paypal_official',
      'stripe_official',
    ];

    const status = {};
    for (const channel of channels) {
      status[channel] = getChannelConfigStatus(channel, allConfigs);
    }

    return status;
  }

  /* 迁移旧的支付配置到新结构 */

  /* 设置支付配置 */
  async setPaymentConfig(config: {
    wechat?: { enabled: boolean; channel: string; priority?: number };
    alipay?: { enabled: boolean; channel: string; priority?: number };
    paypal?: { enabled: boolean; channel: string; priority?: number };
  }) {
    const updateConfigs = [];

    if (config.wechat) {
      updateConfigs.push({
        configKey: 'paymentWechatEnabled',
        configVal: config.wechat.enabled ? '1' : '0',
      });
      updateConfigs.push({
        configKey: 'paymentWechatChannel',
        configVal: config.wechat.channel,
      });
      if (config.wechat.priority !== undefined) {
        updateConfigs.push({
          configKey: 'paymentWechatPriority',
          configVal: String(config.wechat.priority),
        });
      }
    }

    if (config.alipay) {
      updateConfigs.push({
        configKey: 'paymentAlipayEnabled',
        configVal: config.alipay.enabled ? '1' : '0',
      });
      updateConfigs.push({
        configKey: 'paymentAlipayChannel',
        configVal: config.alipay.channel,
      });
      if (config.alipay.priority !== undefined) {
        updateConfigs.push({
          configKey: 'paymentAlipayPriority',
          configVal: String(config.alipay.priority),
        });
      }
    }

    if (config.paypal) {
      updateConfigs.push({
        configKey: 'paymentPaypalEnabled',
        configVal: config.paypal.enabled ? '1' : '0',
      });
      updateConfigs.push({
        configKey: 'paymentPaypalChannel',
        configVal: config.paypal.channel,
      });
      if (config.paypal.priority !== undefined) {
        updateConfigs.push({
          configKey: 'paymentPaypalPriority',
          configVal: String(config.paypal.priority),
        });
      }
    }

    // 批量更新配置
    for (const config of updateConfigs) {
      await this.setConfig(config);
    }

    return { success: true };
  }

  /* get auth info */
  async getAuthInfo() {
    const { siteName, registerBaseUrl, domain } = await this.getConfigs([
      'siteName',
      'registerBaseUrl',
      'domain',
    ]);
    return { siteName, registerBaseUrl, domain };
  }

  /* get phone verify config */
  async getPhoneVerifyConfig() {
    const {
      phoneLoginStatus,
      aliPhoneAccessKeyId,
      aliPhoneAccessKeySecret,
      aliPhoneSignName,
      aliPhoneTemplateCode,
    } = await this.getConfigs([
      'phoneLoginStatus',
      'aliPhoneAccessKeyId',
      'aliPhoneAccessKeySecret',
      'aliPhoneSignName',
      'aliPhoneTemplateCode',
    ]);
    if (Number(phoneLoginStatus) !== 1) {
      throw new HttpException('手机验证码功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    return {
      accessKeyId: aliPhoneAccessKeyId,
      accessKeySecret: aliPhoneAccessKeySecret,
      SignName: aliPhoneSignName,
      TemplateCode: aliPhoneTemplateCode,
    };
  }

  /* get namespace */
  getNamespace() {
    return process.env.NAMESPACE || '99AIPlugin';
  }

  /* 获取签名赠送额度 */
  async getSignatureGiftConfig() {
    const {
      signInStatus = 0,
      signInModel3Count = 0,
      signInModel4Count = 0,
      signInMjDrawToken = 0,
    } = await this.getConfigs([
      'signInStatus',
      'signInModel3Count',
      'signInModel4Count',
      'signInMjDrawToken',
    ]);
    if (Number(signInStatus) !== 1) {
      throw new HttpException('签到功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    return {
      model3Count: Number(signInModel3Count),
      model4Count: Number(signInModel4Count),
      drawMjCount: Number(signInMjDrawToken),
    };
  }

  /* 拿到敏感次配置 都开启优先使用百度云 */
  async getSensitiveConfig() {
    const {
      baiduTextStatus = 0,
      baiduTextAccessToken,
      systemSensitiveStatus = 0,
      selectedVocabularies = '[]',
    } = await this.getConfigs([
      'baiduTextStatus',
      'baiduTextAccessToken',
      'systemSensitiveStatus',
      'selectedVocabularies',
    ]);

    // 百度云敏感词优先
    if (Number(baiduTextStatus) === 1) {
      return {
        useType: 'baidu',
        baiduTextAccessToken,
      };
    }

    // 系统内置敏感词
    if (Number(systemSensitiveStatus) === 1) {
      let vocabIds: string[] = [];
      try {
        vocabIds = JSON.parse(selectedVocabularies as string);
        if (!Array.isArray(vocabIds)) vocabIds = [];
      } catch {
        vocabIds = [];
      }
      return {
        useType: 'system',
        selectedVocabularies: vocabIds,
      };
    }

    return null;
  }

  /**
   * 重新加载敏感词库（配置更新时调用）
   * 使用 ModuleRef 动态获取 BadWordsService，避免循环依赖
   */
  private async reloadSensitiveWords(): Promise<void> {
    try {
      const { BadWordsService } = await import('../badWords/badWords.service');
      const badWordsService = this.moduleRef.get(BadWordsService, { strict: false });
      await badWordsService.reloadSystemWords();
    } catch (error) {
      Logger.error(`重新加载敏感词库失败: ${error.message}`, 'GlobalConfigService');
    }
  }

  /**
   * 清除 Redis 中的配置缓存
   */
  private async clearConfigCache(updatedKeys: string[]): Promise<void> {
    try {
      // 检查是否更新了 MCP 相关的配置
      const mcpRelatedKeys = [
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
      ];

      const hasMcpConfigUpdate = updatedKeys.some(key => mcpRelatedKeys.includes(key));

      if (hasMcpConfigUpdate) {
        Logger.log('检测到 MCP 相关配置更新，清除 MCP 缓存', 'GlobalConfigService');

        // 清除 MCP 相关的缓存
        await Promise.all([
          this.redisCacheService.del({ key: this.MCP_CONFIG_CACHE_KEY }),
          this.redisCacheService.del({ key: this.MCP_TOOLS_CACHE_KEY }),
        ]);
      }

      // 清除特定配置的缓存（如果有的话）
      for (const key of updatedKeys) {
        const cacheKey = `${this.CACHE_PREFIX}${key}`;
        await this.redisCacheService.del({ key: cacheKey });
      }

      Logger.log(`已清除 ${updatedKeys.length} 个配置项的 Redis 缓存`, 'GlobalConfigService');
    } catch (error) {
      Logger.error(`清除配置缓存失败: ${error.message}`, 'GlobalConfigService');
      // 缓存清除失败不应该影响配置更新，所以这里只记录错误
    }
  }

  /* 获取可用的支付方式列表（供用户端使用） */
  async getAvailablePaymentMethods() {
    // 强制刷新配置以确保获取最新数据
    await this.initGetAllConfig();

    const paymentConfig = await this.getPaymentConfig();

    const methods = [];
    const allConfigs = await this.getConfigs(this.getAllPaymentConfigKeys());

    // 微信支付
    if (paymentConfig.wechat?.enabled) {
      const channelStatus = getChannelConfigStatus(paymentConfig.wechat.channel, allConfigs);

      if (channelStatus.configured) {
        methods.push({
          method: 'wechat',
          name: '微信支付',
          channel: paymentConfig.wechat.channel,
          priority: paymentConfig.wechat.priority || 1,
          icon: 'wechat',
        });
      }
    }

    // 支付宝
    if (paymentConfig.alipay?.enabled) {
      const channelStatus = getChannelConfigStatus(paymentConfig.alipay.channel, allConfigs);

      if (channelStatus.configured) {
        methods.push({
          method: 'alipay',
          name: '支付宝',
          channel: paymentConfig.alipay.channel,
          priority: paymentConfig.alipay.priority || 2,
          icon: 'alipay',
        });
      }
    }

    // PayPal
    if (paymentConfig.paypal?.enabled) {
      const channelStatus = getChannelConfigStatus(paymentConfig.paypal.channel, allConfigs);

      if (channelStatus.configured) {
        methods.push({
          method: 'paypal',
          name: 'PayPal',
          channel: paymentConfig.paypal.channel,
          priority: paymentConfig.paypal.priority || 3,
          icon: 'paypal',
        });
      }
    }

    // Stripe
    if (paymentConfig.stripe?.enabled) {
      const channelStatus = getChannelConfigStatus(paymentConfig.stripe.channel, allConfigs);

      if (channelStatus.configured) {
        methods.push({
          method: 'stripe',
          name: 'Stripe',
          channel: paymentConfig.stripe.channel,
          priority: paymentConfig.stripe.priority || 4,
          icon: 'stripe',
        });
      }
    }

    // 按优先级排序
    methods.sort((a, b) => a.priority - b.priority);

    return methods;
  }

  /* 获取所有支付配置键名 */
  private getAllPaymentConfigKeys() {
    return [
      // 支付方式配置
      'paymentWechatEnabled',
      'paymentWechatChannel',
      'paymentWechatPriority',
      'paymentAlipayEnabled',
      'paymentAlipayChannel',
      'paymentAlipayPriority',
      'paymentPaypalEnabled',
      'paymentPaypalChannel',
      'paymentPaypalPriority',

      // 微信官方
      'payWeChatMchId',
      'payWeChatAppId',
      'payWeChatSecret',
      'payWeChatNotifyUrl',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatVerifyMode',
      'payWeChatPlatformPublicKeyId',
      'payWeChatPlatformPublicKey',

      // 易支付
      'payEpayPid',
      'payEpayKey',
      'payEpayApiPayUrl',
      'payEpayApiQueryUrl',
      'payEpayNotifyUrl',
      'payEpayReturnUrl',
      'payEpayApiVersion',
      'payEpayPrivateKey',
      'payEpayPublicKey',

      // 支付宝官方
      'alipayAppId',
      'alipayPrivateKey',
      'alipayPublicKey',
      'alipayNotifyUrl',
      'alipayReturnUrl',

      // 虎皮椒
      'payHupiAppId',
      'payHupiAppSecret',
      'payHupiNotifyUrl',
      'payHupiReturnUrl',
      'payHupiGatewayUrl',

      // 码支付
      'payMpayPid',
      'payMpaySecret',
      'payMpayApiPayUrl',
      'payMpayApiQueryUrl',
      'payMpayNotifyUrl',
      'payMpayReturnUrl',

      // 蓝兔支付
      'payLtzfMchId',
      'payLtzfKey',
      'payLtzfNotifyUrl',
      'payLtzfReturnUrl',

      // PayPal
      'payPalClientId',
      'payPalClientSecret',
      'payPalMode',
      'payPalReturnUrl',
      'payPalCancelUrl',
      'payPalWebhookId',

      // Stripe
      'stripeSecretKey',
      'stripePublishableKey',
      'stripeMode',
      'stripeSuccessUrl',
      'stripeCancelUrl',
      'stripeWebhookSecret',
    ];
  }
}
