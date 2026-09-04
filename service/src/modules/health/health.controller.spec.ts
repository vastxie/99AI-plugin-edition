import { HealthController } from './health.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('HealthController', () => {
  it('returns a liveness payload', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
