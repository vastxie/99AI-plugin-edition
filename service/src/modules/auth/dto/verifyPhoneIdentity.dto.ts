import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyPhoneIdentityDto {
  @ApiProperty({ example: '19999999999', description: '手机号' })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @MinLength(10, { message: '手机号长度不能少于10位' })
  @MaxLength(20, { message: '手机号长度不能超过20位' })
  phone: string;

  @ApiProperty({ example: 'cooper', description: '用户名' })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(1, { message: '用户名不能为空' })
  @MaxLength(30, { message: '用户名长度不能超过30位' })
  username: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', description: '密码' })
  @IsString({ message: '用户密码必须是字符串' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(12, { message: '用户密码至少需要12位！' })
  @MaxLength(128, { message: '用户密码最长不能超过128位！' })
  password: string;

  @ApiProperty({ example: '152546', description: '手机验证码' })
  @IsString({ message: '手机验证码必须是字符串' })
  @IsNotEmpty({ message: '手机验证码不能为空' })
  @Matches(/^\d{6}$/, { message: '手机验证码必须为6位数字' })
  code: string;
}
