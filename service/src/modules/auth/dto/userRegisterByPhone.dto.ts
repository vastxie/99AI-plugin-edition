import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, Matches, MaxLength, MinLength } from 'class-validator';

export class UserRegisterByPhoneDto {
  @ApiProperty({ example: 'cooper', description: '用户名称' })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @MinLength(2, { message: '用户名最低需要大于2位数！' })
  @MaxLength(12, { message: '用户名不得超过12位！' })
  username?: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', description: '用户密码' })
  @IsNotEmpty({ message: '用户密码不能为空' })
  @MinLength(12, { message: '用户密码至少需要12位！' })
  @MaxLength(128, { message: '用户密码最长不能超过128位！' })
  password: string;

  @ApiProperty({ example: '19999999999', description: '用户手机号码' })
  @IsPhoneNumber('CN', { message: '手机号码格式不正确！' })
  @IsNotEmpty({ message: '手机号码不能为空！' })
  phone: string;

  @ApiProperty({ example: '152546', description: '手机验证码' })
  @IsNotEmpty({ message: '手机验证码不能为空！' })
  @Matches(/^\d{6}$/, { message: '手机验证码必须为6位数字' })
  phoneCode: string;
}
