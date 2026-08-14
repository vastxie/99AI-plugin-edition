<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { ss } from '@/utils/storage'
import { t } from '@/locales'
import { Close } from '@icon-park/vue-next'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:visible'])

const authStore = useAuthStore()
const appStore = useAppStore()
const darkMode = computed(() => appStore.theme === 'dark')
const globalConfig = computed(() => authStore.globalConfig)
const doNotRemind = ref(false)

// 处理关闭弹窗
function handleClose() {
  // 只有用户勾选了"7天不再显示"时才保存缓存
  if (doNotRemind.value) {
    // 生成当前公告的唯一标识
    const currentNoticeTitle = globalConfig.value?.noticeTitle || ''
    const currentNoticeContent = globalConfig.value?.noticeInfo || ''
    const currentNoticeHash = `${currentNoticeTitle}_${currentNoticeContent}`.slice(0, 100)

    // 保存公告信息和用户选择
    const noticeData: any = {
      hash: currentNoticeHash,
      doNotRemindUntil: Date.now() + 7 * 24 * 60 * 60 * 1000, // 设置7天后的时间戳
    }

    // 存储公告数据
    ss.set('noticeData', noticeData)
  }

  emit('update:visible', false)
}

// 监听 visible 变化，重置复选框状态
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      doNotRemind.value = false
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="visible" class="fixed inset-0 z-[55] overflow-y-auto">
        <!-- 背景遮罩 -->
        <div class="fixed inset-0 bg-black bg-opacity-50" @click="handleClose"></div>

        <!-- 弹窗内容 -->
        <div class="flex items-center justify-center min-h-full p-4">
          <div
            class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
          >
            <!-- 标题栏 -->
            <div
              class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {{ globalConfig.noticeTitle || '平台公告' }}
              </h3>
              <button @click="handleClose" class="btn-icon btn-md">
                <Close size="20" />
              </button>
            </div>

            <!-- 内容区域 -->
            <div class="p-4 overflow-y-auto" style="max-height: calc(80vh - 140px)">
              <MdPreview
                editorId="notice-modal-preview"
                :modelValue="globalConfig.noticeInfo || ''"
                :theme="darkMode ? 'dark' : 'light'"
                class="w-full"
              />
            </div>

            <!-- 底部操作区 -->
            <div
              class="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700"
            >
              <label class="flex items-center cursor-pointer">
                <input
                  v-model="doNotRemind"
                  type="checkbox"
                  class="mr-2 w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-0 focus:ring-offset-0 dark:bg-gray-700 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-600"
                />
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('notice.doNotRemind24h') }}
                </span>
              </label>

              <button
                @click="handleClose"
                class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
              >
                {{ t('common.confirm') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 覆盖 md-editor-v3 中内联代码的样式 */
:deep(.md-editor-preview-wrapper) {
  /* 使用 md-editor-v3 的 CSS 变量 */
  --md-code-bg: rgba(175, 184, 193, 0.2);
}

:deep(.md-editor-dark .md-editor-preview-wrapper) {
  --md-code-bg: rgba(110, 118, 129, 0.4);
}

/* 确保覆盖全局的 markdown-body 样式 */
:deep(.markdown-body code:not(pre code)),
:deep(.markdown-body tt) {
  background-color: var(--md-code-bg) !important;
}
</style>
