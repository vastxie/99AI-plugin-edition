<script setup lang="ts">
import { uploadFile } from '@/api/upload'
import TemplateRenderer from '@/components/TemplateRenderer/index.vue'
import DropdownMenu from '@/components/common/DropdownMenu/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppCatStore } from '@/store/modules/appStore'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import {
  AddPicture,
  BookOpen,
  CheckOne,
  Clear,
  FolderUpload,
  FullScreen,
  LoadingFour,
  OffScreen,
  Plus,
  Right,
  SendOne,
  Sphere,
  Square,
  TwoEllipses,
} from '@icon-park/vue-next'
import PinyinMatch from 'pinyin-match'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ModelSelector from '../ModelSelector/index.vue'
import FilePreview from './components/FilePreview.vue'
import ToolbarOptions from './components/ToolbarOptions.vue'

// 禁用属性自动继承
defineOptions({
  inheritAttrs: false,
})

interface Emit {
  (ev: 'pause-request'): void
  (ev: 'toggle-app-list'): void
  (ev: 'expanded-change', value: boolean): void
}

interface Props {
  dataSourcesLength: number
}

const props = defineProps<Props>()

// 引入依赖
const onConversation = inject<any>('onConversation')
// 引用的 store
const useGlobalStore = useGlobalStoreWithOut()
const appCatStore = useAppCatStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const emit = defineEmits<Emit>()
const siteName = computed(() => authStore.globalConfig?.siteName || '99AI Plugin Edition')
const ms = message()

// 模型选择器位置配置
const modelSelectorPosition = computed(
  () => authStore.globalConfig?.modelSelectorPosition || 'header'
)
const showModelSelectorInFooter = computed(() => modelSelectorPosition.value === 'footer')

const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())

// 获取配置对象
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) return {}
  try {
    return JSON.parse(configString)
  } catch (e) {
    return {}
  }
})

// 文件上传限制配置
const uploadFileLimit = computed(() => Number(authStore.globalConfig?.uploadFileLimit) || 5)
const uploadFileSizeLimit = computed(
  () => Number(authStore.globalConfig?.uploadFileSizeLimit) || 20
)

const isFile = ref(true)
const fileInput = ref()
const imageInput = ref()
const isUploading = ref(false)
const searchResults = ref<any[]>([])
const inputRef = ref<any>(null)
const isDragging = ref(false) // 添加拖拽状态标志
const isFileDraggingOverPage = ref(false) // 添加文件拖到页面内(但未到输入框)的状态标志
const extraParam = ref<{
  size: string
  quality?: string
  compression?: string
  background?: string
  [key: string]: any // 支持动态自定义参数
}>({ size: '' })

// 自定义选项配置 - 从插件列表中获取
const customOptions = computed(() => {
  // 优先使用当前选中的插件，如果没有则使用对话配置中的模型
  const currentPlugin: any = chatStore.currentPlugin
  const currentModel = currentPlugin?.parameters || chatStore.activeConfig?.modelInfo?.model

  if (!currentModel) {
    return []
  }

  // 如果已经有选中的插件且包含 customOptions，直接返回
  if (currentPlugin?.customOptions) {
    return currentPlugin.customOptions
  }

  // 否则从插件列表中查找匹配的插件
  const plugin: any = chatStore.pluginList.find((p: any) => p.parameters === currentModel)

  if (!plugin || !plugin.customOptions) {
    return []
  }

  return plugin.customOptions
})

// 自定义选项的当前选择值
const customOptionValues = ref<Record<string, string>>({})

// 初始化自定义选项的默认值
watch(
  customOptions,
  options => {
    if (options && options.length > 0) {
      const newValues: Record<string, string> = {}
      options.forEach((opt: any) => {
        if (opt.default) {
          newValues[opt.paramName] = opt.default
        } else if (opt.options && opt.options.length > 0) {
          newValues[opt.paramName] = opt.options[0].value
        }
      })
      customOptionValues.value = newValues
    }
  },
  { immediate: true }
)

const showSuggestions = ref(false)
// 使用store中的全局状态，而不是组件内的ref
const selectedApp = computed(() => chatStore.selectedApp)
const isSelectedApp = computed(() => chatStore.isSelectedApp)
// 从缓存读取应用列表，而不是单独维护 ref
const appList = computed(() => appCatStore.allApps)
let searchTimeout: string | number | NodeJS.Timeout | null | undefined = null
const fileUploadConfig = ref({
  accept: '.pdf, .txt, .doc, .docx,.ppt,.pptx, .xlsx,.xls,.csv .md, .markdown',
  multiple: true,
})

// 双向绑定 chatStore.prompt
const prompt = computed({
  get: () => chatStore.prompt ?? '',
  set: value => {
    chatStore.setPrompt(value || '')
  },
})

// 判断是否为模板格式
const isTemplateFormat = computed(() => {
  return /\{\{(input|select):([^}]+)\}\}/.test(prompt.value)
})

// 模板渲染器的引用
const templateRendererRef = ref<any>(null)

// 清空内容
const clearTemplateContent = () => {
  // 直接清空 prompt 值，这会退出模板编辑模式（因为空字符串不包含模板格式）
  prompt.value = ''
  if (isExpanded.value) {
    isExpanded.value = false
    emit('expanded-change', false)
  }

  // 重置输入框高度和聚焦
  nextTick(() => {
    if (inputRef.value) {
      // 重置高度
      inputRef.value.style.height = 'auto'
      // 非移动端自动聚焦
      if (!isMobile.value) {
        inputRef.value.focus()
      }
    }
  })
}

// 统一的工具使用状态
const usingTool = computed({
  get: () => chatStore.usingTool,
  set: value => {
    chatStore.setUsingTool(value)
  },
})

const usingDeepThinking = computed({
  get: () => chatStore.usingDeepThinking,
  set: value => {
    chatStore.setUsingDeepThinking(value)
  },
})

const { isMobile } = useBasicLayout()
const usingPlugin = computed(() => chatStore.currentPlugin)
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})
const dataSources = computed(() => chatStore.chatList)
const activeModelName = computed(() => String(configObj?.value.modelInfo.modelName))
const activeModelKeyType = computed(() => {
  return Number(configObj?.value.modelInfo.keyType)
})

const activeGroupId = computed(() => chatStore.active)
const activeModel = computed(() => String(configObj?.value?.modelInfo?.model ?? ''))
const activeModelFileUpload = computed(() => Number(configObj?.value?.modelInfo?.isFileUpload))
const activeModelImageUpload = computed(() => Number(configObj?.value?.modelInfo?.isImageUpload))

// 解析插件的 uploadTypes 字符串，返回支持的上传类型数组
const getPluginUploadTypes = (plugin: any) => {
  if (!plugin || !plugin.uploadTypes) return []

  try {
    // uploadTypes 格式: "file,image,video" 或 "file,image" 等
    const types = plugin.uploadTypes
      .split(',')
      .map((uploadType: string) => uploadType.trim().toLowerCase())
    return types
  } catch (error) {
    return []
  }
}

const isFilesModel = computed(() => {
  // 判断是否在使用插件
  if (usingPlugin.value) {
    const uploadTypes = getPluginUploadTypes(usingPlugin.value)
    return uploadTypes.includes('file')
  }
  // 如果不使用插件，则按照模型配置判断
  return activeModelFileUpload.value !== 0
})

const isImageModel = computed(() => {
  // 判断是否在使用插件
  if (usingPlugin.value) {
    const uploadTypes = getPluginUploadTypes(usingPlugin.value)
    return uploadTypes.includes('image')
  }
  // 如果不使用插件，则按照模型配置判断
  return activeModelImageUpload.value !== 0
})

const isSeedEditModel = computed(
  () => activeModel.value === 'seededit' || usingPlugin.value?.parameters === 'seededit'
)

// 统一的工具支持检查 - 根据 isToolSupported 值判断
const isToolSupported = computed(() => {
  const toolSupport = configObj?.value?.modelInfo?.isToolSupported
  // isToolSupported: 0-不开启 1-前端显示开关 2-自动调用(前端不显示)
  return toolSupport === 1 // 只有值为1时才显示工具开关
})

