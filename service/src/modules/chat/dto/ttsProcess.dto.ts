import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class TtsProcessDto {
  @ApiProperty({ example: 1, description: '对话记录Id', required: true })
  @IsNumber({}, { message: 'chatId必须是数字' })
  @Type(() => Number)
  chatId: number;

  @ApiProperty({ example: '你好，欢迎使用', description: '需要转换的文本内容', required: true })
  @IsNotEmpty({ message: '文本内容不能为空' })
  @IsString({ message: 'prompt必须是字符串' })
  prompt: string;
}
