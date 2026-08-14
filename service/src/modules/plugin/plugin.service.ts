import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PluginEntity } from './plugin.entity';
import { ModelsEntity } from '../models/models.entity';

@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(PluginEntity)
    private readonly PluginEntity: Repository<PluginEntity>,
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>,
  ) {}

  // 获取插件列表
  // async pluginList(query: any) {
  //   const { page = 1, size = 100 } = query;
  //   // 查询所有插件
  //   const rows = await this.PluginEntity.find({
  //     order: { sortOrder: 'ASC', id: 'DESC' },
  //     skip: (page - 1) * size,
  //     take: size,
  //   });
  //   // console.log(rows);

  //   // 返回结果
  //   return { rows, count: rows.length };
  // }

  async pluginList(query: any) {
    const { page = 1, size = 100 } = query;
    // 用户端：只查询启用的插件
    const rows = await this.PluginEntity.find({
      where: { isEnabled: 1 },
      order: { sortOrder: 'ASC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    // 获取所有模型列表，用于提取 customOptions
    let allModels = [];
    try {
      allModels = await this.modelsEntity.find({
        select: ['model', 'customConfig', 'keyType'],
        where: { status: true },
      });
    } catch (error) {
      Logger.warn(`获取模型列表失败: ${error.message}`, 'PluginService');
    }

    // 构建模型查找映射
    const modelMap = new Map();
    allModels.forEach(model => {
      let customOptions = null;
      if (model.customConfig) {
        try {
          const config = JSON.parse(model.customConfig);
          customOptions = config.customOptions || null;
        } catch (error) {
          Logger.warn(
            `解析模型 ${model.model} 的 customConfig 失败: ${error.message}`,
            'PluginService',
          );
        }
      }

      modelMap.set(model.model, {
        customOptions,
        keyType: model.keyType,
      });
    });

    // 返回必要字段，并包含从模型配置中提取的 customOptions
    const result = rows.map(plugin => {
      const pluginData: any = {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        pluginImg: plugin.pluginImg,
        parameters: plugin.parameters,
        uploadTypes: plugin.uploadTypes,
      };

      // 如果插件有 parameters，尝试从对应模型中提取 customOptions
      if (plugin.parameters) {
        const modelInfo = modelMap.get(plugin.parameters);
        if (modelInfo && modelInfo.customOptions) {
          pluginData.customOptions = modelInfo.customOptions;
          pluginData.keyType = modelInfo.keyType;
        }
      }

      return pluginData;
    });

    return result;
  }

  // 管理端：查询所有插件
  async pluginListAll(query: any) {
    const { page = 1, size = 100 } = query;
    const rows = await this.PluginEntity.find({
      order: { sortOrder: 'ASC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });

    // 返回所有字段，包括时间戳
    return { rows, count: rows.length };
  }

  // 创建插件
  async createPlugin(body: { name: string; pluginImg?: string; description: string; isEnabled?: number; parameters?: string; sortOrder?: number; uploadTypes?: string }) {
    const { name, pluginImg, description, isEnabled, parameters, sortOrder, uploadTypes } = body;

    // 检查插件名称是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { name },
    });
    if (existingPlugin) {
      throw new HttpException('该插件名称已存在！', HttpStatus.BAD_REQUEST);
    }

    // 创建新的插件实体
    const newPlugin = this.PluginEntity.create({
      name,
      pluginImg,
      description,
      isEnabled: isEnabled !== undefined ? isEnabled : 1, // 默认启用
      parameters,
      sortOrder: sortOrder !== undefined ? sortOrder : 0, // 默认排序值
      uploadTypes: uploadTypes || null, // 添加 uploadTypes
    });

    // 保存新插件
    return await this.PluginEntity.save(newPlugin);
  }

  // 修改插件
  async updatePlugin(body: { id: number; name?: string; pluginImg?: string; description?: string; isEnabled?: number; parameters?: string; sortOrder?: number; uploadTypes?: string }) {
    const { id, name, pluginImg, description, isEnabled, parameters, sortOrder, uploadTypes } =
      body;

    // 检查插件ID是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { id },
    });
    if (!existingPlugin) {
      throw new HttpException('插件不存在！', HttpStatus.BAD_REQUEST);
    }

    // 只在传入 name 且与原值不同时才进行重名检查
    if (name !== undefined && name !== existingPlugin.name) {
      const duplicatePlugin = await this.PluginEntity.findOne({
        where: { name, id: Not(id) },
      });
      if (duplicatePlugin) {
        throw new HttpException('该插件名称已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    // 更新插件实体（只更新传入的字段）
    if (name !== undefined) existingPlugin.name = name;
    if (pluginImg !== undefined) existingPlugin.pluginImg = pluginImg;
    if (description !== undefined) existingPlugin.description = description;
    if (isEnabled !== undefined) existingPlugin.isEnabled = isEnabled;
    if (parameters !== undefined) existingPlugin.parameters = parameters;
    if (sortOrder !== undefined) existingPlugin.sortOrder = sortOrder;
    if (uploadTypes !== undefined) existingPlugin.uploadTypes = uploadTypes; // 添加 uploadTypes

    // 保存修改后的插件
    await this.PluginEntity.save(existingPlugin);

    return '修改插件信息成功';
  }

  // 删除插件
  async delPlugin(body: { id: number }) {
    const { id } = body;

    // 检查插件是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { id },
    });
    if (!existingPlugin) {
      throw new HttpException('该插件不存在！', HttpStatus.BAD_REQUEST);
    }

    // 删除插件
    const deleteResult = await this.PluginEntity.delete(id);

    // 检查是否成功删除插件
    if (deleteResult.affected > 0) {
      return '删除插件成功';
    } else {
      throw new HttpException('删除插件失败！', HttpStatus.BAD_REQUEST);
    }
  }
}
