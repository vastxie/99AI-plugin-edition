<script lang="ts" setup>
import { computed, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/store/modules/app'
import { useChatStore } from '@/store/modules/chat'
import Header from '@/views/chat/components/Header/index.vue'
import Message from '@/views/chat/components/Message/index.vue'
import { Home, Loading } from '@icon-park/vue-next'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'

const route = useRoute()
const router = useRouter()
// const { t: $t } = useI18n()

// 简单的国际化函数
const $t = (key: string) => {
  const translations: Record<string, string> = {
    'share.invalidShareCode': '无效的分享代码',
    'share.shareNotFound': '分享内容不存在或已过期',
    'share.fetchError': '获取分享内容失败',
    'share.unsupportedFormat': '不支持的分享格式',
    'share.invalidData': '无效的分享数据',
    'share.loading': '正在加载分享内容...',
    'share.oops': '哎呀！',
    'share.goHome': '返回首页',
    'share.sharedConversation': '分享的对话',
    'share.sharedAt': '分享于',
    'share.startNewConversation': '开启新对话',
  }
  return translations[key] || key
}
const appStore = useAppStore()
const chatStore = useChatStore()

// Provide share mode flag
provide('isShareMode', true)
// Provide share page flag for header
provide('isSharePage', true)

// 提供打开图片预览器的回调
provide('onOpenImagePreviewer', (imageUrls: string[], initialIndex: number) => {
  // 打开全局图片查看器（目前只支持单图显示）
  // 如果有多张图片，只显示被点击的那张
  if (imageUrls && imageUrls.length > 0) {
    openImageViewer({
      imageUrl: imageUrls[initialIndex],
      fileName: `image_${initialIndex + 1}`,
    })
  }
})

const isLoading = ref(true)
const messages = ref<any[]>([])
const groupTitle = ref('')
const shareTime = ref('')
const error = ref('')

// 获取分享数据
async function fetchShareData() {
  const shareCode = route.params.shareCode as string

  if (!shareCode) {
    error.value = $t('share.invalidShareCode')
    isLoading.value = false
    return
  }

  try {
    const response = await fetch(`/api/share/${shareCode}`)

    if (!response.ok) {
      if (response.status === 404) {
        error.value = $t('share.shareNotFound')
      } else {
        error.value = $t('share.fetchError')
      }
      isLoading.value = false
      return
    }

    const result = await response.json()

    if (result.data) {
      const data = result.data

      if (data.type === 'group') {
        // 新格式：基于对话组的分享
        groupTitle.value = data.groupInfo?.title || $t('share.sharedConversation')
        shareTime.value = data.groupInfo?.createdAt || new Date().toISOString()

        // 设置对话组信息以便 Header 组件显示
        if (data.groupInfo) {
          // 创建一个临时的对话组数据
          const tempGroupData = {
            uuid: data.groupInfo.uuid || 999999, // 使用数字ID
            title: data.groupInfo.title || $t('share.sharedConversation'),
            isEdit: false,
            isSticky: false, // 添加缺少的属性
            createdAt: new Date(data.groupInfo.createdAt),
            updatedAt: new Date(data.groupInfo.updatedAt || data.groupInfo.createdAt), // 添加缺少的属性
            appId: 0, // 确保不是应用类型
            config: JSON.stringify({
              modelInfo: {
                modelName: data.groupInfo.modelName || 'AI',
              },
            }),
          }

          // 手动添加到 groupList 并设置为活动组
          chatStore.groupList = [tempGroupData]
          chatStore.active = tempGroupData.uuid
        }

        // 转换消息格式以适配 Message 组件
        messages.value = data.messages.map((msg: any, index: number) => ({
          dateTime: msg.createdAt,
          content: msg.content,
          modelName: msg.modelName || 'AI',
          status: 3,
          role: msg.role,
          loading: false,
          imageUrl: msg.imageUrl,
          videoUrl: msg.videoUrl,
          audioUrl: msg.audioUrl,
          fileUrl: msg.fileUrl,
          ttsUrl: msg.ttsUrl,
          modelType: msg.type,
          index,
          isLast: index === data.messages.length - 1,
          pluginParam: msg.renderType,
        }))
      } else if (data.type === 'html') {
        // HTML格式重定向到专门的HTML分享页面
        router.push(`/shareHtml/${shareCode}`)
        return
      }
    } else {
      error.value = $t('share.invalidData')
    }
  } catch (err) {
    error.value = $t('share.fetchError')
  } finally {
    isLoading.value = false
  }
}

// 返回首页
function goHome() {
  router.push('/')
}

onMounted(async () => {
  // 模型列表和应用列表已在 App.vue 中初始化
  // 直接加载分享数据
  fetchShareData()
})

// 计算主题
const isDark = computed(() => appStore.theme === 'dark')
</script>

<template>
  <div class="share-container" :class="{ dark: isDark }">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-container">
      <Loading theme="outline" size="48" class="animate-spin text-primary-500" />
      <p class="loading-text">{{ $t('share.loading') }}</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <div class="error-content">
        <h2 class="error-title">{{ $t('share.oops') }}</h2>
        <p class="error-message">{{ error }}</p>
        <button
          type="button"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2 shadow-sm"
          @click="goHome"
        >
          <Home size="20" />
          <span>{{ $t('share.goHome') }}</span>
        </button>
      </div>
    </div>

    <!-- 分享内容 -->
    <div v-else-if="messages.length > 0" class="share-content">
      <!-- 使用 Header 组件显示标题 -->
      <Header />

      <!-- 消息列表容器 -->
      <div class="messages-wrapper custom-scrollbar">
        <!-- 消息列表 - 直接使用 Message 组件 -->
        <div class="messages-container">
          <Message
            v-for="(item, index) in messages"
            :key="index"
            v-bind="item"
            class="mb-3"
            @regenerate="() => {}"
            @delete="() => {}"
          />
          <!-- AI生成内容提示 -->
          <div class="text-center text-gray-500 dark:text-gray-400 text-sm py-8"></div>
        </div>
      </div>

      <!-- 悬浮按钮 -->
      <div class="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <button
          type="button"
          class="px-5 py-2 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium transition-all inline-flex items-center gap-2 shadow-lg hover:shadow-xl whitespace-nowrap text-sm"
          @click="goHome"
        >
          <Home size="18" />
          <span>{{ $t('share.startNewConversation') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.share-container {
  min-height: 100vh;
  background: var(--n-color);
  color: var(--n-text-color);
  display: flex;
  flex-direction: column;
}

// 加载状态
.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.loading-text {
  font-size: 1rem;
  color: var(--n-text-color-3);
  margin: 0;
}

// 错误状态
.error-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.error-content {
  text-align: center;
  max-width: 400px;
}

.error-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--n-text-color);
  margin: 0 0 1rem;
}

.error-message {
  font-size: 1rem;
  color: var(--n-text-color-3);
  margin: 0 0 2rem;
}

// 分享内容
.share-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}

