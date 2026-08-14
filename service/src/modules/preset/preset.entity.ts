import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';
import { PresetCategoryEntity } from '../presetCategory/presetCategory.entity';

@Entity({ name: 'presets' })
export class PresetEntity extends BaseEntity {
  @Column({ comment: '预设标题', length: 100 })
  title: string;

  @Column({ comment: '预设描述', nullable: true, type: 'text' })
  description: string;

  @Column({ comment: '提示词模板', type: 'text' })
  prompt: string;

  @Column({ comment: '图标', nullable: true })
  icon: string;

  @Column({ comment: '图标颜色', nullable: true })
  iconColor: string;

  @Column({ comment: '应用ID', nullable: true })
  appId: number;

  @Column({ comment: '插件参数', nullable: true })
  pluginParameters: string;

  @Column({ comment: '所属分类', nullable: true })
  categoryId: number;

  @ManyToOne(() => PresetCategoryEntity, {
    onDelete: 'SET NULL',
    eager: false,
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'categoryId' })
  category: PresetCategoryEntity;

  @Column({ comment: '排序、数字越大越靠前', default: 100 })
  order: number;

  @Column({ comment: '是否启用', default: true })
  isEnabled: boolean;

  @Column({ comment: '使用次数', default: 0 })
  usageCount: number;
}
