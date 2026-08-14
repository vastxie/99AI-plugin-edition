export const USER_STATUS_OPTIONS = [
  { value: 0, label: '待激活' },
  { value: 1, label: '正常' },
  { value: 2, label: '已封禁' },
  { value: 3, label: '黑名单' },
  { value: 4, label: '游客' }, // 添加游客状态
];

export const USER_STATUS_MAP = {
  0: '待激活',
  1: '正常',
  2: '已封禁',
  3: '黑名单',
  4: '游客', // 添加游客状态
};

export const USER_STATUS_TYPE_MAP = {
  0: 'info',
  1: 'success',
  2: 'danger',
  3: 'danger',
  4: 'warning', // 游客状态使用警告色
} as const;

export type UserStatus = keyof typeof USER_STATUS_TYPE_MAP;

// 充值类型map 1-9: 充值类型  10-14: 消费类型
export const RECHARGE_TYPE_MAP = {
  1: '注册赠送',
  2: '受邀请赠送',
  3: '邀请人赠送',
  4: '购买套餐赠送',
  5: '管理员调整',
  6: '扫码支付',
  7: '退款',
  8: '签到奖励',
  9: '管理员批量充值',
  10: '普通对话',
  11: '图片生成',
  12: '视频生成',
  13: '音乐生成',
  14: '其他消费',
};

// 充值类型数组（1-9）
export const RECHARGE_TYPE_OPTIONS = [
  { value: 1, label: '注册赠送' },
  { value: 2, label: '受邀请赠送' },
  { value: 3, label: '邀请人赠送' },
  { value: 4, label: '购买套餐赠送' },
  { value: 5, label: '管理员调整' },
  { value: 6, label: '扫码支付' },
  { value: 7, label: '退款' },
  { value: 8, label: '签到奖励' },
  { value: 9, label: '管理员批量充值' },
];

// 消费类型数组（10-14）
export const CONSUMPTION_TYPE_OPTIONS = [
  { value: 10, label: '普通对话' },
  { value: 11, label: '图片生成' },
  { value: 12, label: '视频生成' },
  { value: 13, label: '音乐生成' },
  { value: 14, label: '其他消费' },
];

// 所有类型数组（充值+消费）
export const ALL_ACCOUNT_TYPE_OPTIONS = [...RECHARGE_TYPE_OPTIONS, ...CONSUMPTION_TYPE_OPTIONS];

// 是否开启额外赠送
export const IS_OPTIONS = {
  0: '关闭',
  1: '开启',
};

// 是否开启额外赠送类型
export const IS_TYPE_MAP = {
  0: 'danger',
  1: 'success',
};

export const PACKAGE_TYPE_OPTIONS = [
  { value: 0, label: '禁用' },
  { value: 1, label: '启动' },
];

// 扣费形式 1： 按次数扣费 2：按Token扣费
export const DEDUCTION_TYPE_OPTIONS = [
  { value: 1, label: '按次数扣费' },
  { value: 2, label: '按Token扣费' },
];

// 扣费形式 map
export const DEDUCTION_TYPE_MAP = {
  1: '按次数扣费',
  2: '按Token扣费',
};

export const CRAMI_STATUS_OPTIONS = [
  { value: 0, label: '未使用' },
  { value: 1, label: '已使用' },
];

//  图片推荐状态0未推荐1已推荐
export const RECOMMEND_STATUS_OPTIONS = [
  { value: 0, label: '未推荐' },
  { value: 1, label: '已推荐' },
];

// 0 禁用  1 启用
export const ENABLE_STATUS_OPTIONS = [
  { value: 0, label: '禁用' },
  { value: 1, label: '启用' },
];

// 问题状态 0 未解决 1 已解决
export const QUESTION_STATUS_OPTIONS = [
  { value: '0', label: '未启用' },
  { value: '1', label: '已启用' },
];

// 问题状态 0 未解决 1 已解决
export const ORDER_STATUS_OPTIONS = [
  { value: 0, label: '待审核' },
  { value: 1, label: '已通过' },
  { value: -1, label: '已拒绝' },
];

