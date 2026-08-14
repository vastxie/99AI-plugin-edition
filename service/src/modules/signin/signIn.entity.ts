import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from 'src/common/entity/baseEntity';
import { UserEntity } from '../user/user.entity';

@Entity({ name: 'signin' })
export class SigninEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ comment: '签到日期' })
  signInDate: string;

  @Column({ comment: '签到时间' })
  signInTime: Date;

  @Column({ default: false })
  isSigned: boolean;
}
