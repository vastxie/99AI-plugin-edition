import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginController } from './plugin.controller';
import { PluginEntity } from './plugin.entity';
import { PluginService } from './plugin.service';
import { ModelsEntity } from '../models/models.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PluginEntity, ModelsEntity])],
  controllers: [PluginController],
  providers: [PluginService],
  exports: [PluginService],
})
export class PluginModule {}
