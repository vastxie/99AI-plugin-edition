<script setup lang="ts">
import { fetchOrderBuyV2API, fetchOrderQueryAPI, fetchAvailablePaymentMethods } from '@/api/order'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useGlobalStore } from '@/store/modules/global'
import { message } from '@/utils/message'
import { ArrowLeft } from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ResData } from '@/api/types'
import QRCode from '@/components/common/QRCode/index.vue'
import SvgIcon from '@/components/common/SvgIcon/index.vue'

interface Props {
  visible: boolean
}

interface PaymentMethod {
  method: string
  name: string
  channel: string
  priority: number
  icon: string
}

const props = defineProps<Props>()
const emit = defineEmits(['back-to-main', 'payment-success'])

const { isMobile } = useBasicLayout()
const useGlobal = useGlobalStore()
const POLL_INTERVAL = 1000
const ms = message()
const active = ref(true)
const selectedPaymentMethod = ref('')
const availablePaymentMethods = ref<PaymentMethod[]>([])

/* 获取设备类型，用于支付接口 */
const getDeviceType = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()

  // 检测微信环境
  if (ua.includes('micromessenger')) {
    return 'wechat'
  }

  // 检测QQ环境
  if (ua.includes('qq/')) {
    return 'qq'
  }

  // 检测支付宝环境
  if (ua.includes('alipay') || ua.includes('aliapp')) {
    return 'alipay'
  }

  // 检测移动端
  if (isMobile.value) {
    return 'mobile'
  }

  // 默认PC端
  return 'pc'
})

const plat = computed(() => {
  const method = availablePaymentMethods.value.find(m => m.method === selectedPaymentMethod.value)
  return method?.name || ''
})

const countdownRef = ref<ReturnType<typeof setInterval> | null>(null)
const remainingTime = ref(60)

// 移除静态的 isRedirectPay 计算属性，改为根据API响应动态判断
const isRedirectPay = ref(false)

// 倒计时函数
function startCountdown() {
  remainingTime.value = 300 // 5分钟倒计时
  if (!countdownRef.value) {
    countdownRef.value = setInterval(() => {
      remainingTime.value--
      if (remainingTime.value <= 0) {
        handleFinish()
      }
    }, 1000)
  }
}

// 倒计时结束处理
function handleFinish() {
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
  active.value = false
  // 自动刷新页面
  window.location.reload()
}

watch(selectedPaymentMethod, async (newVal, oldVal) => {
  // 如果已经在支付流程中，先重置状态
  if (showQrCode.value) {
    showQrCode.value = false
    payUrl.value = ''
    paymentTrustedOrigins.value = []
    isRedirectPay.value = false
    showWeChatGuide.value = false // 重置微信引导标志
    if (countdownRef.value) {
      clearInterval(countdownRef.value)
      countdownRef.value = null
    }
  }

  // 切换支付方式后自动发起支付（除了初始加载时）
  if (newVal && oldVal) {
    await getQrCode()
  }
})

const orderId = ref('')
let timer: any

const payTypes = computed(() => {
  return availablePaymentMethods.value.map(method => ({
    label: method.name,
    value: method.method,
    icon: method.icon,
    channel: method.channel,
  }))
})

const loading = ref(false)
const payUrl = ref('')
const paymentTrustedOrigins = ref<string[]>([])
const showQrCode = ref(false)
const paySuccess = ref(false)
const showWeChatGuide = ref(false) // 添加微信引导标志
const trustedPaymentHostSuffixes = [
  'paypal.com',
  'paypalobjects.com',
  'stripe.com',
  'stripe.network',
  'alipay.com',
  'alipayobjects.com',
  'alipayplus.com',
  'tenpay.com',
  'wechatpay.cn',
  'xunhupay.com',
  'ltzf.cn',
]

