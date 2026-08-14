import { forwardRef, Global, Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsEntity } from './models.entity';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
// import { ModelsTypeEntity } from './modelType.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ModelsEntity]),
    forwardRef(() => GlobalConfigModule),
    RedisCacheModule,
  ],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
