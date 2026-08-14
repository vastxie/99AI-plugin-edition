import { ApiProperty } from '@nestjs/swagger';

export class SetModelDto {
  @ApiProperty({ example: 1, description: '模型ID，更新时必填', required: false })
  id?: number;

  @ApiProperty({
    example: 1,
    description: '模型类型 1:文本 2:图像 3:音乐 4:视频 5:PPT 99:自定义',
    required: true,
  })
  keyType: number;

  @ApiProperty({
    example: 'GPT-3.5 Turbo',
    description: '模型中文名称（显示名称）',
    required: true,
  })
  modelName: string;

  @ApiProperty({
    example: 'gpt-3.5-turbo',
    description: '模型标识（API调用使用的模型名）',
    required: true,
  })
  model: string;

  @ApiProperty({
    example: 'sk-xxx1',
    description: 'API密钥',
    required: false,
  })
  key?: string;

  @ApiProperty({ example: true, description: '是否启用当前模型', required: true })
  status: boolean;

  @ApiProperty({ example: 1, description: '模型排序（数字越小越靠前）', required: false })
  modelOrder?: number;

  @ApiProperty({
    example: 'https://example.com/avatar.png',
    description: '模型头像URL',
    required: false,
  })
  modelAvatar?: string;

  @ApiProperty({ example: 4096, description: '模型支持的最大Token数量', required: false })
  maxModelTokens?: number;

  @ApiProperty({
    example: 'https://api.openai.com',
    description: '代理地址（用于中转API请求）',
    required: false,
  })
  proxyUrl?: string;

  @ApiProperty({ example: 1, description: '密钥状态（1:正常 2:禁用）', required: false })
  keyStatus?: number;

  @ApiProperty({ example: 1, description: '扣费类型 1:普通余额 2:高级余额', required: false })
  deductType?: number;

  @ApiProperty({ example: 0.001, description: '单次扣除金额', required: false })
  deduct?: number;

  @ApiProperty({ example: 10, description: '最大上下文轮次（对话轮数限制）', required: false })
  maxRounds?: number;

  @ApiProperty({ example: false, description: '是否设置为绘画模型', required: false })
  isDraw?: boolean;

  @ApiProperty({ example: 1, description: '是否支持文件上传 0:不支持 1:支持', required: false })
  isFileUpload?: number;

  @ApiProperty({ example: false, description: '是否使用Token计费', required: false })
  isTokenBased?: boolean;

  @ApiProperty({
    example: 0.1,
    description: 'Token计费比例（相对于基础费率的比例）',
    required: false,
  })
  tokenFeeRatio?: number;

  @ApiProperty({
    example: '{"customOptions": {"size": ["1024x1024"], "style": ["realistic"]}}',
    description: '自定义配置JSON字符串',
    required: false,
  })
  customConfig?: string;

  @ApiProperty({
    example: 1,
    description: '绘画类型 0:非绘画 1:自定义绘画 2:DALL·E 3:Midjourney 4:Stable Diffusion',
    required: false,
  })
  drawingType?: number;

  @ApiProperty({ example: 1, description: '是否支持图片上传 0:不支持 1:支持', required: false })
  isImageUpload?: number;

  @ApiProperty({ example: '这是一个强大的GPT模型', description: '模型描述', required: false })
  modelDescription?: string;

  @ApiProperty({ example: 1, description: '深度思考类型 0:不支持 1:支持', required: false })
  deepThinkingType?: number;

  @ApiProperty({
    example: 0,
    description: '工具支持 0:不开启 1:前端显示开关 2:自动调用',
    required: false,
  })
  isToolSupported?: number;
}