// 消息列表容器
.messages-wrapper {
  flex: 1;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  min-height: 0; // 确保flex子项可以收缩
}

// 消息列表
.messages-container {
  max-width: 900px;
  width: 100%;
  padding: 2rem 1rem;
}

.message-item {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  animation: fadeIn 0.3s ease;

  &:last-child {
    margin-bottom: 0;
  }
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-time {
  font-size: 0.75rem;
  color: var(--n-text-color-3);
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.model-name {
  font-weight: 500;
  color: var(--n-text-color-2);
}

// 媒体内容样式
.media-content {
  margin-top: 0.5rem;
  max-width: 100%;
}

.share-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.share-video {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.share-audio {
  width: 100%;
  margin-top: 0.5rem;
}

.message-user {
  flex-direction: row-reverse;

  .message-content {
    align-items: flex-end;
  }

  .message-time {
    text-align: right;
  }
}

// 移除旧的底部样式

// 按钮已经使用 Tailwind CSS 内联样式定义

// 动画
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// 响应式
@media (max-width: 640px) {
  .share-header {
    padding: 1.5rem 1rem;
  }

  .share-title {
    font-size: 1.25rem;
  }

  .messages-container {
    padding: 1rem;
  }

  .message-item {
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  // 移动端悬浮按钮调整
  .fixed.bottom-8 {
    bottom: 1.5rem;
  }
}

// 暗色模式
.dark {
  background: #1a1a1a;
}

// 确保CSS变量可用
:root {
  --n-color: #ffffff;
  --n-color-embedded: #f5f5f5;
  --n-text-color: #333333;
  --n-text-color-2: #666666;
  --n-text-color-3: #999999;
  --n-border-color: #e0e0e0;
  --primary-color: #3b82f6;
  --primary-color-hover: #2563eb;
}

.dark {
  --n-color: #1a1a1a;
  --n-color-embedded: #262626;
  --n-text-color: #ffffff;
  --n-text-color-2: #cccccc;
  --n-text-color-3: #999999;
  --n-border-color: #404040;
}
</style>
