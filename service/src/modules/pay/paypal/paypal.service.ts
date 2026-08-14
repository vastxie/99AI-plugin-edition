import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import axios from 'axios';
import * as crypto from 'crypto';

interface PayPalOrder {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalCapture {
  id: string;
  status: string;
  purchase_units: Array<{
    reference_id?: string;
    invoice_id?: string;
    payments?: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

@Injectable()
export class PayPalService {
  private accessToken: string = '';
  private tokenExpiry: number = 0;
  private tokenCacheKey: string = '';

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  private normalizeMode(mode?: string): 'sandbox' | 'live' {
    return String(mode || 'sandbox')
      .trim()
      .toLowerCase() === 'live'
      ? 'live'
      : 'sandbox';
  }

  private getApiBaseUrlByMode(mode: 'sandbox' | 'live'): string {
    return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * 获取PayPal API基础URL
   */
  private async getApiBaseUrl(): Promise<string> {
    const configs = await this.globalConfigService.getConfigs(['payPalMode']);
    return this.getApiBaseUrlByMode(this.normalizeMode(configs.payPalMode));
  }

  private getTokenCacheKey(baseUrl: string, clientId: string, clientSecret: string): string {
    return crypto
      .createHash('sha256')
      .update(`${baseUrl}:${clientId}:${clientSecret}`)
      .digest('hex');
  }

  private getApiCallbackUrl(path: string): string {
    const apiUrl = String(process.env.API_URL || 'http://localhost:9520')
      .trim()
      .replace(/\/$/, '');
    return `${apiUrl}${path}`;
  }

  private assertLiveCallbackUrl(url: string, mode: 'sandbox' | 'live') {
    if (mode !== 'live') return;

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'https:') return;
    } catch {
      // fall through to a clear configuration error
    }

    throw new HttpException(
      'PayPal生产环境需要配置公网HTTPS回调地址，请设置 API_URL',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken(): Promise<string> {
    const configs = await this.globalConfigService.getConfigs([
      'payPalClientId',
      'payPalClientSecret',
      'payPalMode',
    ]);

    const clientId = String(configs.payPalClientId || '').trim();
    const clientSecret = String(configs.payPalClientSecret || '').trim();
    const mode = this.normalizeMode(configs.payPalMode);
    const baseUrl = this.getApiBaseUrlByMode(mode);
    const cacheKey = this.getTokenCacheKey(baseUrl, clientId, clientSecret);

    if (!clientId || !clientSecret) {
      throw new HttpException('PayPal配置信息不完整', HttpStatus.BAD_REQUEST);
    }

    // PayPal 的 sandbox/live token 不能混用，缓存必须绑定环境和账号。
    if (this.accessToken && this.tokenExpiry > Date.now() && this.tokenCacheKey === cacheKey) {
      return this.accessToken;
    }

    try {
      // 使用客户端凭据获取访问令牌
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post(
        `${baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenCacheKey = cacheKey;
      const expiresIn = Number(response.data.expires_in) || 3600;
      this.tokenExpiry = Date.now() + Math.max(expiresIn - 300, 60) * 1000;

      Logger.debug(`PayPal访问令牌获取成功(${mode})`, 'PayPalService');
      return this.accessToken;
    } catch (error) {
      Logger.error(
        `获取PayPal访问令牌失败(${mode})，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );
      throw new HttpException('获取PayPal访问令牌失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 创建PayPal订单
   */
  async createOrder(
    amount: number | string,
    orderId: string,
    description?: string,
  ): Promise<PayPalOrder> {
    // 容错处理：确保金额是数字类型
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount) || numericAmount <= 0) {
      Logger.error(`无效的金额值: ${amount}`, undefined, 'PayPalService');
      throw new HttpException('无效的支付金额', HttpStatus.BAD_REQUEST);
    }

    const configs = await this.globalConfigService.getConfigs(['siteName', 'payPalMode']);

    const mode = this.normalizeMode(configs.payPalMode);
    const returnUrl = this.getApiCallbackUrl('/api/pay/paypal/success');
    const cancelUrl = this.getApiCallbackUrl('/api/pay/paypal/cancel');
    this.assertLiveCallbackUrl(returnUrl, mode);
    this.assertLiveCallbackUrl(cancelUrl, mode);

    const accessToken = await this.getAccessToken();
    const baseUrl = this.getApiBaseUrlByMode(mode);

    Logger.log('PayPal 回调地址校验通过', 'PayPalService');

    // PayPal固定使用USD货币
    const currencyCode = 'USD';
    const finalAmount = numericAmount.toFixed(2);

    try {
      Logger.log(`创建PayPal订单 - USD: $${finalAmount}`, 'PayPalService');

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: orderId,
            invoice_id: orderId,
            custom_id: orderId,
            description:
              description || `${configs.siteName || '99AI Plugin Edition'} - 订单 ${orderId}`,
            amount: {
              currency_code: currencyCode,
              value: finalAmount,
            },
          },
        ],
        application_context: {
          brand_name: configs.siteName || '99AI Plugin Edition',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      };

      const response = await axios.post(`${baseUrl}/v2/checkout/orders`, orderData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `${orderId}-${Date.now()}`, // 幂等性键
        },
      });

      Logger.log(`PayPal订单创建成功`, 'PayPalService');
      return response.data;
    } catch (error) {
      const errorData = error.response?.data;
      Logger.error(
        `创建PayPal订单失败，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );

      // 处理特定错误
      if (errorData?.details?.[0]?.issue === 'CURRENCY_NOT_SUPPORTED') {
        const errorMsg = `PayPal不支持${currencyCode}货币，请在管理后台切换为USD或其他支持的货币`;
        Logger.error(errorMsg, undefined, 'PayPalService');
        throw new HttpException(errorMsg, HttpStatus.BAD_REQUEST);
      }

      // 通用错误处理
      throw new HttpException('创建PayPal订单失败，请检查配置或稍后重试', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 捕获支付（完成支付）
   */
  async capturePayment(paypalOrderId: string): Promise<PayPalCapture> {
    const accessToken = await this.getAccessToken();
    const baseUrl = await this.getApiBaseUrl();

    try {
      const response = await axios.post(
        `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation', // 返回完整响应
          },
        },
      );

