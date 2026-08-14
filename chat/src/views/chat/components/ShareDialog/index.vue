<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
// import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { message } from '@/utils/message'
import { Close } from '@icon-park/vue-next'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const ms = message()

// const { t: $t } = useI18n()

// 简单的国际化函数
const $t = (key: string) => {
  const translations: Record<string, string> = {
    'common.newConversation': '新对话',
    'common.shareConversation': '分享对话',
    'common.close': '关闭',
    'common.generatingShareLink': '正在生成分享链接...',
    'common.shareDescription': '任何人都可以通过此链接查看对话内容，链接永久有效',
    'common.copied': '已复制',
    'common.copy': '复制',
    'common.shareError': '生成分享链接失败',
    'common.retry': '重试',
    'common.shareLinkCopied': '分享链接已复制到剪贴板',
    'common.copyFailed': '复制失败，请手动复制',
    'common.shareFailed': '分享失败',
  }
  return translations[key] || key
}
const chatStore = useChatStore()
const authStore = useAuthStore()

const isLoading = ref(false)
const shareUrl = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())

// 生成分享链接
async function generateShareUrl() {
  isLoading.value = true

  try {
    // 获取当前对话组ID
    const groupId = activeGroupInfo.value?.uuid

    if (!groupId) {
      return
    }

    // 调用后端API生成分享链接，传递groupId
    const response = await fetch('/api/share/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`,
      },
      body: JSON.stringify({ groupId: Number(groupId) }),
    })

    if (!response.ok) {
      throw new Error('Failed to create share link')
    }

    const data = await response.json()
    // 如果返回的是完整URL就使用，否则拼接当前域名
    const returnedUrl = data.data.shareUrl
    if (returnedUrl.startsWith('http://') || returnedUrl.startsWith('https://')) {
      shareUrl.value = returnedUrl
    } else {
      // 如果后端没有返回完整URL，使用当前页面的域名拼接
      shareUrl.value = `${window.location.origin}${returnedUrl}`
    }
  } catch (error) {
    ms.error($t('common.shareFailed'))
  } finally {
    isLoading.value = false
  }
}

// 分享并复制链接
async function handleShare() {
  try {
    const success = await copyToClipboard(shareUrl.value)
    if (success) {
      ms.success($t('common.shareLinkCopied'))
    } else {
      ms.info($t('common.copyFailed'))
    }
    closeDialog()
  } catch (error) {
    ms.error($t('common.shareFailed'))
  }
}

// 剪贴板复制方法
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    return false
  }
}

// 关闭弹窗
function closeDialog() {
  visible.value = false
  // 重置状态
  shareUrl.value = ''
}

// 监听弹窗打开，自动生成链接
watch(
  () => visible.value,
  newVal => {
    if (newVal && !shareUrl.value) {
      generateShareUrl()
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-[55] flex items-center justify-center bg-gray-900 bg-opacity-50"
        @click.self="closeDialog"
      >
        <div
          class="bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col w-full max-w-lg p-6 mx-2"
        >
          <!-- 标题栏 -->
          <div class="flex justify-between items-center mb-4">
            <span class="text-xl font-bold dark:text-white">{{
              $t('common.shareConversation')
            }}</span>
            <button @click="closeDialog" class="btn-icon btn-md">
              <Close size="20" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="flex-grow">
            <!-- 加载状态 -->
            <div v-if="isLoading" class="flex flex-col items-center justify-center py-8">
              <div class="loading-animation">
                <span></span>
              </div>
              <p class="mt-4 text-gray-500 dark:text-gray-400">
                {{ $t('common.generatingShareLink') }}
              </p>
            </div>

            <!-- 分享内容 -->
            <div v-else-if="shareUrl" class="space-y-4">
              <p class="text-gray-700 dark:text-gray-300">
                {{ $t('common.shareDescription') }}
              </p>

              <div>
                <input
                  type="text"
                  :value="shareUrl"
                  readonly
                  class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-mono"
                  @click="($event.target as HTMLInputElement).select()"
                />
              </div>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex flex-col items-center justify-center py-8">
              <p class="text-red-500 mb-4">{{ $t('common.shareError') }}</p>
              <button
                type="button"
                class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white rounded-md"
                @click="generateShareUrl"
              >
                {{ $t('common.retry') }}
              </button>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="flex justify-end mt-4">
            <button
              @click="closeDialog"
              class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
            >
              取消
            </button>
            <button
              @click="handleShare"
              class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white rounded-md"
            >
              分享
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* Button styles */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background-color: transparent;
  color: #374151;
  transition: background-color 0.2s;
  cursor: pointer;
  border: none;
}

.btn-icon:hover {
  background-color: #f3f4f6;
}

.dark .btn-icon {
  color: #d1d5db;
}

.dark .btn-icon:hover {
  background-color: #374151;
}

.btn-icon.btn-md {
  width: 2.5rem;
  height: 2.5rem;
}
</style>
