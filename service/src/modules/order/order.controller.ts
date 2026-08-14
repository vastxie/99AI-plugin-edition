import { SuperAuthGuard } from './../../common/auth/superAuth.guard';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { Request } from 'express';
import { BuyV2Dto } from './dto/buyV2.dto';
import { QueryByOrderIdDto } from './dto/queryByOrder.dto';
import { QuerAllOrderDto } from './dto/queryAllOrder.dto';

@ApiTags('Order')
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /* 购买商品V2 - 支持新支付方式 */
  @Post('buyV2')
  @ApiOperation({ summary: '购买商品V2 - 支持新支付方式' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async buyV2(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: BuyV2Dto,
    @Req() req: Request,
  ) {
    return this.orderService.buyV2(body, req);
  }

  /* 查询订单状态 */
  @Get('queryByOrderId')
  @ApiOperation({ summary: '查询订单' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async queryByOrderId(@Req() req: Request, @Query() query: QueryByOrderIdDto) {
    const { id: userId } = req.user;
    return this.orderService.queryByOrderId(req, query);
  }

  /* 查询所有订单 */
  @Get('queryAll')
  @ApiOperation({ summary: '查询所有订单' })
  @UseGuards(SuperAuthGuard)
  async queryAllOrder(@Query() query: QuerAllOrderDto) {
    return this.orderService.queryAllOrder(query);
  }

  /* 删除订单 */
  @Post('delete')
  @ApiOperation({ summary: '删除订单' })
  @UseGuards(SuperAuthGuard)
  async deleteOrder(@Body() body: QueryByOrderIdDto) {
    return this.orderService.deleteOrder(body);
  }

  /* 删除订单 */
  @Post('deleteNotPay')
  @ApiOperation({ summary: '删除未支付订单' })
  @UseGuards(SuperAuthGuard)
  async deleteNotPay() {
    return this.orderService.deleteNotPay();
  }
}
