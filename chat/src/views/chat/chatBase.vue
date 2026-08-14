<script setup lang="ts">
// Vue 核心
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'

// 第三方库
import { Close, DropDownList } from '@icon-park/vue-next'
import DownSmall from '@icon-park/vue-next/es/icons/DownSmall'

// Store
import { useAppCatStore } from '@/store/modules/appStore'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'

// API
import { fetchChatAPIProcess } from '@/api'
import { fetchQueryOneCatAPI } from '@/api/appStore'
import { fetchUserPresetsAPI, incrementPresetUsageAPI } from '@/api/preset'

// Hooks
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'

// Utils
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { t } from '@/locales'
import { dialog } from '@/utils/dialog'
import { message } from '@/utils/message'

// 组件
import { DropdownMenu } from '@/components/common/DropdownMenu'
import AiBotComponent from './components/AiBot/index.vue'
import AppList from './components/AppList/index.vue'
import ExternalLinkComponent from './components/ExternalLink/index.vue'
import FooterComponent from './components/Footer/index.vue'
import HeaderComponent from './components/Header/index.vue'
import Message from './components/Message/index.vue'
import PresetHints from './components/PresetHints/index.vue'
import Sider from './components/sider/index.vue'
import WelcomeComponent from './components/Welcome/index.vue'

const SidePanel = defineAsyncComponent(() => import('./components/SidePanel.vue'))
const MediaSidebar = defineAsyncComponent(() => import('./components/MediaSidebar.vue'))

// 类型定义
interface FormField {
  type: 'input' | 'select'
  title: string
  placeholder: string
  options?: string[]
}

// 定义工具状态优先级 (数值越大优先级越高)
const getToolStatusPriority = (status: string): number => {
  const priorities: Record<string, number> = {
    error: 3, // 错误状态优先级最高,不会被覆盖
    success: 2, // 成功状态次之
    loading: 1, // 加载状态最低,容易被覆盖
  }
  return priorities[status] || 0
}

// 组合式函数
const ms = message()
const { isMobile } = useBasicLayout()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, isAtBottom, handleScroll } =
  useScroll()
// vue-tsc noUnusedLocals 不会把静态模板 ref 计为脚本侧使用。
void scrollRef.value
const { addGroupChat, updateGroupChatSome } = useChat()

// ============== Store ==============
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const appCatStore = useAppCatStore()
const chatStore = useChatStore()

// 响应式状态
const route = useRoute()
const firstScroll = ref<boolean>(true)
const controller = ref(new AbortController())
const componentKey = ref(0)
const showAppListComponent = ref(false)
const currentAppDetail = ref<any>(null)
const sidePanelRef = ref<any>(null)
const footerRef = ref<any>(null)
const textEditorRef = computed(() => sidePanelRef.value?.textEditorRef || null)

// 弹窗相关状态
const showFormModal = ref(false)
const currentFormSchema = ref<FormField[]>([])
const selectedAppForModal = ref<any>(null)
const isSubmitting = ref(false)
const modalFormData = ref<Record<string, any>>({})
const isModalLoading = computed(() => isSubmitting.value)
const dropdownStates = ref<Record<string, boolean>>({})

// 计算属性
const groupSources = computed(() => chatStore.groupList)
const tradeStatus = computed(() => {
  return route?.query?.trade_status ? String(route.query.trade_status) : ''
})
const token = computed(() => {
  return route?.query?.token ? String(route.query.token) : ''
})
const isLogin = computed(() => authStore?.isLogin ?? false)
const usingPlugin = computed(() => chatStore.currentPlugin)
const dataSources = computed(() => chatStore.chatList)
const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const globalConfig = computed(() => authStore.globalConfig)
const isHideDefaultPreset = computed(
  () => Number(authStore.globalConfig?.isHideDefaultPreset) === 1
)
const isHtmlPreviewerVisible = computed(() => useGlobalStore.showHtmlPreviewer)
const isImagePreviewerVisible = computed(() => useGlobalStore.showImagePreviewer)
const isMarkdownPreviewerVisible = computed(() => useGlobalStore.isMarkdownPreviewerVisible)
const isPptPreviewerVisible = computed(() => {
  return useGlobalStore.showPptPreviewer
})
const isMessageEditorVisible = computed(() => {
  const visible = useGlobalStore.showMessageEditor
  return visible
})
const isTextEditorVisible = computed(() => useGlobalStore.showTextEditor)
const sideDrawingEditModel = computed(() => authStore.globalConfig?.sideDrawingEditModel)
const isStreamCacheEnabled = computed(() => authStore.globalConfig?.streamCacheEnabled === '1')
const isMobileHtmlFullscreen = computed(() => {
  return (
    isMobile.value &&
    (isHtmlPreviewerVisible.value ||
      isImagePreviewerVisible.value ||
      isMarkdownPreviewerVisible.value ||
      isPptPreviewerVisible.value ||
      isMessageEditorVisible.value)
  )
})

const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) {
    return {}
  }

  try {
    return JSON.parse(configString)
  } catch (e) {
    return {}
  }
})

const activeChatBackgroundImg = computed(() => {
  if (currentAppDetail.value?.backgroundImg) {
    return currentAppDetail.value.backgroundImg
  }
  return configObj.value?.backgroundImg || null
})

const isFlowith = computed(() => {
  return configObj?.value?.modelInfo?.isFlowith
})

const fileParsing = computed(() => {
  return ''
})

// 获取模型
const activeModel = computed(() => {
  return String(
    usingPlugin?.value?.parameters !== 'mind-map' && usingPlugin?.value?.parameters !== 'mermaid'
      ? usingPlugin?.value?.parameters || configObj?.value?.modelInfo?.model || ''
      : configObj?.value?.modelInfo?.model || ''
  )
})

// 获取文件url
const activeFileUrl = computed(() => String(activeGroupInfo.value?.fileUrl || ''))

// 获取模型名称
const activeModelName = computed(() => {
  return String(usingPlugin?.value?.pluginName || configObj?.value.modelInfo.modelName || 'AI')
})

// 获取模型类型
const activeModelKeyType = computed(() => {
  return Number(configObj?.value.modelInfo.keyType || 1)
})

/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

// 预设相关
const presetCategories = ref<string[]>(['全部'])
const selectedPresetCategory = ref('全部')
const presetData = ref<any[]>([])
const presetLoading = ref(false)
const isHomeFooterExpanded = ref(false)
const shouldShowPresets = computed(() => {
  return !isHideDefaultPreset.value && presetData.value && presetData.value.length > 0
})
const shouldShowHomePresets = computed(() => shouldShowPresets.value && !isHomeFooterExpanded.value)

