import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UserRegisterDto {
  @ApiProperty({ example: 'cooper', description: '用户名称' })
  // @IsNotEmpty({ message: '用户名不能为空！' })
  // @MinLength(2, { message: '用户名最低需要大于2位数！' })
  // @MaxLength(12, { message: '用户名不得超过12位！' })
  username?: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', description: '用户密码' })
  @IsNotEmpty({ message: '用户密码不能为空' })
  @MinLength(12, { message: '用户密码至少需要12位！' })
  @MaxLength(128, { message: '用户密码最长不能超过128位！' })
  password: string;

  @ApiProperty({ example: 'user@example.com', description: '用户邮箱' })
  // @IsEmail({}, { message: '请填写正确格式的邮箱！' })
  // @IsNotEmpty({ message: '邮箱不能为空！' })
  email: string;

  @ApiProperty({
    example: '',
    description: '用户头像',
    required: false,
  })
  @IsOptional()
  avatar: string;

  @ApiProperty({
    example: 'default',
    description: '用户注册来源',
    required: false,
  })
  @IsOptional()
  client: string;
}
