import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  Headers,
  Res,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayService } from './pay.service';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';

@Controller('pay')
@ApiTags('pay')
export class PayController {
  constructor(private readonly payService: PayService) {}

  private getClientUrl(path = '') {
    const fallback = 'http://localhost:9002';
    const configuredUrl = process.env.CLIENT_URL || fallback;
    try {
      const url = new URL(configuredUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return `${fallback}${path}`;
      }
      return `${url.origin}${url.pathname.replace(/\/$/, '')}${path}`;
    } catch {
      return `${fallback}${path}`;
    }
  }

  @Post('notify')
  @ApiOperation({ summary: '支付结果通知' })
  notify(@Headers() headers: any, @Body() body, @Req() req: Request & { rawBody?: Buffer }) {
    return this.payService.notify(body, headers, req.rawBody);
  }

  @Get('notify')
  @ApiOperation({ summary: 'Epay支付结果通知' })
  notifyEpay(@Query() query) {
    return this.payService.notify(query);
  }

  @Post('paypal/capture/:orderId')
  @ApiOperation({ summary: 'PayPal支付捕获（完成支付）' })
  @UseGuards(JwtAuthGuard)
  async capturePayPal(@Param('orderId') orderId: string, @Req() req: Request) {
    return this.payService.capturePayPalForUser(req.user.id, orderId);
  }

  @Post('paypal/webhook')
  @ApiOperation({ summary: 'PayPal Webhook通知' })
  async paypalWebhook(@Headers() headers: any, @Body() body: any) {
    await this.payService.handlePayPalWebhook(headers, body);
    return { success: true };
  }

  @Get('paypal/status/:orderId')
  @ApiOperation({ summary: '查询PayPal订单状态' })
  @UseGuards(JwtAuthGuard)
  async queryPayPalStatus(@Param('orderId') orderId: string, @Req() req: Request) {
    return this.payService.queryPayPalStatusForUser(req.user.id, orderId);
  }

