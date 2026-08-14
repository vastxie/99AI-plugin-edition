<route lang="yaml">
meta:
  title: 支付配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { ElMessage } from 'element-plus';
  import { onMounted, reactive, ref, computed } from 'vue';

  const loading = ref(false);

  // 支付方式配置
  const paymentConfig = reactive({
    wechat: {
      enabled: false,
      channel: 'wechat_official',
      priority: 1,
    },
    alipay: {
      enabled: false,
      channel: 'epay',
      priority: 2,
    },
    paypal: {
      enabled: false,
      channel: 'paypal_official',
      priority: 3,
    },
    stripe: {
      enabled: false,
      channel: 'stripe_official',
      priority: 4,
    },
  });

  // 渠道名称映射
  const channelNames: Record<string, string> = {
    wechat_official: '微信官方',
    alipay_official: '支付宝官方',
    epay: '易支付',
    hupi: '虎皮椒',
    mpay: '码支付',
    ltzf: '蓝兔支付',
    paypal_official: 'PayPal官方',
    stripe_official: 'Stripe官方',
  };

  // 微信支付渠道选项
  const wechatChannels = [
    { label: '微信官方', value: 'wechat_official' },
    { label: '易支付', value: 'epay' },
    { label: '虎皮椒', value: 'hupi' },
    { label: '码支付', value: 'mpay' },
    { label: '蓝兔支付', value: 'ltzf' },
  ];

  // 支付宝渠道选项
  const alipayChannels = [
    { label: '支付宝官方', value: 'alipay_official' },
    { label: '易支付', value: 'epay' },
    { label: '虎皮椒', value: 'hupi' },
    { label: '码支付', value: 'mpay' },
    { label: '蓝兔支付', value: 'ltzf' },
  ];

  // PayPal渠道选项
  const paypalChannels = [
    { label: 'PayPal官方', value: 'paypal_official' },
    { label: '易支付', value: 'epay' },
  ];

  // 渠道状态
  const channelStatus = ref<Record<string, { configured: boolean }>>({});

  // 获取支付配置
  async function fetchPaymentConfig() {
    loading.value = true;
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'paymentWechatEnabled',
          'paymentWechatChannel',
          'paymentWechatPriority',
          'paymentAlipayEnabled',
          'paymentAlipayChannel',
          'paymentAlipayPriority',
          'paymentPaypalEnabled',
          'paymentPaypalChannel',
          'paymentPaypalPriority',
          'paymentStripeEnabled',
          'paymentStripeChannel',
          'paymentStripePriority',
        ],
      });
      const config = res.data;

      // 更新配置
      paymentConfig.wechat.enabled = config.paymentWechatEnabled === '1';
      paymentConfig.wechat.channel = config.paymentWechatChannel || 'wechat_official';
      paymentConfig.wechat.priority = Number(config.paymentWechatPriority) || 1;

      paymentConfig.alipay.enabled = config.paymentAlipayEnabled === '1';
      paymentConfig.alipay.channel = config.paymentAlipayChannel || 'epay';
      paymentConfig.alipay.priority = Number(config.paymentAlipayPriority) || 2;

      paymentConfig.paypal.enabled = config.paymentPaypalEnabled === '1';
      paymentConfig.paypal.channel = config.paymentPaypalChannel || 'paypal_official';
      paymentConfig.paypal.priority = Number(config.paymentPaypalPriority) || 3;

      paymentConfig.stripe.enabled = config.paymentStripeEnabled === '1';
      paymentConfig.stripe.channel = config.paymentStripeChannel || 'stripe_official';
      paymentConfig.stripe.priority = Number(config.paymentStripePriority) || 4;
    } catch (error) {
      console.error('获取支付配置失败:', error);
    } finally {
      loading.value = false;
    }
  }

  // 查询渠道状态
  async function fetchChannelStatus() {
    try {
      // 调用后端 API 获取准确的渠道配置状态
      const result = await apiConfig.getPaymentChannelStatus();

      if (result.success && result.data) {
        channelStatus.value = result.data;
      } else {
        console.error('获取渠道状态失败:', result.message);
      }
    } catch (error) {
      console.error('查询渠道状态失败:', error);
    }
  }

  // 获取渠道显示名称
  function getChannelDisplayName(channel: string): string {
    return channelNames[channel] || channel;
  }

  // 保存支付配置
  async function saveConfig() {
    loading.value = true;
    try {
      const settings = [
        { configKey: 'paymentWechatEnabled', configVal: paymentConfig.wechat.enabled ? '1' : '0' },
        { configKey: 'paymentWechatChannel', configVal: paymentConfig.wechat.channel },
        { configKey: 'paymentWechatPriority', configVal: String(paymentConfig.wechat.priority) },
        { configKey: 'paymentAlipayEnabled', configVal: paymentConfig.alipay.enabled ? '1' : '0' },
        { configKey: 'paymentAlipayChannel', configVal: paymentConfig.alipay.channel },
        { configKey: 'paymentAlipayPriority', configVal: String(paymentConfig.alipay.priority) },
        { configKey: 'paymentPaypalEnabled', configVal: paymentConfig.paypal.enabled ? '1' : '0' },
        { configKey: 'paymentPaypalChannel', configVal: paymentConfig.paypal.channel },
        { configKey: 'paymentPaypalPriority', configVal: String(paymentConfig.paypal.priority) },
        { configKey: 'paymentStripeEnabled', configVal: paymentConfig.stripe.enabled ? '1' : '0' },
        { configKey: 'paymentStripeChannel', configVal: paymentConfig.stripe.channel },
        { configKey: 'paymentStripePriority', configVal: String(paymentConfig.stripe.priority) },
      ];

      await apiConfig.setConfig({ settings });
      // 如果没有抛出异常，就认为成功
      ElMessage.success('支付配置保存成功');
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败');
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    fetchPaymentConfig();
    fetchChannelStatus();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          支付方式管理
        </div>
      </template>
      <HButton outline @click="saveConfig" :loading="loading">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-row :gutter="20">
        <!-- 微信支付 -->
        <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
          <div class="payment-item">
            <div class="payment-header">
              <div class="payment-icon wechat">
                <svg-icon name="ic:baseline-wechat" size="28" />
              </div>
              <span class="payment-title">微信支付</span>
            </div>

            <el-form label-position="top">
              <el-form-item label="启用状态">
                <el-switch v-model="paymentConfig.wechat.enabled" />
              </el-form-item>

              <el-form-item label="支付渠道" v-if="paymentConfig.wechat.enabled">
                <el-select v-model="paymentConfig.wechat.channel" style="width: 100%">
                  <el-option
                    v-for="channel in wechatChannels"
                    :key="channel.value"
                    :value="channel.value"
                  >
                    <div class="channel-option">
                      <span>{{ channel.label }}</span>
                      <el-tag
                        v-if="channelStatus[channel.value]"
                        :type="channelStatus[channel.value].configured ? 'success' : 'warning'"
                        size="small"
                      >
                        {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                      </el-tag>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="优先级" v-if="paymentConfig.wechat.enabled">
                <el-input-number
                  v-model="paymentConfig.wechat.priority"
                  :min="0"
                  :max="999"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>
          </div>
        </el-col>

        <!-- 支付宝 -->
        <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
          <div class="payment-item">
            <div class="payment-header">
              <div class="payment-icon alipay">
                <svg-icon name="ant-design:alipay-circle-filled" size="28" />
              </div>
              <span class="payment-title">支付宝</span>
            </div>

            <el-form label-position="top">
              <el-form-item label="启用状态">
                <el-switch v-model="paymentConfig.alipay.enabled" />
              </el-form-item>

              <el-form-item label="支付渠道" v-if="paymentConfig.alipay.enabled">
                <el-select v-model="paymentConfig.alipay.channel" style="width: 100%">
                  <el-option
                    v-for="channel in alipayChannels"
                    :key="channel.value"
                    :value="channel.value"
                  >
                    <div class="channel-option">
                      <span>{{ channel.label }}</span>
                      <el-tag
                        v-if="channelStatus[channel.value]"
                        :type="channelStatus[channel.value].configured ? 'success' : 'warning'"
                        size="small"
                      >
                        {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                      </el-tag>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="优先级" v-if="paymentConfig.alipay.enabled">
                <el-input-number
                  v-model="paymentConfig.alipay.priority"
                  :min="0"
                  :max="999"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>
          </div>
        </el-col>

        <!-- PayPal -->
        <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
          <div class="payment-item">
            <div class="payment-header">
              <div class="payment-icon paypal">
                <svg-icon name="logos:paypal" size="28" />
              </div>
              <span class="payment-title">PayPal</span>
            </div>

            <el-form label-position="top">
              <el-form-item label="启用状态">
                <el-switch v-model="paymentConfig.paypal.enabled" />
              </el-form-item>

              <el-form-item label="支付渠道" v-if="paymentConfig.paypal.enabled">
                <el-select v-model="paymentConfig.paypal.channel" style="width: 100%">
                  <el-option
                    v-for="channel in paypalChannels"
                    :key="channel.value"
                    :value="channel.value"
                  >
                    <div class="channel-option">
                      <span>{{ channel.label }}</span>
                      <el-tag
                        v-if="channelStatus[channel.value]"
                        :type="channelStatus[channel.value].configured ? 'success' : 'warning'"
                        size="small"
                      >
                        {{ channelStatus[channel.value].configured ? '已配置' : '未配置' }}
                      </el-tag>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="优先级" v-if="paymentConfig.paypal.enabled">
                <el-input-number
                  v-model="paymentConfig.paypal.priority"
                  :min="0"
                  :max="999"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>
          </div>
        </el-col>

        <!-- Stripe -->
        <el-col :xs="24" :sm="12" :lg="6" style="margin-bottom: 20px">
          <div class="payment-item">
            <div class="payment-header">
              <div class="payment-icon stripe">
                <svg-icon name="logos:stripe" size="28" />
              </div>
              <span class="payment-title">Stripe</span>
            </div>

            <el-form label-position="top">
              <el-form-item label="启用状态">
                <el-switch v-model="paymentConfig.stripe.enabled" />
              </el-form-item>

              <el-form-item label="支付渠道" v-if="paymentConfig.stripe.enabled">
                <el-select v-model="paymentConfig.stripe.channel" style="width: 100%" disabled>
                  <el-option value="stripe_official" label="Stripe官方">
                    <div class="channel-option">
                      <span>Stripe官方</span>
                      <el-tag
                        v-if="channelStatus['stripe_official']"
                        :type="channelStatus['stripe_official'].configured ? 'success' : 'warning'"
                        size="small"
                      >
                        {{ channelStatus['stripe_official'].configured ? '已配置' : '未配置' }}
                      </el-tag>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="优先级" v-if="paymentConfig.stripe.enabled">
                <el-input-number
                  v-model="paymentConfig.stripe.priority"
                  :min="0"
                  :max="999"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
  .payment-item {
    padding: 15px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    height: 100%;

    .payment-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #f0f0f0;

      .payment-title {
        font-size: 15px;
        font-weight: 500;
        color: #303133;
      }
    }

    .payment-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 6px;

      &.wechat {
        background: rgba(7, 193, 96, 0.1);
        color: #07c160;
      }

      &.alipay {
        background: rgba(22, 119, 255, 0.1);
        color: #1677ff;
      }

      &.paypal {
        background: rgba(0, 48, 135, 0.1);
        color: #003087;
      }

      &.stripe {
        background: rgba(99, 91, 255, 0.1);
        color: #635bff;
      }
    }
  }

  .channel-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;

    .el-tag {
      margin-left: 8px;
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.el-form-item__label) {
    margin-bottom: 4px;
    font-size: 13px;
    color: #606266;
  }
</style>
