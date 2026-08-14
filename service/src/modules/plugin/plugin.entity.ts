import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'plugin' })
export class PluginEntity extends BaseEntity {
  @Column({ unique: true, comment: '插件名称' })
  name: string;

  @Column({ comment: '插件封面', nullable: true, type: 'text' })
  pluginImg: string;

  @Column({ comment: '插件描述' })
  description: string;

  @Column({ comment: '插件是否启用 0：禁用 1：启用', default: 1 })
  isEnabled: number;

  @Column({ comment: '调用参数', type: 'text' })
  parameters: string;

  @Column({ comment: '排序值', default: 0 })
  sortOrder: number;

  @Column({
    comment:
      '支持的上传类型：file=文件, image=图片, video=视频（多选用逗号分隔，如: file,image,video）',
    nullable: true,
    type: 'text',
  })
  uploadTypes: string;
}
