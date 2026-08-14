import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../user/user.entity';

@Entity({ name: 'chat_group' })
export class ChatGroupEntity extends BaseEntity {
  @Column({ comment: '用户ID', nullable: true })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'SET NULL',
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '访客指纹ID', nullable: true })
  visitorId: string;

  @Column({ comment: '是否置顶聊天', type: 'boolean', default: false })
  isSticky: boolean;

  @Column({ comment: '分组名称', nullable: true })
  title: string;

  @Column({ comment: '应用ID', nullable: true })
  appId: number;

  @Column({ comment: '插件ID', nullable: true })
  pluginId: number;

  // @Column({ comment: '模型', nullable: true })
  // model: string;

  // @Column({ comment: '模型名称', nullable: true })
  // modelName: string;

  // @Column({ comment: '扣费类型', nullable: true })
  // mdeductType: string;

  // @Column({ comment: '是否支持文件上传', nullable: true })
  // isFileUpload: boolean;

  // @Column({ comment: '是否固定模型', default: 0 })
  // isFixedModel: boolean;

  // @Column({ comment: '模型类型', nullable: true })
  // keyType: number;

  @Column({ comment: '是否删除了', default: false })
  isDelete: boolean;

  @Column({ comment: '配置', nullable: true, default: null, type: 'text' })
  config: string;

  @Column({ comment: '附加参数', nullable: true, type: 'text' })
  params: string;

  @Column({ comment: '文件链接', nullable: true, default: null, type: 'text' })
  fileUrl: string;

  @Column({ comment: 'PDF中的文字内容', nullable: true, type: 'mediumtext' })
  pdfTextContent: string;
}
