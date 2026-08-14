import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PresetCategoryEntity } from './presetCategory.entity';
import { PresetEntity } from '../preset/preset.entity';

@Injectable()
export class PresetCategoryService {
  private readonly logger = new Logger(PresetCategoryService.name);

  constructor(
    @InjectRepository(PresetCategoryEntity)
    private readonly presetCategoryRepository: Repository<PresetCategoryEntity>,
    @InjectRepository(PresetEntity)
    private readonly presetRepository: Repository<PresetEntity>,
  ) {}

  // 查询所有分类
  async findAll(options?: { page?: number; size?: number; name?: string }) {
    try {
      this.logger.debug(`Finding preset categories with options: ${JSON.stringify(options)}`);

      const queryBuilder = this.presetCategoryRepository
        .createQueryBuilder('category')
        .orderBy('category.order', 'ASC')
        .addOrderBy('category.id', 'ASC');

      if (options?.name) {
        queryBuilder.where('category.name LIKE :name', { name: `%${options.name}%` });
      }

      // 如果提供了分页参数，返回分页结果
      if (options?.page && options?.size) {
        const skip = (options.page - 1) * options.size;

        // 获取分页数据
        const categories = await queryBuilder.skip(skip).take(options.size).getMany();

        // 获取总数
        const total = await queryBuilder.getCount();

        // 为每个分类添加预设数量
        const categoriesWithCount = await Promise.all(
          categories.map(async category => {
            const presetCount = await this.presetRepository.count({
              where: { categoryId: category.id },
            });
            return { ...category, presetCount };
          }),
        );

        this.logger.debug(`Found ${categoriesWithCount.length} categories out of ${total} total`);

        return {
          rows: categoriesWithCount,
          total,
          page: options.page,
          size: options.size,
        };
      }

      // 如果没有分页参数，返回所有结果
      const categories = await queryBuilder.getMany();

      // 为每个分类添加预设数量
      const categoriesWithCount = await Promise.all(
        categories.map(async category => {
          const presetCount = await this.presetRepository.count({
            where: { categoryId: category.id },
          });
          return { ...category, presetCount };
        }),
      );

      this.logger.debug(`Found ${categoriesWithCount.length} categories (no pagination)`);
      return categoriesWithCount;
    } catch (error) {
      this.logger.error(`Failed to find preset categories: ${error.message}`, error.stack);
      throw error;
    }
  }

  // 查询单个分类
  async findOne(id: number) {
    const category = await this.presetCategoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new HttpException('分类不存在', HttpStatus.NOT_FOUND);
    }

    return category;
  }

  // 创建分类
  async create(data: Partial<PresetCategoryEntity>) {
    const category = this.presetCategoryRepository.create(data);
    return await this.presetCategoryRepository.save(category);
  }

  // 更新分类
  async update(id: number, data: Partial<PresetCategoryEntity>) {
    const category = await this.findOne(id);
    Object.assign(category, data);
    return await this.presetCategoryRepository.save(category);
  }

  // 删除分类
  async remove(id: number) {
    const category = await this.findOne(id);

    // 检查是否有预设使用此分类
    const count = await this.presetCategoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.presets', 'preset')
      .where('category.id = :id', { id })
      .andWhere('preset.id IS NOT NULL')
      .getCount();

    if (count > 0) {
      throw new HttpException('该分类下还有预设，无法删除', HttpStatus.BAD_REQUEST);
    }

    return await this.presetCategoryRepository.remove(category);
  }

  // 批量更新排序
  async updateOrder(orders: { id: number; order: number }[]) {
    const promises = orders.map(item =>
      this.presetCategoryRepository.update(item.id, { order: item.order }),
    );
    await Promise.all(promises);
    return { success: true };
  }
}
