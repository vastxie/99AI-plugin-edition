<script setup lang="ts">
import BadWordsDialog from '@/components/Dialogs/BadWordsDialog.vue'
import Login from '@/components/Login/Login.vue'
import MobileSettingsDialog from '@/components/MobileSettingsDialog.vue'
import NoticeModal from '@/components/NoticeModal.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { ss } from '@/utils/storage'
import { computed, onMounted, provide, ref, watch } from 'vue'
import ChatBase from './chatBase.vue'

const ms = message()
const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const showNoticeModal = ref(false)
const isLogin = computed(() => authStore.isLogin)
const collapsed = computed(() => appStore.siderCollapsed)
const isAutoOpenNotice = computed(() => Number(authStore.globalConfig?.isAutoOpenNotice) === 1)
// const startX = ref(0)
// const endX = ref(0)

const isModelInherited = computed(() => Number(authStore.globalConfig?.isModelInherited) === 1)
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})

watch(isLogin, async (newVal, oldVal) => {
  if (newVal && !oldVal) {
    await chatStore.queryMyGroup()
    // 检查 URL 是否包含查询参数或哈希值
  }
})

const getMobileClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none']
  return ['rounded-none', 'shadow-md', 'dark:border-gray-900']
})

const getContainerClass = computed(() => {
  return [
    'h-full',
    'transition-[padding]',
    'duration-300',
    { 'pl-[260px]': !isMobile.value && !collapsed.value },
  ]
})

/* 新增一个对话 */
async function createNewChatGroup() {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }

  chatStore.setStreamIn(false)
  try {
    const { modelInfo } = chatStore.activeConfig
    if (modelInfo && isModelInherited.value && chatStore.activeGroupAppId === 0) {
      const config = {
        modelInfo,
      }
      await chatStore.addNewChatGroup(0, config)
    } else {
      await chatStore.addNewChatGroup()
    }
    chatStore.setUsingPlugin(null)

    if (isMobile.value) {
      appStore.setSiderCollapsed(true)
    }
  } catch (error: any) {
    ms.error(error?.message || '创建对话失败，请重试')
  }
}

// function handleTouchStart(event: any) {
//   startX.value = event.touches[0].clientX
// }

// function handleTouchEnd(event: any) {
//   endX.value = event.changedTouches[0].clientX
//   if (endX.value - startX.value > 100) {
//     if (isMobile.value) {
//       appStore.setSiderCollapsed(false)
//     }
//   }
// }

onMounted(() => {
  // window.addEventListener('touchstart', handleTouchStart)
  // window.addEventListener('touchend', handleTouchEnd)

  // 如果当前路径不是根路径，则重定向到根路径
  if (window.location.pathname !== '/' && !window.location.pathname.includes('.')) {
    window.history.replaceState({}, document.title, '/')
  }

  // getUserInfo 已在 chatBase.vue 的 onMounted 中调用,这里不需要重复

  // 检测公告
  checkNotice()
})

const useGlobalStore = useGlobalStoreWithOut()
const loginDialog = computed(() => authStore.loginDialog)
const badWordsDialog = computed(() => useGlobalStore.BadWordsDialog)
const settingsDialog = computed(() => useGlobalStore.settingsDialog)
const mobileSettingsDialog = computed(() => useGlobalStore.mobileSettingsDialog)

/**
 * 公告检测逻辑
 * 检查是否需要显示公告弹窗
 */
function checkNotice() {
  // 获取存储的公告信息
  const storedNoticeData = ss.get('noticeData')
  const currentNoticeContent = authStore.globalConfig?.noticeInfo || ''
  const currentNoticeTitle = authStore.globalConfig?.noticeTitle || ''

  // 如果没有公告内容，直接返回
  if (!currentNoticeContent) {
    return
  }

  // 生成当前公告的唯一标识（基于标题和内容）
  const currentNoticeHash = `${currentNoticeTitle}_${currentNoticeContent}`.slice(0, 100)

  // 检查是否需要显示公告
  let shouldShowNotice = false

  if (!storedNoticeData) {
    // 没有存储记录，需要显示
    shouldShowNotice = true
  } else {
    const { hash, doNotRemindUntil } = storedNoticeData

    // 如果公告内容变化了，需要显示
    if (hash !== currentNoticeHash) {
      shouldShowNotice = true
    }
    // 如果内容没变但是提醒时间已过，也需要显示
    else if (doNotRemindUntil && Date.now() > Number(doNotRemindUntil)) {
      shouldShowNotice = true
      // 清理过期的缓存数据
      ss.remove('noticeData')
    }
  }

  // 如果开启了自动弹出且需要显示，则显示公告
  if (shouldShowNotice && isAutoOpenNotice.value) {
    showNoticeModal.value = true
  }
}

provide('createNewChatGroup', createNewChatGroup)
</script>

<template>
  <div class="h-full transition-all">
    <div class="h-full overflow-hidden" :class="getMobileClass">
      <div class="z-40 h-full flex" :class="getContainerClass">
        <ChatBase class="w-full flex-1 transition-[margin] duration-500" />
      </div>
    </div>
    <div class="overflow-hidden">
      <Login :visible="loginDialog" />
      <BadWordsDialog :visible="badWordsDialog" />
      <SettingsDialog v-if="!isMobile" :visible="settingsDialog" />
      <MobileSettingsDialog v-else :visible="mobileSettingsDialog" />
      <NoticeModal v-model:visible="showNoticeModal" />
    </div>
  </div>
</template>
