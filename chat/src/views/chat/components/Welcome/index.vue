<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore'
import logo from '@/assets/logo.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { isMobile } = useBasicLayout()
const { t } = useI18n()

const appDetail: any = ref({ name: '', des: '', coverImg: '' })
const authStore = useAuthStore()
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
// 获取用户昵称
const nickname = computed(() => (authStore.userInfo as any)?.nickname || '')
// 根据时间获取问候语
const greeting = computed(() => {
  const hour = new Date().getHours()
  let greetKey = ''

  if (hour < 6) greetKey = 'welcome.dawn'
  else if (hour < 9) greetKey = 'welcome.morning'
  else if (hour < 12) greetKey = 'welcome.forenoon'
  else if (hour < 14) greetKey = 'welcome.noon'
  else if (hour < 18) greetKey = 'welcome.afternoon'
  else greetKey = 'welcome.evening'

  const greetText = t(greetKey)
  const welcomeText = t('welcome.welcomeText')
  const siteName = authStore.globalConfig?.siteName || ''

  // 移动端特殊处理
  if (isMobile.value) {
    return greetText
  }

  // 桌面端使用字符串拼接避免插值问题
  if (nickname.value) {
    return `${greetText}，${nickname.value}，${welcomeText}${siteName}`
  } else {
    return `${greetText}，${welcomeText}${siteName}`
  }
})

const homeWelcomeContent = computed(
  () => authStore.globalConfig?.homeWelcomeContent || t('welcome.defaultDescription')
)
const chatStore = useChatStore()
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

const queryAppInfo = async (appId: number) => {
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId })
    if (res.data) {
      appDetail.value = res.data
    } else {
      appDetail.value = { name: '', des: '', coverImg: '' }
    }
  } catch (error) {}
}

function bgRandomColor() {
  const hues = [
    'bg-blue-300',
    'bg-red-300',
    'bg-green-300',
    'bg-yellow-300',
    'bg-purple-300',
    'bg-pink-300',
  ]
  return hues[Math.floor(Math.random() * hues.length)]
}

watch(
  () => activeAppId.value,
  newVal => {
    if (newVal) {
      queryAppInfo(newVal)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="activeAppId" class="flex flex-col justify-center items-center select-none">
    <div class="flex items-center mb-2">
      <img v-if="appDetail?.coverImg" :src="appDetail?.coverImg" alt="Logo" class="h-7 w-7 mr-2" />
      <div
        v-else
        :class="[
          'flex-shrink-0 dark:ring-gray-400 rounded-full w-7 h-7 flex items-center justify-center mr-2',
          bgRandomColor(),
        ]"
      >
        <span class="text-white text-sm md:text-lg">{{ appDetail.name.slice(0, 1) }}</span>
      </div>
      <h1 class="text-3xl font-bold text-primary-500">{{ appDetail?.name }}</h1>
    </div>
    <h2 class="mb-2 rounded px-4 py-2 text-center text-base text-gray-600">
      {{ appDetail?.des }}
    </h2>
  </div>

  <!-- 当 appDetail 不存在时显示的内容 -->
  <div v-else class="flex flex-col items-center justify-center select-none">
    <!-- 移动端布局 -->
    <template v-if="isMobile">
      <div class="text-center">
        <!-- 图标和问候语在同一行 -->
        <div class="flex items-center justify-center mb-3">
          <img :src="logoPath" alt="Logo" class="h-6 w-6 mr-2" />
          <h1 class="text-2xl font-bold text-primary-500">
            {{ greeting }}<span v-if="nickname">，{{ nickname }}</span>
          </h1>
        </div>
        <!-- 帮助文本 -->
        <h2 class="text-base text-gray-500 dark:text-gray-400">
          {{ homeWelcomeContent || '我可以帮您解答问题、创作内容、分析数据等' }}
        </h2>
      </div>
    </template>
    <!-- 桌面端布局 -->
    <template v-else>
      <div class="flex items-center">
        <img :src="logoPath" alt="Logo" class="h-7 w-7 mr-2" />
        <h1 class="text-3xl font-bold text-primary-500">{{ greeting }}</h1>
      </div>
      <h2 class="rounded my-3 text-center text-base text-gray-600 dark:text-gray-400">
        {{ homeWelcomeContent }}
      </h2>
    </template>
  </div>
</template>
