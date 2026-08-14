import Stripe from 'stripe';
import { StripeService } from './stripe.service';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('StripeService', () => {
  const StripeMock = Stripe as unknown as any;
  const createSessionMock = jest.fn();
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

    return new StripeService(globalConfigService as any);
  };

  beforeEach(() => {
    originalApiUrl = process.env.API_URL;
    delete process.env.API_URL;
    configs = {
      stripeSecretKey: 'sk_test_123',
      stripeMode: 'test',
      siteName: '99AI',
      stripeSuccessUrl: '',
      stripeCancelUrl: '',
    };
    createSessionMock.mockReset();
    createSessionMock.mockResolvedValue({
      id: 'cs_123',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.com/pay/cs_123',
      amount_total: 100,
      currency: 'usd',
    });
    StripeMock.mockReset();
    StripeMock.mockImplementation(() => ({
      checkout: {
        sessions: {
          create: createSessionMock,
        },
      },
    }));
  });

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }
  });

  it('reinitializes the client after switching from test to live credentials', async () => {
    const service = createService();

    await service.createCheckoutSession(1, 'order-test', '套餐');

    process.env.API_URL = 'https://api.example.com';
    configs = {
      ...configs,
      stripeSecretKey: 'sk_live_123',
      stripeMode: 'live',
    };

    await service.createCheckoutSession(1, 'order-live', '套餐');

    expect(StripeMock).toHaveBeenCalledTimes(2);
    expect(StripeMock.mock.calls[0][0]).toBe('sk_test_123');
    expect(StripeMock.mock.calls[1][0]).toBe('sk_live_123');
  });

  it('rejects live mode when callback URLs are not public HTTPS URLs', async () => {
    configs = {
      ...configs,
      stripeSecretKey: 'sk_live_123',
      stripeMode: 'live',
    };

    const service = createService();

    await expect(service.createCheckoutSession(1, 'order-1', '套餐')).rejects.toThrow(
      'Stripe生产环境需要配置公网HTTPS回调地址',
    );
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('uses backend API callback URLs even when legacy success URLs are configured', async () => {
    process.env.API_URL = 'https://api.example.com';
    configs = {
      ...configs,
      stripeSuccessUrl: 'https://chat.example.com/stripe/success',
      stripeCancelUrl: 'https://chat.example.com/stripe/cancel',
    };

    const service = createService();

    await service.createCheckoutSession(1, 'order-1', '套餐');

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          'https://api.example.com/api/pay/stripe/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://api.example.com/api/pay/stripe/cancel',
      }),
    );
  });
});
