<script lang="ts" setup>
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { computed, watch } from 'vue'

const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const authStore = useAuthStore()

const currentExternalLink = computed(() => useGlobalStore.currentExternalLink)
const externalLinkDialog = computed(() => useGlobalStore.externalLinkDialog)
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

function openLink(link: ToolLink) {
  useGlobalStore.setCurrentExternalLink(link.url)
}

// 当显示外部链接时，自动折叠侧边栏
watch(
  externalLinkDialog,
  newVal => {
    if (newVal) {
      appStore.setSiderCollapsed(true)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="currentExternalLink" class="h-full flex flex-col">
    <!-- 内容 -->
    <div class="flex-grow overflow-hidden">
      <iframe
        :src="currentExternalLink"
        class="w-full h-full border-0"
        referrerpolicy="no-referrer"
        allow="
          accelerometer;
          ambient-light-sensor;
          autoplay;
          battery;
          camera;
          clipboard-read;
          clipboard-write;
          display-capture;
          document-domain;
          encrypted-media;
          execution-while-not-rendered;
          execution-while-out-of-viewport;
          fullscreen;
          gamepad;
          geolocation;
          gyroscope;
          hid;
          identity-credentials-get;
          idle-detection;
          interest-cohort;
          keyboard-map;
          local-fonts;
          magnetometer;
          microphone;
          midi;
          navigation-override;
          payment;
          picture-in-picture;
          publickey-credentials-create;
          publickey-credentials-get;
          screen-wake-lock;
          serial;
          speaker-selection;
          storage-access;
          sync-xhr;
          usb;
          web-share;
          window-management;
          xr-spatial-tracking;
        "
        loading="lazy"
      ></iframe>
    </div>
  </div>
  <div v-else class="h-full flex flex-col p-4">
    <h2 class="text-xl font-medium mb-4 text-center text-gray-800 dark:text-gray-200">
      常用工具链接
    </h2>
    <div
      v-if="toolLinks.length === 0"
      class="flex justify-center items-center h-32 text-gray-500 dark:text-gray-400"
    >
      <p v-if="authStore.globalConfig.isEnableExternalLinks !== '1'">外部链接功能未启用</p>
      <p v-else>暂无可用的工具链接</p>
    </div>
    <div v-else class="overflow-y-auto custom-scrollbar" style="max-height: 50vh">
      <div class="grid grid-cols-3 gap-4">
        <div
          v-for="(link, index) in toolLinks"
          :key="index"
          class="flex flex-col items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative group"
          @click="openLink(link)"
        >
          <div
            class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2 overflow-hidden"
          >
            <img
              v-if="link.icon"
              :src="link.icon"
              :alt="link.name"
              class="w-8 h-8 object-contain"
            />
            <span v-else class="text-xl font-medium">{{ link.name.charAt(0) }}</span>
          </div>
          <div class="text-xs text-center truncate w-full">{{ link.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
