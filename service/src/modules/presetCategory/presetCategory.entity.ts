import { Column, Entity } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';

@Entity({ name: 'preset_categories' })
export class PresetCategoryEntity extends BaseEntity {
  @Column({ unique: true, comment: '预设分类名称' })
  name: string;

  @Column({ comment: '预设分类排序、数字越大越靠前', default: 100 })
  order: number;

  @Column({ comment: '预设分类是否启用中', default: true })
  isEnabled: boolean;
}
