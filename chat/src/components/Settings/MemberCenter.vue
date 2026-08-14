<script setup lang="ts">
import { fetchGetPackageAPI, fetchUseCramiAPI } from '@/api/crami'
import { fetchSignInAPI, fetchSignLogAPI } from '@/api/signin'
import { fetchGetRechargeLogAPI } from '@/api/balance'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ResData } from '@/api/types'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import MemberPayment from './MemberPayment.vue'

// 充值类型映射
const RECHARGE_TYPE_MAP: Record<number, string> = {
  1: t('member.regGift'),
  2: t('member.inviteGift'),
  3: t('member.referGift'),
  4: t('member.packageGift'),
  5: t('member.adminGift'),
  6: t('member.scanPay'),
  7: t('member.refund'),
  8: t('member.signInReward'),
  9: t('member.adminRecharge'),
  10: t('member.chatDeduct'),
  11: t('member.imageDeduct'),
  12: t('member.videoDeduct'),
  13: t('member.musicDeduct'),
  14: t('member.otherDeduct'),
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const loading = ref(true)
const packageList = ref<Pkg[]>([])
const ms = message()
const model3Name = computed(() => authStore.globalConfig.model3Name || t('goods.basicModelQuota'))
const { isMobile } = useBasicLayout()
const model4Name = computed(
  () => authStore.globalConfig.model4Name || t('goods.advancedModelQuota')
)
const drawMjName = computed(() => authStore.globalConfig.drawMjName || t('goods.drawingQuota'))
const isHideModel3Point = computed(() => Number(authStore.globalConfig.isHideModel3Point) === 1)
const isHideModel4Point = computed(() => Number(authStore.globalConfig.isHideModel4Point) === 1)
const isHideDrawMjPoint = computed(() => Number(authStore.globalConfig.isHideDrawMjPoint) === 1)

interface Props {
  visible: boolean
}

interface Pkg {
  id: number
  name: string
  coverImg: string
  des: string
  price: number
  priceUsd?: number
  model3Count: number
  model4Count: number
  drawMjCount: number
  extraReward: number
  extraPaintCount: number
  createdAt: Date
}

onMounted(() => {
  if (props.visible) {
    // 组件挂载时检查登录状态
    if (checkLoginStatus()) {
      openDrawerAfter()
    }
  }
})

// 二级页面控制
const activeView = ref('main') // 'main'或'payment'
const selectedPackage = ref<Pkg | null>(null)

// 切换到支付页面
function showPaymentView(pkg: Pkg) {
  selectedPackage.value = pkg
  useGlobalStore.updateOrderInfo({ pkgInfo: pkg })
  activeView.value = 'payment'
}

// 返回主视图
function backToMainView() {
  activeView.value = 'main'
  selectedPackage.value = null
}

// 处理支付成功
function handlePaymentSuccess() {
  ms.success(t('goods.purchaseSuccess'))
  activeView.value = 'main'
  selectedPackage.value = null

  // 刷新用户余额（直接查询数据库，确保获取最新数据）
  authStore.getUserBalance()

  // 关闭设置对话框
  setTimeout(() => {
    useGlobalStore.updateSettingsDialog(false)
  }, 2000)
}

onBeforeUnmount(() => {
  packageList.value = []
  loading.value = true
  accountLogs.value = []
  accountLogPage.value = 1

  // 确保返回主视图，清理资源
  activeView.value = 'main'
  selectedPackage.value = null
})

async function openDrawerAfter() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  loading.value = true
  try {
    // 清空当前套餐列表，避免显示旧数据
    packageList.value = []
    // 获取用户最新余额信息（直接查询数据库，不使用缓存）
    await authStore.getUserBalance()
    // 获取套餐列表
    const res: ResData = await fetchGetPackageAPI({ status: 1, size: 30 })
    packageList.value = res.data.rows
    // 获取签到记录
    await getSigninLog()
    // 获取账户明细
    await getAccountLogs()
    loading.value = false
  } catch (error) {
    loading.value = false
  }
}

const selectName = ref('')
const handleSelect = (item: { name: string }) => {
  selectName.value = item.name
  cramiSelect.value = false
}

function handleSuccess(pkg: Pkg) {
  // 切换到支付视图
  showPaymentView(pkg)
}

function splitDescription(description: string) {
  return description.split('\n')
}

const code = ref('')
const cramiSelect = ref(false)
async function useCrami() {
  if (!code.value.trim()) {
    ms.info(t('usercenter.pleaseEnterCardDetails'))
    return
  }

  try {
    loading.value = true
    await fetchUseCramiAPI({ code: code.value })
    ms.success(t('usercenter.cardRedeemSuccess'))
    // 刷新用户余额（直接查询数据库，确保获取最新数据）
    await authStore.getUserBalance()
    await getAccountLogs() // 刷新账户明细
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  } catch (error: any) {
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  }
}

