/**
 * 支付渠道配置
 * 定义每个支付渠道支持的支付方式
 */

export enum PaymentMethod {
  WECHAT = 'wechat', // 微信支付
  ALIPAY = 'alipay', // 支付宝
  PAYPAL = 'paypal', // PayPal
  STRIPE = 'stripe', // Stripe
}

export enum PaymentChannel {
  // 官方渠道
  WECHAT_OFFICIAL = 'wechat_official', // 微信官方支付
  ALIPAY_OFFICIAL = 'alipay_official', // 支付宝官方（预留）
  PAYPAL_OFFICIAL = 'paypal_official', // PayPal官方
  STRIPE_OFFICIAL = 'stripe_official', // Stripe官方

  // 第三方聚合支付
  EPAY = 'epay', // 易支付（支持微信+支付宝）
  HUPI = 'hupi', // 虎皮椒（支持微信）
  MPAY = 'mpay', // 码支付（支持微信）
  LTZF = 'ltzf', // 蓝兔支付（支持微信）
}

/**
 * 支付渠道能力映射
 * 定义每个渠道支持哪些支付方式
 */
interface ChannelCapability {
  name: string;
  supportedMethods: PaymentMethod[];
  needConfig: string[];
  isOfficial: boolean;
  disabled?: boolean;
}

export const CHANNEL_CAPABILITIES: Record<PaymentChannel, ChannelCapability> = {
  [PaymentChannel.WECHAT_OFFICIAL]: {
    name: '微信官方支付',
    supportedMethods: [PaymentMethod.WECHAT],
    needConfig: [
      'payWeChatAppId',
      'payWeChatMchId',
      'payWeChatPublicKey',
      'payWeChatPrivateKey',
      'payWeChatSecret',
    ],
    isOfficial: true,
  },

  [PaymentChannel.ALIPAY_OFFICIAL]: {
    name: '支付宝官方支付',
    supportedMethods: [PaymentMethod.ALIPAY],
    needConfig: ['alipayAppId', 'alipayPrivateKey', 'alipayPublicKey'],
    isOfficial: true,
  },

  [PaymentChannel.EPAY]: {
    name: '易支付',
    supportedMethods: [PaymentMethod.WECHAT, PaymentMethod.ALIPAY, PaymentMethod.PAYPAL],
    needConfig: ['payEpayPid', 'payEpayKey', 'payEpayApiPayUrl'],
    isOfficial: false,
  },

  [PaymentChannel.HUPI]: {
    name: '虎皮椒支付',
    supportedMethods: [PaymentMethod.WECHAT, PaymentMethod.ALIPAY],
    needConfig: ['payHupiAppId', 'payHupiAppSecret', 'payHupiGatewayUrl'],
    isOfficial: false,
  },

  [PaymentChannel.MPAY]: {
    name: '码支付',
    supportedMethods: [PaymentMethod.WECHAT, PaymentMethod.ALIPAY],
    needConfig: ['payMpayPid', 'payMpaySecret', 'payMpayApiPayUrl'],
    isOfficial: false,
  },

  [PaymentChannel.LTZF]: {
    name: '蓝兔支付',
    supportedMethods: [PaymentMethod.WECHAT, PaymentMethod.ALIPAY],
    needConfig: ['payLtzfMchId', 'payLtzfKey'],
    isOfficial: false,
  },

  [PaymentChannel.PAYPAL_OFFICIAL]: {
    name: 'PayPal官方支付',
    supportedMethods: [PaymentMethod.PAYPAL],
    needConfig: ['payPalClientId', 'payPalClientSecret', 'payPalMode', 'payPalWebhookId'],
    isOfficial: true,
  },

  [PaymentChannel.STRIPE_OFFICIAL]: {
    name: 'Stripe官方支付',
    supportedMethods: [PaymentMethod.STRIPE],
    needConfig: ['stripeSecretKey', 'stripePublishableKey', 'stripeMode', 'stripeWebhookSecret'],
    isOfficial: true,
  },
};

/**
 * 支付方式显示配置
 */
export const PAYMENT_METHOD_CONFIG = {
  [PaymentMethod.WECHAT]: {
    name: '微信支付',
    icon: 'wechat',
    color: '#07C160',
    order: 1,
  },
  [PaymentMethod.ALIPAY]: {
    name: '支付宝',
    icon: 'alipay',
    color: '#1677FF',
    order: 2,
  },
  [PaymentMethod.PAYPAL]: {
    name: 'PayPal',
    icon: 'paypal',
    color: '#003087',
    order: 3,
  },
  [PaymentMethod.STRIPE]: {
    name: 'Stripe',
    icon: 'stripe',
    color: '#635BFF',
    order: 4,
  },
};

/**
 * 获取支持指定支付方式的渠道列表
 */
export function getChannelsForMethod(method: PaymentMethod): PaymentChannel[] {
  return Object.entries(CHANNEL_CAPABILITIES)
    .filter(([_, config]) => config.supportedMethods.includes(method) && !config.disabled)
    .map(([channel]) => channel as PaymentChannel);
}

/**
 * 检查渠道是否支持指定支付方式
 */
export function isMethodSupportedByChannel(
  channel: PaymentChannel,
  method: PaymentMethod,
): boolean {
  const config = CHANNEL_CAPABILITIES[channel];
  return config && !config.disabled && config.supportedMethods.includes(method);
}
