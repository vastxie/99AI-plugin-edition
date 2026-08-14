import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseCleanupService } from './cleanup.service';

@ApiTags('Database')
@UseGuards(SuperAuthGuard)
@Controller('database')
export class DatabaseController {
  constructor(private readonly cleanupService: DatabaseCleanupService) {}

  /**
   * 检测未使用的表
   */
  @Get('detect-unused')
  @ApiOperation({ summary: '检测未使用的数据库表' })
  async detectUnused() {
    try {
      const unusedTables = await this.cleanupService.detectUnusedTables();
      return {
        code: 200,
        data: { unusedTables },
        success: true,
        message: `检测到 ${unusedTables.length} 个未使用的表`,
      };
    } catch (error) {
      return {
        code: 500,
        data: null,
        success: false,
        message: `检测失败: ${error.message}`,
      };
    }
  }

  /**
   * 删除指定的表
   * 只应由前端"检测未使用表"流程调用，核心表受后端 denylist 保护。
   */
  @Post('drop-tables')
  @ApiOperation({ summary: '删除指定的表' })
  async dropTables(@Body('tableNames') tableNames: string[]) {
    if (!tableNames || tableNames.length === 0) {
      return {
        code: 400,
        data: null,
        success: false,
        message: '请指定要删除的表名',
      };
    }

    try {
      const result = await this.cleanupService.dropTables(tableNames);
      const hasFailures = result.failed.length > 0;

      return {
        code: hasFailures ? 207 : 200,
        data: result,
        success: result.dropped.length > 0,
        message: `删除完成: 成功 ${result.dropped.length} 个,失败 ${result.failed.length} 个`,
      };
    } catch (error) {
      return {
        code: 500,
        data: null,
        success: false,
        message: `删除失败: ${error.message}`,
      };
    }
  }
}
