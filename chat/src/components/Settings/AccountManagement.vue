<script setup lang="ts">
import { fetchSendSms, fetchUpdateInfoAPI, fetchUpdatePasswordAPI } from '@/api'
import type { ResData } from '@/api/types'
import {
  fetchBindWxByOldWechatAPI,
  fetchBindWxBySceneStrAPI,
  fetchGetOldQRCodeAPI,
  fetchGetQRCodeAPI,
  fetchGetQRSceneStrByBindAPI,
  fetchGetQRSceneStrByOldWechatAPI,
  fetchVerifyIdentityAPI,
  fetchVerifyPhoneIdentityAPI,
} from '@/api/user'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { setLocale } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import type { Language } from '@/store/modules/app/helper'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import {
  ArrowLeft,
  Brightness,
  CheckOne,
  DarkMode,
  Edit,
  IdCard,
  Lock,
  Phone,
  Translate,
  User,
  Wechat,
} from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SliderCaptcha from '../Login/SliderCaptcha.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const appStore = useAppStore()
const loading = ref(false)
const ms = message()
const showPasswordForm = ref(false)
const { t } = useI18n()

const { isMobile } = useBasicLayout()

// 语言和主题相关
const darkMode = computed(() => appStore.theme === 'dark')
const currentLanguage = computed(() => appStore.language)
const isLanguageMenuOpen = ref(false)

// 所有语言选项
const allLanguageOptions = [
  { value: 'zh-CN', label: '简体中文', icon: '🇨🇳' },
  { value: 'zh-TW', label: '繁體中文', icon: '🇨🇳' },
  { value: 'en-US', label: 'English', icon: '🇺🇸' },
  { value: 'ja-JP', label: '日本語', icon: '🇯🇵' },
  { value: 'ko-KR', label: '한국어', icon: '🇰🇷' },
  { value: 'ru-RU', label: 'Русский', icon: '🇷🇺' },
  { value: 'fr-FR', label: 'Français', icon: '🇫🇷' },
  { value: 'de-DE', label: 'Deutsch', icon: '🇩🇪' },
  { value: 'es-ES', label: 'Español', icon: '🇪🇸' },
  { value: 'ar-SA', label: 'العربية', icon: '🇸🇦' },
  { value: 'it-IT', label: 'Italiano', icon: '🇮🇹' },
  { value: 'pt-PT', label: 'Português', icon: '🇵🇹' },
  { value: 'hi-IN', label: 'हिन्दी', icon: '🇮🇳' },
  { value: 'th-TH', label: 'ภาษาไทย', icon: '🇹🇭' },
  { value: 'vi-VN', label: 'Tiếng Việt', icon: '🇻🇳' },
]

// 根据全局配置过滤可用语言
const languageOptions = computed(() => {
  const globalConfig = authStore.globalConfig
  if (!globalConfig?.enabledLanguages) {
    return allLanguageOptions
  }

  let enabledLanguages: string[] = []
  try {
    if (typeof globalConfig.enabledLanguages === 'string') {
      enabledLanguages = JSON.parse(globalConfig.enabledLanguages)
    } else if (Array.isArray(globalConfig.enabledLanguages)) {
      enabledLanguages = globalConfig.enabledLanguages
    }
  } catch (e) {
    return allLanguageOptions
  }

  return allLanguageOptions.filter(option => enabledLanguages.includes(option.value))
})

// 切换主题
function toggleTheme() {
  const mode = darkMode.value ? 'light' : 'dark'
  appStore.setTheme(mode)
}

// 切换语言
function switchLanguage(lang: Language) {
  const availableLanguages = languageOptions.value.map(opt => opt.value)
  if (!availableLanguages.includes(lang)) {
    return
  }
  appStore.setLanguage(lang)
  setLocale(lang)
  isLanguageMenuOpen.value = false
}

// 定义用户信息完整类型
interface UserInfo {
  username: string
  email: string
  role: string
  id: string | number
  avatar?: string
  sign?: string
  isBindWx: boolean
  consecutiveDays: number
  nickname?: string
  phone?: string
  realName?: string
  idCard?: string
}

// 获取用户信息和余额
const userInfo = computed(() => (authStore.userInfo as UserInfo) || ({} as UserInfo))

const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
)
const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)
const openIdentity = computed(() => Number(authStore.globalConfig.openIdentity) === 1)
const oldWechatMigrationStatus = computed(
  () => Number(authStore.globalConfig.oldWechatMigrationStatus) === 1
)

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 密码修改相关
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const oldPasswordError = ref('')
const passwordError = ref('')
const reenteredPasswordError = ref('')
const isPasswordUpdating = ref(false)

