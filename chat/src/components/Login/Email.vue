<script lang="ts" setup>
import { fetchLoginAPI, fetchSendCode } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { ArrowLeft } from '@icon-park/vue-next'
import { computed, ref } from 'vue'
import SliderCaptcha from './SliderCaptcha.vue'

interface Props {
  loginMode: 'password' | 'captcha'
}

const props = defineProps<Props>()

// 声明组件的自定义事件
defineEmits<{
  changeLoginType: [type: string]
}>()
const currentStep = ref<'login' | 'forgot' | 'verify' | 'reset'>('login')
const ms = message()
const loading = ref(false)
const authStore = useAuthStore()
const lastSendPhoneCodeTime = ref(0)
const { isMobile } = useBasicLayout()
const isShow = ref(false)
const useGlobalStore = useGlobalStoreWithOut()
const globalConfig = computed(() => authStore.globalConfig)

// 验证码登录表单
const captchaForm = ref({
  contact: '',
  captchaId: null,
  code: '',
})

// 密码登录表单
const passwordForm = ref({
  username: '',
  password: '',
})

// 忘记密码表单
const forgotForm = ref({
  contact: '',
  code: '',
  captchaId: '',
  newPassword: '',
  confirmPassword: '',
})

const lastSendForgotCodeTime = ref(0)
const isShowForgotCaptcha = ref(false)

// 验证表单
const validateForm = () => {
  let hasError = false

  // 密码登录表单验证
  if (props.loginMode === 'password') {
    // 验证用户名
    if (!passwordForm.value.username.trim()) {
      hasError = true
    } else if (passwordForm.value.username.length < 2 || passwordForm.value.username.length > 30) {
      hasError = true
    }

    // 验证密码
    if (!passwordForm.value.password.trim()) {
      hasError = true
    } else if (
      passwordForm.value.password.length < 6 ||
      passwordForm.value.password.length > 128
    ) {
      hasError = true
    }
  }

  // 验证码登录表单验证
  else if (props.loginMode === 'captcha') {
    // 验证联系方式
    if (!captchaForm.value.contact.trim()) {
      hasError = true
    }

    // 验证验证码
    if (!captchaForm.value.captchaId) {
      hasError = true
    }
  }

  return !hasError
}

// 只验证联系方式，用于发送验证码前的验证
const validateContactOnly = () => {
  return captchaForm.value.contact.trim() !== ''
}

const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)
const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)

// 使用 ref 来管理全局参数的状态
const agreedToUserAgreement = ref(true) // 读取初始状态并转换为布尔类型

// 点击"用户协议及隐私政策"时，显示用户协议弹窗
function handleClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateUserAgreementDialog(true)
}

const loginTypeText = computed(() => {
  if (emailLoginStatus.value && phoneLoginStatus.value) {
    return t('login.emailPhone')
  } else if (emailLoginStatus.value) {
    return t('login.email')
  } else if (phoneLoginStatus.value) {
    return t('login.phone')
  }
  return ''
})

const loginEnterType = computed(() => {
  if (emailLoginStatus.value && phoneLoginStatus.value) {
    return t('login.enterEmailOrPhone')
  } else if (emailLoginStatus.value) {
    return t('login.enterEmail')
  } else if (phoneLoginStatus.value) {
    return t('login.enterPhone')
  }
  return ''
})

//  定时器改变倒计时时间方法
function changeLastSendPhoneCodeTime() {
  if (lastSendPhoneCodeTime.value > 0) {
    setTimeout(() => {
      lastSendPhoneCodeTime.value--
      changeLastSendPhoneCodeTime()
    }, 1000)
  }
}

/* 发送验证码 */
async function handleSendCaptcha() {
  isShow.value = false
  if (validateContactOnly()) {
    // 只验证联系方式
    try {
      const { contact } = captchaForm.value

      // 只传递联系方式(邮箱或手机号)，并标记为登录场景
      const params: any = { contact, isLogin: true }
      let res: any
      res = await fetchSendCode(params)
      const { success } = res
      if (success) {
        ms.success(res.data)
        // 记录重新发送倒计时
        lastSendPhoneCodeTime.value = 60
        changeLastSendPhoneCodeTime()
      }
    } catch (error: any) {
      ms.error(error?.message || '发送验证码失败，请稍后重试')
    }
  }
}

