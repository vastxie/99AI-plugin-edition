<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const authStore = useAuthStore()
const appStore = useAppStore()
const darkMode = computed(() => appStore.theme === 'dark')
const { isMobile } = useBasicLayout()
const { t } = useI18n()

const { noticeInfo } = authStore.globalConfig

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const globalConfig = computed(() => authStore.globalConfig)

function openDrawerAfter() {
  // 刷新全局配置数据，确保获取最新的公告信息
  authStore.getGlobalConfig().catch(error => {
    // Handle error silently
  })
}

watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 当组件变为可见时刷新数据
      openDrawerAfter()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    openDrawerAfter()
  }
})
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 公告信息卡片 -->
    <div
      class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
    >
      <!-- 卡片标题 -->
      <div
        class="text-base font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b border-gray-200 dark:border-gray-700"
      >
        {{ globalConfig.noticeTitle || t('common.platformNotice') }}
      </div>

      <!-- 公告内容 -->
      <div class="overflow-y-auto" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <MdPreview
          editorId="preview-only"
          :modelValue="noticeInfo"
          :theme="darkMode ? 'dark' : 'light'"
          class="dark:bg-gray-700 w-full"
        />
      </div>
    </div>
  </div>
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
