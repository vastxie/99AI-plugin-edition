import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/user.entity';
import { BadWordsController } from './badWords.controller';
import { BadWordsService } from './badWords.service';
import { ViolationLogEntity } from './violationLog.entity';
import { WhitelistEntity } from './whitelist.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ViolationLogEntity, UserEntity, WhitelistEntity])],
  providers: [BadWordsService],
  controllers: [BadWordsController],
  exports: [BadWordsService],
})
export class BadWordsModule {}
