import { PayController } from './pay.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PayController.paypalSuccess', () => {
  const createResponse = () => {
    return {
      header: jest.fn(),
      send: jest.fn(html => html),
    };
  };

  it('captures the approved PayPal order on return_url instead of only querying it', async () => {
    const payService = {
      capturePayPal: jest.fn().mockResolvedValue({
        success: true,
        orderId: 'order-1',
        paypalOrderId: 'PAYPAL-ORDER-1',
      }),
    };
    const controller = new PayController(payService as any);
    const response = createResponse();

    await controller.paypalSuccess({ token: 'PAYPAL-ORDER-1' }, response as any);

    expect(payService.capturePayPal).toHaveBeenCalledWith('PAYPAL-ORDER-1');
    expect(response.header).toHaveBeenCalledWith('Content-Type', 'text/html');
    expect(response.send.mock.calls[0][0]).toContain('支付已完成');
  });
});

describe('PayController.stripeSuccess', () => {
  const createResponse = () => {
    return {
      header: jest.fn(),
      send: jest.fn(html => html),
    };
  };

  it('completes the Stripe payment on success_url instead of only querying it', async () => {
    const payService = {
      completeStripePayment: jest.fn().mockResolvedValue({
        success: true,
        orderId: 'order-1',
        stripeSessionId: 'cs_live_1',
      }),
    };
    const controller = new PayController(payService as any);
    const response = createResponse();

    await controller.stripeSuccess({ session_id: 'cs_live_1' }, response as any);

    expect(payService.completeStripePayment).toHaveBeenCalledWith('cs_live_1');
    expect(response.header).toHaveBeenCalledWith('Content-Type', 'text/html');
    expect(response.send.mock.calls[0][0]).toContain('支付已完成');
  });
});
