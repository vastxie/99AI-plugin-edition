import { HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AppService user-side access policy', () => {
  const createService = () => {
    const appEntity = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const service = new AppService({} as any, appEntity as any, {} as any, {} as any);
    return { service, appEntity };
  };

  it('allows an enabled system app through the centralized predicate', async () => {
    const { service, appEntity } = createService();
    appEntity.findOne.mockResolvedValueOnce({ id: 4, status: 1, userId: null });

    await expect(service.getAccessibleApp(4, { id: 8, role: 'user' })).resolves.toMatchObject({
      id: 4,
    });

    expect(appEntity.findOne).toHaveBeenCalledWith({
      where: expect.arrayContaining([
        expect.objectContaining({ id: 4, userId: expect.anything() }),
        expect.objectContaining({ id: 4, public: true }),
        expect.objectContaining({ id: 4, userId: 8 }),
      ]),
    });
  });

  it('rejects hidden, disabled, or someone else\'s private app', async () => {
    const { service, appEntity } = createService();
    appEntity.findOne.mockResolvedValueOnce(null);

    await expect(service.getAccessibleApp(9, { id: 8, role: 'user' })).rejects.toMatchObject({
      response: '应用不存在或无权访问！',
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('filters bulk lookups through the same visibility boundary', async () => {
    const { service, appEntity } = createService();
    appEntity.find.mockResolvedValueOnce([{ id: 4, status: 1 }]);

    await expect(
      service.getAccessibleApps([4, 4, -1, 'invalid'], { id: 8, role: 'user' }),
    ).resolves.toEqual([{ id: 4, status: 1 }]);

    expect(appEntity.find).toHaveBeenCalledWith({
      where: expect.arrayContaining([
        expect.objectContaining({ userId: expect.anything() }),
        expect.objectContaining({ public: true }),
        expect.objectContaining({ userId: 8 }),
      ]),
    });
  });

  it('never returns the Flowith key from the public detail DTO', async () => {
    const { service } = createService();
    jest.spyOn(service, 'getAccessibleApp').mockResolvedValueOnce({
      id: 4,
      coverImg: '',
      des: 'description',
      name: 'app',
      isGPTs: 0,
      isFlowith: 1,
      flowithId: 'knowledge-id',
      flowithName: 'model',
      flowithKey: 'secret-flowith-key',
      isFixedModel: 0,
      appModel: '',
      backgroundImg: '',
      prompt: '',
    } as any);

    const result = await service.queryOneCat(
      { id: 4 },
      { user: { id: 8, role: 'user' } } as any,
    );

    expect(result).not.toHaveProperty('flowithKey');
  });
});
