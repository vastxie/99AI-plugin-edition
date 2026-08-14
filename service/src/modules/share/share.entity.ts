import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('share')
export class Share {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 8, unique: true })
  shareCode: string;

  @Column('mediumtext', { nullable: true })
  htmlContent: string;

  @Column({ comment: '分享的对话组ID', nullable: true })
  groupId: number;

  @Column('json', { comment: '分享的消息ID列表', nullable: true })
  messageIds: number[];

  // 仅保留数据库兼容性；服务端不再创建或公开读取任意 JSON 分享。
  @Column('json', { comment: '已停用的旧版分享数据', nullable: true })
  shareData: any;

  @Column({ nullable: true })
  userId: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
