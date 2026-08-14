import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAuthGuard } from '../../common/auth/superAuth.guard';
import { CreateMcpConfigDto } from './dto/createMcpConfig.dto';
import { UpdateMcpConfigDto } from './dto/updateMcpConfig.dto';
import { MCPService } from './mcp.service';
@ApiTags('model-context-protocol')
@Controller('model-context-protocol')
@UseGuards(SuperAuthGuard)
export class MCPController {
  constructor(private readonly mcpService: MCPService) {}

  @Get()
  @ApiOperation({ summary: '获取所有MCP配置' })
  @ApiBearerAuth()
  queryMcpConfig() {
    return this.mcpService.queryMcpConfig();
  }

  @Post()
  @ApiOperation({ summary: '创建MCP配置' })
  @ApiBearerAuth()
  createConfig(@Body() body: CreateMcpConfigDto) {
    return this.mcpService.setMcpConfig(body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除MCP配置' })
  @ApiBearerAuth()
  deleteMcpConfig(@Param('id') id: number) {
    return this.mcpService.deleteMcpConfigById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新MCP配置' })
  @ApiBearerAuth()
  updateConfig(@Param('id') id: number, @Body() body: UpdateMcpConfigDto) {
    return this.mcpService.updateConfig(id, body);
  }
}
