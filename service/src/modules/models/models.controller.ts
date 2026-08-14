import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FormatCustomConfigDto } from './dto/formatCustomConfig.dto';
import { QueryModelDto } from './dto/queryModel.dto';
import { QueryModelTypeDto } from './dto/queryModelType.dto';
import { SetModelDto } from './dto/setModel.dto';
import { SetModelTypeDto } from './dto/setModelType.dto';
import { ModelsService } from './models.service';

@ApiTags('models')
@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Post('setModel')
  @ApiOperation({ summary: '设置模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModel(@Body() params: SetModelDto) {
    return this.modelsService.setModel(params);
  }

  @Post('delModel')
  @ApiOperation({ summary: '删除模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModel(@Body() params: { id: number }) {
    return this.modelsService.delModel(params);
  }

  @Get('query')
  @ApiOperation({ summary: '管理端查询模型列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  queryModels(@Req() req: Request, @Query() params: QueryModelDto) {
    return this.modelsService.queryModels(req, params);
  }

  @Get('list')
  @ApiOperation({ summary: '客户端查询当前所有可以使用的模型' })
  modelsList() {
    return this.modelsService.modelsList();
  }

  @Get('baseConfig')
  @ApiOperation({ summary: '客户端查询当前已经配置模型的基础配置' })
  baseConfig() {
    return this.modelsService.getBaseConfig();
  }

  @Get('queryModelType')
  @ApiOperation({ summary: '查询模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  queryModelType(@Query() params: QueryModelTypeDto) {
    return this.modelsService.queryModelType(params);
  }

  @Post('setModelType')
  @ApiOperation({ summary: '创建修改模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModelType(@Body() params: SetModelTypeDto) {
    return this.modelsService.setModelType(params);
  }

  @Post('delModelType')
  @ApiOperation({ summary: '删除模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModelType(@Body() params: { id: number }) {
    return this.modelsService.delModelType(params);
  }

  @Post('formatCustomConfig')
  @ApiOperation({ summary: 'AI智能格式化自定义配置' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  formatCustomConfig(@Body() params: FormatCustomConfigDto) {
    return this.modelsService.formatCustomConfig(params);
  }

  @Get('drawingModels')
  @ApiOperation({ summary: '查询所有图片生成模型（keyType=2）' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getDrawingModels() {
    return this.modelsService.getDrawingModels();
  }
}