const formatedTime = computed(() => {
  const minutes = Math.floor(remainingTime.value / 60)
  const seconds = remainingTime.value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

// 计算显示的USD价格
const displayUsdPrice = computed(() => {
  const pkgInfo = useGlobal.orderInfo.pkgInfo
  if (!pkgInfo) return '0.00'

  // 如果设置了priceUsd，直接使用
  if (pkgInfo.priceUsd && pkgInfo.priceUsd > 0) {
    return pkgInfo.priceUsd.toFixed(2)
  }

  // 否则使用默认汇率7.3转换人民币价格
  const defaultExchangeRate = 7.3
  const price = parseFloat(pkgInfo.price)
  if (isNaN(price)) return '0.00'

  const usdAmount = price / defaultExchangeRate
  return usdAmount.toFixed(2)
})

/* 从支付宝表单HTML中提取支付URL */
function extractAlipayUrl(formHtml: string): string {
  try {
    // 创建一个临时的DOM元素来解析HTML
    const div = document.createElement('div')
    div.innerHTML = formHtml
    const form = div.querySelector('form')

    if (!form) return ''

    // 获取表单的action URL
    const action = form.getAttribute('action')
    if (!action) return ''

    // 获取所有表单参数
    const params = new URLSearchParams()
    const inputs = form.querySelectorAll('input[type="hidden"]')
    inputs.forEach((input: any) => {
      const name = input.getAttribute('name')
      const value = input.getAttribute('value')
      if (name && value) {
        params.append(name, value)
      }
    })

    // 组合完整的支付URL
    const separator = action.includes('?') ? '&' : '?'
    const paymentUrl = `${action}${separator}${params.toString()}`

    return paymentUrl
  } catch (error) {
    return ''
  }
}

function isLocalPaymentHost(hostname: string) {
  return (
    ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname === window.location.hostname
  )
}

function normalizeTrustedPaymentOrigins(origins?: unknown): string[] {
  if (!Array.isArray(origins)) return []

  return origins.reduce<string[]>((result, rawOrigin) => {
    try {
      const url = new URL(String(rawOrigin))
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        result.push(url.origin)
      }
    } catch (error) {
      // 忽略后端返回的异常来源，避免影响默认可信域名判断。
    }
    return result
  }, [])
}

function getTrustedPaymentUrl(rawUrl: string, extraTrustedOrigins?: unknown) {
  try {
    const url = new URL(rawUrl, window.location.origin)
    if (url.protocol === 'http:' && !isLocalPaymentHost(url.hostname)) {
      return ''
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return ''
    }

    const hostname = url.hostname.toLowerCase()
    const isTrusted =
      isLocalPaymentHost(hostname) ||
      normalizeTrustedPaymentOrigins(extraTrustedOrigins).includes(url.origin) ||
      trustedPaymentHostSuffixes.some(
        suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)
      )

    return isTrusted ? url.toString() : ''
  } catch (error) {
    return ''
  }
}

function showUnsafePaymentUrlError() {
  ms.error('支付链接来源不可信，请联系管理员检查支付配置')
}

function redirectToTrustedPaymentUrl(rawUrl: string, extraTrustedOrigins?: unknown) {
  const trustedUrl = getTrustedPaymentUrl(rawUrl, extraTrustedOrigins)
  if (!trustedUrl) {
    showUnsafePaymentUrlError()
    return false
  }

  window.location.href = trustedUrl
  return true
}

/* 复制文本到剪贴板 */
async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      ms.success(t('pay.copySuccess'))
    } else {
      // Fallback方案
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-999999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      ms.success(t('pay.copySuccess'))
    }
  } catch (error) {
    ms.error(t('pay.copyFailed'))
  }
}

/* 获取可用支付方式 */
async function fetchPaymentMethods() {
  try {
    const res: ResData<PaymentMethod[]> = await fetchAvailablePaymentMethods()
    if (res.success && res.data && res.data.length > 0) {
      availablePaymentMethods.value = res.data
      // 默认选择第一个支付方式
      selectedPaymentMethod.value = res.data[0].method

      // 初始加载时，自动发起第一个支付方式
      await getQrCode()
    } else {
      ms.error(t('pay.noPaymentMethods'))
    }
  } catch (error) {
    ms.error(t('pay.fetchPaymentMethodsFailed'))
  }
}

