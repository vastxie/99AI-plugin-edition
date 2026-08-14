import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import Stripe from 'stripe';

interface StripeSession {
  id: string;
  payment_status: string;
  url: string;
  amount_total: number;
  currency: string;
}

@Injectable()
export class StripeService {
  private stripe: Stripe;
  private stripeCacheKey = '';

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private normalizeMode(mode?: string): 'test' | 'live' {
    return String(mode || 'test')
      .trim()
      .toLowerCase() === 'live'
      ? 'live'
      : 'test';
  }

  private getClientCacheKey(secretKey: string, mode: string): string {
    return `${mode}:${secretKey}`;
  }

  private getApiCallbackUrl(path: string): string {
    const apiUrl = String(process.env.API_URL || 'http://localhost:9520')
      .trim()
      .replace(/\/$/, '');
    return `${apiUrl}${path}`;
  }

  private ensureSessionIdPlaceholder(url: string): string {
    if (url.includes('{CHECKOUT_SESSION_ID}')) return url;

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
  }

  private assertLiveCallbackUrl(url: string, mode: 'test' | 'live') {
    if (mode !== 'live') return;

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'https:') return;
    } catch {
      // fall through to a clear configuration error
    }

    throw new HttpException(
      'Stripe生产环境需要配置公网HTTPS回调地址，请设置 API_URL',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * 获取Stripe客户端
   */
  private async getStripeClient(): Promise<Stripe> {
    const configs = await this.globalConfigService.getConfigs(['stripeSecretKey', 'stripeMode']);

    if (!configs.stripeSecretKey) {
      throw new HttpException('Stripe配置信息不完整', HttpStatus.BAD_REQUEST);
    }

    const secretKey = String(configs.stripeSecretKey).trim();
    const mode = this.normalizeMode(configs.stripeMode);
    const cacheKey = this.getClientCacheKey(secretKey, mode);
    if (this.stripe && this.stripeCacheKey === cacheKey) {
      return this.stripe;
    }

    const apiVersion = '2024-12-18.acacia' as Stripe.LatestApiVersion;

    this.stripe = new Stripe(secretKey, {
      apiVersion,
      typescript: true,
    });
    this.stripeCacheKey = cacheKey;

    Logger.debug(`Stripe客户端初始化成功 (模式: ${mode})`, 'StripeService');
    return this.stripe;
  }

  /**
   * 创建Stripe Checkout Session
   */
  async createCheckoutSession(
    amount: number | string,
    orderId: string,
    description?: string,
  ): Promise<StripeSession> {
    // 容错处理：确保金额是数字类型
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      Logger.error(`无效的金额值: ${amount}`, undefined, 'StripeService');
      throw new HttpException('无效的支付金额', HttpStatus.BAD_REQUEST);
    }

    const stripe = await this.getStripeClient();

    const configs = await this.globalConfigService.getConfigs(['siteName', 'stripeMode']);

    const mode = this.normalizeMode(configs.stripeMode);
    const successUrl = this.ensureSessionIdPlaceholder(
      this.getApiCallbackUrl('/api/pay/stripe/success'),
    );
    const cancelUrl = this.getApiCallbackUrl('/api/pay/stripe/cancel');
    this.assertLiveCallbackUrl(successUrl, mode);
    this.assertLiveCallbackUrl(cancelUrl, mode);

    Logger.log('Stripe 回调地址校验通过', 'StripeService');

    // Stripe使用分为单位，所以需要乘以100
    const finalAmount = Math.round(numericAmount * 100);

    try {
      Logger.log(`创建Stripe订单 - USD: $${numericAmount.toFixed(2)}`, 'StripeService');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: description || `${configs.siteName || '99AI Plugin Edition'} - 订单 ${orderId}`,
                description: `订单号: ${orderId}`,
              },
              unit_amount: finalAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId,
        },
        payment_intent_data: {
          metadata: {
            orderId,
          },
        },
      });

      Logger.log(`Stripe Session创建成功: ${session.id}`, 'StripeService');
      return {
        id: session.id,
        payment_status: session.payment_status,
        url: session.url,
        amount_total: session.amount_total,
        currency: session.currency,
      };
    } catch (error) {
      const errorMessage = error.message || '创建Stripe订单失败';
      Logger.error(`创建Stripe Session失败: ${errorMessage}`, error?.stack, 'StripeService');

      // 处理特定错误
      if (error.type === 'StripeAuthenticationError') {
        throw new HttpException('Stripe密钥无效，请检查配置', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 验证支付状态
   */
  async verifyPayment(sessionId: string): Promise<any> {
    const stripe = await this.getStripeClient();

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'line_items'],
      });

      Logger.log(`Stripe支付验证: ${sessionId} - 状态: ${session.payment_status}`, 'StripeService');

      return {
        id: session.id,
        status: session.payment_status,
        orderId: session.metadata?.orderId,
        amount: session.amount_total / 100, // 转回美元
        currency: session.currency,
        paymentIntent: session.payment_intent,
        customerEmail: session.customer_details?.email,
      };
    } catch (error) {
      Logger.error(`验证Stripe支付失败: ${error.message}`, error?.stack, 'StripeService');
      throw new HttpException('验证Stripe支付失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 处理Webhook通知
   */
  async handleWebhook(signature: string, payload: string | Buffer): Promise<Stripe.Event> {
    const configs = await this.globalConfigService.getConfigs(['stripeWebhookSecret']);

    if (!configs.stripeWebhookSecret) {
      Logger.error('Stripe Webhook Secret未配置，拒绝处理Webhook', undefined, 'StripeService');
      throw new HttpException('Stripe Webhook Secret未配置', HttpStatus.UNAUTHORIZED);
    }

    const stripe = await this.getStripeClient();

    try {
      const event = stripe.webhooks.constructEvent(payload, signature, configs.stripeWebhookSecret);

      Logger.log(`收到Stripe Webhook事件: ${event.type}`, 'StripeService');

      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          Logger.log(
            `支付成功: ${session.id}, 订单ID: ${session.metadata?.orderId}`,
            'StripeService',
          );
          break;

        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          Logger.log(`付款成功: ${paymentIntent.id}`, 'StripeService');
          break;

        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as Stripe.PaymentIntent;
          Logger.warn(`付款失败: ${failedPayment.id}`, 'StripeService');
          break;

        default:
          Logger.log(`未处理的事件类型: ${event.type}`, 'StripeService');
      }

      return event;
    } catch (error) {
      Logger.error(`处理Stripe Webhook失败: ${error.message}`, error?.stack, 'StripeService');
      throw new HttpException('Webhook签名验证失败', HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * 创建退款
   */
  async refund(paymentIntentId: string, amount?: number, reason?: string): Promise<any> {
    const stripe = await this.getStripeClient();

    try {
      const refundData: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer' as Stripe.RefundCreateParams.Reason,
        metadata: {
          note: reason || '退款处理',
        },
      };

      // 如果指定了金额，则进行部分退款（转为分）
      if (amount) {
        refundData.amount = Math.round(amount * 100);
      }

      const refund = await stripe.refunds.create(refundData);

      Logger.log(`Stripe退款成功: ${refund.id}`, 'StripeService');
      return {
        id: refund.id,
        status: refund.status,
        amount: refund.amount / 100, // 转回美元
        currency: refund.currency,
      };
    } catch (error) {
      Logger.error(`Stripe退款失败: ${error.message}`, error?.stack, 'StripeService');
      throw new HttpException(error.message || 'Stripe退款失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 查询支付意图状态
   */
  async queryPaymentIntent(paymentIntentId: string): Promise<any> {
    const stripe = await this.getStripeClient();

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100, // 转回美元
        currency: paymentIntent.currency,
        metadata: paymentIntent.metadata,
        created: new Date(paymentIntent.created * 1000),
      };
    } catch (error) {
      Logger.error(`查询Stripe支付意图失败: ${error.message}`, error?.stack, 'StripeService');
      throw new HttpException(
        error.message || '查询Stripe支付失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
