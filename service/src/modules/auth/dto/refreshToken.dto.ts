import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh_token_string', description: '刷新Token' })
  @IsNotEmpty({ message: '刷新Token不能为空' })
  @IsString({ message: '刷新Token必须是字符串' })
  refreshToken: string;
}