const backgroundStyle = computed(() => {
  if (selectedAppForModal.value?.backgroundImg) {
    return {
      backgroundImage: `url(${selectedAppForModal.value.backgroundImg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return {}
})

// 监听器
watch(
  dataSources,
  (val, oldVal) => {
    if (Array.isArray(val) && val.length > 0 && firstScroll.value) {
      firstScroll.value = false
      scrollToBottom()
    }

    if (Array.isArray(val) && val.length > 0) {
      isHomeFooterExpanded.value = false
    }

    if (oldVal !== undefined) {
      componentKey.value++
    }
  },
  { immediate: true }
)

watch(
  () => activeGroupId.value,
  async () => {
    // 移除 clearSelectApp() 调用，因为切换对话时不应该清空插件
    // 插件会从后端数据自动恢复
    setTimeout(scrollToBottom, 100)
  }
)

watch(
  activeAppId,
  async newAppId => {
    if (newAppId && newAppId > 0) {
      await fetchCurrentAppDetail(newAppId)
    } else {
      currentAppDetail.value = null
    }
  },
  { immediate: true }
)

watch(
  [() => currentFormSchema.value, () => showFormModal.value],
  ([newSchema, newVisible]) => {
    if (newVisible && newSchema && newSchema.length > 0) {
      const initialData: Record<string, any> = {}
      const initialDropdownStates: Record<string, boolean> = {}
      newSchema.forEach(field => {
        initialData[field.title] = ''
        if (field.type === 'select') {
          initialDropdownStates[field.title] = false
        }
      })
      modalFormData.value = initialData
      dropdownStates.value = initialDropdownStates
    }
  },
  { immediate: true }
)

// 生命周期
let handlePPTSubmitDirectlyRef: any = null

onMounted(async () => {
  await Promise.all([chatStore.queryActiveChatLogList(), loadPresets()])
  await nextTick()

  if (token.value) {
    await otherLoginByToken(token.value)
    // 清理URL中的token参数，避免敏感信息暴露在地址栏
    const newUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, newUrl)
  }

  if (tradeStatus.value) {
    await handleRefresh()
  }

  const handlePPTSubmitDirectly = (event: CustomEvent) => {
    const { message: pptMessage, selectedTheme, action } = event.detail
    onConversation({
      msg: pptMessage,
      action: action,
      selectedTheme: selectedTheme,
      model: activeModel.value,
      modelName: activeModelName.value,
      modelType: activeModelKeyType.value,
      pluginParam: usingPlugin.value?.parameters || 'ppt-generation',
    })
  }
  handlePPTSubmitDirectlyRef = handlePPTSubmitDirectly
  window.addEventListener('ppt-submit-directly', handlePPTSubmitDirectly as EventListener)
})

onMounted(async () => {
  try {
    await authStore.getUserInfo()
  } catch (error) {
    // 用户信息获取失败
  }
})

onUnmounted(() => {
  if (handlePPTSubmitDirectlyRef) {
    window.removeEventListener('ppt-submit-directly', handlePPTSubmitDirectlyRef)
  }
})

// 弹窗相关方法
function tryParseJson(jsonString: string | undefined | null): FormField[] | null {
  if (!jsonString) return null
  try {
    const parsed = JSON.parse(jsonString)
    if (
      Array.isArray(parsed) &&
      parsed.every(item => item.type && item.title && item.placeholder)
    ) {
      return parsed as FormField[]
    }
    return null
  } catch (error) {
    return null
  }
}

function selectOption(fieldTitle: string, option: string) {
  modalFormData.value[fieldTitle] = option
}

function handleModalClose() {
  showFormModal.value = false
  currentFormSchema.value = []
  selectedAppForModal.value = null
}

async function handleModalSkip(app: any) {
  showFormModal.value = false
  // 直接执行应用，不带数据
  await executeApp(app)
}

function handleModalSubmit() {
  if (!selectedAppForModal.value) return

  // 检查表单是否为空（排除系统生成字段）
  let hasUserInput = false
  for (const fieldTitle in modalFormData.value) {
    // 如果存在任何非空的用户输入字段，标记为有输入
    const field = currentFormSchema.value.find(f => f.title === fieldTitle)
    if (field && !field.placeholder.includes('(系统生成)') && modalFormData.value[fieldTitle]) {
      hasUserInput = true
      break
    }
  }

  // 如果用户没有填写任何内容，按跳过处理
  if (!hasUserInput) {
    showFormModal.value = false
    executeApp(selectedAppForModal.value)
    return
  }

  isSubmitting.value = true
  // Filter out system-generated fields before submitting
  const submitData: Record<string, any> = {}
  currentFormSchema.value.forEach(field => {
    submitData[field.title] = modalFormData.value[field.title] || ''
    if (field.placeholder.includes(t('chat.systemGenerated'))) {
      delete submitData[field.title]
    }
  })

  let formattedData = ''
  for (const key in submitData) {
    if (Object.prototype.hasOwnProperty.call(submitData, key) && submitData[key]) {
      formattedData += `${key}: ${submitData[key]}\n`
    }
  }
  formattedData = formattedData.trim()

  executeApp(selectedAppForModal.value, formattedData)

  setTimeout(() => {
    showFormModal.value = false
    isSubmitting.value = false
  }, 300)
}

function showAppConfigModal(app: any, formSchema: FormField[]) {
  currentFormSchema.value = formSchema
  selectedAppForModal.value = app
  showFormModal.value = true
}

async function executeApp(app: any, appMessage?: string) {
  if (!app) return
  await ensureChatGroupInitialized()
  await chatStore.addNewChatGroup(Number(app.id))

  if (!appMessage) return

  await nextTick()
  const payload: Chat.ConversationParams = {
    msg: appMessage,
  }

  if (chatStore.active === Number(app.id)) {
    payload.appId = Number(app.id)
  }

  onConversation(payload)
}

// 方法定义
const handleScrollBtm = () => {
  scrollToBottom()
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

async function ensureChatGroupInitialized() {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }
}

const onConversation = async ({
  msg,
  action,
  drawId,
  customId,
  model,
  modelName,
  modelType,
  appId,
  extraParam,
  fileUrl,
  chatId,
  taskId,
  imageUrl,
  videoUrl,
  pptOutline,
  pptMode,
  selectedTheme,
  pluginParam,
}: Chat.ConversationParams & {
  pptOutline?: any
  pptMode?: string
  selectedTheme?: any
}) => {
  // 检查输入长度是否超过限制（读取后端配置，默认20000字符）
  const maxInputLength = Number(authStore.globalConfig?.maxInputLength) || 20000
  const currentInputLength = msg?.length || 0

  if (currentInputLength > maxInputLength) {
    ms.warning('输入内容过长，请精简后重试')
    return
  }

  await ensureChatGroupInitialized()
  // modelType
  // return

  if (chatId) {
    await chatStore.deleteChatsAfterId(chatId)
    componentKey.value += 1
  }
  chatStore.setStreamIn(true)
  let useModelName = modelName || activeModelName.value
  let useModelType = modelType || activeModelKeyType.value || 1

  // ✨ 对于创意类模型（图片、视频、通用创意），初始状态为 2（生成中）
  let useStatus = [2, 3, 6].includes(useModelType) ? 2 : 1

  const useAppId = appId || activeAppId.value
  let userMessage = msg || t('chat.askQuestion')

  let useModel = model || activeModel.value
  controller.value = new AbortController()

  // PPT生成插件应该使用当前选择的模型而不是插件参数
  if (usingPlugin.value?.parameters === 'ppt-generation') {
    useModel = activeModel.value
  } else if (usingPlugin.value?.deductType && usingPlugin.value?.deductType !== 0) {
    useModel = usingPlugin.value?.parameters
  }

  /* 增加一条用户记录 */
  addGroupChat({
    content: userMessage,
    model: useModel,
    modelName: modelName,
    modelType: useModelType,
    role: 'user',
    fileUrl: fileUrl || activeFileUrl.value || '',
    imageUrl: imageUrl || '',
    videoUrl: videoUrl || '',
    appId: useAppId,
  })

  // 检查模型的 isToolSupported 配置
  const toolSupport = configObj.value?.modelInfo?.isToolSupported || 0
  // isToolSupported: 0-不开启 1-前端显示开关(使用用户选择) 2-自动调用(强制启用)
  const actualUsingTool = toolSupport === 2 ? true : chatStore.usingTool

  // 检查是否支持文件上传（用于判断是否可以使用知识库）
  const isFilesModel = usingPlugin.value
    ? // 插件模式：检查插件的 uploadTypes
      (() => {
        if (!usingPlugin.value.uploadTypes) return false
        try {
          const types = usingPlugin.value.uploadTypes
            .split(',')
            .map((uploadType: string) => uploadType.trim().toLowerCase())
          return types.includes('file')
        } catch (error) {
          return false
        }
      })()
    : // 普通模式：检查模型的 isFileUpload
      Number(configObj.value?.modelInfo?.isFileUpload) !== 0

  let options: any = {
    groupId: +activeGroupId.value,
    fileParsing: fileParsing.value,
    usingDeepThinking: chatStore.usingDeepThinking,
    usingTool: actualUsingTool,
    // 只有支持文件上传时才发送知识库参数，否则强制关闭
    useKnowledgeBase: isFilesModel ? useGlobalStore.useKnowledgeBase : false,
  }

  // PPT生成时立即打开预览窗口（仅在生成完整PPT时）
  if (action === 'generate_ppt') {
    useGlobalStore.updatePptPreviewer(true, null) // 先打开空的预览窗口
  }

  /* 虚拟增加一条ai记录 */
  // PPT生成时应该显示工作流状态卡片
  // 多种方式判断是否是PPT生成
  const condition1 = usingPlugin.value?.parameters === 'ppt-generation'
  const condition2 = usingPlugin.value?.pluginName?.includes('PPT')
  const condition3 = usingPlugin.value?.pluginName?.includes('ppt')
  const condition4 = action === 'generate_ppt'
  const isPptGeneration = condition1 || condition2 || condition3 || condition4

  // PPT插件判断条件已记录

  // 确定 pluginParam：优先使用传入的参数，其次使用当前插件，最后对于 PPT 强制使用 ppt-generation
  let finalPluginParam = pluginParam || usingPlugin.value?.parameters
  if (isPptGeneration) {
    finalPluginParam = 'ppt-generation'
  }

  // 最终使用的pluginParam已确定

  addGroupChat({
    content: '',
    model: useModel,
    action: action || '',
    loading: true,
    modelName: useModelName,
    modelType: useModelType,
    role: 'assistant',
    error: false,
    status: useStatus,
    useFileSearch: !!(fileUrl || activeFileUrl.value) || isFlowith.value,
    fileUrl: fileUrl || activeFileUrl.value || '',
    // modelAvatar 不再存储，由 Avatar 组件根据插件/应用/模型动态获取
    pluginParam: finalPluginParam,
    usingDeepThinking: chatStore.usingDeepThinking,
    usingTool: actualUsingTool,
    appId: useAppId,
  })

  await scrollToBottom()
  const timer: any = null
  let data: any = null
  chatStore.setStreamIn(true)
  useGlobalStore.updateIsChatIn(true)

  // 处理额外参数
  const processedExtraParam = extraParam || {}

  // 消息去重集合 (基于 toolExecutionId + time)
  const processedToolExecutions = new Set<string>()

  const fetchChatAPIOnce = async () => {
    await handleStreamResponseModel()
  }

  const handleStreamResponseModel = async () => {
    // 响应数据存储变量
    let currentToolCalls = '' // 在函数开始定义，避免作用域问题
    let fullText = '' // 存储完整响应文本
    let fullContent = '' // 存储额外内容（如canvas内容）
    let individualToolStates = new Map() // 存储个别工具状态 Map<toolName, {status, tool_call}>
    let assistantLogId = ''
    let mcpToolUse = ''
    let streamError: any = null
    // let finishReason = '' // 完成原因标识
    let full_json = ''
    let latestAgentContent = '' // 保存最新的agent_content
    // 使用Map管理所有增量更新

    let mergedAgentData: any = {
      // 合并所有agent_content数据
      metadata: {},
      data: {
        toolExecutions: [],
        networkSearches: [], // Changed to array to store multiple searches
        fileAnalysis: null,
        custom: {},
      },
    }
    let tool_calls = '' // 工具调用数据

    // 缓冲区及显示控制变量
    let textBuffer = '' // 文本缓冲区
    let reasoningBuffer = '' // 推理文本缓冲区
    let displayedText = '' // 已显示的文本
    let displayedReasoningText = '' // 已显示的推理文本
    let fullReasoningText = '' // 完整推理文本
    let displayTimer: ReturnType<typeof setInterval> | null = null // 显示定时器
    let isStreamActive = true // 流是否活跃标记
    let lastUpdateTime = Date.now() // 最近一次数据更新时间

    // 图片相关变量
    let savedImageUrl = '' // 保存图片URL
    let savedImageContent = '' // 保存图片相关content
    let savedVideoUrl = '' // 保存视频URL

    // 检查是否启用了缓存和打字效果
    // const isCacheEnabled = useGlobalStore.isCacheEnabled
    const isCacheEnabled = isStreamCacheEnabled.value

    // 五档速度定义（单位：毫秒）
    const speedLevels = {
      // insane: 3, // 极速
      // ultraFast: 10, // 超超快速度
      veryFast: 20, // 超快速度
      fast: 30, // 快速
      normal: 40, // 正常速度
      slow: 50, // 慢速
      verySlow: 60, // 非常慢
      extremelySlow: 70, // 极慢（用于特殊情况）
    }

    // 五档速度定义（单位：毫秒）

    // 缓冲区大小阈值 - 基础值
    const baseBufferThresholds = {
      veryLarge: 50, // 非常大的缓冲区（超过200字符）
      large: 30, // 大缓冲区（100-200字符）
      medium: 8, // 中等缓冲区（50-100字符）
      small: 6, // 小缓冲区（20-50字符）
      verySmall: 3, // 非常小的缓冲区（5-20字符）
      // 少于5个字符视为几乎空
    }

    // 当前实际使用的缓冲区阈值
    let bufferThresholds = { ...baseBufferThresholds }

    // 用于平滑速度过渡的变量
    let targetSpeed = speedLevels.normal
    let currentSpeedTransition = speedLevels.normal
    const speedTransitionRate = 0.2 // 速度过渡系数：0-1之间，越大过渡越快

    // 更新缓冲区阈值 - 根据已接收的文本量动态调整
    const updateBufferThresholds = (receivedTextLength: number) => {
      // 根据已接收的文本长度动态调整阈值
      const scaleFactor = Math.min(Math.max(receivedTextLength / 500, 1), 3)

      bufferThresholds = {
        veryLarge: Math.round(baseBufferThresholds.veryLarge * scaleFactor),
        large: Math.round(baseBufferThresholds.large * scaleFactor),
        medium: Math.round(baseBufferThresholds.medium * scaleFactor),
        small: Math.round(baseBufferThresholds.small * scaleFactor),
        verySmall: baseBufferThresholds.verySmall, // 最小阈值保持不变
      }
    }

    // 启动显示定时器
    const startDisplayTimer = () => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不启动定时器

      if (displayTimer) clearInterval(displayTimer)

      displayTimer = setInterval(() => {
        updateDisplay()
      }, currentSpeedTransition)
    }

    // 根据缓冲区状态自适应调整显示速度
    const adjustDisplaySpeed = () => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不调整速度

      // 计算总缓冲区大小（text和reasoning共用一个缓冲池计算速度）
      const totalBufferLength = textBuffer.length + reasoningBuffer.length
      const totalReceivedLength = fullText.length + fullReasoningText.length
      const timeSinceLastUpdate = Date.now() - lastUpdateTime

      // 更新缓冲区阈值
      updateBufferThresholds(totalReceivedLength)

      // 根据总缓冲区大小选择目标速度档位
      // if (totalBufferLength >= bufferThresholds.veryLarge * 3) {
      //   targetSpeed = speedLevels.insane // 极速模式 3ms
      // } else if (totalBufferLength >= bufferThresholds.veryLarge * 2) {
      //   targetSpeed = speedLevels.ultraFast // 超超快 10ms
      // } else
      if (totalBufferLength >= bufferThresholds.veryLarge) {
        targetSpeed = speedLevels.veryFast
      } else if (totalBufferLength >= bufferThresholds.large) {
        targetSpeed = speedLevels.fast
      } else if (totalBufferLength >= bufferThresholds.medium) {
        targetSpeed = speedLevels.normal
      } else if (totalBufferLength >= bufferThresholds.small) {
        targetSpeed = speedLevels.slow
      } else if (totalBufferLength >= bufferThresholds.verySmall) {
        targetSpeed = speedLevels.verySlow
      } else {
        // 缓冲区几乎为空，检查是否长时间无更新
        if (timeSinceLastUpdate > 2000) {
          // 超过2秒无新数据，使用极慢速度
          targetSpeed = speedLevels.extremelySlow
        } else if (timeSinceLastUpdate > 1000) {
          // 超过1秒无新数据，使用非常慢的速度
          targetSpeed = speedLevels.verySlow
        }
      }

      // 如果流已经完全结束，使用最快速度
      if (textBuffer.length > 0 || reasoningBuffer.length > 0) {
        targetSpeed = speedLevels.veryFast // 改为使用极速模式
      }

      // 如果收到finishReason为stop，表示流已经结束，使用更快速度输出剩余内容
      // if (finishReason === 'stop' && (textBuffer.length > 0 || reasoningBuffer.length > 0)) {
      //   targetSpeed = speedLevels.veryFast // 改为使用超超快速度
      // }

      // 实现平滑速度过渡
      if (currentSpeedTransition !== targetSpeed) {
        // 使用线性插值实现平滑过渡
        currentSpeedTransition = Math.round(
          currentSpeedTransition * (1 - speedTransitionRate) + targetSpeed * speedTransitionRate
        )

        // 确保不低于3ms的最小显示间隔
        currentSpeedTransition = Math.max(currentSpeedTransition, 3)

        // 更新定时器间隔
        if (displayTimer) {
          clearInterval(displayTimer)
          displayTimer = setInterval(() => {
            updateDisplay()
          }, currentSpeedTransition)
        }
      }
    }

    // 更新显示内容
    const updateDisplay = (flushAll = false) => {
      if (!isCacheEnabled) return // 如果未启用缓存，则不使用缓存更新显示

      // 检查是否有内容需要显示
      const hasTextToDisplay = textBuffer.length > 0
      const hasReasoningToDisplay = reasoningBuffer.length > 0

      if (!hasTextToDisplay && !hasReasoningToDisplay) {
        // 如果没有新内容且流结束，清除定时器
        if (!isStreamActive) {
          if (displayTimer) clearInterval(displayTimer)
          displayTimer = null
        }
        return
      }

      // 根据当前速度和缓冲区大小动态获取应显示的字符数
      let charsToDisplay = 1
      const totalBufferSize = textBuffer.length + reasoningBuffer.length

      if (flushAll) {
        charsToDisplay = Math.max(textBuffer.length, reasoningBuffer.length, 1)
      } else {
        // 基础显示量 - 根据速度调整
        // if (currentSpeedTransition <= speedLevels.insane) {
        //   charsToDisplay = 10 // 极速模式显示更多字符
        // } else if (currentSpeedTransition <= speedLevels.ultraFast) {
        //   charsToDisplay = 8 // 超超快速度
        // } else
        if (currentSpeedTransition <= speedLevels.veryFast) {
          charsToDisplay = 5
        } else if (currentSpeedTransition <= speedLevels.fast) {
          charsToDisplay = 4
        } else if (currentSpeedTransition <= speedLevels.normal) {
          charsToDisplay = 3
        } else if (currentSpeedTransition <= speedLevels.slow) {
          charsToDisplay = 2
        } else {
          charsToDisplay = 1
        }

        // 根据缓冲区大小额外增加显示字符数
        if (totalBufferSize >= bufferThresholds.veryLarge * 3) {
          charsToDisplay = charsToDisplay * 6 // 缓冲区极大时，显示6倍字符
        } else if (totalBufferSize >= bufferThresholds.veryLarge * 2) {
          charsToDisplay = charsToDisplay * 5 // 缓冲区特大时，显示5倍字符
        } else if (totalBufferSize >= bufferThresholds.veryLarge) {
          charsToDisplay = charsToDisplay * 3 // 缓冲区大时，显示3倍字符
        } else if (totalBufferSize >= bufferThresholds.large) {
          charsToDisplay = charsToDisplay * 2 // 缓冲区中等时，显示2倍字符
        }

        // 为了保持平滑，限制每次最多显示字符数
        charsToDisplay = Math.min(charsToDisplay, 60) // 提高最多显示字符数上限
      }

      // 处理文本缓冲区
      if (hasTextToDisplay) {
        // 确保不超过缓冲区长度
        const textCharsToDisplay = flushAll
          ? textBuffer.length
          : Math.min(charsToDisplay, textBuffer.length)
        // 从缓冲区取出字符
        const nextTextChunk = textBuffer.slice(0, textCharsToDisplay)
        textBuffer = textBuffer.slice(textCharsToDisplay)

        displayedText += nextTextChunk
      }

      // 处理推理文本缓冲区
      if (hasReasoningToDisplay) {
        // 确保不超过缓冲区长度
        const reasoningCharsToDisplay = flushAll
          ? reasoningBuffer.length
          : Math.min(charsToDisplay, reasoningBuffer.length)
        // 从缓冲区取出字符
        const nextReasoningChunk = reasoningBuffer.slice(0, reasoningCharsToDisplay)
        reasoningBuffer = reasoningBuffer.slice(reasoningCharsToDisplay)

        displayedReasoningText += nextReasoningChunk
      }

      // 获取最新的工具调用状态（优先使用individual更新的结果）
      // currentToolCalls 已在函数开始定义
      if (individualToolStates.size > 0) {
        const toolStatesArray = Array.from(individualToolStates.values()).map(
          state => state.tool_call
        )
        currentToolCalls = JSON.stringify(toolStatesArray)
      }

      // 更新UI
      // 注意：这里每次都会带上latestAgentContent
      updateGroupChatSome(dataSources.value.length - 1, {
        chatId: Number(assistantLogId),
        content: displayedText,
        reasoningText: displayedReasoningText,
        mcpToolUse: mcpToolUse,
        modelType: useModelType,
        modelName: useModelName,
        error: false,
        loading: true,
        imageUrl: data?.imageUrl,
        agent_content: latestAgentContent, // 保留agent_content
      })

      // 滚动到底部（如果用户已经在底部）
      scrollToBottomIfAtBottom()

      // 根据缓冲区状态调整速度
      if (!flushAll) {
        adjustDisplaySpeed()
      }
    }

    // 如果启用了缓存打字效果，则启动显示定时器
    if (isCacheEnabled) {
      startDisplayTimer()
    }

    try {
      // 准备编辑器内容（如果处于编辑模式）
      // 只支持 MessageEditor（消息编辑）
      const editorContent = useGlobalStore.showMessageEditor
        ? {
            markdown: useGlobalStore.editingMessageContent || '',
            version: Date.now(), // 使用时间戳作为版本号
          }
        : undefined

      const requestData = {
        model: useModel,
        modelName: useModelName,
        modelType: useModelType,
        prompt: msg || ' ',
        usingPluginId: usingPlugin.value?.pluginId || 0,
        imageUrl: imageUrl || '',
        videoUrl: videoUrl || '',
        fileUrl: fileUrl || activeFileUrl.value || '',
        appId: useAppId || 0,
        options,
        action: action,
        taskId: taskId,
        drawId: drawId || '',
        customId: customId,
        extraParam: processedExtraParam,
        pptOutline: pptOutline,
        pptMode: pptMode,
        selectedTheme: selectedTheme,
        editorContent: editorContent,
        signal: controller.value.signal,
      }

      await fetchChatAPIProcess({
        ...requestData,
        onDownloadProgress: ({ event }) => {
          // 使用新的fetch流式处理
          const responseText = event.target.responseText

          // 确保工作流预览窗口是打开的

          // 记录最后更新时间
          lastUpdateTime = Date.now()

          try {
            // 尝试解析整个响应文本中的JSON对象
            // 注意：这里假设每个chunk都是一个完整的JSON对象，如果不是，可能需要更复杂的解析逻辑
            const jsonLines = responseText.split('\n').filter((line: string) => line.trim())

            jsonLines.forEach((line: string) => {
              try {
                const jsonObj = JSON.parse(line)

                if (jsonObj.error || jsonObj.finishReason === 'error') {
                  const errorMessage =
                    jsonObj.error || '模型服务暂时不可用，请稍后重试或联系管理员检查模型配置'
                  assistantLogId = jsonObj.chatId || assistantLogId
                  streamError = { message: errorMessage, status: jsonObj.status || 500 }
                  useStatus = 5
                  updateGroupChatSome(dataSources.value.length - 1, {
                    chatId: Number(assistantLogId),
                    content: errorMessage,
                    error: true,
                    loading: false,
                    status: 5,
                  })
                  return
                }

                // 处理文档编辑 diff（支持两种格式）
                if (jsonObj.edit_diff || jsonObj.data?.edit_diff) {
                  const editDiff = jsonObj.edit_diff || jsonObj.data.edit_diff

                  // 如果需要编辑且有变更
                  if (editDiff.needEdit && editDiff.changes && editDiff.changes.length > 0) {
                    try {
                      if (useGlobalStore.showMessageEditor) {
                        // MessageEditor: 通过事件发送diff，让编辑器自己处理动画
                        // 将diff保存到全局store，让MessageEditor通过watch获取
                        useGlobalStore.setPendingEditDiff(editDiff)
                      }
                    } catch (error) {}
                  }
                }

                // 处理PPT相关数据
                if (usingPlugin.value?.parameters === 'ppt-generation') {
                  // 处理PPT工作流节点状态
                  if (jsonObj.nodeType && jsonObj.nodeType.includes('ppt_')) {
                    // 移除冗余日志，仅在有PPT数据时记录

                    // 如果有PPT数据，构建agent_content
                    let agentContent = null
                    if (jsonObj.ppt) {
                      agentContent = JSON.stringify({
                        metadata: {
                          type: 'streaming',
                          timestamp: new Date().toISOString(),
                        },
                        data: {
                          ppt: jsonObj.ppt,
                        },
                      })
                    }

                    // 更新消息的工作流状态
                    if (dataSources.value.length > 0) {
                      const updateData: any = {
                        pluginParam: 'ppt-generation', // 确保设置了插件参数
                      }

                      // 如果有agent_content，更新它
                      if (agentContent) {
                        updateData.agent_content = agentContent
                        updateData.loading = jsonObj.ppt?.status === 'processing'
                      }

                      updateGroupChatSome(dataSources.value.length - 1, updateData)
                    }

                    // 将工作流状态传递到预览组件
                    const workflowUpdate: any = {
                      status: jsonObj.status,
                      statusMessage: jsonObj.statusMessage,
                      progress: jsonObj.progress,
                    }

                    // 处理流式PPT大纲
                    if (jsonObj.pptOutline) {
                      workflowUpdate.pptOutline = jsonObj.pptOutline
                      // 如果是流式更新，更新最后一条消息的大纲数据
                      if (jsonObj.status === 'streaming' && dataSources.value.length > 0) {
                        updateGroupChatSome(dataSources.value.length - 1, {
                          pptOutline: jsonObj.pptOutline,
                        })
                      }
                    }

                    // 处理流式PPT数据
                    if (jsonObj.pptData) {
                      workflowUpdate.pptData = jsonObj.pptData
                    }

                    useGlobalStore.updatePptWorkflowStatus(workflowUpdate)
                  }
                }

                // 旧的工作流状态更新处理 - 已整合到 agent_content 中
                // 保留用于向后兼容，但新的状态更新会通过 agent_content 传递
                if (jsonObj.workflowType && !jsonObj.agent_content) {
                  // 工作流状态更新 - 旧格式，建议升级

                  // 仍然处理旧格式以保持兼容性
                  if (dataSources.value.length > 0) {
                    const workflowUpdate: any = {
                      workflowType: jsonObj.workflowType,
                      workflowNodeId: jsonObj.nodeId,
                      workflowNodeStatus: jsonObj.nodeStatus,
                      workflowNodeMessage: jsonObj.nodeMessage,
                    }

                    if (jsonObj.nodeData) {
                      workflowUpdate.nodeData = jsonObj.nodeData
                    }

                    updateGroupChatSome(dataSources.value.length - 1, workflowUpdate)
                  }
                }

                // 处理用户余额
                if (jsonObj.userBalance) authStore.updateUserBalance(jsonObj.userBalance)

                // 处理内容
                if (jsonObj.content) {
                  fullContent += jsonObj.content
                  const newText = jsonObj.content[0].text
                  // .replace(/\\n/g, '\n')
                  // .replace(/\\t/g, '\t')

                  if (isCacheEnabled) {
                    // 将新文本添加到缓冲区和完整文本
                    textBuffer += newText
                    fullText += newText
                  } else {
                    // 直接将文本添加到显示文本，不经过缓冲区
                    fullText += newText
                    displayedText += newText

                    // 实时更新UI
                    updateGroupChatSome(dataSources.value.length - 1, {
                      chatId: Number(assistantLogId),
                      content: displayedText,
                      reasoningText: displayedReasoningText,
                      mcpToolUse: mcpToolUse,
                      modelType: useModelType,
                      modelName: useModelName,
                      error: false,
                      loading: true,
                      imageUrl: data?.imageUrl,
                      agent_content: latestAgentContent, // 保留agent_content
                    })

                    // 滚动到底部
                    scrollToBottomIfAtBottom()
                  }
                }

                // 处理其他属性
                if (jsonObj.reasoning_content) {
                  fullContent += jsonObj.reasoning_content
                  const newText = jsonObj.reasoning_content[0].text
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')

                  if (isCacheEnabled) {
                    reasoningBuffer += newText
                    fullReasoningText += newText
                  } else {
                    fullReasoningText += newText
                    displayedReasoningText += newText

                    // 实时更新UI
                    updateGroupChatSome(dataSources.value.length - 1, {
                      chatId: Number(assistantLogId),
                      content: displayedText,
                      reasoningText: displayedReasoningText,
                      mcpToolUse: mcpToolUse,
                      modelType: useModelType,
                      modelName: useModelName,
                      error: false,
                      loading: true,
                      imageUrl: data?.imageUrl,
                      status: useStatus,
                      // modelAvatar 不再存储，由 Avatar 组件动态获取
                      agent_content: latestAgentContent, // 保留agent_content
                    })

                    // 滚动到底部
                    scrollToBottomIfAtBottom()
                  }
                }

                // 处理agent_content统一字段
                if (jsonObj.agent_content) {
                  try {
                    const agentData = JSON.parse(jsonObj.agent_content)

                    // 所有数据都使用统一格式：包含 metadata 和 data
                    if (!agentData.metadata || !agentData.data) {
                      return
                    }

                    // 特殊处理PPT数据 - 立即更新到消息中
                    if (agentData.data?.ppt && usingPlugin.value?.parameters === 'ppt-generation') {
                      // 收到PPT agent_content
                      const pptData = agentData.data.ppt

                      // 保存最新的agent_content到latestAgentContent
                      latestAgentContent =
                        typeof jsonObj.agent_content === 'string'
                          ? jsonObj.agent_content
                          : JSON.stringify(jsonObj.agent_content)

                      // 保存PPT agent_content到latestAgentContent

                      const updateData: any = {
                        agent_content: latestAgentContent, // 使用保存的值
                        pluginParam: 'ppt-generation',
                        loading: pptData.status === 'processing',
                        // 保留现有的content内容，不要清空
                        content: displayedText || '',
                      }

                      // 根据PPT状态更新loading状态
                      if (pptData.status === 'completed') {
                        updateData.loading = false
                      }

                      // 立即更新消息，但保留content内容
                      updateGroupChatSome(dataSources.value.length - 1, updateData)
                    }

                    // 统一处理所有格式 - 直接合并数据
                    // 判断是增量更新还是完整数据

                    // 合并工具执行数据 (带状态优先级判断和去重)
                    if (agentData.data?.toolExecutions?.length > 0) {
                      // 过滤掉已处理的工具执行 (基于 id + time 去重)
                      const newExecutions = agentData.data.toolExecutions.filter((exec: any) => {
                        if (!exec.id) return false
                        const uniqueKey = `${exec.id}_${exec.time}`
                        if (processedToolExecutions.has(uniqueKey)) {
                          return false
                        }
                        processedToolExecutions.add(uniqueKey)
                        return true
                      })

                      // 如果所有执行都被过滤掉,跳过
                      if (newExecutions.length === 0) {
                        // 所有工具执行已被处理,跳过此次更新
                      } else {
                        // 使用Map来合并工具执行，避免重复
                        const toolExecMap = new Map()

                        // 先添加现有的
                        if (mergedAgentData.data.toolExecutions) {
                          mergedAgentData.data.toolExecutions.forEach((exec: any) => {
                            if (exec.id) {
                              toolExecMap.set(exec.id, exec)
                            }
                          })
                        }

                        // 更新或添加新的 (带状态优先级检查)
                        newExecutions.forEach((exec: any) => {
                          if (exec.id) {
                            const existing = toolExecMap.get(exec.id)
                            const newPriority = getToolStatusPriority(exec.status)
                            const existingPriority = getToolStatusPriority(existing?.status)

                            // 只有新状态优先级更高时才更新,防止状态回退
                            if (!existing || newPriority > existingPriority) {
                              toolExecMap.set(exec.id, exec)
                            }
                          }
                        })

                        mergedAgentData.data.toolExecutions = Array.from(toolExecMap.values())
                      }
                    }

                    // 合并其他数据字段
                    if (agentData.data?.networkSearches) {
                      mergedAgentData.data.networkSearches = agentData.data.networkSearches
                    }
                    if (agentData.data?.fileAnalysis) {
                      mergedAgentData.data.fileAnalysis = agentData.data.fileAnalysis
                    }
                    if (agentData.data?.custom) {
                      mergedAgentData.data.custom = {
                        ...mergedAgentData.data.custom,
                        ...agentData.data.custom,
                      }
                    }

                    // 合并元数据
                    if (agentData.metadata) {
                      mergedAgentData.metadata = {
                        ...mergedAgentData.metadata,
                        ...agentData.metadata,
                      }
                    }

                    // 保存最新的合并数据
                    latestAgentContent = JSON.stringify({
                      metadata: mergedAgentData.metadata || agentData.metadata,
                      data: mergedAgentData.data,
                    })

                    // 立即更新消息
                    if (dataSources.value.length > 0) {
                      updateGroupChatSome(dataSources.value.length - 1, {
                        agent_content: latestAgentContent,
                      })
                    }

                    // 检查是否是工作流状态更新
                    if (
                      agentData.metadata?.type === 'workflow_status' &&
                      agentData.data?.currentStatus
                    ) {
                      const status = agentData.data.currentStatus

                      // 更新消息的工作流状态显示
                      if (dataSources.value.length > 0) {
                        const workflowUpdate: any = {
                          workflowType: status.workflowType,
                          workflowNodeId: status.nodeId,
                          workflowNodeStatus: status.nodeStatus,
                          workflowNodeMessage: status.nodeMessage,
                          workflowHistory: agentData.data.workflowStatus || [],
                        }

                        // 处理不同工作流类型的特定数据
                        if (status.workflowType === 'search' && status.nodeData) {
                          if (status.nodeData.searchPlan) {
                            workflowUpdate.searchPlan = status.nodeData.searchPlan
                          }
                          if (status.nodeData.currentQuery) {
                            workflowUpdate.currentSearchQuery = status.nodeData.currentQuery
                          }
                        }

                        // 可以在这里更新全局状态或显示组件
                        // useGlobalStore.updateWorkflowStatus(workflowUpdate)
                      }
                    }

                    // 提取PPT数据 - 使用新的统一格式（如果还没处理过）
                    if (agentData.data?.ppt && !usingPlugin.value?.parameters) {
                      // 统一使用agent_content传递PPT数据
                      const agentContentToSave =
                        typeof jsonObj.agent_content === 'string'
                          ? jsonObj.agent_content
                          : JSON.stringify(jsonObj.agent_content)

                      // 保存到latestAgentContent以确保流结束时不会丢失
                      latestAgentContent = agentContentToSave

                      // 只有PPT插件才特殊处理，普通消息不处理
                      if (usingPlugin.value?.parameters === 'ppt-generation') {
                        updateGroupChatSome(dataSources.value.length - 1, {
                          // PPT生成时不显示文本内容，显示PPT卡片
                          content: '',
                          pluginParam: 'ppt-generation',
                          agent_content: agentContentToSave, // 保存完整的agent_content
                          loading: agentData.data.ppt.status === 'processing', // 根据状态控制loading
                        })

                        // 如果PPT主题已完成，确保loading状态为false
                        if (
                          agentData.data.ppt.status === 'completed' &&
                          agentData.data.ppt.type === 'theme'
                        ) {
                          // PPT主题已完成，设置loading为false
                          // 延迟一下确保状态更新
                          nextTick(() => {
                            updateGroupChatSome(dataSources.value.length - 1, {
                              loading: false,
                            })
                          })
                        }

                        // 验证更新是否成功

                        // PPT生成时清空文本内容，避免显示JSON数据
                        displayedText = ''
                        fullText = ''
                      }

                      // 如果是完整PPT且已完成，更新预览窗口数据
                      if (
                        agentData.data.ppt.type === 'complete' &&
                        agentData.data.ppt.status === 'completed' &&
                        agentData.data.ppt.output?.pptData
                      ) {
                        useGlobalStore.updatePptPreviewer(true, agentData.data.ppt.output.pptData)
                      }
                    }

                    // 提取工具调用 - 并合并到mergedAgentData
                    if (agentData.data?.toolCalls) {
                      tool_calls =
                        typeof agentData.data.toolCalls === 'string'
                          ? agentData.data.toolCalls
                          : JSON.stringify(agentData.data.toolCalls)
                      // 重要：将toolCalls合并到mergedAgentData
                      mergedAgentData.data.toolCalls = agentData.data.toolCalls
                    }

                    // 提取MCP工具使用
                    if (agentData.data?.custom?.mcpToolResults) {
                      mcpToolUse = agentData.data.custom.mcpToolResults
                    }

                    // 重要：保存合并后的agent_content到消息中
                    const mergedAgentContent = JSON.stringify(mergedAgentData)

                    // 检查当前消息是否已有PPT数据，如果有且新数据没有PPT，则保留原有的PPT数据
                    const currentMessage = dataSources.value[dataSources.value.length - 1]
                    let finalAgentContent = mergedAgentContent

                    if (currentMessage?.agent_content) {
                      try {
                        const currentAgentData = JSON.parse(currentMessage.agent_content)
                        // 如果当前有PPT数据，而新的没有，保留原有的PPT数据
                        if (currentAgentData?.data?.ppt && !mergedAgentData.data.ppt) {
                          mergedAgentData.data.ppt = currentAgentData.data.ppt
                          finalAgentContent = JSON.stringify(mergedAgentData)
                          // 保留原有PPT数据，避免被覆盖
                        }
                      } catch (e) {
                        // 忽略解析错误
                      }
                    }

                    latestAgentContent = finalAgentContent // 保存合并后的数据

                    // 立即更新到消息中
                    updateGroupChatSome(dataSources.value.length - 1, {
                      agent_content: finalAgentContent,
                      tool_calls: tool_calls, // 同时更新tool_calls
                    })

                    // 验证是否成功保存
                    const currentMsg = dataSources.value[dataSources.value.length - 1]
                    if (currentMsg?.agent_content === mergedAgentContent) {
                    } else {
                      // 验证失败
                    }
                  } catch (e) {
                    // Agent更新：解析agent_content失败
                  }
                }

                // 处理单个工具状态更新
                if (jsonObj.tool_calls_individual) {
                  const { tool_call, status } = jsonObj.tool_calls_individual
                  const toolId = tool_call.id || tool_call.function?.name || 'unknown'
                  // const toolName = tool_call.function?.name
                  if (toolId) {
                    // 使用工具ID作为唯一键，避免同名工具覆盖
                    individualToolStates.set(toolId, { status, tool_call })

                    // 重新构建tool_calls数组，包含最新的个别工具状态
                    const toolStatesArray = Array.from(individualToolStates.values()).map(
                      state => state.tool_call
                    )
                    tool_calls = JSON.stringify(toolStatesArray)

                    // 立即更新UI显示
                    updateGroupChatSome(dataSources.value.length - 1, {
                      chatId: Number(assistantLogId),
                      reasoningText: displayedReasoningText,
                      content: displayedText,
                      mcpToolUse: mcpToolUse,
                      modelType: useModelType,
                      modelName: useModelName,
                      error: false,
                      loading: false,
                      agent_content: latestAgentContent, // 保留agent_content
                    })
                  }
                }

                if (jsonObj.chatId) {
                  assistantLogId = jsonObj.chatId
                  // assistantLogId
                }
                if (jsonObj.modelType) useModelType = jsonObj.modelType
                if (jsonObj.modelName) useModelName = jsonObj.modelName

                // 保存图片相关数据
                if (jsonObj.imageUrl) savedImageUrl = jsonObj.imageUrl
                if (jsonObj.videoUrl) savedVideoUrl = jsonObj.videoUrl
                if (jsonObj.content && (useModelType === 2 || useModelType === 6))
                  savedImageContent = jsonObj.content
                if (jsonObj.status) {
                  // 确保 status 是数字类型
                  if (typeof jsonObj.status === 'number') {
                    useStatus = jsonObj.status
                  } else if (typeof jsonObj.status === 'string') {
                    // 字符串状态映射到数字
                    const statusMap: Record<string, number> = {
                      starting: 2,
                      processing: 2,
                      generating: 2,
                      streaming: 2,
                      reasoning: 2,
                      completed: 3,
                      success: 3,
                      failed: 4,
                      error: 4,
                      aborted: 5,
                      abort: 5,
                    }

                    if (statusMap[jsonObj.status]) {
                      useStatus = statusMap[jsonObj.status]
                    } else if (!isNaN(Number(jsonObj.status))) {
                      useStatus = Number(jsonObj.status)
                    } else {
                      // 未识别的 status
                      // 默认为处理中状态
                      useStatus = 2
                    }
                  }
                }
                if (jsonObj.full_json) {
                  full_json = jsonObj.full_json
                  // 保存到全局store
                  useGlobalStore.updateFullJson(full_json)

                  // 处理编辑器操作
                  useGlobalStore.updateTextEditor(true)
                  setTimeout(() => {
                    applyEditorOperations(full_json)
                  }, 300)
                }
                // if (jsonObj.finishReason) finishReason = jsonObj.finishReason

                // 滚动到底部
                scrollToBottomIfAtBottom()
              } catch (error) {
                // JSON解析错误，忽略该行
              }
            })
          } catch (error) {
            // 整体解析错误，忽略
          }
        },
      })
    } catch (error) {
      // error occurred during stream processing
      streamError = error
    } finally {
      // 标记流已结束
      isStreamActive = false

      // 处理缓存相关逻辑
      if (isCacheEnabled) {
        if (displayTimer) {
          clearInterval(displayTimer)
          displayTimer = null
        }
        if (textBuffer.length > 0 || reasoningBuffer.length > 0) {
          updateDisplay(true)
        }
      }

      if (streamError) {
        handleStreamError(streamError)
        await authStore.getUserBalance().catch(() => {})
        await chatStore.queryMyGroup().catch(() => {})
        return
      }

      // 确保显示完整文本
      displayedText = fullText
      displayedReasoningText = fullReasoningText

      // 获取当前消息，保留已设置的PPT数据
      const currentMessage = dataSources.value[dataSources.value.length - 1]

      // 重要：优先使用流式传输中保存的最新agent_content，否则使用当前消息的
      let savedAgentContent = latestAgentContent || currentMessage?.agent_content

      // 特殊处理：确保PPT数据不会丢失
      if (savedAgentContent && currentMessage?.agent_content) {
        try {
          const savedData = JSON.parse(savedAgentContent)
          const currentData = JSON.parse(currentMessage.agent_content)

          // 如果当前消息有PPT数据但新的agent_content没有，合并PPT数据
          if (currentData?.data?.ppt && !savedData?.data?.ppt) {
            savedData.data = savedData.data || {}
            savedData.data.ppt = currentData.data.ppt
            savedAgentContent = JSON.stringify(savedData)
            // 流结束时保留PPT数据
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      // 如果已经有PPT数据，不要用文本内容覆盖
      // 对于图片模型和通用创意模型，优先使用保存的content
      let finalContent = displayedText
      if ((useModelType === 2 || useModelType === 6) && savedImageContent) {
        finalContent = savedImageContent
      } else if (currentMessage?.pptTheme || currentMessage?.pptOutline) {
        finalContent = ''
      }

      updateGroupChatSome(dataSources.value.length - 1, {
        chatId: Number(assistantLogId),
        content: finalContent,
        reasoningText: displayedReasoningText,
        mcpToolUse: mcpToolUse,
        modelType: useModelType,
        status: useStatus,
        // modelAvatar 不再存储，由 Avatar 组件动态获取
        modelName: useModelName,
        error: false,
        loading: true,
        imageUrl: savedImageUrl,
        videoUrl: savedVideoUrl,
      })

      // 验证更新后的状态
      const afterUpdate = dataSources.value[dataSources.value.length - 1]
      if (afterUpdate?.agent_content !== savedAgentContent) {
      }

      // 延迟一段时间后再结束loading状态
      await new Promise(resolve => setTimeout(resolve, 300))

      // 清理工作前，再次检查agent_content

      // 清理工作
      useGlobalStore.updateIsChatIn(false)

      // 检查queryMyGroup前后的状态
      const beforeQueryGroup = dataSources.value[dataSources.value.length - 1]

      await chatStore.queryMyGroup()

      const afterQueryGroup = dataSources.value[dataSources.value.length - 1]
      if (beforeQueryGroup?.agent_content !== afterQueryGroup?.agent_content) {
      }

      updateGroupChatSome(dataSources.value.length - 1, {
        loading: false,
        agent_content: savedAgentContent, // 确保agent_content不被覆盖
        tool_calls: currentToolCalls, // 保留工具调用数据
      })
      updateGroupChatSome(dataSources.value.length - 2, {
        chatId: Number(assistantLogId) - 1,
      })

      // 服务端流中会推送余额；再读取一次权威接口作为断流和并发场景的兜底。
      await authStore.getUserBalance().catch(() => {})
    }
  }

  const handleStreamError = (error: any) => {
    // fetchChatAPIProcess error
    useGlobalStore.updateIsChatIn(false)
    // clearInterval已定义的timer变量，如果不存在则不执行
    if (timer) clearInterval(timer)
    chatStore.setStreamIn(false)

    // 获取错误信息，兼容新旧错误格式
    const errorMessage = error?.message || ''
    const errorStatus = error?.status || error?.message?.code || 0

    // 取消请求的情况特殊处理（包括用户主动暂停）
    if (
      errorMessage.includes('canceled') ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('abort') ||
      errorMessage.toLowerCase().includes('streambuffer') ||
      errorMessage.toLowerCase().includes('bodystream') ||
      error?.name === 'AbortError'
    ) {
      updateGroupChatSome(dataSources.value.length - 1, { loading: false })
      scrollToBottomIfAtBottom()
      setTimeout(() => {
        authStore.getUserBalance()
      }, 200)
      return
    }

    // 标记是否已处理错误
    let errorHandled = false

    // 其他错误情况的处理逻辑
    if (errorStatus === 402 || errorMessage.includes('不足') || errorMessage.includes('使用完毕')) {
      errorHandled = true
      if (!isLogin.value) {
        ms.error(t('chat.balanceInsufficient'))
        authStore.setLoginDialog(true)
      } else {
        ms.error(t('chat.balanceInsufficientWithLogin'))
        if (isMobile.value) {
          useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
        } else {
          useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
        }
      }
    }

    if (errorMessage.includes('手机号绑定')) {
      errorHandled = true
      if (!isLogin.value) {
        ms.error(t('chat.phoneNotBound'))
        authStore.setLoginDialog(true)
      } else {
        ms.error(t('chat.phoneNotBound'))
        if (isMobile.value) {
          useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.ACCOUNT)
        } else {
          useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
        }
      }
    }

    if (errorMessage.includes('实名认证')) {
      errorHandled = true
      if (!isLogin.value) {
        ms.error(t('chat.realNameAuthRequired'))
        authStore.setLoginDialog(true)
      } else {
        ms.error(t('chat.realNameAuthRequired'))
        if (isMobile.value) {
          useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.ACCOUNT)
        } else {
          useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
        }
      }
    }

    if (errorMessage.includes('违规') || errorMessage.includes('合规')) {
      errorHandled = true
      // 打开违规对话框
      useGlobalStore.UpdateBadWordsDialog(true)
    }

    if (errorMessage.includes('会员专属')) {
      errorHandled = true
      ms.error(t('chat.memberExclusive'))
      if (isMobile.value) {
        useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
      } else {
        useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
      }
    }

    // 如果错误未被特定处理，显示通用错误消息
    if (!errorHandled && errorMessage) {
      // 如果是401未授权错误，提示登录
      if (errorStatus === 401 || errorMessage.includes('未登录') || errorMessage.includes('登录')) {
        ms.error('请先登录')
        authStore.setLoginDialog(true)
      } else {
        // 显示具体的错误消息或默认消息
        ms.error(errorMessage || '发生错误，请稍后重试')
      }
    }

    // 获取当前对话并更新状态
    const currentChat = dataSources.value[dataSources.value.length - 1]
    if (currentChat) {
      updateGroupChatSome(dataSources.value.length - 1, {
        error: true,
        loading: false,
      })

      scrollToBottomIfAtBottom()
    }
  }

  await fetchChatAPIOnce()
  chatStore.setStreamIn(false)

  // 延迟5秒
  await new Promise(resolve => setTimeout(resolve, 300))
  // await chatStore.queryActiveChatLogList();
  scrollToBottomIfAtBottom(300)
}

// 停止回复
const pauseRequest = () => {
  controller.value.abort()
  chatStore.setStreamIn(false)
  setTimeout(scrollToBottom, 1000)
}

// 其他登录方式
const otherLoginByToken = async (loginToken: string) => {
  try {
    // 设置用户 token
    authStore.setToken(loginToken)

    // 显示成功消息
    ms.success(t('chat.loginSuccessful'))

    // 获取用户信息
    await authStore.getUserInfo()
  } catch (error) {
    // 错误处理
    // Login error
  }
}

// 支付回调处理
const handleRefresh = async () => {
  // 检查交易状态是否成功
  if (tradeStatus.value.toLowerCase().includes('success')) {
    // 显示成功消息
    ms.success(t('chat.purchaseSuccessful'), { duration: 5000 })

    // 获取用户信息
    await authStore.getUserInfo()
  } else {
    // 显示错误消息
    ms.error(t('chat.purchaseNotSuccessful'))
  }

  // 清理URL中的支付回调参数（避免敏感信息暴露）
  const newUrl = window.location.pathname + window.location.hash
  window.history.replaceState({}, document.title, newUrl)
}

// 删除
const handleDelete = async ({ chatId }: Chat.Chat) => {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      await chatStore.deleteChatById(chatId)
      componentKey.value += 1
      ms.success(t('chat.deleteSuccess'))
    },
  })
}

const handleRegenerate = async (index: number, chatId: number, options?: any) => {
  if (chatStore.groupList.length === 0 || index === 0) return
  let regenerateMessage = ''
  let imageUrl = ''
  let fileUrl = ''

  /* 处理PPT相关的特殊操作 */
  let pptOutline = null
  let action: string | undefined = undefined

  if (options?.action === 'regenerate_outline') {
    // 重新生成大纲：使用原始消息
    const { content } = dataSources.value[index - 2] // 获取用户消息
    regenerateMessage = content || ''
    action = 'regenerate_outline'
  } else if (options?.action === 'generate_ppt') {
    // 基于大纲生成PPT：从 agent_content 中获取大纲数据
    const assistantMessage = dataSources.value[index - 1]

    // 从 agent_content 中解析 pptOutline
    if (assistantMessage.agent_content) {
      try {
        const agentData = JSON.parse(assistantMessage.agent_content)
        if (agentData.data?.ppt?.outline) {
          pptOutline = agentData.data.ppt.outline
        }
      } catch (e) {
        // 解析agent_content失败
      }
    }

    // 回退到直接解析 content 字段
    if (!pptOutline && assistantMessage.content) {
      try {
        const parsed = JSON.parse(assistantMessage.content)
        if (parsed.pptOutline) {
          pptOutline = parsed.pptOutline
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    if (pptOutline) {
      regenerateMessage = dataSources.value[index - 2].content || '' // 使用原始用户消息
      action = 'generate_ppt'
    } else {
      // 未找到PPT大纲数据
      return
    }
  } else {
    /* 普通的重新生成 */
    if (index && typeof index === 'number') {
      const { content, role } = dataSources.value[index - 1]
      imageUrl = dataSources.value[index - 1].imageUrl || ''
      fileUrl = dataSources.value[index - 1].fileUrl || ''
      if (content) {
        regenerateMessage = content
      }
      if (role === 'assistant') {
        return
      }
    }
  }

  onConversation({
    msg: regenerateMessage,
    chatId: chatId - 1,
    imageUrl: imageUrl,
    fileUrl: fileUrl,
    action: action,
    pptOutline: pptOutline,
  })
  scrollToBottom()
}

// 加载预设数据
async function loadPresets() {
  try {
    presetLoading.value = true
    const res = await fetchUserPresetsAPI()
    if (res.data && res.data.presets) {
      presetData.value = res.data.presets
      // 提取分类
      const categories = new Set(['全部'])
      res.data.presets.forEach((preset: any) => {
        if (preset.category) {
          categories.add(preset.category)
        }
      })
      presetCategories.value = Array.from(categories)
    }
  } catch (error) {
  } finally {
    presetLoading.value = false
  }
}

async function handleClick(box: {
  appId?: number
  prompt: any
  pluginParameters?: string
  id?: number
}) {
  chatStore.setPrompt('')

  if (!box.appId || box.appId <= 0) {
    chatStore.setUsingPlugin(null)
    if (footerRef.value) {
      footerRef.value.clearSelectApp()
    }
  }

  if (groupSources.value.length === 0) {
    await createNewChatGroup()
  }

  if (box.appId && box.appId > 0) {
    try {
      const apps = appCatStore.allApps
      const targetApp = apps.find((app: any) => app.id === box.appId)

      if (targetApp && footerRef.value) {
        footerRef.value.selectApp(targetApp)

        if (box.prompt) {
          await nextTick()
          chatStore.setPrompt(box.prompt)
        }
      }
    } catch (error) {
      // 应用激活失败
    }
  } else {
    if (box.pluginParameters) {
      const plugin = chatStore.pluginList?.find((p: any) => p.parameters === box.pluginParameters)
      if (plugin) {
        chatStore.setUsingPlugin(plugin)
      }
    }

    await nextTick()
    chatStore.setPrompt(box.prompt)
  }

  if (box.id) {
    incrementPresetUsageAPI(box.id).catch(() => {})
  }
}

const toggleAppList = () => {
  useGlobalStore.updateShowAppListComponent(!useGlobalStore.showAppListComponent)
}

const toggleTextEditor = () => {
  useGlobalStore.updateTextEditor(!useGlobalStore.showTextEditor)
}

async function handleRunAppFromList(app: any) {
  showAppListComponent.value = false
  await chatStore.addNewChatGroup(Number(app.id))
}

function handleShowMemberDialogFromList() {
  useGlobalStore.updateShowAppListComponent(false)
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
}

async function handleRunAppWithData({ app, formattedData }: { app: any; formattedData: string }) {
  useGlobalStore.updateShowAppListComponent(false)
  await chatStore.addNewChatGroup(Number(app.id))
  await nextTick()

  if (chatStore.active === Number(app.id)) {
    onConversation({ msg: formattedData, appId: Number(app.id) })
  } else {
    onConversation({ msg: formattedData })
  }
}

async function fetchCurrentAppDetail(appId: number) {
  if (!appId) return
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId })
    currentAppDetail.value = res.data
  } catch (error) {
    currentAppDetail.value = null
  }
}

const applyEditorOperations = (jsonString: string) => {
  if (!jsonString || !textEditorRef.value) return

  try {
    const operationsData = JSON.parse(jsonString)

    if (!operationsData.operations || !Array.isArray(operationsData.operations)) {
      return
    }

    const currentLines = textEditorRef.value.linesInfo
    let isContentModified = false

    for (const operation of operationsData.operations) {
      const { type, lineNumber, newContent } = operation

      if (!lineNumber || typeof lineNumber !== 'number') {
        continue
      }

      switch (type) {
        case 'replace':
          if (currentLines[lineNumber] !== undefined) {
            currentLines[lineNumber] = newContent
            isContentModified = true
          }
          break

        case 'insert':
          const newLines: { [key: number]: string } = {}

          for (let i = 1; i < lineNumber; i++) {
            if (currentLines[i] !== undefined) {
              newLines[i] = currentLines[i]
            }
          }

          newLines[lineNumber] = newContent

          for (let i = lineNumber; i <= Object.keys(currentLines).length; i++) {
            if (currentLines[i] !== undefined) {
              newLines[i + 1] = currentLines[i]
            }
          }

          Object.assign(currentLines, newLines)
          isContentModified = true
          break

        case 'delete':
          if (currentLines[lineNumber] !== undefined) {
            for (let i = lineNumber; i < Object.keys(currentLines).length; i++) {
              currentLines[i] = currentLines[i + 1]
            }
            delete currentLines[Object.keys(currentLines).length]
            isContentModified = true
          }
          break

        default:
      }
    }

    if (isContentModified) {
      let newText = ''
      const lineCount = Object.keys(currentLines).length

      for (let i = 1; i <= lineCount; i++) {
        if (currentLines[i] !== undefined) {
          newText += currentLines[i]
          if (i < lineCount) {
            newText += '\n'
          }
        }
      }

      useGlobalStore.updateHtmlContent(newText)
    }
  } catch (error) {
    ms.error('应用编辑操作失败')
  }
}

// 依赖注入
provide('onConversation', onConversation)
provide('handleRegenerate', handleRegenerate)
defineExpose({ toggleAppList, toggleTextEditor })

// 打开图片预览器
function openImagePreviewer(imageUrls: string[], initialIndex: number, mjData?: any) {
  if (!sideDrawingEditModel.value) {
    // 普通模式：单图预览，点击哪张就预览哪张
    openImageViewer({
      imageUrl: imageUrls[initialIndex] || imageUrls[0],
      fileName: imageUrls[initialIndex] || imageUrls[0],
    })
  } else {
    // 侧边编辑模式：使用侧边预览器，支持多图和主图切换
    useGlobalStore.updateImagePreviewer(true, imageUrls, initialIndex, mjData)
  }
}

// 媒体预览相关
const isMediaSidebarVisible = ref(false)
const mediaPreviewData = ref<any>(null)

const handleMediaPreview = (data: any) => {
  // 根据媒体类型使用不同的预览器
  if (data.type === 'image') {
    openImagePreviewer(data.urls || [], data.initialIndex || 0, data.metadata)
  } else if (data.type === 'video') {
    useGlobalStore.updateVideoPreviewer(true, data.urls?.[0] || '', data.title || '')
  } else {
    // 其他类型使用通用媒体侧边栏
    mediaPreviewData.value = data
    isMediaSidebarVisible.value = true
  }
}

const handleMediaEdit = () => {
  // 处理媒体编辑
  // 可以打开特定的编辑器或调用相应的API
}

const handleMediaRegenerate = () => {
  // 处理重新生成
  // 调用重新生成的API
}

// 提供打开图片预览器方法给子组件
provide('onOpenImagePreviewer', openImagePreviewer)
provide('onMediaPreview', handleMediaPreview)

// 处理侧边面板的问题提问
const handleSidePanelQuestion = (prompt: string) => {
  // 关闭当前打开的预览器
  // useGlobalStore.updateMarkdownPreviewer(false)

  // 发起对话
  onConversation({ msg: prompt })
}

// 移除未使用的PPT特殊操作处理函数
// handleRegenerateOutline和handleGeneratePpt的逻辑已经集成到handleRegenerate中

// 提供弹窗相关方法给子组件
provide('showAppConfigModal', showAppConfigModal)
provide('tryParseJson', tryParseJson)
</script>

<template>
  <div class="flex h-full w-full">
    <Sider class="h-full" />
    <div class="flex h-full w-full flex-1">
      <!-- Main container flex -->
      <div
        class="relative overflow-hidden h-full flex flex-col transition-all duration-300 ease-in-out transform"
        :class="{
          'w-2/5':
            (isHtmlPreviewerVisible ||
              isImagePreviewerVisible ||
              isMarkdownPreviewerVisible ||
              isPptPreviewerVisible ||
              isMessageEditorVisible) &&
            !isMobileHtmlFullscreen, // Adjust width for desktop
          'w-full':
            !isHtmlPreviewerVisible &&
            !isImagePreviewerVisible &&
            !isMarkdownPreviewerVisible &&
            !isPptPreviewerVisible &&
            !isMessageEditorVisible, // Full width when nothing is showing
          'w-0 opacity-0': isMobileHtmlFullscreen, // Hide completely on mobile when HTML previewer is visible
        }"
      >
        <!-- Background Image Layer -->
        <div
          v-if="activeChatBackgroundImg"
          class="absolute inset-0 z-0 opacity-30 pointer-events-none"
          :style="{
            backgroundImage: `url(${activeChatBackgroundImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }"
        ></div>

        <!-- Header - Conditional Background with 50% opacity on image -->
        <HeaderComponent
          :class="[
            'relative z-30 flex-shrink-0',
            activeChatBackgroundImg && !useGlobalStore.showAppListComponent
              ? 'bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm' // 50% opacity when image exists
              : 'bg-white dark:bg-gray-800 backdrop-blur-sm', // Default opacity otherwise
          ]"
          @toggle-app-list="toggleAppList"
        />

        <!-- Conditional Content - Keep original non-transparent backgrounds for these -->
        <template v-if="useGlobalStore.externalLinkDialog">
          <ExternalLinkComponent class="relative z-10 flex-1 bg-white dark:bg-gray-900" />
        </template>
        <template v-else-if="useGlobalStore.showAppListComponent">
          <AppList
            class="relative z-10 flex-1 overflow-hidden bg-white dark:bg-gray-900"
            @run-app="handleRunAppFromList"
            @show-member-dialog="handleShowMemberDialogFromList"
            @run-app-with-data="handleRunAppWithData"
          />
        </template>
        <template v-else>
          <!-- Main Chat Area - Add relative z-10 -->
          <main v-if="dataSources.length" class="relative z-10 flex-1 overflow-hidden">
            <div
              id="scrollRef"
              ref="scrollRef"
              class="relative h-full scroll-smooth custom-scrollbar flex flex-col-reverse justify-start"
              style="background-color: transparent; position: relative; z-index: 5"
              @scroll="handleScroll"
            >
              <div class="flex-1"></div>
              <div
                id="image-wrapper"
                class="mx-auto px-3 w-full"
                :class="[isMobile ? '' : 'max-w-4xl']"
              >
                <!-- Welcome/Tips/Messages - These inherit the transparent background -->
                <template v-if="!dataSources.length && !activeAppId">
                  <div v-if="!isMobile" class="flex justify-center items-center text-center h-4/5">
                    <!-- 桌面端显示 AiBot -->
                    <AiBotComponent />
                  </div>
                </template>
                <template v-if="dataSources.length">
                  <div
                    :key="componentKey"
                    :class="{
                      'px-8':
                        isHtmlPreviewerVisible ||
                        isImagePreviewerVisible ||
                        isMarkdownPreviewerVisible ||
                        isPptPreviewerVisible ||
                        isMessageEditorVisible,
                      'px-2': isMobile,
                    }"
                  >
                    <Message
                      v-for="(item, index) of dataSources"
                      :key="item.chatId ? `msg-${item.chatId}` : `temp-${activeGroupId}-${index}`"
                      :index="index"
                      :chatId="item.chatId"
                      :content="item.content"
                      :reasoningText="item.reasoningText"
                      :model="item.model"
                      :modelType="item.modelType"
                      :modelName="item.modelName"
                      :status="item.status"
                      :imageUrl="item.imageUrl"
                      :ttsUrl="item.ttsUrl"
                      :taskId="item.taskId"
                      :taskData="item.taskData"
                      :videoUrl="item.videoUrl"
                      :audioUrl="item.audioUrl"
                      :action="item.action"
                      :role="item.role"
                      :loading="item.loading"
                      :drawId="item.drawId"
                      :customId="item.customId"
                      :pluginParam="item.pluginParam"
                      :appId="item.appId"
                      :progress="item.progress"
                      :isLast="index === dataSources.length - 1"
                      :usingTool="item.usingTool"
                      :usingDeepThinking="false"
                      :useFileSearch="item.useFileSearch"
                      :fileUrl="item.fileUrl"
                      :conversationId="+activeGroupId"
                      :pptTheme="item.pptTheme"
                      :pptOutline="item.pptOutline"
                      :agent_content="item.agent_content"
                      @delete="handleDelete(item)"
                      @regenerate="
                        (options?: any) => handleRegenerate(index, item.chatId || 0, options)
                      "
                    />
                    <div class="sticky bottom-2 flex justify-center p-1 z-20">
                      <!-- Removed the inner bg-white for DownSmall to let parent bg show through -->
                      <DownSmall
                        v-show="!isAtBottom"
                        size="24"
                        class="p-1 bg-white dark:bg-gray-600 shadow-sm rounded-full border text-gray-700 border-gray-400 dark:border-gray-600 dark:text-gray-500 cursor-pointer transition-all duration-300 ease-in-out"
                        :class="[isAtBottom ? 'opacity-0' : 'opacity-100']"
                        @click="handleScrollBtm"
                        theme="outline"
                        :strokeWidth="2"
                        :aria-label="$t('chat.scrollToBottom')"
                        role="button"
                        tabindex="0"
                      />
                    </div>
                  </div>
                </template>
                <div class="bottom" />
              </div>
            </div>
          </main>

          <!-- Mobile empty chat state - 垂直居中的欢迎界面 -->
          <div v-if="isMobile && !dataSources.length && !activeAppId" class="flex-1 flex flex-col">
            <!-- 欢迎内容区域 - 垂直居中 -->
            <div class="flex-1 flex flex-col justify-center items-center text-center px-4">
              <WelcomeComponent />
            </div>
          </div>

          <!-- Container for empty chat state with scrollable content (Desktop) -->
          <div
            v-if="!dataSources.length && !isMobile && !isImagePreviewerVisible"
            :class="[
              'flex-1 custom-scrollbar',
              isHomeFooterExpanded ? 'overflow-hidden' : 'overflow-y-auto',
            ]"
          >
            <!-- Scrollable content wrapper -->
            <div class="flex flex-col">
              <!-- Top spacer for visual centering -->
              <div
                :class="
                  isHomeFooterExpanded ? 'h-4' : shouldShowHomePresets ? 'h-[15vh]' : 'h-[25vh]'
                "
              ></div>

              <!-- Welcome Component -->
              <div class="w-full max-w-4xl mx-auto px-4">
                <WelcomeComponent :appId="activeAppId" />
              </div>

              <!-- Sticky Footer Container -->
              <div class="sticky top-0 z-10 bg-white dark:bg-gray-800 pb-4">
                <div
                  :class="[
                    'w-full',
                    'max-w-4xl',
                    'mx-auto',
                    'px-4',
                    isHtmlPreviewerVisible ||
                    isImagePreviewerVisible ||
                    isMarkdownPreviewerVisible ||
                    isPptPreviewerVisible ||
                    isMessageEditorVisible
                      ? 'pt-12'
                      : 'pt-6',
                  ]"
                >
                  <FooterComponent
                    ref="footerRef"
                    :class="['z-10 pb-3 relative', isMobile ? 'pb-safe' : '']"
                    @pause-request="pauseRequest"
                    @expanded-change="isHomeFooterExpanded = $event"
                    :dataSourcesLength="dataSources.length"
                  />
                </div>

                <!-- 分类切换tabs - 与Footer同级，在粘性容器内 -->
                <div class="w-full max-w-4xl mx-auto px-4 pt-3" v-if="shouldShowHomePresets">
                  <div class="relative overflow-hidden px-1">
                    <div
                      class="flex items-center overflow-x-auto scrollbar-hide"
                      style="scrollbar-width: none; -ms-overflow-style: none"
                    >
                      <div
                        v-for="category in presetCategories"
                        :key="category"
                        @click="selectedPresetCategory = category"
                        class="btn-pill btn-md flex-none mx-1 cursor-pointer"
                        :class="{ 'btn-pill-active': selectedPresetCategory === category }"
                      >
                        <span>{{ category }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- PresetHints - Continue scrolling below sticky footer -->
              <div class="w-full max-w-4xl mx-auto px-4 pb-10" v-if="shouldShowHomePresets">
                <PresetHints
                  v-if="!presetLoading"
                  :is-hide-default-preset="isHideDefaultPreset"
                  :selected-category="selectedPresetCategory"
                  :preset-data="presetData"
                  @click="handleClick"
                />
              </div>
            </div>
          </div>

          <!-- Footer when there are messages -->
          <div
            v-else
            :class="[
              'z-20',
              'relative',
              isHtmlPreviewerVisible ||
              isTextEditorVisible ||
              isImagePreviewerVisible ||
              isMarkdownPreviewerVisible ||
              isPptPreviewerVisible ||
              isMessageEditorVisible
                ? 'mx-4'
                : '',
            ]"
          >
            <FooterComponent
              ref="footerRef"
              :class="['z-10 pb-3 relative', isMobile ? 'pb-safe' : '']"
              @pause-request="pauseRequest"
              :dataSourcesLength="dataSources.length"
            />
          </div>

          <!-- 底部Copyright Area -->
          <div
            v-if="!isMobile && !dataSources.length"
            class="fixed z-50 h-8 flex items-center justify-center bottom-0 left-0 w-full bg-white dark:bg-gray-800"
          >
            <div
              class="text-sm text-gray-600 dark:text-gray-400 max-h-6 flex justify-center items-center"
            >
              {{ $t('chat.aiGeneratedDisclaimer') }}
              <span v-if="globalConfig?.companyName"> © {{ globalConfig?.companyName }}</span>
              <span v-if="globalConfig?.filingNumber" class="ml-2">
                <a
                  class="transition-all text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                  href="https://beian.miit.gov.cn"
                  target="_blank"
                >
                  {{ globalConfig?.filingNumber }}
                </a>
              </span>
              <span v-if="globalConfig?.publicSecurityFilingNumber" class="ml-2">
                <img src="/images/gongan-icon.png" alt="公安" class="inline-block w-4 h-4 mr-1" />
                <a
                  class="transition-all text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                  href="http://www.beian.gov.cn/portal/registerSystemInfo"
                  target="_blank"
                >
                  {{ globalConfig?.publicSecurityFilingNumber }}
                </a>
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Right Panel for Canvas or HTML Previewer -->
      <div
        v-if="
          isHtmlPreviewerVisible ||
          isTextEditorVisible ||
          isImagePreviewerVisible ||
          isMarkdownPreviewerVisible ||
          isPptPreviewerVisible ||
          isMessageEditorVisible
        "
        class="h-full transition-all duration-300 ease-in-out transform"
        :class="{
          'w-3/5':
            (isHtmlPreviewerVisible ||
              isTextEditorVisible ||
              isImagePreviewerVisible ||
              isMarkdownPreviewerVisible ||
              isPptPreviewerVisible ||
              isMessageEditorVisible) &&
            !isMobileHtmlFullscreen, // Normal width on desktop
          'w-full': isMobileHtmlFullscreen, // Full width on mobile
          'w-0 opacity-0':
            !isHtmlPreviewerVisible &&
            !isTextEditorVisible &&
            !isImagePreviewerVisible &&
            !isMarkdownPreviewerVisible &&
            !isPptPreviewerVisible &&
            !isMessageEditorVisible, // Collapse when neither is visible
        }"
        style="position: relative; z-index: 20"
      >
        <!-- 替换为统一的SidePanel组件 -->
        <SidePanel
          ref="sidePanelRef"
          class="h-full w-full"
          @ask-question="handleSidePanelQuestion"
        />
      </div>

      <!-- 通用应用配置弹窗 -->
      <transition name="modal-fade">
        <!-- Backdrop and Centering Container -->
        <div
          v-if="showFormModal && selectedAppForModal"
          class="fixed inset-0 z-[55] flex items-center justify-center bg-gray-900 bg-opacity-50"
          @click.self="handleModalClose"
        >
          <!-- Modal Content Container -->
          <div
            class="relative overflow-hidden bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col w-full max-w-3xl max-h-[85vh] m-4"
          >
            <!-- Background Image Layer -->
            <div
              v-if="selectedAppForModal?.backgroundImg"
              class="absolute inset-0 z-0 opacity-10"
              :style="backgroundStyle"
            ></div>

            <!-- Header -->
            <div
              class="relative z-10 flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
            >
              <span class="text-xl font-bold dark:text-white"
                >{{ $t('chat.presetConfig') }}: {{ selectedAppForModal?.name || '' }}</span
              >
              <button
                @click="handleModalClose"
                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Close size="18" />
              </button>
            </div>

            <!-- Scrollable Content Area with native scroll -->
            <div
              class="relative z-10 flex-grow overflow-y-auto p-4 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm max-h-[65vh]"
            >
              <!-- Form Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <!-- Form Field -->
                <div v-for="(field, index) in currentFormSchema" :key="index">
                  <!-- Label -->
                  <label
                    class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300 mb-1"
                  >
                    {{ field.title }}
                  </label>

                  <!-- Native Input -->
                  <input
                    v-if="field.type === 'input'"
                    type="text"
                    v-model="modalFormData[field.title]"
                    :placeholder="field.placeholder"
                    :disabled="field.placeholder.includes('(系统生成)') || isModalLoading"
                    class="input input-md w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  <!-- DropdownMenu替换原有的Menu -->
                  <DropdownMenu
                    v-if="field.type === 'select'"
                    v-model="dropdownStates[field.title]"
                    position="bottom-left"
                    min-width="100%"
                    class="relative block w-full"
                    :disabled="isModalLoading"
                  >
                    <template #trigger>
                      <div
                        :class="[
                          'input input-md w-full relative cursor-pointer',
                          isModalLoading ? 'disabled:opacity-50 disabled:cursor-not-allowed' : '',
                        ]"
                      >
                        <span class="block text-left truncate">{{
                          modalFormData[field.title] || field.placeholder
                        }}</span>
                        <span
                          class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                        >
                          <DropDownList class="text-gray-400" size="16" aria-hidden="true" />
                        </span>
                      </div>
                    </template>

                    <template #menu="{ close }">
                      <div>
                        <div
                          v-for="option in field.options"
                          :key="option"
                          @click="
                            () => {
                              selectOption(field.title, option)
                              close()
                            }
                          "
                          class="menu-item menu-item-md"
                        >
                          {{ option }}
                        </div>
                      </div>
                    </template>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <!-- Footer with native buttons -->
            <div
              class="relative z-10 flex justify-end p-4 border-t border-gray-200 dark:border-gray-600 flex-shrink-0 space-x-2 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
            >
              <button
                type="button"
                @click="handleModalSkip(selectedAppForModal)"
                :disabled="isModalLoading"
                class="btn btn-secondary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                跳过
              </button>
              <button
                type="button"
                @click="handleModalSubmit"
                :disabled="isModalLoading"
                class="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- 媒体侧边栏 -->
    <MediaSidebar
      v-if="isMediaSidebarVisible"
      :visible="isMediaSidebarVisible"
      :data="mediaPreviewData"
      @close="isMediaSidebarVisible = false"
      @edit="handleMediaEdit"
      @regenerate="handleMediaRegenerate"
    />
  </div>
</template>

<style>
/* 全局过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 宽度变化动画效果 */
.transform {
  transition-property: transform, width, opacity;
}

/* 缩放动画 */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.3s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 滑动动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 添加安全区域适配 */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.mb-safe {
  margin-bottom: env(safe-area-inset-bottom);
}

/* Modal animation */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
