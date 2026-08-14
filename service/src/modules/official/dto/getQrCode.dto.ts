import { IsDefined, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetQrCodeDto {
  @ApiProperty({
    example: 'dasdasg2441lk1o24bk',
    description: '1-64位的字符参数',
    required: true,
  })
  @IsDefined({ message: 'sceneStr是必传参数' })
  @IsString({ message: 'sceneStr必须是字符串' })
  @Length(1, 64, { message: 'sceneStr长度必须在1到64位之间' })
  sceneStr: string;

  @ApiProperty({
    description: '创建登录二维码时返回的浏览器轮询凭证',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'pollToken必须是字符串' })
  @Length(32, 128, { message: 'pollToken长度必须在32到128位之间' })
  pollToken?: string;
}
