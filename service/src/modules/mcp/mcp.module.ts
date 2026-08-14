import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { RedisCacheModule } from '../redisCache/redisCache.module';
import { MCPController } from './mcp.controller';
import { MCPConfigEntity } from './mcp.entity';
import { MCPService } from './mcp.service';
import { McpToolService } from './mcpTool.service';

@Module({
  imports: [TypeOrmModule.forFeature([MCPConfigEntity]), GlobalConfigModule, RedisCacheModule],
  controllers: [MCPController],
  providers: [MCPService, McpToolService],
  exports: [MCPService, McpToolService],
})
export class MCPModule {}
