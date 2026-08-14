import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareController } from './share.controller';
import { Share } from './share.entity';
import { ShareService } from './share.service';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Share, ChatLogEntity, ChatGroupEntity])],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