//  0：未推荐   1：已推荐  数组
export const RECOMMEND_STATUS = [
  { value: 0, label: '未推荐' },
  { value: 1, label: '已推荐' },
];

// 提现渠道 支付宝 微信
export const WITHDRAW_CHANNEL_OPTIONS = [
  { value: 1, label: '支付宝' },
  { value: 2, label: '微信' },
];

// 1 排队中 2 处理中 3 已完成 4 失败 5 超时
export const WITHDRAW_STATUS_OPTIONS = [
  { value: 1, label: '正在排队' },
  { value: 2, label: '正在绘制' },
  { value: 3, label: '绘制完成' },
  { value: 4, label: '绘制失败' },
  { value: 5, label: '绘制超时' },
];

// 0 禁用 warning 1启用 状态 success
export const ENABLE_STATUS_TYPE_MAP: QuestionStatusMap = {
  0: 'danger',
  1: 'success',
};

interface QuestionStatusMap {
  [key: number]: string;
}

// 问题状态 0 未解决 1 已解决 映射
export const QUESTION_STATUS_MAP: QuestionStatusMap = {
  '-1': '欠费锁定',
  '0': '未启用',
  '1': '已启用',
  '3': '待审核',
  '4': '拒绝共享',
  '5': '通过共享',
};

// 问题状态 0 被封号 1 正常 映射
export const KEY_STATUS_MAP: QuestionStatusMap = {
  0: '被封禁',
  1: '工作中',
};

// 模型列表
export const MODEL_LIST = [
  // OpenAI
  'gpt-4o',
  'gpt-4o-mini',
  'chatgpt-4o-latest',
  'gpt-4.5-preview',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-all',
  'gpt-5.1',
  'gpt-5.1-all',
  'gpt-5.1-thinking',
  'gpt-5.1-thinking-all',
  'o1',
  'o1-mini',
  'o3-mini',
  'o3',
  'gpt-4-all',
  'gpt-4o-all',
  'gpt-4o-image',
  'gpt-4o-image-vip',
  'sora_image',
  'gpt-4.1',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'o1-mini-all',
  'o1-all',
  'o1-pro-all',
  'o3-mini-all',
  'o3-mini-high-all',
  'o4-mini',
  // Claude
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514-thinking',
  'claude-opus-4-20250514-thinking',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5-20250929-thinking',
  'claude-opus-4-5-20251101',
  'claude-opus-4-5-20251101-thinking',
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001-thinking',
  // X AI
  'grok-2-vision-latest',
  'grok-3',
  'grok-3-reasoner',
  'grok-3-deepsearch',
  // Gemini
  'gemini-2.5-pro-exp-03-25',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.5-pro-preview-06-05',
  'gemini-3-pro-preview',
  'gemini-3-pro-preview-thinking',
  // DeepSeek
  'deepseek-r1',
  'deepseek-r1-250528',
  'deepseek-reasoner',
  'deepseek-v3',
  'deepseek-v3-250324',
  'deepseek-v3.1',
  'deepseek-chat',
  'deepseek-reasoner-all',
  // 创意模型
  'dall-e-3',
  'gpt-image-1',
  'nano-banana',
  'nano-banana-hd',
  'nano-banana-2',
  'doubao-seedream-4-0-250828',
  'doubao-seedream-4-5-251128',
  'flux-kontext-dev',
  'flux-kontext-pro',
  'flux-kontext-max',
  'black-forest-labs/flux-kontext-dev',
  'black-forest-labs/flux-kontext-pro',
  'black-forest-labs/flux-kontext-max',
  'fal-ai/flux-pro/kontext',
  'fal-ai/flux-max/kontext',
  'midjourney',
  'gpt-4o-image',
  'gpt-4o-image-vip',
  'suno-music',
  'sora_image',
  'luma-video',
  // 'higgsfield-video',
  'jimeng-video',
  'kling-video',
  'minimax-video',
  'google-veo-video',
  'cog-video',
  'veo3',
  'veo3-pro-frames',
  'wan2.2-t2v-plus',
  // 特殊模型
  'tts-1',
  'gpts',
];

