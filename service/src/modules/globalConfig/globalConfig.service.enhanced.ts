import { formatUrl, hideString } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Request } from 'express';
import * as fs from 'fs';
import { In, Repository } from 'typeorm';
import { ChatLogEntity } from './../chatLog/chatLog.entity';
import { ModelsService } from './../models/models.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { ConfigEntity } from './config.entity';
import { QueryConfigDto } from './dto/queryConfig.dto';
import { SetConfigDto } from './dto/setConfig.dto';

const packageJsonContent = fs.readFileSync('package.json', 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const version = packageJson.version;

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  // Redis 缓存键前缀
  private readonly CACHE_PREFIX = 'globalConfig:';
  private readonly MCP_CONFIG_CACHE_KEY = 'mcp:cache:config';
  private readonly MCP_TOOLS_CACHE_KEY = 'mcp:cache:tools';

  // 全局配置存储
  private globalConfigs: any = {};
  private isUpdatingConfig: boolean = false;
  private allConfigKeys: string[] = [];

  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly modelsService: ModelsService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.loadAllConfigs();
  }

  /* 加载所有配置 */
  async loadAllConfigs() {
    const data = await this.configEntity.find();
    this.globalConfigs = data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
    this.allConfigKeys = Object.keys(this.globalConfigs);
  }

  /* 获取微信 access_token */
  async getWechatAccessToken(isInit = false) {
    // 这里是一个占位实现，具体逻辑需要根据实际需求完善
    Logger.log('刷新微信 access_token', 'GlobalConfigService');
  }

  /* 初始化获取所有配置 */
  async initGetAllConfig() {
    await this.loadAllConfigs();
  }

  /* 初始化百度敏感词检测 */
  async initBaiduSensitive(isInit: boolean) {
    // 这里是一个占位实现
    Logger.log('初始化百度敏感词检测', 'GlobalConfigService');
  }

  /* 设置配置信息 */
  async setConfig(body: SetConfigDto) {
    // 设置更新标志，阻止并发读取
    this.isUpdatingConfig = true;

    try {
      const { settings } = body;

      // 使用事务确保数据一致性
      await this.configEntity.manager.transaction(async transactionalEntityManager => {
        for (const item of settings) {
          const { configKey, configVal } = item;
          const c = await transactionalEntityManager.findOne(ConfigEntity, {
            where: { configKey },
          });
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

      /* 如果修改的包含了百度云文本检测选择、则需要触发更新重新获取token */
      if (keys.includes('baiduTextApiKey') || keys.includes('baiduTextSecretKey')) {
        await this.initBaiduSensitive(false);
      }
      /* 如果变更微信配置 则需要手动刷新微信 access_token */
      if (keys.includes('wechatOfficialAppId') || keys.includes('wechatOfficialAppSecret')) {
        await this.getWechatAccessToken();
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

  /* 创建或更新配置信息 */
  async createOrUpdate(setting) {
    try {
      const { configKey, configVal } = setting;
      const c = await this.configEntity.findOne({ where: { configKey } });
      if (c) {
        const res = await this.configEntity.update({ configKey }, { configVal });

        // 清除该配置的 Redis 缓存
        await this.clearConfigCache([configKey]);
      } else {
        const res = await this.configEntity.save({ configKey, configVal });
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取配置时优先从 Redis 缓存读取
   */
  async getConfigs(keys?: string[]) {
    const targetKeys = keys?.length ? keys : this.allConfigKeys;
    const result: any = {};

    // 批量从 Redis 获取缓存
    const cacheKeys = targetKeys.map(key => `${this.CACHE_PREFIX}${key}`);
    try {
      // 这里假设 RedisCacheService 支持批量获取，如果不支持需要循环获取
      for (let i = 0; i < targetKeys.length; i++) {
        const cachedValue = await this.redisCacheService.get({ key: cacheKeys[i] });
        if (cachedValue) {
          result[targetKeys[i]] = cachedValue;
        }
      }
    } catch (error) {
      Logger.warn(`从 Redis 获取配置缓存失败: ${error.message}`, 'GlobalConfigService');
    }

    // 检查哪些配置没有缓存
    const missingKeys = targetKeys.filter(key => !result.hasOwnProperty(key));

    if (missingKeys.length > 0) {
      // 从内存或数据库获取缺失的配置
      for (const key of missingKeys) {
        result[key] = this.globalConfigs[key];
      }

      // 将缺失的配置写入 Redis 缓存（异步执行，不阻塞返回）
      this.cacheConfigs(missingKeys).catch(error => {
        Logger.warn(`缓存配置到 Redis 失败: ${error.message}`, 'GlobalConfigService');
      });
    }

    return result;
  }

  /**
   * 将配置缓存到 Redis
   */
  private async cacheConfigs(keys: string[]): Promise<void> {
    const cachePromises = keys.map(key => {
      const cacheKey = `${this.CACHE_PREFIX}${key}`;
      const value = this.globalConfigs[key];

      if (value !== undefined && value !== null) {
        // 设置 5 分钟的缓存
        return this.redisCacheService.set({ key: cacheKey, val: String(value) }, 300);
      }
      return Promise.resolve();
    });

    await Promise.all(cachePromises);
  }

  // ... 其他方法保持不变 ...
}
