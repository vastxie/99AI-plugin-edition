import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { AutoReplyEntity } from './autoReply.entity';
import { AddAutoReplyDto } from './dto/addAutoReply.dto';
import { DelAutoReplyDto } from './dto/delBadWords.dto';
import { QueryAutoReplyDto } from './dto/queryAutoReply.dto';
import { UpdateAutoReplyDto } from './dto/updateAutoReply.dto';
import { RedisCacheService } from '../redisCache/redisCache.service';

@Injectable()
export class AutoReplyService implements OnModuleInit {
  private readonly logger = new Logger(AutoReplyService.name);
  private readonly CACHE_DATA_KEY = 'autoReply:cache:data';
  private readonly CACHE_VERSION_KEY = 'autoReply:cache:version';
  private autoReplyKes: { prompt: string; keywords: string[] }[] = [];
  private autoReplyMap = {};
  private autoReplyFuzzyMatch = true;
  private autoReplyCacheVersion: string = null;

  constructor(
    @InjectRepository(AutoReplyEntity)
    private readonly autoReplyEntity: Repository<AutoReplyEntity>,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.initializeCache();
  }

  private async initializeCache() {
    const loadedFromRedis = await this.tryLoadCacheFromRedis();
    if (!loadedFromRedis) {
      await this.reloadCacheFromDatabase();
    }
  }

  private applyCacheEntries(
    entries: { prompt: string; keywords: string[]; answer: string; isAIReplyEnabled: number }[],
    version: string,
  ) {
    this.autoReplyMap = {};
    this.autoReplyKes = [];
    this.autoReplyCacheVersion = version;

    entries.forEach(entry => {
      if (!entry.prompt) {
        return;
      }

      this.autoReplyMap[entry.prompt] = {
        answer: entry.answer,
        isAIReplyEnabled: entry.isAIReplyEnabled,
      };
      const keywords = Array.isArray(entry.keywords)
        ? entry.keywords
        : entry.prompt.split(' ').map(k => k.trim());
      this.autoReplyKes.push({ prompt: entry.prompt, keywords });
    });
  }

  private buildCacheEntries(res: AutoReplyEntity[]) {
    return res
      .filter(item => !!item.prompt)
      .map(item => ({
        prompt: item.prompt,
        keywords: item.prompt.split(' ').map(k => k.trim()),
        answer: item.answer,
        isAIReplyEnabled: item.isAIReplyEnabled,
      }));
  }

  private async tryLoadCacheFromRedis(): Promise<boolean> {
    if (!this.redisCacheService) {
      return false;
    }
    try {
      const version = await this.redisCacheService.get({ key: this.CACHE_VERSION_KEY });
      if (!version) {
        return false;
      }
      const cached = await this.redisCacheService.get({ key: this.CACHE_DATA_KEY });
      if (!cached) {
        return false;
      }
      const entries = JSON.parse(cached);
      if (!Array.isArray(entries)) {
        return false;
      }
      this.applyCacheEntries(entries, version);
      return true;
    } catch (error) {
      this.logger.warn(`读取 Redis 自动回复缓存失败，使用数据库数据。原因: ${error.message}`);
      return false;
    }
  }

  private async saveCacheToRedis(
    entries: { prompt: string; keywords: string[]; answer: string; isAIReplyEnabled: number }[],
    version: string,
  ) {
    if (!this.redisCacheService) {
      return;
    }
    try {
      await this.redisCacheService.set(
        { key: this.CACHE_DATA_KEY, val: JSON.stringify(entries) },
        0,
      );
      await this.redisCacheService.set({ key: this.CACHE_VERSION_KEY, val: version }, 0);
    } catch (error) {
      this.logger.warn(`写入 Redis 自动回复缓存失败，将继续使用本地缓存。原因: ${error.message}`);
    }
  }

  private async reloadCacheFromDatabase() {
    const res = await this.autoReplyEntity.find({
      where: { status: 1 },
    });

    const entries = this.buildCacheEntries(res);
    const version = Date.now().toString();
    this.applyCacheEntries(entries, version);
    await this.saveCacheToRedis(entries, version);
  }

