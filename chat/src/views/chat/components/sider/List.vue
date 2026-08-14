<script setup lang="ts">
import { fetchCollectAppAPI } from '@/api/appStore'
import type { ResData } from '@/api/types'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppCatStore } from '@/store/modules/appStore'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { dialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { ApplicationTwo, Delete, Down, Unlike, Up } from '@icon-park/vue-next'
import { computed, inject, ref, watch } from 'vue'
import ListItem from './ListItem.vue'

// 接口定义
interface FormField {
  type: 'input' | 'select'
  title: string
  placeholder: string
  options?: string[]
}

const { isMobile } = useBasicLayout()
const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()
const ms = message()

// 从chatBase inject弹窗相关方法
const showAppConfigModal = inject('showAppConfigModal') as
  | ((app: any, formSchema: FormField[]) => void)
  | undefined
const tryParseJson = inject('tryParseJson') as
  | ((jsonString: string | undefined | null) => FormField[] | null)
  | undefined

const customKeyId = ref(100)
const appCatStore = useAppCatStore()
const showMoreSticky = ref(false)
const showMoreMineApps = ref(false)
const showAllApps = ref(true)
const isHideSidebarApps = computed(() => Number(authStore.globalConfig.isHideSidebarApps) === 1)

const dataSources = computed(() => chatStore.groupList)
const groupKeyWord = computed(() => chatStore.groupKeyWord)
watch(dataSources, () => (customKeyId.value = customKeyId.value + 1))
watch(groupKeyWord, () => (customKeyId.value = customKeyId.value + 1))
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})

const mineApps = computed(() => {
  return appCatStore.mineApps
})

const stickyList = computed(() =>
  dataSources.value.filter(item =>
    groupKeyWord.value ? item.title.includes(groupKeyWord.value) && item.isSticky : item.isSticky
  )
)

const historyList = computed(() =>
  dataSources.value.filter((item: any) => {
    if (groupKeyWord.value) return item.title.includes(groupKeyWord.value) && !item.isSticky
    else return !item.isSticky
  })
)

/* 选中切换对话 */
async function handleSelect(group: Chat.History) {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }
  const { uuid } = group
  if (isActive(uuid)) return

  await chatStore.setActiveGroup(uuid)

  if (isMobile.value) appStore.setSiderCollapsed(true)
}

async function addNewChatGroupFromApp(appId: number) {
  // 首先从mineApps中查找当前应用的信息
  const currentApp = mineApps.value.find(app => app.appId === appId)

  // 检查是否有配置弹窗功能

  if (tryParseJson && showAppConfigModal && currentApp?.prompt) {
    const formSchema = tryParseJson(currentApp.prompt)

    if (formSchema) {
      // 将MineApp格式转换为弹窗期望的App格式
      const appForModal = {
        ...currentApp, // 先展开所有字段
        id: currentApp.appId, // MineApp中使用appId，弹窗期望id
        name: currentApp.appName, // MineApp中使用appName，弹窗期望name
        des: currentApp.appDes, // MineApp中使用appDes，弹窗期望des
      }
      showAppConfigModal(appForModal, formSchema)
      return
    }
  }

  // 如果没有配置或获取失败，直接创建新的聊天组
  await chatStore.addNewChatGroup(appId)
}

/* 删除对话组 */
async function handleDelete(params: Chat.History) {
  event?.stopPropagation()
  await chatStore.deleteGroup(params)
  await chatStore.queryMyGroup()
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

const useGlobalStore = useGlobalStoreWithOut()

/* 判断是不是当前选中 */
function isActive(uuid: number) {
  return chatStore.active === uuid
}

async function handleCollect(appId: number) {
  try {
    const res: ResData = await fetchCollectAppAPI({ appId: appId })
    ms.success(res.data)
    await appCatStore.queryMineApps(true) // 强制刷新
  } catch (error) {
    // Handle error silently
  }
}

/* 清空全部非置顶聊天 */
async function handleClearConversations() {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('chat.clearConversation'),
    content: t('chat.clearAllNonFavoriteConversations'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await chatStore.delAllGroup()
      } catch (error) {
        // Handle error silently
      }
    },
  })
}

// 监听登录状态的变化
watch(
  () => authStore.isLogin,
  (newValue, oldValue) => {
    if (newValue === true) {
      // mineApps 已在 App.vue 中加载,这里不需要重复查询
      chatStore.queryMyGroup()
    }
  },
  { immediate: true } // 立即执行，以处理组件加载时的逻辑
)

const isHistoryHovered = ref(false)
const isAppsHovered = ref(false)
</script>

