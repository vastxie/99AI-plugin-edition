import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class BuyV2Dto {
  @ApiProperty({ example: 1, description: '要购买的套餐Id', required: true })
  @Type(() => Number)
  @IsInt({ message: '套餐Id必须为整数' })
  @Min(1, { message: '套餐Id无效' })
  goodsId: number;

  @ApiProperty({
    example: 'wechat',
    description: '支付方式 (wechat/alipay/paypal/stripe)',
    required: true,
  })
  @IsIn(['wechat', 'alipay', 'paypal', 'stripe'], { message: '不支持的支付方式' })
  method: string;

  @ApiProperty({ example: 1, description: '购买数量', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '购买数量必须为整数' })
  @Min(1, { message: '购买数量必须大于0' })
  @Max(999, { message: '单次购买数量不能超过999' })
  count?: number;

  @ApiProperty({
    example: 'pc',
    description: '设备类型 (pc/mobile/wechat/alipay/qq/jump)',
    required: false,
    default: 'pc',
  })
  @IsOptional()
  @IsIn(['pc', 'mobile', 'wechat', 'alipay', 'qq', 'jump'], { message: '不支持的设备类型' })
  device?: string;
}
