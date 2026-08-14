import { createRandomNonceStr } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { EpayPaymentHelper } from './epay-payment.helper';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { OrderEntity } from '../order/order.entity';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import {
  PaymentChannel,
  PaymentMethod,
  isMethodSupportedByChannel,
} from './payment-channel.config';
import { PayPalService } from './paypal/paypal.service';
import { StripeService } from './stripe/stripe.service';
import { AlipayService } from './alipay/alipay.service';

type WeChatPayVerifyMode = 'platform_cert' | 'wechatpay_public_key' | 'auto';

@Injectable()
export class PayService {
  constructor(
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly userService: UserService,
    public readonly payPalService: PayPalService,
    public readonly stripeService: StripeService,
    public readonly alipayService: AlipayService,
  ) {}

  private WxPay;

  private readonly defaultUsdExchangeRate = 7.3;

  private normalizePem(pem: string) {
    return String(pem || '')
      .replace(/\\n/g, '\n')
      .trim();
  }

  private getWeChatVerifyBody(params: object, rawBody?: Buffer | string) {
    if (Buffer.isBuffer(rawBody)) {
      return rawBody.toString('utf8');
    }
    if (typeof rawBody === 'string' && rawBody) {
      return rawBody;
    }
    return params;
  }

  private normalizeWeChatVerifyMode(mode?: string): WeChatPayVerifyMode {
    if (mode === 'wechatpay_public_key' || mode === 'auto') {
      return mode;
    }
    return 'platform_cert';
  }

  private shouldUseWeChatPayPublicKey(serial: string, mode: WeChatPayVerifyMode) {
    if (mode === 'wechatpay_public_key') {
      return true;
    }
    return mode === 'auto' && serial.startsWith('PUB_KEY_ID_');
  }

  private getTrustedPaymentOrigins(...urls: Array<string | undefined>) {
    const origins = new Set<string>();

    urls.forEach(rawUrl => {
      if (!rawUrl) return;
      try {
        const url = new URL(rawUrl);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          origins.add(url.origin);
        }
      } catch {
        // Ignore invalid configured URLs here; the payment request path will surface config errors.
      }
    });