// 由于globalConfig可能没有showCrami属性，这里默认为true显示卡密兑换
const showCrami = ref(true)

// 签到相关状态和方法
const signInData = ref<{ signInDate: string; isSigned: boolean }[]>([])
const signInLoading = ref(false)
const today = new Date().toISOString().split('T')[0]

const days = computed(() => {
  return signInData.value.map(item => ({
    ...item,
    day: item.signInDate.split('-').pop()?.replace(/^0/, ''),
    isToday: item.signInDate === today,
  }))
})

const consecutiveDays = computed(() => authStore.userInfo.consecutiveDays || 0)
const signInModel3Count = computed(() => Number(authStore.globalConfig?.signInModel3Count) || 0)
const signInModel4Count = computed(() => Number(authStore.globalConfig?.signInModel4Count) || 0)
const signInMjDrawToken = computed(() => Number(authStore.globalConfig?.signInMjDrawToken) || 0)

const hasSignedInToday = computed(() => {
  return signInData.value.some(item => item.signInDate === today && item.isSigned)
})

async function getSigninLog() {
  try {
    const res: ResData = await fetchSignLogAPI()
    if (res.success) {
      signInData.value = res.data || []
    }
  } catch (error) {
    // Handle error silently
  }
}

async function handleSignIn() {
  try {
    signInLoading.value = true
    const res: ResData = await fetchSignInAPI()
    if (res.success) {
      ms.success('签到成功！')
      await getSigninLog()
      await authStore.getUserInfo()
      await getAccountLogs() // 刷新账户明细
    }
    signInLoading.value = false
  } catch (error) {
    signInLoading.value = false
  }
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

// 获取用户信息和余额
const userBalance = computed(() => authStore.userBalance)
const isMember = computed(() => userBalance.value.isMember || false)

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 登录检测函数
function checkLoginStatus() {
  if (!isLogin.value) {
    // 显示消息提醒
    ms.warning('请先登录后使用会员中心')
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

// 监听登录状态变化
watch(isLogin, newLoginStatus => {
  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {
    // 显示消息提醒
    ms.warning('账户已登出，请重新登录后查看')
    useGlobalStore.updateSettingsDialog(false)
    authStore.setLoginDialog(true)
  }
})

// 添加对visible属性的监听，确保组件可见时重新加载数据
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        openDrawerAfter()
      }
    }
  }
)

// 账户明细相关状态
interface AccountLog {
  id: number
  rechargeType: number
  model3Count: number
  model4Count: number
  drawMjCount: number
  extent: string
  createdAt: string
  uid: string
}

const accountLogs = ref<AccountLog[]>([])
const accountLogLoading = ref(false)
const accountLogPage = ref(1)
const accountLogSize = ref(10)
const accountLogTotal = ref(0)

// 获取账户明细
async function getAccountLogs() {
  try {
    accountLogLoading.value = true
    const res: ResData = await fetchGetRechargeLogAPI({
      page: accountLogPage.value,
      size: accountLogSize.value,
    })
    if (res.success) {
      accountLogs.value = res.data.rows || []
      accountLogTotal.value = res.data.count || 0
    }
    accountLogLoading.value = false
  } catch (error) {
    accountLogLoading.value = false
  }
}

// 格式化积分显示
function formatCredit(log: AccountLog) {
  // 充值类型（1-9）
  if (log.rechargeType < 10) {
    if (log.model3Count > 0) return `+${log.model3Count} ${model3Name.value}`
    if (log.model4Count > 0) return `+${log.model4Count} ${model4Name.value}`
    if (log.drawMjCount > 0) return `+${log.drawMjCount} ${drawMjName.value}`
  }
  // 消费类型（10-14），统一显示为负数
  else {
    if (log.model3Count !== 0) return `-${Math.abs(log.model3Count)} ${model3Name.value}`
    if (log.model4Count !== 0) return `-${Math.abs(log.model4Count)} ${model4Name.value}`
    if (log.drawMjCount !== 0) return `-${Math.abs(log.drawMjCount)} ${drawMjName.value}`
  }
  return '0'
}

// 判断是否为消费类型
function isDeductType(rechargeType: number) {
  return rechargeType >= 10
}