// 支付状态列表  status 0：未支付、1：已支付、2、支付失败、3：支付超时
export const PAY_STATUS_OPTIONS = [
  { value: 0, label: '未支付' },
  { value: 1, label: '已支付' },
  { value: 2, label: '支付失败' },
  { value: 3, label: '支付超时' },
];

//  支付状态  status 0：未支付、1：已支付、2、支付失败、3：支付超时
export const PAY_STATUS_MAP: QuestionStatusMap = {
  0: '未支付',
  1: '已支付',
  2: '支付失败',
  3: '支付超时',
};

// 平台列表 - 支持所有支付渠道
export const PAY_PLATFORM_LIST = [
  // 第三方聚合支付
  { value: 'epay', label: '易支付' },
  { value: 'hupi', label: '虎皮椒' },
  { value: 'mpay', label: '码支付' },
  { value: 'ltzf', label: '蓝兔支付' },
  // 官方支付
  { value: 'wechat_official', label: '微信官方' },
  { value: 'alipay_official', label: '支付宝官方' },
  { value: 'paypal_official', label: 'PayPal官方' },
  { value: 'stripe_official', label: 'Stripe官方' },
];

// 支付平台映射 - 与后端 PaymentChannel 枚举对应
export const PAY_PLATFORM_MAP = {
  // 第三方聚合支付
  epay: '易支付',
  hupi: '虎皮椒',
  mpay: '码支付',
  ltzf: '蓝兔支付',
  // 官方支付渠道
  wechat_official: '微信官方',
  alipay_official: '支付宝官方',
  paypal_official: 'PayPal官方',
  stripe_official: 'Stripe官方',
  // 兼容旧数据（如果有）
  wechat: '微信支付',
  alipay: '支付宝',
  paypal: 'PayPal',
  stripe: 'Stripe',
};

//  绘画状态  1: 等待中 2: 绘制中 3: 绘制完成 4: 绘制失败 5: 绘制超时
export const DRAW_MJ_STATUS_LIST = [
  { value: 1, label: '等待中' },
  { value: 2, label: '绘制中' },
  { value: 3, label: '绘制完成' },
  { value: 4, label: '绘制失败' },
  { value: 5, label: '绘制超时' },
];

// App角色 系统 system  用户 user
export const APP_ROLE_LIST = [
  { value: 'system', label: '系统' },
  { value: 'user', label: '用户' },
];

// 绘画状态 1：排队中 2：绘制中 3：绘制完成 4：绘制失败 5：绘制超时
export const DRAW_STATUS_MAP = {
  1: '排队中',
  2: '绘制中',
  3: '绘制完成',
  4: '绘制失败',
  5: '绘制超时',
};

export const TYPEORIGINLIST = [
  { value: '百度云检测', label: '百度云检测' },
  { value: '自定义检测', label: '自定义检测' },
];

// 统一的模型类型列表（直接对应前端 modelType）
export const MODELTYPELIST = [
  { value: 1, label: '普通对话' },
  { value: 6, label: '通用创意 (支持图片/视频)' },
  { value: 4, label: '音乐生成' },
  { value: 5, label: '特殊模型' },
  { value: 2, label: '图片生成 (不再维护,建议迁移)' },
  { value: 3, label: '视频生成 (不再维护,建议迁移)' },
];

// 统一的模型类型映射
export const MODELTYPEMAP = {
  1: '普通对话',
  6: '通用创意 (支持图片/视频)',
  4: '音乐生成',
  5: '特殊模型',
  2: '图片生成 (不再维护,建议迁移)',
  3: '视频生成 (不再维护,建议迁移)',
};

