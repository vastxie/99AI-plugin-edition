import * as crypto from 'crypto';
import axios from 'axios';
import { PayService } from './pay.service';

jest.mock('axios');

declare const describe: any;
declare const beforeEach: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PayService.notifyWeChat', () => {
  const createService = (verifySignResult = true, configOverrides: Record<string, any> = {}) => {
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({
        payWeChatAppId: 'wx-app',
        payWeChatMchId: 'mch-1',
        payWeChatSecret: 'secret',
        payWeChatPublicKey: 'public-key',
        payWeChatPrivateKey: 'private-key',
        payWeChatVerifyMode: 'platform_cert',
        payWeChatPlatformPublicKeyId: '',
        payWeChatPlatformPublicKey: '',
        ...configOverrides,
      }),
    };
    const orderEntity = {
      manager: {
        transaction: jest.fn(),
      },
    };
    const service = new PayService(
      {} as any,
      orderEntity as any,
      {} as any,
      globalConfigService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const payClient = {
      verifySign: jest.fn().mockResolvedValue(verifySignResult),
      decipher_gcm: jest.fn().mockReturnValue({
        trade_state: 'SUCCESS',
        out_trade_no: 'order-1',
        transaction_id: 'wx-trade-1',
        mchid: 'mch-1',
        appid: 'wx-app',
        amount: { total: 100 },
      }),
    };
    (service as any).WxPay = jest.fn().mockImplementation(() => payClient);
    const deliverSpy = jest
      .spyOn(service as any, 'markOrderPaidAndDeliver')
      .mockResolvedValue({ success: true, delivered: true });

    return { service, payClient, deliverSpy };
  };

  const successPayload = {
    event_type: 'TRANSACTION.SUCCESS',
    resource: {
      ciphertext: 'ciphertext',
      associated_data: 'associated-data',
      nonce: 'nonce',
    },
  };

  const signWeChatBody = (privateKey: string, timestamp: string, nonce: string, body: string) =>
    crypto
      .createSign('RSA-SHA256')
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .sign(privateKey, 'base64');

  it('rejects official WeChat callbacks when any signature header is missing', async () => {
    const { service, payClient, deliverSpy } = createService(true);

    await expect(
      service.notifyWeChat(successPayload, {
        'wechatpay-timestamp': '1710000000',
        'wechatpay-nonce': 'nonce',
        'wechatpay-signature': 'signature',
      }),
    ).resolves.toBe('failed');

    expect(payClient.verifySign).not.toHaveBeenCalled();
    expect(payClient.decipher_gcm).not.toHaveBeenCalled();
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it('rejects official WeChat callbacks when signature verification fails', async () => {
    const { service, payClient, deliverSpy } = createService(false);

    await expect(
      service.notifyWeChat(successPayload, {
        'wechatpay-timestamp': '1710000000',
        'wechatpay-nonce': 'nonce',
        'wechatpay-signature': 'bad-signature',
        'wechatpay-serial': 'serial',
      }),
    ).resolves.toBe('failed');

    expect(payClient.verifySign).toHaveBeenCalled();
    expect(payClient.decipher_gcm).not.toHaveBeenCalled();
    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it('keeps processing signed successful callbacks', async () => {
    const { service, payClient, deliverSpy } = createService(true);

    await expect(
      service.notifyWeChat(successPayload, {
        'wechatpay-timestamp': '1710000000',
        'wechatpay-nonce': 'nonce',
        'wechatpay-signature': 'signature',
        'wechatpay-serial': 'serial',
      }),
    ).resolves.toBe('success');

    expect(payClient.verifySign).toHaveBeenCalled();
    expect(payClient.decipher_gcm).toHaveBeenCalled();
    expect(deliverSpy).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ tradeId: 'wx-trade-1' }),
    );
  });

  it('verifies WeChat Pay public key callbacks without fetching platform certificates', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const timestamp = '1710000000';
    const nonce = 'nonce';
    const body = JSON.stringify(successPayload);
    const signature = signWeChatBody(privateKeyPem, timestamp, nonce, body);
    const { service, payClient, deliverSpy } = createService(true, {
      payWeChatVerifyMode: 'wechatpay_public_key',
      payWeChatPlatformPublicKeyId: 'PUB_KEY_ID_3000000001',
      payWeChatPlatformPublicKey: publicKeyPem,
    });

    await expect(
      service.notifyWeChat(
        successPayload,
        {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': nonce,
          'wechatpay-signature': signature,
          'wechatpay-serial': 'PUB_KEY_ID_3000000001',
        },
        Buffer.from(body),
      ),
    ).resolves.toBe('success');

    expect(payClient.verifySign).not.toHaveBeenCalled();
    expect(payClient.decipher_gcm).toHaveBeenCalled();
    expect(deliverSpy).toHaveBeenCalled();
  });

  it('uses platform certificate verification in auto mode for certificate serials', async () => {
    const { service, payClient } = createService(true, {
      payWeChatVerifyMode: 'auto',
      payWeChatPlatformPublicKeyId: 'PUB_KEY_ID_3000000001',
      payWeChatPlatformPublicKey: 'public-key',
    });

    await expect(
      service.notifyWeChat(successPayload, {
        'wechatpay-timestamp': '1710000000',
        'wechatpay-nonce': 'nonce',
        'wechatpay-signature': 'signature',
        'wechatpay-serial': 'platform-cert-serial',
      }),
    ).resolves.toBe('success');

    expect(payClient.verifySign).toHaveBeenCalled();
  });
});

