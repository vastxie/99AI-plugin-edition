import { Global, Module } from '@nestjs/common';
import { ChatGroupController } from './chatGroup.controller';
import { ChatGroupService } from './chatGroup.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './chatGroup.entity';
import { AppModule } from '../app/app.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChatGroupEntity]), AppModule],
  controllers: [ChatGroupController],
  providers: [ChatGroupService],
  exports: [ChatGroupService],
})
export class ChatGroupModule {}
