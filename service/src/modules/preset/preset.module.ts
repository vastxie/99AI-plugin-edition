import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresetService } from './preset.service';
import { PresetController } from './preset.controller';
import { PresetEntity } from './preset.entity';
import { AppEntity } from '../app/app.entity';
import { PluginEntity } from '../plugin/plugin.entity';
import { PresetCategoryModule } from '../presetCategory/presetCategory.module';
import { PresetCategoryEntity } from '../presetCategory/presetCategory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PresetEntity, AppEntity, PluginEntity, PresetCategoryEntity]),
    PresetCategoryModule,
  ],
  controllers: [PresetController],
  providers: [PresetService],
  exports: [PresetService],
})
export class PresetModule {}