// 处理密码修改表单提交
function handlePasswordFormSubmit() {
  const { oldPassword, newPassword, confirmPassword } = passwordForm

  // 清空之前的错误信息
  oldPasswordError.value = ''
  passwordError.value = ''
  reenteredPasswordError.value = ''

  if (!oldPassword) {
    oldPasswordError.value = t('settings.enterOldPassword')
    return
  }

  // 验证新密码
  if (!newPassword) {
    passwordError.value = t('settings.enterNewPassword')
    return
  }

  // 验证密码格式
  if (newPassword.length < 12 || newPassword.length > 128) {
    passwordError.value = t('settings.passwordLength')
    return
  }
  if (!/[a-zA-Z]/.test(newPassword)) {
    passwordError.value = t('settings.passwordMustContainLetter')
    return
  }
  if (!/\d/.test(newPassword)) {
    passwordError.value = t('settings.passwordMustContainNumber')
    return
  }

  // 验证确认密码
  if (!confirmPassword) {
    reenteredPasswordError.value = t('settings.enterNewPasswordAgain')
    return
  }
  if (newPassword !== confirmPassword) {
    reenteredPasswordError.value = t('settings.passwordNotMatch')
    return
  }

  // 所有验证通过，提交密码修改
  updatePassword()
}

async function updatePassword() {
  try {
    loading.value = true
    isPasswordUpdating.value = true

    const res: ResData = await fetchUpdatePasswordAPI({
      oldPassword: passwordForm.oldPassword,
      password: passwordForm.newPassword,
    })

    loading.value = false
    isPasswordUpdating.value = false

    if (res.success) {
      ms.success(t('settings.passwordChangeSuccess'))
      resetForm()
      authStore.updatePasswordSuccess()
      backToMainView()
    } else {
      ms.error(res.message || t('settings.passwordChangeFailed'))
    }
  } catch (error: any) {
    loading.value = false
    isPasswordUpdating.value = false
    ms.error(error?.message || t('settings.passwordChangeFailed'))
  }
}

function resetForm() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  oldPasswordError.value = ''
  passwordError.value = ''
  reenteredPasswordError.value = ''
}

// 登录检测函数
function checkLoginStatus() {
  if (!isLogin.value) {
    // 显示消息提醒
    ms.warning('请登录后使用账户管理')
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

async function getInfo() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  try {
    loading.value = true

    // 添加超时控制
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('获取用户信息超时')), 10000)
    )

    await Promise.race([authStore.getUserInfo(), timeout])

    loading.value = false
  } catch (error) {
    loading.value = false
    // 失败时也需要重置UI状态
    resetUiState()
  }
}

const avatar = computed(
  () => userInfo.value.avatar || authStore.globalConfig.userDefaultAvatar || ''
)
const email = computed(() => userInfo.value.email || '')
const nickname = computed(() => userInfo.value.nickname || '')
const phone = computed(() => userInfo.value.phone || '')
const realName = computed(() => userInfo.value.realName || '')

// 判断是否显示邮箱
const shouldShowEmail = computed(() => {
  if (!email.value) return false
  if (!emailLoginStatus.value) return false
  const excludeDomains = ['@internal.invalid']
  return !excludeDomains.some(domain => email.value.endsWith(domain))
})

// 个人信息编辑
const isEditingInfo = ref(false)
const editableNickname = ref('')

function startEditingInfo() {
  editableNickname.value = nickname.value
  isEditingInfo.value = true
}

function cancelEditingInfo() {
  isEditingInfo.value = false
}

async function saveUserInfo() {
  try {
    loading.value = true
    const res: ResData = await fetchUpdateInfoAPI({
      nickname: editableNickname.value,
    })
    loading.value = false

    if (!res.success) {
      ms.error(res.message || '更新失败')
      return
    }

    ms.success(t('settings.personalInfoUpdateSuccess'))
    isEditingInfo.value = false
    await authStore.getUserInfo()
  } catch (error) {
    loading.value = false
    ms.error(t('settings.updateFailed'))
  }
}

// 身份验证和手机验证相关
const showVerificationSection = ref(false) // 控制验证部分的展开/收起
const useGlobalStore = useGlobalStoreWithOut()
const globalConfig = computed(() => authStore.globalConfig)

// 身份认证
const isShowIdVerify = ref(false) // 身份验证滑块
const isShowPhoneVerify = ref(false) // 手机验证滑块

// 身份认证表单
const identityForm = ref({
  name: '',
  idCard: '',
})

// 手机认证表单
const phoneForm = ref({
  phone: '',
  code: '',
})

// 验证相关
const agreedToUserAgreement = ref(true) // 是否同意用户协议
const sendCodeLoading = ref(false)
const countdown = ref(0)
const timer = ref<number | null>(null)

