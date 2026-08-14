import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FormatCustomConfigDto {
  @ApiProperty({
    example:
      '提交地址:/v1/videos 查询地址:/v1/videos/{id} 响应字段:task_id,status,data.output 支持文生视频和图生视频',
    description: '用户输入的杂乱参数描述',
  })
  @IsString()
  @IsNotEmpty({ message: '配置描述不能为空' })
  description: string;
}
