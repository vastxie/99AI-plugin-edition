import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'users' })
@Index(['role', 'status']) // 角色和状态联合查询
@Index(['registerIp']) // IP 查询
@Index(['invitedBy']) // 邀请关系查询
@Index(['unionId']) // 微信 UnionID 查询
export class UserEntity extends BaseEntity {
  @Column({ length: 12, comment: '用户昵称' })
  username: string;

  @Column({ length: 64, comment: '用户密码', nullable: true })
  password: string;

  @Column({ default: 0, comment: '用户状态' })
  status: number;

  @Column({ default: 1, comment: '用户性别' })
  sex: number;

  @Column({ comment: '用户昵称', nullable: true })
  nickname: string;

  @Column({ length: 64, unique: true, comment: '用户邮箱' })
  email: string;

  @Column({ length: 64, nullable: true, comment: '用户手机号' })
  phone: string;

  @Column({
    length: 300,
    nullable: true,
    default: '',
    comment: '用户头像',
  })
  avatar: string;

  @Column({
    length: 300,
    nullable: true,
    default:
      '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。',
    comment: '用户签名',
  })
  sign: string;

  @Column({ length: 64, default: '', comment: '注册IP', nullable: true })
  registerIp: string;

  @Column({
    length: 64,
    default: '',
    comment: '最后一次登录IP',
    nullable: true,
  })
  lastLoginIp: string;

  @Column({ length: 10, default: '', comment: '用户邀请码' })
  inviteCode: string;

  @Column({ length: 10, default: '', comment: '用户填写的别人的邀请码' })
  invitedBy: string;

  @Column({ length: 10, default: 'viewer', comment: '用户角色' })
  role: string;

  @Column({ length: 64, default: '', comment: '微信openId', nullable: true })
  openId: string;

  @Column({ length: 64, default: '', comment: '微信unionId', nullable: true })
  unionId: string;

  @Column({ length: 64, comment: '用户注册来源', nullable: true })
  client: string;

  @Column({ comment: '用户邀请链接被点击次数', default: 0 })
  inviteLinkCount: number;

  @Column({ comment: '用户连续签到天数', default: 0 })
  consecutiveDays: number;

  @Column({ comment: '用户违规记录次数', default: 0 })
  violationCount: number;

  @Column({ comment: '真实姓名', nullable: true })
  realName: string;

  @Column({ comment: '身份证号', nullable: true })
  idCard: string;

  @Column({
    length: 500,
    nullable: true,
    comment: '用户自定义指令，用于个性化AI回复',
  })
  customInstruction: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: '用户知识库文件列表 [{fileName: string, fileUrl: string}]，最多5个文件',
  })
  knowledgeFiles: Array<{ fileName: string; fileUrl: string }>;
}
