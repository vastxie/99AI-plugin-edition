import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyIdentityDto {
  @ApiProperty({ example: '张三', description: '真实姓名' })
  @IsString({ message: '姓名必须是字符串' })
  @IsNotEmpty({ message: '姓名不能为空' })
  @MinLength(1, { message: '姓名不能为空' })
  @MaxLength(64, { message: '姓名长度不能超过64位' })
  name: string;

  @ApiProperty({ example: '110101199001011234', description: '身份证号' })
  @IsString({ message: '身份证号必须是字符串' })
  @IsNotEmpty({ message: '身份证号不能为空' })
  @MinLength(4, { message: '身份证号长度不能少于4位' })
  @MaxLength(32, { message: '身份证号长度不能超过32位' })
  idCard: string;
}
