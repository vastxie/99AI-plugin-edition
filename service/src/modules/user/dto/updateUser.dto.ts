import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'john_doe',
    nullable: true,
    description: '用户名',
    required: false,
  })
  @MinLength(2, { message: '用户名最低需要大于2位数！' })
  @MaxLength(20, { message: '用户名不得超过20位！' })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @IsOptional()
  username?: string;

  @ApiProperty({
    example: 'cooper',
    nullable: true,
    description: '用户昵称',
    required: false,
  })
  @MinLength(2, { message: '昵称最低需要大于2位数！' })
  @MaxLength(12, { message: '昵称不得超过12位！' })
  @IsNotEmpty({ message: '昵称不能为空！' })
  @IsOptional()
  nickname?: string;

  @ApiProperty({ example: '', description: '用户头像', required: false })
  @IsNotEmpty({ message: '用户头像不能为空！' })
  @IsOptional()
  avatar?: string;

  @ApiProperty({
    example: '我是一名软件工程师，希望AI的回复更加专业和技术性',
    description: '用户自定义指令',
    required: false,
  })
  @MaxLength(500, { message: '自定义指令不得超过500个字符！' })
  @IsOptional()
  customInstruction?: string;

  @ApiProperty({
    example: [
      { fileName: 'document.pdf', fileUrl: 'url1' },
      { fileName: 'report.docx', fileUrl: 'url2' },
    ],
    description: '用户知识库文件列表，最多5个',
    required: false,
  })
  @IsArray({ message: '知识库文件必须是数组格式！' })
  @ArrayMaxSize(5, { message: '最多只能上传5个知识库文件！' })
  @IsOptional()
  knowledgeFiles?: Array<{ fileName: string; fileUrl: string }>;
}
