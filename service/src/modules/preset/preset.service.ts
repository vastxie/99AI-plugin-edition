import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { AppEntity } from '../app/app.entity';
import { PluginEntity } from '../plugin/plugin.entity';
import { PresetCategoryEntity } from '../presetCategory/presetCategory.entity';
import { PresetEntity } from './preset.entity';

@Injectable()
export class PresetService {
  constructor(
    @InjectRepository(PresetEntity)
    private readonly presetRepository: Repository<PresetEntity>,
    @InjectRepository(AppEntity)
    private readonly appRepository: Repository<AppEntity>,
    @InjectRepository(PluginEntity)
    private readonly pluginRepository: Repository<PluginEntity>,
    @InjectRepository(PresetCategoryEntity)
    private readonly presetCategoryRepository: Repository<PresetCategoryEntity>,
  ) {}

  // 查询预设列表
  async findAll(options?: {
    categoryId?: number;
    isEnabled?: boolean;
    keyword?: string;
    page?: number;
    size?: number;
  }) {
    const queryBuilder = this.presetRepository
      .createQueryBuilder('preset')
      .leftJoinAndSelect('preset.category', 'category')
      .orderBy('preset.order', 'ASC')
      .addOrderBy('preset.id', 'ASC');

    if (options?.categoryId) {
      queryBuilder.andWhere('preset.categoryId = :categoryId', {
        categoryId: options.categoryId,
      });
    }

    if (options?.isEnabled !== undefined) {
      queryBuilder.andWhere('preset.isEnabled = :isEnabled', {
        isEnabled: options.isEnabled,
      });
    }

    if (options?.keyword) {
      queryBuilder.andWhere('(preset.title LIKE :keyword OR preset.description LIKE :keyword)', {
        keyword: `%${options.keyword}%`,
      });
    }

    // Add pagination
    const page = options?.page || 1;
    const size = options?.size || 10;
    const skip = (page - 1) * size;

    queryBuilder.skip(skip).take(size);

    const [rows, total] = await queryBuilder.getManyAndCount();

    return {
      rows,
      total,
      page,
      size,
    };
  }

  // 查询单个预设
  async findOne(id: number) {
    const preset = await this.presetRepository.findOne({
      where: { id },
      relations: ['category'],
    });

    if (!preset) {
      throw new HttpException('预设不存在', HttpStatus.NOT_FOUND);
    }

    return preset;
  }

  // 创建预设
  async create(data: Partial<PresetEntity>) {
    // 验证分类存在
    if (data.categoryId) {
      const categoryExists = await this.presetCategoryRepository.findOne({
        where: { id: data.categoryId },
      });

      if (!categoryExists) {
        throw new HttpException('分类不存在', HttpStatus.BAD_REQUEST);
      }
    }

    const preset = this.presetRepository.create(data);
    return await this.presetRepository.save(preset);
  }

  // 更新预设
  async update(id: number, data: Partial<PresetEntity>) {
    // 验证分类存在（如果提供了categoryId）
    if (data.categoryId) {
      const categoryExists = await this.presetCategoryRepository.findOne({
        where: { id: data.categoryId },
      });

      if (!categoryExists) {
        throw new HttpException('分类不存在', HttpStatus.BAD_REQUEST);
      }
    }

    // 直接更新，不加载关联数据
    await this.presetRepository.update(id, data);

    // 重新查询并返回更新后的数据
    return await this.findOne(id);
  }

  // 删除预设
  async remove(id: number) {
    const preset = await this.findOne(id);
    return await this.presetRepository.remove(preset);
  }

  // 批量更新排序
  async updateOrder(orders: { id: number; order: number }[]) {
    const promises = orders.map(item =>
      this.presetRepository.update(item.id, { order: item.order }),
    );
    await Promise.all(promises);
    return { success: true };
  }

  // 增加使用次数
  async incrementUsage(id: number) {
    await this.presetRepository.increment({ id }, 'usageCount', 1);
    return { success: true };
  }

  // 搜索应用（用于预设配置时选择）
  async searchApps(keyword?: string) {
    const queryOptions: any = {
      select: ['id', 'name', 'des', 'coverImg', 'status'],
      where: { status: 1 }, // 只返回启用的应用
      take: keyword ? 20 : 50,
      order: { order: 'DESC', id: 'DESC' },
    };

    if (keyword) {
      queryOptions.where = [
        { name: Like(`%${keyword}%`), status: 1 },
        { des: Like(`%${keyword}%`), status: 1 },
      ];
    }

    const apps = await this.appRepository.find(queryOptions);
    return apps;
  }

