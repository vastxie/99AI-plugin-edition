<script lang="ts" setup>
import { fetchUpdateGroupAPI } from '@/api/group'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import ModelAvatar from '@/components/common/ModelAvatar/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { setLocale } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAppCatStore } from '@/store/modules/appStore'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import {
  Brightness,
  CheckOne,
  Close,
  DarkMode,
  EditTwo,
  ExpandLeft,
  Right,
  ShareOne,
  Translate,
} from '@icon-park/vue-next'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ShareDialog from '../ShareDialog/index.vue'
import ToolLinks from '../ToolLinks/index.vue'

// 禁用属性自动继承
defineOptions({
  inheritAttrs: false,
})

// 声明组件事件
const emit = defineEmits<{
  'toggle-app-list': []
}>()

interface ModelOption {
  label: string
  value: string
  modelDescription: string
  modelAvatar: string
}

type Language =
  | 'zh-CN'
  | 'zh-TW'
  | 'en-US'
  | 'ja-JP'
  | 'ko-KR'
  | 'ru-RU'
  | 'fr-FR'
  | 'de-DE'
  | 'es-ES'
  | 'ar-SA'
  | 'it-IT'
  | 'pt-PT'
  | 'hi-IN'
  | 'th-TH'
  | 'vi-VN'

interface ExternalLink {
  icon?: string
  name?: string
  [key: string]: any
}

const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const appCatStore = useAppCatStore()
const chatStore = useChatStore()
const modelOptions: Ref<ModelOption[]> = ref([])
const appDetail: any = ref(null)
const dataSources = computed(() => chatStore.groupList)
const collapsed = computed(() => appStore.siderCollapsed)
// const theme = computed(() => appStore.theme);
const authStore = useAuthStore()
const chatGroupId = computed(() => chatStore.active)
const usingPlugin = computed(() => chatStore.currentPlugin)
const darkMode = computed(() => appStore.theme === 'dark')

// 判断是否是分享页面
const isSharePage = inject('isSharePage', false)

// 语言相关
const { t: $t } = useI18n()
const currentLanguage = computed(() => appStore.language)
const isLanguageMenuOpen = ref(false)

// 路由
const router = useRouter()

// 语言选项 - 根据全局配置动态生成
const allLanguageOptions = [
  { value: 'zh-CN', label: '简体中文', icon: '🇨🇳' },
  { value: 'zh-TW', label: '繁體中文', icon: '🇨🇳' },
  { value: 'en-US', label: 'English', icon: '🇺🇸' },
  { value: 'ja-JP', label: '日本語', icon: '🇯🇵' },
  { value: 'ko-KR', label: '한국어', icon: '🇰🇷' },
  { value: 'ru-RU', label: 'Русский', icon: '🇷🇺' },
  { value: 'fr-FR', label: 'Français', icon: '🇫🇷' },
  { value: 'de-DE', label: 'Deutsch', icon: '🇩🇪' },
  { value: 'es-ES', label: 'Español', icon: '🇪🇸' },
  { value: 'ar-SA', label: 'العربية', icon: '🇸🇦' },
  { value: 'it-IT', label: 'Italiano', icon: '🇮🇹' },
  { value: 'pt-PT', label: 'Português', icon: '🇵🇹' },
  { value: 'hi-IN', label: 'हिन्दी', icon: '🇮🇳' },
  { value: 'th-TH', label: 'ภาษาไทย', icon: '🇹🇭' },
  { value: 'vi-VN', label: 'Tiếng Việt', icon: '🇻🇳' },
]

const languageOptions = computed(() => {
  const globalConfig = authStore.globalConfig
  if (!globalConfig?.enabledLanguages) {
    return allLanguageOptions
  }

  // 解析enabledLanguages
  let enabledLanguages: string[] = []
  try {
    if (typeof globalConfig.enabledLanguages === 'string') {
      enabledLanguages = JSON.parse(globalConfig.enabledLanguages)
    } else if (Array.isArray(globalConfig.enabledLanguages)) {
      enabledLanguages = globalConfig.enabledLanguages
    }
  } catch (e) {
    return allLanguageOptions
  }

  // 根据启用的语言过滤选项
  return allLanguageOptions.filter(option => enabledLanguages.includes(option.value))
})

// 是否显示语言切换按钮
const showLanguageButton = computed(() => {
  return languageOptions.value.length > 1
})

const { isMobile } = useBasicLayout()
const isHovering = ref(false)
const isMenuOpen = ref(false)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const listSources = computed(() => chatStore.chatList)