/* 登录处理 */
function handlerSubmit(event: Event) {
  event.preventDefault()

  if (
    agreedToUserAgreement.value === false &&
    Number(globalConfig.value.isAutoOpenAgreement) === 1
  ) {
    return ms.error(t('login.agreeToTerms', { title: globalConfig.value.agreementTitle }))
  }

  if (validateForm()) {
    loginAction()
  }
}

async function loginAction() {
  try {
    loading.value = true

    // 根据登录模式构建参数
    const params: any =
      props.loginMode === 'password'
        ? {
            username: passwordForm.value.username,
            password: passwordForm.value.password,
          }
        : {
            username: captchaForm.value.contact,
            captchaId: captchaForm.value.captchaId,
          }

    const res: any = await fetchLoginAPI(params)
    loading.value = false

    const { success } = res

    if (!success) return

    ms.success(t('login.loginSuccess'))
    authStore.setToken(res.data)
    authStore.getUserInfo()
    authStore.setLoginDialog(false)
  } catch (error: any) {
    loading.value = false
    ms.error(error.message)
  }
}

// 忘记密码相关函数
function changeForgotCodeTime() {
  if (lastSendForgotCodeTime.value > 0) {
    setTimeout(() => {
      lastSendForgotCodeTime.value--
      changeForgotCodeTime()
    }, 1000)
  }
}

async function handleSendForgotCode() {
  isShowForgotCaptcha.value = false
  if (!forgotForm.value.contact.trim()) {
    return ms.error(t('login.pleaseEnterContact'))
  }

  try {
    const params: any = { contact: forgotForm.value.contact, isReset: true }
    const res: any = await fetchSendCode(params)
    const { success, data } = res
    if (success || data) {
      // 兼容不同的响应格式
      ms.success(data || t('common.verificationCodeSentSuccess'))
      lastSendForgotCodeTime.value = 60
      changeForgotCodeTime()
      currentStep.value = 'verify' // 切换到验证码输入步骤
    }
  } catch (error: any) {
    ms.error(error.message)
  }
}

async function handleVerifyForgotCode() {
  if (!forgotForm.value.captchaId.trim()) {
    return ms.error(t('login.enterCode'))
  }

  loading.value = true
  try {
    const res: any = await fetch('/api/auth/verifyResetCode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact: forgotForm.value.contact,
        code: forgotForm.value.captchaId,
      }),
    }).then(r => r.json())

    loading.value = false

    if (res.success) {
      forgotForm.value.code = forgotForm.value.captchaId
      currentStep.value = 'reset'
    } else {
      ms.error(res.message || t('login.verifyFailed'))
    }
  } catch (error: any) {
    loading.value = false
    ms.error(error.message)
  }
}

