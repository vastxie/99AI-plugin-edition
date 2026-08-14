import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'models' })
@Index(['keyType', 'status']) // 模型类型和状态联合查询
@Index(['modelOrder']) // 排序查询
export class ModelsEntity extends BaseEntity {
  @Column({ comment: '模型类型 1: 普通对话 2: 图片生成 3: 视频生成 4: 音乐生成 5: 特殊模型' })
  keyType: number;

  @Column({ comment: '模型名称' })
  modelName: string;

  @Column({ comment: '绑定的模型是？' })
  model: string;

  @Column({ type: 'text', comment: '模型头像', nullable: true })
  modelAvatar: string;

  @Column({ comment: '模型排序', default: 1 })
  modelOrder: number;

  @Column({
    comment: '模型上下文支持的最大Tokens',
    default: 64000,
    nullable: true,
  })
  maxModelTokens: number;

  @Column({ comment: '模型回复最大Tokens', default: 4096, nullable: true })
  max_tokens: number;

  @Column({ comment: '模型上下文最大条数', nullable: true })
  maxRounds: number;

  @Column({ comment: '模型单次调用扣除的次数', default: 1 })
  deduct: number;

  @Column({ comment: '模型扣除余额类型 1: 普通模型 2: 高级模型', default: 1 })
  deductType: number;

  @Column({ comment: '是否使用token计费: 0:不是 1: 是', default: 0 })
  isTokenBased: boolean;

  @Column({
    comment:
      '文件解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:向量解析(内置文件分析,支持全模型分析带文字的文件)',
    default: 0,
  })
  isFileUpload: number;

  @Column({
    comment:
      '图片解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:GPT Vision 3:全局解析(支持所有格式的图片解析)',
    default: 0,
  })
  isImageUpload: number;

  @Column({ comment: 'token计费比例', default: 0 })
  tokenFeeRatio: number;

  @Column({ comment: '模型附加参数', type: 'text', nullable: true })
  additionalParams: string;

  @Column({ comment: '模型的key', nullable: true })
  key: string;

  @Column({ comment: '使用的状态: 0:禁用 1：启用', default: 1 })
  status: boolean;

  @Column({ comment: 'key的使用次数', default: 0 })
  useCount: number;

  @Column({ comment: 'key的已经使用的token数量', default: 0 })
  useToken: number;

  @Column({ comment: '当前模型的代理地址', nullable: true })
  proxyUrl: string;

  @Column({ comment: '模型频率限制 次/小时', default: 999 })
  modelLimits: number;

  @Column({ comment: '模型介绍', nullable: true })
  modelDescription: string;

  @Column({
    comment: '工具支持类型 0:不开启 1:前端显示开关 2:自动调用',
    nullable: true,
    default: 0,
  })
  isToolSupported: number;

  @Column({
    comment: '深度思考类型 0:关闭 1:全局思考 2:模型思考 3:全局思考(多模态) 4:模型思考(多模态)',
    nullable: true,
    default: 0,
  })
  deepThinkingType: number;

  @Column({ type: 'text', comment: '模型system预设', nullable: true })
  systemPrompt: string;

  @Column({
    comment: '预设类型 0:关闭预设 1: 附加模式 2: 覆盖模式',
    nullable: true,
    default: 0,
  })
  systemPromptType: number;

  @Column({
    comment: '自定义配置 JSON (用于通用创意模式等)',
    type: 'text',
    nullable: true,
  })
  customConfig: string;
}