  private async ensureCacheLoaded() {
    if (!this.redisCacheService) {
      if (this.autoReplyKes.length === 0) {
        await this.reloadCacheFromDatabase();
      }
      return;
    }

    const version = await this.redisCacheService
      .get({ key: this.CACHE_VERSION_KEY })
      .catch(() => null);

    if (
      version &&
      this.autoReplyCacheVersion &&
      version === this.autoReplyCacheVersion &&
      this.autoReplyKes.length > 0
    ) {
      return;
    }

    if (version) {
      const cached = await this.redisCacheService
        .get({ key: this.CACHE_DATA_KEY })
        .catch(() => null);
      if (cached) {
        try {
          const entries = JSON.parse(cached);
          if (Array.isArray(entries)) {
            this.applyCacheEntries(entries, version);
            return;
          }
        } catch (error) {
          this.logger.warn(`解析 Redis 自动回复缓存失败，将重新加载数据库: ${error.message}`);
        }
      }
    }

    await this.reloadCacheFromDatabase();
  }

  async checkAutoReply(prompt: string) {
    await this.ensureCacheLoaded();

    const answers = [];
    let isAIReplyEnabled = 0;
    const seenGroups = new Set<string>();

    // Logger.debug('checkAutoReply', prompt);
    // Logger.debug('checkAutoReply', this.autoReplyKes);
    // Logger.debug('autoReplyMap', this.autoReplyMap);

    if (this.autoReplyFuzzyMatch) {
      for (const item of this.autoReplyKes) {
        if (item.keywords.some(keyword => prompt.includes(keyword))) {
          if (!seenGroups.has(item.prompt)) {
            answers.push(this.autoReplyMap[item.prompt].answer);
            seenGroups.add(item.prompt);
            if (this.autoReplyMap[item.prompt].isAIReplyEnabled === 1) {
              isAIReplyEnabled = 1;
            }
          }
        }
      }
    } else {
      const matches = this.autoReplyKes.filter(item => item.prompt === prompt);
      for (const match of matches) {
        if (!seenGroups.has(match.prompt)) {
          answers.push(this.autoReplyMap[match.prompt].answer);
          seenGroups.add(match.prompt);
          if (this.autoReplyMap[match.prompt].isAIReplyEnabled === 1) {
            isAIReplyEnabled = 1;
          }
        }
      }
    }

    return {
      answer: answers.join('\n'), // 拼接所有匹配到的答案
      isAIReplyEnabled,
    };
  }

  async queryAutoReply(query: QueryAutoReplyDto) {
    const { page = 1, size = 10, prompt, status } = query;
    const where: any = {};
    [0, 1, '0', '1'].includes(status) && (where.status = status);
    prompt && (where.prompt = Like(`%${prompt}%`));
    const [rows, count] = await this.autoReplyEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { rows, count };
  }

  async addAutoReply(body: AddAutoReplyDto) {
    // 直接保存新的自动回复
    await this.autoReplyEntity.save(body);
    // 重新加载自动回复列表
    await this.reloadCacheFromDatabase();
    return '添加问题成功！';
  }

  async updateAutoReply(body: UpdateAutoReplyDto) {
    const { id } = body;
    const res = await this.autoReplyEntity.update({ id }, body);
    if (res.affected > 0) {
      await this.reloadCacheFromDatabase();
      return '更新问题成功';
    }
    throw new HttpException('更新失败', HttpStatus.BAD_REQUEST);
  }

  async delAutoReply(body: DelAutoReplyDto) {
    const { id } = body;
    const z = await this.autoReplyEntity.findOne({ where: { id } });
    if (!z) {
      throw new HttpException('该问题不存在,请检查您的提交信息', HttpStatus.BAD_REQUEST);
    }
    const res = await this.autoReplyEntity.delete({ id });
    if (res.affected > 0) {
      await this.reloadCacheFromDatabase();
      return '删除问题成功';
    }
    throw new HttpException('删除失败', HttpStatus.BAD_REQUEST);
  }
}
