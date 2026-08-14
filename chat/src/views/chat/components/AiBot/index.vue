<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
// import { t } from '@/locales';
import { useAuthStore } from '@/store/modules/auth'

const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const siteName = authStore.globalConfig?.siteName || '99AI Plugin Edition'
</script>

<template>
  <div
    :class="[isMobile ? 'mb-16' : 'mt-8']"
    class="px-4 select-none w-full flex flex-col items-center justify-center h-full"
  >
    <h1 class="mb-10 rounded px-4 py-2 text-center text-3xl font-bold text-primary-500">
      {{ siteName }}
    </h1>
    <!-- 不再显示任何预设内容 -->
  </div>
</template>
