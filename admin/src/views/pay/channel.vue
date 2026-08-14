<route lang="yaml">
meta:
  title: 渠道配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { onMounted, reactive, ref, watch, computed } from 'vue';

  const loading = ref(false);
  const activeTab = ref('wechat_official');
  const showMoreChannels = ref(false);

  // 主要渠道（始终显示）
  const mainChannels = ['wechat_official', 'alipay_official', 'epay', 'paypal_official'];

  // 切换更多渠道显示
  function toggleMoreChannels() {
    showMoreChannels.value = !showMoreChannels.value;

    // 如果折叠时当前选中的是扩展渠道，则切换回第一个主要渠道
    if (!showMoreChannels.value && !mainChannels.includes(activeTab.value)) {
      activeTab.value = mainChannels[0];
    }
  }

  // 定义字段类型
  interface ChannelField {
    key: string;
    label: string;
    type: 'input' | 'password' | 'textarea' | 'select';
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
    show?: (data: any) => boolean; // 条件显示字段
  }

  interface ChannelConfig {
    name: string;
    description?: string;
    icon?: string;
    iconColor?: string;
    fields: ChannelField[];
  }

  // 各渠道的配置字段
  const channelConfigs: Record<string, ChannelConfig> = {
    wechat_official: {
      name: '微信官方支付',
      description: '使用微信官方支付接口，需要企业资质认证',
      icon: 'ic:baseline-wechat',
      iconColor: '#07c160',
      fields: [
        {
          key: 'payWeChatMchId',
          label: '商户号',
          type: 'input',
          required: true,
          placeholder: '微信支付商户号',
        },
        {
          key: 'payWeChatAppId',
          label: 'AppId',
          type: 'input',
          required: true,
          placeholder: '微信公众号或小程序AppId',
        },
        {
          key: 'payWeChatSecret',
          label: 'APIv3密钥',
          type: 'password',
          required: true,
          placeholder: '微信支付商户平台的32位APIv3密钥',
        },
        {
          key: 'payWeChatNotifyUrl',
          label: '通知地址',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'payWeChatPublicKey',
          label: '商户API证书',
          type: 'textarea',
          required: true,
          placeholder: '请输入 apiclient_cert.pem 完整内容，包含 BEGIN CERTIFICATE',
        },
        {
          key: 'payWeChatPrivateKey',
          label: '商户API私钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入 apiclient_key.pem 完整内容，包含 BEGIN PRIVATE KEY',
        },
        {
          key: 'payWeChatVerifyMode',
          label: '回调验签模式',
          type: 'select',
          required: true,
          placeholder: '请选择微信支付回调验签模式',
          options: [
            { label: '平台证书', value: 'platform_cert' },
            { label: '微信支付公钥', value: 'wechatpay_public_key' },
            { label: '自动兼容（切换期推荐）', value: 'auto' },
          ],
        },
        {
          key: 'payWeChatPlatformPublicKeyId',
          label: '微信支付公钥ID',
          type: 'input',
          required: true,
          placeholder: 'PUB_KEY_ID_ 开头，公钥模式或自动兼容时填写',
          show: (data) => ['wechatpay_public_key', 'auto'].includes(data.payWeChatVerifyMode || ''),
        },
        {
          key: 'payWeChatPlatformPublicKey',
          label: '微信支付公钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入微信支付公钥完整内容，包含 BEGIN PUBLIC KEY',
          show: (data) => ['wechatpay_public_key', 'auto'].includes(data.payWeChatVerifyMode || ''),
        },
      ],
    },
    alipay_official: {
      name: '支付宝官方支付',
      description: '使用支付宝官方支付接口，支持电脑网站支付和手机网站支付',
      icon: 'ant-design:alipay-circle-filled',
      iconColor: '#1677ff',
      fields: [
        {
          key: 'alipayAppId',
          label: '应用AppId',
          type: 'input',
          required: true,
          placeholder: '支付宝应用AppId',
        },
        {
          key: 'alipayPrivateKey',
          label: '应用私钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入完整的应用私钥内容（RSA2）',
        },
        {
          key: 'alipayPublicKey',
          label: '支付宝公钥',
          type: 'textarea',
          required: true,
          placeholder: '请输入支付宝公钥内容（非应用公钥）',
        },
        {
          key: 'alipayNotifyUrl',
          label: '异步通知地址',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'alipayReturnUrl',
          label: '同步返回地址',
          type: 'input',
          required: true,
          placeholder: 'https://域名/#/chat',
        },
        {
          key: 'alipayEnablePolling',
          label: '启用后端轮询',
          type: 'select',
          required: false,
          placeholder: '是否启用后端主动轮询订单状态（默认启用）',
          options: [
            { label: '启用（开发环境推荐）', value: '1' },
            { label: '禁用（仅依赖异步通知）', value: '0' },
          ],
        },
      ],
    },
    epay: {
      name: '易支付',
      description: '第三方聚合支付平台，支持多种支付方式',
      icon: 'material-symbols:payments-outline',
      iconColor: '#1890ff',
      fields: [
        {
          key: 'payEpayApiPayUrl',
          label: '支付接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://pay.example.com/api/pay',
        },
        {
          key: 'payEpayApiQueryUrl',
          label: '查询接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://pay.example.com/api/query',
        },
        {
          key: 'payEpayPid',
          label: '商户ID',
          type: 'input',
          required: true,
          placeholder: '易支付商户ID',
        },
        {
          key: 'payEpayApiVersion',
          label: 'API版本',
          type: 'select',
          required: true,
          placeholder: '选择API版本',
          options: [
            { label: 'V1版本（MD5签名）', value: 'v1' },
            { label: 'V2版本（RSA签名）', value: 'v2' },
          ],
        },
        {
          key: 'payEpayKey',
          label: '商户密钥',
          type: 'password',
          required: false, // 动态必需，V1时必需
          placeholder: '易支付商户密钥（MD5密钥）',
          show: (data) => !data.payEpayApiVersion || data.payEpayApiVersion === 'v1',
        },
        {
          key: 'payEpayPrivateKey',
          label: '商户私钥',
          type: 'textarea',
          required: false, // 动态必需，V2时必需
          placeholder: '请输入完整的RSA私钥内容',
          show: (data) => data.payEpayApiVersion === 'v2',
        },
        {
          key: 'payEpayPublicKey',
          label: '平台公钥',
          type: 'textarea',
          required: false,
          placeholder: '请输入平台公钥（用于回调验签，可选）',
          show: (data) => data.payEpayApiVersion === 'v2',
        },
        {
          key: 'payEpayNotifyUrl',
          label: '异步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'payEpayReturnUrl',
          label: '同步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/#/chat',
        },
        {
          key: 'payEpayEnablePolling',
          label: '启用后端轮询',
          type: 'select',
          required: false,
          placeholder: '是否启用后端主动轮询订单状态（默认启用）',
          options: [
            { label: '启用（开发环境推荐）', value: '1' },
            { label: '禁用（仅依赖异步通知）', value: '0' },
          ],
        },
      ],
    },
    hupi: {
      name: '虎皮椒支付',
      description: '虎皮椒V3支付接口',
      icon: 'pepicons-pencil:credit-card',
      iconColor: '#fa8c16',
      fields: [
        {
          key: 'payHupiAppId',
          label: 'AppId',
          type: 'input',
          required: true,
          placeholder: '虎皮椒AppId',
        },
        {
          key: 'payHupiAppSecret',
          label: 'AppSecret',
          type: 'password',
          required: true,
          placeholder: '虎皮椒AppSecret',
        },
        {
          key: 'payHupiNotifyUrl',
          label: '通知地址',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'payHupiReturnUrl',
          label: '返回地址',
          type: 'input',
          required: true,
          placeholder: 'https://域名/#/chat',
        },
        {
          key: 'payHupiGatewayUrl',
          label: '网关地址',
          type: 'input',
          required: false,
          placeholder: '默认: https://api.xunhupay.com/payment/do.html',
        },
      ],
    },
    mpay: {
      name: '码支付',
      description: '码支付个人收款平台',
      icon: 'solar:qr-code-bold',
      iconColor: '#722ed1',
      fields: [
        {
          key: 'payMpayApiPayUrl',
          label: '支付接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://codepay.example.com/api/pay',
        },
        {
          key: 'payMpayApiQueryUrl',
          label: '查询接口地址',
          type: 'input',
          required: true,
          placeholder: 'https://codepay.example.com/api/query',
        },
        {
          key: 'payMpayPid',
          label: '商户ID',
          type: 'input',
          required: true,
          placeholder: '码支付商户ID',
        },
        {
          key: 'payMpaySecret',
          label: '商户密钥',
          type: 'password',
          required: true,
          placeholder: '码支付通信密钥',
        },
        {
          key: 'payMpayNotifyUrl',
          label: '异步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'payMpayReturnUrl',
          label: '同步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/#/chat',
        },
      ],
    },
    ltzf: {
      name: '蓝兔支付',
      description: '蓝兔支付平台',
      icon: 'mdi:rabbit',
      iconColor: '#2f54eb',
      fields: [
        {
          key: 'payLtzfMchId',
          label: '商户号',
          type: 'input',
          required: true,
          placeholder: '蓝兔支付商户号',
        },
        {
          key: 'payLtzfKey',
          label: '商户密钥',
          type: 'password',
          required: true,
          placeholder: '蓝兔支付密钥',
        },
        {
          key: 'payLtzfNotifyUrl',
          label: '异步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/notify',
        },
        {
          key: 'payLtzfReturnUrl',
          label: '同步通知',
          type: 'input',
          required: true,
          placeholder: 'https://域名/#/chat',
        },
      ],
    },
    paypal_official: {
      name: 'PayPal官方',
      description: 'PayPal国际支付平台',
      icon: 'logos:paypal',
      iconColor: '#003087',
      fields: [
        {
          key: 'payPalClientId',
          label: 'Client ID',
          type: 'input',
          required: true,
          placeholder: 'PayPal Client ID',
        },
        {
          key: 'payPalClientSecret',
          label: 'Client Secret',
          type: 'password',
          required: true,
          placeholder: 'PayPal Client Secret',
        },
        {
          key: 'payPalMode',
          label: '环境模式',
          type: 'select',
          required: true,
          options: [
            { label: '沙盒环境', value: 'sandbox' },
            { label: '生产环境', value: 'live' },
          ],
        },
        {
          key: 'payPalReturnUrl',
          label: '成功返回URL',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/paypal/success',
        },
        {
          key: 'payPalCancelUrl',
          label: '取消返回URL',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/paypal/cancel',
        },
        {
          key: 'payPalWebhookId',
          label: 'Webhook ID',
          type: 'input',
          required: true,
          placeholder: '用于验证 PayPal Webhook',
        },
      ],
    },
    stripe_official: {
      name: 'Stripe官方',
      description: 'Stripe国际支付平台',
      icon: 'logos:stripe',
      iconColor: '#635bff',
      fields: [
        {
          key: 'stripeSecretKey',
          label: 'Secret Key',
          type: 'password',
          required: true,
          placeholder: 'Stripe Secret Key',
        },
        {
          key: 'stripePublishableKey',
          label: 'Publishable Key',
          type: 'input',
          required: true,
          placeholder: 'Stripe Publishable Key',
        },
        {
          key: 'stripeMode',
          label: '环境模式',
          type: 'select',
          required: true,
          options: [
            { label: '测试环境', value: 'test' },
            { label: '生产环境', value: 'live' },
          ],
        },
        {
          key: 'stripeSuccessUrl',
          label: '成功返回URL',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/stripe/success',
        },
        {
          key: 'stripeCancelUrl',
          label: '取消返回URL',
          type: 'input',
          required: true,
          placeholder: 'https://域名/api/pay/stripe/cancel',
        },
        {
          key: 'stripeWebhookSecret',
          label: 'Webhook Secret',
          type: 'password',
          required: true,
          placeholder: '用于验证 Stripe Webhook',
        },
      ],
    },
  };

  // 各渠道的配置数据
  const channelSettings = reactive<Record<string, any>>({});

  // 渠道状态
  const channelStatus = ref<Record<string, { configured: boolean; missing: string[] }>>({});

  // 初始化所有渠道的设置对象
  Object.keys(channelConfigs).forEach((channelKey) => {
    channelSettings[channelKey] = {};
  });

  // 获取所有渠道的配置键
  function getAllChannelKeys(): string[] {
    const keys: string[] = [];
    Object.values(channelConfigs).forEach((config) => {
      config.fields.forEach((field) => {
        if (!keys.includes(field.key)) {
          keys.push(field.key);
        }
      });
    });
    return keys;
  }

  // 获取渠道配置
  async function fetchChannelConfig() {
    loading.value = true;
    try {
      const keys = getAllChannelKeys();
      const res = await apiConfig.queryConfig({ keys });

      // 初始化所有渠道的设置对象
      Object.keys(channelConfigs).forEach((channelKey) => {
        if (!channelSettings[channelKey]) {
          channelSettings[channelKey] = {};
        }
        channelConfigs[channelKey].fields.forEach((field) => {
          channelSettings[channelKey][field.key] = res.data[field.key] || '';
        });
        if (channelKey === 'wechat_official' && !channelSettings[channelKey].payWeChatVerifyMode) {
          channelSettings[channelKey].payWeChatVerifyMode = 'platform_cert';
        }
      });
    } catch (error) {
      console.error('获取渠道配置失败:', error);
    } finally {
      loading.value = false;
    }
  }

  // 查询渠道状态
  async function fetchChannelStatus() {
    try {
      const res = await apiConfig.getPaymentChannelStatus();
      channelStatus.value = res.data || {};
    } catch (error) {
      console.error('查询渠道状态失败:', error);
    }
  }

  // 保存所有渠道配置
  async function saveAllConfig() {
    loading.value = true;
    try {
      const settings: any[] = [];

      // 收集所有渠道的配置
      Object.keys(channelConfigs).forEach((channelKey) => {
        channelConfigs[channelKey].fields.forEach((field) => {
          const value = channelSettings[channelKey][field.key];
          settings.push({
            configKey: field.key,
            configVal: value || '',
          });
        });
      });

      await apiConfig.setConfig({ settings });
      // 如果没有抛出异常，就认为成功
      ElMessage.success('渠道配置保存成功');
      // 重新查询状态
      await fetchChannelStatus();
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败');
    } finally {
      loading.value = false;
    }
  }

  // 清空当前渠道配置
  async function clearCurrentConfig() {
    try {
      await ElMessageBox.confirm(
        `确定要清空 ${channelConfigs[activeTab.value].name} 的所有配置吗？`,
        '提示',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );

      const config = channelConfigs[activeTab.value];
      config.fields.forEach((field) => {
        channelSettings[activeTab.value][field.key] = '';
      });

      ElMessage.success('配置已清空，请点击保存按钮生效');
    } catch (error) {
      // 用户取消
    }
  }

  // 判断字段是否应该显示
  function shouldShowField(field: ChannelField, data: any): boolean {
    if (!field.show) return true;

    if (typeof field.show === 'function') {
      return field.show(data);
    }

    return true;
  }

  // 获取当前渠道的使用说明
  const currentChannelHelp = computed(() => {
    const helps: Record<string, string> = {
      wechat_official:
        '微信官方支付需要企业资质认证。下单签名使用商户API证书和商户API私钥；回调验签支持平台证书、微信支付公钥和自动兼容模式，商户平台切换公钥期间建议选择自动兼容。',
      alipay_official:
        '支付宝官方支付需要在支付宝开放平台创建应用，获取应用AppId、应用私钥和支付宝公钥。支持电脑网站支付和手机网站支付，自动根据设备类型选择支付方式。',
      epay: '支持对接标准易支付兼容网关。请填写自己的支付接口地址和查询接口地址，V1版本使用MD5签名（需要商户密钥），V2版本使用RSA签名（需要RSA密钥对，安全性更高）。',
      hupi: '虎皮椒V3支付接口。启用前请填写已有应用的AppId和AppSecret。',
      mpay: '码支付是个人收款平台，需要安装码支付客户端。配置时需要填写码支付提供的网关地址。',
      ltzf: '蓝兔支付平台，请先注册并获取商户号和密钥。支持微信、支付宝等多种支付方式。',
      paypal_official:
        'PayPal国际支付，支持信用卡等多种支付方式。沙盒环境用于测试，生产环境用于实际收款。请在PayPal开发者中心创建应用获取Client ID和Secret。',
      stripe_official:
        'Stripe国际支付平台，支持信用卡、借记卡等。测试环境使用test开头的密钥，生产环境使用live开头的密钥。请在Stripe控制台获取相关密钥。',
    };
    return helps[activeTab.value] || '配置各支付渠道的接口参数和认证信息，所有渠道配置将统一保存。';
  });

  onMounted(() => {
    fetchChannelConfig();
    fetchChannelStatus();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          渠道参数配置
        </div>
      </template>
      <HButton outline @click="saveAllConfig" :loading="loading">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-tabs v-model="activeTab">
        <!-- 主要渠道：始终显示 -->
        <el-tab-pane v-for="key in mainChannels" :key="key" :name="key">
          <template #label>
            <div class="tab-label">
              <svg-icon
                v-if="channelConfigs[key].icon"
                :name="channelConfigs[key].icon"
                :color="channelConfigs[key].iconColor"
                size="16"
              />
              <span>{{ channelConfigs[key].name }}</span>
              <el-tag
                v-if="channelStatus[key]"
                :type="channelStatus[key].configured ? 'success' : 'info'"
                size="small"
                class="ml-2"
              >
                {{ channelStatus[key].configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>

          <div class="channel-content">
            <el-form label-width="160px">
              <el-row>
                <el-col :xs="24" :md="20" :lg="15" :xl="12">
                  <el-form-item
                    v-for="field in channelConfigs[key].fields"
                    v-show="shouldShowField(field, channelSettings[key])"
                    :key="field.key"
                    :label="field.label"
                    :required="field.required"
                  >
                    <!-- 输入框 -->
                    <el-input
                      v-if="field.type === 'input'"
                      v-model="channelSettings[key][field.key]"
                      :placeholder="field.placeholder"
                      clearable
                    />

                    <!-- 密码框 -->
                    <el-input
                      v-else-if="field.type === 'password'"
                      v-model="channelSettings[key][field.key]"
                      type="password"
                      :placeholder="field.placeholder"
                      show-password
                      clearable
                    />

                    <!-- 文本域 -->
                    <el-input
                      v-else-if="field.type === 'textarea'"
                      v-model="channelSettings[key][field.key]"
                      type="textarea"
                      :rows="4"
                      :placeholder="field.placeholder"
                    />

                    <!-- 下拉框 -->
                    <el-select
                      v-else-if="field.type === 'select'"
                      v-model="channelSettings[key][field.key]"
                      :placeholder="field.placeholder"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="option in field.options"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row>
                <el-col :xs="24" :md="20" :lg="15" :xl="12">
                  <el-form-item>
                    <el-button @click="clearCurrentConfig">清空配置</el-button>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- 其他渠道：点击更多才显示 -->
        <template v-for="(config, key) in channelConfigs" :key="'more-' + key">
          <el-tab-pane v-if="!mainChannels.includes(key as string) && showMoreChannels" :name="key">
            <template #label>
              <div class="tab-label">
                <svg-icon
                  v-if="config.icon"
                  :name="config.icon"
                  :color="config.iconColor"
                  size="16"
                />
                <span>{{ config.name }}</span>
                <el-tag
                  v-if="channelStatus[key]"
                  :type="channelStatus[key].configured ? 'success' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ channelStatus[key].configured ? '已配置' : '未配置' }}
                </el-tag>
              </div>
            </template>

            <div class="channel-content">
              <el-form label-width="160px">
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item
                      v-for="field in config.fields"
                      v-show="shouldShowField(field, channelSettings[key])"
                      :key="field.key"
                      :label="field.label"
                      :required="field.required"
                    >
                      <!-- 输入框 -->
                      <el-input
                        v-if="field.type === 'input'"
                        v-model="channelSettings[key][field.key]"
                        :placeholder="field.placeholder"
                        clearable
                      />

                      <!-- 密码框 -->
                      <el-input
                        v-else-if="field.type === 'password'"
                        v-model="channelSettings[key][field.key]"
                        type="password"
                        :placeholder="field.placeholder"
                        show-password
                        clearable
                      />

                      <!-- 文本域 -->
                      <el-input
                        v-else-if="field.type === 'textarea'"
                        v-model="channelSettings[key][field.key]"
                        type="textarea"
                        :rows="4"
                        :placeholder="field.placeholder"
                      />

                      <!-- 下拉框 -->
                      <el-select
                        v-else-if="field.type === 'select'"
                        v-model="channelSettings[key][field.key]"
                        :placeholder="field.placeholder"
                        style="width: 100%"
                      >
                        <el-option
                          v-for="option in field.options"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item>
                      <el-button @click="clearCurrentConfig">清空配置</el-button>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>
        </template>

        <!-- 更多/收起按钮 -->
        <el-tab-pane name="more" disabled>
          <template #label>
            <div class="tab-label more-tab" @click.stop="toggleMoreChannels">
              <svg-icon
                :name="showMoreChannels ? 'i-ri:arrow-up-s-line' : 'i-ri:more-fill'"
                size="16"
              />
              <span>{{ showMoreChannels ? '收起' : '更多渠道' }}</span>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 6px;

    .el-tag {
      margin-left: 4px;
    }

    &.more-tab {
      cursor: pointer;
      color: #409eff;

      &:hover {
        opacity: 0.8;
      }
    }
  }

  .channel-content {
    padding: 10px 0;
  }

  :deep(.el-tabs__nav-wrap) {
    &::after {
      height: 1px;
    }
  }

  :deep(.el-tabs__item) {
    padding: 0 20px;
    height: 50px;
    line-height: 50px;

    &.is-active {
      font-weight: 500;
    }

    &.is-disabled {
      cursor: pointer !important;
    }
  }

  .ml-2 {
    margin-left: 8px;
  }
</style>