/* 支付流程 */
async function getQrCode() {
  if (!useGlobal.orderInfo?.pkgInfo?.id || !selectedPaymentMethod.value) {
    return
  }
  loading.value = true
  try {
    const res: ResData<any> = await fetchOrderBuyV2API({
      goodsId: useGlobal.orderInfo.pkgInfo.id,
      method: selectedPaymentMethod.value,
      device: getDeviceType.value, // 传递设备类型参数
    })

    if (res.success) {
      const {
        orderId: order_id,
        redirectUrl,
        codeUrl,
        url_qrcode,
        isRedirect,
        isForm,
        paymentForm,
        appId,
        timeStamp,
        nonceStr,
        package: packageStr,
        signType,
        paySign,
        trustedPaymentOrigins,
      } = res.data
      orderId.value = order_id
      paymentTrustedOrigins.value = normalizeTrustedPaymentOrigins(trustedPaymentOrigins)

      // 清除旧订单ID，存储新订单ID
      localStorage.setItem('pending_order_id', order_id)

      // 微信官方JSAPI支付（在微信浏览器内）
      if (appId && timeStamp && nonceStr && packageStr && signType && paySign) {
        handleWechatJsapiPay({
          appId,
          timeStamp,
          nonceStr,
          package: packageStr,
          signType,
          paySign,
        })
        return
      }

      // 支付宝官方支付 - HTML表单
      if (isForm && paymentForm) {
        // 检测是否在微信浏览器中
        const ua = window.navigator.userAgent.toLowerCase()
        const isWeChatBrowser = ua.includes('micromessenger')

        if (isWeChatBrowser) {
          // 从表单中提取支付URL
          const paymentUrl = extractAlipayUrl(paymentForm)
          const trustedUrl = getTrustedPaymentUrl(paymentUrl, paymentTrustedOrigins.value)

          if (trustedUrl) {
            // 设置为跳转支付模式，显示引导
            isRedirectPay.value = true
            payUrl.value = trustedUrl
            showQrCode.value = true
            showWeChatGuide.value = true // 显示微信引导提示

            // 开始轮询订单状态
            pollOrder()
            startCountdown()
          } else {
            // 如果无法提取URL，fallback到原方案
            showUnsafePaymentUrlError()
          }
          return
        }

        // 非微信环境，使用iframe方式显示支付页面
        const paymentUrl = extractAlipayUrl(paymentForm)
        if (!paymentUrl || !getTrustedPaymentUrl(paymentUrl, paymentTrustedOrigins.value)) {
          showUnsafePaymentUrlError()
          return
        }
        isRedirectPay.value = false
        payUrl.value = paymentForm // 存储HTML表单内容
        showQrCode.value = true
        active.value = true

        // 开始轮询订单状态
        pollOrder()
        startCountdown()
        return
      }

      // PayPal支付直接跳转
      if (selectedPaymentMethod.value === 'paypal' && redirectUrl) {
        redirectToTrustedPaymentUrl(redirectUrl, paymentTrustedOrigins.value)
        return
      }

      // Stripe支付直接跳转
      if (selectedPaymentMethod.value === 'stripe' && redirectUrl) {
        redirectToTrustedPaymentUrl(redirectUrl, paymentTrustedOrigins.value)
        return
      }

      // 根据API响应动态处理支付方式
      if (isRedirect && redirectUrl) {
        const trustedUrl = getTrustedPaymentUrl(redirectUrl, paymentTrustedOrigins.value)
        if (!trustedUrl) {
          showUnsafePaymentUrlError()
          return
        }
        // 处理跳转支付
        isRedirectPay.value = true
        payUrl.value = trustedUrl
        showQrCode.value = true
        // 跳转支付不需要轮询，由用户手动触发跳转
      } else if (url_qrcode || codeUrl) {
        // 处理二维码支付（微信、支付宝）
        const qrCodeUrl = url_qrcode || codeUrl
        isRedirectPay.value = false
        payUrl.value = qrCodeUrl
        showQrCode.value = true
        pollOrder()
        startCountdown()
      } else {
        ms.error(t('pay.getPaymentQrFailed'))
      }
    } else {
      ms.error(res.message || t('pay.orderCreateFailed'))
    }
  } catch (error) {
    ms.error(t('pay.paymentError'))
  } finally {
    loading.value = false
  }
}