const isDeepThinking = computed(() => {
  const deepThinkingType = configObj?.value?.modelInfo?.deepThinkingType
  return deepThinkingType === 1 || deepThinkingType === 3
})

const isMermaidModel = computed(
  () => activeModel.value === 'mermaid' || usingPlugin.value?.parameters === 'mermaid'
)

const isPptModel = computed(
  () => activeModel.value === 'ai-ppt' || usingPlugin.value?.parameters === 'ai-ppt'
)

const clipboardText = computed(() => useGlobalStore.clipboardText)

const buttonDisabled = computed(
  () => isStreamIn.value || !prompt.value || prompt.value.trim() === ''
)

const isExpanded = ref(false) // 控制输入框是否扩展
const shouldShowExpandButton = ref(false) // 控制是否显示扩展按钮
const expandedInputHeight = computed(() => (isMobile.value ? '50vh' : '60vh'))
const inputMaxHeight = computed(() => (isExpanded.value ? expandedInputHeight.value : '30vh'))

const autoResize = () => {
  if (inputRef.value) {
    const textarea = inputRef.value

    if (isExpanded.value) {
      // 展开模式下，使用固定高度
      textarea.style.height = expandedInputHeight.value
      return
    }

    // 普通模式下，先重置高度，然后根据内容自适应
    textarea.style.height = 'auto' // 使用auto而不是固定的小值，让浏览器自动计算

    // 获取自动计算后的scrollHeight
    const contentHeight = textarea.scrollHeight

    // 获取行高
    const singleLineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20 // 默认行高 20px

    // 普通模式最大行数为8行
    const maxLines = 8
    const maxHeight = singleLineHeight * maxLines // 最大高度

    // 计算新高度，确保不超过最大高度
    const newHeight = Math.min(contentHeight, maxHeight)

    // 设置新高度
    textarea.style.height = `${newHeight}px`

    // 判断是否应该显示扩展按钮 - 当内容高度超过4行时显示
    shouldShowExpandButton.value = contentHeight > singleLineHeight * 4
  }
}

// 切换扩展模式
const toggleExpanded = () => {
  // 从展开到收起模式时，先获取当前高度
  const currentHeight = isExpanded.value ? inputRef.value?.style.height : null

  // 切换状态
  const nextExpanded = !isExpanded.value
  isExpanded.value = nextExpanded
  emit('expanded-change', nextExpanded)

  nextTick(() => {
    if (isExpanded.value) {
      // 展开模式下，使用固定高度
      if (inputRef.value) {
        inputRef.value.style.height = expandedInputHeight.value
      }
    } else {
      // 收起模式时，先保持当前高度，然后在下一帧进行调整
      // 这样可以让过渡效果更平滑
      if (currentHeight) {
        // 先设置当前高度，避免立即收缩导致的视觉跳跃
        if (inputRef.value && currentHeight) {
          inputRef.value.style.height = currentHeight
        }

        // 在下一帧进行实际的大小调整
        requestAnimationFrame(() => {
          autoResize()
        })
      } else {
        autoResize()
      }
    }
  })
}

// 监听 prompt 的变化（外部修改时调整高度）
watch(
  prompt,
  () => {
    nextTick(() => {
      autoResize()
    })
  },
  { immediate: true } // 初始化时立即调整
)

const handleInput = async (event: KeyboardEvent) => {
  const inputElement = event.target as HTMLTextAreaElement
  const inputValue = inputElement.value
  showSuggestions.value = inputValue.startsWith('@')

  // 清除之前的定时器，如果有的话
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  if (showSuggestions.value && !isSelectedApp.value) {
    const searchTerm = inputValue.slice(1) // 去掉'@'

    // 使用定时器来节流搜索请求
    searchTimeout = setTimeout(async () => {
      if (searchTerm.length > 0) {
        try {
          const keywordLower = searchTerm.toLowerCase()

          // 根据拼音匹配过滤符合的应用
          const filteredResults = appList.value.filter(item =>
            PinyinMatch.match(item.name, keywordLower)
          )

          searchResults.value = filteredResults.slice(0, 5)
        } catch (error) {
          // Error fetching search results
          searchResults.value = []
        }
      } else {
        // 如果关键字为空，随机选取5个结果
        const randomResults = appList.value
          .sort(() => Math.random() - 0.5) // 随机打乱顺序
          .slice(0, 5) // 取前5个
        searchResults.value = randomResults
      }
    }, 100) // 设置1秒的延迟
  } else {
    searchResults.value = []
  }
}

// 不再需要单独查询，直接从缓存读取
// async function queryApps() {
//   const res: ResData = await fetchQueryAppsAPI()
//   appList.value = res?.data?.rows.map((item: App) => {
//     item.loading = false
//     return item
//   })
//   // activeList.value = appList.value;
// }

const activeModelAvatar = computed(() => {
  return String(usingPlugin?.value?.pluginImg || configObj?.value.modelInfo?.modelAvatar || '')
})

