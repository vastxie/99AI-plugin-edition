import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsNumber } from 'class-validator';

export class SystemChatDto {
  @ApiProperty({
    example: 'You are a helpful assistant that analyzes data and provides insights.',
    description: '系统预设提示词',
    required: false,
  })
  @IsOptional()
  @IsString()
  system?: string;

  @ApiProperty({
    example: [
      { role: 'user', content: '分析这个数据' },
      { role: 'assistant', content: '好的，让我来分析...' },
    ],
    description: 'OpenAI格式的消息数组',
    required: true,
  })
  @IsArray()
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  @ApiProperty({
    example: 'gpt-3.5-turbo',
    description: '使用的模型名称（可选，默认使用全局配置）',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    example: 0.7,
    description: '温度参数，控制输出的随机性（0-2）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiProperty({
    example: 1000,
    description: '最大输出token数',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  max_tokens?: number;

  @ApiProperty({
    example: 1,
    description: 'top_p参数，用于核采样',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  top_p?: number;

  @ApiProperty({
    example: 0,
    description: '频率惩罚参数',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  frequency_penalty?: number;

  @ApiProperty({
    example: 0,
    description: '存在惩罚参数',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  presence_penalty?: number;
}