/* 处理微信JSAPI支付 */
function handleWechatJsapiPay(paymentData: {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}) {
  const callWxPay = () => {
    window.WeixinJSBridge.invoke(
      'getBrandWCPayRequest',
      {
        appId: paymentData.appId,
        timeStamp: paymentData.timeStamp,
        nonceStr: paymentData.nonceStr,
        package: paymentData.package,
        signType: paymentData.signType,
        paySign: paymentData.paySign,
      },
      (res: any) => {
        if (res.err_msg === 'get_brand_wcpay_request:cancel') {
          // 用户主动取消支付
          ms.error(t('goods.paymentNotSuccessful'))
        } else {
          // 微信返回成功/失败/其他状态
          // 官方文档警告：res.err_msg 返回 ok 不完全可靠
          // 社区反馈：支付成功后经常不触发 ok 回调
          // 因此统一通过轮询后端接口验证真实支付状态
          showQrCode.value = true
          active.value = true
          pollOrder()
          startCountdown()
        }
      }
    )
  }

  if (typeof window.WeixinJSBridge === 'undefined') {
    // 微信SDK未加载，等待加载
    if (document.addEventListener) {
      document.addEventListener('WeixinJSBridgeReady', callWxPay, false)
    }
  } else {
    // 微信SDK已加载，直接调用
    callWxPay()
  }
}

/* 切换到微信支付 */
function switchToWechatPay() {
  // 查找微信支付方式
  const wechatMethod = availablePaymentMethods.value.find(m => m.method === 'wechat')
  if (wechatMethod) {
    selectedPaymentMethod.value = 'wechat'
    showWeChatGuide.value = false
  }
}

/* 轮询订单状态 */
async function pollOrder() {
  if (!orderId.value || !active.value) {
    return
  }

  try {
    const res: ResData<any> = await fetchOrderQueryAPI({ orderId: orderId.value })
    if (res.success) {
      const { status } = res.data
      if (status === 1) {
        active.value = false
        paySuccess.value = true
        emit('payment-success')
        localStorage.removeItem('pending_order_id')
        return
      }
    }
  } catch (error) {
    // 静默失败
  }

  if (active.value && remainingTime.value > 0) {
    timer = setTimeout(() => pollOrder(), POLL_INTERVAL)
  }
}

/* 返回主视图 */
function backToMainView() {
  emit('back-to-main')
  active.value = false
  showQrCode.value = false
  paySuccess.value = false
  paymentTrustedOrigins.value = []
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
}

/* 打开新窗口支付 */
function openPayWindow() {
  if (!payUrl.value) return
  const trustedUrl = getTrustedPaymentUrl(payUrl.value, paymentTrustedOrigins.value)
  if (!trustedUrl) {
    showUnsafePaymentUrlError()
    return
  }
  window.open(trustedUrl, '_blank', 'noopener,noreferrer')
}