async function appendStyleToInput(style: any) {
  // 检查prompt.value是否非空并且以逗号结尾
  if (prompt.value && /,\s*$/.test(prompt.value)) {
    // 如果已经以逗号结尾，直接添加风格
    await chatStore.setPrompt(`${prompt.value} ${style}`)
    // prompt.value += ` ${style}`;
  } else if (prompt.value) {
    // 如果非空但不以逗号结尾，先添加逗号再添加风格
    await chatStore.setPrompt(`${prompt.value}, ${style}`)
    // prompt.value += `, ${style}`;
  } else {
    // 如果prompt.value为空，只添加风格不添加逗号
    await chatStore.setPrompt(`${style}`)
    // prompt.value = `${style} ,`;
  }

  // 确保inputRef是已经和textarea元素绑定的ref
  if (inputRef.value) {
    inputRef.value.focus()
    inputRef.value.scrollTop = inputRef.value.scrollHeight
  }
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

// 修改计算属性，直接从对话组获取fileUrl
const fileUrl = computed(() => activeGroupInfo.value?.fileUrl || '')

// 修改计算属性，解析fileUrl为对象数组
const savedFiles = computed(() => {
  if (!fileUrl.value) return []

  try {
    return JSON.parse(fileUrl.value) as { name: string; url: string; type?: string }[]
  } catch (e) {
    // 解析fileUrl失败
    return []
  }
})

const handleSubmit = async (indexOrParams?: number | any) => {
  if (isStreamIn.value) {
    return
  }

  // 判断参数类型
  let extraParams: any = {}

  if (typeof indexOrParams === 'number') {
    // index = indexOrParams  // 未使用的变量
  } else if (typeof indexOrParams === 'object') {
    extraParams = indexOrParams
  }

  // 新增检查：如果是SeedEdit模型且没有上传图片，提醒用户
  if (isSeedEditModel.value && dataBase64List.value.length === 0) {
    ms.warning('chat.uploadImageFirst')
    return
  }

  // 如果是模板格式，使用解析后的内容
  const finalPrompt = prompt.value

  if (chatStore.groupList.length === 0) {
    await createNewChatGroup()
  }

  // 检测是否包含PPT生成相关关键词

  chatStore.setStreamIn(true)
  let action = ''
  if (usingPlugin.value?.parameters === 'suno-music') {
    action = 'LYRICS'
  }

  let useModel =
    usingPlugin.value?.parameters === 'mind-map' || usingPlugin.value?.parameters === 'mermaid'
      ? selectedApp?.value?.model || chatStore?.activeModel
      : usingPlugin.value?.parameters === 'ppt-generation'
        ? selectedApp?.value?.model || chatStore?.activeModel // PPT插件使用选择的模型
        : usingPlugin.value?.parameters || selectedApp?.value?.model || chatStore?.activeModel
  let useModelName =
    usingPlugin?.value?.pluginName || selectedApp?.value?.name || activeModelName.value

  // 使用当前模型的 keyType
  const useModelType = activeModelKeyType.value

  let modelAvatar = selectedApp?.value?.coverImg || activeModelAvatar.value
  let appId

  if (selectedApp.value) {
    appId = selectedApp.value.id
  } else {
    appId = activeGroupInfo?.value?.appId
  }

  let imageUrl = ''
  let videoUrl = ''
  let submittedFileUrl = fileUrl.value || ''

  // 如果是模板格式，先解析出实际内容
  let msg = finalPrompt || ''
  if (isTemplateFormat.value && templateRendererRef.value) {
    msg = templateRendererRef.value.getParsedContent()
  }

  // 处理图片文件上传（只有在提交时才上传图片）
  if (dataBase64List.value.length > 0) {
    // 获取所有图片文件
    const imageFiles = fileList.value.filter(file => file.type.startsWith('image/'))

    if (imageFiles.length > 0) {
      isUploading.value = true
      try {
        // 上传所有图片文件
        const uploadPromises = imageFiles.map(async file => {
          try {
            const response = await uploadFile(file)
            return response.data
          } catch (error: any) {
            // 显示后端返回的错误信息
            const errorMessage = error?.response?.data?.message || error?.message || '图片上传失败'
            ms.error(errorMessage)
            return ''
          }
        })

        // 等待所有图片上传完成
        const results = await Promise.all(uploadPromises)
        imageUrl = results.filter(Boolean).join(',')
      } catch (error: any) {
        // Image upload error
        const errorMessage = error?.response?.data?.message || error?.message || '图片上传失败'
        ms.error(errorMessage)
      } finally {
        isUploading.value = false
      }
    }
  }

  // 处理视频文件上传（只有在提交时才上传视频）
  const videoFiles = fileList.value.filter(file => file.type.startsWith('video/'))
  if (videoFiles.length > 0) {
    isUploading.value = true
    try {
      // 上传所有视频文件
      const uploadPromises = videoFiles.map(async file => {
        try {
          const response = await uploadFile(file)
          return response.data
        } catch (error: any) {
          // 显示后端返回的错误信息
          const errorMessage = error?.response?.data?.message || error?.message || '视频上传失败'
          ms.error(errorMessage)
          return ''
        }
      })

      // 等待所有视频上传完成
      const results = await Promise.all(uploadPromises)
      videoUrl = results.filter(Boolean).join(',')
    } catch (error: any) {
      // Video upload error
      const errorMessage = error?.response?.data?.message || error?.message || '视频上传失败'
      ms.error(errorMessage)
    } finally {
      isUploading.value = false
    }
  }

  // 处理drawingType为1的情况，将图片链接加到msg前面
  if (usingPlugin.value?.drawingType === 1 && imageUrl) {
    msg = `${imageUrl} ${msg}`
  }

  // if (appId) {
  //   try {
  //     const res: any = await fetchQueryOneCatAPI({ id: appId })
  //     modelAvatar = res.data.modelAvatar
  //   } catch (error) {}
  // }

  await chatStore.setPrompt('')
  if (inputRef.value) {
    inputRef.value.style.height = '1rem' // 使用初始高度
  }

  // 合并自定义选项到extraParam
  const finalExtraParam = {
    ...extraParam.value,
    ...customOptionValues.value, // 将自定义选项值合并进去
  }

  onConversation({
    msg: msg,
    action: action || extraParams.action,
    model: useModel,
    modelName: useModelName,
    modelType: useModelType,
    modelAvatar: modelAvatar,
    appId: appId,
    extraParam: finalExtraParam,
    fileUrl: submittedFileUrl,
    imageUrl: imageUrl,
    videoUrl: videoUrl,
    pluginParam: usingPlugin.value?.parameters,
    selectedTheme: extraParams.selectedTheme,
  })

  // 清空所有上传的图片和视频，确保imageUrl、videoUrl和fileUrl使用后立即销毁
  chatStore.setStreamIn(false)
  isUploading.value = false

  // 清空所有文件（包括图片、视频和文档）
  fileList.value = []
  dataBase64List.value = []

  // 清空对话组中保存的文件URL，允许再次上传
  if (activeGroupInfo.value) {
    activeGroupInfo.value.fileUrl = ''
  }

  // 重要: 清空临时变量，确保不会被再次使用
  imageUrl = ''
  videoUrl = ''
}

const triggerUpload = () => {
  // 根据当前模型支持情况决定触发哪种上传
  const canUploadFiles = isFilesModel.value
  const canUploadImages = isImageModel.value
  const canUploadVideos = isVideoModel.value // 使用计算属性判断视频上传支持

  // 计算当前所有文件的总数量（图片+视频+文档）
  const currentTotalCount = fileList.value.length

  // 获取已保存的文件总数量（与FilePreview组件的savedFiles相同）
  let savedTotalCount = 0
  try {
    if (fileUrl.value) {
      const existingFiles = JSON.parse(fileUrl.value)
      if (Array.isArray(existingFiles)) {
        // 计算所有已保存的文件（包括image和document类型）
        savedTotalCount = existingFiles.length
      }
    } else {
    }
  } catch (error) {
    // 忽略解析错误
  }

  // 检查总文件数是否达到限制
  const totalFileCount = currentTotalCount + savedTotalCount

  if (totalFileCount >= uploadFileLimit.value) {
    ms.warning(
      `文件数量已达上限（已有${totalFileCount}个，限制${uploadFileLimit.value}个）。请删除已有文件或发送消息后再上传`
    )
    return
  }

  // 构建支持的文件类型
  const acceptTypes = []
  if (canUploadFiles) {
    acceptTypes.push(
      '.pdf',
      '.txt',
      '.doc',
      '.docx',
      '.ppt',
      '.pptx',
      '.xlsx',
      '.xls',
      '.csv',
      '.md',
      '.markdown'
    )
  }
  if (canUploadImages) {
    acceptTypes.push('image/*')
  }
  if (canUploadVideos) {
    acceptTypes.push('video/*')
  }

  fileUploadConfig.value = {
    accept: acceptTypes.join(', '),
    multiple: true,
  }

  // 重新设置 input 的属性
  if (fileInput.value) {
    // 先清空input的值，确保能重新选择相同文件
    fileInput.value.value = ''
    fileInput.value.accept = fileUploadConfig.value.accept
    fileInput.value.multiple = fileUploadConfig.value.multiple
  } else {
    return
  }

  // 触发文件选择

  // 直接尝试点击，如果是用户交互触发的，应该能工作
  try {
    fileInput.value.click()
  } catch (error) {
    // 如果直接点击失败，使用setTimeout作为备用方案
    setTimeout(() => {
      if (fileInput.value) {
        fileInput.value.click()
      } else {
      }
    }, 10)
  }
}

const fileList = ref<File[]>([]) // 使用 ref 来创建响应式的文件列表
const dataBase64List = ref<string[]>([]) // 使用 ref 来创建响应式的 Base64 数据列表

// 视频处理复用图片逻辑 - 直接存储在 fileList 和 dataBase64List 中

const handleSetFile = async (file: File) => {
  // 注意：数量限制检查已在handleFileSelect中统一处理，这里不再重复检查
  // 直接添加文件到列表
  fileList.value.push(file) // 使用 .value 访问 ref 对象并追加新文件

  const reader = new FileReader()

  reader.addEventListener('load', (event: any) => {
    const base64Data = event.target?.result as string
    dataBase64List.value.push(base64Data) // 使用 .value 访问 ref 对象并追加 Base64 数据

    // 如果不是图片文件且不是视频文件，立即上传文件并更新对话组
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      handleUploadFile(file)
    }
  })

  reader.readAsDataURL(file) // 读取文件并转换为 Base64

  // 注意：不要设置fileInput.value = null，这会破坏ref引用
  // fileInput.value = null  // 移除这行
}

