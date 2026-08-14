import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGroupDto {
  @ApiProperty({ example: 1, description: '修改的对话ID', required: true })
  @IsNotEmpty({ message: 'groupId不能为空' })
  @IsNumber({}, { message: 'groupId必须是数字' })
  @Type(() => Number)
  groupId: number;

  @ApiProperty({ example: '我的对话', description: '对话组title', required: false })
  @IsOptional()
  @IsString({ message: 'title必须是字符串' })
  title: string;

  @ApiProperty({ example: true, description: '对话组是否置顶', required: false })
  @IsOptional()
  @IsBoolean({ message: 'isSticky必须是布尔值' })
  isSticky: boolean;

  @ApiProperty({
    example: '',
    description: '对话模型配置项序列化的字符串',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'config必须是字符串' })
  config: string;

  @ApiProperty({ example: 'https://example.com/file.pdf', description: '文件URL', required: false })
  @IsOptional()
  @IsString({ message: 'fileUrl必须是字符串' })
  fileUrl: string;

  @ApiProperty({ example: 1, description: '插件ID', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'pluginId必须是数字' })
  @Type(() => Number)
  pluginId: number;
}