onMounted(async () => {
  // 检查URL参数，处理支付回调
  const urlParams = new URLSearchParams(window.location.search)
  const orderIdFromUrl = urlParams.get('orderId') || urlParams.get('out_trade_no')
  const alipayMethod = urlParams.get('method')

  // 检测支付宝回调（method=alipay.trade.page.pay.return）
  if (alipayMethod === 'alipay.trade.page.pay.return' && orderIdFromUrl) {
    // 清理URL中的所有支付参数
    const newUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, newUrl)

    // 如果是在新窗口打开的（opener存在），显示提示后自动关闭
    if (window.opener && !window.opener.closed) {
      // 给用户一个简短提示
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
          <div style="font-size: 48px; color: #52c41a; margin-bottom: 20px;">✓</div>
          <div style="font-size: 20px; color: #333; margin-bottom: 10px;">支付完成</div>
          <div style="font-size: 14px; color: #666;">窗口将自动关闭...</div>
        </div>
      `
      // 2秒后关闭窗口
      setTimeout(() => {
        window.close()
      }, 2000)
      return
    }
  }

  await fetchPaymentMethods()

  // 如果URL中有回调参数，立即清理URL（避免敏感信息暴露）
  if (orderIdFromUrl) {
    const newUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, newUrl)
  }

  // 优先从URL获取订单ID，其次从localStorage获取
  const pendingOrderId = orderIdFromUrl || localStorage.getItem('pending_order_id')

  if (pendingOrderId) {
    // 获取订单ID
    orderId.value = pendingOrderId

    // 立即查询一次订单状态
    try {
      const res: ResData<any> = await fetchOrderQueryAPI({ orderId: pendingOrderId })
      if (res.success && res.data.status === 1) {
        // 支付成功
        paySuccess.value = true
        active.value = false
        emit('payment-success')

        // 清理localStorage
        localStorage.removeItem('pending_order_id')
      } else {
        // 支付未完成，继续轮询
        showQrCode.value = true
        active.value = true
        pollOrder()
        startCountdown()
      }
    } catch (error) {
      // 查询失败
      // 清理无效的订单ID
      localStorage.removeItem('pending_order_id')
    }
  }
  // 不自动调用 getQrCode，等待用户点击支付按钮
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  active.value = false
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
})
</script>

<template>
  <div class="member-payment">
    <!-- Header -->
    <div class="payment-header">
      <button class="back-btn" @click="backToMainView" :aria-label="t('common.back')">
        <ArrowLeft />
      </button>
      <h2 class="payment-title">{{ t('pay.selectPaymentMethod') }}</h2>
    </div>

    <!-- Package Info -->
    <div
      v-if="useGlobal.orderInfo?.pkgInfo"
      class="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5"
    >
      <div
        class="flex justify-between items-center pb-2 mb-2 border-b border-gray-200 dark:border-gray-700"
      >
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ t('pay.packageName') }}</span>
        <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{
          useGlobal.orderInfo.pkgInfo.name
        }}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ t('pay.amountDue') }}</span>
        <span class="text-xl font-semibold text-primary-600 dark:text-primary-400">
          <template v-if="selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'stripe'">
            ${{ displayUsdPrice }}
          </template>
          <template v-else> ¥{{ useGlobal.orderInfo.pkgInfo.price }} </template>
        </span>
      </div>
    </div>

    <!-- QR Code Section (moved here) -->
    <div v-if="showQrCode && !paySuccess" class="mb-5">
      <!-- 微信浏览器内的支付宝支付引导 -->
      <div
        v-if="showWeChatGuide && isRedirectPay"
        class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <!-- 简洁提示 -->
        <div class="text-center mb-4">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {{ t('pay.wechatAlipayGuideTitle', { text: '微信内无法直接使用支付宝支付' }) }}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-500">
            {{ t('pay.wechatAlipaySimpleGuide', { text: '请复制链接后在浏览器中打开完成支付' }) }}
          </p>
        </div>

        <!-- 操作按钮 -->
        <div class="space-y-3">
          <button
            class="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors duration-200"
            @click="copyToClipboard(payUrl)"
          >
            {{ t('pay.copyPaymentLink', { text: '复制支付链接' }) }}
          </button>
          <button
            v-if="availablePaymentMethods.some(m => m.method === 'wechat')"
            class="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors duration-200"
            @click="switchToWechatPay"
          >
            {{ t('pay.switchToWechatPay', { text: '切换微信支付' }) }}
          </button>
        </div>
      </div>

      <!-- 普通跳转支付（非微信环境） -->
      <div
        v-else-if="isRedirectPay && !showWeChatGuide"
        class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center"
      >
        <button class="btn btn-primary btn-lg mb-3" @click="openPayWindow">
          {{ t('pay.clickToPay') }}
        </button>
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('pay.redirectPayHint') }}</p>
      </div>

      <div
        v-else-if="payUrl"
        class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <!-- 支付宝iframe嵌入模式 -->
        <div v-if="payUrl.includes('<form')" class="flex flex-col items-center">
          <iframe
            ref="alipayIframe"
            :srcdoc="payUrl"
            class="border-0 alipay-iframe"
            sandbox="allow-scripts allow-forms"
          ></iframe>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
            {{ t('pay.scanQrCodeToPay', { platform: plat }) }}
          </p>
          <div v-if="remainingTime > 0" class="mt-3 text-xs text-gray-500 dark:text-gray-500">
            {{ t('pay.qrCodeExpires') }}: {{ formatedTime }}
          </div>
        </div>

        <!-- 二维码显示模式 -->
        <div v-else class="flex flex-col items-center">
          <QRCode :value="payUrl" :size="200" />
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
            {{ t('pay.scanQrCodeToPay', { platform: plat }) }}
          </p>
          <div v-if="remainingTime > 0" class="mt-3 text-xs text-gray-500 dark:text-gray-500">
            {{ t('pay.qrCodeExpires') }}: {{ formatedTime }}
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Success (moved here) -->
    <div
      v-if="paySuccess"
      class="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6 mb-5"
    >
      <div class="flex flex-col items-center">
        <div
          class="w-12 h-12 mb-3 bg-green-500 dark:bg-green-600 text-white rounded-full flex items-center justify-center text-2xl"
        >
          ✓
        </div>
        <h3 class="text-lg font-medium text-green-800 dark:text-green-300 mb-3">
          {{ t('pay.paymentSuccess') }}
        </h3>
        <button class="btn btn-secondary btn-md" @click="backToMainView">
          {{ t('common.back') }}
        </button>
      </div>
    </div>

    <!-- Payment Methods -->
    <div v-if="availablePaymentMethods.length > 1" class="mb-8">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {{ t('pay.selectPaymentMethod') }}
      </p>
      <div class="flex flex-col gap-2">
        <label
          v-for="method in payTypes"
          :key="method.value"
          class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200"
          :class="
            selectedPaymentMethod === method.value
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
          "
        >
          <!-- Radio Button -->
          <input
            type="radio"
            :value="method.value"
            :checked="selectedPaymentMethod === method.value"
            @change="selectedPaymentMethod = method.value"
            class="w-4 h-4 text-primary-600 dark:text-primary-400 border-gray-300 dark:border-gray-600 focus:ring-0"
          />

          <!-- Icon -->
          <div class="flex items-center justify-center w-8 h-8">
            <SvgIcon
              v-if="method.icon === 'wechat'"
              name="streamline-logos:wechat-pay-logo-solid"
              :size="22"
              color="#07c160"
            />
            <SvgIcon
              v-else-if="method.icon === 'alipay'"
              name="ant-design:alipay-circle-filled"
              :size="22"
            />
            <SvgIcon v-else-if="method.icon === 'paypal'" name="logos:paypal" :size="22" />
            <SvgIcon v-else-if="method.icon === 'stripe'" name="logos:stripe" :size="22" />
          </div>

          <!-- Text -->
          <span
            class="text-sm font-medium flex-1"
            :class="
              selectedPaymentMethod === method.value
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-300'
            "
          >
            {{ method.label }}
          </span>
        </label>
      </div>
    </div>

    <!-- 移除支付按钮，支付功能已集成到支付方式选择中 -->

    <!-- No Payment Methods -->
    <div v-else-if="!loading && availablePaymentMethods.length === 0" class="no-payment-methods">
      <p>{{ t('pay.noPaymentMethods') }}</p>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="absolute inset-0 bg-white/95 dark:bg-gray-900/95 flex items-center justify-center z-10 rounded-xl"
    >
      <div
        class="w-10 h-10 border-4 border-gray-200 dark:border-gray-700 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin"
      ></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.member-payment {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
  position: relative;

  .payment-header {
    display: flex;
    align-items: center;
    margin-bottom: 30px;

    .back-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      margin-right: 15px;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        opacity: 0.7;
      }
    }

    .payment-title {
      font-size: 20px;
      font-weight: 500;
      margin: 0;
    }
  }

  .package-info {
    margin: 16px 0;
    padding: 12px 16px;
    background: linear-gradient(135deg, #fafbfc 0%, #f5f7fa 100%);
    border-radius: 12px;
    border: 1px solid #e8eaed;

    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;

      &:first-child {
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid #e8eaed;
      }

      .label {
        color: #8c8c8c;
        font-size: 13px;
      }

      .value {
        font-size: 13px;
        color: #333;
        font-weight: 500;

        &.price {
          color: #ff6900;
          font-size: 20px;
          font-weight: 600;
        }
      }
    }
  }

  .payment-methods {
    margin: 20px 0 30px;

    .payment-title {
      font-size: 14px;
      color: #666;
      margin-bottom: 15px;
      font-weight: 400;
    }

    .payment-options {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;

      .payment-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s ease;

        .option-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f5 100%);
          border: 2px solid #e8eaed;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          position: relative;

          &::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid #1890ff;
            opacity: 0;
            transform: scale(1.1);
            transition: all 0.2s ease;
          }

          .paypal-svg {
            width: 24px;
            height: 24px;
          }
        }

        .option-label {
          font-size: 12px;
          color: #8c8c8c;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        &:hover {
          .option-icon {
            transform: translateY(-2px);
            background: linear-gradient(135deg, #fff 0%, #fafbfc 100%);
            border-color: #d1d5db;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          }

          .option-label {
            color: #333;
          }
        }

        &.active {
          .option-icon {
            background: linear-gradient(135deg, #fff 0%, #f0f7ff 100%);
            border-color: transparent;
            box-shadow: 0 4px 16px rgba(24, 144, 255, 0.15);

            &::after {
              opacity: 1;
              transform: scale(1);
            }
          }

          .option-label {
            color: #1890ff;
            font-weight: 500;
          }
        }
      }
    }
  }

  .no-payment-methods {
    text-align: center;
    padding: 40px 20px;
    color: #999;
  }

  .qrcode-section {
    text-align: center;

    .countdown-timer {
      margin-bottom: 20px;
      padding: 10px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      color: #856404;
    }

    .redirect-pay {
      .pay-button {
        padding: 12px 40px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.3s;

        &:hover {
          background: #40a9ff;
        }
      }

      .pay-hint {
        margin-top: 15px;
        color: #666;
        font-size: 14px;
      }
    }

    .qrcode-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;

      .scan-hint {
        color: #666;
        font-size: 14px;
      }
    }
  }

  .pay-button-container {
    margin-top: 30px;
    text-align: center;

    .primary-pay-button {
      padding: 10px 36px;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: white;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(24, 144, 255, 0.25);

      &:hover {
        background: linear-gradient(135deg, #40a9ff 0%, #1890ff 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(24, 144, 255, 0.35);
      }

      &:active {
        transform: translateY(0);
        box-shadow: 0 2px 8px rgba(24, 144, 255, 0.25);
      }
    }
  }

  .payment-success {
    text-align: center;
    padding: 40px 20px;

    .success-icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 20px;
      background: #52c41a;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
    }

    h3 {
      margin-bottom: 20px;
      color: #52c41a;
    }

    .back-btn-success {
      padding: 10px 30px;
      background: #1890ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: #40a9ff;
      }
    }
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 12px;

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #1890ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    p {
      margin-top: 15px;
      color: #666;
    }
  }

  // 支付宝 iframe 样式
  .alipay-iframe {
    width: 200px;
    height: 280px;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .member-payment {
    padding: 15px;

    .payment-methods {
      .payment-options {
        gap: 16px;

        .payment-option {
          .option-icon {
            width: 48px;
            height: 48px;
          }

          .option-label {
            font-size: 11px;
          }
        }
      }
    }

    // 移动端支付宝 iframe 适配
    .alipay-iframe {
      width: 200px;
      height: 280px;
    }
  }
}
</style>