// 微信绑定相关
// const countdownRef = ref<CountdownInst | null>()
const countdownRef = ref<number | null>(null)
const remainingTime = ref(120)
const isCountingDown = ref(false)
const activeCount = ref(false)
const wxLoginUrl = ref('')
const sceneStr = ref('')
const qrConfirmationCode = ref('')
const showWxBindSection = ref(false)
const wxBindTimer = ref<number | null>(null)
const isWxBound = computed(() => {
  return userInfo.value && Number(userInfo.value.isBindWx) === 1
})

// 当前显示视图控制
const activeView = ref('main') // 'main', 'phone', 'identity', 'wx', 'password', 'wxMigration'

function formatQrCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

// 切换到绑定手机界面
function showPhoneBindView() {
  activeView.value = 'phone'
}

// 切换到实名认证界面
function showIdentityView() {
  activeView.value = 'identity'
}

// 切换到微信绑定界面
function showWxBindView() {
  // 先清理之前可能存在的微信绑定资源
  cleanupWxBind()

  // 再切换视图
  activeView.value = 'wx'

  // 如果未绑定微信，获取场景字符串
  if (activeView.value === 'wx' && !isWxBound.value) {
    getSeneStr()
  }
}

// 返回主视图
function backToMainView() {
  // 如果是从微信绑定界面返回，立即清理微信绑定相关资源
  if (activeView.value === 'wx') {
    cleanupWxBind()
  }
  activeView.value = 'main'
}

// 切换验证区域展示

// 切换认证标签

// 切换到修改密码界面
function showPasswordView() {
  activeView.value = 'password'
}

// 点击"用户协议及隐私政策"时，显示用户协议弹窗
function handleAgreementClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateUserAgreementDialog(true)
}

// 身份认证提交
function handleIdentitySubmit() {
  if (
    agreedToUserAgreement.value === false &&
    Number(globalConfig.value.isAutoOpenAgreement) === 1
  ) {
    return ms.error(`请阅读并同意《${globalConfig.value.agreementTitle}》`)
  }
  onIdentitySuccess()
  // isShowIdVerify.value = true
}

// 身份认证成功回调
function onIdentitySuccess() {
  isShowIdVerify.value = false
  fetchVerifyIdentityAPI(identityForm.value).then((res: any) => {
    if (res.code === 200) {
      ms.success(t('settings.authSuccess'))
      getInfo() // 刷新用户信息
    } else {
      ms.error(res.message || t('settings.authFailed'))
    }
  })
}

// 发送手机验证码
async function sendCode() {
  if (!phoneForm.value.phone) {
    return ms.error(t('settings.enterPhone'))
  }

  if (countdown.value > 0) return

  try {
    sendCodeLoading.value = true
    const params = { phone: phoneForm.value.phone }
    const res: ResData = await fetchSendSms(params)

    if (res.success) {
      ms.success(res.data || '验证码已发送')
      countdown.value = 60
      startCountdown()
    } else {
      ms.error(res.message || '发送验证码失败')
    }
  } catch (error) {
    ms.error('发送验证码失败，请稍后重试')
  } finally {
    sendCodeLoading.value = false
  }
}

// 开始倒计时
const startCountdown = () => {
  if (isCountingDown.value) return

  isCountingDown.value = true
  remainingTime.value = 120

  countdownRef.value = window.setInterval(() => {
    remainingTime.value--
    if (remainingTime.value <= 0) {
      clearInterval(countdownRef.value!)
      countdownRef.value = null
      isCountingDown.value = false
    }
  }, 1000)
}

// 手机认证验证
function handlePhoneSubmit() {
  if (
    agreedToUserAgreement.value === false &&
    Number(globalConfig.value.isAutoOpenAgreement) === 1
  ) {
    return ms.error(`请阅读并同意《${globalConfig.value.agreementTitle}》`)
  }

  if (!phoneForm.value.phone || !phoneForm.value.code) {
    return ms.error('请填写完整信息')
  }
  onPhoneSuccess()
  // isShowPhoneVerify.value = true
}

