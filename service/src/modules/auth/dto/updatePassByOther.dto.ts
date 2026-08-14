import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePassByOtherDto {
  @ApiProperty({ example: 'correct-horse-battery-staple', description: '三方用户更新新密码' })
  @IsString({ message: '用户密码必须是字符串' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(12, { message: '用户密码至少需要12位！' })
  @MaxLength(128, { message: '用户密码最长不能超过128位！' })
  password: string;
}