      Logger.log(`PayPal支付捕获成功`, 'PayPalService');
      return response.data;
    } catch (error) {
      Logger.error(
        `捕获PayPal支付失败，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );

      // 处理特定错误
      if (error.response?.data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
        throw new HttpException('订单已经被捕获', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException('捕获PayPal支付失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 查询订单状态
   */
  async queryOrder(paypalOrderId: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    const baseUrl = await this.getApiBaseUrl();

    try {
      const response = await axios.get(`${baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        id: response.data.id,
        status: response.data.status,
        amount: response.data.purchase_units?.[0]?.amount,
        purchase_units: response.data.purchase_units,
        payer: response.data.payer,
        create_time: response.data.create_time,
        update_time: response.data.update_time,
      };
    } catch (error) {
      Logger.error(
        `查询PayPal订单失败，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );
      throw new HttpException('查询PayPal订单失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 验证Webhook签名
   */
  async verifyWebhookSignature(headers: any, body: any): Promise<boolean> {
    const configs = await this.globalConfigService.getConfigs(['payPalWebhookId']);

    if (!configs.payPalWebhookId) {
      Logger.error('PayPal Webhook ID未配置，拒绝处理Webhook', undefined, 'PayPalService');
      throw new HttpException('PayPal Webhook ID未配置', HttpStatus.UNAUTHORIZED);
    }

    const accessToken = await this.getAccessToken();
    const baseUrl = await this.getApiBaseUrl();

    try {
      const verificationData = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: configs.payPalWebhookId,
        webhook_event: body,
      };

      const response = await axios.post(
        `${baseUrl}/v1/notifications/verify-webhook-signature`,
        verificationData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data.verification_status === 'SUCCESS';
    } catch (error) {
      Logger.error(
        `验证PayPal Webhook签名失败，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );
      return false;
    }
  }

  /**
   * 处理Webhook通知
   */
  async handleWebhook(headers: any, body: any): Promise<void> {
    // 验证签名
    const isValid = await this.verifyWebhookSignature(headers, body);
    if (!isValid) {
      throw new HttpException('Webhook签名验证失败', HttpStatus.UNAUTHORIZED);
    }

    const eventType = body.event_type;
    const resource = body.resource;

    Logger.log(`收到PayPal Webhook事件: ${eventType}`, 'PayPalService');

    switch (eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        // 订单已批准，可以捕获支付
        Logger.log(`订单已批准: ${resource.id}`, 'PayPalService');
        break;

      case 'PAYMENT.CAPTURE.COMPLETED':
        // 支付已完成
        Logger.log(`支付已完成: ${resource.id}`, 'PayPalService');
        // 这里应该更新订单状态
        break;

      case 'PAYMENT.CAPTURE.DENIED':
        // 支付被拒绝
        Logger.warn(`支付被拒绝: ${resource.id}`, 'PayPalService');
        break;

      default:
        Logger.log(`未处理的事件类型: ${eventType}`, 'PayPalService');
    }
  }

  /**
   * 退款
   */
  async refund(captureId: string, amount?: number, reason?: string): Promise<any> {
    const accessToken = await this.getAccessToken();
    const baseUrl = await this.getApiBaseUrl();

    try {
      const refundData: any = {
        note_to_payer: reason || '退款处理',
      };

      // 如果指定了金额，则进行部分退款
      if (amount) {
        refundData.amount = {
          currency_code: 'USD',
          value: amount.toFixed(2),
        };
      }

      const response = await axios.post(
        `${baseUrl}/v2/payments/captures/${captureId}/refund`,
        refundData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `refund-${captureId}-${Date.now()}`,
          },
        },
      );

      Logger.log(`PayPal退款成功`, 'PayPalService');
      return response.data;
    } catch (error) {
      Logger.error(
        `PayPal退款失败，状态码: ${error.response?.status || 'unknown'}`,
        error?.stack,
        'PayPalService',
      );
      throw new HttpException('PayPal退款失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
