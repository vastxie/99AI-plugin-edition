import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PresetService } from './preset.service';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('预设')
@Controller('preset')
export class PresetController {
  constructor(private readonly presetService: PresetService) {}

  @Get()
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取预设列表' })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('isEnabled') isEnabled?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.presetService.findAll({
      categoryId: categoryId ? +categoryId : undefined,
      isEnabled: isEnabled ? isEnabled === 'true' : undefined,
      keyword,
      page: page ? +page : 1,
      size: size ? +size : 10,
    });
  }

  @Get('user-presets')
  @ApiOperation({ summary: '获取用户可见预设' })
  async getUserPresets() {
    return this.presetService.getUserPresets();
  }

  @Get('search-apps')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索应用' })
  async searchApps(@Query('keyword') keyword: string) {
    return this.presetService.searchApps(keyword);
  }

  @Get('search-plugins')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索插件' })
  async searchPlugins(@Query('keyword') keyword: string) {
    return this.presetService.searchPlugins(keyword);
  }

  @Get('search-app-plugin')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '统一搜索应用和插件' })
  async searchAppAndPlugin(@Query('keyword') keyword: string, @Query('type') type: string) {
    return this.presetService.searchAppAndPlugin(keyword, type);
  }

  @Get(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取单个预设' })
  async findOne(@Param('id') id: string) {
    return this.presetService.findOne(+id);
  }

  @Post()
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建预设' })
  async create(@Body() data: any) {
    return this.presetService.create(data);
  }

  @Patch(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新预设' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.presetService.update(+id, data);
  }

  @Delete(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除预设' })
  async remove(@Param('id') id: string) {
    return this.presetService.remove(+id);
  }

  @Post('update-order')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量更新排序' })
  async updateOrder(@Body() orders: { id: number; order: number }[]) {
    return this.presetService.updateOrder(orders);
  }

  @Post(':id/increment-usage')
  @ApiOperation({ summary: '增加使用次数' })
  async incrementUsage(@Param('id') id: string) {
    return this.presetService.incrementUsage(+id);
  }
}
