import { IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ChatListDto {
  @ApiProperty({ example: 1, description: '对话分组ID', required: false })
  @IsOptional()
  groupId: number;

  @ApiProperty({
    example: 50,
    description: '每页条数，默认50，用于分页加载历史消息',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiProperty({
    example: 100,
    description: '游标ID，获取此ID之前的消息（用于向上加载历史）',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  beforeId?: number;
}
