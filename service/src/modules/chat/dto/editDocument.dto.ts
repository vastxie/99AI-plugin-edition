import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ChangeType {
  REPLACE = 'replace',
  INSERT = 'insert',
  DELETE = 'delete',
}

export class DocumentChange {
  @ApiProperty({ enum: ChangeType, description: '操作类型' })
  @IsEnum(ChangeType)
  type: ChangeType;

  @ApiProperty({ example: 5, description: '起始行号（从1开始）' })
  @IsNumber()
  startLine: number;

  @ApiProperty({ example: 7, description: '结束行号（replace/delete 时需要）', required: false })
  @IsOptional()
  @IsNumber()
  endLine?: number;

  @ApiProperty({ example: '旧文本内容', description: '要替换/删除的原文本', required: false })
  @IsOptional()
  @IsString()
  oldText?: string;

  @ApiProperty({
    example: '新文本内容',
    description: '新文本内容（replace/insert 时需要）',
    required: false,
  })
  @IsOptional()
  @IsString()
  newText?: string;

  @ApiProperty({ example: '修正拼写错误', description: '修改原因说明', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class EditDocumentResult {
  @ApiProperty({ example: true, description: '是否需要编辑文档' })
  @IsBoolean()
  needEdit: boolean;

  @ApiProperty({ type: [DocumentChange], description: '修改列表', required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentChange)
  changes?: DocumentChange[];

  @ApiProperty({ example: '修正了第三段的代码示例', description: '修改总结', required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ description: 'Token 使用量信息', required: false })
  @IsOptional()
  tokenUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}
