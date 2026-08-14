import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class DeleteChatsAfterIdDto {
  @ApiProperty({ example: 1, description: '对话记录Id', required: true })
  @IsNumber({}, { message: '对话记录Id必须是数字' })
  @Type(() => Number)
  id: number;
}
