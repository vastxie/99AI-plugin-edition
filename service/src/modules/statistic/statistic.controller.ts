import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryStatisticDto } from './dto/queryStatisticDto.dto';
import { StatisticService } from './statistic.service';

@ApiTags('statistic')
@Controller('statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) {}

  @Get('base')
  @ApiOperation({ summary: '获取基础统计数据' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getBaseStatistic() {
    return this.statisticService.getBaseStatistic();
  }

  @Get('chatStatistic')
  @ApiOperation({ summary: '获取聊天绘画统计数据' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getChatStatistic(@Query() params: QueryStatisticDto) {
    return this.statisticService.getChatStatistic(params);
  }

  @Get('baiduVisit')
  @ApiOperation({ summary: '获取百度统计数据' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getBaiduStatistics(@Query() params: QueryStatisticDto) {
    return this.statisticService.getBaiduVisit(params);
  }

  @Get('orderStatistic')
  @ApiOperation({ summary: '获取订单统计数据' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getOrderStatistic(@Query() params: QueryStatisticDto) {
    return this.statisticService.getOrderStatistic(params);
  }
}