  @Get('paypal/success')
  @ApiOperation({ summary: 'PayPal支付成功回调' })
  async paypalSuccess(@Query() query: any, @Res() res: Response) {
    // 处理PayPal支付成功回调
    const { token } = query;
    Logger.log(`[PayPal回调] 收到成功回调`, 'PayController');
    let html = '';
    const clientUrl = this.getClientUrl();

    if (token) {
      try {
        await this.payService.capturePayPal(token);
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>支付成功</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .success { color: #52c41a; font-size: 48px; margin-bottom: 20px; }
              .message { font-size: 18px; color: #333; margin-bottom: 30px; }
              .redirect { color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="success">✓</div>
            <div class="message">支付已完成，正在确认到账...</div>
            <div class="redirect">正在跳转到主页...</div>
            <script>
              setTimeout(() => {
                window.location.href = ${JSON.stringify(clientUrl)};
              }, 2000);
            </script>
          </body>
          </html>
        `;
      } catch (error) {
        Logger.error(
          `[PayPal回调] 支付捕获失败: ${error.message || error}`,
          error?.stack,
          'PayController',
        );
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>支付失败</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #ff4d4f; font-size: 48px; margin-bottom: 20px; }
              .message { font-size: 18px; color: #333; margin-bottom: 30px; }
              .redirect { color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="error">✗</div>
            <div class="message">支付处理失败，请联系客服</div>
            <div class="redirect">正在跳转到主页...</div>
              <script>
                setTimeout(() => {
                  window.location.href = ${JSON.stringify(clientUrl)};
                }, 3000);
              </script>
          </body>
          </html>
        `;
      }
    } else {
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <script>window.location.href = ${JSON.stringify(clientUrl)};</script>
        </head>
        <body></body>
        </html>
      `;
    }

    res.header('Content-Type', 'text/html');
    return res.send(html);
  }

  @Get('paypal/cancel')
  @ApiOperation({ summary: 'PayPal支付取消回调' })
  async paypalCancel(@Res() res: Response) {
    // 处理PayPal支付取消回调
    Logger.log('[PayPal回调] 收到取消回调', 'PayController');
    const clientUrl = this.getClientUrl('/#/chat');
    // 直接返回HTML，避免被全局拦截器包装
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>支付取消</title>
        <meta charset="utf-8">
        <script>
          // 关闭当前窗口或标签页，如果是弹窗
          if (window.opener) {
            window.close();
          } else {
            // 否则重定向到前端页面
            window.location.href = ${JSON.stringify(clientUrl)};
          }
        </script>
      </head>
      <body>
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
          <div style="color: #666; font-size: 18px;">支付已取消，正在返回...</div>
        </div>
      </body>
      </html>
    `;
    res.header('Content-Type', 'text/html');
    return res.send(html);
  }

  @Post('stripe/webhook')
  @ApiOperation({ summary: 'Stripe Webhook通知' })
  async stripeWebhook(@Headers('stripe-signature') signature: string, @Req() req: Request) {
    await this.payService.handleStripeWebhook(signature, req.body);
    return { success: true };
  }

  @Get('stripe/success')
  @ApiOperation({ summary: 'Stripe支付成功回调' })
  async stripeSuccess(@Query() query: any, @Res() res: Response) {
    const { session_id } = query;
    Logger.log(`[Stripe回调] 收到成功回调`, 'PayController');
    let html = '';
    const clientUrl = this.getClientUrl();

    if (session_id) {
      try {
        // 验证支付状态
        const paymentInfo = await this.payService.completeStripePayment(session_id);

        if (paymentInfo.success && paymentInfo.orderId) {
          // 返回支付成功页面
          html = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>支付成功</title>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .success { color: #52c41a; font-size: 48px; margin-bottom: 20px; }
                .message { font-size: 18px; color: #333; margin-bottom: 30px; }
                .redirect { color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="success">✓</div>
	              <div class="message">支付已完成，正在确认到账...</div>
	              <div class="redirect">正在跳转到主页...</div>
	              <script>
	                setTimeout(() => {
	                  window.location.href = ${JSON.stringify(clientUrl)};
	                }, 2000);
	              </script>
            </body>
            </html>
          `;
        } else {
          throw new Error('支付未完成');
        }
      } catch (error) {
        Logger.error(
          `[Stripe回调] 支付状态查询失败: ${error.message || error}`,
          error?.stack,
          'PayController',
        );
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>支付失败</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #ff4d4f; font-size: 48px; margin-bottom: 20px; }
              .message { font-size: 18px; color: #333; margin-bottom: 30px; }
              .redirect { color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="error">✗</div>
            <div class="message">支付验证失败，请联系客服</div>
            <div class="redirect">正在跳转到主页...</div>
              <script>
                setTimeout(() => {
                  window.location.href = ${JSON.stringify(clientUrl)};
                }, 3000);
              </script>
          </body>
          </html>
        `;
      }
    } else {
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <script>window.location.href = ${JSON.stringify(clientUrl)};</script>
        </head>
        <body></body>
        </html>
      `;
    }

    res.header('Content-Type', 'text/html');
    return res.send(html);
  }

  @Get('stripe/cancel')
  @ApiOperation({ summary: 'Stripe支付取消回调' })
  async stripeCancel(@Query() query: any, @Res() res: Response) {
    // 处理Stripe支付取消回调
    const { session_id } = query;
    Logger.log(`[Stripe回调] 收到取消回调: ${session_id || 'unknown'}`, 'PayController');
    const clientUrl = this.getClientUrl('/#/chat');
    // 直接返回HTML，避免被全局拦截器包装
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>支付取消</title>
        <meta charset="utf-8">
        <script>
          // 关闭当前窗口或标签页，如果是弹窗
          if (window.opener) {
            window.close();
          } else {
            // 否则重定向到前端页面
            window.location.href = ${JSON.stringify(clientUrl)};
          }
        </script>
      </head>
      <body>
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
          <div style="color: #666; font-size: 18px;">支付已取消，正在返回...</div>
        </div>
      </body>
      </html>
    `;
    res.header('Content-Type', 'text/html');
    return res.send(html);
  }

  @Get('stripe/status/:sessionId')
  @ApiOperation({ summary: '查询Stripe支付状态' })
  @UseGuards(JwtAuthGuard)
  async queryStripeStatus(@Param('sessionId') sessionId: string, @Req() req: Request) {
    return this.payService.queryStripeStatusForUser(req.user.id, sessionId);
  }
}
