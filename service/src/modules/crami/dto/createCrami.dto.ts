import { IsOptional, IsNumber, Max, Min, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatCramiDto {
  @ApiProperty({ example: 1, description: '套餐类型', required: true })
  @IsNumber({}, { message: '套餐类型必须是number' })
  @IsOptional()
  packageId: number;

  @ApiProperty({ example: 1, description: '单次生成卡密数量' })
  @IsNumber({}, { message: '创建卡密的张数数量' })
  @Max(50, { message: '单次创建卡密的张数数量不能超过50张' })
  @Min(1, { message: '单次创建卡密的张数数量不能少于1张' })
  @IsOptional()
  count: number;

  @ApiProperty({ example: 0, description: '卡密携带模型3额度' })
  @IsNumber({}, { message: '卡密携带的余额必须是number' })
  @IsOptional()
  model3Count: number;

  @ApiProperty({ example: 100, description: '卡密携带模型4额度' })
  @IsNumber({}, { message: '卡密携带额度类型必须是number' })
  @IsOptional()
  model4Count: number;

  @ApiProperty({ example: 3, description: '卡密携带MJ绘画额度' })
  @IsNumber({}, { message: '卡密携带额度类型必须是number' })
  @IsOptional()
  drawMjCount: number;

  @ApiProperty({ example: 1, description: '卡密类型：1-单次使用 | 2-多次可复用', required: false })
  @IsNumber({}, { message: '卡密类型必须是number' })
  @IsOptional()
  cramiType: number;

  @ApiProperty({
    example: 10,
    description: '最大使用次数（0=不限制，仅多次可复用时有效）',
    required: false,
  })
  @IsNumber({}, { message: '最大使用次数必须是number' })
  @IsOptional()
  maxUseCount: number;

  @ApiProperty({ example: 0, description: '过期天数（0=永久有效，从创建时计算）', required: false })
  @IsNumber({}, { message: '过期天数必须是number' })
  @IsOptional()
  expireDays: number;

  @ApiProperty({
    example: '2025-12-31',
    description: '过期日期（指定具体日期，优先级高于expireDays）',
    required: false,
  })
  @IsString()
  @IsOptional()
  expireDate: string;
}
