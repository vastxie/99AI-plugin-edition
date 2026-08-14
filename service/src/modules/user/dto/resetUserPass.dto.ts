import { IsDefined, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPassDto {
  @ApiProperty({
    example: 1,
    nullable: true,
    description: '用户id',
    required: false,
  })
  @IsDefined({ message: '用户id是必传参数' })
  @IsInt({ message: '用户id必须是整数' })
  @Min(1, { message: '用户id必须大于0' })
  id: number;

  @ApiProperty({ description: '新的强密码', minLength: 12, maxLength: 128 })
  @IsDefined({ message: '新密码是必传参数' })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(12, { message: '新密码至少需要12位' })
  @MaxLength(128, { message: '新密码不能超过128位' })
  password: string;
}
