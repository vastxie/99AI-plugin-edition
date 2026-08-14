<script lang="ts" setup>
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { AllApplication } from '@icon-park/vue-next'
import { computed, ref } from 'vue'

const { isMobile } = useBasicLayout()
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const isHovering = ref(false)
const isOpen = ref(false)

// 从配置中获取工具链接列表
const toolLinks = computed(() => {
  if (
    authStore.globalConfig.isEnableExternalLinks === '1' &&
    authStore.globalConfig.externalLinks
  ) {
    try {
      return JSON.parse(authStore.globalConfig.externalLinks)
    } catch (error) {
      return []
    }
  }
  return []
})

interface ToolLink {
  name: string
  url: string
  icon: string
}

const showToolLinks = computed(() => {
  return toolLinks.value.length > 0 && authStore.globalConfig.isEnableExternalLinks === '1'
})

function openExternalLink(link: ToolLink) {
  useGlobalStore.setCurrentExternalLink(link.url)
}
</script>

<template>
  <DropdownMenu
    v-if="showToolLinks"
    v-model="isOpen"
    position="bottom-right"
    max-height="50vh"
    min-width="300px"
    class="relative"
  >
    <template #trigger="{ isOpen: menuIsOpen }">
      <div
        class="relative group mx-1 cursor-pointer"
        @mouseover="isHovering = true"
        @mouseleave="isHovering = false"
      >
        <AllApplication class="btn-icon btn-md" size="20" />
        <!-- 悬停提示 -->
        <div v-if="!isMobile && !menuIsOpen" class="tooltip tooltip-bottom">工具</div>
      </div>
    </template>

    <template #menu="{ close }">
      <div class="grid grid-cols-3 gap-1 p-2">
        <div
          v-for="(link, index) in toolLinks"
          :key="index"
          class="flex flex-col items-center space-y-1 p-2 hover:bg-opacity dark:hover:bg-gray-750 rounded-md cursor-pointer relative group"
          @click="
            () => {
              openExternalLink(link)
              close()
            }
          "
        >
          <div
            class="w-10 h-10 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
          >
            <img
              v-if="link.icon"
              :src="link.icon"
              :alt="link.name"
              class="w-6 h-6 object-contain"
            />
            <span v-else class="text-lg font-medium">{{ link.name.charAt(0) }}</span>
          </div>
          <div class="text-xs text-center truncate w-full">{{ link.name }}</div>
        </div>
      </div>
    </template>
  </DropdownMenu>
</template>
