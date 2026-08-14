import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsIn, IsNumber, IsOptional } from 'class-validator';

export class CreatePackageDto {
  @ApiProperty({
    example: '基础套餐100次卡',
    description: '套餐名称',
    required: true,
  })
  @IsDefined({ message: '套餐名称是必传参数' })
  name: string;

  @ApiProperty({
    example:
      '这是一个100次对话余额的套餐，我们将为您额外赠送3次绘画余额，活动期间，我们将在套餐基础上额外赠送您十次对话余额和1次绘画余额',
    description: '套餐详情描述',
    required: true,
  })
  @IsDefined({ message: '套餐描述是必传参数' })
  des: string;

  @ApiProperty({ example: 7, default: 0, description: '套餐等级设置' })
  @IsNumber({}, { message: '套餐等级权重必须为数字' })
  weight: number;

  @ApiProperty({ example: 'https://xxxx.png', description: '套餐封面图片' })
  @IsOptional()
  coverImg: string;

  @ApiProperty({ example: 99.99, description: '套餐价格(CNY)', required: true })
  @Transform(({ value }) => parseFloat(value))
  price: number;

  @ApiProperty({ example: 9.99, description: '套餐价格(USD)', required: false })
  @Transform(({ value }) => {
    // 处理空值：null、undefined、空字符串都转为 null
    if (value === null || value === undefined || value === '') {
      return null;
    }
    // 尝试转换为数字
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  })
  @IsOptional()
  priceUsd?: number;

  @ApiProperty({ example: 100, description: '套餐排序、数字越大越靠前' })
  @IsOptional()
  order?: number;

  @ApiProperty({
    example: 1,
    description: '套餐状态 0：禁用 1：启用',
    required: true,
  })
  @IsNumber({}, { message: '套餐状态必须是Number' })
  @IsIn([0, 1], { message: '套餐状态错误' })
  status: number;

  @ApiProperty({
    example: 7,
    default: 0,
    description: '套餐有效期 -1为永久不过期',
  })
  @IsNumber({}, { message: '套餐有效期天数类型必须是number' })
  days: number;

  @ApiProperty({ example: 1000, default: 0, description: '模型3对话次数' })
  @IsNumber({}, { message: '模型3对话次数必须是number类型' })
  model3Count: number;

  @ApiProperty({ example: 10, default: 0, description: '模型4对话次数' })
  @IsNumber({}, { message: '模型4对话次数必须是number类型' })
  model4Count: number;

  @ApiProperty({ example: 10, default: 0, description: 'MJ绘画次数' })
  @IsNumber({}, { message: 'MJ绘画次数必须是number类型' })
  drawMjCount: number;

  @ApiProperty({ example: '1,2,3', description: '套餐包含的应用分类' })
  @IsOptional()
  appCats?: string;
}
