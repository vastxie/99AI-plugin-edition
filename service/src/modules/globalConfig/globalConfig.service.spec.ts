import { GlobalConfigService } from './globalConfig.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('GlobalConfigService.queryFrontConfig', () => {
  const createService = () => {
    const configEntity = {
      find: jest.fn(),
    };
    const service = new GlobalConfigService(
      configEntity as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service as any, 'getConfigs').mockResolvedValue({
      wechatOfficialAppId: '',
      wechatOfficialAppSecret: '',
    });

    return { service, configEntity };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('does not persist the public domain query parameter', async () => {
    const { service, configEntity } = createService();
    configEntity.find.mockResolvedValueOnce([{ configKey: 'siteName', configVal: '99AI' }]);
    (service as any).globalConfigs = { domain: 'https://safe.example' };
    const createOrUpdateSpy = jest.spyOn(service as any, 'createOrUpdate');
    const initGetAllConfigSpy = jest.spyOn(service as any, 'initGetAllConfig');

    await expect(
      service.queryFrontConfig({ domain: 'https://evil.example' }, {} as any),
    ).resolves.toMatchObject({
      siteName: '99AI',
      isUseWxLogin: false,
    });

    expect(createOrUpdateSpy).not.toHaveBeenCalled();
    expect(initGetAllConfigSpy).not.toHaveBeenCalled();
  });
});
