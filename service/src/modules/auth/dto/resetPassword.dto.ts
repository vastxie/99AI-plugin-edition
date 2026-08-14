import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱或手机号' })
  @IsString({ message: '联系方式必须是字符串' })
  @IsNotEmpty({ message: '联系方式不能为空' })
  @MinLength(3, { message: '联系方式长度不能少于3位' })
  @MaxLength(128, { message: '联系方式长度不能超过128位' })
  contact: string;

  @ApiProperty({ example: '152546', description: '验证码' })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @Matches(/^\d{6}$/, { message: '验证码必须为6位数字' })
  code: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', description: '新密码' })
  @IsString({ message: '用户密码必须是字符串' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(12, { message: '用户密码至少需要12位！' })
  @MaxLength(128, { message: '用户密码最长不能超过128位！' })
  password: string;
}