async function handleResetPassword() {
  if (!forgotForm.value.newPassword.trim()) {
    return ms.error(t('login.enterNewPassword'))
  }

  if (forgotForm.value.newPassword.length < 12 || forgotForm.value.newPassword.length > 128) {
    return ms.error(t('login.passwordLength'))
  }

  if (forgotForm.value.newPassword !== forgotForm.value.confirmPassword) {
    return ms.error(t('login.passwordMismatch'))
  }

  loading.value = true
  try {
    const res: any = await fetch('/api/auth/resetPassword', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact: forgotForm.value.contact,
        code: forgotForm.value.code,
        password: forgotForm.value.newPassword,
      }),
    }).then(r => r.json())

    loading.value = false

    if (res.success) {
      ms.success(t('login.resetSuccess'))
      // 重置表单并返回登录
      forgotForm.value = {
        contact: '',
        code: '',
        captchaId: '',
        newPassword: '',
        confirmPassword: '',
      }
      currentStep.value = 'login'
      // 重置后可以直接用新密码登录
    } else {
      ms.error(res.message || t('login.resetFailed'))
    }
  } catch (error: any) {
    loading.value = false
    ms.error(error.message)
  }
}
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between" :class="isMobile ? 'px-5 ' : 'px-10 '">
    <!-- 密码登录表单 -->
    <form
      v-if="loginMode === 'password' && currentStep === 'login'"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <!-- 用户名输入框 -->
        <div class="flex flex-col gap-2">
          <label
            for="username"
            class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >{{ loginTypeText }}</label
          >
          <div>
            <input
              id="username"
              type="text"
              v-model="passwordForm.username"
              :placeholder="loginEnterType"
              class="input input-lg w-full"
            />
          </div>
        </div>

        <!-- 密码输入框 -->
        <div class="mt-6 relative">
          <div class="flex flex-col gap-2">
            <label
              for="password"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >{{ t('login.password') }}</label
            >
            <div>
              <input
                id="password"
                type="password"
                v-model="passwordForm.password"
                :placeholder="t('login.enterYourPassword')"
                class="input input-lg w-full"
              />
            </div>
          </div>
        </div>

        <!-- 用户协议与忘记密码 -->
        <div class="mt-5">
          <div class="flex items-center justify-between">
            <div class="flex items-center" v-if="Number(globalConfig.isAutoOpenAgreement) === 1">
              <input
                id="agreement-password"
                v-model="agreedToUserAgreement"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-700 dark:bg-gray-800"
              />
              <p class="ml-2 text-sm text-gray-600 dark:text-gray-400">
                {{ t('login.loginMeansAgree') }}
                <a
                  href="#"
                  class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                  @click="handleClick"
                  >《{{ globalConfig.agreementTitle }}》</a
                >
              </p>
            </div>
            <button
              type="button"
              @click="currentStep = 'forgot'"
              class="text-sm text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
            >
              {{ t('login.forgotPassword') }}?
            </button>
          </div>
        </div>
      </div>

      <!-- 登录按钮 -->
      <div>
        <button
          type="submit"
          class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !passwordForm.username.trim() || !passwordForm.password"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          {{ t('login.loginAccount') }}
        </button>
      </div>
    </form>

    <!-- 忘记密码 - 输入联系方式 -->
    <div
      v-if="loginMode === 'password' && currentStep === 'forgot'"
      class="flex flex-col flex-1 justify-between"
    >
      <div>
        <div class="mb-4">
          <button
            @click="currentStep = 'login'"
            class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mb-4 flex items-center"
          >
            <ArrowLeft theme="outline" size="16" class="mr-1" />
            {{ t('common.back') }}
          </button>
          <h3 class="text-lg font-semibold mb-2">{{ t('login.forgotPassword') }}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('login.forgotPasswordTip') }}</p>
        </div>
        <div class="flex flex-col gap-2">
          <label class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300">
            {{ loginTypeText }}
          </label>
          <input
            v-model="forgotForm.contact"
            type="text"
            :placeholder="loginEnterType"
            class="input input-lg w-full"
            @keyup.enter="isShowForgotCaptcha = true"
          />
        </div>
      </div>
      <button
        type="button"
        @click="isShowForgotCaptcha = true"
        :disabled="!forgotForm.contact.trim()"
        class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ t('login.nextStep') }}
      </button>
    </div>

    <!-- 忘记密码 - 验证码 -->
    <div
      v-if="loginMode === 'password' && currentStep === 'verify'"
      class="flex flex-col flex-1 justify-between"
    >
      <div>
        <div class="mb-4">
          <button
            @click="currentStep = 'forgot'"
            class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mb-4 flex items-center"
          >
            <ArrowLeft theme="outline" size="16" class="mr-1" />
            {{ t('common.back') }}
          </button>
          <h3 class="text-lg font-semibold mb-2">{{ t('login.verifyIdentity') }}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('login.verificationCodeSentTo') }} {{ forgotForm.contact }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <label class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300">
            {{ t('login.verificationCode') }}
          </label>
          <div class="flex gap-2">
            <input
              v-model="forgotForm.captchaId"
              type="text"
              :placeholder="t('login.enterCode')"
              class="input input-lg flex-1"
              @keyup.enter="handleVerifyForgotCode"
            />
            <button
              type="button"
              @click="isShowForgotCaptcha = true"
              :disabled="lastSendForgotCodeTime > 0"
              class="btn btn-outline btn-lg px-4 disabled:opacity-50"
            >
              {{ lastSendForgotCodeTime > 0 ? `${lastSendForgotCodeTime}s` : t('login.resend') }}
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        @click="handleVerifyForgotCode"
        :disabled="loading || !forgotForm.captchaId.trim()"
        class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="loading" class="inline-block mr-2">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        </span>
        {{ t('login.verify') }}
      </button>
    </div>

    <!-- 忘记密码 - 重置密码 -->
    <div
      v-if="loginMode === 'password' && currentStep === 'reset'"
      class="flex flex-col flex-1 justify-between"
    >
      <div>
        <button
          @click="currentStep = 'verify'"
          class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mb-4 flex items-center"
        >
          <ArrowLeft theme="outline" size="16" class="mr-1" />
          {{ t('common.back') }}
        </button>
        <h3 class="text-lg font-semibold mb-4">{{ t('login.resetPassword') }}</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ t('login.newPassword') }}
            </label>
            <input
              v-model="forgotForm.newPassword"
              type="password"
              :placeholder="t('login.enterNewPassword')"
              class="input input-lg w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ t('login.confirmPassword') }}
            </label>
            <input
              v-model="forgotForm.confirmPassword"
              type="password"
              :placeholder="t('login.confirmNewPassword')"
              class="input input-lg w-full"
              @keyup.enter="handleResetPassword"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        @click="handleResetPassword"
        :disabled="loading || !forgotForm.newPassword || !forgotForm.confirmPassword"
        class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="loading" class="inline-block mr-2">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        </span>
        {{ t('login.resetPassword') }}
      </button>
    </div>

    <!-- 验证码登录表单 -->
    <form
      v-if="loginMode === 'captcha'"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <!-- 联系方式输入框 -->
        <div class="flex flex-col gap-2">
          <label
            for="contact"
            class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >{{ loginTypeText }}</label
          >
          <div>
            <input
              id="contact"
              type="text"
              v-model="captchaForm.contact"
              :placeholder="t('login.enterContact') + loginTypeText"
              class="input input-lg w-full"
            />
          </div>
        </div>

        <!-- 验证码输入框 -->
        <div class="mt-6">
          <div class="flex flex-col gap-2">
            <label
              for="captchaId"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >{{ t('login.verificationCode') }}</label
            >
            <div class="relative px-1">
              <div class="flex relative">
                <input
                  id="captchaId"
                  type="text"
                  v-model="captchaForm.captchaId"
                  :placeholder="t('login.enterCode')"
                  class="input input-lg w-full pr-32"
                />
                <button
                  type="button"
                  class="btn-captcha px-4"
                  :disabled="loading || lastSendPhoneCodeTime > 0 || !captchaForm.contact.trim()"
                  @click="isShow = true"
                >
                  <span v-if="loading && lastSendPhoneCodeTime === 0" class="inline-block mr-1">
                    <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                  </span>
                  {{
                    lastSendPhoneCodeTime > 0
                      ? `${lastSendPhoneCodeTime}秒`
                      : t('login.sendVerificationCode')
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 验证码组件 -->
        <div class="rounded-lg">
          <SliderCaptcha
            :show="isShow"
            :slider-text="t('common.dragSliderToComplete')"
            @success="handleSendCaptcha()"
            @close="isShow = false"
            class="z-[10000]"
          />
        </div>

        <!-- 用户协议 -->
        <div class="mt-5" v-if="Number(globalConfig.isAutoOpenAgreement) === 1">
          <div class="flex items-center">
            <input
              id="agreement-captcha"
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-700 dark:bg-gray-800"
            />
            <p class="ml-2 text-sm text-gray-600 dark:text-gray-400">
              {{ t('login.loginMeansAgree') }}
              <a
                href="#"
                class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                @click="handleClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>
        </div>
      </div>

      <!-- 登录按钮 -->
      <div>
        <button
          type="submit"
          class="btn btn-primary btn-lg w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !captchaForm.contact.trim() || !captchaForm.captchaId"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          {{ t('login.captchaLogin') }}
        </button>
      </div>
    </form>
  </div>

  <!-- 忘记密码滑块验证码 -->
  <SliderCaptcha
    :show="isShowForgotCaptcha"
    :slider-text="t('common.dragSliderToComplete')"
    @success="handleSendForgotCode"
    @close="isShowForgotCaptcha = false"
    class="z-[10000]"
  />
</template>
