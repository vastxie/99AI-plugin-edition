import { Module } from '@nestjs/common';
import { ChatLogModule } from '../../chatLog/chatLog.module';
import { GlobalConfigModule } from '../../globalConfig/globalConfig.module';
import { UploadModule } from '../../upload/upload.module';
import { UnifiedCreativeService } from './unifiedCreative.service';

@Module({
  imports: [ChatLogModule, GlobalConfigModule, UploadModule],
  providers: [UnifiedCreativeService],
  exports: [UnifiedCreativeService],
})
export class UnifiedCreativeModule {}