// 新增：处理单个文件上传
const handleUploadFile = async (file: File) => {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
    // 图片和视频文件不立即上传，只预览
    return
  }

  isUploading.value = true
  try {
    const response = await uploadFile(file)

    // 将文件信息添加到对话组
    const fileInfo = {
      name: file.name,
      url: response.data,
      type: 'document',
    }

    // 获取对话组当前已有文件
    let existingFiles = []
    try {
      if (fileUrl.value) {
        existingFiles = JSON.parse(fileUrl.value)
        if (!Array.isArray(existingFiles)) {
          existingFiles = []
        }
        // 数据验证和清理：过滤掉异常数据
        existingFiles = existingFiles.filter(
          existingFile =>
            existingFile &&
            typeof existingFile === 'object' &&
            existingFile.name &&
            existingFile.url &&
            (existingFile.type === 'image' || existingFile.type === 'document')
        )
      }
    } catch (error) {
      existingFiles = []
    }

    // 将新文件添加到列表
    existingFiles.push(fileInfo)

    // 更新对话组的fileUrl字段
    await chatStore.updateGroupInfo({
      groupId: activeGroupId.value,
      fileUrl: JSON.stringify(existingFiles),
    })

    // 刷新数据以更新UI
    await chatStore.queryMyGroup()

    // 重要：文档文件已经保存到对话组，需要从临时缓存中移除，避免重复计数
    const fileIndex = fileList.value.indexOf(file)
    if (fileIndex > -1) {
      fileList.value.splice(fileIndex, 1)
      // 同时移除对应的Base64数据
      if (fileIndex < dataBase64List.value.length) {
        dataBase64List.value.splice(fileIndex, 1)
      }
    }

    // ms.success(`文件"${file.name}"已上传`)
  } catch (error: any) {
    // 显示后端返回的错误信息
    const errorMessage = error?.response?.data?.message || error?.message || '上传失败'
    ms.error(errorMessage)
  } finally {
    isUploading.value = false
  }
}

const handlePaste = async (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData || (window as any).clipboardData
  const items = clipboardData.items

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        if (file.type.startsWith('image/') && isImageModel.value) {
          await processImageFile(file)
        } else if (file.type.startsWith('video/') && isVideoModel.value) {
          await processVideoFile(file)
        } else if (
          !file.type.startsWith('image/') &&
          !file.type.startsWith('video/') &&
          isFilesModel.value
        ) {
          await processDocumentFile(file)
        } else {
          // 文件类型不匹配当前模型支持的类型
        }
      }
    }
  }
}

// 处理文档类型文件
const processDocumentFile = async (file: File) => {
  if (file.type.startsWith('image/')) {
    // 图片文件应使用图片上传功能
    return
  }

  if (file.type.startsWith('video/')) {
    // 视频文件应使用视频上传功能
    return
  }

  // 检查文件类型
  const acceptedTypes = [
    '.pdf',
    '.txt',
    '.doc',
    '.docx',
    '.pptx',
    '.xlsx',
    '.md',
    '.markdown',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/markdown',
  ]

  const isAcceptedType = acceptedTypes.some(type => {
    if (type.startsWith('.')) {
      return file.name.toLowerCase().endsWith(type.toLowerCase())
    } else {
      return file.type === type
    }
  })

  if (!isAcceptedType) {
    ms.warning(`不支持的文件类型: ${file.name}`)
    return
  }

  // 检查文件大小限制
  const maxSize = uploadFileSizeLimit.value * 1024 * 1024
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
    ms.warning(`文件大小超出限制，当前: ${fileSizeMB}MB，最大支持: ${uploadFileSizeLimit.value}MB`)
    return
  }

  // 注意：数量限制检查已在handleFileSelect中统一处理
  // 这里不再重复检查，直接处理文件

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理非图片文件，支持多文件
  isFile.value = true
  handleSetFile(file)

  if (isPptModel.value) {
    await chatStore.setPrompt(t('app.generatePptWith', { fileName: trimmedFileName }))
  }
}

// 处理图片类型文件
const processImageFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    // 非图片文件应使用文件上传功能
    return
  }

  // 检查图片类型
  const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']

  if (!acceptedTypes.includes(file.type)) {
    ms.warning(`不支持的图片类型: ${file.name}，请使用jpg、png、gif、webp或bmp格式`)
    return
  }

  // 检查图片大小限制
  const maxSize = uploadFileSizeLimit.value * 1024 * 1024
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
    ms.warning(`图片大小超出限制，当前: ${fileSizeMB}MB，最大支持: ${uploadFileSizeLimit.value}MB`)
    return
  }

  // 注意：数量限制检查已在handleFileSelect中统一处理
  // 这里不再重复检查，直接处理图片

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理图片文件，支持多图片
  isFile.value = false
  handleSetFile(file)
}

// 处理视频类型文件 - 复用图片处理逻辑
const processVideoFile = async (file: File) => {
  if (!file.type.startsWith('video/')) {
    // 非视频文件应使用其他上传功能
    return
  }

  // 检查视频类型
  const acceptedTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
  ]

  if (!acceptedTypes.includes(file.type)) {
    ms.warning(`不支持的视频类型: ${file.name}，请使用mp4、webm、ogg、mov或avi格式`)
    return
  }

  // 检查视频大小限制
  const maxSize = uploadFileSizeLimit.value * 1024 * 1024
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
    ms.warning(`视频大小超出限制，当前: ${fileSizeMB}MB，最大支持: ${uploadFileSizeLimit.value}MB`)
    return
  }

  // 注意：数量限制检查已在handleFileSelect中统一处理
  // 这里不再重复检查，直接处理视频

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理视频文件 - 复用图片处理逻辑
  handleSetFile(file)
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) {
    return
  }

  // 分类文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
  const videoFiles = Array.from(files).filter(file => file.type.startsWith('video/'))
  const documentFiles = Array.from(files).filter(
    file => !file.type.startsWith('image/') && !file.type.startsWith('video/')
  )

  // 处理图片文件
  if (imageFiles.length > 0 && isImageModel.value) {
    // 获取当前已有文件总数量
    const currentTotalCount = fileList.value.length

    // 计算已保存的文件总数量（与triggerUpload中的计算方式相同）
    let savedTotalCount = 0
    try {
      if (fileUrl.value) {
        const existingFiles = JSON.parse(fileUrl.value)
        if (Array.isArray(existingFiles)) {
          // 计算所有已保存的文件（包括image和document类型）
          savedTotalCount = existingFiles.length
        }
      }
    } catch (error) {
      savedTotalCount = 0
    }

    // 计算剩余可用槽位
    const remainingSlots = uploadFileLimit.value - currentTotalCount - savedTotalCount

    // 如果没有剩余槽位
    if (remainingSlots <= 0) {
      ms.warning(`文件数量已达上限（最多${uploadFileLimit.value}个）`)
    } else if (imageFiles.length > remainingSlots) {
      ms.warning(
        `已选择${imageFiles.length}个文件，但只能再添加${remainingSlots}个。将只处理前${remainingSlots}个文件。`
      )
    }

    // 处理允许范围内的图片
    const imagesToProcess = imageFiles.slice(0, Math.max(0, remainingSlots))
    for (const file of imagesToProcess) {
      await processImageFile(file)
    }
  } else if (imageFiles.length > 0 && !isImageModel.value) {
    ms.warning('chat.modelNotSupportImage')
  }

  // 处理视频文件
  if (videoFiles.length > 0 && isVideoModel.value) {
    // 获取当前已有文件总数量
    const currentTotalCount = fileList.value.length
    // 计算已保存的文件总数量
    let savedTotalCount = 0
    try {
      if (fileUrl.value) {
        const existingFiles = JSON.parse(fileUrl.value)
        if (Array.isArray(existingFiles)) {
          savedTotalCount = existingFiles.length
        }
      }
    } catch (error) {
      savedTotalCount = 0
    }

    // 计算剩余可用槽位
    const remainingSlots = uploadFileLimit.value - currentTotalCount - savedTotalCount

    // 如果没有剩余槽位
    if (remainingSlots <= 0) {
      ms.warning(`文件数量已达上限（最多${uploadFileLimit.value}个）`)
    } else if (videoFiles.length > remainingSlots) {
      ms.warning(
        `已选择${videoFiles.length}个文件，但只能再添加${remainingSlots}个。将只处理前${remainingSlots}个文件。`
      )
    }

    // 处理允许范围内的视频
    const videosToProcess = videoFiles.slice(0, Math.max(0, remainingSlots))
    for (const file of videosToProcess) {
      await processVideoFile(file)
    }
  } else if (videoFiles.length > 0 && !isVideoModel.value) {
    ms.warning('chat.modelNotSupportVideo')
  }

  // 处理文档文件
  if (documentFiles.length > 0 && isFilesModel.value) {
    // 获取当前已有文件总数量
    const currentTotalCount = fileList.value.length
    // 计算已保存的文件总数量
    let savedTotalCount = 0
    try {
      if (fileUrl.value) {
        const existingFiles = JSON.parse(fileUrl.value)
        if (Array.isArray(existingFiles)) {
          savedTotalCount = existingFiles.length
        }
      }
    } catch (error) {
      savedTotalCount = 0
    }

    // 计算剩余可用槽位
    const remainingSlots = uploadFileLimit.value - currentTotalCount - savedTotalCount

    // 如果没有剩余槽位
    if (remainingSlots <= 0) {
      ms.warning(`文件数量已达上限（最多${uploadFileLimit.value}个）`)
    } else if (documentFiles.length > remainingSlots) {
      ms.warning(
        `已选择${documentFiles.length}个文件，但只能再添加${remainingSlots}个。将只处理前${remainingSlots}个文件。`
      )
    }

    // 处理允许范围内的文件
    const filesToProcess = documentFiles.slice(0, Math.max(0, remainingSlots))
    // 显示上传进行中提示
    if (filesToProcess.length > 0) {
      isUploading.value = true
    }

    // 串行上传所有文件，避免并发导致的数据覆盖问题
    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i]

        // 获取Base64预览
        await new Promise<void>(resolve => {
          const reader = new FileReader()
          reader.addEventListener('load', e => {
            const base64Data = e.target?.result as string
            fileList.value.push(file)
            dataBase64List.value.push(base64Data)
            resolve()
          })
          reader.readAsDataURL(file)
        })

        // 直接上传文件并添加到对话组
        await handleUploadFile(file)
      }
    } catch (error) {
      // 批量上传文件失败
    } finally {
      isUploading.value = false
    }
  } else if (documentFiles.length > 0 && !isFilesModel.value) {
    ms.warning('chat.modelNotSupportFile')
  }

  // 清空input的值，允许再次选择相同文件
  input.value = ''
}

const handleImageSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) return

  // 计算当前已有文件总数量（所有类型）
  const currentTotalCount = fileList.value.length

  // 计算已保存的文件总数量
  let savedTotalCount = 0
  try {
    if (fileUrl.value) {
      const existingFiles = JSON.parse(fileUrl.value)
      if (Array.isArray(existingFiles)) {
        savedTotalCount = existingFiles.length
      }
    }
  } catch (error) {
    savedTotalCount = 0
  }

  // 检查文件总数是否超过限制
  const totalCount = currentTotalCount + savedTotalCount
  if (totalCount >= uploadFileLimit.value) {
    ms.warning(`文件数量已达上限（已有${totalCount}个，限制${uploadFileLimit.value}个）`)
    input.value = ''
    return
  }

  // 计算剩余可用槽位
  const remainingSlots = uploadFileLimit.value - totalCount

  // 先收集所有图片文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))

  // 如果文件数量超过剩余槽位，进行提示
  if (imageFiles.length > remainingSlots) {
    ms.warning(
      `已选择${imageFiles.length}个文件，但只能再添加${remainingSlots}个。将只处理前${remainingSlots}个文件。`
    )
  }

  // 只处理剩余槽位数量的图片
  const imagesToProcess = imageFiles.slice(0, remainingSlots)

  // 并行处理所有图片（只预览，不上传）
  try {
    await Promise.all(
      imagesToProcess.map(async file => {
        // 获取Base64预览
        await new Promise<void>(resolve => {
          const reader = new FileReader()
          reader.addEventListener('load', e => {
            const base64Data = e.target?.result as string
            fileList.value.push(file)
            dataBase64List.value.push(base64Data)
            resolve()
          })
          reader.readAsDataURL(file)
        })
      })
    )
  } catch (error) {
    // Batch image process failed
  } finally {
    input.value = ''
  }
}

const clearSelectApp = async () => {
  searchResults.value = []
  showSuggestions.value = false

  // 使用store的全局方法清空选择的应用
  chatStore.clearSelectedApp()

  chatStore.setUsingPlugin(null)
}

const handleEnter = (event: KeyboardEvent) => {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!buttonDisabled.value) {
        handleSubmit()
      }
    }
  } else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      if (!buttonDisabled.value) {
        handleSubmit()
      }
    }
  }
}

const selectApp = async (app: any) => {
  // 使用store的全局方法设置选择的应用
  chatStore.setSelectedApp(app)

  await chatStore.setPrompt('')
  // prompt.value = '';
  inputRef.value?.focus()
}

const handleStop = () => {
  emit('pause-request')
  chatStore.setStreamIn(false)
}

watch(clipboardText, async val => {
  await chatStore.setPrompt(val)
  // prompt.value = val;
  inputRef.value?.focus()
  inputRef.value.scrollTop = inputRef.value.scrollHeight
})

watch(
  dataSources,
  val => {
    if (val.length === 0) return
  },
  { immediate: true }
)

// 监听 activeModelFileUpload 和 activeModelImageUpload 的变化
watch(
  [activeModelFileUpload, activeModelImageUpload],
  async ([newFileUpload, newImageUpload], [oldFileUpload, oldImageUpload]) => {
    if (oldFileUpload !== 0 && newFileUpload === 0) {
      // 文件上传支持从有变为无，清空所有文件
      // 先清空本地文件列表
      fileList.value = fileList.value.filter(file => file.type.startsWith('image/'))
      dataBase64List.value = dataBase64List.value.filter((_, index) =>
        fileList.value[index]?.type.startsWith('image/')
      )

      // 清空对话组中的文件（保留图片）
      if (fileUrl.value) {
        try {
          const files = JSON.parse(fileUrl.value)
          if (Array.isArray(files)) {
            const imageFiles = files.filter(file => file.type === 'image')
            // 更新对话组文件信息
            await chatStore.updateGroupInfo({
              groupId: activeGroupId.value,
              fileUrl: imageFiles.length > 0 ? JSON.stringify(imageFiles) : '',
            })
            // 刷新数据以更新UI
            await chatStore.queryMyGroup()
          }
        } catch (error) {
          // Clear file failed
        }
      }
    }

    if (oldImageUpload !== 0 && newImageUpload === 0) {
      // 图片上传支持从有变为无，清空所有图片
      // 先清空本地图片列表
      fileList.value = fileList.value.filter(file => !file.type.startsWith('image/'))
      dataBase64List.value = dataBase64List.value.filter(
        (_, index) => !fileList.value[index]?.type.startsWith('image/')
      )

      // 清空对话组中的图片（保留文件）
      if (fileUrl.value) {
        try {
          const files = JSON.parse(fileUrl.value)
          if (Array.isArray(files)) {
            const nonImageFiles = files.filter(file => file.type === 'document')
            // 更新对话组文件信息
            await chatStore.updateGroupInfo({
              groupId: activeGroupId.value,
              fileUrl: nonImageFiles.length > 0 ? JSON.stringify(nonImageFiles) : '',
            })
            // 刷新数据以更新UI
            await chatStore.queryMyGroup()
          }
        } catch (error) {
          // Clear image failed
        }
      }
    }
  }
)

