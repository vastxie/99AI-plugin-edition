import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePluginDto {
  @ApiProperty({ example: '网页搜索', description: '插件名称', required: true })
  @IsNotEmpty({ message: '插件名称不能为空' })
  @IsString({ message: '插件名称必须是字符串' })
  name: string;

  @ApiProperty({ example: 'https://example.com/icon.png', description: '插件封面', required: false })
  @IsOptional()
  @IsString({ message: '插件封面必须是字符串' })
  pluginImg?: string;

  @ApiProperty({ example: '搜索互联网信息', description: '插件描述', required: true })
  @IsNotEmpty({ message: '插件描述不能为空' })
  @IsString({ message: '插件描述必须是字符串' })
  description: string;

  @ApiProperty({ example: 1, description: '是否启用 0:禁用 1:启用', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'isEnabled必须是数字' })
  @Type(() => Number)
  isEnabled?: number;

  @ApiProperty({ example: '{"type":"object"}', description: '调用参数JSON', required: false })
  @IsOptional()
  @IsString({ message: '调用参数必须是字符串' })
  parameters?: string;

  @ApiProperty({ example: 0, description: '排序值', required: false })
  @IsOptional()
  @IsNumber({}, { message: '排序值必须是数字' })
  @Type(() => Number)
  sortOrder?: number;

  @ApiProperty({ example: 'file,image', description: '支持的上传类型', required: false })
  @IsOptional()
  @IsString({ message: '上传类型必须是字符串' })
  uploadTypes?: string;
}

export class UpdatePluginDto {
  @ApiProperty({ example: 1, description: '插件Id', required: true })
  @IsNotEmpty({ message: '插件Id不能为空' })
  @IsNumber({}, { message: '插件Id必须是数字' })
  @Type(() => Number)
  id: number;

  @ApiProperty({ example: '网页搜索', description: '插件名称', required: false })
  @IsOptional()
  @IsString({ message: '插件名称必须是字符串' })
  name?: string;

  @ApiProperty({ example: 'https://example.com/icon.png', description: '插件封面', required: false })
  @IsOptional()
  @IsString({ message: '插件封面必须是字符串' })
  pluginImg?: string;

  @ApiProperty({ example: '搜索互联网信息', description: '插件描述', required: false })
  @IsOptional()
  @IsString({ message: '插件描述必须是字符串' })
  description?: string;

  @ApiProperty({ example: 1, description: '是否启用', required: false })
  @IsOptional()
  @IsNumber({}, { message: 'isEnabled必须是数字' })
  @Type(() => Number)
  isEnabled?: number;

  @ApiProperty({ example: '{"type":"object"}', description: '调用参数JSON', required: false })
  @IsOptional()
  @IsString({ message: '调用参数必须是字符串' })
  parameters?: string;

  @ApiProperty({ example: 0, description: '排序值', required: false })
  @IsOptional()
  @IsNumber({}, { message: '排序值必须是数字' })
  @Type(() => Number)
  sortOrder?: number;

  @ApiProperty({ example: 'file,image', description: '支持的上传类型', required: false })
  @IsOptional()
  @IsString({ message: '上传类型必须是字符串' })
  uploadTypes?: string;
}

export class DelPluginDto {
  @ApiProperty({ example: 1, description: '插件Id', required: true })
  @IsNotEmpty({ message: '插件Id不能为空' })
  @IsNumber({}, { message: '插件Id必须是数字' })
  @Type(() => Number)
  id: number;
}
