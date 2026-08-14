import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({ example: '1', description: '验证码下发id' })
  @IsNotEmpty({ message: '缺少必要参数！' })
  id: number;

  @ApiProperty({ example: '15366754', description: '验证码' })
  @IsNotEmpty({ message: '验证码不能为空！' })
  @IsInt({ message: '验证码必须是数字' })
  @Min(100000, { message: '验证码必须为6位数字' })
  @Max(999999, { message: '验证码必须为6位数字' })
  code: number;
}