// 格式化时间
function formatTime(time: string) {
  const date = new Date(time)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 页码变化
function handlePageChange(page: number) {
  accountLogPage.value = page
  getAccountLogs()
}
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 主视图 -->
    <div v-if="activeView === 'main'">
      <!-- 套餐列表卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('member.packageList') }}
        </div>

        <!-- 套餐列表 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="(item, index) in packageList"
            :key="index"
            :class="[
              item.name == selectName
                ? 'ring-2 ring-primary-500 shadow-md'
                : 'ring-1 ring-gray-200 dark:ring-gray-700',
              'rounded-lg p-6 hover:shadow-md bg-white dark:bg-gray-750',
            ]"
            @click="handleSelect(item)"
          >
            <div class="relative">
              <b class="text-lg font-semibold leading-8 dark:text-white">{{ item.name }}</b>
            </div>

            <div v-if="!isHideModel3Point" class="flex justify-between items-end mt-4">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                model3Name
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.model3Count > 99999 ? t('member.unlimitedQuota') : item.model3Count }}
              </span>
            </div>

            <div v-if="!isHideModel4Point" class="flex justify-between items-end mt-2">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                model4Name
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.model4Count > 99999 ? t('member.unlimitedQuota') : item.model4Count }}
              </span>
            </div>

            <div v-if="!isHideDrawMjPoint" class="flex justify-between items-end mt-2">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                drawMjName
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.drawMjCount > 99999 ? t('member.unlimitedQuota') : item.drawMjCount }}
              </span>
            </div>

            <div class="mt-4 flex items-baseline gap-x-1">
              <span class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{{
                `￥${item.price}`
              }}</span>
            </div>

            <div class="mt-6">
              <button @click.stop="handleSuccess(item)" class="btn btn-primary btn-md w-full">
                {{ t('member.purchasePackage') }}
              </button>
            </div>

            <ul
              v-if="item.des"
              class="mt-4 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-400"
            >
              <li
                v-for="(line, index) in splitDescription(item.des)"
                :key="index"
                class="flex gap-x-2"
              >
                <svg
                  class="h-5 w-5 flex-none text-primary-600 dark:text-primary-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clip-rule="evenodd"
                  />
                </svg>
                {{ line }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <!-- 签到和余额并排显示区域 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <!-- 签到日历卡片 - 左侧 -->
        <div
          class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col space-y-4 h-full"
        >
          <!-- 卡片标题 -->
          <div
            class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
          >
            {{ t('member.signInReward') }}
          </div>

          <!-- 签到信息 -->
          <div
            class="bg-gray-50 mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-700"
          >
            <span class="dark:text-gray-300">{{ t('member.signInReward') }}：</span>
            <span v-if="signInModel3Count > 0 && !isHideModel3Point"
              ><b class="mx-2 text-primary-500">{{ signInModel3Count }}</b
              ><span class="dark:text-gray-300">{{ model3Name }}</span></span
            >
            <span v-if="signInModel4Count > 0 && !isHideModel4Point"
              ><b class="mx-2 text-primary-500">{{ signInModel4Count }}</b
              ><span class="dark:text-gray-300">{{ model4Name }}</span></span
            >
            <span v-if="signInMjDrawToken > 0 && !isHideDrawMjPoint"
              ><b class="mx-2 text-primary-500">{{ signInMjDrawToken }}</b
              ><span class="dark:text-gray-300">{{ drawMjName }}</span></span
            >
            <span class="dark:text-gray-300"
              >（{{ t('member.continuousSignIn')
              }}<b class="text-red-500 mx-1">{{ consecutiveDays }}</b
              >{{ t('member.days') }}）</span
            >
          </div>

          <!-- 签到日历 -->
          <div class="flex-grow">
            <div
              class="grid grid-cols-7 text-center text-xs leading-6 text-gray-500 dark:text-gray-400"
            >
              <div>{{ t('member.sun') }}</div>
              <div>{{ t('member.mon') }}</div>
              <div>{{ t('member.tue') }}</div>
              <div>{{ t('member.wed') }}</div>
              <div>{{ t('member.thu') }}</div>
              <div>{{ t('member.fri') }}</div>
              <div>{{ t('member.sat') }}</div>
            </div>
            <div class="mt-2 grid grid-cols-7 text-sm">
              <div
                v-for="n in getFirstDayOfMonth(new Date().getFullYear(), new Date().getMonth())"
                :key="'empty-' + n"
                class="py-2"
              ></div>
              <div v-for="day in days" :key="day.signInDate" class="py-2">
                <button
                  type="button"
                  :class="[
                    day.isToday
                      ? 'bg-primary-600 text-white'
                      : day.isSigned
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-900 dark:text-gray-100',
                    'hover:bg-gray-200 dark:hover:bg-gray-700 mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                  ]"
                >
                  <time :datetime="day.signInDate">{{ day.day }}</time>
                </button>
              </div>
            </div>
          </div>

          <!-- 签到按钮 -->
          <div class="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              @click="handleSignIn"
              :disabled="hasSignedInToday || signInLoading"
              class="btn btn-primary btn-md w-full"
            >
              <span v-if="signInLoading">{{ t('member.signInLoading') }}</span>
              <span v-else-if="hasSignedInToday">{{ t('member.hasSignedIn') }}</span>
              <span v-else>{{ t('member.signIn') }}</span>
            </button>
          </div>
        </div>

        <!-- 钱包余额卡片 - 右侧 -->
        <div
          class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col space-y-4 h-full"
        >
          <!-- 卡片标题 -->
          <div
            class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
          >
            {{ t('member.quotaInfo') }}
          </div>

          <!-- 余额信息 -->
          <div class="space-y-3">
            <!-- 基础模型积分 -->
            <div
              v-if="!isHideModel3Point"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ model3Name }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumModel3Count > 999999
                    ? t('member.unlimitedQuota')
                    : (userBalance.sumModel3Count ?? 0)
                }}
              </div>
            </div>

            <!-- 高级模型积分 -->
            <div
              v-if="!isHideModel4Point"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ model4Name }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumModel4Count > 99999
                    ? t('member.unlimitedQuota')
                    : (userBalance.sumModel4Count ?? 0)
                }}
              </div>
            </div>

            <!-- 绘画积分 -->
            <div
              v-if="!isHideDrawMjPoint"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ drawMjName }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumDrawMjCount > 99999
                    ? t('member.unlimitedQuota')
                    : (userBalance.sumDrawMjCount ?? 0)
                }}
              </div>
            </div>

            <!-- 会员到期时间 -->
            <div
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">
                {{ t('member.memberStatus') }}
              </div>
              <div
                class="text-lg font-bold"
                :class="isMember ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'"
              >
                {{
                  userBalance.expirationTime
                    ? `${userBalance.expirationTime} ${t('member.expiresOn')}`
                    : t('member.nonMember')
                }}
              </div>
            </div>
          </div>

          <!-- 卡密兑换部分移至此处 -->
          <div
            v-if="showCrami"
            class="flex-grow mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
          >
            <div class="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">
              {{ t('member.cardActivation') }}
            </div>
            <div class="flex items-center space-x-2">
              <input
                v-model="code"
                :placeholder="t('usercenter.enterCardDetails')"
                class="input input-md w-full"
                type="text"
              />
              <button
                :disabled="loading || !code"
                @click="useCrami"
                class="btn btn-primary btn-md w-24"
              >
                {{ t('member.activate') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 账户明细卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('member.accountDetails') }}
        </div>

        <!-- 账户明细列表 -->
        <div
          v-if="accountLogLoading"
          class="flex justify-center items-center"
          style="height: 200px"
        >
          <div class="loading-animation">
            <span></span>
          </div>
        </div>
        <div v-else-if="accountLogs.length === 0" class="flex justify-center items-center py-8">
          <div class="text-gray-500 dark:text-gray-400">{{ t('member.noRecords') }}</div>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="log in accountLogs"
            :key="log.id"
            class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
          >
            <!-- 左侧：类型和时间 -->
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-xs font-medium',
                    isDeductType(log.rechargeType)
                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400',
                  ]"
                >
                  {{ RECHARGE_TYPE_MAP[log.rechargeType] || t('member.unknown') }}
                </span>
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ formatTime(log.createdAt) }}
              </div>
              <div v-if="log.extent" class="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate">
                {{ log.extent }}
              </div>
            </div>

            <!-- 右侧：积分变动 -->
            <div class="text-right">
              <div
                :class="[
                  'text-base font-bold',
                  isDeductType(log.rechargeType)
                    ? 'text-gray-600 dark:text-gray-400'
                    : 'text-primary-600 dark:text-primary-400',
                ]"
              >
                {{ formatCredit(log) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="accountLogTotal > accountLogSize" class="flex justify-center pt-4">
          <div class="flex items-center gap-2">
            <button
              @click="handlePageChange(accountLogPage - 1)"
              :disabled="accountLogPage === 1"
              class="btn btn-sm"
              :class="{ 'opacity-50 cursor-not-allowed': accountLogPage === 1 }"
            >
              {{ t('member.prevPage') }}
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ accountLogPage }} / {{ Math.ceil(accountLogTotal / accountLogSize) }}
            </span>
            <button
              @click="handlePageChange(accountLogPage + 1)"
              :disabled="accountLogPage >= Math.ceil(accountLogTotal / accountLogSize)"
              class="btn btn-sm"
              :class="{
                'opacity-50 cursor-not-allowed':
                  accountLogPage >= Math.ceil(accountLogTotal / accountLogSize),
              }"
            >
              {{ t('member.nextPage') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 支付视图 -->
    <MemberPayment
      v-else-if="activeView === 'payment'"
      :visible="activeView === 'payment'"
      @back-to-main="backToMainView"
      @payment-success="handlePaymentSuccess"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