// 分享相关
const showShareDialog = ref(false)
const hasMessages = computed(() => {
  return chatStore.chatList && chatStore.chatList.length > 0
})

// 计算预览器状态
const isPreviewerVisible = computed(
  () => useGlobalStore.showHtmlPreviewer || useGlobalStore.showImagePreviewer
)

// 计算应用广场状态
const isAppListVisible = computed(() => useGlobalStore.showAppListComponent)
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) {
    return {} // 提早返回一个空对象
  }

  try {
    return JSON.parse(configString)
  } catch (e) {
    return {} // 解析失败时返回一个空对象
  }
})

function checkMode() {
  const mode = darkMode.value ? 'light' : 'dark'
  appStore.setTheme(mode)
}

// 切换语言
function switchLanguage(lang: Language) {
  // 验证语言是否在可用列表中
  const availableLanguages = languageOptions.value.map(opt => opt.value)
  if (!availableLanguages.includes(lang)) {
    return
  }
  appStore.setLanguage(lang)
  setLocale(lang)
  isLanguageMenuOpen.value = false
}

const activeModel = computed(() => String(configObj?.value?.modelInfo?.model ?? ''))
/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

// const menuItemsPosition = computed(() => {
//   return isMobile ? 'left-1/2  top-full' : 'left-0 top-full';
// });

watch(
  activeAppId,
  val => {
    if (val) queryAppDetail(val)
    else appDetail.value = null
  },
  { immediate: true }
)

/* 查询当前app详情提示用户使用 */
async function queryAppDetail(id: number) {
  // 使用 appCatStore 的缓存方法
  appDetail.value = await appCatStore.queryAppDetail(id)
}

const notSwitchModel = computed(() => {
  return (
    (activeGroupInfo?.value?.appId &&
      (configObj.value.modelInfo?.isFixedModel === 1 ||
        configObj.value.modelInfo?.isGPTs === 1 ||
        configObj.value.modelInfo?.isFlowith === 1)) ||
    (usingPlugin.value && usingPlugin?.value?.deductType !== 0)
  )
})

// 模型选择器位置配置
const modelSelectorPosition = computed(
  () => authStore.globalConfig?.modelSelectorPosition || 'header'
)

// 判断是否应该显示模型选择器（多个模型且可切换，且配置在顶部）
const shouldShowModelSelector = computed(() => {
  // 如果模型选择器配置在底部，则顶部不显示
  if (modelSelectorPosition.value === 'footer') return false
  return modelOptions.value.length > 1 && !notSwitchModel.value
})

// 标题编辑相关状态
const isEditingTitle = ref(false)
const editingTitle = ref('')

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

// 检测是否为Mac系统
const isMac = computed(() => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
})

async function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

// 关闭应用广场
function closeAppList() {
  useGlobalStore.updateShowAppListComponent(false)
  // 在移动端不自动展开侧边栏
  if (!isMobile.value) {
    appStore.setSiderCollapsed(false)
  }
}

/* 修改对话组模型配置 */
async function switchModel(option: any) {
  chatStore.setUsingDeepThinking(false)
  chatStore.setUsingTool(false)
  chatStore.setUsingPlugin(null)
  const { modelInfo } = chatStore.activeConfig

  const { isGPTs, isFixedModel, modelName, isFlowith } = modelInfo

  const config = {
    modelInfo: {
      keyType: option.keyType,
      modelName: (activeGroupInfo?.value?.appId ? modelName : option.label) || '', // 更明确的条件
      model: option.value,
      deductType: option.deductType,
      deduct: option.deduct,
      isFileUpload: option.isFileUpload,
      isImageUpload: option.isImageUpload,
      isToolSupported: option.isToolSupported || 0,
      deepThinkingType: option.deepThinkingType,
      modelAvatar: option.modelAvatar || '',
      isGPTs, // 简化赋值
      isFlowith, // 简化赋值
      isFixedModel, // 简化赋值
    },
  }

  const params = {
    groupId: chatGroupId.value,
    config: JSON.stringify(config),
  }
  await fetchUpdateGroupAPI(params)
  await chatStore.queryMyGroup()
  // useGlobalStore.updateModelDialog(false);
}

