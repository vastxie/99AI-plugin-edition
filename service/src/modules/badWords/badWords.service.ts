import { hideString } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { In, Like, Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import {
  VOCABULARY_META,
  mergeVocabularies,
  VOCABULARY_STATS,
} from './vocabularies';
import { WhitelistEntity } from './whitelist.entity';
import { ViolationLogEntity } from './violationLog.entity';

@Injectable()
export class BadWordsService implements OnModuleInit {
  private readonly WHITELIST_KEY = 'badWords:whitelist';
  private readonly SYSTEM_WORDS_KEY = 'badWords:system';
  private readonly CACHE_TTL = 60 * 60 * 24; // 24小时缓存

  constructor(
    @InjectRepository(WhitelistEntity)
    private readonly whitelistEntity: Repository<WhitelistEntity>,
    @InjectRepository(ViolationLogEntity)
    private readonly violationLogEntity: Repository<ViolationLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async onModuleInit() {
    this.loadSystemWords();
    this.loadWhitelist();
  }

  /* ========== 词库管理 ========== */

  /* 获取所有可用词库列表 */
  async getVocabularies() {
    return {
      vocabularies: VOCABULARY_META,
      stats: VOCABULARY_STATS,
    };
  }

  /* 敏感词匹配 */
  async customSensitiveWords(content: string, userId: number) {
    const triggeredWords = [];

    // 获取已过滤白名单的系统词库
    const badWords = await this.getSystemWordsFromCache();

    for (let i = 0; i < badWords.length; i++) {
      const word = badWords[i];
      if (content.includes(word)) {
        triggeredWords.push(word);
      }
    }

    if (triggeredWords.length) {
      Logger.warn(
        `敏感词审核: 检测到违规 | userId=${userId} | 触发词数=${
          triggeredWords.length
        } | 触发词=${triggeredWords.join(',')}`,
        'BadWordsService',
      );
      await this.recordUserBadWords(userId, content, triggeredWords, ['敏感词'], '敏感词检测');
    }

    return triggeredWords;
  }

  /* 敏感词检测 先检测百度敏感词 后检测系统词库 */
  async checkBadWords(content: string, userId: number) {
    const config = await this.globalConfigService.getSensitiveConfig();
    if (config) {
      await this.checkBadWordsByConfig(content, config, userId);
    } else {
      // 未开启任何敏感词检测时，直接返回空数组
      return [];
    }

    return await this.customSensitiveWords(content, userId);
  }

  /* 通过配置信息去检测敏感词 */
  async checkBadWordsByConfig(content: string, config: any, userId: number) {
    const { useType } = config;
    if (useType === 'baidu') {
      await this.baiduCheckBadWords(content, config.baiduTextAccessToken, userId);
    }
    // useType === 'system' 时会继续执行customSensitiveWords，无需额外处理
  }

  /* 提取百度云敏感词违规类型 */
  extractContent(str) {
    const pattern = /存在(.*?)不合规/;
    const match = str.match(pattern);
    return match ? match[1] : '';
  }

  /* 通过百度云敏感词检测 */
  async baiduCheckBadWords(content: string, accessToken: string, userId: number) {
    if (!accessToken || !content || content.trim() === '') {
      return;
    }

    const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    try {
      const params = new URLSearchParams();
      params.append('text', content);

      const response = await axios.post(url, params, { headers, timeout: 10000 });
      const { error_code, error_msg, conclusionType, data } = response.data;

      if (error_code) {
        Logger.warn(
          `百度审核: API错误 | error_code=${error_code} | error_msg=${error_msg}`,
          'BadWordsService',
        );
        return;
      }

      // conclusionType: 1.合规 2.不合规 3.疑似 4.审核失败
      if (conclusionType !== 1 && data && Array.isArray(data)) {
        const types = [...new Set(data.map(item => this.extractContent(item.msg)))];
        Logger.warn(
          `百度审核: 检测到违规 | userId=${userId} | 违规类型=${types.join(
            ',',
          )} | conclusionType=${conclusionType}`,
          'BadWordsService',
        );
        await this.recordUserBadWords(userId, content, ['***'], types, '百度云检测');
        const tips = `您提交的信息中包含${types.join(
          ',',
        )}的内容、我们已对您的账户进行标记、请合规使用！`;
        throw new HttpException(tips, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(
        `百度审核: 服务异常 | ${error.message} | userId=${userId}`,
        error.stack,
        'BadWordsService',
      );
    }
  }

  /* 从缓存获取系统词库 */
  async getSystemWordsFromCache(): Promise<string[]> {
    try {
      const cached = await this.redisCacheService.get({ key: this.SYSTEM_WORDS_KEY });
      if (cached) {
        return JSON.parse(cached);
      }

      await this.loadSystemWords();
      const newCached = await this.redisCacheService.get({ key: this.SYSTEM_WORDS_KEY });
      return newCached ? JSON.parse(newCached) : [];
    } catch (error) {
      Logger.error(`获取系统词库缓存失败: ${error.message}`, error.stack, 'BadWordsService');
      return [];
    }
  }

  /* 加载系统词库到Redis缓存（自动过滤白名单） */
  async loadSystemWords() {
    try {
      // 获取敏感词配置
      const config = await this.globalConfigService.getSensitiveConfig();

      // 获取选中的词库ID列表
      let selectedIds: string[] = [];
      if (config && config.useType === 'system' && config.selectedVocabularies?.length > 0) {
        selectedIds = config.selectedVocabularies;
      }

      // 如果没有选择任何词库，清空缓存并返回
      if (selectedIds.length === 0) {
        await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
        Logger.log('系统词库已清空（未选择任何词库）', 'BadWordsService');
        return;
      }

      // 合并选中的词库
      const mergedWords = mergeVocabularies(selectedIds);
      const allWords = Array.from(mergedWords);

      // 获取白名单
      const whitelistData = await this.whitelistEntity.find();
      const whitelist = new Set(whitelistData.map(item => item.word));

      // 过滤掉白名单中的词语
      const filteredWords = allWords.filter(word => !whitelist.has(word));

      await this.redisCacheService.set(
        { key: this.SYSTEM_WORDS_KEY, val: JSON.stringify(filteredWords) },
        this.CACHE_TTL,
      );

      Logger.log(
        `系统词库已加载 [${selectedIds.join(', ')}]，原始${allWords.length}个，过滤后${
          filteredWords.length
        }个（白名单${whitelist.size}个）`,
        'BadWordsService',
      );
    } catch (error) {
      Logger.error(`加载系统词库失败: ${error.message}`, error.stack, 'BadWordsService');
    }
  }

  /* 重新加载系统词库（配置更新时调用） */
  async reloadSystemWords() {
    // 先清除缓存
    await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
    // 重新加载
    await this.loadSystemWords();
    Logger.log('敏感词库已重新加载', 'BadWordsService');
  }

  /* 从缓存获取白名单 */
  async getWhitelistFromCache(): Promise<string[]> {
    try {
      const cached = await this.redisCacheService.get({ key: this.WHITELIST_KEY });
      if (cached) {
        return JSON.parse(cached);
      }

      await this.loadWhitelist();
      const newCached = await this.redisCacheService.get({ key: this.WHITELIST_KEY });
      return newCached ? JSON.parse(newCached) : [];
    } catch (error) {
      Logger.error(`获取白名单缓存失败: ${error.message}`, error.stack, 'BadWordsService');
      return [];
    }
  }

  /* 加载白名单到Redis缓存 */
  async loadWhitelist() {
    try {
      const data = await this.whitelistEntity.find();
      const words = data.map(t => t.word);

      await this.redisCacheService.set(
        { key: this.WHITELIST_KEY, val: JSON.stringify(words) },
        this.CACHE_TTL,
      );

      Logger.log(`白名单已加载，共${words.length}个词语`, 'BadWordsService');
    } catch (error) {
      Logger.error(`加载白名单失败: ${error.message}`, error.stack, 'BadWordsService');
    }
  }

  /* 清除白名单和系统词库缓存 */
  async clearWhitelistCache() {
    try {
      await this.redisCacheService.del({ key: this.WHITELIST_KEY });
      // 同时清除系统词库缓存，因为需要重新过滤白名单
      await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
      Logger.log('已清除白名单和系统词库缓存', 'BadWordsService');
    } catch (error) {
      Logger.error(`清除白名单缓存失败: ${error.message}`, error.stack, 'BadWordsService');
    }
  }

  /* ========== 白名单管理 ========== */

  /* 查询白名单 */
  async queryWhitelist(query: any) {
    const { page = 1, size = 20, word } = query;
    const where: any = {};
    word && (where.word = Like(`%${word}%`));

    const [rows, count] = await this.whitelistEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });

    return { rows, count };
  }

  /* 添加白名单词语 */
  async addWhitelist(body: { word: string; remark?: string }) {
    const { word } = body;

    const existing = await this.whitelistEntity.findOne({ where: { word } });
    if (existing) {
      throw new HttpException('该词语已在白名单中', HttpStatus.BAD_REQUEST);
    }

    await this.whitelistEntity.save({ word, remark: body.remark });
    await this.clearWhitelistCache();

    Logger.log(`添加白名单词语: ${word}`, 'BadWordsService');
    return '添加白名单成功';
  }

  /* 批量添加白名单 */
  async batchAddWhitelist(body: { words: string }) {
    const { words: wordsStr } = body;

    const words = wordsStr
      .split(/[\s\n\t\r]+/)
      .map(word => word.trim())
      .filter(word => word.length > 0);

    if (words.length > 10000) {
      throw new HttpException('单次最多添加10000个词语', HttpStatus.BAD_REQUEST);
    }

    if (words.length === 0) {
      throw new HttpException('请输入有效的词语', HttpStatus.BAD_REQUEST);
    }

    const uniqueWords = [...new Set(words)];

    const existingWords = await this.whitelistEntity.find({
      where: { word: In(uniqueWords) },
      select: ['word'],
    });
    const existingWordSet = new Set(existingWords.map(item => item.word));

    const newWords = uniqueWords.filter(word => !existingWordSet.has(word));

    if (newWords.length === 0) {
      return {
        message: '批量添加完成',
        total: words.length,
        success: 0,
        skipped: words.length,
        alreadyExists: words.length,
      };
    }

    const entities = newWords.map(word => ({ word }));
    await this.whitelistEntity.save(entities);

    await this.clearWhitelistCache();

    Logger.log(`批量添加白名单: 共${newWords.length}个词语`, 'BadWordsService');

    return {
      message: '批量添加成功',
      total: words.length,
      success: newWords.length,
      skipped: existingWordSet.size,
      alreadyExists: existingWordSet.size,
    };
  }

  /* 删除白名单 */
  async delWhitelist(body: { id: number }) {
    const { id } = body;
    const item = await this.whitelistEntity.findOne({ where: { id } });

    if (!item) {
      throw new HttpException('白名单记录不存在', HttpStatus.BAD_REQUEST);
    }

    const res = await this.whitelistEntity.delete({ id });
    if (res.affected > 0) {
      await this.clearWhitelistCache();
      Logger.log(`删除白名单词语: ${item.word}`, 'BadWordsService');
      return '删除白名单成功';
    } else {
      throw new HttpException('删除白名单失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 修改白名单 */
  async updateWhitelist(body: { id: number; word?: string; remark?: string }) {
    const { id, word } = body;

    const item = await this.whitelistEntity.findOne({ where: { id } });
    if (!item) {
      throw new HttpException('白名单记录不存在', HttpStatus.BAD_REQUEST);
    }

    if (word && word !== item.word) {
      const existing = await this.whitelistEntity.findOne({ where: { word } });
      if (existing && existing.id !== id) {
        throw new HttpException('该词语已在白名单中', HttpStatus.BAD_REQUEST);
      }
    }

    const updateData: any = {};
    word !== undefined && (updateData.word = word);
    body.remark !== undefined && (updateData.remark = body.remark);

    const res = await this.whitelistEntity.update({ id }, updateData);
    if (res.affected > 0) {
      await this.clearWhitelistCache();
      Logger.log(`修改白名单词语: ${item.word} -> ${word || item.word}`, 'BadWordsService');
      return '修改白名单成功';
    } else {
      throw new HttpException('修改白名单失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 记录用户违规次数内容 */
  async recordUserBadWords(userId, content, words, typeCn, typeOriginCn) {
    const data = {
      userId,
      content,
      words: JSON.stringify(words),
      typeCn: JSON.stringify(typeCn),
      typeOriginCn,
    };
    try {
      const isVisitor = userId && userId > 100000000;

      if (!isVisitor && userId) {
        await this.userEntity
          .createQueryBuilder()
          .update(UserEntity)
          .set({ violationCount: () => 'violationCount + 1' })
          .where('id = :userId', { userId })
          .execute();
      }

      await this.violationLogEntity.save(data);
    } catch (error) {
      Logger.error(`记录用户违规失败: ${error.message}`, error.stack, 'BadWordsService');
    }
  }

  /* 违规记录 */
  async violation(req, query) {
    const { role } = req.user;
    const { page = 1, size = 10, userId, typeOriginCn } = query;
    const where = {};
    userId && (where['userId'] = userId);
    typeOriginCn && (where['typeOriginCn'] = typeOriginCn);

    const [rows, count] = await this.violationLogEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });

    const userIds = [...new Set(rows.map(t => t.userId))];
    const usersInfo = await this.userEntity.find({
      where: { id: In(userIds) },
      select: ['id', 'avatar', 'username', 'email', 'violationCount', 'status'],
    });

    rows.forEach((t: any) => {
      let user: any = usersInfo.find(u => u.id === t.userId);

      if (!user) {
        const isVisitor = t.userId && t.userId > 100000000;

        if (isVisitor) {
          user = {
            id: t.userId,
            avatar: '',
            username: `游客${t.userId}`,
            email: `${t.userId}@visitor.com`,
            violationCount: 0,
            status: 4,
            isVisitor: true,
            statusText: '游客',
          };
        } else {
          user = {
            id: t.userId,
            avatar: '',
            username: '未知用户',
            email: 'unknown@example.com',
            violationCount: 0,
            status: 'deleted',
            isDeleted: true,
          };
        }
      } else {
        user.isVisitor = false;
      }

      role !== 'super' && (user.email = hideString(user.email));
      t.userInfo = user;
    });

    return { rows, count };
  }
}
