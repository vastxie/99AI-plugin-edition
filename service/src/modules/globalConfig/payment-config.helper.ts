/**
 * 支付配置辅助类
 * 用于管理支付渠道配置的统一处理
 */

export interface ChannelConfig {
  // 渠道基础信息
  name: string; // 渠道名称
  enabled: boolean; // 是否配置完成（有完整的配置信息）

  // 渠道认证信息
  credentials: {
    [key: string]: string; // 各种密钥、ID等配置
  };

  // 渠道回调地址
  callbacks: {
    notifyUrl?: string; // 异步通知地址
    returnUrl?: string; // 同步返回地址
  };

  // 其他配置
  extras?: {
    [key: string]: any; // 额外的渠道特定配置
  };
}

/**
 * 支付渠道配置键映射
 * 定义每个渠道需要的配置项
 */
export const CHANNEL_CONFIG_KEYS = {
  // 微信官方支付
  wechat_official: {
    credentials: [
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatSecret',
    ],
    callbacks: ['payWeChatNotifyUrl'],
    optional: [
      'payWeChatH5Name',
      'payWeChatH5Url',
      'payWeChatVerifyMode',
      'payWeChatPlatformPublicKeyId',
      'payWeChatPlatformPublicKey',
    ],
  },

  // 易支付
  // 注意：credentials 字段需要根据 API 版本动态判断，在验证函数中处理
  epay: {
    credentials: ['payEpayPid'], // 基础必需字段
    callbacks: ['payEpayNotifyUrl', 'payEpayReturnUrl'],
    extras: ['payEpayApiPayUrl', 'payEpayApiQueryUrl', 'payEpayApiVersion'],
    optional: [], // V1需要payEpayKey，V2需要payEpayPrivateKey和payEpayPublicKey，在验证时动态处理
  },

  // 虎皮椒支付
  hupi: {
    credentials: ['payHupiAppId', 'payHupiAppSecret'],
    callbacks: ['payHupiNotifyUrl', 'payHupiReturnUrl'],
    extras: ['payHupiGatewayUrl'],
  },

  // 码支付
  mpay: {
    credentials: ['payMpayPid', 'payMpaySecret'],
    callbacks: ['payMpayNotifyUrl', 'payMpayReturnUrl'],
    extras: ['payMpayApiPayUrl', 'payMpayApiQueryUrl'],
  },

  // 蓝兔支付
  ltzf: {
    credentials: ['payLtzfMchId', 'payLtzfKey'],
    callbacks: ['payLtzfNotifyUrl', 'payLtzfReturnUrl'],
  },

  // PayPal官方支付
  paypal_official: {
    credentials: [
      'payPalClientId',
      'payPalClientSecret',
      'payPalMode', // sandbox 或 live
      'payPalWebhookId', // Webhook验证ID
    ],
    callbacks: [],
    optional: ['payPalReturnUrl', 'payPalCancelUrl'],
  },

  // Stripe官方支付
  stripe_official: {
    credentials: [
      'stripeSecretKey',
      'stripePublishableKey',
      'stripeMode', // test 或 live
      'stripeWebhookSecret', // Webhook签名密钥
    ],
    callbacks: [],
    optional: ['stripeSuccessUrl', 'stripeCancelUrl'],
  },

  // 支付宝官方支付
  alipay_official: {
    credentials: [
      'alipayAppId',
      'alipayPrivateKey', // 应用私钥
      'alipayPublicKey', // 支付宝公钥
    ],
    callbacks: ['alipayNotifyUrl', 'alipayReturnUrl'],
    optional: [],
  },
};

/**
 * 检查渠道配置是否完整
 */
export function isChannelConfigured(channel: string, configs: Record<string, any>): boolean {
  const requiredKeys = CHANNEL_CONFIG_KEYS[channel];
  if (!requiredKeys) {
    return false;
  }

  let credentialsToCheck = [...requiredKeys.credentials];
  if (
    channel === 'wechat_official' &&
    ['wechatpay_public_key', 'auto'].includes(configs['payWeChatVerifyMode'])
  ) {
    credentialsToCheck.push('payWeChatPlatformPublicKeyId', 'payWeChatPlatformPublicKey');
  }
  if (channel === 'epay') {
    const apiVersion = configs['payEpayApiVersion'];
    if (apiVersion === 'v2') {
      credentialsToCheck.push('payEpayPrivateKey', 'payEpayPublicKey');
    } else {
      credentialsToCheck.push('payEpayKey');
    }
  }

  const missingCredentials = [];
  for (const key of credentialsToCheck) {
    if (!configs[key] || configs[key] === '') {
      missingCredentials.push(key);
    }
  }

  const missingCallbacks = [];
  for (const key of requiredKeys.callbacks) {
    if (!configs[key] || configs[key] === '') {
      missingCallbacks.push(key);
    }
  }

  return missingCredentials.length === 0 && missingCallbacks.length === 0;
}

/**
 * 获取渠道的配置状态
 */
export function getChannelConfigStatus(
  channel: string,
  configs: Record<string, any>,
): {
  configured: boolean;
  missing: string[];
  hasOptional: boolean;
} {
  const requiredKeys = CHANNEL_CONFIG_KEYS[channel];
  if (!requiredKeys) {
    return { configured: false, missing: ['渠道不存在'], hasOptional: false };
  }

  const missing: string[] = [];

  let credentialsToCheck = [...requiredKeys.credentials];
  if (
    channel === 'wechat_official' &&
    ['wechatpay_public_key', 'auto'].includes(configs['payWeChatVerifyMode'])
  ) {
    credentialsToCheck.push('payWeChatPlatformPublicKeyId', 'payWeChatPlatformPublicKey');
  }
  if (channel === 'epay') {
    const apiVersion = configs['payEpayApiVersion'];
    if (apiVersion === 'v2') {
      credentialsToCheck.push('payEpayPrivateKey', 'payEpayPublicKey');
    } else {
      credentialsToCheck.push('payEpayKey');
    }
  }

  [...credentialsToCheck, ...requiredKeys.callbacks].forEach(key => {
    const value = configs[key];
    if (!value || value === '') {
      missing.push(key);
    }
  });

  const hasOptional =
    requiredKeys.optional?.some(key => configs[key] && configs[key] !== '') || false;

  const result = {
    configured: missing.length === 0,
    missing,
    hasOptional,
  };

  return result;
}

/**
 * 清理渠道配置（当切换渠道时）
 */
export function cleanChannelConfigs(oldChannel: string): string[] {
  const keysToClean: string[] = [];
  const channelKeys = CHANNEL_CONFIG_KEYS[oldChannel];

  if (channelKeys) {
    keysToClean.push(
      ...channelKeys.credentials,
      ...channelKeys.callbacks,
      ...(channelKeys.extras || []),
      ...(channelKeys.optional || []),
    );
  }

  return keysToClean;
}

/**
 * 生成渠道配置模板
 */
export function getChannelConfigTemplate(channel: string): Record<string, string> {
  const template: Record<string, string> = {};
  const channelKeys = CHANNEL_CONFIG_KEYS[channel];

  if (!channelKeys) return template;

  // 添加所有配置项的空模板
  [...channelKeys.credentials, ...channelKeys.callbacks].forEach(key => {
    template[key] = '';
  });

  // 添加可选和额外配置
  channelKeys.optional?.forEach(key => {
    template[key] = '';
  });

  channelKeys.extras?.forEach(key => {
    template[key] = '';
  });

  return template;
}
