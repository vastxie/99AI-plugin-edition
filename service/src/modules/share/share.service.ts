import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { Share } from './share.entity';
import { randomInt } from 'crypto';

@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(Share)
    private readonly shareRepository: Repository<Share>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogRepository: Repository<ChatLogEntity>,
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupRepository: Repository<ChatGroupEntity>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private generateShareCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(randomInt(0, chars.length));
    }
    return code;
  }

  // 新方法：通过对话组ID创建分享
  async createShareFromGroup(
    groupId: number,
    user?: { id?: number; role?: string },
  ): Promise<{ shareUrl: string; shareCode: string }> {
    if (!user?.id) {
      throw new HttpException('请登录后再创建分享', HttpStatus.UNAUTHORIZED);
    }

    const ownerWhere =
      user.role === 'visitor'
        ? { id: groupId, visitorId: String(user.id), isDelete: false }
        : { id: groupId, userId: user.id, isDelete: false };

    const chatGroup = await this.chatGroupRepository.findOne({
      where: ownerWhere,
    });

    if (!chatGroup) {
      throw new HttpException('对话组不存在或无权分享', HttpStatus.FORBIDDEN);
    }

    const messageOwnerWhere =
      user.role === 'visitor'
        ? { groupId, visitorId: String(user.id), isDelete: false }
        : { groupId, userId: user.id, isDelete: false };

    // 获取对话组的所有消息
    const messages = await this.chatLogRepository.find({
      where: messageOwnerWhere,
      order: { createdAt: 'ASC' },
    });

    if (!messages || messages.length === 0) {
      throw new Error('该对话组没有消息');
    }

    // 失败的模型调用可能留下空 assistant 记录；不要把空白气泡固化进分享。
    const publicMessages = messages.filter(
      msg =>
        msg.role !== 'assistant' ||
        Boolean(msg.content || msg.imageUrl || msg.videoUrl || msg.audioUrl || msg.ttsUrl),
    );
    if (publicMessages.length === 0) {
      throw new Error('该对话组没有可分享的消息');
    }

    // 提取可公开消息ID列表
    const messageIds = publicMessages.map(msg => msg.id);

    let shareCode: string;
    let isUnique = false;

    while (!isUnique) {
      shareCode = this.generateShareCode();
      const existing = await this.shareRepository.findOne({
        where: { shareCode },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const share = new Share();
    share.shareCode = shareCode;
    share.groupId = groupId;
    share.messageIds = messageIds;
    share.userId = user.role === 'visitor' ? null : user.id;

    try {
      await this.shareRepository.save(share);
      const configs = await this.globalConfigService.getConfigs(['siteUrl']);
      const siteUrl = configs.siteUrl || '';
      const shareUrl = `${siteUrl}/share/${shareCode}`;

      Logger.log('创建对话组分享成功', 'ShareService');

      return { shareUrl, shareCode };
    } catch (error) {
      Logger.error('保存分享内容失败:', error, 'ShareService');
      throw new Error(`创建分享失败: ${error.message || '未知错误'}`);
    }
  }

  async createShareFromHtml(htmlContent: string): Promise<{ shareUrl: string; shareCode: string }> {
    let shareCode: string;
    let isUnique = false;

    while (!isUnique) {
      shareCode = this.generateShareCode();
      const existing = await this.shareRepository.findOne({
        where: { shareCode },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const share = new Share();
    share.shareCode = shareCode;
    share.htmlContent = htmlContent;

    try {
      await this.shareRepository.save(share);
      const configs = await this.globalConfigService.getConfigs(['siteUrl']);
      const siteUrl = configs.siteUrl || '';
      const shareUrl = `${siteUrl}/share/${shareCode}`;
      Logger.log('创建 HTML 分享成功', 'ShareService');
      return { shareUrl, shareCode };
    } catch (error) {
      Logger.error('保存分享内容失败:', error, 'ShareService');
      throw new Error(`创建分享失败: ${error.message || '未知错误'}`);
    }
  }

  async getShareByCode(shareCode: string): Promise<any> {
    const share = await this.shareRepository.findOne({ where: { shareCode } });

    if (!share) {
      return null;
    }

    // 如果是新格式（有groupId和messageIds）
    if (share.groupId && share.messageIds) {
      // 获取对话组信息
      const chatGroup = await this.chatGroupRepository.findOne({
        where: { id: share.groupId },
      });

      if (!chatGroup) {
        return null;
      }

      const messageOwnerWhere = chatGroup.userId
        ? { userId: chatGroup.userId }
        : { visitorId: chatGroup.visitorId };

      // 获取指定的消息（排除已删除的）
      const messages = await this.chatLogRepository.find({
        where: {
          id: In(share.messageIds),
          groupId: share.groupId,
          ...messageOwnerWhere,
          isDelete: false, // 只查询未删除的消息
        },
        order: { createdAt: 'ASC' },
      });

      const groupInfo = {
        title: chatGroup.title,
        createdAt: chatGroup.createdAt,
        updatedAt: chatGroup.updatedAt,
      };

      const publicMessages = messages
        .filter(
          msg =>
            msg.role !== 'assistant' ||
            Boolean(msg.content || msg.imageUrl || msg.videoUrl || msg.audioUrl || msg.ttsUrl),
        )
        .map(msg => ({
        createdAt: msg.createdAt,
        content: msg.content,
        modelName: msg.modelName,
        role: msg.role,
        imageUrl: msg.imageUrl,
        videoUrl: msg.videoUrl,
        audioUrl: msg.audioUrl,
        fileUrl: msg.fileUrl,
        ttsUrl: msg.ttsUrl,
        type: msg.type,
        renderType: ['mermaid', 'mind-map'].includes(msg.pluginParam) ? msg.pluginParam : null,
        }));

      return {
        type: 'group',
        groupInfo,
        messages: publicMessages,
        shareCode,
      };
    }

    if (share.shareData) {
      Logger.warn('已拒绝读取旧版 JSON 分享', 'ShareService');
      return null;
    }

    return {
      type: 'html',
      htmlContent: share.htmlContent,
      shareCode,
    };
  }
}
