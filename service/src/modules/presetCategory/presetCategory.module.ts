import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresetCategoryService } from './presetCategory.service';
import { PresetCategoryController } from './presetCategory.controller';
import { PresetCategoryEntity } from './presetCategory.entity';
import { PresetEntity } from '../preset/preset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PresetCategoryEntity, PresetEntity])],
  controllers: [PresetCategoryController],
  providers: [PresetCategoryService],
  exports: [PresetCategoryService],
})
export class PresetCategoryModule {}