// 手机认证成功回调
async function onPhoneSuccess() {
  isShowPhoneVerify.value = false
  try {
    loading.value = true

    // 使用正确的API进行手机认证
    const res = (await fetchVerifyPhoneIdentityAPI({
      phone: phoneForm.value.phone,
      code: phoneForm.value.code,
      username: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
      password: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
    })) as ResData

    if (res.success) {
      ms.success('手机认证成功')

      // 重置表单
      phoneForm.value.phone = ''
      phoneForm.value.code = ''

      // 刷新用户信息
      await getInfo()

      // 返回主视图
      backToMainView()
    } else {
      ms.error(res.message || '手机认证失败')
    }
  } catch (error) {
    ms.error('手机认证失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 获取场景字符串
async function getSeneStr() {
  try {
    const res = (await fetchGetQRSceneStrByBindAPI()) as ResData
    if (res.success) {
      sceneStr.value = res.data.sceneStr
      qrConfirmationCode.value = res.data.confirmationCode
      getQrCodeUrl()
      // 开始倒计时
      startCountdown()
    }
  } catch (error) {
    // Handle error silently
  }
}

// 获取二维码URL
async function getQrCodeUrl() {
  try {
    const res = (await fetchGetQRCodeAPI({ sceneStr: sceneStr.value })) as ResData
    if (res.success) {
      activeCount.value = true
      wxLoginUrl.value = res.data
      // 使用window.setInterval并保存引用，以便清理
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
      }
      wxBindTimer.value = window.setInterval(() => {
        bindWxBySnece()
      }, 1000)
    }
  } catch (error) {
    // Handle error silently
  }
}

// 通过场景字符串绑定微信
async function bindWxBySnece() {
  if (!sceneStr.value) return
  try {
    const res = (await fetchBindWxBySceneStrAPI({
      sceneStr: sceneStr.value,
    })) as ResData
    if (res.data) {
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
        wxBindTimer.value = null
      }
      const { status, msg } = res.data
      if (status) {
        ms.success(msg)
        await authStore.getUserInfo()
        // 绑定成功后自动关闭微信绑定区域
        showWxBindSection.value = false
      } else {
        // 绑定失败，显示错误信息
        ms.error(msg || t('settings.bindFailed'))
        // 返回主视图
        backToMainView()
      }
    }
  } catch (error) {
    // Handle error silently
  }
}

// 清理微信绑定相关资源
function cleanupWxBind() {
  if (wxBindTimer.value !== null) {
    clearInterval(wxBindTimer.value)
    wxBindTimer.value = null
  }
  wxLoginUrl.value = ''
  sceneStr.value = ''
  qrConfirmationCode.value = ''
  activeCount.value = false
}

// 取消绑定微信
async function unbindWx() {
  try {
    // 这里需要后端提供取消绑定的API
    // const res: ResData = await fetchUnbindWxAPI()
    // if (res.success) {
    //   ms.success('解绑成功')
    //   await authStore.getUserInfo()
    // }
    ms.warning('暂不支持解绑微信，请联系管理员')
  } catch (error) {
    // Handle error silently
  }
}

// 显示旧微信迁移界面
function showOldWechatMigration() {
  // 清理之前可能存在的资源
  cleanupWechatMigration()

  // 切换视图
  activeView.value = 'wxMigration'

  // 获取场景字符串
  getOldWechatSceneStr()
}

// 获取旧微信账号迁移的场景字符串
async function getOldWechatSceneStr() {
  try {
    const res = (await fetchGetQRSceneStrByOldWechatAPI()) as ResData
    if (res.success) {
      sceneStr.value = res.data.sceneStr
      qrConfirmationCode.value = res.data.confirmationCode
      getOldWechatQrCodeUrl()
      // 开始倒计时
      startCountdown()
    } else {
      ms.error(res.message || '获取二维码场景失败')
    }
  } catch (error) {
    ms.error('获取二维码场景失败，请稍后再试')
  }
}

// 获取旧微信账号迁移的二维码URL
async function getOldWechatQrCodeUrl() {
  try {
    const res = (await fetchGetOldQRCodeAPI({ sceneStr: sceneStr.value })) as ResData
    if (res.success) {
      activeCount.value = true
      wxLoginUrl.value = res.data
      // 使用window.setInterval并保存引用，以便清理
      if (wxMigrationTimer.value !== null) {
        clearInterval(wxMigrationTimer.value)
      }
      wxMigrationTimer.value = window.setInterval(() => {
        checkOldWechatMigrationStatus()
      }, 2500) // 每2.5秒轮询一次
    } else {
      ms.error(res.message || '获取二维码失败')
    }
  } catch (error) {
    ms.error('获取二维码失败，请稍后再试')
  }
}

// 轮询检查迁移状态
async function checkOldWechatMigrationStatus() {
  if (!sceneStr.value) return
  try {
    const res = (await fetchBindWxByOldWechatAPI({
      sceneStr: sceneStr.value,
    })) as ResData

    // 如果返回空，继续轮询
    if (res.data === '') return

    // 收到结果后停止轮询
    if (wxMigrationTimer.value !== null) {
      clearInterval(wxMigrationTimer.value)
      wxMigrationTimer.value = null
    }

    // 处理迁移结果
    if (res.data && res.data.success) {
      ms.success(res.data.message || '账号迁移成功，请重新登录')

      // 如果需要重新登录，则调用登出方法
      if (res.data.needRelogin) {
        // 延迟1秒后退出登录，给用户时间看到成功消息
        setTimeout(() => {
          authStore.logOut()
          // 刷新页面以确保完全登出
          window.location.reload()
        }, 1000)
      }
    } else if (res.data) {
      // 迁移失败
      ms.error(res.data.message || '账号迁移失败')
    }
  } catch (error) {
    ms.error('检查迁移状态失败，请稍后再试')
  }
}

// 清理微信迁移相关资源
const wxMigrationTimer = ref<number | null>(null)

function cleanupWechatMigration() {
  if (wxMigrationTimer.value !== null) {
    clearInterval(wxMigrationTimer.value)
    wxMigrationTimer.value = null
  }
  wxLoginUrl.value = ''
  sceneStr.value = ''
  qrConfirmationCode.value = ''
  activeCount.value = false
}

// 添加onBeforeUnmount钩子来清理资源
onBeforeUnmount(() => {
  // 重置加载状态
  loading.value = false

  // 清除任何可能正在运行的定时器
  if (timer.value !== null) {
    clearInterval(timer.value)
    timer.value = null
  }

  // 重置表单状态
  resetForm()

  // 关闭任何打开的验证对话框
  isShowIdVerify.value = false
  isShowPhoneVerify.value = false

  // 重置编辑状态
  isEditingInfo.value = false

  // 重置展开/折叠状态
  showVerificationSection.value = false
  showPasswordForm.value = false

  // 清理微信绑定相关资源
  cleanupWxBind()
  cleanupWechatMigration()
})

// 添加一个函数来重置UI状态
function resetUiState() {
  isEditingInfo.value = false
  showVerificationSection.value = false
  showPasswordForm.value = false
  showWxBindSection.value = false
  activeView.value = 'main' // 重置为主视图
}

// 监听visible属性变化，确保在组件变为不可见时重置状态
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        getInfo()
      }
    } else {
      // 当组件不可见时，重置所有状态
      resetUiState()
      loading.value = false
      // 确保清理微信绑定的定时器
      cleanupWxBind()
    }
  }
)

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

