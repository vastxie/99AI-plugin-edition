<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-[55] flex items-center justify-center bg-gray-900 bg-opacity-50"
    >
      <div
        class="bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col"
        :class="
          isMobile ? 'w-full h-full' : 'h-[80vh] rounded-lg shadow-lg w-full max-w-5xl p-4 mx-2'
        "
      >
        <!-- 标题部分 -->
        <div class="flex justify-between items-center mb-2">
          <span class="text-xl font-bold dark:text-white">{{ $t('common.settings') }}</span>
          <button @click="handleClose" class="btn-icon btn-md">
            <Close size="20" />
          </button>
        </div>
        <!-- 主体部分 -->
        <div class="flex flex-grow">
          <!-- 左边标签栏 -->
          <div class="w-1/5 bg-white dark:bg-gray-750 rounded-lg">
            <div
              v-for="(tab, index) in tabs"
              :key="index"
              @click="switchTab(index)"
              class="relative flex items-center gap-3 px-3 py-3 my-1 break-all rounded-lg cursor-pointer group dark:hover:bg-gray-700 font-medium text-sm"
              :class="{
                'bg-gray-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400':
                  activeTab === index,
                'text-gray-700 dark:text-gray-400': activeTab !== index,
              }"
            >
              {{ tab.name }}
            </div>

            <!-- 添加退出登录按钮，位于标签栏最下方 -->
            <div class="mt-auto">
              <div
                @click="showLogoutConfirmation"
                class="relative flex items-center gap-3 px-3 py-3 my-1 break-all rounded-lg cursor-pointer group font-medium text-sm text-red-500 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {{ $t('common.logout') }}
              </div>
            </div>
          </div>
          <!-- 右边内容区域 -->
          <div class="w-4/5 bg-white dark:bg-gray-750 rounded-lg ml-4">
            <transition name="fade" mode="out-in">
              <div v-if="!isTabSwitching" key="loaded-content">
                <keep-alive>
                  <component
                    v-if="tabs[activeTab]"
                    :is="tabs[activeTab].component"
                    :key="activeKey"
                    :visible="props.visible && !isTabSwitching"
                  ></component>
                </keep-alive>
              </div>
              <div v-else key="loading-placeholder" class="flex justify-center items-center h-full">
                <div class="animate-pulse flex space-x-4">
                  <div class="flex-1 space-y-4 py-1">
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div class="space-y-2">
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { dialog } from '@/utils/dialog'
import { Close } from '@icon-park/vue-next' // Only Close icon needed now
import { computed, markRaw, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountManagement from './Settings/AccountManagement.vue'
import DataManagement from './Settings/DataManagement.vue'
import MemberCenter from './Settings/MemberCenter.vue'
import NoticeDialog from './Settings/NoticeDialog.vue'
import UserAgreement from './Settings/UserAgreement.vue'

const useGlobalStore = useGlobalStoreWithOut()
const { t } = useI18n()
interface Props {
  visible: boolean
}
const { isMobile } = useBasicLayout() // Still needed for :class binding
const props = defineProps<Props>()

const authStore = useAuthStore()
const globalConfig = computed(() => authStore.globalConfig)

// Use markRaw to prevent components from becoming reactive
const tabs = computed(() => {
  const baseTabs = [
    { name: t('common.accountManagement'), component: markRaw(AccountManagement) },
    { name: t('common.memberCenter'), component: markRaw(MemberCenter) },
    { name: t('common.dataManagement'), component: markRaw(DataManagement) },
    { name: t('common.websiteNotice'), component: markRaw(NoticeDialog) },
  ]

  // 只有当 globalConfig.isAutoOpenAgreement === '1' 时才添加用户协议选项
  if (Number(globalConfig.value.isAutoOpenAgreement) === 1) {
    baseTabs.push({ name: t('common.userAgreement'), component: markRaw(UserAgreement) })
  }

  return baseTabs
})

// Desktop-specific state
const activeTab = ref(
  useGlobalStore.settingsActiveTab >= 0 && useGlobalStore.settingsActiveTab < tabs.value.length
    ? useGlobalStore.settingsActiveTab
    : 0
)
const activeKey = ref(Date.now())
const isTabSwitching = ref(false)

// Tab switching function (Desktop only)
function switchTab(index: number) {
  // 检查是否为游客，如果是游客访问需要登录的页面，则跳转登录
  const isVisitor = authStore.userInfo?.role === 'visitor'
  const protectedTabs = [1, 2] // 会员中心(index=1)和数据管理(index=2)需要登录

  if (isVisitor && protectedTabs.includes(index)) {
    const dialogInstance = dialog()
    dialogInstance.warning({
      title: t('common.tip'),
      content: t('common.loginRequired'),
      positiveText: t('common.login'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => {
        authStore.setLoginDialog(true)
      },
    })
    return
  }

  if (index >= 0 && index < tabs.value.length && index !== activeTab.value) {
    isTabSwitching.value = true
    activeTab.value = index
    useGlobalStore.settingsActiveTab = index
    nextTick(() => {
      activeKey.value = Date.now()
      setTimeout(() => {
        isTabSwitching.value = false
      }, 50) // Reduced delay
    })
  }
}

// Watch for global changes (for desktop sync)
watch(
  () => useGlobalStore.settingsActiveTab,
  newVal => {
    // Check if the dialog is visible and it's not mobile view
    if (
      props.visible &&
      !isMobile.value &&
      newVal >= 0 &&
      newVal < tabs.value.length &&
      newVal !== activeTab.value
    ) {
      switchTab(newVal)
    }
  }
)

// Watch for visibility changes (for desktop refresh)
watch(
  () => props.visible,
  isVisible => {
    if (isVisible && !isMobile.value) {
      // Sync with global store on open for desktop
      const targetTab =
        useGlobalStore.settingsActiveTab >= 0 &&
        useGlobalStore.settingsActiveTab < tabs.value.length
          ? useGlobalStore.settingsActiveTab
          : 0
      if (activeTab.value !== targetTab) {
        activeTab.value = targetTab
      }
      activeKey.value = Date.now() // Refresh key on open
      isTabSwitching.value = false // Ensure not stuck loading
    } else if (!isVisible) {
      // Optionally reset tab when closed, or keep last state?
      // activeTab.value = 0;
      isTabSwitching.value = false
    }
  },
  { immediate: true } // Run immediately to set initial state
)

// Close Handler
function handleClose() {
  useGlobalStore.updateSettingsDialog(false)
}

// Logout Handler
function showLogoutConfirmation() {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('common.logout'),
    content: t('common.logoutConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      authStore.logOut()
      handleClose() // Close settings after logout
    },
  })
}

// onMounted: Initial state sync handled by immediate watchers
onMounted(() => {})
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
