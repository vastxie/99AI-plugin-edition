<script lang="ts" setup>
import { onMounted, ref, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getShare } from '@/api/share'
import { LoadingOne } from '@icon-park/vue-next'

const route = useRoute()
const router = useRouter()

// 标识这是分享页面，防止触发微信静默登录
provide('isSharePage', true)

const isLoading = ref(true)
const htmlContent = ref('')
const error = ref('')

async function fetchShareData() {
  const shareCode = route.params.shareCode as string

  if (!shareCode) {
    error.value = '无效的分享代码'
    isLoading.value = false
    return
  }

  try {
    const res: any = await getShare(shareCode)

    if (res.success && res.data) {
      const data = res.data

      // 检查是否是HTML类型的分享
      if (data.type === 'html' && data.htmlContent) {
        htmlContent.value = data.htmlContent
      } else if (data.type === 'group') {
        // 如果是对话类型，重定向到对话分享页面
        router.push(`/share/${shareCode}`)
        return
      } else {
        error.value = '分享内容格式不正确'
      }
    } else {
      error.value = '分享内容不存在或已过期'
    }
  } catch (err) {
    error.value = '获取分享内容失败'
  } finally {
    isLoading.value = false
  }
}

// 开启新对话
function startNewConversation() {
  router.push('/')
}

onMounted(() => {
  fetchShareData()
})
</script>

<template>
  <div class="share-html-container">
    <!-- 加载中状态 -->
    <div v-if="isLoading" class="loading-container">
      <LoadingOne size="48" class="animate-spin text-primary-600" />
      <p class="mt-4 text-gray-600">正在加载分享内容...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <div class="error-card">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">哎呀！</h2>
        <p class="text-gray-600 mb-6">{{ error }}</p>
        <button
          @click="router.push('/')"
          class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
        >
          返回首页
        </button>
      </div>
    </div>

    <!-- HTML内容展示 -->
    <div v-else-if="htmlContent" class="html-content-wrapper">
      <iframe
        :srcdoc="htmlContent"
        class="html-iframe"
        sandbox="allow-scripts"
        @load="isLoading = false"
      />

      <!-- 悬浮按钮 -->
      <div class="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <button
          type="button"
          class="px-5 py-2 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium transition-all inline-flex items-center gap-2 shadow-lg hover:shadow-xl whitespace-nowrap text-sm"
          @click="startNewConversation"
        >
          <svg
            class="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>开启新对话</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share-html-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background: #f9fafb;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.error-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 400px;
}

.html-content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.html-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: white;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