describe('PayService.capturePayPal', () => {
  const createService = (orderEntity: any, payPalService: any) => {
    return new PayService(
      {} as any,
      orderEntity as any,
      {} as any,
      {} as any,
      {} as any,
      payPalService as any,
      {} as any,
      {} as any,
    );
  };

  it('treats an already delivered PayPal order as idempotent success', async () => {
    const orderEntity = {
      findOne: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        tradeId: 'PAYPAL-ORDER-1',
        status: 1,
      }),
    };
    const payPalService = {
      capturePayment: jest.fn(),
    };
    const service = createService(orderEntity, payPalService);

    await expect(service.capturePayPal('PAYPAL-ORDER-1')).resolves.toMatchObject({
      success: true,
      message: '订单已支付',
      orderId: 'order-1',
      paypalOrderId: 'PAYPAL-ORDER-1',
    });
    expect(payPalService.capturePayment).not.toHaveBeenCalled();
  });

  it('delivers the order when PayPal return_url capture completes', async () => {
    const orderEntity = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ orderId: 'order-1', tradeId: 'PAYPAL-ORDER-1', status: 0 })
        .mockResolvedValueOnce({ orderId: 'order-1', total: 73, count: 1, goodsId: 10, status: 0 }),
      manager: {
        transaction: jest.fn(async callback => {
          const manager = {
            findOne: jest
              .fn()
              .mockResolvedValueOnce({
                orderId: 'order-1',
                total: 73,
                count: 1,
                goodsId: 10,
                status: 0,
              })
              .mockResolvedValueOnce({ id: 10, priceUsd: 10 }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          };
          return callback(manager);
        }),
      },
    };
    const userBalanceService = {
      addBalanceToOrder: jest.fn().mockResolvedValue(undefined),
    };
    const payPalService = {
      capturePayment: jest.fn().mockResolvedValue({
        id: 'PAYPAL-ORDER-1',
        status: 'COMPLETED',
        purchase_units: [
          {
            reference_id: 'order-1',
            payments: {
              captures: [
                {
                  amount: {
                    value: '10.00',
                    currency_code: 'USD',
                  },
                },
              ],
            },
          },
        ],
      }),
    };
    const service = new PayService(
      {} as any,
      orderEntity as any,
      userBalanceService as any,
      {} as any,
      {} as any,
      payPalService as any,
      {} as any,
      {} as any,
    );

    await expect(service.capturePayPal('PAYPAL-ORDER-1')).resolves.toMatchObject({
      success: true,
      message: '支付成功',
      orderId: 'order-1',
      paypalOrderId: 'PAYPAL-ORDER-1',
    });
    expect(payPalService.capturePayment).toHaveBeenCalledWith('PAYPAL-ORDER-1');
    expect(userBalanceService.addBalanceToOrder).toHaveBeenCalled();
  });
});

describe('PayService.completeStripePayment', () => {
  it('treats an already delivered Stripe order as idempotent success', async () => {
    const orderEntity = {
      findOne: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        tradeId: 'cs_live_1',
        status: 1,
      }),
    };
    const stripeService = {
      verifyPayment: jest.fn(),
    };
    const service = new PayService(
      {} as any,
      orderEntity as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      stripeService as any,
      {} as any,
    );

    await expect(service.completeStripePayment('cs_live_1')).resolves.toMatchObject({
      success: true,
      message: '订单已支付',
      orderId: 'order-1',
      stripeSessionId: 'cs_live_1',
    });
    expect(stripeService.verifyPayment).not.toHaveBeenCalled();
  });

  it('delivers the order when Stripe success_url verifies a paid session', async () => {
    const orderEntity = {
      findOne: jest.fn().mockResolvedValue({ orderId: 'order-1', tradeId: 'cs_live_1', status: 0 }),
      manager: {
        transaction: jest.fn(async callback => {
          const manager = {
            findOne: jest
              .fn()
              .mockResolvedValueOnce({
                orderId: 'order-1',
                total: 73,
                count: 1,
                goodsId: 10,
                status: 0,
              })
              .mockResolvedValueOnce({ id: 10, priceUsd: 10 }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          };
          return callback(manager);
        }),
      },
    };
    const userBalanceService = {
      addBalanceToOrder: jest.fn().mockResolvedValue(undefined),
    };
    const stripeService = {
      verifyPayment: jest.fn().mockResolvedValue({
        id: 'cs_live_1',
        status: 'paid',
        orderId: 'order-1',
        amount: 10,
        currency: 'usd',
      }),
    };
    const service = new PayService(
      {} as any,
      orderEntity as any,
      userBalanceService as any,
      {} as any,
      {} as any,
      {} as any,
      stripeService as any,
      {} as any,
    );

    await expect(service.completeStripePayment('cs_live_1')).resolves.toMatchObject({
      success: true,
      message: '支付成功',
      orderId: 'order-1',
      stripeSessionId: 'cs_live_1',
    });
    expect(stripeService.verifyPayment).toHaveBeenCalledWith('cs_live_1');
    expect(userBalanceService.addBalanceToOrder).toHaveBeenCalled();
  });
});

