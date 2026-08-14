import axios from 'axios';
import { PayPalService } from './paypal.service';

jest.mock('axios');

declare const beforeEach: any;
declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PayPalService', () => {
  const mockedAxios = axios as any;
  let configs: Record<string, string>;
  let originalApiUrl: string | undefined;

  const createService = () => {
    const globalConfigService = {
      getConfigs: jest.fn().mockImplementation(async (keys: string[]) => {
        return keys.reduce((result, key) => {
          result[key] = configs[key];
          return result;
        }, {} as Record<string, string>);
      }),
    };

    return new PayPalService(globalConfigService as any);
  };

  beforeEach(() => {
    originalApiUrl = process.env.API_URL;
    delete process.env.API_URL;
    configs = {
      payPalClientId: 'sandbox-client',
      payPalClientSecret: 'sandbox-secret',
      payPalMode: 'sandbox',
      siteName: '99AI',
      payPalReturnUrl: '',
      payPalCancelUrl: '',
    };
    mockedAxios.post.mockReset();
  });

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }
  });

  it('does not reuse sandbox access token after switching to live credentials', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'sandbox-token', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'live-token', expires_in: 3600 } });

    const service = createService();

    await expect(service.getAccessToken()).resolves.toBe('sandbox-token');

    configs = {
      ...configs,
      payPalClientId: 'live-client',
      payPalClientSecret: 'live-secret',
      payPalMode: 'live',
    };

    await expect(service.getAccessToken()).resolves.toBe('live-token');
    await expect(service.getAccessToken()).resolves.toBe('live-token');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
    );
    expect(mockedAxios.post.mock.calls[1][0]).toBe('https://api-m.paypal.com/v1/oauth2/token');
  });

  it('rejects live mode when callback URLs are not public HTTPS URLs', async () => {
    configs = {
      ...configs,
      payPalMode: 'live',
      payPalClientId: 'live-client',
      payPalClientSecret: 'live-secret',
    };

    const service = createService();

    await expect(service.createOrder(1, 'order-1', '套餐')).rejects.toThrow(
      'PayPal生产环境需要配置公网HTTPS回调地址',
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('uses backend API callback URLs even when legacy return URLs are configured', async () => {
    process.env.API_URL = 'https://api.example.com';
    configs = {
      ...configs,
      payPalReturnUrl: 'https://chat.example.com/paypal/success',
      payPalCancelUrl: 'https://chat.example.com/paypal/cancel',
    };
    mockedAxios.post
      .mockResolvedValueOnce({ data: { access_token: 'sandbox-token', expires_in: 3600 } })
      .mockResolvedValueOnce({
        data: {
          id: 'paypal-order-1',
          status: 'CREATED',
          links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow' }],
          purchase_units: [{ amount: { value: '1.00', currency_code: 'USD' } }],
        },
      });

    const service = createService();

    await service.createOrder(1, 'order-1', '套餐');

    const orderPayload = mockedAxios.post.mock.calls[1][1];
    expect(orderPayload.application_context.return_url).toBe(
      'https://api.example.com/api/pay/paypal/success',
    );
    expect(orderPayload.application_context.cancel_url).toBe(
      'https://api.example.com/api/pay/paypal/cancel',
    );
  });
});
