import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fetchRemoteUrlBuffer } from '@/common/utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import pdf2md from '@opendocsg/pdf2md';
import { Repository } from 'typeorm';
import { AppService } from '../app/app.service';
import { ModelsService } from '../models/models.service';
import { ChatGroupEntity } from './chatGroup.entity';
import { CreateGroupDto } from './dto/createGroup.dto';
import { DelGroupDto } from './dto/delGroup.dto';

@Injectable()
export class ChatGroupService {
  constructor(
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    private readonly modelsService: ModelsService,
    private readonly appService: AppService,
  ) {}

  async create(body: CreateGroupDto, req: Request) {
    const { id, role } = req.user; // 从请求中获取用户ID和角色
    const { appId, pluginId, modelConfig: bodyModelConfig, params } = body; // 从请求体中提取appId、pluginId和modelConfig

    // 处理访客用户
    const userId = role === 'visitor' ? null : id; // 访客用户的userId设为null
    const visitorId = role === 'visitor' ? String(id) : null; // 访客用户保存指纹ID

    // 尝试使用从请求体中提供的 modelConfig，否则获取默认配置
    let modelConfig = bodyModelConfig || (await this.modelsService.getBaseConfig());

    if (!modelConfig?.modelInfo?.model) {
      throw new HttpException(
        '当前站点尚未配置可用模型，请先在管理端添加并启用至少一个模型',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 自动回退到默认模型的功能已默认启用
    // 如果模型不存在或被禁用，会自动切换到首选模型
    const modelDetail = await this.modelsService.getModelDetailByName(modelConfig.modelInfo.model);

    // 更新模型配置信息（包括可能已切换的模型）
    if (modelDetail) {
      modelConfig.modelInfo.model = modelDetail.model; // 更新 model（可能已切换）
      modelConfig.modelInfo.modelName = modelDetail.modelName;
      modelConfig.modelInfo.deductType = modelDetail.deductType;
      modelConfig.modelInfo.deduct = modelDetail.deduct;
      modelConfig.modelInfo.isFileUpload = modelDetail.isFileUpload;
      modelConfig.modelInfo.isImageUpload = modelDetail.isImageUpload;
      modelConfig.modelInfo.isToolSupported = modelDetail.isToolSupported;
      modelConfig.modelInfo.deepThinkingType = modelDetail.deepThinkingType;
      modelConfig.modelInfo.modelAvatar = modelDetail.modelAvatar;
    }

    // 使用 JSON.parse(JSON.stringify(object)) 进行深拷贝以避免直接修改原对象
    modelConfig = JSON.parse(JSON.stringify(modelConfig));

    // 初始化创建对话组的参数
    const groupParams = { title: '新对话', userId, visitorId, appId, pluginId, params };
    // const params = { title: 'New chat', userId: id };

    // 如果指定了appId，查找并验证应用信息
    if (appId) {
      const appInfo = await this.appService.getAccessibleApp(Number(appId), req.user);

      // 应用存在，提取并验证应用信息
      const { status, name, isFixedModel, isGPTs, coverImg, appModel, isFlowith } = appInfo;

      if (isFixedModel && appModel) {
        // 自动回退功能已默认启用，如果应用固定的模型不存在或被禁用，会切换到首选模型
        const modelDetail = await this.modelsService.getModelDetailByName(appModel);
        if (modelDetail) {
          modelConfig.modelInfo.model = modelDetail.model; // 更新 model（可能已切换）
          modelConfig.modelInfo.modelName = modelDetail.modelName;
          modelConfig.modelInfo.deductType = modelDetail.deductType;
          modelConfig.modelInfo.deduct = modelDetail.deduct;
          modelConfig.modelInfo.isFileUpload = modelDetail.isFileUpload;
          modelConfig.modelInfo.isImageUpload = modelDetail.isImageUpload;
          modelConfig.modelInfo.isToolSupported = modelDetail.isToolSupported;
          modelConfig.modelInfo.deepThinkingType = modelDetail.deepThinkingType;
          modelConfig.modelInfo.modelAvatar = modelDetail.modelAvatar;
        }
      }

      // 更新 modelConfig 以反映应用的特定配置
      Object.assign(modelConfig.modelInfo, {
        isGPTs,
        isFixedModel,
        isFlowith,
        modelAvatar: coverImg,
        modelName: name,
      });

      // 如果是固定模型或GPTs模型，获取并设置额外的模型信息
      if (isGPTs === 1 || isFixedModel === 1 || isFlowith === 1) {
        const appModelKey = await this.modelsService.getCurrentModelKeyInfo(
          isFixedModel === 1 ? appModel : isFlowith === 1 ? 'flowith' : isGPTs === 1 ? 'gpts' : '',
        );
        Object.assign(modelConfig.modelInfo, {
          deductType: appModelKey.deductType,
          deduct: appModelKey.deduct,
          model: appModel,
          isFileUpload: appModelKey.isFileUpload,
          isImageUpload: appModelKey.isImageUpload,
        });
      }

      // 如果应用有名称，则使用它作为对话组标题
      if (name) {
        groupParams.title = name;
      }
    }

    // 创建新的聊天组并保存
    const newGroup = await this.chatGroupEntity.save({
      ...groupParams,
      config: JSON.stringify(modelConfig), // 将 modelConfig 对象转换为 JSON 字符串进行保存
    });

    return newGroup; // 返回新创建的聊天组
  }

  async query(req: Request) {
    try {
      const { id, role } = req.user;
      // 访客用户使用visitorId查询自己的对话组
      const params =
        role === 'visitor'
          ? { visitorId: String(id), isDelete: false }
          : { userId: id, isDelete: false };
      const res = await this.chatGroupEntity.find({
        where: params,
        order: { isSticky: 'DESC', updatedAt: 'DESC' },
        select: [
          'id',
          'title',
          'appId',
          'pluginId',
          'isSticky',
          'config',
          'fileUrl',
          'createdAt',
          'updatedAt',
        ],
      });

      // 为每个对话组添加 appLogo
      const appIds = res.filter(t => t.appId).map(t => t.appId);
      const appInfos = await this.appService.getAccessibleApps(appIds, req.user);
      return res.map((item: any) => {
        item.appLogo = appInfos.find(t => t.id === item.appId)?.coverImg;
        // 删除时间字段
        delete item.createdAt;
        delete item.updatedAt;
        return item;
      });
    } catch (error) {
      Logger.error(`查询对话组失败: ${error.message || error}`, error?.stack, 'ChatGroupService');
      throw new HttpException('查询对话组失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async update(body: { title?: string; isSticky?: boolean; groupId: number; config?: string; fileUrl?: string; pluginId?: number }, req: Request) {
    // Logger.debug(`body: ${JSON.stringify(body)}`);
    const { title, isSticky, groupId, config, fileUrl, pluginId } = body;
    const { id, role } = req.user;
    const where =
      role === 'visitor' ? { id: groupId, visitorId: String(id) } : { id: groupId, userId: id };
    const g = await this.chatGroupEntity.findOne({
      where,
    });
    if (!g) {
      throw new HttpException('请先选择一个对话或者新加一个对话再操作！', HttpStatus.BAD_REQUEST);
    }
    const { appId } = g;
    if (appId && !title) {
      try {
        const parseData = JSON.parse(config);
        if (Number(parseData.keyType) !== 1) {
          throw new HttpException('应用对话名称不能修改哟！', HttpStatus.BAD_REQUEST);
        }
      } catch (error) {
        // ignore
      }
    }
    const data = {};
    title && (data['title'] = title);
    typeof isSticky !== 'undefined' && (data['isSticky'] = isSticky);
    config && (data['config'] = config);
    typeof fileUrl !== 'undefined' && (data['fileUrl'] = fileUrl);
    typeof pluginId !== 'undefined' && (data['pluginId'] = pluginId);
    const u = await this.chatGroupEntity.update({ id: groupId }, data);
    if (u.affected) {
      // // 如果 fileUrl 不为空，异步处理 PDF 内容读取
      // if (fileUrl) {
      //   this.handlePdfExtraction(fileUrl, groupId);
      // }
      return true;
    } else {
      throw new HttpException('更新对话失败！', HttpStatus.BAD_REQUEST);
    }
  }

  // 从 PDF 文件 URL 中提取文本内容
  private async extractPdfText(fileUrl: string): Promise<string> {
    try {
      const { buffer: pdfBuffer } = await fetchRemoteUrlBuffer(fileUrl, {
        timeoutMs: 30000,
        maxBytes: 25 * 1024 * 1024,
        maxRedirects: 3,
      });
      // 使用 pdf2md 库转换为 Markdown
      const markdownContent = await pdf2md(pdfBuffer);
      return markdownContent;
    } catch (error) {
      Logger.error(`PDF 解析失败: ${error.message || error}`, error?.stack, 'ChatGroupService');
      throw new Error('PDF 解析失败');
    }
  }

  async updateTime(groupId: number) {
    await this.chatGroupEntity.update(groupId, {
      updatedAt: new Date(),
    });
  }

  private getOwnedGroupWhere(groupId: number, req: Request) {
    const { id, role } = req.user;
    return role === 'visitor'
      ? { id: groupId, visitorId: String(id), isDelete: false }
      : { id: groupId, userId: id, isDelete: false };
  }

  async getOwnedGroupInfoFromId(groupId: number, req: Request) {
    if (!groupId) return;
    const groupInfo = await this.chatGroupEntity.findOne({
      where: this.getOwnedGroupWhere(groupId, req),
    });
    if (!groupInfo) {
      throw new HttpException('非法操作、您无权访问该对话！', HttpStatus.FORBIDDEN);
    }
    const { pdfTextContent, ...rest } = groupInfo;
    return rest;
  }

  async updateOwnedTime(groupId: number, req: Request) {
    const result = await this.chatGroupEntity.update(this.getOwnedGroupWhere(groupId, req), {
      updatedAt: new Date(),
    });
    if (!result.affected) {
      throw new HttpException('非法操作、您无权访问该对话！', HttpStatus.FORBIDDEN);
    }
  }

  async del(body: DelGroupDto, req: Request) {
    const { groupId } = body;
    const { id, role } = req.user;
    const where =
      role === 'visitor' ? { id: groupId, visitorId: String(id) } : { id: groupId, userId: id };
    const g = await this.chatGroupEntity.findOne({
      where,
    });
    if (!g) {
      throw new HttpException('非法操作、您在删除一个非法资源！', HttpStatus.BAD_REQUEST);
    }
    const r = await this.chatGroupEntity.update({ id: groupId }, { isDelete: true });
    if (r.affected) {
      return '删除成功';
    } else {
      throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除非置顶开启的所有对话记录 */
  async delAll(req: Request) {
    const { id, role } = req.user;
    const where =
      role === 'visitor'
        ? { visitorId: String(id), isSticky: false, isDelete: false }
        : { userId: id, isSticky: false, isDelete: false };
    const r = await this.chatGroupEntity.update(where, { isDelete: true });
    if (r.affected) {
      return '删除成功';
    } else {
      throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过groupId查询当前对话组的详细信息 */
  async getGroupInfoFromId(id) {
    if (!id) return;
    const groupInfo = await this.chatGroupEntity.findOne({ where: { id } });
    if (groupInfo) {
      const { pdfTextContent, ...rest } = groupInfo;
      return rest;
    }
  }

  async getGroupPdfText(groupId: number) {
    const groupInfo = await this.chatGroupEntity.findOne({
      where: { id: groupId },
    });
    if (groupInfo) {
      return groupInfo.pdfTextContent;
    }
  }
}
