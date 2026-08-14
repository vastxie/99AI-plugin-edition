import { ChatType } from '@/common/constants/balance.constant';
import { fetchRemoteUrlBuffer, formatDate, maskEmail } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { In, Like, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { UserEntity } from '../user/user.entity';
import { ChatLogEntity } from './chatLog.entity';
import { ChatListDto } from './dto/chatList.dto';
import { DelDto } from './dto/del.dto';
import { DelByGroupDto } from './dto/delByGroup.dto';
import { QuerAllChatLogDto } from './dto/queryAllChatLog.dto';
import { QueryByAppIdDto } from './dto/queryByAppId.dto';
import { QuerMyChatLogDto } from './dto/queryMyChatLog.dto';
// import { ModelsTypeEntity } from '../models/modelType.entity';
import { JwtPayload } from 'src/types/express';
import { ModelsService } from '../models/models.service';
import { QuerySingleChatDto } from './dto/querySingleChat.dto';

export interface ChatHistoryOwner {
  userId?: number;
  visitorId?: string;
}

@Injectable()
export class ChatLogService {
  constructor(
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    private readonly modelsService: ModelsService,
  ) {}

  /* 记录问答日志 */
  async saveChatLog(logInfo): Promise<any> {
    const savedLog = await this.chatLogEntity.save(logInfo);
    return savedLog; // 这里返回保存后的实体，包括其 ID
  }

  /* 更新问答日志 */
  async updateChatLog(id, logInfo) {
    const result = await this.chatLogEntity.update({ id }, logInfo);
    return result;
  }

  async requireOwnedChatLog(id: number, owner: ChatHistoryOwner): Promise<ChatLogEntity> {
    if ((!owner.userId && !owner.visitorId) || !Number.isInteger(Number(id))) {
      throw new HttpException('未找到该消息', HttpStatus.NOT_FOUND);
    }
    const log = await this.chatLogEntity.findOne({ where: { id, ...owner } });
    if (!log) {
      throw new HttpException('未找到该消息', HttpStatus.NOT_FOUND);
    }
    return log;
  }

  async updateOwnedChatLog(
    id: number,
    owner: ChatHistoryOwner,
    logInfo: Partial<ChatLogEntity>,
  ): Promise<void> {
    const result = await this.chatLogEntity.update({ id, ...owner }, logInfo);
    if (!result.affected) {
      throw new HttpException('未找到该消息', HttpStatus.NOT_FOUND);
    }
  }

  async findOneChatLog(id) {
    return await this.chatLogEntity.findOne({ where: { id } });
  }

  /* 查询我的绘制记录 */
  async querDrawLog(req: Request, query: QuerMyChatLogDto) {
    const { id } = req.user;
    const { model } = query;
    const where: any = { userId: id, type: ChatType.PAINT };
    if (model) {
      where.model = model;
      if (model === 'DALL-E2') {
        where.model = In(['DALL-E2', 'dall-e-3']);
      }
    }
    const data = await this.chatLogEntity.find({
      where,
      order: { id: 'DESC' },
      select: ['id', 'content', 'model', 'type'],
    });
    data.forEach((r: any) => {
      if (r.type === 'paintCount') {
        const w = r.model === 'mj' ? 310 : 160;
        const imgType = r.content && r.content.includes('cos') ? 'tencent' : 'ali';
        const compress =
          imgType === 'tencent'
            ? `?imageView2/1/w/${w}/q/55`
            : `?x-oss-process=image/resize,w_${w}`;
        r.thumbImg = r.content + compress;
      }
    });
    return data;
  }

  /* 查询所有对话记录 */
  async querAllChatLog(params: QuerAllChatLogDto, req: Request) {
    const { page = 1, size = 20, userId, type, model } = params;

    // 使用 QueryBuilder 进行 JOIN 查询，避免 N+1 问题
    let queryBuilder = this.chatLogEntity
      .createQueryBuilder('chatlog')
      .leftJoinAndSelect('chatlog.user', 'user')
      .orderBy('chatlog.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (userId) {
      queryBuilder = queryBuilder.andWhere('chatlog.userId = :userId', { userId });
    }
    if (type) {
      queryBuilder = queryBuilder.andWhere('chatlog.type = :type', { type });
    }
    if (model) {
      queryBuilder = queryBuilder.andWhere('chatlog.model = :model', { model });
    }

    const [chatLogs, count] = await queryBuilder.getManyAndCount();

    // 直接从关联的 user 对象获取用户信息
    const rows = chatLogs.map((item: any) => {
      const user = item.user || {};
      // 如果是游客，使用 visitorId 生成名称
      const identifier = item.userId || item.visitorId || 'unknown';
      return {
        ...item,
        username: user.username || `游客${identifier}`,
        email: user.email || `${identifier}@internal.invalid`,
        nickname: user.nickname || '',
      };
    });

    // 对非超级管理员隐藏邮箱信息
    if (req.user.role !== 'super') {
      rows.forEach((t: any) => {
        if (t.email && !t.email.endsWith('@internal.invalid')) {
          t.email = maskEmail(t.email);
        }
      });
    }

    return { rows, count };
  }

  /* 游标分页查询对话记录 - 性能优化版本 */
  async querAllChatLogCursor(params: any, req: Request) {
    const { cursor, size = 20, userId, type, model, direction = 'next' } = params;

    // 使用 QueryBuilder 进行游标分页查询
    let queryBuilder = this.chatLogEntity
      .createQueryBuilder('chatlog')
      .leftJoinAndSelect('chatlog.user', 'user')
      .orderBy('chatlog.id', 'DESC')
      .take(size + 1); // 多取一条用于判断是否有下一页

    // 游标条件
    if (cursor) {
      if (direction === 'next') {
        queryBuilder = queryBuilder.where('chatlog.id < :cursor', { cursor });
      } else if (direction === 'prev') {
        queryBuilder = queryBuilder.where('chatlog.id > :cursor', { cursor });
      }
    }

    // 其他过滤条件
    if (userId) {
      queryBuilder = queryBuilder.andWhere('chatlog.userId = :userId', { userId });
    }
    if (type) {
      queryBuilder = queryBuilder.andWhere('chatlog.type = :type', { type });
    }
    if (model) {
      queryBuilder = queryBuilder.andWhere('chatlog.model = :model', { model });
    }

    const results = await queryBuilder.getMany();
    const hasMore = results.length > size;
    const items = hasMore ? results.slice(0, size) : results;

    // 处理用户信息
    const rows = items.map((item: any) => {
      const user = item.user || {};
      // 如果是游客，使用 visitorId 生成名称
      const identifier = item.userId || item.visitorId || 'unknown';
      return {
        ...item,
        username: user.username || `游客${identifier}`,
        email: user.email || `${identifier}@internal.invalid`,
        nickname: user.nickname || '',
      };
    });

    // 对非超级管理员隐藏邮箱信息
    if (req.user.role !== 'super') {
      rows.forEach((t: any) => {
        if (t.email && !t.email.endsWith('@internal.invalid')) {
          t.email = maskEmail(t.email);
        }
      });
    }

    return {
      items: rows,
      hasMore,
      nextCursor: hasMore && rows.length > 0 ? rows[rows.length - 1].id : null,
      prevCursor: rows.length > 0 ? rows[0].id : null,
      total: null, // 游标分页不提供总数，避免性能问题
    };
  }

  /* 查询当前对话的列表 - 一次加载全部 */
  async chatList(req: Request, params: ChatListDto) {
    const { id, role } = req.user;
    const { groupId } = params;
    const where =
      role === 'visitor'
        ? { visitorId: String(id), isDelete: false }
        : { userId: id, isDelete: false };
    groupId && Object.assign(where, { groupId });
    if (groupId) {
      const count = await this.chatGroupEntity.count({
        where: { isDelete: false },
      });
      if (count === 0) return [];
    }

    // 一次加载全部消息，按ID升序排列（旧->新）
    const list = await this.chatLogEntity.find({
      where,
      order: {
        id: 'ASC',
      },
    });

    return list.map(item => {
      const {
        role,
        createdAt,
        model,
        modelName,
        type,
        status,
        action,
        drawId,
        id,
        imageUrl,
        fileUrl,
        ttsUrl,
        videoUrl,
        audioUrl,
        customId,
        pluginParam,
        progress,
        taskData,
        taskId,
        reasoning_content,
        content,
        agent_content,
        appId,
      } = item;

      // 解析 agent_content 并提取数据
      let extractedPluginParam = pluginParam;
      let extractedFileVectorResult = null;
      let extractedReasoningContent = reasoning_content;
      let extractedPromptReference = null;

      if (agent_content) {
        try {
          let agentData = JSON.parse(agent_content);

          // 处理可能的双重序列化问题
          if (typeof agentData === 'string') {
            agentData = JSON.parse(agentData);
          }

          // 提取文件分析数据
          if (agentData.data?.fileAnalysis) {
            extractedFileVectorResult = agentData.data.fileAnalysis.searchResults;
          }

          // 提取推理数据
          if (agentData.data?.reasoning) {
            extractedReasoningContent = agentData.data.reasoning.content || reasoning_content;
          }

          // 提取自定义数据
          if (agentData.data?.custom?.promptReference) {
            extractedPromptReference = agentData.data.custom.promptReference;
          }

          // 提取显示参数
          if (agentData.display?.pluginParam) {
            extractedPluginParam = agentData.display.pluginParam || pluginParam;
          }
        } catch (e) {
          // 解析失败，使用原始值
          Logger.debug('解析 agent_content 失败，使用原始值', 'ChatLogService');
        }
      }

      return {
        chatId: id,
        dateTime: formatDate(createdAt),
        content: content,
        reasoningText: extractedReasoningContent,
        modelType: type,
        status: status,
        action: action,
        drawId: drawId,
        customId: customId,
        role: role,
        error: false,
        imageUrl: imageUrl || '',
        fileUrl: fileUrl,
        ttsUrl: ttsUrl,
        videoUrl: videoUrl,
        audioUrl: audioUrl,
        progress,
        model: model,
        modelName: modelName,
        pluginParam: extractedPluginParam,
        taskData: taskData,
        promptReference: extractedPromptReference,
        fileVectorResult: extractedFileVectorResult,
        taskId: taskId,
        appId: appId,
        agent_content: agent_content,
      };
    });
  }

  /* 查询历史对话的列表 */
  async chatHistory(groupId: number, rounds: number, owner: ChatHistoryOwner) {
    // Logger.debug(`查询历史对话的列表, groupId: ${groupId}, rounds: ${rounds}`);

    if (rounds === 0) {
      // Logger.debug('轮次为0，返回空数组');
      return [];
    }

    if (!owner || (typeof owner.userId === 'undefined' && !owner.visitorId)) {
      throw new HttpException('缺少聊天历史归属边界，拒绝查询！', HttpStatus.FORBIDDEN);
    }

    const where: any = { isDelete: false, groupId: groupId };
    if (owner?.visitorId) {
      where.visitorId = owner.visitorId;
    } else if (typeof owner?.userId !== 'undefined') {
      where.userId = owner.userId;
    }
    // Logger.debug('查询条件:', JSON.stringify(where, null, 2));

    const list = await this.chatLogEntity.find({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: rounds * 2, // 只取最新的rounds条记录
    });

    // Logger.debug('查询结果:', JSON.stringify(list, null, 2));

    const result = list
      .map(item => {
        const {
          role,
          content,
          imageUrl,
          fileUrl,
          ttsUrl,
          videoUrl,
          audioUrl,
          reasoning_content,
          progress,
          pluginParam,
          agent_content,
          type,
          taskId,
          customId,
        } = item;

        // 解析 agent_content 并提取数据
        let extractedPluginParam = pluginParam;

        if (agent_content) {
          try {
            let agentData = JSON.parse(agent_content);

            // 处理可能的双重序列化问题
            if (typeof agentData === 'string') {
              agentData = JSON.parse(agentData);
            }

            // 提取显示参数
            if (agentData.display?.pluginParam) {
              extractedPluginParam = agentData.display.pluginParam || pluginParam;
            }
          } catch (e) {
            // 解析失败，使用原始值
          }
        }

        const record = {
          role: role,
          content: content,
          imageUrl: imageUrl || '',
          fileUrl: fileUrl,
          ttsUrl: ttsUrl,
          videoUrl: videoUrl,
          audioUrl: audioUrl,
          reasoningText: reasoning_content,
          progress,
          pluginParam: extractedPluginParam,
          agent_content: agent_content, // 返回原始的agent_content供前端解析
          type: type,
          taskId: taskId,
          customId: customId, // ✨ 添加 MJ 按钮信息
        };
        // Logger.debug('处理记录:', JSON.stringify(record, null, 2));
        return record;
      })
      .reverse(); // 添加.reverse()来反转数组，使结果按时间从旧到新排列

    // Logger.debug('处理后的结果:', JSON.stringify(result, null, 2));

    return result;
  }

  /* 删除单条对话记录 */
  async deleteChatLog(req: Request, body: DelDto) {
    const { id, role } = req.user;
    const chatId = body.id;
    const ownerWhere =
      role === 'visitor'
        ? { id: chatId, visitorId: String(id) }
        : { id: chatId, userId: id };
    const c = await this.chatLogEntity.findOne({ where: ownerWhere });
    if (!c) {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
    const r = await this.chatLogEntity.update({ id: chatId }, { isDelete: true });
    if (r.affected > 0) {
      return '删除对话记录成功！';
    } else {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 清空一组对话记录 */
  async delByGroupId(req: Request, body: DelByGroupDto) {
    const { groupId } = body;
    const { id, role } = req.user;
    const groupWhere =
      role === 'visitor'
        ? { id: groupId, visitorId: String(id) }
        : { id: groupId, userId: id };
    const g = await this.chatGroupEntity.findOne({
      where: groupWhere,
    });

    if (!g) {
      throw new HttpException('你删除的对话记录不存在、请检查！', HttpStatus.BAD_REQUEST);
    }

    const r = await this.chatLogEntity.update({ groupId }, { isDelete: true });

    if (r.affected > 0) {
      return '删除对话记录成功！';
    }

    if (r.affected === 0) {
      throw new HttpException('当前页面已经没有东西可以删除了！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除对话组中某条对话及其后的所有对话 */
  async deleteChatsAfterId(req: Request, body: { id: number }) {
    const { id } = body; // 从请求体中获取对话记录 id
    const { id: userId, role } = req.user; // 从请求中获取用户ID

    // 查找该对话记录，确保其存在且属于当前用户
    const ownerWhere =
      role === 'visitor'
        ? { id, visitorId: String(userId) }
        : { id, userId };
    const chatLog = await this.chatLogEntity.findOne({ where: ownerWhere });
    if (!chatLog) {
      // 如果对话记录不存在，可能是因为用户中断后还未保存完成
      // 此时无需删除，直接返回成功，避免阻塞再生成流程
      Logger.debug(`对话记录 ${id} 不存在或未保存完成，跳过删除`, 'ChatLogService');
      return '操作成功';
    }

    const { groupId } = chatLog; // 获取该对话记录所在的对话组ID

    // 删除该对话组中所有 ID 大于等于当前 id 的对话记录
    const result = await this.chatLogEntity.update(
      { groupId, id: MoreThanOrEqual(id) },
      { isDelete: true },
    );

    if (result.affected > 0) {
      // 如果更新成功，返回成功消息
      return '删除对话记录成功！';
    } else {
      // 如果没有任何记录被更新，抛出异常
      throw new HttpException('当前页面已经没有东西可以删除了！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询单个应用的使用记录 */
  async byAppId(req: Request, body: QueryByAppIdDto) {
    const { id } = req.user;
    const { appId, page = 1, size = 10 } = body;
    const [rows, count] = await this.chatLogEntity.findAndCount({
      where: { userId: id, appId, role: 'assistant' },
      order: { id: 'DESC' },
      take: size,
      skip: (page - 1) * size,
    });
    return { rows, count };
  }

  async checkModelLimits(userId: JwtPayload, model: string) {
    const ONE_HOUR_IN_MS = 3600 * 1000;
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_IN_MS);

    try {
      // 计算一小时内模型的使用次数
      const usageCount = await this.chatLogEntity.count({
        where: {
          userId: userId.id,
          model,
          createdAt: MoreThan(oneHourAgo),
        },
      });

      const adjustedUsageCount = Math.ceil(usageCount / 2);

      // 获取模型的使用限制
      let modelInfo;
      if (model.startsWith('gpt-4-gizmo')) {
        modelInfo = await this.modelsService.getCurrentModelKeyInfo('gpts');
      } else {
        modelInfo = await this.modelsService.getCurrentModelKeyInfo(model);
      }
      const modelLimits = Number(modelInfo.modelLimits);

      Logger.log(
        `用户ID: ${userId.id} 一小时内调用 ${model} 模型 ${
          adjustedUsageCount + 1
        }/${modelLimits} 次`,
        'ChatLogService',
      );

      // 检查是否超过使用限制
      if (adjustedUsageCount > modelLimits) {
        return true;
      }
      return false;
    } catch (error) {
      Logger.error(
        `查询数据库出错 - 用户ID: ${userId.id}, 模型: ${model}, 错误信息: ${error.message}`,
        error.stack,
        'ChatLogService',
      );
    }
  }

  /**
   * 系统启动时清理异常的生成中状态
   * 将所有 status = 2 的记录更新为失败状态 status = 5
   */
  async cleanupPendingTasks() {
    try {
      const result = await this.chatLogEntity.update({ status: 2 }, { status: 5 });
      if (result.affected > 0) {
        Logger.log(`系统启动：已清理 ${result.affected} 条异常的生成中任务`, 'ChatLogService');
      }
    } catch (error) {
      Logger.error(`清理异常任务失败: ${error.message}`, error.stack, 'ChatLogService');
    }
  }

  /**
   * 查询单条聊天记录
   * @param req 请求对象
   * @param params 查询参数，包含 chatId
   * @returns 返回格式化后的查询结果
   */
  async querySingleChat(req: Request, params: QuerySingleChatDto) {
    try {
      const { chatId } = params;
      const { id, role } = req.user;

      // 参数验证
      if (!chatId) {
        return '请输入正确的聊天ID';
      }

      // 所有权校验：只能查询属于自己的消息
      const ownerWhere =
        role === 'visitor'
          ? { id: Number(chatId), visitorId: String(id) }
          : { id: Number(chatId), userId: id };

      const chatLog = await this.chatLogEntity.findOne({
        where: ownerWhere,
      });

      // 消息不存在处理
      if (!chatLog) {
        Logger.warn(`未找到ID为 ${chatId} 的消息记录`, 'ChatLogService');
        return '未找到该消息';
      }

      // 解析 agent_content 并提取数据
      let extractedPluginParam = chatLog.pluginParam;
      let extractedFileVectorResult = null;
      let extractedReasoningContent = chatLog.reasoning_content;
      let extractedPromptReference = null;

      if (chatLog.agent_content) {
        try {
          let agentData = JSON.parse(chatLog.agent_content);

          // 处理可能的双重序列化问题
          if (typeof agentData === 'string') {
            agentData = JSON.parse(agentData);
          }

          // 提取文件分析数据
          if (agentData.data?.fileAnalysis) {
            extractedFileVectorResult = agentData.data.fileAnalysis.searchResults;
          }

          // 提取推理数据
          if (agentData.data?.reasoning) {
            extractedReasoningContent =
              agentData.data.reasoning.content || chatLog.reasoning_content;
          }

          // 提取自定义数据
          if (agentData.data?.custom?.promptReference) {
            extractedPromptReference = agentData.data.custom.promptReference;
          }

          // 提取显示参数
          if (agentData.display?.pluginParam) {
            extractedPluginParam = agentData.display.pluginParam || chatLog.pluginParam;
          }
        } catch (e) {
          // 解析失败，使用原始值
        }
      }

      // 直接使用数据库中存储的 type 值（现在保存时已正确设置）
      const modelType = chatLog.type || 1; // 默认为普通对话

      // 格式化查询结果
      const formattedResult = {
        id: chatLog.id,
        action: chatLog.action || '',
        taskData: chatLog.taskData || '',
        chatId: chatLog.id, // 保持兼容性
        content: chatLog.content || '',
        reasoningText: extractedReasoningContent || '',
        role: chatLog.role || 'assistant',
        status: chatLog.status || 0,
        model: chatLog.model || '',
        modelName: chatLog.modelName || '',
        modelType: modelType,
        imageUrl: chatLog.imageUrl || '',
        fileUrl: chatLog.fileUrl || '',
        drawId: chatLog.drawId || '',
        customId: chatLog.customId || '',
        inversion: chatLog.role === 'user',
        createdAt: chatLog.createdAt,
        progress: chatLog.progress || 0,
        updatedAt: chatLog.updatedAt,
        ttsUrl: chatLog.ttsUrl || '',
        videoUrl: chatLog.videoUrl || '',
        audioUrl: chatLog.audioUrl || '',
        taskId: chatLog.taskId || '',
        promptReference: extractedPromptReference || '',
        fileVectorResult: extractedFileVectorResult || '',
        pluginParam: extractedPluginParam || '',
        agent_content: chatLog.agent_content, // 返回原始的agent_content供前端解析
      };

      // 返回成功结果
      return formattedResult;
    } catch (error) {
      // 详细记录错误信息
      Logger.error(`查询单条消息失败: ${error.message}`, error.stack, 'ChatLogService');

      // 返回错误响应
      return error.message;
    }
  }

  /**
   * 查询格式化的历史上下文 (用于通用创意模式的 FC)
   * @param groupId 对话组ID
   * @param rounds 查询轮数 (默认5轮)
   * @returns 格式化的历史上下文
   */
  async getFormattedHistoryForFC(
    groupId: number,
    rounds: number,
    owner: ChatHistoryOwner,
  ): Promise<{
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      urls?: string[];
      taskId?: string;
      mediaInfo?: Array<{
        url: string;
        width?: number;
        height?: number;
        aspectRatio?: string;
      }>;
    }>;
    summary: {
      totalMessages: number;
      hasImages: boolean;
      hasVideos: boolean;
      lastTaskId?: string;
    };
  }> {
    try {
      // 1. 查询历史消息 (最近5轮 = 最多10条消息)
      const history = await this.chatHistory(groupId, rounds * 2, owner);

      // 2. 过滤并格式化
      const formattedMessages = [];
      let hasImages = false;
      let hasVideos = false;
      let lastTaskId: string;

      for (const record of history) {
        // 过滤 system/developer 消息
        if (record.role === 'system' || record.role === 'developer') {
          continue;
        }

        // 提取所有 URL 并获取尺寸信息
        const urls: string[] = [];
        const mediaInfo: Array<{
          url: string;
          width?: number;
          height?: number;
          aspectRatio?: string;
        }> = [];

        // 图片 URL
        if (record.imageUrl) {
          const imageUrls = this.extractUrls(record.imageUrl);
          if (imageUrls.length > 0) {
            hasImages = true;
            for (const url of imageUrls) {
              urls.push(url);
              // 异步获取尺寸，不阻塞流程
              const dimensions = await this.getMediaDimensions(url);
              mediaInfo.push({ url, ...dimensions });
            }
          }
        }

        // 视频 URL
        if (record.videoUrl) {
          const videoUrls = this.extractUrls(record.videoUrl);
          if (videoUrls.length > 0) {
            hasVideos = true;
            for (const url of videoUrls) {
              urls.push(url);
              // 视频尺寸获取（尝试）
              const dimensions = await this.getMediaDimensions(url);
              mediaInfo.push({ url, ...dimensions });
            }
          }
        }

        // 文件 URL
        if (record.fileUrl) {
          const fileUrls = this.extractFileUrls(record.fileUrl);
          urls.push(...fileUrls);
        }

        // 记录最后一个 taskId
        if (record.taskId && !lastTaskId) {
          lastTaskId = record.taskId;
        }

        // ✨ 解析 customId（如果存在且是 JSON 字符串）
        let customId;
        if (record.customId) {
          try {
            customId = JSON.parse(record.customId);
          } catch (error) {
            Logger.debug(`解析 customId 失败: ${error.message}`, 'ChatLogService');
          }
        }

        // 构建格式化消息
        formattedMessages.push({
          role: record.role,
          content: record.content || '',
          urls: urls.length > 0 ? urls : undefined,
          taskId: record.taskId,
          customId: customId, // ✨ 添加 MJ 按钮信息
          mediaInfo: mediaInfo.length > 0 ? mediaInfo : undefined,
        });
      }

      return {
        messages: formattedMessages,
        summary: {
          totalMessages: formattedMessages.length,
          hasImages,
          hasVideos,
          lastTaskId,
        },
      };
    } catch (error) {
      Logger.error(`获取格式化历史失败: ${error.message}`, 'ChatLogService');
      return {
        messages: [],
        summary: {
          totalMessages: 0,
          hasImages: false,
          hasVideos: false,
        },
      };
    }
  }

  /**
   * 获取图片/视频尺寸信息
   * @param url 文件URL
   * @returns 尺寸信息 { width, height, aspectRatio }
   *
   * 性能优化：
   * 1. 使用 HTTP Range 请求，只下载前 500KB（大部分图片的尺寸信息在头部）
   * 2. 超时时间 3 秒，避免长时间等待
   * 3. 错误时静默失败，不影响主流程
   * 4. 通过统一 URL guard 拦截内网、本机和元数据地址
   */
  private async getMediaDimensions(url: string): Promise<{
    width?: number;
    height?: number;
    aspectRatio?: string;
  }> {
    try {
      const sharp = (await import('sharp')).default;

      // 下载文件（只下载前 500KB 用于读取尺寸，兼容大图）
      const { buffer } = await fetchRemoteUrlBuffer(url, {
        timeoutMs: 3000,
        maxBytes: 1024 * 500,
        maxRedirects: 3,
        headers: {
          Range: 'bytes=0-511200', // 只请求前 500KB
          Accept: 'image/*,video/*,*/*;q=0.8',
          'User-Agent': '99AI-Media-Probe/1.0',
        },
      });

      // 使用 Sharp 读取元数据（只需要前几KB）
      const metadata = await sharp(buffer).metadata();
      const aspectRatio =
        metadata.width && metadata.height
          ? this.calculateAspectRatio(metadata.width, metadata.height)
          : undefined;

      return {
        width: metadata.width || undefined,
        height: metadata.height || undefined,
        aspectRatio,
      };
    } catch (error) {
      // 获取尺寸失败，返回空对象（静默失败，不影响主流程）
      Logger.debug(
        `获取媒体尺寸失败: ${url.substring(0, 50)}..., 错误: ${error.message}`,
        'ChatLogService',
      );
      return {};
    }
  }

  /**
   * 计算宽高比
   * @param width 宽度
   * @param height 高度
   * @returns 宽高比字符串
   */
  private calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const ratioWidth = width / divisor;
    const ratioHeight = height / divisor;

    // 常见比例优化
    const commonRatios: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '3:2': '3:2',
      '2:3': '2:3',
    };

    const ratio = `${ratioWidth}:${ratioHeight}`;
    return commonRatios[ratio] || ratio;
  }

  /**
   * 提取 URL (支持多种格式)
   * @param input 输入字符串
   * @returns URL数组
   */
  private extractUrls(input: string): string[] {
    if (!input) return [];

    // JSON 数组格式
    if (input.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => item && item.url).map(item => item.url);
        }
      } catch (e) {
        // 不是 JSON, 继续其他处理
      }
    }

    // 逗号分隔
    if (input.includes(',')) {
      return input
        .split(',')
        .map(url => url.trim())
        .filter(url => url.startsWith('http'));
    }

    // 单个 URL
    return input.startsWith('http') ? [input] : [];
  }

  /**
   * 提取文件 URL (从 JSON 格式)
   * @param input 输入字符串
   * @returns URL数组
   */
  private extractFileUrls(input: string): string[] {
    if (!input) return [];

    try {
      const files = JSON.parse(input);
      if (Array.isArray(files)) {
        return files.filter(item => item && item.url).map(item => item.url);
      }
    } catch (e) {
      return [];
    }

    return [];
  }
}
