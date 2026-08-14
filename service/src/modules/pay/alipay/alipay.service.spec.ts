import { AlipaySdk } from 'alipay-sdk';
import { AlipayService } from './alipay.service';

jest.mock('alipay-sdk', () => ({
  AlipaySdk: jest.fn(),
}));

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AlipayService', () => {
  const AlipaySdkMock = AlipaySdk as unknown as any;
  const pageExecMock = jest.fn();
  let configs: Record<string, string>;

  const createService = () => {
    const globalConfigService = {
      getConfigs: jest.fn().mockImplementation(async (keys: string[]) => {
        return keys.reduce((result, key) => {
          result[key] = configs[key];
          return result;
        }, {} as Record<string, string>);
      }),
    };

    return new AlipayService(globalConfigService as any);
  };

  beforeEach(() => {
    configs = {
      alipayAppId: 'app-1',
      alipayPrivateKey: 'private-1',
      alipayPublicKey: 'public-1',
      alipayNotifyUrl: 'https://api.example.com/api/pay/notify',
      alipayReturnUrl: 'https://api.example.com/pay/return',
    };

    pageExecMock.mockReset();
    pageExecMock.mockReturnValue('<form>alipay</form>');
    AlipaySdkMock.mockReset();
    AlipaySdkMock.mockImplementation(() => ({
      pageExec: pageExecMock,
    }));
  });

  it('reuses the SDK while Alipay credentials are unchanged', async () => {
    const service = createService();

    await service.createPagePay('order-1', 1, '套餐', '');
    await service.createPagePay('order-2', 1, '套餐', '');

    expect(AlipaySdkMock).toHaveBeenCalledTimes(1);
  });

  it('reinitializes the SDK after Alipay credentials change', async () => {
    const service = createService();

    await service.createPagePay('order-1', 1, '套餐', '');
    configs = {
      ...configs,
      alipayAppId: 'app-2',
      alipayPrivateKey: 'private-2',
      alipayPublicKey: 'public-2',
    };
    await service.createPagePay('order-2', 1, '套餐', '');

    expect(AlipaySdkMock).toHaveBeenCalledTimes(2);
    expect(AlipaySdkMock.mock.calls[0][0]).toMatchObject({
      appId: 'app-1',
      privateKey: 'private-1',
      alipayPublicKey: 'public-1',
    });
    expect(AlipaySdkMock.mock.calls[1][0]).toMatchObject({
      appId: 'app-2',
      privateKey: 'private-2',
      alipayPublicKey: 'public-2',
    });
  });
});