function queryModelsList() {
  // 如果 modelOptions 已经有数据,直接返回
  if (modelOptions.value.length > 0) {
    return
  }

  // 从 chatStore.modelList 读取已加载的模型数据
  const allModels = chatStore.modelList

  // 只保留 keyType 为 1 的模型
  const filteredModels = allModels.filter((model: any) => model.modelType === 1)

  modelOptions.value = filteredModels.map((model: any) => ({
    label: model.modelName,
    value: model.model,
    deductType: model.deductType,
    keyType: model.modelType,
    deduct: model.deduct,
    isFileUpload: model.isFileUpload,
    isImageUpload: model.isImageUpload,
    isToolSupported: model.isToolSupported || 0,
    deepThinkingType: model.deepThinkingType,
    modelAvatar: model.modelAvatar,
    modelDescription: model.modelDescription,
  }))
}

// 模型列表已在 App.vue 中统一加载
// 这里只需从 store 读取并格式化数据,不再查询 API
onMounted(() => {
  queryModelsList()
  window.addEventListener('keydown', handleKeyDown)
})

// 在组件卸载前移除事件监听
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const externalLinkActive = computed(
  () => useGlobalStore.externalLinkDialog && useGlobalStore.currentExternalLink
)
const currentExternalLink = computed(() => {
  const link = useGlobalStore.currentExternalLink
  return (typeof link === 'object' ? link : {}) as ExternalLink
})

// 添加一个新的方法来处理模型选择
function handleModelSelect(option: any) {
  switchModel(option)
}

// 分享页面的新对话处理
function handleSharePageNewChat() {
  // 跳转到首页，首页会自动创建新对话
  router.push('/')
}

// 添加键盘快捷键监听
const handleKeyDown = (e: KeyboardEvent) => {
  // Cmd+K (Mac) 或 Ctrl+K (Windows/Linux): 新建对话
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (!isSharePage) {
      createNewChatGroup()
    } else {
      handleSharePageNewChat()
    }
    return
  }
}

// 标题编辑相关函数
function handleTitleEdit() {
  // 如果模型选择器在底部显示，则不管有多少模型都允许编辑标题
  if (modelSelectorPosition.value === 'footer') {
    if (isMobile.value) return // 移动端不允许编辑标题
    isEditingTitle.value = true
    editingTitle.value = activeGroupInfo.value?.title || ''
    return
  }

  // 原有逻辑：模型选择器在顶部时
  if (modelOptions.value.length > 1) return // 多个模型时不允许编辑标题
  if (isMobile.value) return // 移动端不允许编辑标题

  isEditingTitle.value = true
  editingTitle.value = activeGroupInfo.value?.title || ''
}

async function updateGroupTitle() {
  if (!activeGroupInfo.value || !editingTitle.value.trim()) {
    cancelTitleEdit()
    return
  }

  try {
    await chatStore.updateGroupInfo({
      groupId: Number(activeGroupInfo.value.uuid),
      title: editingTitle.value.trim(),
    })
    isEditingTitle.value = false
    editingTitle.value = '' // 清空输入框内容
  } catch (error) {
    cancelTitleEdit()
  }
}

function cancelTitleEdit() {
  isEditingTitle.value = false
  editingTitle.value = ''
}

function handleTitleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    updateGroupTitle()
  } else if (event.key === 'Escape') {
    cancelTitleEdit()
  }
}

function handleTitleBlur() {
  // 延迟一点再取消编辑，避免点击保存按钮时失焦导致取消
  setTimeout(() => {
    if (isEditingTitle.value) {
      updateGroupTitle()
    }
  }, 100)
}

// 注册focus指令
const vFocus = {
  mounted: (el: HTMLElement) => {
    nextTick(() => {
      el.focus()
    })
  },
}

// 统一的点击处理
function handleClick() {
  // 分享页面不处理点击
  if (isSharePage) return

  // 使用插件时不处理点击
  if (usingPlugin.value && usingPlugin.value?.deductType !== 0) return

  // 不可切换模型时不处理点击
  if (notSwitchModel.value) return

  // 如果模型选择器在底部，标题总是可以编辑
  if (modelSelectorPosition.value === 'footer') {
    handleTitleEdit()
    return
  }

  // 多个模型时由下拉菜单处理，这里不需要处理
  if (shouldShowModelSelector.value) return

  // 应用对话（有appId）时不处理点击，和固定模型一样
  if (activeGroupInfo.value?.appId) return

  // 单个模型时，进入标题编辑状态
  if (modelOptions.value.length <= 1) {
    handleTitleEdit()
  }
}

