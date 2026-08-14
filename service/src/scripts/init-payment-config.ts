/**
 * 初始化支付配置脚本
 * 用于将新的支付配置项添加到数据库
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GlobalConfigService } from '../modules/globalConfig/globalConfig.service';

async function initPaymentConfig() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const globalConfigService = app.get(GlobalConfigService);

  try {
    console.log('开始初始化支付配置...');

    // 检查是否已有新配置
    const existingConfigs = await globalConfigService.getConfigs([
      'paymentWechatEnabled',
      'paymentAlipayEnabled',
      'paymentPaypalEnabled',
    ]);

    // 如果已经有配置，跳过初始化
    if (
      existingConfigs.paymentWechatEnabled !== undefined ||
      existingConfigs.paymentAlipayEnabled !== undefined ||
      existingConfigs.paymentPaypalEnabled !== undefined
    ) {
      console.log('支付配置已存在，跳过初始化');
      await app.close();
      return;
    }

    // 获取旧配置
    const oldConfigs = await globalConfigService.getConfigs([
      'payWechatStatus',
      'payEpayStatus',
      'payHupiStatus',
      'payMpayStatus',
      'payLtzfStatus',
    ]);

    // 根据旧配置设置新配置
    const newConfigs = [];

    // 判断微信支付
    let wechatEnabled = false;
    let wechatChannel = 'wechat_official';

    if (Number(oldConfigs.payWechatStatus) === 1) {
      wechatEnabled = true;
      wechatChannel = 'wechat_official';
    } else if (Number(oldConfigs.payHupiStatus) === 1) {
      wechatEnabled = true;
      wechatChannel = 'hupi';
    } else if (Number(oldConfigs.payMpayStatus) === 1) {
      wechatEnabled = true;
      wechatChannel = 'mpay';
    } else if (Number(oldConfigs.payLtzfStatus) === 1) {
      wechatEnabled = true;
      wechatChannel = 'ltzf';
    } else if (Number(oldConfigs.payEpayStatus) === 1) {
      wechatEnabled = true;
      wechatChannel = 'epay';
    }

    // 判断支付宝
    let alipayEnabled = false;
    let alipayChannel = 'epay';

    if (Number(oldConfigs.payEpayStatus) === 1) {
      alipayEnabled = true;
      alipayChannel = 'epay';
    }

    // 设置新配置
    newConfigs.push(
      { configKey: 'paymentWechatEnabled', configVal: wechatEnabled ? '1' : '0' },
      { configKey: 'paymentWechatChannel', configVal: wechatChannel },
      { configKey: 'paymentWechatPriority', configVal: '1' },
      { configKey: 'paymentAlipayEnabled', configVal: alipayEnabled ? '1' : '0' },
      { configKey: 'paymentAlipayChannel', configVal: alipayChannel },
      { configKey: 'paymentAlipayPriority', configVal: '2' },
      { configKey: 'paymentPaypalEnabled', configVal: '0' },
      { configKey: 'paymentPaypalChannel', configVal: 'paypal_official' },
      { configKey: 'paymentPaypalPriority', configVal: '3' },
    );

    // 批量保存配置
    for (const config of newConfigs) {
      await globalConfigService.setConfig(config);
      console.log(`设置配置: ${config.configKey} = ${config.configVal}`);
    }

    console.log('支付配置初始化完成！');
  } catch (error) {
    console.error('初始化支付配置失败:', error);
  } finally {
    await app.close();
  }
}

// 运行脚本
initPaymentConfig().catch(console.error);
