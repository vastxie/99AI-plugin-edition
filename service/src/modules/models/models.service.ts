import { ModelsMapCn } from '@/common/constants/status.constant';
import { correctApiBaseUrl } from '@/common/utils';
import { forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import OpenAI from 'openai';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { FormatCustomConfigDto } from './dto/formatCustomConfig.dto';
import { QueryModelDto } from './dto/queryModel.dto';
import { SetModelDto } from './dto/setModel.dto';
import { ModelsEntity } from './models.entity';
// import { ModelsTypeEntity } from './modelType.entity';
import { QueryModelTypeDto } from './dto/queryModelType.dto';
import { SetModelTypeDto } from './dto/setModelType.dto';

@Injectable()
export class ModelsService {
  constructor(
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>,
    private readonly redisCacheService: RedisCacheService,
    @Inject(forwardRef(() => GlobalConfigService))
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  async onModuleInit() {
    // 初始化时重建缓存，确保缓存数据最新
    const success = await this.updateModelsCache();
    if (!success) {
      Logger.warn('模型缓存初始化失败，将在首次访问时重试', 'ModelsService');
    }
  }

  /* 更新模型缓存到Redis（永久缓存） */
  async updateModelsCache() {
    const cacheKey = 'models:list:all';

    try {
      // 从数据库获取所有模型配置，只获取文本模型（keyType=1）
      const allModels = await this.modelsEntity.find({
        where: { status: true, keyType: 1 },
        order: { modelOrder: 'ASC' },
      });

      // 构建模型列表数组
      const modelList = allModels.reduce((acc: any, model) => {
        // 解析 customConfig 以提取 customOptions
        let customOptions = null;
        if (model.customConfig) {
          try {
            const config = JSON.parse(model.customConfig);
            customOptions = config.customOptions || null;
          } catch (error) {
            Logger.warn(
              `解析模型 ${model.modelName} 的 customConfig 失败: ${error.message}`,
              'ModelsService',
            );
          }
        }

        // 不包含key、proxyUrl、useCount、useToken等敏感信息
        acc.push({
          modelName: model.modelName,
          keyType: model.keyType,
          model: model.model,
          deduct: model.deduct,
          deductType: model.deductType,
          maxRounds: model.maxRounds,
          modelAvatar: model.modelAvatar,
          isFileUpload: model.isFileUpload,
          isImageUpload: model.isImageUpload,
          modelDescription: model.modelDescription,
          deepThinkingType: model.deepThinkingType,
          isToolSupported: model.isToolSupported,
          maxModelTokens: model.maxModelTokens,
          max_tokens: model.max_tokens,
          isTokenBased: model.isTokenBased,
          tokenFeeRatio: model.tokenFeeRatio,
          modelLimits: model.modelLimits,
          systemPrompt: model.systemPrompt,
          systemPromptType: model.systemPromptType,
          additionalParams: model.additionalParams,
          customOptions: customOptions,
        });
        return acc;
      }, []);

      // 去重处理
      const uniqueModelList = Array.from(
        modelList.reduce((map, obj) => map.set(obj.modelName, obj), new Map()).values(),
      );

      // 永久缓存，不设置过期时间
      await this.redisCacheService.set({ key: cacheKey, val: JSON.stringify(uniqueModelList) });
      return true;
    } catch (error) {
      Logger.error(`更新模型缓存失败: ${error.message}`, error.stack, 'ModelsService');
      return false;
    }
  }

  async getCurrentModelKeyInfo(model: string) {
    // 使用findOne查询特定模型的key信息
    const modelKeyInfo = await this.modelsEntity.findOne({
      where: { model: model },
    });

    // 检查是否找到了模型的key信息
    if (!modelKeyInfo) {
      // const openaiBaseModel = await this.globalConfigService.getConfigs([
      //   'openaiBaseModel',
      // ]);
      // modelKeyInfo = await this.modelsEntity.findOne({
      //   where: { model: openaiBaseModel },
      // });
      // throw new HttpException(
      //   '当前调用模型的key未找到，请重新选择模型！',
      //   HttpStatus.BAD_REQUEST
      // );
      // Logger.debug('当前调用模型的key未找到，请重新选择模型！');
      return null;
    }

    // 假设modelKeyInfo对象有一个属性key存储模型的key
    return modelKeyInfo;
  }

  /* 根据模型名称查找模型信息 */
  async findOneByModel(model: string): Promise<ModelsEntity | null> {
    return this.getCurrentModelKeyInfo(model);
  }

  async getSpecialModelKeyInfo(modelPrefix) {
    // 使用Like操作符进行模糊查询
    const matchingModels = await this.modelsEntity.find({
      where: { model: Like(`${modelPrefix}%`) },
    });

    if (matchingModels.length === 0) {
      throw new HttpException('未找到匹配的模型，请重新选择模型！', HttpStatus.BAD_REQUEST);
    }

    // 选择第一个匹配的模型
    const firstMatchModel = matchingModels[0];

    // 去除model名称中的前缀
    // 假设这里的modelPrefix正是你想从模型名称中去除的前缀部分
    const modifiedModelName = firstMatchModel.model.replace(modelPrefix, '');

    // 如果你需要在返回的对象中保留原始的model名称，可以复制对象并修改
    // 如果直接修改firstMatchModel对象也是可行的，这取决于你的具体需求
    const modifiedModel = {
      ...firstMatchModel,
      model: modifiedModelName,
    };

    // 直接返回修改后的模型信息
    return modifiedModel;
  }

  /* 通过现有配置的key和分类给到默认的配置信息 默认给到第一个分类的第一个key的配置 */
  async getBaseConfig(): Promise<any> {
    // 查找modelOrder最小的启用模型
    const minOrderModel = await this.modelsEntity.findOne({
      where: { status: true },
      order: { modelOrder: 'ASC' },
    });

    if (!minOrderModel) {
      // 如果没有启用的模型，尝试找任意一个模型
      const anyModel = await this.modelsEntity.findOne({
        where: { keyType: 1 },
      });

      if (!anyModel) return;

      return this.formatModelInfo(anyModel);
    }

    return this.formatModelInfo(minOrderModel);
  }

  private formatModelInfo(model: ModelsEntity) {
    const {
      keyType,
      modelName,
      model: modelKey,
      deductType,
      deduct,
      isFileUpload,
      isImageUpload,
      modelAvatar,
      modelDescription,
      deepThinkingType,
      systemPrompt,
      systemPromptType,
      additionalParams,
    } = model;

    return {
      modelInfo: {
        keyType,
        modelName,
        model: modelKey,
        deductType,
        deduct,
        isFileUpload,
        isImageUpload,
        modelAvatar,
        modelDescription,
        deepThinkingType,
        systemPrompt,
        systemPromptType,
        additionalParams,
      },
    };
  }

  async setModel(params: SetModelDto) {
    const startTime = Date.now();
    const isUpdate = !!params.id;

    Logger.log(
      `开始${isUpdate ? '更新' : '创建'}模型 - 名称: ${params.modelName}, ` +
        `类型: ${params.keyType}, ID: ${params.id || 'new'}`,
      'ModelsService.setModel',
    );

    try {
      const { id } = params;
      if (id) {
        // 更新操作 - 处理key字段的类型问题
        const updateData: any = { ...params };
        // 如果key是数组（批量情况），不传递给update
        if (Array.isArray(updateData.key)) {
          delete updateData.key;
        }
        // 管理端只会拿到密钥占位符；原样提交表示保留已有密钥。
        if (updateData.key === '**********') {
          delete updateData.key;
        }
        // 移除DTO中存在但Entity中不存在的字段
        delete updateData.drawingType;

        const res = await this.modelsEntity.update({ id }, updateData);
        await this.updateModelsCache();

        const duration = Date.now() - startTime;
        if (res.affected > 0) {
          Logger.log(
            `模型更新成功 - ID: ${id}, 名称: ${params.modelName}, 耗时: ${duration}ms`,
            'ModelsService.setModel',
          );
        } else {
          Logger.warn(
            `模型更新无影响 - ID: ${id}, 名称: ${params.modelName}`,
            'ModelsService.setModel',
          );
        }
        return res.affected > 0;
      } else {
        // 创建新模型，统一处理逻辑
        const createData: any = { ...params };
        // 移除DTO中存在但Entity中不存在的字段
        delete createData.drawingType;
        const res = await this.modelsEntity.save(createData);
        await this.updateModelsCache();

        const duration = Date.now() - startTime;
        Logger.log(
          `模型创建成功 - ID: ${(res as any).id}, 名称: ${params.modelName}, 耗时: ${duration}ms`,
          'ModelsService.setModel',
        );
        return res;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(
        `模型${isUpdate ? '更新' : '创建'}失败 - 名称: ${params.modelName}, ` +
          `错误: ${error.message}, 耗时: ${duration}ms`,
        error.stack,
        'ModelsService.setModel',
      );
      throw error;
    }
  }

  async delModel({ id }) {
    if (!id) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    const m = await this.modelsEntity.findOne({ where: { id } });
    if (!m) {
      throw new HttpException('当前账号不存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.modelsEntity.delete({ id });
    await this.updateModelsCache();
    return res;
  }

  async queryModels(req, params: QueryModelDto) {
    const { keyType, key, status, model, page = 1, size = 10 } = params;
    const where: any = {};
    keyType && (where.keyType = keyType);
    model && (where.model = model);
    status && (where.status = Number(status) === 1 ? true : false);
    key && (where.key = Like(`%${key}%`));
    const [rows, count] = await this.modelsEntity.findAndCount({
      where: where,
      order: {
        modelOrder: 'ASC',
      },
      skip: (page - 1) * size,
      take: size,
    });
    // 即使是超级管理员，也不把模型密钥原文返回浏览器。
    rows.forEach(item => {
      item.key && (item.key = '**********');
    });

    return { rows, count };
  }

  /* 客户端查询到的所有的配置的模型类别 以及类别下自定义的多少中文模型名称 */
  /* 辅助方法：强制清除缓存（仅在必要时使用） */
  async clearModelsCache() {
    try {
      await this.redisCacheService.del({ key: 'models:list:all' });
    } catch (error) {
      Logger.warn(`清除模型缓存失败: ${error.message}`, 'ModelsService');
    }
  }

  async modelsList() {
    const cacheKey = 'models:list:all';

    try {
      // 尝试从缓存获取
      const cachedResult = await this.redisCacheService.get({ key: cacheKey });
      if (cachedResult) {
        const parsed = JSON.parse(cachedResult);
        // 检查缓存格式：如果是旧格式（有 modelMaps 字段），清除缓存并重新生成
        if (parsed && typeof parsed === 'object' && 'modelMaps' in parsed) {
          await this.clearModelsCache();
        } else if (Array.isArray(parsed)) {
          // 新格式：直接返回数组
          return parsed;
        }
      }
    } catch (cacheError) {
      Logger.warn(
        `Redis缓存获取失败，从数据库查询: ${cacheError.message}`,
        'ModelsService-modelsList',
      );
    }

    // 缓存未命中或格式不匹配，从数据库查询并更新缓存
    const updateSuccess = await this.updateModelsCache();

    // 如果更新成功，重新尝试从缓存获取
    if (updateSuccess) {
      try {
        const cachedResult = await this.redisCacheService.get({ key: cacheKey });
        if (cachedResult) {
          return JSON.parse(cachedResult);
        }
      } catch (error) {
        Logger.error(`获取模型列表失败: ${error.message}`, error.stack, 'ModelsService');
      }
    }

    // 如果还是失败，直接从数据库返回（只返回 keyType=1 的模型）
    const allModels = await this.modelsEntity.find({
      where: { status: true, keyType: 1 },
      order: { modelOrder: 'ASC' },
    });

    const modelList = allModels.reduce((acc: any, model) => {
      // 解析 customConfig 以提取 customOptions
      let customOptions = null;
      if (model.customConfig) {
        try {
          const config = JSON.parse(model.customConfig);
          customOptions = config.customOptions || null;
        } catch (error) {
          Logger.warn(
            `解析模型 ${model.modelName} 的 customConfig 失败: ${error.message}`,
            'ModelsService',
          );
        }
      }

      acc.push({
        modelName: model.modelName,
        keyType: model.keyType,
        model: model.model,
        deduct: model.deduct,
        deductType: model.deductType,
        maxRounds: model.maxRounds,
        modelAvatar: model.modelAvatar,
        isFileUpload: model.isFileUpload,
        isImageUpload: model.isImageUpload,
        modelDescription: model.modelDescription,
        deepThinkingType: model.deepThinkingType,
        isToolSupported: model.isToolSupported,
        maxModelTokens: model.maxModelTokens,
        max_tokens: model.max_tokens,
        isTokenBased: model.isTokenBased,
        tokenFeeRatio: model.tokenFeeRatio,
        modelLimits: model.modelLimits,
        systemPrompt: model.systemPrompt,
        systemPromptType: model.systemPromptType,
        additionalParams: model.additionalParams,
        customOptions: customOptions,
      });
      return acc;
    }, []);

    // 去重处理
    const uniqueModelList = Array.from(
      modelList.reduce((map, obj) => map.set(obj.modelName, obj), new Map()).values(),
    );

    // 尝试异步更新Redis缓存，但不阻塞返回
    this.updateModelsCache().catch(err => {
      Logger.warn(`后台异步缓存更新失败: ${err.message}`, 'ModelsService');
    });

    return uniqueModelList;
  }

  /* 记录使用次数和使用的token数量 */
  async saveUseLog(id, useToken) {
    await this.modelsEntity
      .createQueryBuilder()
      .update(ModelsEntity)
      .set({
        useCount: () => 'useCount + 1',
        useToken: () => `useToken + ${useToken}`,
      })
      .where('id = :id', { id })
      .execute();
  }

  /* 获取所有key */
  async getAllKey() {
    return await this.modelsEntity.find();
  }

  /* 查询模型类型 */
  async queryModelType(params: QueryModelTypeDto) {
    return 1;
  }

  /* 创建修改模型类型 */
  async setModelType(params: SetModelTypeDto) {
    return 1;
  }

  /* 删除模型类型 */
  async delModelType(params) {
    return 1;
  }

  /* 查询所有图片生成模型（keyType=6 通用创意） */
  async getDrawingModels() {
    try {
      const drawingModels = await this.modelsEntity.find({
        where: { keyType: 6 },
        select: ['modelName', 'model'],
        order: { modelOrder: 'ASC' },
      });

      return drawingModels.map(item => ({
        label: item.modelName,
        value: item.model,
      }));
    } catch (error) {
      Logger.error(`查询图片生成模型失败: ${error.message}`, error.stack, 'ModelsService');
      return [];
    }
  }

  /* 通过模型名称查询模型详细属性（默认启用自动回退到首选模型） */
  async getModelDetailByName(model: string, fallbackToDefault: boolean = true) {
    if (!model) {
      throw new HttpException('模型名称不能为空', HttpStatus.BAD_REQUEST);
    }

    try {
      // 先尝试精确匹配
      let modelDetail = await this.modelsEntity.findOne({
        where: { model: model, status: true }, // 只查询启用的模型
      });

      // 如果没找到，尝试模糊匹配
      if (!modelDetail) {
        const models = await this.modelsEntity.find({
          where: { model: Like(`%${model}%`), status: true },
        });

        if (models.length > 0) {
          modelDetail = models[0]; // 取第一个匹配结果
        }
      }

      // 如果还是没找到，且允许回退到默认模型（默认启用）
      if (!modelDetail && fallbackToDefault) {
        Logger.warn(`模型 ${model} 未找到或已被禁用，自动切换到首选模型`, 'ModelsService');
        // 获取首选模型（modelOrder 最小的启用模型）
        const defaultModel = await this.modelsEntity.findOne({
          where: { status: true },
          order: { modelOrder: 'ASC' },
        });

        if (defaultModel) {
          Logger.log(
            `已自动切换到首选模型: ${defaultModel.modelName} (${defaultModel.model})`,
            'ModelsService',
          );
          modelDetail = defaultModel;
        }
      }

      if (!modelDetail) {
        throw new HttpException('未找到指定模型', HttpStatus.NOT_FOUND);
      }

      // 返回模型详细信息
      return {
        id: modelDetail.id,
        modelName: modelDetail.modelName,
        model: modelDetail.model,
        keyType: modelDetail.keyType,
        deduct: modelDetail.deduct,
        deductType: modelDetail.deductType,
        maxRounds: modelDetail.maxRounds,
        modelAvatar: modelDetail.modelAvatar,
        isFileUpload: modelDetail.isFileUpload,
        isImageUpload: modelDetail.isImageUpload,
        modelDescription: modelDetail.modelDescription,
        isToolSupported: modelDetail.isToolSupported,
        deepThinkingType: modelDetail.deepThinkingType,
        modelOrder: modelDetail.modelOrder,
        systemPrompt: modelDetail.systemPrompt,
        systemPromptType: modelDetail.systemPromptType,
        additionalParams: modelDetail.additionalParams,
        status: modelDetail.status,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(`获取模型详情失败: ${error.message}`, 'ModelsService');
      throw new HttpException('获取模型详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * AI智能格式化自定义配置
   */
  async formatCustomConfig(params: FormatCustomConfigDto): Promise<any> {
    try {
      const { description } = params;

      // 获取工具调用配置
      const {
        toolCallUrl,
        toolCallKey,
        toolCallModel,
        openaiBaseKey,
        openaiBaseUrl,
        openaiBaseModel,
      } = await this.globalConfigService.getConfigs([
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
      ]);

      // 创建 OpenAI 客户端
      const openai = new OpenAI({
        apiKey: toolCallKey || openaiBaseKey,
        baseURL: await correctApiBaseUrl(toolCallUrl || openaiBaseUrl),
        timeout: 60000,
      });

      const model = toolCallModel || openaiBaseModel;

      // 系统提示词
      const systemPrompt = `你是一个专业的 API 配置助手，负责将用户提供的杂乱参数转换为标准的工具配置 JSON 格式。

**配置格式说明：**

\`\`\`json
{
  "type": "video",
  "tools": {
    "text2video": {
      "name": "文本生成视频",
      "description": "根据文本描述生成视频",
      "enabled": true,
      "endpoint": "/v1/videos/generations",
      "method": "POST",
      "requestParams": [
        {
          "name": "prompt",
          "type": "string",
          "description": "视频描述文本",
          "required": true,
          "source": "prompt"
        },
        {
          "name": "model",
          "type": "string",
          "description": "模型名称",
          "required": true,
          "source": "model"
        },
        {
          "name": "duration",
          "type": "number",
          "description": "视频时长（秒）",
          "required": false,
          "source": "fcParam",
          "default": 5
        }
      ],
      "responsePaths": {
        "id": "task_id"
      }
    },
    "image2video": {
      "name": "图片生成视频",
      "description": "基于图片生成动态视频",
      "enabled": true,
      "endpoint": "/v1/videos/generations",
      "method": "POST",
      "requestParams": [
        {
          "name": "images",
          "type": "array",
          "description": "图片URL数组",
          "required": true,
          "source": "imageUrl"
        }
      ],
      "responsePaths": {
        "id": "task_id"
      }
    },
    "video2video": {
      "name": "拓展视频",
      "description": "基于已有视频进行拓展生成",
      "enabled": false,
      "endpoint": "/v1/videos/{id}/extend",
      "method": "POST",
      "requestParams": [
        {
          "name": "task_id",
          "type": "string",
          "description": "要拓展的视频任务ID",
          "required": true,
          "source": "fcParam",
          "urlPlaceholder": "id"
        },
        {
          "name": "prompt",
          "type": "string",
          "description": "拓展描述",
          "required": false,
          "source": "prompt"
        }
      ],
      "responsePaths": {
        "id": "task_id"
      }
    },
    "query": {
      "name": "查询任务",
      "description": "查询任务状态和结果",
      "enabled": true,
      "endpoint": "/v1/videos/generations/{id}",
      "method": "GET",
      "responsePaths": {
        "id": "task_id",
        "status": "status",
        "url": "data.output",
        "failReason": "fail_reason",
        "progress": "progress"
      },
      "statusMapping": {
        "submitted": ["SUBMITTED", "QUEUED"],
        "processing": ["IN_PROGRESS", "PROCESSING"],
        "success": ["SUCCESS", "COMPLETED"],
        "failed": ["FAILURE", "FAILED", "ERROR"]
      }
    }
  }
}
\`\`\`

**参数来源（source）说明：**
- "prompt": 用户输入的文本
- "model": 选择的模型名称
- "imageUrl": 上传的图片URL
- "videoUrl": 上传的视频URL
- "fcParam": 从 Function Calling 优化后获取
- "custom": 自定义固定值（需提供 default）

**URL 占位符说明：**
- endpoint 中可以使用 {id} 占位符（如 /v1/videos/{id}/extend）
- 如果参数需要填充到 URL 中，添加 urlPlaceholder 字段指定占位符名称
- 系统会自动将参数值替换到 URL，并从请求体中移除

**responsePaths 默认字段说明：**
- id: 任务ID的 JSON 路径（提交工具必须返回，如 "task_id"）
- status: 任务状态的 JSON 路径（query 工具必须，如 "status"）
- url: 视频URL的 JSON 路径（query 工具必须，如 "data.output"）
- progress: 进度的 JSON 路径（query 工具必须，如 "progress"）
- failReason: 失败原因的 JSON 路径（query 工具必须，如 "fail_reason"）

注意：responsePaths 中的键名（id/status/url等）是系统固定的，值是实际 API 响应的 JSON 路径

**重要规则：**
1. type 字段必填，从用户描述判断（video/image/music）
2. tools 必须包含 query 工具用于查询任务状态
3. 根据用户描述判断需要哪些工具（text2video/image2video/video2video）
4. endpoint 必须是完整路径，支持 {id} 占位符
5. requestParams 中每个参数必须指定 source 来源
6. responsePaths 中 query 工具必须包含：id/status/url/progress/failReason
7. 只输出 JSON，不要有任何额外说明
8. 如果用户未提供某些字段，使用合理的默认值`;

      const userPrompt = `请将以下描述转换为标准配置 JSON：

${description}`;

      // 调用 AI 生成配置
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || '';

      // 提取 JSON
      let jsonConfig;
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);

      if (jsonMatch) {
        jsonConfig = JSON.parse(jsonMatch[1].trim());
      } else {
        // 尝试直接解析
        jsonConfig = JSON.parse(content.trim());
      }

      // 验证必填字段
      if (!jsonConfig.type) {
        throw new Error('配置缺少 type 字段');
      }

      if (!jsonConfig.tools || typeof jsonConfig.tools !== 'object') {
        throw new Error('配置缺少必要的 tools 字段');
      }

      if (!jsonConfig.tools.query || !jsonConfig.tools.query.endpoint) {
        throw new Error('配置必须包含 query 工具及其 endpoint');
      }

      Logger.log(`AI 格式化成功，类型: ${jsonConfig.type}`, 'ModelsService');

      return {
        config: JSON.stringify(jsonConfig, null, 2),
        type: jsonConfig.type,
      };
    } catch (error) {
      Logger.error(`AI 格式化失败: ${error.message}`, error.stack, 'ModelsService');
      throw new HttpException(`AI 格式化失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
