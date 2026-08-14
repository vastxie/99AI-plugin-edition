import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendCodeDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱或手机号' })
  @IsString({ message: '联系方式必须是字符串' })
  @IsNotEmpty({ message: '联系方式不能为空' })
  @MinLength(3, { message: '联系方式长度不能少于3位' })
  @MaxLength(128, { message: '联系方式长度不能超过128位' })
  contact: string;

  @ApiPropertyOptional({ example: true, description: '是否登录场景' })
  @IsOptional()
  @IsBoolean({ message: 'isLogin 必须是布尔值' })
  isLogin?: boolean;

  @ApiPropertyOptional({ example: true, description: '是否密码重置场景' })
  @IsOptional()
  @IsBoolean({ message: 'isReset 必须是布尔值' })
  isReset?: boolean;
}