    return Array.from(origins);
  }

  private verifyWeChatPayPublicKeySignature(params: {
    timestamp: string;
    nonce: string;
    body: object | string;
    signature: string;
    serial: string;
    publicKeyId?: string;
    publicKey?: string;
  }) {
    const { timestamp, nonce, body, signature, serial, publicKeyId, publicKey } = params;
    if (!publicKeyId || !publicKey) {
      Logger.warn('[微信官方回调] 微信支付公钥配置缺失，拒绝处理', 'PayService');
      return false;
    }
    if (serial !== publicKeyId) {
      Logger.warn('[微信官方回调] 微信支付公钥ID不匹配，拒绝处理', 'PayService');
      return false;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const verifyText = `${timestamp}\n${nonce}\n${bodyStr}\n`;
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(verifyText);
    verify.end();
    return verify.verify(this.normalizePem(publicKey), signature, 'base64');
  }

  private toCents(amount: number | string): number {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      throw new HttpException('支付金额无效', HttpStatus.BAD_REQUEST);
    }
    return Math.round(value * 100);
  }

  private assertCnyAmountMatchesOrder(order: OrderEntity, paidAmount: number | string) {
    if (this.toCents(paidAmount) !== this.toCents(order.total)) {
      throw new HttpException('支付金额与订单金额不一致', HttpStatus.BAD_REQUEST);
    }
  }

  private async getOrderUsdAmount(order: OrderEntity, manager: EntityManager): Promise<number> {
    const goods = await manager.findOne(CramiPackageEntity, { where: { id: order.goodsId } });
    if (!goods) {
      throw new HttpException('套餐不存在', HttpStatus.BAD_REQUEST);
    }

    if (goods.priceUsd && Number(goods.priceUsd) > 0) {
      return Number((Number(goods.priceUsd) * order.count).toFixed(2));
    }

    return Number((Number(order.total) / this.defaultUsdExchangeRate).toFixed(2));
  }

  private async assertUsdPaymentMatchesOrder(
    order: OrderEntity,
    manager: EntityManager,
    paidAmount: number | string,
    currency?: string,
  ) {
    if ((currency || '').toUpperCase() !== 'USD') {
      throw new HttpException('支付币种与订单币种不一致', HttpStatus.BAD_REQUEST);
    }

    const expectedUsdAmount = await this.getOrderUsdAmount(order, manager);
    if (this.toCents(paidAmount) !== this.toCents(expectedUsdAmount)) {
      throw new HttpException('支付金额与订单金额不一致', HttpStatus.BAD_REQUEST);
    }
  }

  private async markOrderPaidAndDeliver(
    orderId: string,
    options: {
      tradeId?: string;
      validate?: (order: OrderEntity, manager: EntityManager) => Promise<void>;
    } = {},
  ) {
    return await this.orderEntity.manager.transaction(async manager => {
      const order = await manager.findOne(OrderEntity, { where: { orderId } });
      if (!order) {
        return { success: false, delivered: false, reason: 'not_found' };
      }

      if (order.status === 1) {
        return { success: true, delivered: false, reason: 'already_paid' };
      }

      if (order.status !== 0) {
        return { success: false, delivered: false, reason: 'invalid_status' };
      }

      if (options.validate) {
        await options.validate(order, manager);
      }

      const updatePayload: Partial<OrderEntity> = {
        status: 1,
        paydAt: new Date(),
      };
      if (options.tradeId) {
        updatePayload.tradeId = options.tradeId;
      }

      const result = await manager.update(OrderEntity, { orderId, status: 0 }, updatePayload);
      if (result.affected !== 1) {
        return { success: true, delivered: false, reason: 'already_processed' };
      }

      const deliveryOrder = {
        ...order,
        tradeId: options.tradeId || order.tradeId,
      };
      await this.userBalanceService.addBalanceToOrder(deliveryOrder, manager);
      return { success: true, delivered: true, reason: 'delivered' };
    });
  }

  private async markOrderFailed(orderId: string) {
    return this.orderEntity.update(
      { orderId, status: 0 },
      {
        status: 2,
        paydAt: new Date(),
      },
    );
  }

  async onModuleInit() {
    const wpay = await import('wechatpay-node-v3');
    this.WxPay = wpay?.default ? wpay.default : wpay;
  }

  /* 支付通知 */
  async notify(params: object, headers?: any, rawBody?: Buffer) {
    // 易支付回调识别（支持V1和V2）
    // V1: param=epay 或者有 pid+trade_no+out_trade_no（MD5签名）
    // V2: pid+trade_no+out_trade_no+sign_type=RSA
    if (
      params['param'] == 'epay' ||
      (params['pid'] && params['trade_no'] && params['out_trade_no'])
    ) {
      return this.notifyEpay(params);
    }
    if (params['attach'] == 'hupi') {
      return this.notifyHupi(params);
    }
    if (params['attach'] == 'ltzf') {
      return this.notifyLtzf(params);
    }
    // 支付宝官方回调（有 trade_status 和 app_id）
    if (params['trade_status'] && params['app_id']) {
      return this.notifyAlipay(params);
    }
    if (typeof params['resource'] == 'object') {
      return this.notifyWeChat(params, headers, rawBody);
    }
    return this.notifyMpay(params);
  }

  /* 生成易支付签名 */
  private generateEpaySign(params: any, key: string): string {
    // 按照参数名的ASCII码从小到大排序
    const sortedParams = Object.keys(params)
      .filter(k => k !== 'sign' && k !== 'sign_type' && params[k])
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');

    // MD5签名
    return crypto.createHash('md5').update(`${sortedParams}${key}`).digest('hex');
  }

  /* 分平台支付请求 - 兼容旧版 */
  async pay(userId: number, orderId: string, payType = 'wxpay') {
    // query order
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    // query goods
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    // 支付类型已确认
    try {
      if (order.payPlatform == 'wechat') {
        return this.payWeChat(userId, orderId, payType);
      }
      if (order.payPlatform == 'epay') {
        return this.payEpay(userId, orderId, payType);
      }
      if (order.payPlatform == 'mpay') {
        return this.payMpay(userId, orderId, payType);
      }
      if (order.payPlatform == 'hupi') {
        return this.payHupi(userId, orderId, payType);
      }
      if (order.payPlatform == 'ltzf') {
        return this.payLtzf(userId, orderId, payType);
      }
    } catch (error) {
      Logger.error('支付请求失败');
      throw new HttpException('支付请求失败!', HttpStatus.BAD_REQUEST);
    }
  }

  /* 新版支付请求 - 支持多支付方式 */
  async payV2(userId: number, orderId: string, method: PaymentMethod | string, device = 'pc') {
    // 查询订单
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);

    // 查询商品
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    // 获取支付配置
    const paymentConfig = await this.globalConfigService.getPaymentConfig();

    // 添加调试日志
    Logger.log(
      `支付配置检查 - method: ${method} (type: ${typeof method}), stripe enabled: ${
        paymentConfig.stripe?.enabled
      }, stripe channel: ${paymentConfig.stripe?.channel}`,
      'PayService',
    );

    // 根据支付方式选择渠道
    let channel: PaymentChannel;

    // 将字符串转换为枚举值进行比较
    const normalizedMethod = typeof method === 'string' ? method.toLowerCase() : method;

    if (normalizedMethod === PaymentMethod.WECHAT || normalizedMethod === 'wechat') {
      if (!paymentConfig.wechat.enabled) {
        throw new HttpException('微信支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.wechat.configured) {
        throw new HttpException('微信支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      channel = paymentConfig.wechat.channel as PaymentChannel;
    } else if (normalizedMethod === PaymentMethod.ALIPAY || normalizedMethod === 'alipay') {
      if (!paymentConfig.alipay.enabled) {
        throw new HttpException('支付宝支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.alipay.configured) {
        throw new HttpException('支付宝支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      channel = paymentConfig.alipay.channel as PaymentChannel;
    } else if (normalizedMethod === PaymentMethod.PAYPAL || normalizedMethod === 'paypal') {
      if (!paymentConfig.paypal.enabled) {
        throw new HttpException('PayPal支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.paypal.configured) {
        throw new HttpException('PayPal支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      channel = paymentConfig.paypal.channel as PaymentChannel;
    } else if (normalizedMethod === PaymentMethod.STRIPE || normalizedMethod === 'stripe') {
      // 修复：确保 stripe 对象存在
      if (!paymentConfig.stripe) {
        Logger.error('Stripe 配置对象不存在', 'PayService');
        throw new HttpException('Stripe支付配置不存在，请检查配置!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.stripe.enabled) {
        Logger.error(`Stripe支付未开启 - enabled: ${paymentConfig.stripe.enabled}`, 'PayService');
        throw new HttpException('Stripe支付未开启!', HttpStatus.BAD_REQUEST);
      }
      if (!paymentConfig.stripe.configured) {
        throw new HttpException('Stripe支付渠道配置不完整!', HttpStatus.BAD_REQUEST);
      }
      channel = paymentConfig.stripe.channel as PaymentChannel;
      Logger.log(
        `Stripe支付配置验证通过 - enabled: ${paymentConfig.stripe.enabled}, channel: ${channel}`,
        'PayService',
      );
    } else {
      Logger.error(`不支持的支付方式: ${method} (normalized: ${normalizedMethod})`, 'PayService');
      throw new HttpException('不支持的支付方式!', HttpStatus.BAD_REQUEST);
    }

    // 验证渠道是否支持该支付方式
    if (!isMethodSupportedByChannel(channel, normalizedMethod as PaymentMethod)) {
      throw new HttpException(
        `${channel} 渠道不支持 ${normalizedMethod} 支付方式!`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 更新订单的支付渠道和支付方式
    await this.orderEntity.update(
      { orderId },
      {
        payPlatform: channel,
        channel: method,
      },
    );

    // 根据渠道调用对应的支付方法
    try {
      switch (channel) {
        case PaymentChannel.WECHAT_OFFICIAL:
          // 微信环境使用JSAPI，否则使用Native扫码
          const wechatPayType = device === 'wechat' ? 'jsapi' : 'native';
          return this.payWeChat(userId, orderId, wechatPayType);

        case PaymentChannel.EPAY:
          let epayType: string;
          if (method === PaymentMethod.WECHAT) {
            epayType = 'wxpay';
          } else if (method === PaymentMethod.ALIPAY) {
            epayType = 'alipay';
          } else if (method === PaymentMethod.PAYPAL) {
            epayType = 'paypal';
          } else {
            throw new HttpException('易支付不支持该支付方式', HttpStatus.BAD_REQUEST);
          }
          return this.payEpay(userId, orderId, epayType, device);

        case PaymentChannel.HUPI:
          return this.payHupi(userId, orderId, 'wxpay');

        case PaymentChannel.MPAY:
          return this.payMpay(userId, orderId, 'wxpay');

        case PaymentChannel.LTZF:
          return this.payLtzf(userId, orderId, 'wxpay');

        case PaymentChannel.PAYPAL_OFFICIAL:
          return this.payPayPal(userId, orderId);

        case PaymentChannel.STRIPE_OFFICIAL:
          return this.payStripe(userId, orderId);

        case PaymentChannel.ALIPAY_OFFICIAL:
          const alipayPayType =
            device === 'mobile' || device === 'wechat' || device === 'qq' || device === 'alipay'
              ? 'wap'
              : 'page';
          return this.payAlipay(userId, orderId, alipayPayType);

        default:
          throw new HttpException(`不支持的支付渠道: ${channel}`, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      Logger.error(`支付请求失败 - 渠道: ${channel}, 方式: ${method}`, error.message);
      throw new HttpException(error.message || '支付请求失败!', HttpStatus.BAD_REQUEST);
    }
  }

  /* 获取可用的支付方式列表 */
  async getAvailablePaymentMethods() {
    const paymentConfig = await this.globalConfigService.getPaymentConfig();
    const methods = [];

    if (paymentConfig.wechat.enabled && paymentConfig.wechat.configured) {
      methods.push({
        method: PaymentMethod.WECHAT,
        name: '微信支付',
        channel: paymentConfig.wechat.channel,
        priority: paymentConfig.wechat.priority,
      });
    }

    if (paymentConfig.alipay.enabled && paymentConfig.alipay.configured) {
      methods.push({
        method: PaymentMethod.ALIPAY,
        name: '支付宝',
        channel: paymentConfig.alipay.channel,
        priority: paymentConfig.alipay.priority,
      });
    }

    if (paymentConfig.paypal?.enabled && paymentConfig.paypal.configured) {
      methods.push({
        method: PaymentMethod.PAYPAL,
        name: 'PayPal',
        channel: paymentConfig.paypal.channel,
        priority: paymentConfig.paypal.priority,
      });
    }

    if (paymentConfig.stripe?.enabled && paymentConfig.stripe.configured) {
      methods.push({
        method: PaymentMethod.STRIPE,
        name: 'Stripe',
        channel: paymentConfig.stripe.channel,
        priority: paymentConfig.stripe.priority || 4,
      });
    }

    // 按优先级排序
    methods.sort((a, b) => a.priority - b.priority);

    return methods;
  }

  /* 支付订单状态查询 */
  async query(orderId: string) {
    const order = await this.orderEntity.findOne({ where: { orderId } });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    return order;
  }

  /* 虎皮椒支付通知 */
  async notifyHupi(params: object) {
    try {
      const payHupiAppSecret = await this.globalConfigService.getConfigs(['payHupiAppSecret']);
      const hash = params['hash'];
      delete params['hash'];
      if (this.sign(params, payHupiAppSecret) != hash) return 'failed';

      const result = await this.markOrderPaidAndDeliver(params['trade_order_id'], {
        tradeId: params['transaction_id'] || params['open_order_id'],
        validate: async order => this.assertCnyAmountMatchesOrder(order, params['total_fee']),
      });

      return result.success ? 'success' : 'failed';
    } catch (error) {
      Logger.warn(`[虎皮椒回调] 处理失败: ${error.message}`, 'PayService');
      return 'failed';
    }
  }

  /* 虎皮椒支付 */
  async payHupi(userId: number, orderId: string, payType = 'wxpay') {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    const {
      payHupiAppId,
      payHupiAppSecret,
      payHupiNotifyUrl,
      payHupiReturnUrl,
      payHupiGatewayUrl,
    } = await this.globalConfigService.getConfigs([
      'payHupiAppId',
      'payHupiAppSecret',
      'payHupiNotifyUrl',
      'payHupiReturnUrl',
      'payHupiGatewayUrl',
    ]);
    const params = {};
    params['version'] = '1.1';
    params['appid'] = payHupiAppId;
    params['time'] = (Date.now() / 1000).toFixed(0);
    params['nonce_str'] = createRandomNonceStr(32);
    params['trade_order_id'] = orderId;
    params['title'] = goods.name;
    params['total_fee'] = order.total;
    params['notify_url'] = payHupiNotifyUrl;
    params['return_url'] = payHupiReturnUrl;
    params['attach'] = 'hupi';
    params['hash'] = this.sign(params, payHupiAppSecret);
    // 使用 URLSearchParams 确保参数正确编码
    const formData = new URLSearchParams();
    for (const key in params) {
      formData.append(key, String(params[key]));
    }
    const gatewayUrl = payHupiGatewayUrl || 'https://api.xunhupay.com/payment/do.html';
    const {
      data: { errcode, errmsg, url_qrcode, url },
    } = await axios.post(gatewayUrl, formData);
    if (errcode != 0) throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    return {
      url_qrcode,
      url,
      redirectUrl: url,
      isRedirect: Boolean(url && !url_qrcode),
      trustedPaymentOrigins: this.getTrustedPaymentOrigins(gatewayUrl, url_qrcode, url),
    };
  }

  /* 虎皮椒商户查询 */
  async queryHupi(orderId: string) {
    const { payHupiAppId, payHupiAppSecret } = await this.globalConfigService.getConfigs([
      'payHupiAppId',
      'payHupiAppSecret',
    ]);
    const params = {};
    params['version'] = '1.1';
    params['appid'] = payHupiAppId;
    params['time'] = (Date.now() / 1000).toFixed(0);
    params['nonce_str'] = createRandomNonceStr(32);
    params['out_trade_order'] = orderId;
    params['hash'] = this.sign(params, payHupiAppSecret);
    // 使用 URLSearchParams 确保参数正确编码
    const formData = new URLSearchParams();
    for (const key in params) {
      formData.append(key, String(params[key]));
    }
    const {
      data: { errcode, errmsg, data: result },
    } = await axios.post('https://api.xunhupay.com/payment/query.html', formData);
    if (errcode != 0) throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    return result;
  }

  /* 易支付支付结果通知 */
  async notifyEpay(params: object) {
    try {
      const { payEpayKey, payEpayApiVersion, payEpayPublicKey, payEpayPid } =
        await this.globalConfigService.getConfigs([
          'payEpayKey',
          'payEpayApiVersion',
          'payEpayPublicKey',
          'payEpayPid',
        ]);

      const isValidSign = EpayPaymentHelper.verifyCallback(params, {
        key: payEpayKey,
        publicKey: payEpayPublicKey,
        apiVersion: payEpayApiVersion,
      });

      if (!isValidSign) {
        Logger.warn(`[易支付回调] 签名验证失败，订单号: ${params['out_trade_no']}`, 'PayService');
        return 'failed';
      }

      if (String(params['pid']) !== String(payEpayPid)) {
        Logger.warn(`[易支付回调] 商户号不匹配，订单号: ${params['out_trade_no']}`, 'PayService');
        return 'failed';
      }

      const rawStatus = params['trade_status'];
      const isSuccess =
        rawStatus === 'TRADE_SUCCESS' ||
        rawStatus === 'TRADE_FINISHED' ||
        String(rawStatus) === '1';
      if (!isSuccess) {
        await this.markOrderFailed(params['out_trade_no']);
        return 'success';
      }

      const result = await this.markOrderPaidAndDeliver(params['out_trade_no'], {
        tradeId: params['trade_no'],
        validate: async order => this.assertCnyAmountMatchesOrder(order, params['money']),
      });

      if (result.success && result.delivered) {
        Logger.log(`[易支付] 支付成功 - 订单号: ${params['out_trade_no']}`, 'PayService');
      }

      return result.success ? 'success' : 'failed';
    } catch (error) {
      Logger.warn(`[易支付回调] 处理失败: ${error.message}`, 'PayService');
      return 'failed';
    }
  }

  /* 统一易支付支付 */
  async payEpay(userId: number, orderId: string, payType = 'alipay', device = 'pc') {
    // query order
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    // query goods
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    // 标准易支付配置
    const epayConfig = await this.globalConfigService.getConfigs([
      'payEpayPid',
      'payEpayKey',
      'payEpayNotifyUrl',
      'payEpayReturnUrl',
      'payEpayApiPayUrl',
      'payEpayApiVersion',
      'payEpayPrivateKey',
    ]);
    const pid = epayConfig.payEpayPid;
    const key = epayConfig.payEpayKey;
    const notifyUrl = epayConfig.payEpayNotifyUrl;
    const returnUrl = epayConfig.payEpayReturnUrl;
    const apiPayUrl = epayConfig.payEpayApiPayUrl;
    const apiVersion = epayConfig.payEpayApiVersion || 'v1'; // 易支付默认为V1
    const privateKey = epayConfig.payEpayPrivateKey; // V2版本使用的私钥

    // 构建基础参数
    const baseParams = {
      pid: pid,
      type: payType,
      out_trade_no: orderId,
      name: goods.name,
      money: order.total,
      // 易支付要求 clientip；服务层无法可靠获知代理后的真实来源时使用文档保留地址，
      // 避免在开源默认值中携带部署者的内网地址。
      clientip: '192.0.2.1',
      device: device,
      notify_url: notifyUrl,
      return_url: returnUrl,
      param: 'epay',
    };

    // 使用统一助手类构建参数
    const params = EpayPaymentHelper.autoBuildParams(baseParams, {
      key: key,
      apiVersion: apiVersion,
      privateKey: privateKey,
    });

    // 处理请求
    if (apiPayUrl.includes('submit.php')) {
      // 直接跳转模式
      const queryParams = new URLSearchParams(params).toString();
      const redirectUrl = `${apiPayUrl}?${queryParams}`;
      return {
        url_qrcode: null,
        redirectUrl: redirectUrl,
        channel: payType,
        isRedirect: true,
        trustedPaymentOrigins: this.getTrustedPaymentOrigins(apiPayUrl, redirectUrl),
      };
    } else {
      // API模式
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      };

      const formData = new URLSearchParams();
      for (const key in params) {
        formData.append(key, String(params[key]));
      }

      try {
        const res = await axios.post(apiPayUrl, formData, config);

        // 使用统一助手类处理响应
        const paymentResult = EpayPaymentHelper.processResponse(res.data, payType, {
          apiVersion: apiVersion,
        });
        return {
          ...paymentResult,
          trustedPaymentOrigins: this.getTrustedPaymentOrigins(apiPayUrl),
        };
      } catch (error) {
        Logger.error(`易支付请求失败: ${error.message}`, 'PayService');
        throw new HttpException(error.message || '支付请求失败', HttpStatus.BAD_REQUEST);
      }
    }
  }

  /* 易支付商户信息查询 */
  async queryEpay(orderId: string) {
    const { payEpayPid, payEpayKey, payEpayApiQueryUrl, payEpayApiVersion, payEpayPrivateKey } =
      await this.globalConfigService.getConfigs([
        'payEpayPid',
        'payEpayKey',
        'payEpayApiQueryUrl',
        'payEpayApiVersion',
        'payEpayPrivateKey',
      ]);

    const apiVersion = payEpayApiVersion || 'v1';

    if (apiVersion === 'v2' && payEpayPrivateKey) {
      const queryUrl = payEpayApiQueryUrl;
      Logger.log(`[易支付查询] V2版本查询订单: ${orderId}`, 'PayService');

      const queryParams: any = {
        pid: payEpayPid,
        out_trade_no: orderId,
        timestamp: Math.floor(Date.now() / 1000).toString(),
      };

      // RSA签名
      const sign = EpayPaymentHelper.signRSA(queryParams, payEpayPrivateKey);
      queryParams.sign = sign;
      queryParams.sign_type = 'RSA';

      // 将参数转换为URL编码格式
      const formData = new URLSearchParams();
      Object.keys(queryParams).forEach(key => {
        formData.append(key, queryParams[key]);
      });

      try {
        const { data } = await axios.post(queryUrl, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        if (data.code !== 0 && data.code !== '0') {
          throw new HttpException(data.msg || '查询失败', HttpStatus.BAD_REQUEST);
        }
        // V2返回的订单信息直接在根级别，不在data字段里
        return {
          status: data.status?.toString(),
          trade_no: data.trade_no,
          out_trade_no: data.out_trade_no,
          type: data.type,
          money: data.money,
          addtime: data.addtime,
          endtime: data.endtime,
        };
      } catch (error) {
        Logger.error(`[易支付查询] V2查询失败: ${error.message}`, 'PayService');
        throw new HttpException(error.message || '查询订单失败', HttpStatus.BAD_REQUEST);
      }
    } else {
      // V1版本查询
      const params = {};
      params['act'] = 'order';
      params['out_trade_no'] = orderId;
      params['pid'] = payEpayPid;
      params['key'] = payEpayKey;

      try {
        const response = await axios.get(payEpayApiQueryUrl, { params });
        const { code, msg, ...orderInfo } = response.data;

        if (code != 1) throw new HttpException(msg, HttpStatus.BAD_REQUEST);
        return orderInfo;
      } catch (error) {
        Logger.error(`[易支付查询] V1查询失败: ${error.message}`, 'PayService');
        throw new HttpException(error.message || '查询订单失败', HttpStatus.BAD_REQUEST);
      }
    }
  }

  /* 支付宝订单查询 */
  async queryAlipay(orderId: string) {
    try {
      const result = await this.alipayService.queryOrder(orderId);

      // 支付宝返回格式：{ code: '10000', trade_status: 'TRADE_SUCCESS', ... }
      // code=10000: 成功
      // code=40004: 订单不存在（用户还未支付，正常情况）
      // code=20000: 服务不可用

      if (result.code === '10000') {
        const tradeStatus = result.trade_status || result.tradeStatus;

        return {
          status: tradeStatus, // 'TRADE_SUCCESS' 表示支付成功
          trade_no: result.trade_no || result.tradeNo,
          out_trade_no: result.out_trade_no || result.outTradeNo,
          total_amount: result.total_amount || result.totalAmount,
          buyer_pay_amount: result.buyer_pay_amount || result.buyerPayAmount,
        };
      } else if (result.code === '40004') {
        // 订单不存在或交易不存在，这是正常情况（用户还没支付）
        // 静默处理，返回null让轮询继续
        return null;
      } else {
        // 其他错误码（20000服务不可用等）才记录警告
        Logger.warn(
          `[支付宝查询] 订单 ${orderId} 查询异常: code=${result.code}, msg=${
            result.msg || result.sub_msg
          }`,
          'PayService',
        );
        return null;
      }
    } catch (error) {
      // 网络错误或SDK错误才记录
      Logger.error(`[支付宝查询] 订单 ${orderId} 查询失败: ${error.message}`, 'PayService');
      return null;
    }
  }

  /* 码支付支付结果通知 */
  async notifyMpay(params: object) {
    try {
      const sign = params['sign'];
      delete params['sign'];
      delete params['sign_type'];
      const { payMpaySecret, payMpayPid } = await this.globalConfigService.getConfigs([
        'payMpaySecret',
        'payMpayPid',
      ]);
      if (this.sign(params, payMpaySecret) != sign) return 'failed';
      if (params['pid'] && String(params['pid']) !== String(payMpayPid)) return 'failed';

      const rawMpayStatus = params['trade_status'];
      const isMpaySuccess =
        rawMpayStatus === 'TRADE_SUCCESS' ||
        rawMpayStatus === 'TRADE_FINISHED' ||
        String(rawMpayStatus) === '1';
      if (!isMpaySuccess) {
        await this.markOrderFailed(params['out_trade_no']);
        return 'success';
      }

      const result = await this.markOrderPaidAndDeliver(params['out_trade_no'], {
        tradeId: params['trade_no'],
        validate: async order => this.assertCnyAmountMatchesOrder(order, params['money']),
      });

      return result.success ? 'success' : 'failed';
    } catch (error) {
      Logger.warn(`[码支付回调] 处理失败: ${error.message}`, 'PayService');
      return 'failed';
    }
  }

  /* 码支付支付 */
  async payMpay(userId: number, orderId: string, payType = 'wxpay') {
    // query order
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    // query goods
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    // assemble params
    const { payMpayPid, payMpaySecret, payMpayNotifyUrl, payMpayReturnUrl, payMpayApiPayUrl } =
      await this.globalConfigService.getConfigs([
        'payMpayPid',
        'payMpaySecret',
        'payMpayNotifyUrl',
        'payMpayReturnUrl',
        'payMpayApiPayUrl',
      ]);
    const params = {};
    params['pid'] = Number(payMpayPid);
    params['type'] = payType;
    params['out_trade_no'] = orderId;
    params['name'] = goods.name;
    params['money'] = order.total;
    params['notify_url'] = payMpayNotifyUrl;
    params['return_url'] = payMpayReturnUrl;
    // params['param'] = 'Mpay';
    params['sign'] = this.sign(params, payMpaySecret);
    params['sign_type'] = 'MD5';
    const queryParams = new URLSearchParams(params).toString();
    const apiUrl = `${payMpayApiPayUrl}?${queryParams}`;
    return {
      url_qrcode: null,
      redirectUrl: apiUrl,
      channel: payType,
      isRedirect: true,
      trustedPaymentOrigins: this.getTrustedPaymentOrigins(payMpayApiPayUrl, apiUrl),
    };
  }

  /* 码支付商户信息查询 */
  async queryMpay(orderId: string) {
    const { payMpayApiQueryUrl } = await this.globalConfigService.getConfigs([
      'payMpayPid',
      'payMpaySecret',
      'payMpayApiQueryUrl',
    ]);
    const params = {};
    params['type'] = 2;
    params['order_no'] = orderId;
    const {
      data: { code, msg, data: result },
    } = await axios.get(payMpayApiQueryUrl, { params });
    if (code != 1) throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    return result;
  }

  /* 微信支付结果通知 */
  async notifyWeChat(params: object, headers?: any, rawBody?: Buffer) {
    const {
      payWeChatAppId,
      payWeChatMchId,
      payWeChatSecret,
      payWeChatPublicKey,
      payWeChatPrivateKey,
      payWeChatVerifyMode,
      payWeChatPlatformPublicKeyId,
      payWeChatPlatformPublicKey,
    } = await this.globalConfigService.getConfigs([
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatSecret',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatVerifyMode',
      'payWeChatPlatformPublicKeyId',
      'payWeChatPlatformPublicKey',
    ]);
    const pay = new this.WxPay({
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      publicKey: payWeChatPublicKey,
      privateKey: payWeChatPrivateKey,
    });
    try {
      const timestamp = headers?.['wechatpay-timestamp'];
      const nonce = headers?.['wechatpay-nonce'];
      const signature = headers?.['wechatpay-signature'];
      const serial = headers?.['wechatpay-serial'];
      if (!timestamp || !nonce || !signature || !serial) {
        Logger.warn('[微信官方回调] 缺少签名头，拒绝处理', 'PayService');
        return 'failed';
      }

      const verifyMode = this.normalizeWeChatVerifyMode(payWeChatVerifyMode);
      const verifyBody = this.getWeChatVerifyBody(params, rawBody);
      const isValid = this.shouldUseWeChatPayPublicKey(serial, verifyMode)
        ? this.verifyWeChatPayPublicKeySignature({
            timestamp,
            nonce,
            body: verifyBody,
            signature,
            serial,
            publicKeyId: payWeChatPlatformPublicKeyId,
            publicKey: payWeChatPlatformPublicKey,
          })
        : await pay.verifySign({
            timestamp,
            nonce,
            body: verifyBody,
            signature,
            serial,
            apiSecret: payWeChatSecret,
          });
      if (!isValid) {
        Logger.warn('[微信官方回调] HTTP 签名头验证失败', 'PayService');
        return 'failed';
      }
      if (params['event_type'] == 'TRANSACTION.SUCCESS') {
        const { ciphertext, associated_data, nonce } = params['resource'];
        const resource = pay.decipher_gcm(ciphertext, associated_data, nonce, payWeChatSecret);
        const status = resource['trade_state'] == 'SUCCESS' ? 1 : 2;
        if (status !== 1) {
          await this.markOrderFailed(resource['out_trade_no']);
          return 'success';
        }

        const result = await this.markOrderPaidAndDeliver(resource['out_trade_no'], {
          tradeId: resource['transaction_id'],
          validate: async order => {
            if (String(resource['mchid']) !== String(payWeChatMchId)) {
              throw new HttpException('微信支付商户号不匹配', HttpStatus.BAD_REQUEST);
            }
            if (String(resource['appid']) !== String(payWeChatAppId)) {
              throw new HttpException('微信支付AppId不匹配', HttpStatus.BAD_REQUEST);
            }
            this.assertCnyAmountMatchesOrder(order, Number(resource['amount']?.total || 0) / 100);
          },
        });

        if (!result.success) return 'failed';
        if (result.delivered) {
          Logger.log(`[微信官方] 支付成功 - 订单号: ${resource['out_trade_no']}`, 'PayService');
        }
      }
      return 'success';
    } catch (error) {
      Logger.error('微信支付通知处理失败', error?.stack, 'PayService');
      return 'failed';
    }
  }

  /* 支付宝支付通知 */
  async notifyAlipay(params: object) {
    try {
      const isValid = await this.alipayService.verifyNotifySign(params);
      if (!isValid) {
        Logger.error('支付宝支付通知签名验证失败');
        return 'failure';
      }

      const tradeStatus = params['trade_status'];
      const outTradeNo = params['out_trade_no'];

      if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
        const configs = await this.globalConfigService.getConfigs(['alipayAppId']);
        const result = await this.markOrderPaidAndDeliver(outTradeNo, {
          tradeId: params['trade_no'],
          validate: async order => {
            if (String(params['app_id']) !== String(configs.alipayAppId)) {
              throw new HttpException('支付宝AppId不匹配', HttpStatus.BAD_REQUEST);
            }
            this.assertCnyAmountMatchesOrder(order, params['total_amount']);
          },
        });

        if (result.success && result.delivered) {
          Logger.log(`支付宝支付成功 - 订单号: ${outTradeNo}`);
        }
      } else if (tradeStatus) {
        await this.markOrderFailed(outTradeNo);
      }

      return 'success';
    } catch (error) {
      Logger.error(`支付宝支付通知处理失败: ${error.message}`, error.stack);
      return 'failure';
    }
  }

  /* PayPal支付 */
  async payPayPal(userId: number, orderId: string) {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);

    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    try {
      const usdAmount =
        goods.priceUsd && Number(goods.priceUsd) > 0
          ? Number((Number(goods.priceUsd) * order.count).toFixed(2))
          : Number((Number(order.total) / this.defaultUsdExchangeRate).toFixed(2));

      // 创建PayPal订单（使用USD价格）
      const paypalOrder = await this.payPalService.createOrder(
        usdAmount, // USD金额
        orderId, // 商户订单号
        goods.name, // 商品描述
      );

      // 获取批准链接
      const approvalLink = paypalOrder.links.find(
        link => link.rel === 'approve' || link.rel === 'payer-action',
      );
      if (!approvalLink) {
        throw new HttpException('无法获取PayPal支付链接', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 保存PayPal订单ID到数据库
      await this.orderEntity.update(
        { orderId },
        {
          tradeId: paypalOrder.id, // 保存PayPal订单ID
          status: 0, // 待支付
        },
      );

      return {
        success: true,
        payType: 'paypal',
        redirectUrl: approvalLink.href, // PayPal支付页面URL
        paypalOrderId: paypalOrder.id,
      };
    } catch (error) {
      Logger.error(`PayPal支付创建失败 - 订单: ${orderId}`, error.message);
      // 返回友好的错误信息，而不是让整个请求崩溃
      const errorMessage = error.message || 'PayPal支付创建失败';

      // 如果是配置问题，返回更详细的提示
      if (error.message?.includes('不支持') || error.message?.includes('货币')) {
        throw new HttpException(
          '配置错误: ' + errorMessage + '。请联系管理员检查PayPal配置。',
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(errorMessage, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  /* 更新订单状态 */
  async updateOrderStatus(orderId: string, status: number) {
    if (status === 1) {
      return this.markOrderPaidAndDeliver(orderId);
    }

    const order = await this.orderEntity.findOne({ where: { orderId } });
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.BAD_REQUEST);
    }

    await this.orderEntity.update({ orderId, status: 0 }, { status, paydAt: new Date() });
    return { success: true };
  }

  /* Stripe支付 */
  async payStripe(userId: number, orderId: string) {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);

    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    try {
      const usdAmount =
        goods.priceUsd && Number(goods.priceUsd) > 0
          ? Number((Number(goods.priceUsd) * order.count).toFixed(2))
          : Number((Number(order.total) / this.defaultUsdExchangeRate).toFixed(2));

      // 创建Stripe Checkout Session
      const stripeSession = await this.stripeService.createCheckoutSession(
        usdAmount, // USD金额
        orderId, // 商户订单号
        goods.name, // 商品描述
      );

      // 保存Stripe Session ID到数据库
      await this.orderEntity.update(
        { orderId },
        {
          tradeId: stripeSession.id, // 保存Stripe Session ID
          status: 0, // 待支付
        },
      );

      Logger.log(`Stripe Session创建成功 - 订单号: ${orderId}, Session ID: ${stripeSession.id}`);

      return {
        success: true,
        payType: 'stripe',
        redirectUrl: stripeSession.url, // Stripe Checkout页面URL
        stripeSessionId: stripeSession.id,
      };
    } catch (error) {
      Logger.error(`Stripe支付创建失败 - 订单: ${orderId}`, error.message);

      const errorMessage = error.message || 'Stripe支付创建失败';

      // 如果是配置问题，返回更详细的提示
      if (error.message?.includes('配置') || error.message?.includes('密钥')) {
        throw new HttpException(
          '配置错误: ' + errorMessage + '。请联系管理员检查Stripe配置。',
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(errorMessage, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  /* 支付宝官方支付 */
  async payAlipay(userId: number, orderId: string, payType: 'page' | 'wap' = 'page') {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);

    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);

    try {
      const configs = await this.globalConfigService.getConfigs(['alipayReturnUrl']);
      const returnUrl = configs.alipayReturnUrl;

      let paymentUrl: string;
      if (payType === 'wap') {
        paymentUrl = await this.alipayService.createWapPay(
          orderId,
          order.total,
          goods.name,
          returnUrl,
        );
      } else {
        paymentUrl = await this.alipayService.createPagePay(
          orderId,
          order.total,
          goods.name,
          returnUrl,
        );
      }

      await this.orderEntity.update(
        { orderId },
        {
          status: 0,
        },
      );

      return {
        success: true,
        payType: 'alipay',
        paymentForm: paymentUrl,
        isForm: true,
      };
    } catch (error) {
      Logger.error(`支付宝支付创建失败 - 订单: ${orderId}`, error.message);
      throw new HttpException(error.message || '支付宝支付创建失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* PayPal支付回调处理 */
  async capturePayPal(paypalOrderId: string) {
    try {
      const existingOrder = await this.orderEntity.findOne({
        where: { tradeId: paypalOrderId },
      });
      if (existingOrder?.status === 1) {
        return {
          success: true,
          message: '订单已支付',
          orderId: existingOrder.orderId,
          paypalOrderId,
        };
      }

      // 捕获支付
      const capture = await this.payPalService.capturePayment(paypalOrderId);

      // 获取商户订单号（从支付捕获的购买单元中获取）
      const purchaseUnit = capture.purchase_units?.[0];
      return this.completePayPalCapture(paypalOrderId, capture.status, purchaseUnit);
    } catch (error) {
      if (this.isPayPalAlreadyCapturedError(error)) {
        const existingOrder = await this.orderEntity.findOne({
          where: { tradeId: paypalOrderId },
        });
        if (existingOrder?.status === 1) {
          return {
            success: true,
            message: '订单已支付',
            orderId: existingOrder.orderId,
            paypalOrderId,
          };
        }

        const remoteOrder = await this.payPalService.queryOrder(paypalOrderId);
        if (remoteOrder.status === 'COMPLETED') {
          return this.completePayPalCapture(
            paypalOrderId,
            remoteOrder.status,
            remoteOrder.purchase_units?.[0],
          );
        }
      }

      Logger.error(`PayPal支付捕获失败 - PayPal ID: ${paypalOrderId}`, error.message);
      throw new HttpException(
        error.message || 'PayPal支付处理失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private isPayPalAlreadyCapturedError(error: any) {
    return (
      error?.message?.includes('订单已经被捕获') ||
      error?.response?.data?.details?.some?.(detail => detail?.issue === 'ORDER_ALREADY_CAPTURED')
    );
  }

  private async completePayPalCapture(paypalOrderId: string, status: string, purchaseUnit: any) {
    const referenceId =
      purchaseUnit?.reference_id || purchaseUnit?.invoice_id || purchaseUnit?.custom_id;
    if (!referenceId) {
      throw new HttpException('无法获取订单号', HttpStatus.BAD_REQUEST);
    }

    // 检查支付状态
    if (status === 'COMPLETED') {
      const order = await this.orderEntity.findOne({
        where: { orderId: referenceId },
      });

      if (!order) {
        throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
      }

      const captureInfo = purchaseUnit?.payments?.captures?.[0];
      const result = await this.markOrderPaidAndDeliver(referenceId, {
        tradeId: paypalOrderId,
        validate: async (localOrder, manager) => {
          await this.assertUsdPaymentMatchesOrder(
            localOrder,
            manager,
            captureInfo?.amount?.value,
            captureInfo?.amount?.currency_code,
          );
        },
      });

      if (!result.success) {
        throw new HttpException('订单支付处理失败', HttpStatus.BAD_REQUEST);
      }

      if (result.delivered) {
        Logger.log(`[PayPal] 支付成功 - 订单号: ${referenceId}`, 'PayService');
      }

      return {
        success: true,
        message: result.delivered ? '支付成功' : '订单已支付',
        orderId: referenceId,
        paypalOrderId,
      };
    } else {
      throw new HttpException(`支付状态异常: ${status}`, HttpStatus.BAD_REQUEST);
    }
  }

  async capturePayPalForUser(userId: number, paypalOrderId: string) {
    const order = await this.orderEntity.findOne({
      where: { userId, tradeId: paypalOrderId },
    });
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    }

    return this.capturePayPal(paypalOrderId);
  }

  async queryPayPalStatusForUser(userId: number, paypalOrderId: string) {
    const order = await this.orderEntity.findOne({
      where: { userId, tradeId: paypalOrderId },
    });
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    }

    const remoteOrder = await this.payPalService.queryOrder(paypalOrderId);
    return {
      id: remoteOrder.id,
      status: remoteOrder.status,
      amount: remoteOrder.amount,
      create_time: remoteOrder.create_time,
      update_time: remoteOrder.update_time,
      localStatus: order.status,
    };
  }

  async queryStripeStatusForUser(userId: number, sessionId: string) {
    const order = await this.orderEntity.findOne({
      where: { userId, tradeId: sessionId },
    });
    if (!order) {
      throw new HttpException('订单不存在', HttpStatus.NOT_FOUND);
    }

    const paymentInfo = await this.stripeService.verifyPayment(sessionId);
    if (paymentInfo.orderId !== order.orderId) {
      throw new HttpException('支付订单不匹配', HttpStatus.BAD_REQUEST);
    }

    return {
      id: paymentInfo.id,
      status: paymentInfo.status,
      orderId: paymentInfo.orderId,
      amount: paymentInfo.amount,
      currency: paymentInfo.currency,
      localStatus: order.status,
    };
  }

  async completeStripePayment(sessionId: string) {
    const existingOrder = await this.orderEntity.findOne({
      where: { tradeId: sessionId },
    });
    if (existingOrder?.status === 1) {
      return {
        success: true,
        message: '订单已支付',
        orderId: existingOrder.orderId,
        stripeSessionId: sessionId,
      };
    }

    const paymentInfo = await this.stripeService.verifyPayment(sessionId);
    if (paymentInfo.status !== 'paid' || !paymentInfo.orderId) {
      throw new HttpException('Stripe支付未完成', HttpStatus.BAD_REQUEST);
    }

    const result = await this.markOrderPaidAndDeliver(paymentInfo.orderId, {
      tradeId: sessionId,
      validate: async (order, manager) => {
        await this.assertUsdPaymentMatchesOrder(
          order,
          manager,
          paymentInfo.amount,
          paymentInfo.currency,
        );
      },
    });
    if (!result.success) {
      throw new HttpException('Stripe支付处理失败', HttpStatus.BAD_REQUEST);
    }

    return {
      success: true,
      message: result.delivered ? '支付成功' : '订单已支付',
      orderId: paymentInfo.orderId,
      stripeSessionId: sessionId,
    };
  }

  async handlePayPalWebhook(headers: any, body: any) {
    const isValid = await this.payPalService.verifyWebhookSignature(headers, body);
    if (!isValid) {
      throw new HttpException('Webhook签名验证失败', HttpStatus.UNAUTHORIZED);
    }

    const eventType = body.event_type;
    const resource = body.resource;

    Logger.log(`收到PayPal Webhook事件: ${eventType}`, 'PayService');

    switch (eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        if (resource?.id) {
          await this.capturePayPal(resource.id);
        }
        break;
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handlePayPalCaptureCompleted(resource);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        Logger.warn(`PayPal支付被拒绝: ${resource?.id || 'unknown'}`, 'PayService');
        break;
      default:
        Logger.log(`未处理的PayPal事件类型: ${eventType}`, 'PayService');
    }
  }

  private async handlePayPalCaptureCompleted(resource: any) {
    const relatedPaypalOrderId = resource?.supplementary_data?.related_ids?.order_id;
    const localOrderId = resource?.invoice_id || resource?.custom_id;

    let order: OrderEntity | null = null;
    if (localOrderId) {
      order = await this.orderEntity.findOne({ where: { orderId: localOrderId } });
    }
    if (!order && relatedPaypalOrderId) {
      order = await this.orderEntity.findOne({ where: { tradeId: relatedPaypalOrderId } });
    }
    if (!order) {
      throw new HttpException('PayPal Webhook未找到本地订单', HttpStatus.NOT_FOUND);
    }

    const result = await this.markOrderPaidAndDeliver(order.orderId, {
      tradeId: relatedPaypalOrderId || resource?.id,
      validate: async (localOrder, manager) => {
        await this.assertUsdPaymentMatchesOrder(
          localOrder,
          manager,
          resource?.amount?.value,
          resource?.amount?.currency_code,
        );
      },
    });

    if (!result.success) {
      throw new HttpException('PayPal Webhook订单处理失败', HttpStatus.BAD_REQUEST);
    }
  }

  async handleStripeWebhook(signature: string, payload: string | Buffer) {
    const event = await this.stripeService.handleWebhook(signature, payload);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session: any = event.data.object;
        if (session.payment_status !== 'paid') {
          return;
        }
        const orderId = session.metadata?.orderId;
        if (!orderId) {
          throw new HttpException('Stripe Webhook缺少订单号', HttpStatus.BAD_REQUEST);
        }

        const result = await this.markOrderPaidAndDeliver(orderId, {
          tradeId: session.id,
          validate: async (order, manager) => {
            await this.assertUsdPaymentMatchesOrder(
              order,
              manager,
              Number(session.amount_total || 0) / 100,
              session.currency,
            );
          },
        });
        if (!result.success) {
          throw new HttpException('Stripe Webhook订单处理失败', HttpStatus.BAD_REQUEST);
        }
        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent: any = event.data.object;
        const orderId = paymentIntent.metadata?.orderId;
        if (!orderId) {
          return;
        }

        const result = await this.markOrderPaidAndDeliver(orderId, {
          validate: async (order, manager) => {
            await this.assertUsdPaymentMatchesOrder(
              order,
              manager,
              Number(paymentIntent.amount || 0) / 100,
              paymentIntent.currency,
            );
          },
        });
        if (!result.success) {
          throw new HttpException('Stripe Webhook订单处理失败', HttpStatus.BAD_REQUEST);
        }
        break;
      }
      default:
        break;
    }
  }

  /* 微信支付支付 */
  async payWeChat(userId: number, orderId: string, payType = 'native') {
    // 支付类型已确认
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    const {
      payWeChatAppId,
      payWeChatMchId,
      payWeChatPublicKey,
      payWeChatPrivateKey,
      payWeChatNotifyUrl,
    } = await this.globalConfigService.getConfigs([
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatNotifyUrl',
    ]);
    const pay = new this.WxPay({
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      publicKey: payWeChatPublicKey,
      privateKey: payWeChatPrivateKey,
    });
    const params: any = {
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      description: goods.name,
      out_trade_no: orderId,
      notify_url: payWeChatNotifyUrl,
      // amount: {
      //   total: Number(order.total * 100),
      // },
      amount: {
        total: Math.round(order.total * 100),
        // total: round(Number(order.total * 100)), // 确保总金额是一个整数
      },
      // payer: null,
      // scene_info: {
      //   payer_client_ip: '192.168.1.100',

      //   // h5_info: {
      //   //   type: 'Wap',
      //   //   app_name: payWeChatH5Name,
      //   //   app_url: payWeChatH5Url,
      //   // },
      // },
    };
    // 微信支付参数已准备

    // if (payType == 'h5') {
    //   params.scene_info.h5_info = {
    //     type: 'Wap',
    //     app_name: payWeChatH5Name,
    //     app_url: payWeChatH5Url,
    //   };
    //   const res = await pay.transactions_h5(params);
    //   if (res.status === 403) {
    //     const errmsg = res?.errRaw?.response?.text?.message;
    //     throw new HttpException(res?.message || '微信H5支付失败！', HttpStatus.BAD_REQUEST);
    //   }
    //   const { h5_url } = res;
    //   return { url: h5_url };
    // }
    // if (payType == 'jsapi') {
    //   // query openid
    //   const openid = await this.userService.getOpenIdByUserId(userId);
    //   // 用户openId已获取
    //   params['payer'] = {
    //     openid: openid,
    //   };
    //   const result = await pay.transactions_jsapi(params);
    //   // jsapi支付结果已返回
    //   return result;
    // }
    if (payType == 'jsapi') {
      // 开始JSAPI支付流程
      // 查询用户的openid
      const openid = await this.userService.getOpenIdByUserId(userId);
      // 用户OpenID已获取

      // 构建支付请求参数
      params['payer'] = { openid: openid };
      // 支付请求参数已准备

      try {
        // 发送支付请求
        const response = await pay.transactions_jsapi(params);
        // 检查响应结构中是否有 data 字段，如果有，则直接使用 data 字段的内容；否则，使用整个响应内容
        const result = response.data ? response.data : response;
        // JSAPI支付请求成功

        // 直接返回 result，确保不含 data 字段，并包含 status
        return {
          status: response.status || 'unknown', // 如果原始响应中有 status 字段，使用之；否则默认为 'unknown'
          appId: result.appId || result.data?.appId,
          timeStamp: result.timeStamp || result.data?.timeStamp,
          nonceStr: result.nonceStr || result.data?.nonceStr,
          package: result.package || result.data?.package,
          signType: result.signType || result.data?.signType,
          paySign: result.paySign || result.data?.paySign,
        };
      } catch (error) {
        Logger.error(`微信JSAPI支付失败: ${error.message}`, error?.stack, 'PayService');
        throw new HttpException('JSAPI支付失败', HttpStatus.BAD_REQUEST);
      }
    }

    if (payType == 'native') {
      // 开始微信Native支付流程

      try {
        const res = await pay.transactions_native(params);
        // 微信Native支付响应已接收

        const url_qrcode = res.code_url || res.data?.code_url;

        if (!url_qrcode) {
          Logger.warn('微信Native支付请求成功但未返回 code_url', 'PayService');
        } else {
          // 微信Native支付请求成功
        }

        return { url_qrcode, isRedirect: false };
      } catch (error) {
        Logger.error('微信Native支付失败', error?.stack, 'PayService');
        throw new HttpException('微信Native支付失败', HttpStatus.BAD_REQUEST);
      }
    } else {
      Logger.warn(`支付请求使用了不支持的支付类型: ${payType}`, 'PayService');
      throw new HttpException('unsupported pay type', HttpStatus.BAD_REQUEST);
    }
  }

  //   if (payType == 'native') {
  //     const res = await pay.transactions_native(params);
  //     const { code_url: url_qrcode } = res;
  //     if (!url_qrcode) {
  //       // wx-native响应已处理
  //     }

  //     return { url_qrcode, isRedirect: false };
  //   }
  //   throw new HttpException('unsupported pay type', HttpStatus.BAD_REQUEST);
  // }

  /* 微信支付商户信息查询 */
  async queryWeChat(orderId: string) {
    // assemble params
    const {
      payWeChatAppId,
      payWeChatMchId,
      payWeChatPublicKey,
      payWeChatPrivateKey,
      payWeChatNotifyUrl,
    } = await this.globalConfigService.getConfigs([
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
    ]);
    const pay = new this.WxPay({
      appid: payWeChatAppId,
      mchid: payWeChatMchId,
      publicKey: payWeChatPublicKey,
      privateKey: payWeChatPrivateKey,
    });
    const result = await pay.query({ out_trade_no: orderId });
    return result;
  }

  /* 加密签名 */
  sign(params: object, secret: string) {
    const str =
      Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&') + secret;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /* 蓝兔支付签名 */
  ltzfSign(params: object, secret: string) {
    const paramsArr = Object.keys(params);
    paramsArr.sort();
    const stringArr = [];
    paramsArr.map(key => {
      stringArr.push(key + '=' + params[key]);
    });
    // 最后加上商户Key
    stringArr.push('key=' + secret);
    const str = stringArr.join('&');
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
  }

  /* 蓝兔支付 */
  async payLtzf(userId: number, orderId: string, payType = 'wxpay') {
    const order = await this.orderEntity.findOne({
      where: { userId, orderId },
    });
    if (!order) throw new HttpException('订单不存在!', HttpStatus.BAD_REQUEST);
    const goods = await this.cramiPackageEntity.findOne({
      where: { id: order.goodsId },
    });
    if (!goods) throw new HttpException('套餐不存在!', HttpStatus.BAD_REQUEST);
    const { payLtzfMchId, payLtzfKey, payLtzfNotifyUrl, payLtzfReturnUrl } =
      await this.globalConfigService.getConfigs([
        'payLtzfMchId',
        'payLtzfKey',
        'payLtzfNotifyUrl',
        'payLtzfReturnUrl',
      ]);
    const params = {};
    params['mch_id'] = payLtzfMchId; //商户号
    params['timestamp'] = (Date.now() / 1000).toFixed(0); //时间
    params['out_trade_no'] = orderId; //商户订单号
    params['body'] = goods.name; //订单标题
    params['total_fee'] = order.total; //订单金额
    params['notify_url'] = payLtzfNotifyUrl; //通知回调地址
    params['sign'] = this.ltzfSign(params, payLtzfKey); //签名
    params['attach'] = 'ltzf'; //备注
    params['return_url'] = payLtzfReturnUrl; //回调
    const formBody = Object.keys(params)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
      .join('&');
    const config = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    const response = await axios.post(
      'https://api.ltzf.cn/api/wxpay/jsapi_convenient',
      formBody,
      config,
    );
    //const response = await axios.post(payLtzfGatewayUrl || 'https://api.ltzf.cn/api/wxpay/jsapi_convenient', params);
    const { code, data, msg } = response.data;
    if (code != 0) throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    const url_qrcode = data.QRcode_url;
    const url = data.order_url;
    return { url_qrcode, url };
  }

  /* 蓝兔支付商户查询 */
  async queryLtzf(orderId: string) {
    const { payLtzfMchId, payLtzfKey } = await this.globalConfigService.getConfigs([
      'payLtzfMchId',
      'payLtzfKey',
    ]);
    const params = {};
    params['mch_id'] = payLtzfMchId;
    params['timestamp'] = (Date.now() / 1000).toFixed(0);
    params['out_trade_no'] = orderId;
    params['sign'] = this.ltzfSign(params, payLtzfKey);
    const formBody = Object.keys(params)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
      .join('&');
    const config = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    const {
      data: { code, msg, data: result },
    } = await axios.post('https://api.ltzf.cn/api/wxpay/get_pay_order', formBody, config);
    if (code != 0) throw new HttpException(msg + JSON.stringify(params), HttpStatus.BAD_REQUEST);
    return result;
  }

  /* 蓝兔支付通知 */
  async notifyLtzf(params: object) {
    try {
      const { payLtzfKey, payLtzfMchId } = await this.globalConfigService.getConfigs([
        'payLtzfKey',
        'payLtzfMchId',
      ]);
      const hash = params['sign'];
      const successTime = params['success_time'];
      delete params['sign'];
      delete params['pay_channel'];
      delete params['trade_type'];
      delete params['success_time'];
      delete params['attach'];
      delete params['openid'];
      if (this.ltzfSign(params, payLtzfKey) != hash) return 'FAIL';
      if (String(params['mch_id']) !== String(payLtzfMchId)) return 'FAIL';

      const result = await this.markOrderPaidAndDeliver(params['out_trade_no'], {
        tradeId: params['transaction_id'] || successTime,
        validate: async order => this.assertCnyAmountMatchesOrder(order, params['total_fee']),
      });

      return result.success ? 'SUCCESS' : 'FAIL';
    } catch (error) {
      Logger.warn(`[蓝兔支付回调] 处理失败: ${error.message}`, 'PayService');
      return 'FAIL';
    }
  }

  /* 处理易支付主动查询确认成功 */
  async handlePolledEpayOrderPaid(orderId: string, paymentInfo: any) {
    await this.markOrderPaidAndDeliver(orderId, {
      tradeId: paymentInfo?.trade_no,
      validate: async order => {
        if (
          paymentInfo?.out_trade_no &&
          String(paymentInfo.out_trade_no) !== String(order.orderId)
        ) {
          throw new HttpException('易支付查询订单号不匹配', HttpStatus.BAD_REQUEST);
        }
        this.assertCnyAmountMatchesOrder(order, paymentInfo?.money);
      },
    });
  }

  /* 处理支付宝主动查询确认成功 */
  async handlePolledAlipayOrderPaid(orderId: string, paymentInfo: any) {
    await this.markOrderPaidAndDeliver(orderId, {
      tradeId: paymentInfo?.trade_no,
      validate: async order => {
        if (
          paymentInfo?.out_trade_no &&
          String(paymentInfo.out_trade_no) !== String(order.orderId)
        ) {
          throw new HttpException('支付宝查询订单号不匹配', HttpStatus.BAD_REQUEST);
        }
        this.assertCnyAmountMatchesOrder(
          order,
          paymentInfo?.total_amount || paymentInfo?.buyer_pay_amount,
        );
      },
    });
  }
}
