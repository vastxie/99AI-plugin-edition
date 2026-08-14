import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class Options {
  @ApiProperty({ example: 0, description: '父消息ID' })
  @IsOptional()
  @IsNumber({}, { message: 'parentMessageId必须是数字' })
  @Type(() => Number)
  parentMessageId?: number;

  @ApiProperty({ example: 'gpt-3.5-turbo', description: '使用的模型', required: false })
  @IsOptional()
  @IsString({ message: 'model必须是字符串' })
  model?: string;

  @ApiProperty({ example: 0.7, description: '温度参数', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'temperature必须是数字' })
  @Type(() => Number)
  temperature?: number;

  @ApiProperty({ example: 1.0, description: 'top_p参数', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'top_p必须是数字' })
  @Type(() => Number)
  top_p?: number;

  @ApiProperty({ example: 1, description: '分组ID', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'groupId必须是数字' })
  @Type(() => Number)
  groupId?: number;

  @ApiProperty({ example: true, description: '是否启用工具调用', required: false })
  @IsOptional()
  @IsBoolean({ message: 'usingTool必须是布尔值' })
  usingTool?: boolean;

  @ApiProperty({ example: true, description: '是否启用深度思考', required: false })
  @IsOptional()
  @IsBoolean({ message: 'usingDeepThinking必须是布尔值' })
  usingDeepThinking?: boolean;

  @ApiProperty({ example: false, description: '是否使用用户知识库', required: false })
  @IsOptional()
  @IsBoolean({ message: 'useKnowledgeBase必须是布尔值' })
  useKnowledgeBase?: boolean;

  @ApiProperty({ example: '', description: '文件解析模式', required: false })
  @IsOptional()
  @IsString({ message: 'fileParsing必须是字符串' })
  fileParsing?: string;
}

export class EditorContent {
  @ApiProperty({ example: '# 文档标题\n\n文档内容...', description: '编辑器的完整 Markdown 内容' })
  @IsString()
  @IsNotEmpty()
  markdown: string;

  @ApiProperty({ example: 1, description: '文档版本号，用于冲突检测' })
  @IsNumber()
  version: number;
}

export class ChatProcessDto {
  @ApiProperty({ example: 'hello, Who are you', description: '对话信息' })
  @IsNotEmpty({ message: '提问信息不能为空！' })
  @IsString({ message: 'prompt必须是字符串' })
  prompt: string;

  @ApiProperty({
    example: 'https://example.com',
    description: '对话附带的链接',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'url必须是字符串' })
  url?: string;

  @ApiProperty({
    example: { parentMessageId: 0 },
    description: '上次对话信息',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => Options)
  options?: Options;

  @ApiProperty({
    example:
      "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.",
    description: '系统预设信息',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'systemMessage必须是字符串' })
  systemMessage?: string;

  @ApiProperty({ example: 1, description: '应用id', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'appId必须是数字' })
  @Type(() => Number)
  appId?: number;

  @ApiProperty({
    example: 'gpt-3.5-turbo',
    description: '使用模型',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'model必须是字符串' })
  model?: string;

  @ApiProperty({ example: 'GPT-4', description: '模型展示名称', required: false })
  @IsOptional()
  @IsString({ message: 'modelName必须是字符串' })
  modelName?: string;

  @ApiProperty({ example: 1, description: '模型类型', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'modelType必须是数字' })
  @Type(() => Number)
  modelType?: number;

  @ApiProperty({ example: 1, description: '使用的插件ID', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'usingPluginId必须是数字' })
  @Type(() => Number)
  usingPluginId?: number;

  @ApiProperty({ example: 'https://example.com/file.pdf', description: '文件URL', required: false })
  @IsOptional()
  @IsString({ message: 'fileUrl必须是字符串' })
  fileUrl?: string;

  @ApiProperty({
    example: 'https://example.com/image.png',
    description: '图片URL',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'imageUrl必须是字符串' })
  imageUrl?: string;

  @ApiProperty({
    example: 'https://example.com/video.mp4',
    description: '视频URL',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'videoUrl必须是字符串' })
  videoUrl?: string;

  @ApiProperty({ example: 'draw-task-id', description: '绘图任务ID', required: false })
  @IsOptional()
  @IsString({ message: 'drawId必须是字符串' })
  drawId?: string;

  @ApiProperty({ example: 'custom-task-id', description: '自定义任务ID', required: false })
  @IsOptional()
  @IsString({ message: 'customId必须是字符串' })
  customId?: string;

  @ApiProperty({ example: 'task-id', description: '任务ID', required: false })
  @IsOptional()
  @IsString({ message: 'taskId必须是字符串' })
  taskId?: string;

  @ApiProperty({ example: 'generate_ppt', description: '前端动作标识', required: false })
  @IsOptional()
  @IsString({ message: 'action必须是字符串' })
  action?: string;

  @ApiProperty({ example: 'creative', description: 'PPT生成模式', required: false })
  @IsOptional()
  @IsString({ message: 'pptMode必须是字符串' })
  pptMode?: string;

  @ApiProperty({ description: '插件、创意模型或工作流的额外参数', required: false })
  @IsOptional()
  extraParam?: any;

  @ApiProperty({ description: '已确认的PPT大纲', required: false })
  @IsOptional()
  pptOutline?: any;

  @ApiProperty({ description: 'PPT选中主题', required: false })
  @IsOptional()
  selectedTheme?: any;

  @ApiProperty({
    example: { markdown: '# 标题\n内容...', version: 1 },
    description: '编辑器内容（编辑模式下传递）',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EditorContent)
  editorContent?: EditorContent;

  @ApiProperty({
    example: false,
    description: '是否使用用户知识库',
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'useKnowledgeBase必须是布尔值' })
  useKnowledgeBase?: boolean;
}
