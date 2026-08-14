import { createOrderId } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { In, Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { PayService } from '../pay/pay.service';
import { UserEntity } from './../user/user.entity';
import { BuyDto } from './dto/buy.dto';
import { BuyV2Dto } from './dto/buyV2.dto';
import { QuerAllOrderDto } from './dto/queryAllOrder.dto';
import { QueryByOrderIdDto } from './dto/queryByOrder.dto';
import { OrderEntity } from './order.entity';

@Injectable()
export class OrderService {
  private readonly defaultUsdExchangeRate = 7.3;

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly payService: PayService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /* 购买商品 - 新版支持多支付方式 */
  async buyV2(params: BuyV2Dto, req: Request) {
    try {
      const { goodsId, count = 1, method, device = 'pc' } = params;
      const { id: userId } = req.user;

      if (userId > 1000000) {
        throw new HttpException('请先注册账号后购买商品！', HttpStatus.UNAUTHORIZED);
      }

      // 创建订单（使用新的创建方法）
      const order = await this.createV2(userId, goodsId, count, method);

      // 调用新的支付方法
      const res = await this.payService.payV2(userId, order.orderId, method as any, device);

      // 获取可用的支付方式列表
      const availableMethods = await this.payService.getAvailablePaymentMethods();

      const result = {
        ...res,
        orderId: order.orderId,
        paymentMethod: method,
        total: order.total,
        availableMethods,
      };

      // 如果是易支付或支付宝官方，根据配置决定是否启动后端轮询
      if (order.payPlatform === 'epay' || order.payPlatform === 'alipay_official') {
        const shouldEnablePolling = await this.shouldEnablePolling(order.payPlatform);
        if (shouldEnablePolling) {
          Logger.log(
            `启动订单轮询: ${order.orderId}, 支付平台: ${order.payPlatform}`,
            'OrderService',
          );
          this.startOrderPolling(order.orderId);
        } else {
          Logger.log(
            `跳过订单轮询（已禁用）: ${order.orderId}, 支付平台: ${order.payPlatform}`,
            'OrderService',
          );
        }
      }

      return result;
    } catch (error) {
      // 保持原始错误状态码
      if (error.status) {
        throw new HttpException(error.message || '购买失败', error.status);
      }

      // 默认返回BAD_REQUEST，提供友好提示
      throw new HttpException(
        error.message || '购买失败，请稍后重试或联系客服',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 订单轮询任务管理
  private pollingTasks: Map<string, NodeJS.Timeout> = new Map();

  /* 检查是否启用轮询 */
  private async shouldEnablePolling(payPlatform: string): Promise<boolean> {
    try {
      let configKey: string;
      if (payPlatform === 'epay') {
        configKey = 'payEpayEnablePolling';
      } else if (payPlatform === 'alipay_official') {
        configKey = 'alipayEnablePolling';
      } else {
        return false;
      }

      // getConfigs 单个键时直接返回值，不是对象
      const enablePolling = await this.globalConfigService.getConfigs([configKey]);

      Logger.log(
        `[轮询配置检查] 支付平台: ${payPlatform}, 配置键: ${configKey}, 配置值: ${
          enablePolling === undefined
            ? 'undefined'
            : enablePolling === null
            ? 'null'
            : `'${enablePolling}'`
        }`,
        'OrderService',
      );

      // 如果配置不存在或为空，默认启用（保持向后兼容）
      if (!enablePolling) {
        Logger.log(
          `[轮询配置检查] 配置为空，默认启用轮询，支付平台: ${payPlatform}`,
          'OrderService',
        );
        return true;
      }

      const shouldEnable = enablePolling === '1';
      Logger.log(
        `[轮询配置检查] 最终决策: ${shouldEnable ? '启用' : '禁用'}轮询，支付平台: ${payPlatform}`,
        'OrderService',
      );

      return shouldEnable;
    } catch (error) {
      // 配置读取失败时，默认启用轮询（保守策略）
      Logger.warn(
        `[轮询配置检查] 读取配置失败，默认启用，支付平台: ${payPlatform}, 错误: ${error.message}`,
        'OrderService',
      );
      return true;
    }
  }

  /* 启动订单轮询 - 分阶段轮询策略 */
  private startOrderPolling(orderId: string) {
    // 如果已经有轮询任务，先清除
    if (this.pollingTasks.has(orderId)) {
      clearTimeout(this.pollingTasks.get(orderId));
      this.pollingTasks.delete(orderId);
    }

    let pollCount = 0;
    const startTime = Date.now();

    const poll = async () => {
      pollCount++;
      const elapsed = Date.now() - startTime;

      Logger.debug(
        `订单轮询 #${pollCount}: ${orderId}, 已耗时: ${Math.floor(elapsed / 1000)}秒`,
        'OrderService',
      );

      try {
        const order = await this.orderEntity.findOne({
          where: { orderId },
        });

        if (!order) {
          this.stopOrderPolling(orderId);
          return;
        }

        // 如果订单已支付，停止轮询
        if (order.status !== 0) {
          this.stopOrderPolling(orderId);
          return;
        }

        // 如果是易支付，主动查询
        if (order.payPlatform === 'epay') {
          const epayResult = await this.payService.queryEpay(orderId);

          const isEpaySuccess =
            epayResult &&
            (epayResult.status === '1' ||
              epayResult.status === 1 ||
              epayResult.trade_status === 'TRADE_SUCCESS' ||
              epayResult.trade_status === 'TRADE_FINISHED');
          if (isEpaySuccess) {
            await this.payService.handlePolledEpayOrderPaid(orderId, epayResult);
            this.stopOrderPolling(orderId);
            return;
          }
        }

        // 如果是支付宝官方，主动查询
        if (order.payPlatform === 'alipay_official') {
          const alipayResult = await this.payService.queryAlipay(orderId);

          if (alipayResult && alipayResult.status === 'TRADE_SUCCESS') {
            await this.payService.handlePolledAlipayOrderPaid(orderId, alipayResult);
            this.stopOrderPolling(orderId);
            return;
          }
        }

        // 分阶段轮询策略
        let nextInterval: number;
        if (elapsed < 30 * 1000) {
          // 前30秒：1秒查询1次
          nextInterval = 1000;
        } else if (elapsed < 2 * 60 * 1000) {
          // 30秒-2分钟：3秒查询1次
          nextInterval = 3000;
        } else if (elapsed < 5 * 60 * 1000) {
          // 2-5分钟：5秒查询1次
          nextInterval = 5000;
        } else {
          // 超过5分钟，停止轮询
          this.stopOrderPolling(orderId);
          return;
        }

        // 设置下次轮询
        const pollTask = setTimeout(() => poll(), nextInterval);
        this.pollingTasks.set(orderId, pollTask);
      } catch (error) {
        Logger.error(`订单轮询查询失败: ${orderId}`, error.stack, 'OrderService');

        // 检查是否已经超时，避免无限轮询
        const currentElapsed = Date.now() - startTime;
        if (currentElapsed >= 5 * 60 * 1000) {
          Logger.warn(
            `订单轮询超时停止: ${orderId}, 总耗时: ${Math.floor(currentElapsed / 1000)}秒`,
            'OrderService',
          );
          this.stopOrderPolling(orderId);
          return;
        }

        // 出错后继续轮询，但限制重试次数
        const pollTask = setTimeout(() => poll(), 3000);
        this.pollingTasks.set(orderId, pollTask);
      }
    };

    // 立即执行第一次查询
    poll();
  }

  /* 停止订单轮询 */
  private stopOrderPolling(orderId: string) {
    const task = this.pollingTasks.get(orderId);
    if (task) {
      clearTimeout(task);
      this.pollingTasks.delete(orderId);
    }
  }

  /* 查询订单状态 */
  async queryByOrderId(req: Request, params: QueryByOrderIdDto) {
    const { id: userId } = req.user;
    const { orderId } = params;

    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) {
      throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    }

    return order;
  }

  /* 创建订单 - 新版 */
  async createV2(userId: number, goodsId: number, count: number, paymentMethod: string) {
    // 查询商品
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: goodsId, status: 1 },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    // 获取支付配置，确定使用的渠道
    const paymentConfig = await this.globalConfigService.getPaymentConfig();

    let payPlatform: string;
    if (paymentMethod === 'wechat') {
      if (!paymentConfig.wechat.enabled) {
        throw new HttpException('微信支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.wechat.configured) {
        throw new HttpException('微信支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      payPlatform = paymentConfig.wechat.channel;
    } else if (paymentMethod === 'alipay') {
      if (!paymentConfig.alipay.enabled) {
        throw new HttpException('支付宝支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.alipay.configured) {
        throw new HttpException('支付宝支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      payPlatform = paymentConfig.alipay.channel;
    } else if (paymentMethod === 'paypal') {
      if (!paymentConfig.paypal?.enabled) {
        throw new HttpException('PayPal支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.paypal.configured) {
        throw new HttpException('PayPal支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      payPlatform = paymentConfig.paypal.channel;
    } else if (paymentMethod === 'stripe') {
      if (!paymentConfig.stripe?.enabled) {
        throw new HttpException('Stripe payment not enabled!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.stripe.configured) {
        throw new HttpException('Stripe支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      payPlatform = paymentConfig.stripe.channel;
    } else {
      throw new HttpException('Unsupported payment method!', HttpStatus.BAD_REQUEST);
    }

    const total = Number((Number(goods.price) * count).toFixed(2));

    // 组装订单数据
    const orderData = {
      orderId: createOrderId(),
      userId,
      goodsId,
      price: Number(goods.price),
      count,
      total,
      payPlatform, // 存储实际使用的支付渠道
      channel: paymentMethod, // 存储支付方式（wechat/alipay）
    };

    // 创建订单
    const order = await this.orderEntity.save(orderData);
    Logger.debug(`订单创建成功 - 订单ID: ${order.orderId}`, 'OrderService');
    return order;
  }

  async query(userId: number, page: number, size: number) {
    // query goods
    return await this.orderEntity.findAndCount({
      where: { userId },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  /* 游标分页查询用户订单 - 性能优化版本 */
  async queryCursor(
    userId: number,
    cursor?: number,
    size: number = 10,
    direction: string = 'next',
  ) {
    let queryBuilder = this.orderEntity
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.cramiPackage', 'goods')
      .where('order.userId = :userId', { userId })
      .orderBy('order.id', 'DESC')
      .take(size + 1);

    if (cursor) {
      if (direction === 'next') {
        queryBuilder = queryBuilder.andWhere('order.id < :cursor', { cursor });
      } else if (direction === 'prev') {
        queryBuilder = queryBuilder.andWhere('order.id > :cursor', { cursor });
      }
    }

    const results = await queryBuilder.getMany();
    const hasMore = results.length > size;
    const items = hasMore ? results.slice(0, size) : results;

    return {
      items,
      hasMore,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      prevCursor: items.length > 0 ? items[0].id : null,
    };
  }

  /* 查询所有订单 */
  async queryAllOrder(params: QuerAllOrderDto) {
    const { page, size, userId, platform, status } = params;

    // 使用 QueryBuilder 进行 JOIN 查询，避免 N+1 问题
    let queryBuilder = this.orderEntity
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.cramiPackage', 'goods')
      .orderBy('order.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (userId) {
      queryBuilder = queryBuilder.andWhere('order.userId = :userId', { userId });
    }
    if (platform) {
      queryBuilder = queryBuilder.andWhere('order.payPlatform = :platform', { platform });
    }
    if (status !== undefined && status !== null && String(status) !== '') {
      queryBuilder = queryBuilder.andWhere('order.status = :status', { status });
    }

    const [orders, count] = await queryBuilder.getManyAndCount();

    // 直接从关联的对象获取数据
    const rows = orders.map((item: any) => ({
      ...item,
      userInfo: item.user
        ? {
            id: item.user.id,
            username: item.user.username,
            email: item.user.email,
          }
        : null,
      goodsInfo: item.cramiPackage
        ? {
            id: item.cramiPackage.id,
            name: item.cramiPackage.name,
            coverImg: item.cramiPackage.coverImg,
            des: item.cramiPackage.des,
          }
        : null,
    }));

    const totalPrice = await this.orderEntity
      .createQueryBuilder('order')
      .where('order.status = :status', { status: 1 })
      .select('SUM(order.total)', 'total_price')
      .getRawOne();

    return { rows, count, ...totalPrice };
  }

  /* 删除订单 */
  async deleteOrder(body: QueryByOrderIdDto) {
    const { orderId } = body;
    const o = await this.orderEntity.findOne({ where: { orderId } });
    if (!o) {
      throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    }
    return await this.orderEntity.delete({ orderId });
  }

  /* 删除未支付订单 */
  async deleteNotPay() {
    return await this.orderEntity.delete({ status: 0 });
  }
}
