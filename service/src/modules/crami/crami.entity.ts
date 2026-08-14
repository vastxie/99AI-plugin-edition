import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'crami' })
export class CramiEntity extends BaseEntity {
  @Column({ unique: true, comment: '存储卡密CDK编码', length: 50 })
  code: string;

  @Column({
    comment: '卡密CDK类型：1-单次使用 | 2-多次可复用',
    default: 1,
  })
  cramiType: number;

  @Column({
    comment: '卡密CDK类型： 默认套餐类型 | 不填就是自定义类型',
    nullable: true,
  })
  packageId: number;

  @Column({ comment: '卡密CDK状态，如已使用、未使用等', default: 0 })
  status: number;

  @Column({ comment: '卡密使用账户用户ID信息（单次使用）', nullable: true })
  useId: number;

  @Column({ comment: '多用户使用记录（逗号分隔ID，多次可复用）', type: 'text', nullable: true })
  useIds: string;

  @Column({ comment: '最大使用次数（0=不限制，仅多次可复用）', default: 0 })
  maxUseCount: number;

  @Column({ comment: '当前已使用次数（仅多次可复用）', default: 0 })
  currentUseCount: number;

  @Column({ comment: '卡密过期时间（NULL=永久有效）', type: 'datetime', nullable: true })
  expireTime: Date;

  @Column({
    comment: '卡密有效期天数、从生成创建的时候开始计算，设为0则不限时间',
    default: 0,
  })
  days: number;

  @Column({ comment: '卡密模型3额度', nullable: true })
  model3Count: number;

  @Column({ comment: '卡密模型4额度', nullable: true })
  model4Count: number;

  @Column({ comment: '卡密MJ绘画额度', nullable: true })
  drawMjCount: number;

  @Column({ comment: '卡密应用分类列表', nullable: true, default: '' })
  appCats: string;
}