  // 搜索插件（用于预设配置时选择）
  async searchPlugins(keyword?: string) {
    const queryOptions: any = {
      select: ['id', 'name', 'description', 'parameters', 'pluginImg', 'isEnabled'],
      where: { isEnabled: 1 }, // 只返回启用的插件 (1=启用, 0=禁用)
      take: keyword ? 20 : 50,
      order: { sortOrder: 'DESC', id: 'DESC' },
    };

    if (keyword) {
      queryOptions.where = [
        { name: Like(`%${keyword}%`), isEnabled: 1 },
        { description: Like(`%${keyword}%`), isEnabled: 1 },
      ];
    }

    const plugins = await this.pluginRepository.find(queryOptions);
    return plugins;
  }

  // 统一搜索应用和插件
  async searchAppAndPlugin(keyword?: string, type?: string) {
    const result = {
      apps: [],
      plugins: [],
      combined: [],
    };

    // 如果指定了类型，只搜索特定类型
    if (type === 'app') {
      result.apps = await this.searchApps(keyword);
      result.combined = result.apps.map(app => ({
        ...app,
        type: 'app',
        displayName: app.name,
        displayDesc: app.des,
      }));
    } else if (type === 'plugin') {
      result.plugins = await this.searchPlugins(keyword);
      result.combined = result.plugins.map(plugin => ({
        ...plugin,
        type: 'plugin',
        displayName: plugin.name,
        displayDesc: plugin.description,
      }));
    } else {
      // 同时搜索应用和插件
      const [apps, plugins] = await Promise.all([
        this.searchApps(keyword),
        this.searchPlugins(keyword),
      ]);

      result.apps = apps;
      result.plugins = plugins;

      // 合并结果，应用在前，插件在后
      result.combined = [
        ...apps.map(app => ({
          ...app,
          type: 'app',
          displayName: app.name,
          displayDesc: app.des,
        })),
        ...plugins.map(plugin => ({
          ...plugin,
          type: 'plugin',
          displayName: plugin.name,
          displayDesc: plugin.description,
        })),
      ];

      // 如果有关键词，按相关度排序
      if (keyword) {
        result.combined.sort((a, b) => {
          const aNameMatch = a.displayName.toLowerCase().includes(keyword.toLowerCase());
          const bNameMatch = b.displayName.toLowerCase().includes(keyword.toLowerCase());

          if (aNameMatch && !bNameMatch) return -1;
          if (!aNameMatch && bNameMatch) return 1;
          return 0;
        });
      }
    }

    return result;
  }

  // 获取用户可见的预设
  async getUserPresets() {
    try {
      const presets = await this.presetRepository
        .createQueryBuilder('preset')
        .leftJoinAndSelect('preset.category', 'category')
        .where('preset.isEnabled = :isEnabled', { isEnabled: true })
        .andWhere('(preset.categoryId IS NULL OR category.isEnabled = :categoryEnabled)', {
          categoryEnabled: true,
        })
        .orderBy('COALESCE(category.order, 999)', 'ASC')
        .addOrderBy('preset.order', 'ASC')
        .getMany();

      // 按分类整理
      const categoriesMap = new Map();

      presets.forEach(preset => {
        if (preset.category) {
          const categoryId = preset.category.id;
          if (!categoriesMap.has(categoryId)) {
            categoriesMap.set(categoryId, {
              id: categoryId,
              name: preset.category.name,
              presets: [],
            });
          }

          categoriesMap.get(categoryId).presets.push({
            id: preset.id,
            title: preset.title,
            description: preset.description,
            prompt: preset.prompt,
            icon: preset.icon,
            iconColor: preset.iconColor,
            appId: preset.appId,
            pluginParameters: preset.pluginParameters,
            category: preset.category.name,
          });
        }
      });

      return {
        categories: Array.from(categoriesMap.values()),
        presets: presets.map(preset => ({
          id: preset.id,
          title: preset.title,
          description: preset.description,
          prompt: preset.prompt,
          icon: preset.icon,
          iconColor: preset.iconColor,
          appId: preset.appId,
          pluginParameters: preset.pluginParameters,
          category: preset.category ? preset.category.name : null,
        })),
      };
    } catch (error) {
      Logger.error(`获取用户预设失败: ${error.message || error}`, error?.stack, 'PresetService');
      throw error;
    }
  }
}