<template>
  <div class="custom-scrollbar px-4 overflow-y-auto h-full">
    <div class="flex flex-col gap-3 text-sm">
      <template v-if="!dataSources.length">
        <div class="flex flex-col items-center mt-4 text-center text-neutral-300">
          <SvgIcon icon="ri:inbox-line" class="mb-2 text-3xl" />
          <span>{{ t('common.noData') }}</span>
        </div>
      </template>
      <template v-else>
        <div
          v-if="!isHideSidebarApps"
          class="flex items-center justify-between mt-3 group"
          @mouseenter="isAppsHovered = true"
          @mouseleave="isAppsHovered = false"
        >
          <p class="text-xs font-bold">
            {{ t('chat.myApps') }}
            <!-- <span class="ml-1">({{ dataSources?.length }})</span> -->
          </p>
          <div class="relative group" v-if="isAppsHovered">
            <button
              class="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-opacity opacity-70 hover:opacity-100 mr-3"
              @click="showAllApps = !showAllApps"
            >
              <Down v-if="!showAllApps" theme="outline" size="16" />
              <Up v-else theme="outline" size="16" />
            </button>
            <div class="tooltip tooltip-left">{{ showAllApps ? '折叠应用' : '展开应用' }}</div>
          </div>
        </div>

        <div v-if="showAllApps && !isHideSidebarApps">
          <div
            v-for="app in showMoreMineApps ? mineApps : mineApps.slice(0, 4)"
            :key="app.appId"
            @click="addNewChatGroupFromApp(app.appId)"
            class="relative flex items-center gap-3 my-1 px-3 py-1 break-all rounded-lg cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm text-gray-700 dark:text-gray-100"
          >
            <div class="avatar avatar-md">
              <img
                v-if="app.coverImg"
                :src="app.coverImg"
                alt="app cover"
                class="w-full h-full object-cover"
              />
              <span v-else>
                {{ (app.appName || '?').charAt(0) }}
              </span>
            </div>

            <button class="flex-1 text-left">
              {{ app.appName || '未知应用' }}
            </button>

            <div class="relative opacity-0 group-hover:opacity-100 z-10">
              <button
                class="p-1"
                @click.stop="handleCollect(app.appId)"
                aria-label="取消收藏"
                title="取消收藏"
              >
                <Unlike theme="filled" size="18" class="text-primary-600" />
              </button>
            </div>
          </div>
          <button
            class="relative flex items-center gap-3 px-3 break-all rounded-lg cursor-pointer text-gray-900 dark:text-gray-400 text-xs font-bold"
            v-if="mineApps.length > 4"
            @click="showMoreMineApps = !showMoreMineApps"
          >
            {{ showMoreMineApps ? t('chat.collapse') : t('chat.more') }}
            <Down v-if="!showMoreMineApps" theme="outline" size="20" />
            <Up v-else theme="outline" size="20" />
          </button>
          <div
            class="relative flex items-center gap-3 px-3 py-1 break-all rounded-lg cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm text-gray-700 dark:text-gray-100"
            @click="
              () => {
                useGlobalStore.updateShowAppListComponent(true)
                if (isMobile) {
                  appStore.setSiderCollapsed(true)
                }
              }
            "
          >
            <ApplicationTwo
              theme="outline"
              size="25"
              class="ml-1 mr-1 text-sm my-1 text-gray-600 dark:text-gray-100"
            />
            {{ t('chat.appSquare') }}
          </div>
        </div>

        <ListItem
          v-if="stickyList.length"
          :key="`stickyList-${showMoreSticky}-${stickyList}`"
          :title="t('chat.favorites')"
          :data-sources="showMoreSticky ? stickyList : stickyList.slice(0, 5)"
          @select="handleSelect"
          @delete="handleDelete"
        />

        <button
          class="relative flex items-center gap-3 px-3 break-all rounded-lg cursor-pointer text-gray-900 dark:text-gray-400 text-xs font-bold"
          v-if="stickyList.length > 5"
          @click="showMoreSticky = !showMoreSticky"
        >
          {{ showMoreSticky ? t('chat.collapse') : t('chat.more') }}
          <Down v-if="!showMoreSticky" theme="outline" size="20" />
          <Up v-else theme="outline" size="20" />
        </button>

        <div
          class="flex items-center justify-between mt-3 mb-1 group"
          @mouseenter="isHistoryHovered = true"
          @mouseleave="isHistoryHovered = false"
        >
          <p class="text-xs font-bold">
            {{ t('chat.historyConversations') }}
            <span class="ml-1">({{ historyList.length }})</span>
          </p>
          <div class="relative group" v-if="historyList.length > 0 && isHistoryHovered">
            <button
              class="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-opacity opacity-70 hover:opacity-100 mr-3"
              @click="handleClearConversations"
            >
              <Delete theme="outline" size="16" />
            </button>
            <div class="tooltip tooltip-left">{{ t('chat.clearConversation') }}</div>
          </div>
        </div>
        <ListItem
          v-if="historyList.length"
          :key="3000 + customKeyId"
          :data-sources="historyList"
          @select="handleSelect"
          @delete="handleDelete"
        />
      </template>
    </div>
  </div>
</template>

<style scoped></style>