// 获取aria标签
function getAriaLabel() {
  // 使用插件时
  if (usingPlugin.value && usingPlugin.value?.deductType !== 0) {
    return $t('common.currentPlugin')
  }
  // 有appId且有多个模型时
  if (activeGroupInfo.value?.appId && modelOptions.value.length > 1) {
    return $t('common.selectModel')
  }
  // 应用对话（有appId）时，和固定模型一样
  if (activeGroupInfo.value?.appId) {
    return $t('common.currentApp')
  }
  if (notSwitchModel.value) {
    return $t('common.currentConversation')
  }
  if (modelOptions.value.length <= 1) {
    return $t('common.clickEditTitle')
  }
  return '当前对话'
}

// 获取显示文本
function getDisplayText() {
  // 如果模型选择器在底部，或者只有一个模型，顶部显示标题
  if (modelSelectorPosition.value === 'footer' || modelOptions.value.length <= 1) {
    if (activeGroupInfo.value?.title && activeGroupInfo.value.title.trim() !== '') {
      return activeGroupInfo.value.title
    }
    return $t('common.newConversation')
  }

  // 不可切换模型时显示插件名或标题
  if (notSwitchModel.value) {
    return (
      usingPlugin.value?.pluginName || activeGroupInfo.value?.title || $t('common.newConversation')
    )
  }
  return activeGroupInfo.value?.title || $t('common.newConversation')
}

// 获取工具提示文本
function getTooltipText() {
  // 分享页面不显示提示
  if (isSharePage) {
    return null
  }
  // 使用插件时，不显示提示（但仍有悬停样式）
  if (usingPlugin.value && usingPlugin.value?.deductType !== 0) {
    return null
  }
  // 如果模型选择器在底部，显示编辑标题提示
  if (modelSelectorPosition.value === 'footer') {
    return activeGroupInfo.value?.uuid ? $t('common.editTitle') : ''
  }
  // 有appId且有多个模型时
  if (activeGroupInfo.value?.appId && modelOptions.value.length > 1) {
    return $t('common.selectModel')
  }
  // 应用对话（有appId）时，不显示提示（但仍有悬停样式）
  if (activeGroupInfo.value?.appId) {
    return null
  }
  // 不可切换模型的其他情况，不显示提示（但仍有悬停样式）
  if (notSwitchModel.value) {
    return null
  }
  if (modelOptions.value.length <= 1) {
    return $t('common.editTitle')
  }
  return null
}
</script>