describe('PayService.payEpay', () => {
  const createService = (configOverrides: Record<string, any> = {}) => {
    const cramiPackageEntity = {
      findOne: jest.fn().mockResolvedValue({ id: 10, name: 'Pro', price: 1 }),
    };
    const orderEntity = {
      findOne: jest.fn().mockResolvedValue({ orderId: 'order-1', goodsId: 10, total: 1 }),
    };
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({
        payEpayPid: '1000',
        payEpayKey: 'secret',
        payEpayNotifyUrl: 'https://api.example.com/api/pay/notify',
        payEpayReturnUrl: 'https://chat.example.com/#/chat',
        payEpayApiPayUrl: 'https://pay.example.com/submit.php',
        payEpayApiVersion: 'v1',
        payEpayPrivateKey: '',
        ...configOverrides,
      }),
    };
    const service = new PayService(
      cramiPackageEntity as any,
      orderEntity as any,
      {} as any,
      globalConfigService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service };
  };

  it('includes configured Epay gateway origin for frontend payment URL checks', async () => {
    const { service } = createService();

    await expect(service.payEpay(1, 'order-1', 'alipay', 'pc')).resolves.toMatchObject({
      isRedirect: true,
      redirectUrl: expect.stringContaining('https://pay.example.com/submit.php?'),
      trustedPaymentOrigins: ['https://pay.example.com'],
    });
  });
});

describe('PayService custom payment gateway origins', () => {
  const createService = (configs: Record<string, any> = {}) => {
    const cramiPackageEntity = {
      findOne: jest.fn().mockResolvedValue({ id: 10, name: 'Pro', price: 1 }),
    };
    const orderEntity = {
      findOne: jest.fn().mockResolvedValue({ orderId: 'order-1', goodsId: 10, total: 1 }),
    };
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue(configs),
    };
    const service = new PayService(
      cramiPackageEntity as any,
      orderEntity as any,
      {} as any,
      globalConfigService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes configured Mpay gateway origin for frontend payment URL checks', async () => {
    const { service } = createService({
      payMpayPid: '1000',
      payMpaySecret: 'secret',
      payMpayNotifyUrl: 'https://api.example.com/api/pay/notify',
      payMpayReturnUrl: 'https://chat.example.com/#/chat',
      payMpayApiPayUrl: 'https://mpay.example.com/submit.php',
    });

    await expect(service.payMpay(1, 'order-1', 'wxpay')).resolves.toMatchObject({
      isRedirect: true,
      redirectUrl: expect.stringContaining('https://mpay.example.com/submit.php?'),
      trustedPaymentOrigins: ['https://mpay.example.com'],
    });
  });

  it('includes configured Hupi gateway and returned payment origins for frontend checks', async () => {
    (axios.post as any).mockResolvedValueOnce({
      data: {
        errcode: 0,
        errmsg: '',
        url_qrcode: 'https://cashier.example.com/qrcode/order-1',
        url: 'https://hupi.example.com/pay/order-1',
      },
    });
    const { service } = createService({
      payHupiAppId: 'app-1',
      payHupiAppSecret: 'secret',
      payHupiNotifyUrl: 'https://api.example.com/api/pay/notify',
      payHupiReturnUrl: 'https://chat.example.com/#/chat',
      payHupiGatewayUrl: 'https://hupi.example.com/payment/do.html',
    });

    await expect(service.payHupi(1, 'order-1', 'wxpay')).resolves.toMatchObject({
      url_qrcode: 'https://cashier.example.com/qrcode/order-1',
      url: 'https://hupi.example.com/pay/order-1',
      trustedPaymentOrigins: ['https://hupi.example.com', 'https://cashier.example.com'],
    });
  });
});