// 模型列表映射
export const MODELSMAPLIST = {
  // 普通对话模型
  1: [
    // OpenAI
    'gpt-4o',
    'gpt-4o-mini',
    'chatgpt-4o-latest',
    'gpt-4.5-preview',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-5-all',
    'gpt-5.1',
    'gpt-5.1-all',
    'gpt-5.1-thinking',
    'gpt-5.1-thinking-all',
    'o1',
    'o3',
    'o1-mini',
    'o3-mini',
    'o4-mini',
    'gpt-4-all',
    'gpt-4o-all',
    'gpt-4o-image',
    'gpt-4.1',
    'gpt-4.1-nano',
    'gpt-4.1-mini',
    'o1-mini-all',
    'o1-all',
    'o1-pro-all',
    'o3-mini-all',
    'o3-mini-high-all',
    // Claude
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514-thinking',
    'claude-opus-4-20250514-thinking',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5-20250929-thinking',
    'claude-opus-4-5-20251101',
    'claude-opus-4-5-20251101-thinking',
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5-20251001-thinking',
    // X AI
    'grok-2-vision-latest',
    'grok-3',
    'grok-3-reasoner',
    'grok-3-deepsearch',
    // Gemini
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.5-flash-lite-preview-06-17',
    'gemini-2.5-pro-preview-06-05',
    'gemini-3-pro-preview',
    'gemini-3-pro-preview-thinking',
    // DeepSeek
    'deepseek-r1',
    'deepseek-r1-250528',
    'deepseek-reasoner',
    'deepseek-v3',
    'deepseek-v3-250324',
    'deepseek-v3.1',
    'deepseek-chat',
    'deepseek-reasoner-all',
  ],
  // 图片生成模型
  2: [
    'dall-e-3',
    'gpt-image-1',
    'nano-banana',
    'nano-banana-hd',
    'nano-banana-2',
    'doubao-seedream-4-0-250828',
    'doubao-seedream-4-5-251128',
    'flux-kontext-dev',
    'flux-kontext-pro',
    'flux-kontext-max',
    'black-forest-labs/flux-kontext-dev',
    'black-forest-labs/flux-kontext-pro',
    'black-forest-labs/flux-kontext-max',
    'fal-ai/flux-pro/kontext',
    'fal-ai/flux-max/kontext',
    'midjourney',
    'gpt-4o-image',
    'gpt-4o-image-vip',
    'sora_image',
  ],
  // 视频生成模型
  3: [
    'luma-video',
    // 'higgsfield-video',
    'jimeng-video',
    'kling-video',
    'minimax-video',
    'google-veo-video',
    'cog-video',
    'veo3',
    'veo3-pro-frames',
    'wan2.2-t2v-plus',
  ],
  // 音乐生成模型
  4: ['suno-music'],
  // 特殊模型
  5: ['tts-1', 'gpts', 'flowith'],
};

/* 扣费类型  普通余额还是高级余额 */
export const DEDUCTTYPELIST = [
  { value: 1, label: '普通积分' },
  { value: 2, label: '高级积分' },
  { value: 3, label: '绘画积分' },
];

/* 绘画类型选项列表 */
export const DRAWING_TYPE_LIST = [
  { value: 0, label: '不是绘画' },
  { value: 1, label: '通用格式' },
  { value: 2, label: 'gpt-image-1兼容' },
  { value: 3, label: 'midjourney' },
  { value: 4, label: 'chat正则提取' },
];

/* 音乐类型选项列表 */
export const MUSIC_TYPE_LIST = [
  { value: 0, label: '不是音乐' },
  { value: 1, label: 'suno' },
  { value: 10, label: '自定义音乐接口' },
];

/* 创意模型分类选项 */
export const CREATIVE_MODEL_TYPES = [
  { value: 'image', label: '图片模型' },
  { value: 'video', label: '视频模型' },
  { value: 'music', label: '音乐模型' },
];

/* 统一的 modelType 映射（用于前端判断显示组件） */
/* 1: 普通对话, 2: 图片生成, 3: 视频生成, 4: 音乐生成, 5: 其他类型 */
export const UNIFIED_MODEL_TYPE_MAP = {
  CHAT: 1, // 普通对话（keyType=1）
  IMAGE: 2, // 图片生成（keyType=2 + drawingType>0）
  VIDEO: 3, // 视频生成（keyType=3）
  MUSIC: 4, // 音乐生成（keyType=4）
  OTHER: 5, // 其他类型（如内置插件: mind-map, mermaid, ppt-generation）
};