<template>
  <header class="sticky top-0 left-0 right-0 z-30 dark:border-neutral-800 h-16" v-bind="$attrs">
    <div class="relative flex items-center justify-center min-w-0 h-full">
      <div class="flex w-full h-full items-center" :class="{ 'px-4': !isMobile, 'px-2': isMobile }">
        <div
          v-if="collapsed && !externalLinkActive && !isPreviewerVisible && !isSharePage"
          class="relative group mx-1"
        >
          <button
            type="button"
            class="btn-icon btn-md"
            @click="handleUpdateCollapsed"
            :aria-label="$t('common.expandSidebar')"
          >
            <ExpandLeft size="22" />
          </button>
          <!-- 悬停提示 - 展开侧边栏 -->
          <div v-if="!isMobile" class="tooltip tooltip-right">{{ $t('common.expandSidebar') }}</div>
        </div>

        <!-- pc -->
        <div class="flex justify-between items-center h-full w-full">
          <!-- 统一的标题/模型显示组件 -->
          <div class="flex-1 flex items-center">
            <!-- 外部链接状态 - 显示链接信息 -->
            <div
              v-if="externalLinkActive"
              class="relative flex-1 flex ele-drag items-center justify-between h-full"
            >
              <div class="py-1 flex items-center space-x-2">
                <img
                  v-if="currentExternalLink && currentExternalLink.icon"
                  :src="currentExternalLink.icon"
                  :alt="$t('common.websiteIcon')"
                  class="w-6 h-6 rounded-lg object-cover"
                />
                <div v-else class="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                  <span class="text-xs">{{ currentExternalLink?.name?.charAt(0) || '?' }}</span>
                </div>
                <span
                  class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate whitespace-nowrap overflow-hidden max-w-[30vw]"
                >
                  {{ currentExternalLink?.name || $t('common.externalLink') }}
                </span>
              </div>
            </div>

            <!-- 编辑标题状态 - 显示输入框 -->
            <div v-else-if="isEditingTitle" class="flex items-center w-full">
              <input
                v-model="editingTitle"
                v-focus
                type="text"
                class="menu-trigger"
                @keydown="handleTitleKeydown"
                @blur="handleTitleBlur"
                :aria-label="$t('common.editConversationTitle')"
              />
            </div>

            <!-- 多模型选择状态 - 显示下拉选择器 -->
            <DropdownMenu
              v-else-if="
                shouldShowModelSelector || (activeGroupInfo?.appId && modelOptions.length > 1)
              "
              v-model="isMenuOpen"
              position="bottom-left"
              max-height="35vh"
              :z-index="9999"
            >
              <template #trigger>
                <button
                  class="menu-trigger"
                  @mouseover="isHovering = true"
                  @mouseleave="isHovering = false"
                  :aria-label="$t('common.selectModel')"
                >
                  <span class="truncate whitespace-nowrap overflow-hidden max-w-[50vw]">
                    {{ configObj?.modelInfo?.modelName || $t('common.newConversation') }}
                  </span>
                  <Right
                    v-if="isHovering || isMobile || isMenuOpen"
                    size="20"
                    class="ml-2 justify-center items-center flex-shrink-0"
                    :class="{
                      'text-base font-bold': isMobile,
                      'text-sm': !isMobile,
                    }"
                    aria-hidden="true"
                  />
                </button>
              </template>
              <template #menu="{ close }">
                <div>
                  <div
                    v-for="(option, index) in modelOptions"
                    :key="index"
                    class="menu-item menu-item-md"
                    :class="{ 'menu-item-active': activeModel === option.value }"
                    @click="
                      () => {
                        handleModelSelect(option)
                        close()
                      }
                    "
                    role="menuitem"
                    tabindex="0"
                    :aria-label="`${$t('common.selectModel')}: ${option.label}`"
                  >
                    <ModelAvatar
                      :model="option.value"
                      :modelAvatar="option.modelAvatar"
                      :modelName="option.label"
                      size="md"
                    />
                    <div class="menu-item-content">
                      <div class="menu-item-title">
                        {{ option.label }}
                      </div>
                      <div v-if="option.modelDescription" class="menu-item-description">
                        {{ option.modelDescription }}
                      </div>
                    </div>
                    <div class="flex-shrink-0" v-if="activeModel === option.value">
                      <CheckOne
                        theme="filled"
                        size="16"
                        class="text-gray-500 dark:text-gray-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </DropdownMenu>

            <!-- 默认状态 - 显示标题，统一交互样式 -->
            <div v-else class="relative group">
              <button class="menu-trigger" :aria-label="getAriaLabel()" @click="handleClick">
                <span class="truncate whitespace-nowrap overflow-hidden max-w-[50vw]">
                  {{ getDisplayText() }}
                </span>
              </button>
              <!-- 悬停提示 -->
              <div v-if="!isMobile && getTooltipText()" class="tooltip tooltip-bottom">
                {{ getTooltipText() }}
              </div>
            </div>
          </div>

          <div class="flex items-center">
            <!-- 分享按钮 - 仅在有消息时显示，分享页面不显示，登录用户可见 -->
            <div
              v-if="
                !externalLinkActive &&
                !isPreviewerVisible &&
                hasMessages &&
                !isSharePage &&
                authStore.isLogin
              "
              class="relative group mx-1"
            >
              <button
                type="button"
                class="btn-icon btn-md"
                @click="showShareDialog = true"
                aria-label="分享对话"
              >
                <ShareOne size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 分享 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">分享</div>
            </div>

            <!-- 语言切换按钮 - 仅在有多个语言选项时显示，分享页面不显示，移动端隐藏 -->
            <div
              v-if="
                !externalLinkActive &&
                !isPreviewerVisible &&
                showLanguageButton &&
                !isSharePage &&
                !isMobile
              "
              class="relative group mx-1"
            >
              <DropdownMenu
                v-model="isLanguageMenuOpen"
                position="bottom-right"
                :max-height="'200px'"
                :z-index="9999"
              >
                <template #trigger>
                  <button
                    type="button"
                    class="btn-icon btn-md"
                    :aria-label="$t('common.toggleLanguage')"
                  >
                    <Translate size="20" aria-hidden="true" />
                  </button>
                </template>
                <template #menu="{ close }">
                  <div>
                    <div
                      v-for="lang in languageOptions"
                      :key="lang.value"
                      class="menu-item menu-item-sm"
                      :class="{ 'menu-item-active': currentLanguage === lang.value }"
                      @click="
                        () => {
                          switchLanguage(lang.value as Language)
                          close()
                        }
                      "
                      role="menuitem"
                      tabindex="0"
                      :aria-label="`${$t('common.switchTo')}${lang.label}`"
                    >
                      <span class="mr-2">{{ lang.icon }}</span>
                      <span>{{ lang.label }}</span>
                      <CheckOne
                        v-if="currentLanguage === lang.value"
                        theme="filled"
                        size="16"
                        class="ml-auto text-gray-500 dark:text-gray-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </template>
              </DropdownMenu>
              <!-- 悬停提示 - 切换语言 -->
              <div v-if="!isMobile && !isLanguageMenuOpen" class="tooltip tooltip-bottom">
                {{ $t('common.toggleLanguage') }}
              </div>
            </div>

            <!-- 主题切换按钮，仅在非外部链接和非预览器状态下显示，分享页面不显示，移动端隐藏 -->
            <div
              v-if="!externalLinkActive && !isPreviewerVisible && !isSharePage && !isMobile"
              class="relative group mx-1"
            >
              <button
                type="button"
                class="btn-icon btn-md"
                @click="checkMode"
                :aria-label="$t('common.toggleTheme')"
              >
                <Brightness v-if="!darkMode" size="20" aria-hidden="true" />
                <DarkMode v-else size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 切换主题 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                {{ $t('common.toggleTheme') }}
              </div>
            </div>

            <!-- 工具链接组件，在非预览器状态、非外部链接状态、非应用广场状态、非分享页面下显示 -->
            <ToolLinks
              v-if="!externalLinkActive && !isPreviewerVisible && !isAppListVisible && !isSharePage"
            />

            <!-- 外部链接状态下显示关闭按钮，应用广场状态下显示关闭按钮，否则显示新对话按钮 -->
            <div v-if="externalLinkActive" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="
                  () => {
                    useGlobalStore.updateExternalLinkDialog(false)
                    if (!isMobile) {
                      appStore.setSiderCollapsed(false)
                    }
                  }
                "
                :aria-label="$t('common.closeExternalLink')"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ $t('common.close') }}</div>
            </div>
            <div v-else-if="isAppListVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="closeAppList"
                :aria-label="$t('common.closeAppSquare')"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ $t('common.close') }}</div>
            </div>
            <div v-else-if="!isPreviewerVisible && !isSharePage" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="createNewChatGroup()"
                :disabled="listSources.length === 0 && !activeAppId && dataSources.length !== 0"
                :aria-label="$t('common.newConversation')"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 新对话 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                <div>{{ $t('common.newConversation') }}</div>
                <div class="text-xs opacity-70 mt-1">{{ isMac ? 'Cmd+K' : 'Ctrl+K' }}</div>
              </div>
            </div>

            <!-- 分享页面的新对话按钮，跳转到首页 -->
            <div v-else-if="!isPreviewerVisible && isSharePage" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="handleSharePageNewChat"
                :aria-label="$t('common.newConversation')"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 新对话 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                <div>{{ $t('common.newConversation') }}</div>
                <div class="text-xs opacity-70 mt-1">{{ isMac ? 'Cmd+K' : 'Ctrl+K' }}</div>
              </div>
            </div>

            <!-- 登录用户 - 直接点击打开设置对话框 -->
            <!-- <div
              v-if="isLogin"
              @click="openSettings(undefined)"
              class="flex items-center cursor-pointer group relative mr-3"
              role="button"
              aria-label="打开设置中心"
              tabindex="0"
            >
              <div
                class="w-8 h-8 ml-1 rounded-full bg-primary-500 overflow-hidden flex items-center justify-center shadow-sm"
              >
                <img
                  v-if="avatar"
                  :src="avatar"
                  class="w-full h-full object-cover"
                  alt="用户头像"
                />
                <User
                  v-if="!avatar"
                  theme="outline"
                  size="18"
                  class="text-white"
                  aria-hidden="true"
                />
              </div>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">设置</div>
            </div> -->

            <!-- 添加工作流预览按钮，移除v-else-if条件 -->
            <!-- <div class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                :class="{
                  'bg-primary/10 dark:bg-primary/20': useGlobalStore.showWorkflowPreviewer,
                }"
                @click="toggleWorkflowPreviewer()"
                aria-label="工作流预览"
              >
                <Api
                  size="20"
                  aria-hidden="true"
                  :class="{ 'text-primary': useGlobalStore.showWorkflowPreviewer }"
                />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">工作流预览</div>
            </div> -->
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- 分享弹窗 -->
  <ShareDialog v-model="showShareDialog" />
</template>
