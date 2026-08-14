import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { OpenAIChatService } from '../aiTool/chat/chat.service';
import { FlowithService } from '../aiTool/chat/flowith.service';
import { ChatDrawService } from '../aiTool/image/chatDraw.service';
import { CustomImageService } from '../aiTool/image/customImage.service';
import { GptImageService } from '../aiTool/image/gptImage.service';
import { SunoService } from '../aiTool/music/suno.service';
import { AiPptService } from '../aiTool/other/aiPPT';
import { FileVectorCacheEntity } from '../aiTool/search/fileVectorCache.entity';
import { FileVectorCacheService } from '../aiTool/search/fileVectorCache.service';
import { FileVectorSearchService } from '../aiTool/search/fileVectorSearch.service';
import { NetSearchService } from '../aiTool/search/netSearch.service';
import { CustomVideoService } from '../aiTool/video/customVideo.service';
import { UnifiedCreativeModule } from '../aiTool/unifiedCreative/unifiedCreative.module';
import { AppEntity } from '../app/app.entity';
import { AppService } from '../app/app.service';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { AutoReplyEntity } from '../autoReply/autoReply.entity';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { ViolationLogEntity } from '../badWords/violationLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ChatLogService } from '../chatLog/chatLog.service';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { MCPModule } from '../mcp/mcp.module';
import { ModelsEntity } from '../models/models.entity';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UploadService } from '../upload/upload.service';
import { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { VerificationEntity } from '../verification/verification.entity';
import { VerificationService } from '../verification/verification.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { EditDecisionService } from './editDecision.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BalanceEntity,
      UserEntity,
      PluginEntity,
      VerificationEntity,
      ChatLogEntity,
      AccountLogEntity,
      ConfigEntity,
      UserEntity,
      CramiPackageEntity,
      ChatGroupEntity,
      AppEntity,
      UserBalanceEntity,
      FingerprintLogEntity,
      AppCatsEntity,
      UserAppsEntity,
      AutoReplyEntity,
      ViolationLogEntity,
      ModelsEntity,
      FileVectorCacheEntity,
    ]),
    MCPModule,
    AgentModule,
    UnifiedCreativeModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    UserBalanceService,
    UserService,
    VerificationService,
    ChatLogService,
    RedisCacheService,
    MailerService,
    UploadService,
    AutoReplyService,
    ChatGroupService,
    ModelsService,
    SunoService,
    OpenAIChatService,
    AiPptService,
    NetSearchService,
    AppService,
    ChatDrawService,
    FlowithService,
    FileVectorCacheService,
    FileVectorSearchService,
    GptImageService,
    CustomImageService,
    CustomVideoService,
    EditDecisionService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
