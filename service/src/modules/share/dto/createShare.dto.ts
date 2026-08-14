import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateShareDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024 * 1024)
  htmlContent?: string;
}
