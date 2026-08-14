import { IsNumber } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateAppDto } from './createApp.dto';

export class UpdateAppDto extends PartialType(CreateAppDto) {
  @ApiProperty({ example: 1, description: '要修改的应用Id', required: true })
  @IsNumber({}, { message: '应用ID必须是Number' })
  id: number;
}