// 修改clearData方法，统一使用JSON处理，支持视频删除
const clearData = async (index: number, isSavedFile = false, fileType?: string) => {
  if (isSavedFile) {
    // 处理已保存的文件，从对话组中删除文件
    try {
      if (fileUrl.value) {
        const files = JSON.parse(fileUrl.value)
        if (Array.isArray(files) && index >= 0 && index < files.length) {
          files.splice(index, 1)
          // 更新对话组文件信息
          await chatStore.updateGroupInfo({
            groupId: activeGroupId.value,
            fileUrl: files.length > 0 ? JSON.stringify(files) : '',
          })
          // 刷新数据以更新UI
          await chatStore.queryMyGroup()
        }
      }
    } catch (error) {
      // 删除文件失败
    }
  } else {
    // 处理新上传的文件，从本地列表中移除
    // 视频文件现在也存储在 fileList 和 dataBase64List 中
    if (index >= 0 && index < dataBase64List.value.length) {
      dataBase64List.value.splice(index, 1)
      fileList.value.splice(index, 1)
    }
  }
}

const showUploadMenu = ref(false)

// 根据设备类型动态设置上传菜单的触发方式
const uploadMenuTrigger = computed(() => {
  // 移动端使用点击模式，桌面端使用悬停模式
  return isMobile.value ? 'click' : 'hover'
})

// 计算输入框占位符文本，根据不同工具状态显示不同提示
const placeholderText = computed(() => {
  const activeFeatures = []

  // 根据工具状态添加提示
  if (usingDeepThinking.value) {
    activeFeatures.push(t('chat.usingDeepThinking'))
  }

  // 使用统一的工具提示
  if (usingTool.value) {
    activeFeatures.push(t('chat.usingTools'))
  }

  // 拖拽状态提示
  if (isDragging.value) {
    return t('chat.dropFileHere')
  }

  // 如果有特殊功能激活，则显示功能描述
  if (activeFeatures.length > 0) {
    return activeFeatures.join('，')
  }

  // 默认提示
  return t('chat.sendMessageToPrefix') + siteName.value + t('chat.sendMessageToSuffix')
})

// 按钮显示优先级
// 统一的工具按钮显示判断
const shouldShowTool = computed(() => {
  // 检查是否支持工具（网络搜索或MCP）
  if (!isToolSupported.value) return false

  // 如果没有使用插件，直接显示
  if (!usingPlugin.value) return true

  // 对于特定插件（如PPT生成），允许同时使用工具
  const allowedPlugins = ['ppt-generation']
  return allowedPlugins.includes(usingPlugin.value?.parameters)
})

const shouldShowDeepThinking = computed(() => {
  // 检查是否支持深度思考
  if (!isDeepThinking.value) return false

  // 如果没有使用插件，直接显示
  if (!usingPlugin.value) return true

  // 对于特定插件（如PPT生成），允许同时使用深度思考
  const allowedPlugins = ['ppt-generation']
  return allowedPlugins.includes(usingPlugin.value?.parameters)
})

// 添加拖拽相关的处理函数
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  handleUnifiedFileDrop(event, 'area')
}

// 添加全局拖拽相关的处理函数
const handleDocumentDragOver = (event: DragEvent) => {
  event.preventDefault()
  // 检查是否有文件被拖动
  if (event.dataTransfer?.types.includes('Files')) {
    isFileDraggingOverPage.value = true
  }
}

const handleDocumentDragLeave = (event: DragEvent) => {
  // 只有当拖动到viewport外部时才重置状态
  if (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  ) {
    isFileDraggingOverPage.value = false
  }
}

const handleDocumentDrop = (event: DragEvent) => {
  // 重置拖拽状态
  isFileDraggingOverPage.value = false
  // 如果不是拖到了指定的上传区域，阻止默认行为
  if (!isDragging.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  chatStore.setPrompt('')

  // 设置焦点
  nextTick(() => {
    if (inputRef.value && !isMobile.value) {
      inputRef.value.focus()
    }
  })
  // 应用列表已在 App.vue 中初始化
  // 如果缓存为空（异常情况兜底），则主动查询一次
  if (appCatStore.allApps.length === 0) {
    appCatStore.queryAllApps()
  }

  // 添加全局拖拽事件监听
  document.addEventListener('dragover', handleDocumentDragOver)
  document.addEventListener('dragleave', handleDocumentDragLeave)
  document.addEventListener('drop', handleDocumentDrop)
})

onUnmounted(() => {
  // 移除全局拖拽事件监听
  document.removeEventListener('dragover', handleDocumentDragOver)
  document.removeEventListener('dragleave', handleDocumentDragLeave)

  document.removeEventListener('drop', handleDocumentDrop)
})

// 暴露方法供父组件使用
defineExpose({
  selectApp,
  clearSelectApp,
})

// 整合文件拖放处理逻辑
const handleUnifiedFileDrop = async (event: DragEvent, source: 'button' | 'area') => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
  isFileDraggingOverPage.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  // 将FileList转换为数组以便处理
  const fileArray = Array.from(files)

  // 分类文件
  const imageFiles = fileArray.filter(file => file.type.startsWith('image/'))
  const videoFiles = fileArray.filter(file => file.type.startsWith('video/'))
  const documentFiles = fileArray.filter(
    file => !file.type.startsWith('image/') && !file.type.startsWith('video/')
  )

  // 检查文件类型支持情况
  const canUploadImages = isImageModel.value
  const canUploadVideos = isVideoModel.value // 使用计算属性判断视频上传支持
  const canUploadDocuments = isFilesModel.value

  // 准备处理的文件数组
  const filesToProcess = []
  const unsupportedFiles = []

  // 检查图片文件
  if (imageFiles.length > 0) {
    if (canUploadImages) {
      filesToProcess.push(...imageFiles)
    } else {
      unsupportedFiles.push(
        ...imageFiles.map(f => ({
          name: f.name,
          reason: t('chat.modelNotSupportImage'),
        }))
      )
    }
  }

  // 检查视频文件
  if (videoFiles.length > 0) {
    if (canUploadVideos) {
      filesToProcess.push(...videoFiles)
    } else {
      unsupportedFiles.push(
        ...videoFiles.map(f => ({
          name: f.name,
          reason: t('chat.videoNotSupported'),
        }))
      )
    }
  }

  // 检查文档文件
  if (documentFiles.length > 0) {
    if (canUploadDocuments) {
      filesToProcess.push(...documentFiles)
    } else {
      unsupportedFiles.push(
        ...documentFiles.map(f => ({
          name: f.name,
          reason: t('chat.modelNotSupportFile'),
        }))
      )
    }
  }

  // 处理不支持的文件提示
  if (unsupportedFiles.length > 0) {
    // 按类型分组
    const imageCount = unsupportedFiles.filter(f =>
      f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
    ).length
    const videoCount = unsupportedFiles.filter(f =>
      f.name.match(/\.(mp4|webm|ogg|mov|avi)$/i)
    ).length
    const docCount = unsupportedFiles.length - imageCount - videoCount

    // 生成提示消息
    const messages = []
    if (imageCount > 0) messages.push(`${imageCount} 张图片`)
    if (videoCount > 0) messages.push(`${videoCount} 个视频`)
    if (docCount > 0) messages.push(`${docCount} 个文档`)

    if (messages.length > 0) {
      ms.warning(`无法上传 ${messages.join('、')}，当前不支持`)
    }
  }

  // 处理可以上传的文件
  for (const file of filesToProcess) {
    if (file.type.startsWith('image/')) {
      await processImageFile(file)
    } else if (file.type.startsWith('video/')) {
      await processVideoFile(file)
    } else {
      await processDocumentFile(file)
    }
  }
}

// 添加一个计算属性来判断是否显示上传按钮
const showUploadButton = computed(() => {
  return isFilesModel.value || isImageModel.value || isVideoModel.value
})

// 视频上传支持判断
const isVideoModel = computed(() => {
  if (usingPlugin.value) {
    const uploadTypes = getPluginUploadTypes(usingPlugin.value)
    return uploadTypes.includes('video')
  }
  // 普通模型：如果支持图片上传，也支持视频上传
  return activeModelImageUpload.value !== 0
})

// 知识库相关 - 仅在支持文件上传时才显示和使用
const hasKnowledgeFiles = computed(() => {
  const files = authStore.userInfo?.knowledgeFiles
  return files && Array.isArray(files) && files.length > 0
})

