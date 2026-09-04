import { SpaController } from './spa.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('SpaController', () => {
  it('does not serve the chat shell for /health', () => {
    const controller = new SpaController();
    const next = jest.fn();
    const res = { sendFile: jest.fn(), status: jest.fn() };

    controller.serveClient({ path: '/health' } as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it.each(['/health/', '/health///', '/health%2F'])(
    'does not serve the chat shell for the health path %s',
    path => {
      const controller = new SpaController();
      const next = jest.fn();
      const res = { sendFile: jest.fn(), status: jest.fn() };

      controller.serveClient({ path } as any, res as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.sendFile).not.toHaveBeenCalled();
    },
  );

  it('does not serve the chat shell for /api routes', () => {
    const controller = new SpaController();
    const next = jest.fn();
    const res = { sendFile: jest.fn(), status: jest.fn() };

    controller.serveClient({ path: '/api/health' } as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('continues to serve the chat shell for client routes', () => {
    const controller = new SpaController();
    const next = jest.fn();
    const res = { sendFile: jest.fn(), status: jest.fn() };
    (controller as any).exists = true;

    controller.serveClient({ path: '/conversation' } as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.sendFile).toHaveBeenCalledTimes(1);
  });
});
