import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

interface KeyValue {
  configKey: string;
  configVal: any;
  infoKey: string;
}

export class SetConfigCustomDto {
  @ApiProperty({
    example: {
      configKey: 'siteName',
      configVal: '99AI Plugin Edition',
      infoKey: '99AI Plugin Edition',
    },
    description: '设置更新配置信息',
  })
  @ValidateNested({ each: true })
  @Type(() => Object)
  settings: KeyValue;
}