// 是否显示知识库选项
const showKnowledgeBaseOption = computed(() => {
  // 只有支持文件上传时才显示知识库选项
  return isFilesModel.value
})

const useKnowledgeBase = computed({
  get: () => {
    // 如果不支持文件上传，强制关闭知识库
    if (!isFilesModel.value) return false
    return useGlobalStore.useKnowledgeBase
  },
  set: (value: boolean) => {
    // 只有支持文件上传时才允许设置
    if (isFilesModel.value) {
      useGlobalStore.updateUseKnowledgeBase(value)
    } else {
      // 不支持文件上传时，强制关闭
      useGlobalStore.updateUseKnowledgeBase(false)
    }
  },
})

// 监听文件上传能力变化，自动关闭知识库
watch(isFilesModel, newValue => {
  if (!newValue && useKnowledgeBase.value) {
    useKnowledgeBase.value = false
  }
})

// 处理知识库点击
const handleKnowledgeBaseClick = () => {
  if (!hasKnowledgeFiles.value) {
    // 未配置：跳转到设置页面
    openKnowledgeSettings()
  } else {
    // 已配置：切换开关
    useKnowledgeBase.value = !useKnowledgeBase.value
  }
}

// 打开知识库设置
const openKnowledgeSettings = () => {
  showUploadMenu.value = false

  // 根据设备类型选择不同的设置对话框
  if (isMobile.value) {
    // 移动端：使用移动端设置对话框，传递 tabId 'data'
    useGlobalStore.updateMobileSettingsDialog(true, 'data')
  } else {
    // 桌面端：使用桌面端设置对话框，传递索引 2（数据管理）
    useGlobalStore.updateSettingsDialog(true, 2)
  }
}
</script>

