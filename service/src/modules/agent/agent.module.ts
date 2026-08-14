import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileVectorSearchService } from '../aiTool/search/fileVectorSearch.service';
import { FileVectorCacheService } from '../aiTool/search/fileVectorCache.service';
import { FileVectorCacheEntity } from '../aiTool/search/fileVectorCache.entity';
import { FileVectorCacheSchedule } from '../aiTool/search/fileVectorCache.schedule';
import { FileVectorCacheController } from '../aiTool/search/fileVectorCache.controller';
import { NetSearchService } from '../aiTool/search/netSearch.service';
import { ChatLogModule } from '../chatLog/chatLog.module';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { MCPModule } from '../mcp/mcp.module';
import { ModelsModule } from '../models/models.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { AgentService } from './agent.service';
import { NodeExecutor } from './core/NodeExecutor.service';
import { WorkflowEngine } from './core/WorkflowEngine.service';
import { EndNode } from './nodes/EndNode';
import { FileVectorSearchNode } from './nodes/FileVectorSearchNode';
import { FlowithNode } from './nodes/FlowithNode';
import { ImageAnalysisNode } from './nodes/ImageAnalysisNode';
import { LLMNode } from './nodes/LLMNode';
import { UnifiedPPTNode } from './nodes/UnifiedPPTNode';
import { UnifiedToolNode } from './nodes/UnifiedToolNode';
import { QuestionGeneratorNode } from './nodes/QuestionGeneratorNode';
import { SensitiveFilterNode } from './nodes/SensitiveFilterNode';
import { ThinkingNode } from './nodes/ThinkingNode';
import { DocumentEditNode } from './nodes/DocumentEditNode';
import { EditDecisionService } from '../chat/editDecision.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([FileVectorCacheEntity]),
    GlobalConfigModule,
    ModelsModule,
    ChatLogModule,
    MCPModule,
    RedisCacheModule,
  ],
  controllers: [FileVectorCacheController],
  providers: [
    AgentService,
    WorkflowEngine,
    NodeExecutor,
    LLMNode,
    ThinkingNode,
    SensitiveFilterNode,
    QuestionGeneratorNode,
    FileVectorSearchNode,
    ImageAnalysisNode,
    UnifiedToolNode,
    UnifiedPPTNode,
    EndNode,
    FlowithNode,
    DocumentEditNode,
    EditDecisionService,
    NetSearchService,
    FileVectorSearchService,
    FileVectorCacheService,
    FileVectorCacheSchedule,
  ],
  exports: [AgentService],
})
export class AgentModule {}
