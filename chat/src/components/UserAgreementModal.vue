<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900 bg-opacity-50"
      @click.self="handleClose"
    >
      <div
        class="bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col"
        :class="isMobile ? 'w-full h-full' : 'w-[90%] max-w-3xl max-h-[80vh]'"
      >
        <!-- 标题部分 -->
        <div class="flex justify-between items-center p-4 border-b dark:border-gray-600">
          <span class="text-xl font-bold dark:text-white">{{
            globalConfig.agreementTitle || t('common.userAgreement')
          }}</span>
          <button
            @click="handleClose"
            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg
              class="w-5 h-5 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- 内容部分 -->
        <div class="flex-1 overflow-y-auto p-4">
          <MdPreview
            :modelValue="agreementContent"
            :theme="darkMode ? 'dark' : 'light'"
            :show-code-row-number="false"
            editorId="user-agreement-preview"
          />
        </div>

        <!-- 底部按钮 - 只保留关闭按钮 -->
        <div class="flex justify-end p-4 border-t dark:border-gray-600">
          <button
            @click="handleClose"
            class="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
          >
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const authStore = useAuthStore()
const appStore = useAppStore()
const globalStore = useGlobalStoreWithOut()
const { t } = useI18n()
const { isMobile } = useBasicLayout()

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'agree'])

const darkMode = computed(() => appStore.theme === 'dark')
const globalConfig = computed(() => authStore.globalConfig)
const agreementContent = computed(() => globalConfig.value.agreementInfo || '')

function handleClose() {
  emit('close')
  globalStore.updateUserAgreementDialog(false)
}

// 当打开弹窗时刷新配置
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      authStore.getGlobalConfig().catch(() => {
        // Handle error silently
      })
    }
  }
)

onMounted(() => {
  if (props.visible) {
    authStore.getGlobalConfig().catch(() => {
      // Handle error silently
    })
  }
})
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .bg-white,
.modal-fade-leave-active .bg-white,
.modal-fade-enter-active .dark\:bg-gray-750,
.modal-fade-leave-active .dark\:bg-gray-750 {
  transition: transform 0.3s;
}

.modal-fade-enter-from .bg-white,
.modal-fade-leave-to .bg-white,
.modal-fade-enter-from .dark\:bg-gray-750,
.modal-fade-leave-to .dark\:bg-gray-750 {
  transform: scale(0.9);
}
</style>
