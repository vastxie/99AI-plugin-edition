import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { AlipaySdk } from 'alipay-sdk';

@Injectable()
export class AlipayService {
  private alipaySdk: AlipaySdk | null = null;
  private alipaySdkCacheKey = '';

  constructor(private readonly globalConfigService: GlobalConfigService) {}

  /**
   * 初始化支付宝SDK
   */
  private async getAlipaySdk(): Promise<AlipaySdk> {
    const configs = await this.globalConfigService.getConfigs([
      'alipayAppId',
      'alipayPrivateKey',
      'alipayPublicKey',
    ]);

    const { alipayAppId, alipayPrivateKey, alipayPublicKey } = configs;

    if (!alipayAppId || !alipayPrivateKey || !alipayPublicKey) {
      throw new HttpException('支付宝支付配置不完整', HttpStatus.BAD_REQUEST);
    }

    const cacheKey = `${alipayAppId}:${alipayPrivateKey}:${alipayPublicKey}`;
    if (this.alipaySdk && this.alipaySdkCacheKey === cacheKey) {
      return this.alipaySdk;
    }

    this.alipaySdk = new AlipaySdk({
      appId: alipayAppId,
      privateKey: alipayPrivateKey,
      alipayPublicKey: alipayPublicKey,
      signType: 'RSA2',
      gateway: 'https://openapi.alipay.com/gateway.do',
    });
    this.alipaySdkCacheKey = cacheKey;

    return this.alipaySdk;
  }

  /**
   * 创建电脑网站支付
   * @param outTradeNo 商户订单号
   * @param totalAmount 订单金额
   * @param subject 订单标题
   * @param returnUrl 同步回调地址
   */
  async createPagePay(
    outTradeNo: string,
    totalAmount: number,
    subject: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      const sdk = await this.getAlipaySdk();

      const configs = await this.globalConfigService.getConfigs([
        'alipayNotifyUrl',
        'alipayReturnUrl',
      ]);

      const amount = Number(totalAmount).toFixed(2);

      const notifyUrl = configs.alipayNotifyUrl;
      const finalReturnUrl = returnUrl || configs.alipayReturnUrl;

      Logger.log(
        `支付宝支付参数: outTradeNo=${outTradeNo}, amount=${amount}, returnUrl=${finalReturnUrl}, notifyUrl=${notifyUrl}`,
        'AlipayService',
      );

      if (!notifyUrl) {
        throw new HttpException('支付宝异步通知地址未配置', HttpStatus.BAD_REQUEST);
      }

      if (!finalReturnUrl) {
        throw new HttpException('支付宝同步返回地址未配置', HttpStatus.BAD_REQUEST);
      }

      const result = sdk.pageExec('alipay.trade.page.pay', {
        bizContent: {
          out_trade_no: outTradeNo,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          total_amount: amount,
          subject: subject,
          qr_pay_mode: '4',
          qrcode_width: '200',
        },
        returnUrl: finalReturnUrl,
        notifyUrl: notifyUrl,
      });

      Logger.log(`支付宝电脑网站支付创建成功: ${outTradeNo}`, 'AlipayService');

      return result;
    } catch (error) {
      Logger.error(`支付宝电脑网站支付创建失败: ${error.message}`, error.stack, 'AlipayService');
      throw new HttpException('支付宝支付创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 创建手机网站支付
   * @param outTradeNo 商户订单号
   * @param totalAmount 订单金额
   * @param subject 订单标题
   * @param returnUrl 同步回调地址
   */
  async createWapPay(
    outTradeNo: string,
    totalAmount: number,
    subject: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      const sdk = await this.getAlipaySdk();

      const configs = await this.globalConfigService.getConfigs([
        'alipayNotifyUrl',
        'alipayReturnUrl',
      ]);

      const amount = Number(totalAmount).toFixed(2);

      const notifyUrl = configs.alipayNotifyUrl;
      const finalReturnUrl = returnUrl || configs.alipayReturnUrl;

      Logger.log(
        `支付宝手机支付参数: outTradeNo=${outTradeNo}, amount=${amount}, returnUrl=${finalReturnUrl}, notifyUrl=${notifyUrl}`,
        'AlipayService',
      );

      if (!notifyUrl) {
        throw new HttpException('支付宝异步通知地址未配置', HttpStatus.BAD_REQUEST);
      }

      if (!finalReturnUrl) {
        throw new HttpException('支付宝同步返回地址未配置', HttpStatus.BAD_REQUEST);
      }

      const result = sdk.pageExec('alipay.trade.wap.pay', {
        bizContent: {
          out_trade_no: outTradeNo,
          product_code: 'QUICK_WAP_WAY',
          total_amount: amount,
          subject: subject,
          quit_url: finalReturnUrl,
        },
        returnUrl: finalReturnUrl,
        notifyUrl: notifyUrl,
      });

      Logger.log(`支付宝手机网站支付创建成功: ${outTradeNo}`, 'AlipayService');

      return result;
    } catch (error) {
      Logger.error(`支付宝手机网站支付创建失败: ${error.message}`, error.stack, 'AlipayService');
      throw new HttpException('支付宝支付创建失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 验证支付回调签名
   * @param params 回调参数
   * @returns 是否验证通过
   */
  async verifyNotifySign(params: Record<string, any>): Promise<boolean> {
    try {
      const sdk = await this.getAlipaySdk();
      return sdk.checkNotifySign(params);
    } catch (error) {
      Logger.error(`支付宝签名验证失败: ${error.message}`, error.stack, 'AlipayService');
      return false;
    }
  }

  /**
   * 查询订单支付状态
   * @param outTradeNo 商户订单号
   */
  async queryOrder(outTradeNo: string): Promise<any> {
    try {
      const sdk = await this.getAlipaySdk();

      const result = await sdk.exec('alipay.trade.query', {
        bizContent: {
          out_trade_no: outTradeNo,
        },
      });

      return result;
    } catch (error) {
      Logger.error(`支付宝订单查询失败: ${error.message}`, error.stack, 'AlipayService');
      throw new HttpException('订单查询失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