<template>
  <div v-bind="$attrs">
    <!-- 移除全屏蒙版 -->

    <!-- before-footer slot -->
    <slot name="before-footer"></slot>

    <!-- Main footer content -->
    <div
      class="flex flex-col items-center justify-center w-full"
      :class="[isMobile ? 'px-3 pb-3' : 'px-2']"
    >
      <footer
        ref="footerRef"
        class="flex flex-col items-center justify-center w-full bg-transparent"
        :class="[dataSources.length > 0 ? 'max-w-4xl' : 'max-w-4xl']"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div class="flex justify-center w-full flex-col resize-none">
          <!-- <div
            class="absolute right-0 bottom-full left-0 h-10 bg-gradient-to-b from-transparent to-white/80 dark:to-gray-750/80"
            style="transition: opacity 0.3s ease"
          ></div> -->
          <ToolbarOptions
            :is-mermaid-model="isMermaidModel"
            :custom-options="customOptions"
            :custom-option-values="customOptionValues"
            @update-custom-option="(paramName, value) => (customOptionValues[paramName] = value)"
            @append-style="appendStyleToInput"
          />
        </div>

        <div
          class="flex w-full border border-gray-400 dark:border-gray-600 hover:ring-1 hover:ring-primary-500 dark:hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:focus-within:ring-primary-500 justify-center items-center flex-col rounded-3xl resize-none px-2 transition-all duration-200"
          :class="{
            'ring-1 ring-primary-500 dark:ring-primary-500': isDragging,
            'bg-gray-50 dark:bg-gray-700/80': isFileDraggingOverPage,
          }"
          :style="{ minHeight: '1.5rem', position: 'relative' }"
        >
          <!-- 移除多余的内部提示层 -->

          <div
            v-if="showSuggestions && !isSelectedApp && !usingPlugin && searchResults.length !== 0"
            class="w-full z-50 bg-white my-2 px-1 py-1 justify-center items-center flex-col rounded-2xl resize-none dark:bg-gray-800 border border-gray-400 dark:border-gray-600"
            :style="{
              minHeight: '1.5rem',
              position: 'absolute',
              top: props.dataSourcesLength || isMobile ? 'auto' : '100%',
              bottom: props.dataSourcesLength || isMobile ? '100%' : 'auto',
              left: '50%',
              transform: 'translateX(-50%)',
            }"
          >
            <div
              v-if="searchResults.length !== 0"
              v-for="app in searchResults"
              :key="app.id"
              @click="selectApp(app)"
              class="flex items-center bg-white dark:bg-gray-800 hover:bg-opacity py-2 px-2 dark:hover:bg-gray-700 rounded-2xl w-full cursor-pointer duration-150 ease-in-out"
            >
              <div
                class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
              >
                <img
                  v-if="app.coverImg"
                  :src="app.coverImg"
                  alt="Cover Image"
                  class="w-8 h-8 rounded-full flex justify-start"
                />
                <span
                  v-else
                  class="w-8 h-8 text-base font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
                >
                  {{ app.name.charAt(0) }}
                </span>
              </div>

              <h3 class="text-md font-bold text-gray-600 dark:text-primary-500 mr-3 flex-shrink-0">
                {{ app.name }}
              </h3>
              <p class="text-base text-gray-400 dark:text-gray-400 flex-grow truncate">
                {{ app.des }}
              </p>
            </div>
          </div>

          <FilePreview
            :data-base64-list="dataBase64List"
            :file-list="fileList"
            :saved-files="savedFiles"
            :is-selected-app="isSelectedApp"
            :using-plugin="usingPlugin"
            :selected-app="selectedApp"
            @clear-data="clearData"
            @clear-select-app="clearSelectApp"
          />
          <!-- 渐变阴影效果 -->

          <div class="relative w-full">
            <!-- 扩展按钮 - 只在内容高度超过阈值且没有模板时显示 -->
            <div
              v-if="shouldShowExpandButton && !isTemplateFormat"
              class="absolute right-1 top-2 z-10 group"
            >
              <button
                @click="toggleExpanded"
                class="btn-pill btn-sm"
                :aria-label="isExpanded ? t('chat.collapseInputBox') : t('chat.expandInputBox')"
              >
                <OffScreen v-if="isExpanded" size="15" />
                <FullScreen v-else size="15" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                {{ isExpanded ? t('chat.collapse') : t('chat.expand') }}
              </div>
            </div>

            <!-- 清空模板按钮 - 只在有模板内容时显示 -->

            <!-- 拖拽提示覆盖层 - 替代文本区域 -->
            <div
              v-if="isFileDraggingOverPage"
              class="h-20 flex items-center justify-center my-2 w-full"
            >
              <div class="flex flex-col items-center justify-center">
                <AddPicture
                  size="28"
                  class="mb-2"
                  :class="
                    isDragging
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                />
                <p
                  class="text-center text-sm"
                  :class="
                    isDragging
                      ? 'text-primary-600 dark:text-primary-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                >
                  {{ isDragging ? t('chat.dropFileHere') : t('chat.dragFileHere') }}
                </p>
              </div>
            </div>

            <!-- 文本区域 - 非拖拽状态显示 -->
            <!-- 模板渲染器 -->
            <div
              v-if="isTemplateFormat && !isFileDraggingOverPage"
              class="flex flex-grow items-start mt-3 mb-2 w-full px-2 bg-transparent min-h-[4rem] overflow-y-auto overscroll-contain custom-scrollbar"
              :style="{
                maxHeight: inputMaxHeight,
              }"
            >
              <TemplateRenderer
                ref="templateRendererRef"
                :modelValue="prompt"
                @update:modelValue="v => (prompt = v)"
                :placeholder="placeholderText || ''"
                @keypress="handleEnter"
              />
            </div>
            <!-- 普通输入框 -->
            <textarea
              v-else-if="!isFileDraggingOverPage"
              ref="inputRef"
              v-model="prompt"
              :placeholder="placeholderText"
              class="flex flex-grow items-center justify-center mt-3 mb-2 w-full placeholder:text-gray-400 dark:placeholder:text-gray-500 text-base resize-none dark:text-gray-400 px-2 bg-transparent overflow-y-auto overscroll-contain custom-scrollbar transition-all duration-300 ease-in-out"
              @input="autoResize"
              @keypress="handleEnter"
              @keyup="handleInput"
              @paste="handlePaste"
              :style="{
                maxHeight: inputMaxHeight,
                minHeight: '4rem',
              }"
              :aria-label="t('chat.chatMessageInput')"
              role="textbox"
            ></textarea>
          </div>

          <!-- 按钮容器 -->
          <div ref="buttonContainerRef" class="flex justify-between flex-grow w-full pb-2">
            <!-- 文件上传按钮区域 -->
            <div class="flex justify-start items-center">
              <!-- 统一的上传菜单 -->
              <div
                v-if="showUploadButton && !isUploading"
                ref="uploadMenuRef"
                class="group relative"
                @dragover.prevent="
                  (e: DragEvent) => {
                    e.stopPropagation()
                    isDragging = true
                  }
                "
                @dragleave.prevent="
                  (e: DragEvent) => {
                    e.stopPropagation()
                    isDragging = false
                  }
                "
                @drop.prevent="
                  (e: DragEvent) => {
                    e.stopPropagation()
                    isDragging = false
                    isFileDraggingOverPage = false
                    handleUnifiedFileDrop(e, 'button')
                  }
                "
              >
                <DropdownMenu
                  v-model="showUploadMenu"
                  :trigger="uploadMenuTrigger"
                  position="top-left"
                  max-height="35vh"
                  :z-index="99999"
                  :hover-delay="200"
                  :hover-close-delay="500"
                >
                  <template #trigger>
                    <button type="button" class="btn-pill mx-1" aria-label="上传菜单">
                      <Plus size="15" />
                    </button>
                  </template>

                  <template #menu="{ close }">
                    <div>
                      <!-- 文件上传 -->
                      <div
                        v-if="isFilesModel"
                        class="menu-item menu-item-md"
                        @click="
                          () => {
                            triggerUpload()
                            close()
                          }
                        "
                        role="menuitem"
                        tabindex="0"
                      >
                        <FolderUpload theme="outline" size="16" class="flex-shrink-0" />
                        <div class="menu-item-content">
                          <div class="menu-item-title">上传文件</div>
                        </div>
                      </div>

                      <!-- 图片/视频上传 -->
                      <div
                        v-if="isImageModel || isVideoModel"
                        class="menu-item menu-item-md"
                        @click="
                          () => {
                            imageInput?.click()
                            close()
                          }
                        "
                        role="menuitem"
                        tabindex="0"
                      >
                        <AddPicture theme="outline" size="16" class="flex-shrink-0" />
                        <div class="menu-item-content">
                          <div class="menu-item-title">
                            {{
                              isImageModel && isVideoModel
                                ? '上传图片/视频'
                                : isImageModel
                                  ? '上传图片'
                                  : '上传视频'
                            }}
                          </div>
                        </div>
                      </div>

                      <!-- 知识库开关 - 仅在支持文件上传时显示 -->
                      <div
                        v-if="showKnowledgeBaseOption"
                        class="menu-item menu-item-md select-none"
                        @click="handleKnowledgeBaseClick"
                        role="menuitem"
                        tabindex="0"
                      >
                        <BookOpen theme="outline" size="16" class="flex-shrink-0" />
                        <div class="menu-item-content">
                          <div class="menu-item-title">
                            用户知识库
                            <span
                              v-if="!hasKnowledgeFiles"
                              class="ml-2 text-xs text-gray-400 font-normal"
                            >
                              (未配置)
                            </span>
                          </div>
                        </div>

                        <!-- 右侧图标容器 -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <!-- 选中状态：实心勾勾（仅在有知识库文件且开启时显示） -->
                          <div v-if="hasKnowledgeFiles && useKnowledgeBase">
                            <CheckOne
                              theme="filled"
                              size="16"
                              class="text-gray-500 dark:text-gray-400"
                            />
                          </div>

                          <!-- 未选中状态：圆圈（仅在有知识库文件且未开启时显示） -->
                          <div v-if="hasKnowledgeFiles && !useKnowledgeBase">
                            <div
                              class="w-4 h-4 rounded-full border-2 border-gray-400 dark:border-gray-500"
                            ></div>
                          </div>

                          <!-- 右侧：箭头按钮（始终显示，点击跳转设置） -->
                          <button
                            class="btn-icon"
                            @click.stop="
                              () => {
                                openKnowledgeSettings()
                                close()
                              }
                            "
                          >
                            <Right theme="outline" size="14" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>
                </DropdownMenu>
              </div>

              <LoadingFour
                v-if="isUploading"
                size="15"
                class="p-1 mx-2 animate-rotate text-gray-500 dark:text-gray-500"
              />

              <!-- 隐藏的文件输入框 - 支持多选 -->
              <input
                ref="fileInput"
                type="file"
                multiple
                class="hidden"
                @change="handleFileSelect"
              />
              <input
                ref="imageInput"
                type="file"
                accept="image/*,video/*"
                multiple
                class="hidden"
                @change="handleImageSelect"
              />

              <div v-if="shouldShowDeepThinking" class="group relative">
                <div
                  class="btn-pill btn-md mx-1"
                  :class="[
                    usingDeepThinking ? 'btn-pill-active' : '',
                    isMobile ? 'w-8 h-8 p-0' : '',
                  ]"
                  @click="usingDeepThinking = !usingDeepThinking"
                  role="button"
                  :aria-pressed="usingDeepThinking"
                  :aria-label="t('chat.enableDeepThinking')"
                  tabindex="0"
                >
                  <TwoEllipses size="15" />
                  <span v-if="!isMobile" class="ml-1">{{ t('chat.deepThinking') }}</span>
                </div>
                <div v-if="!isMobile" class="tooltip tooltip-top">
                  {{ t('chat.deepThinkingTooltip') }}
                </div>
              </div>

              <!-- 统一的工具按钮 -->
              <div v-if="shouldShowTool" class="group relative">
                <div
                  class="btn-pill btn-md mx-1"
                  :class="[usingTool ? 'btn-pill-active' : '', isMobile ? 'w-8 h-8 p-0' : '']"
                  @click="usingTool = !usingTool"
                  role="button"
                  :aria-pressed="usingTool"
                  :aria-label="t('chat.enableTool')"
                  tabindex="0"
                >
                  <Sphere size="15" />
                  <span v-if="!isMobile" class="ml-1">{{ t('chat.tools') }}</span>
                </div>
                <div v-if="!isMobile" class="tooltip tooltip-top">
                  {{ t('chat.toolsTooltip') }}
                </div>
              </div>
            </div>

            <div class="flex justify-end items-center mr-1">
              <!-- 模型选择器 - 在发送按钮左侧 -->
              <div v-if="showModelSelectorInFooter" class="mr-2">
                <ModelSelector menu-position="top-right" />
              </div>
              <!-- 清空按钮 -->
              <div class="group relative" v-if="prompt && prompt.trim()">
                <button
                  type="button"
                  class="btn-pill mr-2"
                  @click="clearTemplateContent"
                  :aria-label="t('chat.clearContent')"
                >
                  <Clear size="15" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">清空</div>
              </div>
              <!-- 当不在加载状态时显示这个按钮，用于提交 -->
              <div v-if="!isStreamIn" class="group relative">
                <button
                  type="button"
                  class="btn-send"
                  :class="{ 'opacity-60 cursor-not-allowed': buttonDisabled, 'h-8 w-8': isMobile }"
                  :disabled="buttonDisabled"
                  @click="handleSubmit()"
                  :aria-label="t('chat.sendMessage')"
                >
                  <SendOne size="15" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
              </div>

              <!-- 当在加载状态时显示这个按钮，用于停止 -->
              <div v-if="isStreamIn" class="group relative">
                <button
                  type="button"
                  class="btn-stop"
                  :class="{ 'h-8 w-8': isMobile }"
                  @click="handleStop()"
                  :aria-label="t('chat.stopGenerating')"
                >
                  <Square size="16" />
                </button>
                <div v-if="!isMobile" class="tooltip tooltip-top">停止生成</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>

    <!-- after-footer slot -->
    <slot name="after-footer"></slot>
  </div>
</template>
