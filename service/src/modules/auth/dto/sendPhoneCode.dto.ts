import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '19999999999', description: '手机号' })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @MinLength(10, { message: '手机号长度不能少于10位' })
  @MaxLength(20, { message: '手机号长度不能超过20位' })
  phone?: string;

  @ApiPropertyOptional({ example: false, description: '是否登录场景' })
  @IsOptional()
  @IsBoolean({ message: 'isLogin 必须是布尔值' })
  isLogin?: boolean;
}
