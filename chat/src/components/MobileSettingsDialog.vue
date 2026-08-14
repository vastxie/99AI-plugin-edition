<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-[55] flex items-center justify-center bg-gray-900 bg-opacity-50"
    >
      <div class="w-full h-full bg-white dark:bg-gray-750 flex flex-col overflow-hidden">
        <!-- 标题部分 -->
        <div
          class="flex justify-between items-center mb-2 flex-shrink-0 px-4 pt-4 pb-2 border-b dark:border-gray-600"
        >
          <div class="flex items-center">
            <button
              v-if="currentView !== 'main'"
              @click="backToMainView"
              class="mr-2 p-1 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
            >
              <ArrowLeft size="20" />
            </button>
            <span class="text-xl font-semibold dark:text-white">
              {{ currentView === 'main' ? t('common.settings') : currentTabTitle }}
            </span>
          </div>
          <button @click="handleClose" class="btn-icon btn-md">
            <Close size="20" />
          </button>
        </div>

        <!-- 主体部分 -->
        <div class="flex flex-col flex-grow overflow-y-auto px-3 pb-4">
          <!-- 主菜单页面 -->
          <div v-if="currentView === 'main'" class="flex-grow py-2">
            <div
              v-for="(tab, index) in tabs"
              :key="`mobile-tab-${index}`"
              class="mb-1 border-b dark:border-gray-600 last:border-b-0"
            >
              <div
                @click="navigateToTab(index)"
                class="flex justify-between items-center px-4 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors duration-150"
                :class="{
                  'text-gray-800 dark:text-gray-200': true,
                }"
              >
                <span class="font-medium text-base">{{ tab.name }}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          <!-- 二级页面内容 -->
          <div v-else class="flex-grow py-2">
            <keep-alive>
              <component
                v-if="tabs[currentViewIndex]?.component"
                :is="tabs[currentViewIndex].component"
                :key="`mobile-component-${currentViewIndex}-${activeKey}`"
                :visible="props.visible && currentView !== 'main'"
              ></component>
            </keep-alive>
          </div>

          <!-- 退出登录按钮 (只在主页面显示) -->
          <div v-if="currentView === 'main'" class="mt-auto pt-4 pb-2 flex-shrink-0 px-4">
            <button
              @click="showLogoutConfirmation"
              class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg cursor-pointer group font-medium text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-500/50 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-300 dark:focus:ring-red-600"
            >
              {{ t('common.logout') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStore } from '@/store/modules/global'
import { dialog } from '@/utils/dialog'
import { ArrowLeft, Close } from '@icon-park/vue-next'
import { computed, markRaw, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// Import setting components directly
import AccountManagement from './Settings/AccountManagement.vue'
import DataManagement from './Settings/DataManagement.vue'
import MemberCenter from './Settings/MemberCenter.vue'
import NoticeDialog from './Settings/NoticeDialog.vue'
import UserAgreement from './Settings/UserAgreement.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const globalStore = useGlobalStore()
const authStore = useAuthStore()
const globalConfig = computed(() => authStore.globalConfig)
const { t } = useI18n()

// 通过计算属性获取初始标签页
const initialTab = computed(() => globalStore.mobileInitialTab)

// 使用computed让tabs内容随条件变化
const tabs = computed(() => {
  const baseTabs = [
    { name: t('common.accountManagement'), component: markRaw(AccountManagement), id: 'account' },
    { name: t('common.memberCenter'), component: markRaw(MemberCenter), id: 'member' },
    { name: t('common.dataManagement'), component: markRaw(DataManagement), id: 'data' },
    { name: t('common.websiteNotice'), component: markRaw(NoticeDialog), id: 'notice' },
  ]

  // 只有当 globalConfig.isAutoOpenAgreement === '1' 时才添加用户协议选项
  if (Number(globalConfig.value.isAutoOpenAgreement) === 1) {
    baseTabs.push({
      name: t('common.userAgreement'),
      component: markRaw(UserAgreement),
      id: 'agreement',
    })
  }

  return baseTabs
})

// 页面导航状态
const currentView = ref('main') // 'main' 或 'tab'
const currentViewIndex = ref(-1) // 当前查看的tab索引
const activeKey = ref(Date.now())

// 当前选中的tab标题
const currentTabTitle = computed(() => {
  return currentViewIndex.value >= 0
    ? tabs.value[currentViewIndex.value].name
    : t('common.settings')
})

// 导航到特定Tab
function navigateToTab(index: number) {
  if (index < 0 || index >= tabs.value.length) return

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

  currentViewIndex.value = index
  currentView.value = 'tab'
  activeKey.value = Date.now() // 强制刷新组件
}

// 根据ID导航到特定Tab
function navigateToTabById(tabId: string) {
  const index = tabs.value.findIndex(tab => tab.id === tabId)
  if (index !== -1) {
    navigateToTab(index)
  }
}

// 返回主视图
function backToMainView() {
  currentView.value = 'main'
  currentViewIndex.value = -1
}

// Close Handler
function handleClose() {
  globalStore.updateMobileSettingsDialog(false)
  // 重置为主视图，以便下次打开时从主视图开始
  setTimeout(() => {
    backToMainView()
  }, 300)
}

// 监听visible和initialTab变化
watch(
  [() => props.visible, initialTab],
  ([isVisible, tabId]) => {
    if (isVisible && tabId) {
      navigateToTabById(tabId)
    } else if (!isVisible) {
      // 当对话框关闭时，延迟重置视图，以便关闭动画完成后不会看到视图突然变化
      setTimeout(() => {
        backToMainView()
      }, 300)
    }
  },
  { immediate: true }
)

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
</script>

<style scoped>
/* Modal fade transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* 页面切换过渡 */
.page-enter-active,
.page-leave-active {
  transition: transform 0.3s ease-out;
}
.page-enter-from {
  transform: translateX(100%);
}
.page-leave-to {
  transform: translateX(-100%);
}
</style>
