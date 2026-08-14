import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../user/user.entity';

@Entity({ name: 'chatlog' })
@Index(['userId', 'createdAt']) // 用户聊天记录查询（最常用）
@Index(['groupId', 'createdAt']) // 分组聊天记录查询
@Index(['type', 'userId']) // 按类型查询用户记录
@Index(['status']) // 任务状态查询
@Index(['model']) // 模型使用统计
export class ChatLogEntity extends BaseEntity {
  @Column({ name: 'userId', comment: '用户ID', nullable: true })
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

  @Column({ name: 'model', comment: '使用的模型', nullable: true })
  model: string;

  @Column({ comment: 'role system user assistant', nullable: true })
  role: string;

  @Column({ comment: '模型内容', nullable: true, type: 'mediumtext' })
  content: string;

  @Column({ comment: '模型推理内容', nullable: true, type: 'text' })
  reasoning_content: string;

  @Column({ comment: 'Agent内容参数', nullable: true, type: 'mediumtext' })
  agent_content: string;

  @Column({ comment: '图片Url', nullable: true, type: 'text' })
  imageUrl: string;

  @Column({ comment: '视频Url', nullable: true, type: 'text' })
  videoUrl: string;

  @Column({ comment: '音频Url', nullable: true, type: 'text' })
  audioUrl: string;

  @Column({ comment: '文件Url', nullable: true, type: 'text' })
  fileUrl: string;

  @Column({
    comment: '使用类型 1: 普通对话 2: 图片生成 3: 视频生成 4: 音乐生成 5: 其他类型',
    nullable: true,
    default: 1,
  })
  type: number;

  @Column({ comment: '自定义的模型名称', nullable: true, default: 'AI' })
  modelName: string;

  @Column({ comment: 'Ip地址', nullable: true })
  curIp: string;

  //废弃字段

  @Column({ comment: '插件参数', nullable: true })
  pluginParam: string;

  @Column({ comment: '总花费的token', nullable: true })
  totalTokens: number;

  @Column({ comment: '任务进度', nullable: true })
  progress: string;

  @Column({ comment: '任务状态', nullable: true, default: 3 })
  status: number;

  @Column({ comment: '任务类型', nullable: true })
  action: string;

  @Column({ comment: '对图片操作的按钮ID', type: 'text', nullable: true })
  customId: string;

  @Column({ comment: '绘画的ID每条不一样', nullable: true })
  drawId: string;

  @Column({ comment: '对话转语音的链接', nullable: true, type: 'text' })
  ttsUrl: string;

  @Column({ comment: '分组ID', nullable: true })
  groupId: number;

  @Column({ comment: '使用的应用id', nullable: true })
  appId: number;

  @Column({ comment: '是否删除', default: false })
  isDelete: boolean;

  @Column({ comment: '任务ID', nullable: true })
  taskId: string;

  @Column({ comment: '任务数据', nullable: true, type: 'text' })
  taskData: string;
}