onMounted(() => {
  // 组件挂载时检查登录状态
  if (checkLoginStatus()) {
    getInfo()
  }
})

// 手机号加密显示：123****7890
function maskPhone(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 7) return phoneNumber
  return phoneNumber.replace(/(\d{3})\d*(\d{4})/, '$1****$2')
}

// 视图控制

// 手机绑定信息
const phoneBindInfo = reactive({
  status: computed(() => (phone.value ? 'bound' : 'unbound')),
  phone: computed(() => maskPhone(phone.value)),
})

// 实名认证状态
const identityStatus = computed(() => (realName.value ? 'verified' : 'unverified'))
</script>

<template>
  <div class="w-full">
    <!-- 主视图 -->
    <div
      v-if="activeView === 'main'"
      class="overflow-y-auto custom-scrollbar p-1"
      :class="{ 'max-h-[70vh]': !isMobile }"
    >
      <!-- 用户基本信息卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('settings.personalInfo') }}
        </div>

        <!-- 头像展示 -->
        <div class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">{{ t('settings.avatar') }}</div>
          <!-- <div>
            <img :src="avatar" alt="头像" class="w-20 h-20 rounded-full cursor-pointer" />
          </div> -->
          <div class="avatar avatar-lg avatar-bordered avatar-primary">
            <img v-if="avatar" :src="avatar" class="w-full h-full object-cover" alt="用户头像" />
            <User v-if="!avatar" theme="outline" size="20" class="text-white" aria-hidden="true" />
          </div>
        </div>

        <!-- 用户信息展示 - 每行一个信息 -->
        <!-- <div class="flex items-center">
          <div class="w-24 text-gray-500 dark:text-gray-400">用户名</div>
          <div class="text-gray-900 dark:text-gray-200">
            {{ username || '未设置' }}
          </div>
        </div> -->

        <div class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">{{ t('settings.nickname') }}</div>
          <div v-if="!isEditingInfo" class="flex items-center">
            <div class="text-gray-900 dark:text-gray-200">
              {{ nickname || '未设置' }}
            </div>
            <div class="group relative ml-2">
              <button @click="startEditingInfo" class="btn-icon btn-sm" aria-label="编辑昵称">
                <Edit theme="outline" size="16" class="text-gray-500 hover:text-primary-600" />
              </button>
              <div class="tooltip tooltip-right">{{ t('common.edit') }}</div>
            </div>
          </div>
          <div v-else class="flex items-center space-x-2">
            <input
              v-model="editableNickname"
              class="input input-md w-full"
              :placeholder="t('settings.enterNickname')"
            />
            <button @click="saveUserInfo" class="btn btn-primary btn-md">
              {{ t('common.save') }}
            </button>
            <button @click="cancelEditingInfo" class="btn btn-secondary btn-md">
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>

        <div v-if="shouldShowEmail" class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">{{ t('settings.email') }}</div>
          <div class="text-gray-900 dark:text-gray-200">{{ email }}</div>
        </div>
      </div>

      <!-- 显示设置卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('settings.displaySettings') }}
        </div>

        <!-- 显示设置选项 -->
        <div class="grid grid-cols-1 gap-4">
          <!-- 语言设置 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.interfaceLanguage') }}
                  <Translate theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ t('settings.selectYourLanguage') }}
                </div>
              </div>
            </div>
            <div class="relative">
              <DropdownMenu
                v-model="isLanguageMenuOpen"
                position="bottom-right"
                :max-height="'200px'"
                :z-index="9999"
              >
                <template #trigger>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm min-w-[120px] justify-between"
                  >
                    <span class="flex items-center">
                      <span class="mr-2">
                        {{
                          languageOptions.find(lang => lang.value === currentLanguage)?.icon || '🌐'
                        }}
                      </span>
                      <span>
                        {{
                          languageOptions.find(lang => lang.value === currentLanguage)?.label ||
                          t('settings.language')
                        }}
                      </span>
                    </span>
                  </button>
                </template>
                <template #menu="{ close }">
                  <div>
                    <div
                      v-for="lang in languageOptions"
                      :key="lang.value"
                      class="menu-item menu-item-sm"
                      :class="{ 'menu-item-active': currentLanguage === lang.value }"
                      @click="
                        () => {
                          switchLanguage(lang.value as Language)
                          close()
                        }
                      "
                      role="menuitem"
                      tabindex="0"
                    >
                      <span class="mr-2">{{ lang.icon }}</span>
                      <span>{{ lang.label }}</span>
                      <CheckOne
                        v-if="currentLanguage === lang.value"
                        theme="filled"
                        size="16"
                        class="ml-auto text-gray-500 dark:text-gray-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </template>
              </DropdownMenu>
            </div>
          </div>

          <!-- 主题设置 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.interfaceTheme') }}
                  <component
                    :is="darkMode ? DarkMode : Brightness"
                    theme="outline"
                    size="16"
                    class="text-gray-500 ml-1"
                  />
                </div>
                <div class="text-xs text-gray-500">
                  {{ darkMode ? t('settings.darkMode') : t('settings.lightMode') }}
                </div>
              </div>
            </div>
            <button
              @click="toggleTheme"
              type="button"
              class="group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none"
              role="switch"
              :aria-checked="darkMode"
              :aria-label="`${darkMode ? t('settings.darkMode') : t('settings.lightMode')}`"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none absolute h-full w-full rounded-full bg-white dark:bg-transparent"
              ></span>
              <span
                aria-hidden="true"
                :class="[
                  darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700',
                  'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out',
                ]"
              ></span>
              <span
                aria-hidden="true"
                :class="[
                  darkMode ? 'translate-x-5' : 'translate-x-0',
                  'pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-500 shadow ring-0 transition-transform duration-200 ease-in-out',
                ]"
              ></span>
            </button>
          </div>
        </div>
      </div>

      <!-- 账户安全卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('settings.accountSecurity') }}
        </div>

        <!-- 账户安全选项 -->
        <div class="grid grid-cols-1 gap-4">
          <!-- 手机绑定 -->
          <div v-if="phoneLoginStatus" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.bindPhone') }}
                  <Phone theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{
                    phoneBindInfo.status === 'bound' ? t('settings.bound') : t('settings.notBound')
                  }}
                  {{ phoneBindInfo.phone || '' }}
                </div>
              </div>
            </div>
            <button
              v-if="phoneBindInfo.status !== 'bound'"
              @click="showPhoneBindView"
              class="btn btn-secondary btn-sm"
            >
              {{ t('common.settings') }}
            </button>
            <span v-else class="text-green-600 text-sm">{{ t('settings.bound') }}</span>
          </div>

          <!-- 微信绑定 -->
          <div v-if="wechatRegisterStatus" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.wechatBinding') }}
                  <Wechat theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ isWxBound ? t('settings.wechatBound') : t('settings.wechatUnbound') }}
                </div>
              </div>
            </div>
            <button @click="showWxBindView" class="btn btn-secondary btn-sm" :disabled="isWxBound">
              {{ isWxBound ? t('settings.alreadyBound') : t('common.bind') }}
            </button>
          </div>

          <!-- 旧微信账号迁移 -->
          <div
            v-if="wechatRegisterStatus && oldWechatMigrationStatus"
            class="flex items-center justify-between"
          >
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.oldWechatMigration') }}
                  <Wechat theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">{{ t('settings.oldWechatMigrationDesc') }}</div>
              </div>
            </div>
            <button @click="showOldWechatMigration" class="btn btn-sm btn-secondary">
              {{ t('settings.migrate') }}
            </button>
          </div>

          <!-- 实名认证 -->
          <div v-if="openIdentity" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  实名认证
                  <IdCard theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ identityStatus === 'verified' ? '已认证' : '未认证' }}
                </div>
              </div>
            </div>
            <button
              v-if="identityStatus !== 'verified'"
              @click="showIdentityView"
              class="btn btn-secondary btn-sm"
            >
              认证
            </button>
            <span v-else class="text-green-600 text-sm">已完成</span>
          </div>

          <!-- 修改密码 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  {{ t('settings.accountPassword') }}
                  <Lock theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">{{ t('settings.passwordSecurity') }}</div>
              </div>
            </div>
            <button @click="showPasswordView" class="btn btn-secondary btn-sm">
              {{ t('settings.modify') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改密码视图 -->
    <div
      v-else-if="activeView === 'password'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 修改密码卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">修改密码</div>
        </div>

        <form @submit.prevent="handlePasswordFormSubmit" class="flex flex-col space-y-4">
          <!-- 当前密码 -->
          <div class="flex flex-col space-y-1">
            <label for="old-password" class="text-sm text-gray-700 dark:text-gray-300">{{
              t('settings.oldPassword')
            }}</label>
            <input
              id="old-password"
              v-model="passwordForm.oldPassword"
              type="password"
              :placeholder="t('settings.enterOldPassword')"
              class="input input-md w-full"
              autocomplete="current-password"
              required
            />
            <div v-if="oldPasswordError" class="text-xs text-red-500 mt-1">
              {{ oldPasswordError }}
            </div>
          </div>

          <!-- 新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="new-password" class="text-sm text-gray-700 dark:text-gray-300">{{
              t('settings.newPassword')
            }}</label>
            <input
              id="new-password"
              v-model="passwordForm.newPassword"
              type="password"
              :placeholder="t('settings.enterNewPassword')"
              class="input input-md w-full"
              autocomplete="new-password"
              required
            />
            <div class="text-xs text-gray-500">{{ t('settings.passwordRequirement') }}</div>
            <div v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</div>
          </div>

          <!-- 确认新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="confirm-password" class="text-sm text-gray-700 dark:text-gray-300">{{
              t('settings.confirmNewPassword')
            }}</label>
            <input
              id="confirm-password"
              v-model="passwordForm.confirmPassword"
              type="password"
              :placeholder="t('settings.enterNewPasswordAgain')"
              class="input input-md w-full"
              autocomplete="new-password"
              required
            />
            <div v-if="reenteredPasswordError" class="text-xs text-red-500 mt-1">
              {{ reenteredPasswordError }}
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="pt-2">
            <button
              type="submit"
              class="btn btn-primary btn-md w-full"
              :disabled="isPasswordUpdating"
            >
              <span v-if="isPasswordUpdating">{{ t('common.submitting') }}</span>
              <span v-else>{{ t('common.confirm') }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 手机绑定视图 -->
    <div
      v-else-if="activeView === 'phone'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 手机绑定卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ t('settings.bindPhone') }}
          </div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('settings.phoneNumber') }}
            </label>
            <input
              v-model="phoneForm.phone"
              class="input input-md w-full"
              :placeholder="t('settings.enterPhoneNumber')"
            />
          </div>
          <div class="flex space-x-2">
            <div class="flex-1">
              <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('settings.verificationCode') }}
              </label>
              <input
                v-model="phoneForm.code"
                class="input input-md w-full"
                :placeholder="t('settings.enterVerificationCode')"
              />
            </div>
            <div class="flex items-end">
              <button
                @click="sendCode"
                class="btn btn-secondary btn-md w-full"
                :disabled="sendCodeLoading || countdown > 0"
              >
                {{ countdown > 0 ? `${countdown}s后重新获取` : t('settings.getVerificationCode') }}
              </button>
            </div>
          </div>

          <div v-if="Number(globalConfig.isAutoOpenAgreement) === 1" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <p class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400">
              {{ t('settings.readAndAgree') }}
              <a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
                @click="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handlePhoneSubmit" class="btn btn-primary btn-md w-full">
              {{ t('common.submitAuth') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 实名认证视图 -->
    <div
      v-else-if="activeView === 'identity'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 实名认证卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">实名认证</div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              真实姓名
            </label>
            <input
              v-model="identityForm.name"
              class="input input-md w-full"
              placeholder="请输入真实姓名"
            />
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              身份证号
            </label>
            <input
              v-model="identityForm.idCard"
              class="input input-md w-full"
              placeholder="请输入身份证号"
            />
          </div>

          <div v-if="Number(globalConfig.isAutoOpenAgreement) === 1" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <p class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400">
              {{ t('settings.readAndAgree') }}
              <a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
                @click="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handleIdentitySubmit" class="btn btn-primary btn-md w-full">
              {{ t('common.submitAuth') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 微信绑定视图 -->
    <div v-else-if="activeView === 'wx'" class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2">
      <!-- 微信绑定卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ t('settings.bindWeChat') }}
          </div>
        </div>

        <!-- 已绑定状态 -->
        <div v-if="isWxBound" class="text-center py-6">
          <div class="text-green-500 text-lg mb-4">{{ t('settings.successfullyBoundWechat') }}</div>
          <button @click="unbindWx" class="btn btn-secondary btn-sm">
            {{ t('settings.unbind') }}
          </button>
        </div>

        <!-- 未绑定状态 -->
        <div v-else class="px-4 pt-2 pb-6">
          <!-- 绑定提示 -->
          <div class="text-center my-6">
            <p class="text-gray-700 dark:text-gray-300">
              请在
              <span class="text-red-500 font-medium">{{ formatQrCountdown(remainingTime) }}</span>
              {{ t('settings.completeBindingWithin') }}
            </p>
          </div>

          <!-- 微信绑定页面的二维码显示 -->
          <div class="flex justify-center my-8">
            <div class="relative w-[200px] h-[200px]">
              <img
                v-if="
                  wxLoginUrl && (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')
                "
                class="w-full h-full select-none shadow-sm rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                :src="wxLoginUrl"
                alt="微信绑定二维码"
              />

              <div
                v-else
                class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <div
                v-if="!wxLoginUrl"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
            </div>
          </div>

          <!-- 提示文字 -->
          <div class="text-center text-gray-700 dark:text-gray-300 text-base">
            {{ t('settings.scanToBindAccount') }}
          </div>
          <div class="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
            {{ t('login.confirmQrInWechat') }}
          </div>
          <div class="mt-2 text-center text-base font-semibold tracking-[0.25em]">
            {{ qrConfirmationCode }}
          </div>
        </div>
      </div>
    </div>

    <!-- 旧微信账号迁移视图 -->
    <div
      v-else-if="activeView === 'wxMigration'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 旧微信账号迁移卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ t('settings.oldWechatMigration') }}
          </div>
        </div>

        <!-- 迁移提示 -->
        <div class="px-4 pt-2 pb-6">
          <!-- 绑定提示 -->
          <div class="text-center my-4">
            <p class="text-gray-700 dark:text-gray-300 mb-2">
              {{ t('settings.useOldOfficialAccountWechat') }}
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              {{ t('settings.completeWithinTime') }}
              <span class="text-red-500 font-medium">{{ formatQrCountdown(remainingTime) }}</span>
              {{ t('settings.completeMigrationWithinTime') }}
            </p>
          </div>

          <!-- 旧微信账号迁移页面的二维码显示 -->
          <div class="flex justify-center my-8">
            <div class="relative w-[200px] h-[200px]">
              <img
                v-if="
                  wxLoginUrl && (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')
                "
                class="w-full h-full select-none shadow-sm rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                :src="wxLoginUrl"
                alt="微信迁移二维码"
              />

              <div
                v-else
                class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <div
                v-if="!wxLoginUrl"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
            </div>
          </div>

          <!-- 提示文字 -->
          <div class="text-center text-gray-700 dark:text-gray-300 space-y-2">
            <p class="text-base">{{ t('settings.scanToMigrate') }}</p>
            <p class="text-xs text-amber-600 dark:text-amber-400">
              {{ t('login.confirmQrInWechat') }}
            </p>
            <p class="text-base font-semibold tracking-[0.25em]">{{ qrConfirmationCode }}</p>
            <p class="text-xs text-gray-500">{{ t('settings.migrationNote') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 身份认证滑块验证 -->
  <SliderCaptcha
    :show="isShowIdVerify"
    @success="onIdentitySuccess"
    @close="isShowIdVerify = false"
  />

  <!-- 手机认证滑块验证 -->
  <SliderCaptcha
    :show="isShowPhoneVerify"
    @success="onPhoneSuccess"
    @close="isShowPhoneVerify = false"
  />

  <!-- 旧微信账号迁移弹窗 -->
  <!-- <WechatMigration
    v-if="showWechatMigration"
    :visible="showWechatMigration"
    @close="closeWechatMigration"
  /> -->
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
