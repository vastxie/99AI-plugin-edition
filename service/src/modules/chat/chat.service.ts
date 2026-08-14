import {
  correctApiBaseUrl,
  formatUrl,
  getClientIp,
  getTokenCount,
  handleError,
  removeThinkTags,
} from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { OpenAI } from 'openai';
import { Repository } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import { OpenAIChatService } from '../aiTool/chat/chat.service';
import { ChatDrawService } from '../aiTool/image/chatDraw.service';
import { CustomImageService } from '../aiTool/image/customImage.service';
import { GptImageService } from '../aiTool/image/gptImage.service';
import { SunoService } from '../aiTool/music/suno.service';
import { UnifiedCreativeService } from '../aiTool/unifiedCreative/unifiedCreative.service';
import { CustomVideoService } from '../aiTool/video/customVideo.service';
import { AppEntity } from '../app/app.entity';
import { AppService } from '../app/app.service';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { BadWordsService } from '../badWords/badWords.service';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatProcessDto } from './dto/chatProcess.dto';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { UploadService } from '../upload/upload.service';
import { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    @InjectRepository(PluginEntity)
    private readonly pluginEntity: Repository<PluginEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly sunoService: SunoService,
    private readonly openAIChatService: OpenAIChatService,
    private readonly chatLogService: ChatLogService,
    private readonly userBalanceService: UserBalanceService,
    private readonly userService: UserService,
    private readonly uploadService: UploadService,
    private readonly badWordsService: BadWordsService,
    private readonly autoReplyService: AutoReplyService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatGroupService: ChatGroupService,
    private readonly modelsService: ModelsService,
    private readonly customVideoService: CustomVideoService,
    private readonly gptImageService: GptImageService,
    private readonly appService: AppService,
    private readonly chatDrawService: ChatDrawService,
    private readonly agentService: AgentService,
    private readonly customImageService: CustomImageService,
    private readonly unifiedCreativeService: UnifiedCreativeService,
  ) {}

  async chatProcess(body: ChatProcessDto, req?: Request, res?: Response) {
    let shouldFinalizeResponse = true;
    // 游客使用指纹ID，注册用户使用真实ID
    const chatUserId = req.user.id;
    const visitorId = req.user.role === 'visitor' ? String(req.user.id) : null;

    // 访客用户跳过认证检查
    if (req.user.role !== 'visitor') {
      await this.userBalanceService.checkUserCertification(req.user.id);
    }
    /* 获取对话参数 */
    const {
      options = {},
      usingPluginId,
      appId = null,
      prompt,
      fileUrl: originalFileUrl,
      imageUrl,
      extraParam,
      model,
      drawId,
      customId,
      action,
      modelName,
      videoUrl,
      editorContent,
    } = body;

    // 处理后的fileUrl（可能包含应用知识库URLs）
    let fileUrl = originalFileUrl;

    let { groupId, usingTool, usingDeepThinking, useKnowledgeBase } = options;
    groupId = this.normalizeGroupId(groupId);
    const historyOwner = this.getHistoryOwner(req);
    const ownedGroupInfo = groupId
      ? await this.chatGroupService.getOwnedGroupInfoFromId(groupId, req)
      : null;

    // 获取应用信息
    let appInfo;
    if (appId) {
      appInfo = await this.appService.getAccessibleApp(Number(appId), req.user);

      // 检查应用是否为会员专属
      const isAppMemberOnly = await this.appService.checkAppIsMemberOnly(Number(appId));
      if (isAppMemberOnly) {
        const userCatIds =
          req.user.role === 'visitor' ? [] : await this.userBalanceService.getUserApps(req.user.id);

        // 获取应用所属的分类ID列表
        const appCatIds = appInfo.catId.split(',').map(id => id.trim());

        // 检查用户拥有的分类ID是否与应用的分类ID有交集
        // 只要有一个分类ID匹配，就允许用户使用该应用
        const hasMatchingCategory = appCatIds.some(catId => userCatIds.includes(catId));

        if (!hasMatchingCategory) {
          throw new HttpException(
            '你当前使用的应用为会员专属应用，请先开通会员！',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      // 处理应用的知识库URL配置
      // 如果应用配置了知识库URLs，将其合并到fileUrl参数中
      if (appInfo.knowledgeBaseUrls) {
        try {
          const appKnowledgeUrls = JSON.parse(appInfo.knowledgeBaseUrls);
          if (Array.isArray(appKnowledgeUrls) && appKnowledgeUrls.length > 0) {
            // 将知识库URLs转换为文件对象格式
            const knowledgeFileObjects = appKnowledgeUrls.map(url => ({
              name: '', // 知识库文件不需要名称
              url: url,
              type: 'knowledge', // 标记为知识库类型
            }));

            // 如果用户没有上传文件，直接使用知识库URLs
            if (!fileUrl) {
              fileUrl = JSON.stringify(knowledgeFileObjects);
              Logger.log(
                `[应用知识库] 应用ID ${appId} 配置了 ${appKnowledgeUrls.length} 个知识库文件`,
                'ChatService',
              );
            } else {
              // 如果用户也上传了文件，合并知识库URLs
              try {
                const userFileObjects = JSON.parse(fileUrl);
                if (Array.isArray(userFileObjects)) {
                  const mergedFiles = [...userFileObjects, ...knowledgeFileObjects];
                  fileUrl = JSON.stringify(mergedFiles);
                  Logger.log(
                    `[应用知识库] 应用ID ${appId} 合并用户文件和知识库文件，共 ${mergedFiles.length} 个`,
                    'ChatService',
                  );
                } else {
                  // 用户fileUrl不是数组，无法合并，使用知识库URLs
                  fileUrl = JSON.stringify(knowledgeFileObjects);
                  Logger.log(
                    `[应用知识库] 应用ID ${appId} 用户文件格式异常，仅使用知识库文件`,
                    'ChatService',
                  );
                }
              } catch (parseError) {
                // 用户fileUrl不是JSON格式，无法合并，使用知识库URLs
                fileUrl = JSON.stringify(knowledgeFileObjects);
                Logger.log(
                  `[应用知识库] 应用ID ${appId} 用户文件非JSON格式，仅使用知识库文件`,
                  'ChatService',
                );
              }
            }
          }
        } catch (error) {
          Logger.error(`[应用知识库] 解析应用知识库URLs失败: ${handleError(error)}`, 'ChatService');
        }
      }
    }

    // 处理用户知识库文件
    // 只有在用户明确开启知识库开关时才附加用户知识库文件
    let userKnowledgeFiles = [];
    if (useKnowledgeBase && chatUserId && req.user.role !== 'visitor') {
      try {
        const userInfo = await this.userEntity.findOne({
          where: { id: chatUserId },
          select: ['knowledgeFiles'],
        });

        if (
          userInfo?.knowledgeFiles &&
          Array.isArray(userInfo.knowledgeFiles) &&
          userInfo.knowledgeFiles.length > 0
        ) {
          // 将用户知识库文件对象转换为文件对象格式
          userKnowledgeFiles = userInfo.knowledgeFiles.map(
            (file: { fileName: string; fileUrl: string }) => ({
              name: file.fileName,
              url: file.fileUrl,
              type: 'user_knowledge', // 标记为用户知识库类型
            }),
          );
          Logger.log(
            `[用户知识库] 用户ID ${chatUserId} 开启知识库，配置了 ${userInfo.knowledgeFiles.length} 个知识库文件`,
            'ChatService',
          );
        }
      } catch (error) {
        Logger.error(`[用户知识库] 获取用户知识库文件失败: ${handleError(error)}`, 'ChatService');
      }
    }

    // 合并用户知识库文件到fileUrl
    if (userKnowledgeFiles.length > 0) {
      if (!fileUrl) {
        // 如果用户没有上传文件，直接使用知识库URLs
        fileUrl = JSON.stringify(userKnowledgeFiles);
      } else {
        // 如果用户上传了文件，合并知识库URLs
        try {
          const userFileObjects = JSON.parse(fileUrl);
          if (Array.isArray(userFileObjects)) {
            const mergedFiles = [...userFileObjects, ...userKnowledgeFiles];
            fileUrl = JSON.stringify(mergedFiles);
            Logger.log(
              `[用户知识库] 用户ID ${chatUserId} 合并用户文件和知识库文件，共 ${mergedFiles.length} 个`,
              'ChatService',
            );
          } else {
            // 用户fileUrl不是数组，追加知识库URLs
            fileUrl = JSON.stringify(userKnowledgeFiles);
          }
        } catch (parseError) {
          // 用户fileUrl不是JSON格式，追加知识库URLs
          const mergedFiles = userKnowledgeFiles;
          fileUrl = JSON.stringify(mergedFiles);
        }
      }
    }

    const {
      openaiBaseUrl,
      openaiBaseKey,
      systemPreMessage,
      openaiTemperature,
      isGeneratePromptReference,
      isSensitiveWordFilter,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseUrl',
      'openaiBaseKey',
      'systemPreMessage',
      'openaiTemperature',
      'openaiBaseModel',
      'isGeneratePromptReference',
      'isSensitiveWordFilter',
    ]);

    /* 检测用户状态 */
    await this.userService.checkUserStatus(req.user);

    /* 敏感词检测 */
    res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
    // 检查敏感词汇
    if (isSensitiveWordFilter === '1') {
      const triggeredWords = await this.badWordsService.checkBadWords(prompt, chatUserId);
      if (triggeredWords.length > 0) {
        // 如果返回的数组不为空
        const tips = `您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！`;
        throw new HttpException(tips, HttpStatus.BAD_REQUEST);
      }
    }

    /* 自动回复 */
    const autoReplyRes = await this.autoReplyService.checkAutoReply(prompt);

    /* 设置对话变量 */
    let currentRequestModelKey = null;
    let appName = '';
    let setSystemMessage = '';
    res && res.status(200);
    const curIp = getClientIp(req);
    let usingPlugin;

    if (usingPluginId) {
      if (usingPluginId === 999) {
        usingPlugin = {
          parameters: 'mermaid',
        };
      } else {
        usingPlugin = await this.pluginEntity.findOne({
          where: { id: usingPluginId },
        });
      }
    }

    /* 获取模型配置及预设设置 */
    if (appInfo) {
      const { isGPTs, gizmoID, name, isFixedModel, appModel, isFlowith } = appInfo;
      appName = name;
      if (isGPTs) {
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo('gpts');
        currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
      } else if (isFlowith) {
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo('flowith');
        appInfo.preset && (setSystemMessage = appInfo.preset);
      } else if (!isGPTs && !isFlowith && isFixedModel && appModel) {
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(appModel);
        currentRequestModelKey.model = appModel;
      } else {
        // 使用应用预设
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
      }
    } else {
      if (usingPlugin?.parameters === 'mind-map') {
        setSystemMessage =
          'Please provide a detailed outline in Markdown format: Use a multi-level structure with at least 3-4 levels. Include specific solutions or steps under each topic. Make it suitable for creating mind maps. Provide only the outline content without any irrelevant explanations. Start directly with the outline, no introduction needed. Use the language I asked in. Note: Use #, ##, ### etc. for different heading levels. Use - or * for list items. Use bold, italic etc. to emphasize key points. Use tables, code blocks etc. as needed. Please provide a clear, content-rich Markdown format outline based on these requirements.';
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
      } else if (usingPlugin?.parameters === 'mermaid') {
        setSystemMessage = `
{
"title": "Mermaid专业图表大师",
"description": "智能多类型Mermaid图表生成专家",

## 角色定位
你是一位精通Mermaid语法的专业图表设计师，具备将复杂信息转化为清晰可视化图表的卓越能力。你不仅掌握所有Mermaid图表类型，还能根据用户需求智能选择最优图表方案。

## 核心能力矩阵

### 流程与逻辑类
- **流程图(flowchart)**: 展示流程、决策和系统工作流
- **时序图(sequenceDiagram)**: 描述对象间的交互顺序
- **状态图(stateDiagram)**: 展示状态转换和生命周期
- **用户旅程图(journey)**: 可视化用户体验历程

### 结构与关系类
- **类图(classDiagram)**: UML类结构和继承关系
- **实体关系图(erDiagram)**: 数据库实体关系建模
- **C4图(C4Context等)**: 软件架构多层次视图
- **思维导图(mindmap)**: 思维结构和概念关联

### 时间与进度类
- **甘特图(gantt)**: 项目进度和时间规划
- **时间线图(timeline)**: 历史事件和里程碑
- **Gitgraph图(gitGraph)**: Git版本控制历史

### 数据与分析类
- **饼图(pie)**: 占比和构成分析
- **象限图(quadrantChart)**: 二维分类和定位分析
- **桑基图(sankey)**: 流量和转化路径
- **XY图(xychart-beta)**: 数据点分布和趋势
- **雷达图**: 多维度能力或属性评估

### 专业领域类
- **需求图(requirementDiagram)**: 需求追踪和验证
- **ZenUML**: 更现代的序列图表达
- **框图(block-beta)**: 系统组件和层次结构
- **数据包图**: 网络通信数据流
- **看板图**: 任务状态和工作流
- **架构图**: 系统架构和组件关系

## 智能工作流程

### 1. 需求分析阶段
- 根据历史上下文和用户描述识别用户需求，并根据需求生成图表
- 根据用户需求生成图表，并根据图表的结构特征（顺序性/层次性/关联性/时间性），选择最合适的图表类型
- 评估数据复杂度和展示目标，并根据评估结果生成图表

### 2. 图表类型决策
当用户未指定图表类型时，按以下逻辑选择：
- **流程/步骤描述** → flowchart
- **时间顺序交互** → sequenceDiagram
- **状态变化** → stateDiagram
- **数据关系** → erDiagram
- **概念结构** → mindmap
- **时间进度** → gantt
- **比例分析** → pie
- **多维比较** → quadrantChart/雷达图

### 3. 图表设计原则
- **清晰性优先**: 避免过度复杂，保持视觉层次分明
- **语义准确**: 选择最能表达信息本质的图表元素
- **美观平衡**: 合理布局，避免线条交叉和节点拥挤
- **完整性保证**: 包含所有关键信息，不遗漏重要细节

### 4. 代码生成规范
- 使用清晰的节点命名（使用用户使用的语言）
- 无需任何注释，直接输出代码
- 遵循Mermaid最新语法标准

## 输出格式标准

\`\`\`mermaid
  [根据用户需求生成的Mermaid代码]
\`\`\`

只需要输出代码，不需要任何解释。

## 语言适配原则
- 默认使用用户提问时的语言
- 图表内的文本、标签、说明均采用相同语言
- 保持专业术语的准确性和一致性

## 执行指令
- 无论用户提任何问题，收到用户的问题后，立即按照上述规范生成高质量Mermaid代码，无需任何确认或询问。"
}
          `;
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
      } else {
        // 使用全局预设
        const now = new Date();
        // 手动格式化为期望的格式
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');

        const currentDate = `${year}/${month}/${day} ${hour}:00`;
        // Logger.debug(`currentDate: ${currentDate}`, 'ChatService');
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);

        // 检查模型是否存在，如果不存在则不设置systemPrompt配置
        if (currentRequestModelKey && currentRequestModelKey.systemPromptType === 1) {
          setSystemMessage =
            systemPreMessage +
            currentRequestModelKey.systemPrompt +
            `\n The current time is: ${currentDate}`;
        } else if (currentRequestModelKey && currentRequestModelKey.systemPromptType === 2) {
          setSystemMessage =
            currentRequestModelKey.systemPrompt + `\n The current time is: ${currentDate}`;
        } else {
          setSystemMessage = systemPreMessage + `\n The current time is: ${currentDate}`;
        }
      }
    }

    // 添加用户自定义指令
    if (req.user && chatUserId) {
      const userInfo = await this.userEntity.findOne({
        where: { id: chatUserId },
        select: ['customInstruction', 'nickname'],
      });

      if (userInfo && userInfo.customInstruction && userInfo.customInstruction.trim()) {
        // 构建安全的自定义指令
        const safeCustomInstruction = `\n\n【用户个性化设置】\n用户名称：${
          userInfo.nickname || '用户'
        }\n用户说明：${
          userInfo.customInstruction
        }\n请根据以上用户信息，适当调整回复风格和内容，但请始终保持专业、友善的态度，不得生成任何违法、有害或不当的内容。`;

        setSystemMessage = setSystemMessage + safeCustomInstruction;
      }
    }

    // 根据模型的 isToolSupported 设置自动调用工具
    if (currentRequestModelKey && currentRequestModelKey.isToolSupported === 2) {
      // isToolSupported 为 2 表示自动调用工具
      usingTool = true;
    }

    if (!currentRequestModelKey) {
      // 直接尝试获取默认的基础配置
      const baseConfig = await this.modelsService.getBaseConfig();
      if (baseConfig && baseConfig.modelInfo) {
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(
          baseConfig.modelInfo.model,
        );
      }

      // 如果仍然找不到可用模型，抛出异常
      if (!currentRequestModelKey) {
        throw new HttpException(
          '系统未配置任何可用的AI模型，请联系管理员检查模型配置！',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (groupId) {
        const groupInfo = ownedGroupInfo;

        if (!groupInfo) {
          Logger.warn(`未找到 ID 为 ${groupId} 的对话分组，跳过模型配置同步`, 'ChatService');
        } else {
          // 假设 groupInfo.config 是 JSON 字符串，并且你需要替换其中的 modelName 和 model
          let updatedConfig = groupInfo.config;
          try {
            const parsedConfig = JSON.parse(groupInfo.config);
            if (parsedConfig.modelInfo && currentRequestModelKey) {
              parsedConfig.modelInfo.modelName = currentRequestModelKey.modelName; // 替换为你需要的模型名称
              parsedConfig.modelInfo.model = currentRequestModelKey.model; // 替换为你需要的模型
              updatedConfig = JSON.stringify(parsedConfig);
            }
          } catch (error) {
            Logger.error('模型配置解析失败', error);
            throw new HttpException('配置解析错误！', HttpStatus.BAD_REQUEST);
          }

          await this.chatGroupService.update(
            {
              groupId,
              title: groupInfo.title,
              isSticky: false,
              config: updatedConfig,
              fileUrl: fileUrl,
            },
            req,
          );
        }
      }
    }

    // 检查模型配置的key和url，如果缺失则使用全局配置
    if (
      currentRequestModelKey &&
      (!currentRequestModelKey.key || !currentRequestModelKey.proxyUrl)
    ) {
      // 如果模型的key为空，使用全局key
      if (!currentRequestModelKey.key && openaiBaseKey) {
        currentRequestModelKey.key = openaiBaseKey;
      }

      // 如果模型的proxyUrl为空，使用全局url
      if (!currentRequestModelKey.proxyUrl && openaiBaseUrl) {
        currentRequestModelKey.proxyUrl = openaiBaseUrl;
      }

      // 如果补充后仍然缺少必要配置，抛出错误
      if (!currentRequestModelKey.key || !currentRequestModelKey.proxyUrl) {
        throw new HttpException(
          '模型配置缺少API密钥或地址，且全局配置也未设置，请在管理后台正确配置！',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    const {
      deduct,
      isTokenBased,
      tokenFeeRatio,
      deductType,
      key,
      id: keyId,
      maxRounds,
      proxyUrl,
      maxModelTokens,
      max_tokens,
      model: useModel,
      isFileUpload: originalIsFileUpload,
      isImageUpload,
      keyType: modelType,
      deepThinkingType,
      drawingType,
      additionalParams,
    } = currentRequestModelKey;

    // 如果应用配置了知识库URL，但模型未启用文件上传(isFileUpload !== 2)，则强制启用
    let isFileUpload = originalIsFileUpload;
    if (appInfo && appInfo.knowledgeBaseUrls && fileUrl && isFileUpload !== 2) {
      try {
        const appKnowledgeUrls = JSON.parse(appInfo.knowledgeBaseUrls);
        if (Array.isArray(appKnowledgeUrls) && appKnowledgeUrls.length > 0) {
          isFileUpload = 2; // 强制启用文件上传模式以支持知识库向量搜索
          Logger.log(
            `[应用知识库] 应用ID ${appId} 配置了知识库，强制启用文件上传模式 (isFileUpload: ${originalIsFileUpload} -> 2)`,
            'ChatService',
          );
        }
      } catch (error) {
        // 解析失败，不修改isFileUpload
      }
    }

    if (await this.chatLogService.checkModelLimits(req.user, useModel)) {
      res.write(
        `\n${JSON.stringify({
          status: 3,
          content: '1 小时内对话次数过多，请切换模型或稍后再试！',
          modelType: modelType,
        })}`,
      );
      shouldFinalizeResponse = false;
      res.end();
      return;
    }

    // 检测用户余额
    await this.userBalanceService.validateBalance(req, deductType, deduct);

    // 整理对话参数
    const useModeName = modelName;
    const proxyResUrl = formatUrl(proxyUrl || openaiBaseUrl || 'https://api.openai.com');

    const modelKey = key || openaiBaseKey;
    const modelTimeout = 10 * 60 * 1000; // 统一使用10分钟超时
    const temperature = Number(openaiTemperature) || 0.7;

    if (groupId) {
      const groupInfo = ownedGroupInfo;
      this.updateChatTitle(groupId, groupInfo, modelType, prompt, req); // Call without await
      await this.chatGroupService.updateOwnedTime(groupId, req);
    }

    const userSaveLog = await this.chatLogService.saveChatLog({
      appId: appId,
      curIp,
      userId: chatUserId,
      visitorId,
      type: modelType ? modelType : 1,
      fileUrl: fileUrl ? fileUrl : null,
      imageUrl: imageUrl ? imageUrl : null,
      videoUrl: videoUrl ? videoUrl : null,
      content: prompt,
      totalTokens: 0,
      model: useModel,
      modelName: '我',
      role: 'user',
      groupId: groupId ? groupId : null,
    });

    const assistantSaveLog = await this.chatLogService.saveChatLog({
      appId: appId ? appId : null,
      action: action ? action : null,
      curIp,
      userId: chatUserId,
      visitorId,
      type: modelType ? modelType : 1,
      progress: '0%',
      model: useModel,
      modelName: useModeName,
      role: 'assistant',
      groupId: groupId ? groupId : null,
      status: 2,
      pluginParam: usingPlugin?.parameters
        ? usingPlugin.parameters
        : modelType === 2 || modelType === 6
        ? useModel
        : null,
    });
    const userLogId = userSaveLog.id;
    const assistantLogId = assistantSaveLog.id;

    res.write(
      `\n${JSON.stringify({
        status: 2,
        modelType: modelType,
        modelName: modelName,
        chatId: assistantLogId,
      })}`,
    );

    if (autoReplyRes.answer && res) {
      if (autoReplyRes.isAIReplyEnabled === 0) {
        const chars = autoReplyRes.answer.split('');
        // 使用一个递归函数来逐个字符发送响应
        const sendCharByChar = index => {
          if (!res || res.writableEnded) {
            return;
          }
          if (index < chars.length) {
            const msg = {
              chatId: assistantLogId,
              modelType: modelType,
              modelName: useModeName,
              status: 'streaming',
              content: [
                {
                  type: 'text',
                  text: chars[index],
                },
              ],
            };
            res.write(`\n${JSON.stringify(msg)}`); // 发送当前字符
            setTimeout(() => sendCharByChar(index + 1), 10); // 设置定时器递归调用
          } else if (!res.writableEnded) {
            res.write(
              `\n${JSON.stringify({
                chatId: assistantLogId,
                finishReason: 'stop',
                status: 'completed',
                modelType: modelType,
                modelName: useModeName,
              })}`,
            );
            res.end(); // 所有字符发送完毕，结束响应
          }
        };

        // 从第一个字符开始发送
        sendCharByChar(0);
        shouldFinalizeResponse = false;
        await this.chatLogService.updateChatLog(assistantLogId, {
          content: autoReplyRes.answer,
        });
        return;
      } else {
        setSystemMessage = setSystemMessage + autoReplyRes.answer;
      }
    }

    /* 获取历史消息 */
    const messageContext = await this.buildMessageFromParentMessageId(
      {
        groupId,
        systemMessage: setSystemMessage,
        maxModelTokens,
        maxRounds: maxRounds,
        fileUrl: fileUrl,
        imageUrl: imageUrl,
        model: useModel,
        isFileUpload,
        isImageUpload,
        historyOwner,
      },
      this.chatLogService,
    );
    const { messagesHistory, historyRecords } = messageContext;
    const buildHistoryWithCache = (overrideOptions, service = this.chatLogService) => {
      const requestedRounds =
        overrideOptions && typeof overrideOptions.maxRounds !== 'undefined'
          ? Number(overrideOptions.maxRounds)
          : undefined;
      const historyForReuse =
        Array.isArray(historyRecords) && requestedRounds && requestedRounds > 0
          ? historyRecords.slice(-requestedRounds)
          : historyRecords;

      return this.buildMessageFromParentMessageId(
        {
          preloadedHistory: historyForReuse,
          skipTokenCheck: true,
          ...overrideOptions,
        },
        service,
      );
    };

    /* 基础扣费金额（MJ系数计算已移至MJ服务内部） */
    let charge = deduct;

    // 用于存储自定义视频/图片的计费系数
    let billingCoefficient = 1;

    const abortController = new AbortController();

    // 用于后续可能的插件参数覆盖
    let pluginParamOverride = null;

    // 用于存储当前已生成的部分数据
    let currentGeneratedData: any = {
      content: '',
      agent_content: null,
      reasoning_content: '',
      totalTokens: 0,
      pluginParam: null, // 添加插件参数，用于刷新后正确显示卡片
    };

    // 标记响应是否已正常完成
    let isResponseCompleted = false;
    let hasUserAborted = false;

    /* 处理对话  */
    try {
      if (res) {
        res.on('close', async () => {
          // 只在用户真正中断时执行（未正常完成的情况）
          if (!isResponseCompleted) {
            hasUserAborted = true;
            abortController.abort();

            // 当用户主动停止响应时，保存已生成的部分数据
            try {
              const updateData: any = {};

              // 保存已生成的内容
              if (currentGeneratedData.content) {
                updateData.content = currentGeneratedData.content;
              }

              // 保存深度思考内容
              if (currentGeneratedData.reasoning_content) {
                updateData.reasoning_content = currentGeneratedData.reasoning_content;
              }

              // 保存agent数据（包含所有工作流的状态信息）
              if (currentGeneratedData.agent_content) {
                updateData.agent_content = currentGeneratedData.agent_content;
              }

              // 保存token信息
              if (currentGeneratedData.totalTokens) {
                updateData.totalTokens = currentGeneratedData.totalTokens;
              }

              // 保存插件参数（重要：用于刷新后正确显示卡片）
              if (
                currentGeneratedData.pluginParam ||
                pluginParamOverride ||
                usingPlugin?.parameters
              ) {
                updateData.pluginParam =
                  currentGeneratedData.pluginParam ||
                  pluginParamOverride ||
                  usingPlugin?.parameters;
              }

              // 更新状态为中断但已保存
              updateData.status = 3; // 3表示完成，即使是部分完成

              // 批量更新数据库
              if (Object.keys(updateData).length > 0) {
                await this.chatLogService.updateChatLog(assistantLogId, updateData);
              }
            } catch (error) {
              Logger.error('保存中断数据失败', error, 'ChatService');
            }
          }
        });

        let response: any;
        // const { key, maxToken, maxTokenRes, proxyResUrl } = await this.formatModelToken(currentRequestModelKey);
        try {
          /* 视频、音乐、通用创意 */
          if (modelType === 3 || modelType === 4 || modelType === 6) {
            // 优先检查 modelType === 6（通用创意模式）
            if (modelType === 6) {
              // 通用创意模式 - FC 智能调度 (图片+视频混合)
              Logger.log('开始处理通用创意模式请求', 'ChatService');
              Logger.debug(
                `模型配置: modelType=${modelType}, modelName=${useModel}`,
                'ChatService',
              );

              try {
                // 解析 customConfig
                const customConfig = currentRequestModelKey.customConfig
                  ? JSON.parse(currentRequestModelKey.customConfig)
                  : null;

                if (!customConfig || !customConfig.tools) {
                  Logger.error('通用创意模型未配置自定义接口参数', 'ChatService');
                  throw new Error('通用创意模型未配置自定义接口参数，请在管理端配置');
                }

                // ✨ 改造：无论是同步还是异步模式，都先返回 status=2（生成中）
                // 1. 先更新数据库状态为"生成中"
                await this.chatLogService.updateChatLog(assistantLogId, {
                  status: 2,
                  content: '任务生成中...',
                });

                // 2. 异步处理创意生成任务（不阻塞响应）
                let taskBillingCoefficient = 1; // 用于存储实际的计费系数

                // 异步处理创意生成任务（完全参考 customImage 的处理方式）
                this.unifiedCreativeService
                  .handleCreativeRequest({
                    customConfig,
                    prompt,
                    groupId: groupId || 0,
                    currentImageUrl: imageUrl,
                    currentVideoUrl: videoUrl,
                    extraParam,
                    model: useModel,
                    assistantLogId,
                    apiKey: modelKey,
                    apiBaseUrl: proxyResUrl,
                    historyOwner,
                    onTaskSubmitted: async data => {
                      // ✨ FC完成 + 任务提交回调：保存工具类型并扣费
                      const selectedTool = data?.selectedTool;
                      const progressReply = data?.progressReply; // ✨ 提取进度回复
                      const completionReply = data?.completionReply; // ✨ 提取完成回复

                      // ✨ 保存工具类型和进度回复到数据库,供前端立即读取
                      if (selectedTool || progressReply) {
                        await this.chatLogService.updateChatLog(assistantLogId, {
                          action: selectedTool, // ✨ 保存工具类型到action字段
                          content: progressReply || '任务生成中...', // ✨ 保存进度回复作为初始内容
                        });
                      }

                      // ✨ 扣费
                      taskBillingCoefficient = data?.billingCoefficient || 1;
                      const finalCharge = charge * taskBillingCoefficient;

                      Logger.log(
                        `通用创意任务提交成功，扣除积分: 基础费用=${charge}, 计费系数=${taskBillingCoefficient}, 最终费用=${finalCharge}`,
                        'ChatService',
                      );

                      await this.modelsService.saveUseLog(keyId, 1);
                      await this.userBalanceService.deductFromBalance(
                        chatUserId,
                        deductType,
                        finalCharge,
                        0,
                        assistantLogId,
                        modelType,
                      );

                      // 更新全局计费系数
                      billingCoefficient = taskBillingCoefficient;
                    },
                    onProgress: async data => {
                      // ✨ 进度更新回调：更新数据库中的进度和内容
                      Logger.log(`通用创意任务进度更新: ${data.progress}`, 'ChatService');
                      await this.chatLogService.updateChatLog(assistantLogId, {
                        progress: data.progress,
                        content: data.content, // ✨ 更新内容，显示进度信息
                      });
                    },
                    onSuccess: async data => {
                      Logger.log('通用创意任务成功，更新数据库', 'ChatService');
                      await this.chatLogService.updateChatLog(assistantLogId, {
                        imageUrl: data?.imageUrl,
                        videoUrl: data?.videoUrl,
                        content: data?.content || prompt,
                        progress: data?.progress || '100%',
                        status: 3,
                        taskId: data?.taskId,
                        customId: data?.customId ? JSON.stringify(data.customId) : undefined,
                      });
                      Logger.debug(
                        `[通用创意] 保存 taskId: ${data?.taskId}, customId: ${JSON.stringify(
                          data?.customId,
                        )}`,
                        'ChatService',
                      );
                    },
                    onFailure: async data => {
                      Logger.error('通用创意任务失败，更新数据库并退款', 'ChatService');
                      await this.chatLogService.updateChatLog(assistantLogId, {
                        content: data?.content || '任务失败',
                        status: 4,
                      });
                      // 退还积分（任务已提交成功但执行失败）
                      if (chatUserId && charge && deductType) {
                        const refundAmount = charge * taskBillingCoefficient;
                        await this.userBalanceService.refundBalance(
                          chatUserId,
                          deductType,
                          refundAmount,
                          assistantLogId,
                          6, // chatType: 6=通用创意
                          '通用创意任务失败',
                        );
                        Logger.log(`生成失败，退还积分: ${refundAmount}`, 'ChatService');
                      }
                    },
                  })
                  .catch(error => {
                    Logger.error(
                      `通用创意后台任务异常: ${error.message}`,
                      error.stack,
                      'ChatService',
                    );
                  });

                // ✨ 标记响应已正常完成，防止 res.on('close') 错误地将 status 改为 3
                isResponseCompleted = true;

                // ✨ 改造：不再等待，立即返回 response
                response = {
                  status: 2,
                  modelType: modelType,
                };
              } catch (error) {
                Logger.error(`通用创意生成失败: ${error.message}`, error.stack, 'ChatService');
                response = { text: `通用创意生成失败: ${error.message}`, status: 5 };

                await this.chatLogService.updateChatLog(assistantLogId, {
                  content: response.text,
                  status: response.status,
                });

                // 退还积分
                if (chatUserId && charge && deductType) {
                  await this.userBalanceService.refundBalance(
                    chatUserId,
                    deductType,
                    charge,
                    assistantLogId,
                    6,
                    '通用创意生成异常',
                  );
                }
              }
            }
          } else if (modelType === 4) {
            // Suno 音乐生成（目前只有一个音乐模型）
            response = this.sunoService.suno({
              assistantLogId,
              apiKey: modelKey,
              action,
              prompt,
              timeout: modelTimeout,
              proxyUrl: proxyResUrl,
              taskData: customId,
              userId: chatUserId,
              deductType: deductType,
              charge: charge,
            });
            await this.chatLogService.updateChatLog(assistantLogId, {
              content: '提交成功，歌曲生成中',
            });
          } else if (modelType === 3) {
            // 统一视频生成 - 使用 customConfig 配置
            Logger.log('开始处理视频生成请求', 'ChatService');
            Logger.debug(`模型配置: modelType=${modelType}, modelName=${useModel}`, 'ChatService');

            try {
              // 解析 customConfig
              const customConfig = currentRequestModelKey.customConfig
                ? JSON.parse(currentRequestModelKey.customConfig)
                : null;

              if (!customConfig || !customConfig.tools) {
                Logger.error('视频模型未配置自定义接口参数', 'ChatService');
                throw new Error('视频模型未配置自定义接口参数，请在管理端配置');
              }

              // 构建历史消息用于上下文理解
              const historyMessages = [];
              let previousTaskId = null; // 用于存储上一条视频任务的taskId

              if (groupId) {
                try {
                  const history = await this.chatLogService.chatHistory(groupId, 5, historyOwner);

                  // 查找最近的一条包含taskId且是视频类型的assistant消息
                  for (let i = history.length - 1; i >= 0; i--) {
                    const record = history[i];
                    // 检查是否是assistant消息，类型是视频(3)，并且有taskId
                    if (record.role === 'assistant' && record.type === 3 && record.taskId) {
                      previousTaskId = record.taskId;
                      Logger.log(`找到上一条视频任务的taskId: ${previousTaskId}`, 'ChatService');
                      break; // 找到后立即退出循环
                    }
                  }

                  // 构建消息历史
                  for (const record of history) {
                    if (record.role === 'user' && record.content) {
                      historyMessages.push({
                        role: 'user',
                        content: record.content,
                      });
                    } else if (record.role === 'assistant' && record.content) {
                      historyMessages.push({
                        role: 'assistant',
                        content: record.content,
                      });
                    }
                  }
                } catch (error) {
                  Logger.error(`获取历史消息失败: ${error.message}`, 'ChatService');
                  // 获取历史消息失败，继续处理
                }
              }

              // 调用统一的视频服务
              response = await this.customVideoService.handleCustomVideo({
                customConfig,
                prompt,
                imageUrl,
                videoUrl,
                extraParam,
                model: useModel,
                assistantLogId,
                apiKey: modelKey,
                apiBaseUrl: proxyResUrl,
                messages: historyMessages,
                previousTaskId, // 传递上一条视频的taskId
                onSuccess: async data => {
                  // 保存计费系数
                  if (data?.billingCoefficient) {
                    billingCoefficient = Number(data.billingCoefficient) || 1;
                    Logger.log(`自定义视频计费系数: ${billingCoefficient}`, 'ChatService');
                  }
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    videoUrl: data?.videoUrl,
                    content: data?.content || prompt,
                    progress: data?.progress || '100%',
                    status: 3,
                  });
                },
                onFailure: async data => {
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    content: data.content,
                    status: 4,
                  });
                  // 退还积分（任务已提交成功但执行失败）
                  if (chatUserId && charge && deductType) {
                    const refundAmount = charge * billingCoefficient;
                    await this.userBalanceService.refundBalance(
                      chatUserId,
                      deductType,
                      refundAmount,
                      assistantLogId,
                      3, // chatType: 3=视频
                      '自定义视频生成失败',
                    );
                  }
                },
                onGenerating: async data => {
                  // 更新进度信息
                  const updateData: any = {
                    status: 2,
                  };

                  if (data?.progress) {
                    updateData.progress = data.progress;
                  }

                  if (data?.content) {
                    updateData.content = data.content;
                  }

                  if (data?.taskId) {
                    updateData.taskId = data.taskId;
                  }

                  // 获取计费系数（任务提交成功时的系数）
                  if (data?.billingCoefficient) {
                    billingCoefficient = Number(data.billingCoefficient) || 1;
                    Logger.log(`自定义视频任务提交计费系数: ${billingCoefficient}`, 'ChatService');
                  }

                  await this.chatLogService.updateChatLog(assistantLogId, updateData);
                },
              });

              // 初始状态更新
              await this.chatLogService.updateChatLog(assistantLogId, {
                content: response.text || '提交成功，视频生成中',
                progress: '0%',
              });
            } catch (error) {
              Logger.error(`视频生成失败: ${error.message}`, error.stack, 'ChatService');
              response = { text: `视频生成失败: ${error.message}`, status: 5 };

              await this.chatLogService.updateChatLog(assistantLogId, {
                content: `视频生成失败: ${error.message}`,
                status: 4,
              });
            }

            //执行扣费
            if (response.status !== 5) {
              // 对于MJ绘画，使用服务返回的计费系数
              let actualBillingCoefficient = billingCoefficient;
              if (drawingType === 3 && response.billingCoefficient) {
                actualBillingCoefficient = response.billingCoefficient;
              }

              // 应用计费系数
              const finalCharge = charge * actualBillingCoefficient;
              Logger.log(
                `扣费计算: 基础费用=${charge}, 计费系数=${actualBillingCoefficient}, 最终费用=${finalCharge}`,
                'ChatService',
              );
              await this.modelsService.saveUseLog(keyId, 1);
              await this.userBalanceService.deductFromBalance(
                chatUserId,
                deductType,
                finalCharge,
                0,
                assistantLogId,
                modelType,
              );
            } else {
              Logger.log('任务提交失败，不执行扣费', 'ChatService');
            }

            //查询用户现在的余额
            const userBalance = await this.userBalanceService.queryUserBalance(chatUserId);
            response.userBalance = { ...userBalance };
            response.content = response.full_content || response.content || '生成中';
            response.status = response.status || 2;
            response.model = model;
            response.modelName = modelName;
            response.modelType = modelType;
            response.chatId = assistantLogId;

            // ✨ 调试日志：记录最终返回的响应状态
            if (modelType === 6) {
              Logger.debug(
                `[通用创意模式] 最终响应: status=${response.status}, content="${response.content}", modelType=${response.modelType}`,
                'ChatService',
              );
            }

            isResponseCompleted = true; // 标记正常完成
            res.write(`\n${JSON.stringify(response)}`);
            shouldFinalizeResponse = false;
            return res.end();

            /* 记录key的使用次数 和使用token */
          } else {
            let chatId = {
              chatId: assistantLogId,
            };

            res.write(`\n${JSON.stringify(chatId)}`);
            const isPptPlugin = usingPlugin?.parameters === 'ppt-generation';

            // 根据action参数设置工作流ID
            let workflowId = null;

            // 判断是否需要PPT生成
            const needsPptGeneration =
              isPptPlugin ||
              body.action === 'generate_ppt_from_theme' ||
              body.action === 'regenerate_outline' ||
              body.action === 'generate_ppt';

            if (needsPptGeneration) {
              // 所有PPT相关请求都使用智能聊天工作流
              workflowId = 'intelligent-chat';
              pluginParamOverride = 'ppt-generation';
            } else if (body.action) {
              // 其他有action的请求，根据具体action决定
            }

            // 使用新的Agent工作流引擎
            response = await this.agentService.agentChat(messagesHistory, {
              chatId: assistantLogId,
              messages: messagesHistory, // 传递消息用于token计算
              apiKey: modelKey,
              model: useModel,
              modelName: useModeName,
              temperature,
              proxyUrl: proxyResUrl,
              maxModelTokens, // 模型上下文窗口大小
              max_tokens, // 模型最大回复token数
              usingDeepThinking,
              deepThinkingType,
              additionalParams,
              usingTool,
              fileUrl,
              imageUrl,
              videoUrl,
              isFileUpload,
              isImageUpload,
              isSensitiveWordFilter: isSensitiveWordFilter === '1',
              isGeneratePromptReference: isGeneratePromptReference === '1',
              userId: chatUserId,
              authActor: { id: req.user.id, role: req.user.role },
              pluginParam: usingPlugin?.parameters || pluginParamOverride, // 传递插件参数
              workflowId: workflowId, // 指定工作流
              pptOutline: body.pptOutline, // 传递已确认的大纲
              pptMode: body.pptMode, // 传递PPT模式参数
              selectedTheme: body.selectedTheme, // 传递选中的主题
              action: body.action, // 传递action参数
              editorContent: editorContent, // 传递编辑器内容
              onProgress: chat => {
                // 更新当前已生成的数据，以便在用户中断时能保存
                if (chat.content) {
                  // 累加内容（流式传输是增量的）
                  if (chat.content[0]?.text) {
                    currentGeneratedData.content += chat.content[0].text;
                  }
                }

                if (chat.reasoning_content) {
                  // 深度思考内容通常是完整替换
                  currentGeneratedData.reasoning_content = chat.reasoning_content;
                }

                if (chat.agent_content) {
                  // agent数据是完整替换
                  currentGeneratedData.agent_content = chat.agent_content;
                }

                if (chat.totalTokens) {
                  currentGeneratedData.totalTokens = chat.totalTokens;
                }

                res.write(`\n${JSON.stringify(chat)}`);
              },
              onFailure: async data => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                  content: data.errMsg,
                  status: 4,
                });
              },
              onDatabase: async data => {
                // 统一保存工作流产生的各类数据
                const updateData: any = {};

                // 保存主要的聊天内容（由工作流统一处理后的最终结果）
                if (data.content) {
                  updateData.content = data.content;
                  // 同时更新currentGeneratedData
                  currentGeneratedData.content = data.content;
                }

                if (data.reasoning_content) {
                  updateData.reasoning_content = data.reasoning_content;
                  currentGeneratedData.reasoning_content = data.reasoning_content;
                }

                if (data.status) {
                  updateData.status = data.status;
                }

                // 保存token信息（由AgentService计算并传递）
                if (data.totalTokens) {
                  updateData.totalTokens = data.totalTokens;
                  currentGeneratedData.totalTokens = data.totalTokens;
                }

                // 保存Agent工作流状态（统一存储所有agent相关数据）
                if (data.agent_content) {
                  updateData.agent_content = data.agent_content;
                  currentGeneratedData.agent_content = data.agent_content;
                }

                // 保存插件参数（用于刷新后正确显示卡片）
                if (data.pluginParam) {
                  updateData.pluginParam = data.pluginParam;
                  currentGeneratedData.pluginParam = data.pluginParam;
                } else if (pluginParamOverride) {
                  updateData.pluginParam = pluginParamOverride;
                  currentGeneratedData.pluginParam = pluginParamOverride;
                } else if (usingPlugin?.parameters) {
                  updateData.pluginParam = usingPlugin.parameters;
                  currentGeneratedData.pluginParam = usingPlugin.parameters;
                }

                // 批量更新数据库
                if (Object.keys(updateData).length > 0) {
                  await this.chatLogService.updateChatLog(assistantLogId, updateData);
                }
              },
              abortController,
            });
            // }

            // Logger.debug(`JSON: ${JSON.stringify(response)}`, 'ChatService');

            // 区分不同的完成原因
            if (response.finishReason === 'error' && response.errMsg) {
              // 真正的错误，不扣费
              Logger.error(
                `用户ID: ${
                  chatUserId || '访客'
                } 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`,
                'ChatService',
              );
              isResponseCompleted = true; // 标记错误完成
              return res.write(`\n${JSON.stringify(response)}`);
            }

            // 对于中断(abort)或部分成功的情况，如果有生成内容则应该计费
            const hasContent =
              response.content || response.reasoning_content || response.totalTokens > 0;

            // 使用工作流返回的token信息，如果没有则重新计算
            let totalTokens = 0;

            if (response.totalTokens) {
              // 使用工作流计算的token
              totalTokens = response.totalTokens;
            } else {
              // 兼容性处理：重新计算token
              let totalText = '';
              messagesHistory.forEach(messagesHistory => {
                totalText += messagesHistory.content + ' ';
              });
              const inputTokens = await getTokenCount(totalText);
              const outputTokens = await getTokenCount(
                (response.reasoning_content || '') + (response.content || ''),
              );
              totalTokens = inputTokens + outputTokens;
            }

            // 更新用户消息的token信息
            await this.chatLogService.updateChatLog(userLogId, {
              totalTokens: totalTokens,
            });

            // 工作流引擎处理后的结果将在onDatabase回调中统一保存
            // 根据完成状态决定计费策略
            let shouldCharge = false;

            if (response.finishReason === 'abort') {
              // 中断：如果有生成内容，按实际使用全额计费
              if (hasContent && totalTokens > 0) {
                shouldCharge = true;
                Logger.log(`工作流被中断，但已生成内容，按实际使用量计费`, 'ChatService');
              }
            } else if (response.finishReason === 'success' || !response.finishReason) {
              // 成功完成：全额计费
              shouldCharge = true;
            }

            if (shouldCharge) {
              if (isTokenBased === true) {
                charge = deduct * Math.ceil(totalTokens / tokenFeeRatio);
              } else {
                charge = deduct;
              }

              await this.userBalanceService.deductFromBalance(
                chatUserId,
                deductType,
                charge,
                totalTokens,
                assistantLogId,
                modelType,
              );
              /* 记录key的使用次数 和使用token */
              await this.modelsService.saveUseLog(keyId, totalTokens);

              // 标记响应已完成（避免触发close事件的中断处理）
              if (response.finishReason !== 'abort') {
                isResponseCompleted = true;
              }

              Logger.log(
                `对话${response.finishReason === 'abort' ? '(中断)' : '完成'} - 用户: ${
                  chatUserId || '访客'
                }, 模型: ${useModeName}(${model}), Token: ${totalTokens}, 积分: ${charge}`,
                'ChatService',
              );
            } else {
              Logger.log(`工作流${response.finishReason}，无内容生成，不计费`, 'ChatService');
            }

            const userBalance = await this.userBalanceService.queryUserBalance(chatUserId);
            response.userBalance = userBalance;
            response.chatId = assistantLogId;
            response.content = '';
            response.reasoning_content = '';
            // 标记工作流完成（包括正常和中断）
            isResponseCompleted = true;
            res.write(`\n${JSON.stringify(response)}`);
            return;
          }
        } catch (error) {
          Logger.error(
            `对话处理失败: ${error?.message || error}`,
            error?.stack,
            'ChatService',
          );
          await this.chatLogService.updateChatLog(assistantLogId, {
            status: 5,
          });
          response = {
            error: '模型服务暂时不可用，请稍后重试或联系管理员检查模型配置',
            finishReason: 'error',
            status: 'error',
            chatId: assistantLogId,
          };
          // 发送错误响应并结束
          if (res && !res.writableEnded) {
            res.write(`\n${JSON.stringify(response)}`);
          }
          return;
        }
      }
    } catch (error) {
      if (res && !res.headersSent && !res.writableEnded) {
        res.write('\n发生未知错误，请稍后再试');
        res.end();
      }
    } finally {
      if (res && shouldFinalizeResponse && !res.writableEnded) {
        res.end();
      }
    }
  }

  async updateChatTitle(groupId, groupInfo, modelType, prompt, req) {
    if (groupInfo?.title === '新对话') {
      // '新对话' can be replaced with 'New chat' if needed
      let chatTitle: string;
      if (modelType === 1) {
        try {
          chatTitle = await this.openAIChatService.chatFree(
            `Based on the user's question {${prompt.substring(
              0,
              200,
            )}}, create a title for this conversation. No more than 10 characters, only return the title, no other content needed. Use the same language as the user's question.`,
          );
          if (chatTitle.length > 15) {
            chatTitle = chatTitle.slice(0, 15);
          }
        } catch (error) {
          chatTitle = prompt.slice(0, 10);
        }
      } else {
        chatTitle = '创意 AI';
      }

      this.chatGroupService
        .update(
          {
            groupId,
            title: chatTitle,
          },
          req,
        )
        .then(() => {})
        .catch(error => Logger.error(`更新对话标题失败`, error));
    }
  }

  async buildMessageFromParentMessageId(options: any, chatLogService) {
    let {
      systemMessage = '',
      maxRounds = 12,
      maxModelTokens = 64000,
      isFileUpload = 0,
      isImageUpload = 0,
      groupId,
      historyOwner,
      preloadedHistory,
      skipTokenCheck = false,
    } = options;

    const messages = [];

    let historyRecords: any[] = [];
    if (Array.isArray(preloadedHistory)) {
      historyRecords = preloadedHistory;
    } else if (groupId) {
      try {
        historyRecords = await chatLogService.chatHistory(groupId, maxRounds, historyOwner);
      } catch (error) {
        Logger.error(`获取聊天历史记录失败: ${error.message}`, 'ChatService');
        historyRecords = [];
      }
    }

    const sortedHistory = Array.isArray(historyRecords)
      ? [...historyRecords].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      : [];

    const userMessages = [];
    const assistantMessages = [];

    for (const record of sortedHistory) {
      try {
        let content = record.content || '';
        let hasSpecialFormat = false;

        const mediaUrls = [];
        const mediaContent = [];

        if (isFileUpload === 1 && record.fileUrl) {
          try {
            const filesInfo = JSON.parse(record.fileUrl);
            if (Array.isArray(filesInfo)) {
              const fileUrls = filesInfo.map(file => file.url);
              mediaUrls.push(...fileUrls);
            } else {
              mediaUrls.push(record.fileUrl);
            }
          } catch (error) {
            mediaUrls.push(record.fileUrl);
          }
        }

        if (record.imageUrl) {
          if (isImageUpload === 2) {
            hasSpecialFormat = true;
            // 处理 imageUrl 可能是 JSON 数组格式的情况
            let imageUrls: string[] = [];
            try {
              // 尝试解析为 JSON 数组
              const parsed = JSON.parse(record.imageUrl);
              if (Array.isArray(parsed)) {
                // 提取所有 url 字段
                imageUrls = parsed.filter(item => item && item.url).map(item => item.url);
              } else {
                // 不是数组,按逗号分隔处理
                imageUrls = record.imageUrl.split(',').map(url => url.trim());
              }
            } catch (e) {
              // 不是 JSON 格式,按逗号分隔处理
              imageUrls = record.imageUrl.split(',').map(url => url.trim());
            }

            const imageContent = await Promise.all(
              imageUrls.map(async url => ({
                type: 'image_url',
                image_url: {
                  url: url.trim(),
                },
              })),
            );
            mediaContent.push(...imageContent);
          } else if (isImageUpload === 1) {
            // 同样处理 JSON 数组格式
            try {
              const parsed = JSON.parse(record.imageUrl);
              if (Array.isArray(parsed)) {
                const urls = parsed.filter(item => item && item.url).map(item => item.url);
                mediaUrls.push(...urls);
              } else {
                mediaUrls.push(...record.imageUrl.split(',').map(url => url.trim()));
              }
            } catch (e) {
              mediaUrls.push(...record.imageUrl.split(',').map(url => url.trim()));
            }
          }
        }

        if (record.videoUrl) {
          if (isImageUpload === 2) {
            hasSpecialFormat = true;
            const videoContent = record.videoUrl.split(',').map(url => ({
              type: 'video_url',
              video_url: {
                url: url.trim(),
              },
            }));
            mediaContent.push(...videoContent);
          } else if (isImageUpload === 1) {
            const videoUrls = record.videoUrl.split(',').map(url => url.trim());
            mediaUrls.push(...videoUrls);
          }
        }

        if (isImageUpload === 2 && (hasSpecialFormat || mediaContent.length > 0)) {
          content = [{ type: 'text', text: content }, ...mediaContent];
        } else if (isImageUpload === 1 && mediaUrls.length > 0) {
          content = mediaUrls.join('\n') + '\n' + content;
        }

        if (record.role === 'assistant') {
          content = removeThinkTags(content);

          if (typeof content === 'string' && !content.trim()) {
            continue;
          }

          assistantMessages.push({
            id: record.id,
            role: 'assistant',
            content,
            createdAt: record.createdAt,
          });
        } else if (record.role === 'user') {
          userMessages.push({
            id: record.id,
            role: 'user',
            content,
            createdAt: record.createdAt,
          });
        }
      } catch (error) {
        Logger.debug(`历史消息处理失败: ${error?.message || error}`, 'ChatService');
      }
    }

    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    userMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    assistantMessages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const pairCount = Math.min(userMessages.length, assistantMessages.length);

    for (let i = 0; i < pairCount; i++) {
      messages.push({
        role: 'user',
        content: userMessages[i].content,
        createdAt: userMessages[i].createdAt,
      });
      messages.push({
        role: 'assistant',
        content: assistantMessages[i].content,
        createdAt: assistantMessages[i].createdAt,
      });
    }

    if (userMessages.length > pairCount) {
      const lastUser = userMessages[userMessages.length - 1];
      messages.push({
        role: 'user',
        content: lastUser.content,
        createdAt: lastUser.createdAt,
      });
    }

    if (!skipTokenCheck) {
      let totalTokens = await getTokenCount(messages);
      const tokenLimit = maxModelTokens < 8000 ? 4000 : maxModelTokens - 4000;

      if (totalTokens > tokenLimit) {
        let trimIteration = 0;
        while (totalTokens > tokenLimit && messages.length > 2) {
          trimIteration++;

          if (
            messages.length === 2 &&
            ((messages[0].role === 'system' && messages[1].role === 'user') ||
              (messages[0].role === 'user' && messages[1].role === 'user'))
          ) {
            break;
          }

          const systemIndex = messages.findIndex(m => m.role === 'system');
          const lastUserIndex = messages.length - 1;

          if (messages.length > 2) {
            const startIndex = systemIndex === 0 ? 1 : 0;

            if (startIndex < lastUserIndex) {
              if (
                messages[startIndex].role === 'user' &&
                startIndex + 1 < lastUserIndex &&
                messages[startIndex + 1].role === 'assistant'
              ) {
                messages.splice(startIndex, 2);
              } else {
                messages.splice(startIndex, 1);
              }
            }
          }

          const newTotalTokens = await getTokenCount(messages);
          if (newTotalTokens >= totalTokens) {
            break;
          }

          totalTokens = newTotalTokens;
        }
      }
    }

    if (messages.length > 1) {
      const fixedMessages = [];
      const workingMessages = [...messages];

      if (workingMessages[0]?.role === 'system') {
        fixedMessages.push(workingMessages.shift());
      }

      const orderedUserMessages = workingMessages
        .filter(msg => msg.role === 'user')
        .sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
        );

      const orderedAssistantMessages = workingMessages
        .filter(msg => msg.role === 'assistant')
        .sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
        );

      const orderedPairCount = Math.min(
        orderedUserMessages.length,
        orderedAssistantMessages.length,
      );

      for (let i = 0; i < orderedPairCount; i++) {
        fixedMessages.push(orderedUserMessages[i]);
        fixedMessages.push(orderedAssistantMessages[i]);
      }

      if (orderedUserMessages.length > orderedPairCount) {
        fixedMessages.push(orderedUserMessages[orderedUserMessages.length - 1]);
      }

      messages.length = 0;
      messages.push(...fixedMessages);
    }

    const messagesHistory = messages.map(message => {
      const { createdAt, ...rest } = message;
      return rest;
    });

    return {
      messagesHistory,
      round: messagesHistory.length,
      historyRecords,
    };
  }

  private normalizeGroupId(groupId: any) {
    if (!groupId) return undefined;
    const normalizedGroupId = Number(groupId);
    if (!Number.isInteger(normalizedGroupId) || normalizedGroupId <= 0) {
      throw new HttpException('非法对话ID！', HttpStatus.BAD_REQUEST);
    }
    return normalizedGroupId;
  }

  private getHistoryOwner(req: Request) {
    const { id, role } = req.user;
    return role === 'visitor' ? { visitorId: String(id) } : { userId: id };
  }

  async ttsProcess(body: { chatId: number; prompt: string }, req: Request, res?: Response) {
    const { chatId, prompt } = body;
    const owner = this.getHistoryOwner(req);

    // 在模型调用、上传和扣费之前验证记录归属，避免跨用户引用 chatId。
    await this.chatLogService.requireOwnedChatLog(chatId, owner);

    // 访客用户的userId应该设为null
    const chatUserId = req.user.role === 'visitor' ? null : req.user.id;

    const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
    const { openaiBaseUrl, openaiBaseKey, openaiVoice } = await this.globalConfigService.getConfigs(
      ['openaiBaseUrl', 'openaiBaseKey', 'openaiVoice'],
    );

    // 从 detailKeyInfo 对象中解构赋值并设置默认值
    const { key, proxyUrl, deduct, deductType } = detailKeyInfo;
    const useKey = key || openaiBaseKey;
    const useTimeout = 10 * 60 * 1000; // 统一使用10分钟超时

    // 用户余额检测
    await this.userBalanceService.validateBalance(req, deductType, deduct);

    try {
      // 使用OpenAI SDK进行TTS请求
      const formattedUrl = formatUrl(proxyUrl || openaiBaseUrl);
      const correctedProxyUrl = await correctApiBaseUrl(formattedUrl);
      const openai = new OpenAI({
        apiKey: useKey,
        baseURL: correctedProxyUrl,
        timeout: useTimeout,
      });

      // 获取音频数据
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        input: prompt,
        voice: openaiVoice || 'onyx',
      });

      // 将响应转换为buffer
      const buffer = Buffer.from(await response.arrayBuffer());

      // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;

      const ttsUrl = await this.uploadService.uploadFile(
        { buffer, mimetype: 'audio/mpeg' },
        `audio/openai/${currentDate}`,
      );

      // 更新聊天记录并扣除余额
      await Promise.all([
        this.chatLogService.updateOwnedChatLog(chatId, owner, { ttsUrl }),
        this.userBalanceService.deductFromBalance(chatUserId, deductType, deduct, 0, chatId, 5),
      ]);

      res.status(200).send({ ttsUrl });
    } catch (error) {
      Logger.error('TTS处理失败', error, 'TTSService');
      res.status(500).send({ error: '语音合成请求处理失败' });
    }
  }

  /* 系统AI对话 - 仅超级管理员可用 */
  async systemChat(body: { system?: string; messages: Array<{ role: string; content: string }>; model?: string; temperature?: number; max_tokens?: number; top_p?: number; frequency_penalty?: number; presence_penalty?: number }, req: Request) {
    try {
      const { system, messages } = body;

      // 访客不能使用系统对话
      if (req.user.role === 'visitor') {
        throw new HttpException('权限不足', HttpStatus.FORBIDDEN);
      }

      // 验证用户角色（SuperAuthGuard已验证，这里双重检查）
      const user = await this.userService.getUserById(req.user.id);
      if (user.role !== 'super') {
        throw new HttpException('权限不足', HttpStatus.FORBIDDEN);
      }

      // 获取全局配置
      const {
        openaiBaseUrl = '',
        openaiBaseKey = '',
        openaiBaseModel = 'gpt-4o-mini',
      } = await this.globalConfigService.getConfigs([
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
      ]);

      if (!openaiBaseKey) {
        throw new HttpException('系统未配置OpenAI API密钥', HttpStatus.SERVICE_UNAVAILABLE);
      }

      // 使用配置的baseUrl或默认值（等待异步函数）
      const baseURL = await correctApiBaseUrl(openaiBaseUrl || 'https://api.openai.com/v1');
      const useModel = openaiBaseModel;

      // 构建消息数组（OpenAI格式）
      const openaiMessages = [];

      // 如果有系统预设，添加到消息开头
      if (system) {
        openaiMessages.push({
          role: 'system',
          content: system,
        });
      }

      // 添加用户提供的消息
      openaiMessages.push(...messages);

      // 创建OpenAI客户端
      const openai = new OpenAI({
        apiKey: openaiBaseKey,
        baseURL,
      });

      // 非流式调用（简化参数）
      const completion = await openai.chat.completions.create({
        model: useModel,
        messages: openaiMessages,
        stream: false,
      });

      // 获取响应
      const responseMessage = completion.choices[0]?.message;

      if (!responseMessage) {
        throw new HttpException('AI响应为空', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 记录日志
      Logger.log(
        `系统AI对话成功 - 用户: ${user.username}, 模型: ${useModel}, Token使用: ${
          completion.usage?.total_tokens || 0
        }`,
      );

      // 返回OpenAI格式的响应
      return {
        id: completion.id,
        object: 'chat.completion',
        created: completion.created,
        model: completion.model,
        choices: [
          {
            index: 0,
            message: responseMessage,
            finish_reason: completion.choices[0]?.finish_reason || 'stop',
          },
        ],
        usage: completion.usage,
        // 额外信息
        system_info: {
          user: user.username,
          timestamp: new Date().toISOString(),
          model_used: useModel,
        },
      };
    } catch (error) {
      Logger.error('系统AI对话失败', error, 'ChatService.systemChat');

      if (error instanceof HttpException) {
        throw error;
      }

      // OpenAI错误处理
      if (error.response) {
        throw new HttpException(
          error.response.data?.error?.message || '调用AI服务失败',
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('系统AI对话处理失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
