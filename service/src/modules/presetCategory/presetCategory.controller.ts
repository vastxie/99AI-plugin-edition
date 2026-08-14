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
  Logger,
} from '@nestjs/common';
import { PresetCategoryService } from './presetCategory.service';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('预设分类')
@Controller('preset-category')
export class PresetCategoryController {
  private readonly logger = new Logger(PresetCategoryController.name);
  constructor(private readonly presetCategoryService: PresetCategoryService) {}

  @Get()
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有预设分类' })
  async findAll(
    @Query('page') page: string,
    @Query('size') size: string,
    @Query('name') name: string,
  ) {
    try {
      this.logger.debug(`Query preset categories: page=${page}, size=${size}, name=${name}`);

      const result = await this.presetCategoryService.findAll({
        page: page ? parseInt(page) : undefined,
        size: size ? parseInt(size) : undefined,
        name,
      });

      const count = Array.isArray(result) ? result.length : result.rows?.length || 0;
      this.logger.debug(`Found ${count} categories`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to query preset categories: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取单个预设分类' })
  async findOne(@Param('id') id: string) {
    return this.presetCategoryService.findOne(+id);
  }

  @Post()
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建预设分类' })
  async create(@Body() data: any) {
    return this.presetCategoryService.create(data);
  }

  @Patch(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新预设分类' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.presetCategoryService.update(+id, data);
  }

  @Delete(':id')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除预设分类' })
  async remove(@Param('id') id: string) {
    return this.presetCategoryService.remove(+id);
  }

  @Post('update-order')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量更新排序' })
  async updateOrder(@Body() orders: { id: number; order: number }[]) {
    return this.presetCategoryService.updateOrder(orders);
  }
}
