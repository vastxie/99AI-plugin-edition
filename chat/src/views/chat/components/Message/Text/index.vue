<script lang="ts" setup>
import { fetchTtsAPIProcess } from '@/api'
import { fetchQuerySingleChatLogAPI } from '@/api/chatLog'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { parseToolExecutions, type DisplayToolExecution } from '@/utils/toolExecutionParser'
import { sanitizeMarkdownHtml } from '@/utils/sanitizeHtml'
import {
  ArrowRight,
  Close,
  Copy,
  Delete,
  Edit,
  LoadingOne,
  MusicOne,
  Pause,
  PauseOne,
  PlayOne,
  Refresh,
  Rotation,
  Send,
  Sound,
  TwoEllipses,
  VoiceMessage,
} from '@icon-park/vue-next'
import mdKatex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css' // 更现代的深色主题
import 'highlight.js/styles/atom-one-light.css' // 更现代的浅色主题
import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ToolExecutionCard from './ToolExecutionCard.vue'

// 注册mermaid语言到highlight.js
hljs.registerLanguage('mermaid', () => ({
  name: 'mermaid',
  contains: [],
  keywords: {
    keyword: 'graph flowchart sequenceDiagram classDiagram stateDiagram gitGraph pie gantt',
    built_in: 'TD TB BT RL LR',
  },
  case_insensitive: true,
}))

// 注册样式覆盖，确保主题切换时正确应用对应样式
const injectThemeStyles = () => {
  // 检查是否已存在样式元素
  const existingStyle = document.getElementById('highlight-theme-overrides')
  if (existingStyle) return

  // 创建新的样式元素
  const style = document.createElement('style')
  style.id = 'highlight-theme-overrides'
  style.textContent = `
    /* 浅色模式覆盖 */
    html:not(.dark) .hljs {
      background: transparent !important;
      color: #383a42 !important;
    }

    /* 深色模式覆盖 */
    html.dark .hljs {
      background: transparent !important;
      color: #abb2bf !important;
    }

    /* 容器背景 */
    html:not(.dark) .code-block-wrapper {
      background-color: #fafafa;
    }

    html.dark .code-block-wrapper {
      background-color: #2f2f2f;
    }
  `
  document.head.appendChild(style)
}

interface Props {
  chatId?: number
  index: number
  isUserMessage?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  imageUrl?: string
  videoUrl?: string
  audioUrl?: string
  fileUrl?: string
  ttsUrl?: string
  model?: string
  isLast?: boolean
  usingTool?: boolean
  usingDeepThinking?: boolean
  reasoningText?: string
  fileAnalysisProgress?: number
  useFileSearch?: boolean
  agent_content?: string
  progress?: string
  taskId?: string
  customId?: string
  extend?: string
  taskData?: string
  action?: string
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
  (ev: 'copy'): void
}

interface TtsResponse {
  ttsUrl: string
}

const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const onConversation = inject<any>('onConversation')
const handleRegenerate = inject<any>('handleRegenerate')
const globalStore = useGlobalStoreWithOut()

// 检查是否在分享模式下
const isShareMode = inject('isShareMode', false)

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const showThinking = ref(false) // 默认折叠状态

// 深度思考相关状态
const reasoningSnippet = ref('')
const nextReasoningSnippet = ref('')
const snippetTimer = ref<any>(null)
const snippetTransition = ref(false) // 控制切换动画
const totalCharCount = ref(0) // 累计字符数
const thinkingScrollRef = ref<HTMLElement>() // 思考内容滚动容器引用
// const showToolCalls = ref(false) // 已移除工具调用展开功能
// const expandedResponses = ref<{ [key: string]: boolean }>({}) // 已移除工具调用展开功能
const textRef = ref<HTMLElement>()
const localTtsUrl = ref(props.ttsUrl)
const isHtml = ref(false)
const playbackState = ref('paused')
const browserTtsState = ref('paused')
const editableContent = ref(props.content)
const isEditable = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)
const isSpeechSynthesisSupported = ref(false)

// 控制后续提问建议动画
const promptSuggestionsAnimated = ref(false)
const shouldAnimatePrompts = ref(false)

let currentAudio: HTMLAudioElement | null = null
let speechSynthesisUtterance: SpeechSynthesisUtterance | null = null

const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, extraData?: any) => void>(
    'onOpenImagePreviewer'
  )
const onMediaPreview = inject<(data: any) => void>('onMediaPreview')

const chatStore = useChatStore()
const ttsMode = computed(() => Number(authStore.globalConfig?.ttsMode ?? 1)) // 默认值为1（默认TTS）
const enableHtmlRender = computed(() => Number(authStore.globalConfig?.enableHtmlRender ?? 0) === 1)

// 媒体相关状态
const isPlayingAudio = ref(false)
const audioRef = ref<HTMLAudioElement>()
const mediaRefreshTimer = ref<any>(null)

// 媒体状态
const isProcessing = computed(() => props.status === 2)

// 音频URL数组（支持多音频）
const audioUrlArray = computed(() => {
  const val = props.audioUrl
  if (!val) return []

  // 支持 JSON 字符串格式
  if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('audioUrls')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && Array.isArray(parsed.audioUrls)) {
        return parsed.audioUrls.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }

  // 支持数组格式
  if (Array.isArray(val)) {
    return val.filter(Boolean)
  }

  // 支持逗号分隔
  if (typeof val === 'string' && val.includes(',')) {
    return val.split(',').filter(Boolean)
  }

  // 支持单个URL
  if (typeof val === 'string' && val.trim()) {
    return [val.trim()]
  }

  return []
})

const isAudioUrl = computed(() => {
  return audioUrlArray.value.length > 0 || (props.modelType === 4 && isProcessing.value)
})

// 播放/暂停音频
const toggleAudioPlay = (e?: Event) => {
  e?.stopPropagation()
  if (!audioRef.value) return

  if (isPlayingAudio.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
  isPlayingAudio.value = !isPlayingAudio.value
}

// 音频结束事件
const onAudioEnded = () => {
  isPlayingAudio.value = false
}

// 处理媒体预览
const handleMediaPreview = () => {
  if (onMediaPreview) {
    let type = 'unknown'
    let urls: string[] = []

    if (imageUrlArray.value.length > 0) {
      type = 'image'
      urls = imageUrlArray.value
    } else if (videoUrlArray.value.length > 0) {
      type = 'video'
      urls = videoUrlArray.value
    } else if (props.modelType === 4 || audioUrlArray.value.length > 0) {
      type = 'audio'
      urls = audioUrlArray.value
    }

    onMediaPreview({
      type,
      urls,
      title: `${props.model || 'AI'} ${type}`,
      content: props.content,
      metadata: {
        model: props.model,
        taskId: props.taskId,
        customId: props.customId,
        extend: props.extend,
        taskData: props.taskData,
      },
    })
  }
}

// Removed unused searchResult and fileVectorResult computed properties
// These are now handled through the unified toolExecutions display

const computedPromptReference = computed(() => {
  // 从 agent_content 中提取推荐问题
  if (props.agent_content) {
    try {
      const agentData = JSON.parse(props.agent_content)
      if (agentData.data?.custom?.promptReference) {
        return agentData.data.custom.promptReference
      }
    } catch (e) {
      // Error parsing agent_content for promptReference
    }
  }
  return ''
})

// Removed unused toolCalls computed property
// Tool calls are now handled through the unified toolExecutions display

// 新的统一工具执行数组
const toolExecutions = computed<DisplayToolExecution[]>(() => {
  if (props.agent_content) {
    try {
      const agentData = JSON.parse(props.agent_content)

      // 使用统一的解析器
      const executions = parseToolExecutions(agentData)

      // 检查工作流是否已完成（收到close信号）
      if (agentData.metadata?.status === 'close' || agentData.metadata?.type === 'completed') {
        // 工作流已完成，确保所有工具执行状态都是成功的
        return executions.map(exec => ({
          ...exec,
          status: exec.status === 'loading' ? 'success' : exec.status,
        }))
      }

      // 检查AI是否已经开始回复
      const hasAIResponse =
        !!(text.value && text.value.trim().length > 0) ||
        !!(props.reasoningText && props.reasoningText.trim().length > 0)

      // 如果AI已开始回复，过滤掉没有实际内容的工具执行
      if (hasAIResponse && executions.length > 0) {
        const filtered = executions.filter(exec => {
          // 保留正在加载的工具（loading状态）
          if (exec.status === 'loading') return true
          // 保留有错误的工具执行（让用户看到错误）
          if (exec.status === 'error') return true
          // 保留有有效输出的工具
          if (exec.output) {
            // 数组类型的输出（如搜索结果）
            if (Array.isArray(exec.output)) return exec.output.length > 0
            // 其他类型的输出
            return true
          }
          return false
        })
        return filtered
      }

      return executions
    } catch (error) {
      return []
    }
  }
  return []
})

// Removed unused toolCallsContent and allToolsWithStatus computed properties
// Tool status is now handled through the unified toolExecutions display

const buttonGroupClass = computed(() => {
  return playbackState.value !== 'paused' || isEditable.value
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100'
})

const handlePlay = async () => {
  if (playbackState.value === 'loading' || playbackState.value === 'playing') return
  if (localTtsUrl.value) {
    playAudio(localTtsUrl.value)
    return
  }

  playbackState.value = 'loading'
  try {
    if (!props.chatId || !props.content) return

    const res = (await fetchTtsAPIProcess({
      chatId: props.chatId,
      prompt: props.content,
    })) as TtsResponse

    const ttsUrl = res.ttsUrl
    if (ttsUrl) {
      localTtsUrl.value = ttsUrl
      playAudio(ttsUrl)
    } else {
      throw new Error('TTS URL is undefined')
    }
  } catch (error) {
    playbackState.value = 'paused'
  }
}

function playAudio(audioSrc: string | undefined) {
  if (currentAudio) {
    currentAudio.pause()
  }
  currentAudio = new Audio(audioSrc)
  currentAudio
    .play()
    .then(() => {
      playbackState.value = 'playing'
    })
    .catch(() => {
      playbackState.value = 'paused'
    })

  currentAudio.addEventListener('ended', () => {
    playbackState.value = 'paused'
    currentAudio = null
  })
}

function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause()
    playbackState.value = 'paused'
  }
}

function playOrPause() {
  if (playbackState.value === 'playing') {
    pauseAudio()
  } else {
    handlePlay()
  }
}

function handleBrowserTts() {
  if (browserTtsState.value === 'playing') {
    stopBrowserTts()
  } else {
    playBrowserTts()
  }
}

// 处理生成音乐
function handleCreateMusic() {
  if (!props.taskData || !onConversation) return

  try {
    // 解析taskData获取歌词信息
    const customIdData = JSON.parse(props.taskData)

    // 发起音乐生成请求
    onConversation({
      msg: customIdData.title || '生成音乐',
      action: 'MUSIC',
      customId: props.customId,
      taskData: props.taskData,
      modelType: 4,
    })
  } catch (error) {}
}

function playBrowserTts() {
  if (!('speechSynthesis' in window)) {
    // 浏览器不支持语音合成API
    return
  }

  stopBrowserTts()

  speechSynthesisUtterance = new SpeechSynthesisUtterance(props.content)

  speechSynthesisUtterance.lang = 'zh-CN'
  speechSynthesisUtterance.rate = 1.0
  speechSynthesisUtterance.pitch = 1.0

  speechSynthesisUtterance.onstart = () => {
    browserTtsState.value = 'playing'
  }

  speechSynthesisUtterance.onend = () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }

  speechSynthesisUtterance.addEventListener('error', () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  })

  window.speechSynthesis.speak(speechSynthesisUtterance)
}

function stopBrowserTts() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }
}

const mdi = new MarkdownIt({
  linkify: true,
  html: enableHtmlRender.value,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      if (language === 'html') {
        globalStore.updateHtmlContent(code)
        isHtml.value = true
      } else if (language === 'mermaid') {
        // 识别mermaid代码块
        globalStore.updateHtmlContent(code, 'mermaid')
      } else if (language === 'markmap') {
        // 识别markmap代码块
        globalStore.updateHtmlContent(code, 'markmap')
      }
      // 注释掉：只转义字符串内容中的\n，保留语法高亮结构
      const highlightedCode = hljs.highlight(code, { language: lang }).value
      // const processedCode = highlightedCode.replace(
      //   /<span class="hljs-string"[^>]*>(.*?)<\/span>/g,
      //   (match, content) => {
      //     // 只在字符串内容中转义\n
      //     return match.replace(/\\n/g, '&#92;n')
      //   }
      // )
      // return highlightBlock(processedCode, lang)
      return highlightBlock(highlightedCode, lang)
    }

    // 注释掉：对auto高亮的结果也进行同样的精确转义处理
    const autoHighlightedCode = hljs.highlightAuto(code).value
    // const processedAutoCode = autoHighlightedCode.replace(
    //   /<span class="hljs-string"[^>]*>(.*?)<\/span>/g,
    //   (match, content) => {
    //     // 只在字符串内容中转义\n
    //     return match.replace(/\\n/g, '&#92;n')
    //   }
    // )
    // return highlightBlock(processedAutoCode, '')
    return highlightBlock(autoHighlightedCode, '')
  },
})

// 自定义HTML块渲染器 - 完整版CSS溢出隔离 + DOMPurify清理
mdi.renderer.rules.html_block = function (tokens, idx, options, env, renderer) {
  const token = tokens[idx]
  let content = token.content

  // 为HTML块添加完整的CSS隔离和安全清理
  if (content.trim()) {
    content = sanitizeMarkdownHtml(content)

    // 创建唯一的容器ID
    const containerId = `html-container-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

    // 使用完整的CSS隔离方案
    content = `
<div id="${containerId}" class="markdown-html-container" style="
  /* CSS Containment - 防止样式泄漏 */
  contain: content layout style;
  isolation: isolate;

  /* 布局控制 */
  all: initial;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;

  /* 视觉样式 */
  border-radius: 0.375rem;
  background: rgb(249 250 251 / 0.8);
  margin: 0.5rem 0;
  padding: 0.75rem;
">
<style>
/* 使用 :where() 降低特异性，避免冲突 */
:where(#${containerId}) {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
}

/* 关键元素样式重置 */
:where(#${containerId}) * {
  box-sizing: border-box !important;
  max-width: 100% !important;
}

/* 图片处理 */
:where(#${containerId}) img {
  max-width: 100% !important;
  height: auto !important;
  display: block;
  margin: 0.25rem 0;
}

/* 表格处理 */
:where(#${containerId}) table {
  max-width: 100% !important;
  width: 100% !important;
  border-collapse: collapse;
  margin: 0.25rem 0;
}

:where(#${containerId}) table td,
:where(#${containerId}) table th {
  border: 1px solid rgb(156 163 175 / 0.3);
  padding: 0.25rem 0.5rem;
}

/* 代码块处理 */
:where(#${containerId}) pre {
  background: rgb(243 244 246 / 0.9) !important;
  border-radius: 0.25rem !important;
  padding: 0.5rem !important;
  overflow-x: auto !important;
  margin: 0.25rem 0 !important;
}

:where(#${containerId}) code {
  background: rgb(243 244 246 / 0.6) !important;
  border-radius: 0.125rem !important;
  padding: 0.125rem 0.25rem !important;
  font-size: 0.875em !important;
}

:where(#${containerId}) pre code {
  background: transparent !important;
  padding: 0 !important;
}

/* 暗色主题 */
.dark :where(#${containerId}) {
  background: rgb(17 24 39 / 0.8);
}

.dark :where(#${containerId}) table td,
.dark :where(#${containerId}) table th {
  border-color: rgb(75 85 99 / 0.3);
}

.dark :where(#${containerId}) pre {
  background: rgb(31 41 55 / 0.9) !important;
}

.dark :where(#${containerId}) code {
  background: rgb(31 41 55 / 0.6) !important;
}
</style>
${content}
</div>`
  }

  return content
}

// 自定义内联HTML渲染器 - 简化版
mdi.renderer.rules.html_inline = function (tokens, idx, options, env, renderer) {
  const token = tokens[idx]
  let content = token.content
  return sanitizeMarkdownHtml(content)
}

// 用于存储代码块复制按钮的定时器
const copyTimeoutsMap = new Map()

// 复制代码的处理函数
function handleCodeCopy(blockId: string, element: HTMLElement) {
  // 复制开始
  // 如果已经是"已复制"状态，则不重复处理
  const copiedText = element.querySelector('.copied-text')
  if (copiedText && getComputedStyle(copiedText).display !== 'none') return

  const codeBlock = document.getElementById(blockId)
  if (!codeBlock) {
    // 未找到代码块
    return
  }

  const codeElement = codeBlock.querySelector('code')
  if (!codeElement || !codeElement.textContent) {
    // 未找到代码内容
    return
  }

  // 复制代码内容
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(codeElement.textContent)
        .then(() => {
          // 使用navigator.clipboard成功复制
          // 成功复制后更新UI
          updateCopyButtonState(element, blockId)
        })
        .catch(() => {
          // navigator.clipboard复制失败
          // 尝试回退方法
          fallbackCopy(codeElement.textContent, element, blockId)
        })
    } else {
      // 回退到传统方法
      fallbackCopy(codeElement.textContent, element, blockId)
    }
  } catch (error) {
    // 复制过程出错
    message()?.error(t('chat.copyFailed'))
  }
}

// 回退复制方法
function fallbackCopy(text: string | null, element: HTMLElement, blockId: string) {
  if (!text) {
    // 复制内容为空
    message()?.error(t('chat.copyFailed'))
    return
  }

  try {
    copyText({ text: text, origin: true })
    // 使用fallback方法复制成功
    updateCopyButtonState(element, blockId)
  } catch (error) {
    // fallback复制失败
    message()?.error(t('chat.copyFailed'))
  }
}

// 更新复制按钮状态
function updateCopyButtonState(element: HTMLElement, blockId: string) {
  // 防止重复处理
  if (element.getAttribute('data-copying') === 'true') return
  element.setAttribute('data-copying', 'true')

  // 查找按钮中的图标和文本元素
  const copyIconElement = element.querySelector('.copy-icon')
  const checkIconElement = element.querySelector('.check-icon')
  const copyTextElement = element.querySelector('.copy-text')
  const copiedTextElement = element.querySelector('.copied-text')

  if (copyIconElement && checkIconElement && copyTextElement && copiedTextElement) {
    // 隐藏复制图标和文本，显示勾图标和已复制文本
    copyIconElement.classList.add('hidden')
    copyTextElement.classList.add('hidden')
    checkIconElement.classList.remove('hidden')
    copiedTextElement.classList.remove('hidden')
  }

  // 成功提示
  message()?.success(t('chat.copySuccess'))

  // 清除之前的定时器
  if (copyTimeoutsMap.has(blockId)) {
    clearTimeout(copyTimeoutsMap.get(blockId))
  }

  // 设置新的定时器，3秒后恢复原始状态
  const timeoutId = setTimeout(() => {
    // 恢复原始按钮内容
    if (element) {
      const restoredCopyIconElement = element.querySelector('.copy-icon')
      const restoredCheckIconElement = element.querySelector('.check-icon')
      const restoredCopyTextElement = element.querySelector('.copy-text')
      const restoredCopiedTextElement = element.querySelector('.copied-text')

      if (
        restoredCopyIconElement &&
        restoredCheckIconElement &&
        restoredCopyTextElement &&
        restoredCopiedTextElement
      ) {
        // 恢复原状
        restoredCopyIconElement.classList.remove('hidden')
        restoredCopyTextElement.classList.remove('hidden')
        restoredCheckIconElement.classList.add('hidden')
        restoredCopiedTextElement.classList.add('hidden')
      }

      // 清除处理标记
      element.removeAttribute('data-copying')
    }
  }, 3000)

  // 存储定时器ID以便后续清理
  copyTimeoutsMap.set(blockId, timeoutId)
}

mdi.renderer.rules.image = function (tokens, idx) {
  const token = tokens[idx]
  const src = token.attrGet('src')
  const title = token.attrGet('title')
  const alt = token.content

  if (!src) return ''
  const safeSrc = mdi.utils.escapeHtml(src)
  const safeAlt = mdi.utils.escapeHtml(alt || '')
  const safeTitle = mdi.utils.escapeHtml(title || alt || '')

  return `<img src="${safeSrc}" alt="${safeAlt}" title="${safeTitle}" class="rounded-md max-h-[30vh] cursor-pointer hover:opacity-90 transition-opacity markdown-preview-image" />`
}

const imageUrlArray = computed(() => {
  const val = props.imageUrl
  if (!val) return []
  // 支持 JSON 字符串格式 {"imageUrls":[...]}
  if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('imageUrls')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && Array.isArray(parsed.imageUrls)) {
        return parsed.imageUrls.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  // 新增：支持 JSON 数组字符串格式
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(val)
      if (Array.isArray(arr)) {
        return arr.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  if (typeof val === 'string') {
    // 兼容逗号分隔
    return val
      .split(',')
      .map(url => url.trim())
      .filter(Boolean)
  }
  if (Array.isArray(val)) return val
  return []
})

const isImageUrl = computed(() => {
  if (!props.imageUrl) return false

  // 如果已经成功提取了URLs，则认为是图片
  if (imageUrlArray.value.length > 0) {
    return true
  }

  // 如果没有提取出来，检查原始值
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(props.imageUrl)
})

// 辅助函数：检查是否是有效的视频URL
const isValidVideoUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  // 检查是否包含视频文件扩展名或是视频流URL
  return (
    /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v|3gp)(\?.*)?$/i.test(url) ||
    /^(https?:\/\/).*\/(video|stream|media)\//i.test(url) ||
    /^blob:https?:\/\//i.test(url)
  )
}

const videoUrlArray = computed(() => {
  const val = props.videoUrl
  if (!val) return []

  // 支持 JSON 字符串格式 {"videoUrls":[...]}
  if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('videoUrls')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && Array.isArray(parsed.videoUrls)) {
        return parsed.videoUrls
          .map((item: any) => item.url)
          .filter((url: string) => isValidVideoUrl(url)) // 验证是否真的是视频URL
      }
    } catch (e) {}
  }

  // 新增：支持 JSON 数组字符串格式
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(val)
      if (Array.isArray(arr)) {
        // 处理可能的对象数组或字符串数组
        return arr
          .map((item: any) => (typeof item === 'string' ? item : item.url))
          .filter(url => isValidVideoUrl(url)) // 验证是否真的是视频URL
      }
    } catch (e) {}
  }

  if (typeof val === 'string') {
    // 只有当字符串本身看起来像是视频URL时才处理
    // 避免将普通文本内容误认为是视频
    if (isValidVideoUrl(val)) {
      return [val]
    }

    // 如果包含逗号，尝试分割并验证每个部分
    if (val.includes(',')) {
      const urls = val
        .split(',')
        .map(url => url.trim())
        .filter(url => isValidVideoUrl(url))
      if (urls.length > 0) {
        return urls
      }
    }
  }

  if (Array.isArray(val)) {
    // 过滤数组中的有效视频URL
    return val.filter(url => isValidVideoUrl(url))
  }

  return []
})

const isVideoUrl = computed(() => {
  // 只有当确实解析出有效的视频URL时才显示视频播放器
  return videoUrlArray.value.length > 0
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, {
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  inlineClass: 'katexmath-inline',
  errorColor: ' #cc0000',
})

function renderCitationLinks(value: string) {
  return value.replace(
    /\[\[(\d+)\]\((https?:\/\/[^)]+)\)\]/g,
    '<a class="bg-gray-500 text-white rounded-full w-4 h-4 mx-1 justify-center items-center text-sm hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 inline-flex" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )
}

const text = computed(() => {
  let value = props.content || ''

  let modifiedValue = renderCitationLinks(
    value
      .replace(/\\\(\s*/g, '$')
      .replace(/\s*\\\)/g, '$')
      .replace(/\\\[\s*/g, '$$')
      .replace(/\s*\\\]/g, '$$')
  )

  if (!props.isUserMessage) {
    return sanitizeMarkdownHtml(mdi.render(modifiedValue))
  }

  return modifiedValue
})

const reasoningText = computed<string>(() => {
  let value = props.reasoningText || ''

  let modifiedValue = renderCitationLinks(
    value
      .replace(/\\\(\s*/g, '$')
      .replace(/\s*\\\)/g, '$')
      .replace(/\\\[\s*/g, '$$')
      .replace(/\s*\\\]/g, '$$')
  )

  if (!props.isUserMessage) {
    return sanitizeMarkdownHtml(mdi.render(modifiedValue))
  }

  return modifiedValue
})

// 深度思考的加载状态
const reasoningLoading = computed(() => {
  return (
    (props.loading && props.usingDeepThinking && !text.value) ||
    (props.loading && props.reasoningText && !text.value)
  )
})

// 深度思考的显示文本
const reasoningDisplayText = computed(() => {
  // 如果正在加载，显示深度思考中
  if (reasoningLoading.value) {
    return '深度思考中'
  }

  // 如果有reasoningText，显示已深度思考
  if (props.reasoningText) {
    return '已深度思考'
  }

  // 默认显示深度思考
  return '深度思考'
})

// 从reasoningText的最后内容中提取片段
const extractLatestSnippet = (html: string): string => {
  // 创建临时元素来提取纯文本
  const temp = document.createElement('div')
  temp.innerHTML = html
  const snippetText = temp.textContent || temp.innerText || ''

  // 清理文本，移除多余空白
  const cleanText = snippetText.replace(/\s+/g, ' ').trim()

  // 判断是否为移动端
  const isNarrowViewport = window.innerWidth < 768
  const maxLength = isNarrowViewport ? 25 : 50

  // 如果文本太短，直接返回
  if (cleanText.length <= maxLength) {
    return cleanText
  }

  // 取最后的字符
  return '...' + cleanText.slice(-maxLength)
}

function highlightBlock(str: string, lang?: string) {
  const blockId = `code-block-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const isHtmlLang = lang === 'html'
  const isMermaidLang = lang === 'mermaid'
  const isMarkmapLang = lang === 'markmap'

  // 直接返回带样式的HTML
  return `<pre
    class="max-w-full border border-gray-200 bg-[#AFB8C133] dark:border-gray-700 dark:bg-gray-750 transition-colors"
    id="${blockId}"
    style="line-height: normal; margin: 0 !important; padding: 0 !important; border-radius: 0.75rem !important; width: 100% !important; overflow: hidden !important;"
  ><div class="code-block-header sticky w-full h-10 flex justify-between items-center px-3 border-b border-gray-100 dark:border-gray-700 z-10">
    <span class="text-gray-600 dark:text-gray-400 text-sm font-medium flex items-center">${lang || 'text'}</span>
    <div class="flex gap-2">
      ${
        isHtmlLang && !isShareMode
          ? `<button class="h-7 gap-1 btn-pill btn-preview" data-block-id="${blockId}">
          <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-current"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M20 24V17.0718L26.8021 20.5359L33.6042 24L26.8021 27.4641L20 30.9282V24Z" fill="none" stroke="currentColor" stroke-width="3"/></svg>
          预览
        </button>`
          : ''
      }
      ${
        isMermaidLang && !isShareMode
          ? `<button class="h-7 gap-1 btn-pill preview-mermaid btn-preview" data-block-id="${blockId}">
          <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-current"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M20 24V17.0718L26.8021 20.5359L33.6042 24L26.8021 27.4641L20 30.9282V24Z" fill="none" stroke="currentColor" stroke-width="3"/></svg>
          预览
        </button>`
          : ''
      }
      ${
        isMarkmapLang && !isShareMode
          ? `<button class="h-7 gap-1 btn-pill preview-markmap btn-preview" data-block-id="${blockId}">
          <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-current"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/><path d="M20 24V17.0718L26.8021 20.5359L33.6042 24L26.8021 27.4641L20 30.9282V24Z" fill="none" stroke="currentColor" stroke-width="3"/></svg>
          预览
        </button>`
          : ''
      }
      <button class="h-7 gap-1 btn-pill btn-copy" data-block-id="${blockId}">
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="copy-icon text-current"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="check-icon text-current hidden"><path d="M10 24L20 34L40 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="copy-text">${t('chat.copyCode')}</span>
        <span class="copied-text hidden">已复制</span>
      </button>
    </div>
  </div><code
    class="hljs code-content-scrollable custom-scrollbar px-4 py-3 text-base bg-white dark:bg-[#282c34] rounded-b-2xl leading-normal code-container"
    style="margin-top: 0; padding-right: 0.75rem !important; padding-left: 0.75rem !important; display: block !important; white-space: pre !important; max-width: 100% !important; width: 100% !important; overflow-x: auto !important;"
  >${str}</code></pre>`
}

async function handleEditMessage() {
  if (isEditable.value) {
    const tempEditableContent = editableContent.value
    await onConversation({
      msg: tempEditableContent,
      imageUrl: props.imageUrl,
      videoUrl: props.videoUrl,
      fileUrl: props.fileUrl,
      chatId: props.chatId,
    })

    isEditable.value = false
  } else {
    editableContent.value = props.content
    isEditable.value = true
    await nextTick()
    adjustTextareaHeight()
  }
}

// 处理AI消息编辑（侧边编辑器）
function handleEditAIMessage() {
  // 切换编辑器状态：如果已打开则关闭，如果关闭则打开
  if (globalStore.showMessageEditor) {
    // 如果编辑器已打开，关闭它
    globalStore.updateMessageEditor(false)
  } else {
    // 如果编辑器关闭，打开并加载内容
    // 获取当前对话组名称
    const activeGroupInfo = chatStore.getChatByGroupInfo()
    const conversationTitle = activeGroupInfo?.title || '新对话'
    globalStore.updateMessageEditor(true, props.content || '', conversationTitle)
  }
}

async function handleMessage(item: string) {
  await onConversation({
    msg: item,
  })
}

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

const cancelEdit = () => {
  isEditable.value = false
  editableContent.value = props.content
}

// 获取图片容器样式类
const getImageContainerClass = () => {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return '' // 单张图片不需要额外容器样式
  } else {
    // 统一使用弹性布局+自动换行
    return 'flex flex-wrap gap-2'
  }
}

// 获取图片容器样式
const getImageContainerStyle = () => {
  return {
    maxWidth: props.isUserMessage ? (isMobile.value ? '60vw' : '40vw') : '80vw',
    width: 'auto',
    height: 'auto',
    minHeight: 'auto',
  }
}

// 获取单个图片的样式类
const getImageClass = () => {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return 'rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity'
  } else {
    return 'rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0'
  }
}

// 获取图片内联样式
const getImageStyle = () => {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return {
      maxHeight: '25vh',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain' as const,
    }
  } else {
    // 多张图片限制最大高度：移动端20vh，桌面端25vh
    return {
      maxWidth: '100%',
      height: 'auto',
      maxHeight: isMobile.value ? '20vh' : '25vh',
      objectFit: 'contain' as const,
    }
  }
}

const adjustTextareaHeight = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto'
    textarea.value.style.height = `${textarea.value.scrollHeight}px`
  }
}

watch(
  () => props.loading,
  isLoading => {
    // 仅处理非用户消息
    if (props.isUserMessage) return

    nextTick(() => {
      const container = textRef.value
      if (container) {
        const codeElements = container.querySelectorAll('code.code-content-scrollable')
        codeElements.forEach(element => {
          const codeEl = element as HTMLElement
          const parentDiv = codeEl.parentElement

          if (!isLoading) {
            // 加载完成: 设置最大高度和滚动
            codeEl.style.maxHeight = '50vh'
            codeEl.style.overflowY = 'auto'
            codeEl.style.display = 'block !important' // 确保 code 是块级元素以应用高度和滚动
            codeEl.style.whiteSpace = 'pre !important'
            codeEl.style.minWidth = 'fit-content !important'

            if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
              parentDiv.style.overflowX = 'auto !important'
              parentDiv.style.maxWidth = '100% !important'
            }

            // 确保滚动条可见
            setTimeout(() => {
              // 强制重新计算布局，确保滚动条显示
              codeEl.style.overflow = 'hidden'
              void codeEl.offsetHeight // 触发回流
              codeEl.style.overflowY = 'auto'

              if (parentDiv) {
                void parentDiv.offsetHeight
                parentDiv.style.overflowX = 'auto !important'
              }
            }, 100)
          } else {
            // 正在加载: 移除限制，允许内容扩展
            codeEl.style.maxHeight = 'none'
            codeEl.style.overflowY = 'visible' // 或者 hidden，取决于是否希望看到溢出
            // display: block 可以在 CSS 中设置或在这里保留
            codeEl.style.display = 'block !important'
            codeEl.style.whiteSpace = 'pre !important'
          }
        })
      }
    })
  },
  { immediate: true } // 初始渲染时也根据 loading 状态设置一次
)

// 在watch中监听editableContent的变化
watch(editableContent, () => {
  if (isEditable.value) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

// 监听isEditable状态变化，确保切换到编辑模式时调整高度
watch(isEditable, newVal => {
  if (newVal) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

// 用于记录是否已经启动了定时器
let timerStarted = false

// 监听 computedPromptReference 的变化，控制动画
watch(
  () => computedPromptReference.value,
  newVal => {
    if (newVal && !promptSuggestionsAnimated.value) {
      // 延迟一下再播放动画，确保DOM已更新
      nextTick(() => {
        shouldAnimatePrompts.value = true
        promptSuggestionsAnimated.value = true
      })
    }
  }
)

// 监听深度思考状态，处理滚动文本
watch(
  [() => props.reasoningText, () => props.loading, () => props.usingDeepThinking, showThinking],
  ([newReasoningText, newLoading, , isShowThinking]) => {
    // 如果有深度思考内容且不是用户消息
    if (!props.isUserMessage) {
      // 更新累计字符数
      if (newReasoningText) {
        const temp = document.createElement('div')
        temp.innerHTML = newReasoningText
        const reasoningPlainText = temp.textContent || temp.innerText || ''
        totalCharCount.value = reasoningPlainText.replace(/\s+/g, ' ').trim().length
      }

      // 处理折叠状态下的滚动文本 - 只在loading时更新
      if (!isShowThinking && newReasoningText && newLoading && totalCharCount.value >= 40) {
        // 只在第一次或定时器未启动时初始化
        if (!timerStarted) {
          timerStarted = true

          // 立即显示第一段文本
          reasoningSnippet.value = extractLatestSnippet(newReasoningText)
          nextReasoningSnippet.value = ''
          snippetTransition.value = false

          // 设置定时器，每2秒触发一次切换
          snippetTimer.value = setInterval(() => {
            // 只在仍在loading时继续更新
            if (!props.loading) {
              clearInterval(snippetTimer.value)
              snippetTimer.value = null
              timerStarted = false
              return
            }

            // 提取新的文本片段
            const newSnippet = extractLatestSnippet(props.reasoningText || '')

            // 如果内容有变化，执行切换动画
            if (newSnippet !== reasoningSnippet.value) {
              nextReasoningSnippet.value = newSnippet
              snippetTransition.value = true

              // 500ms后完成切换
              setTimeout(() => {
                reasoningSnippet.value = newSnippet
                snippetTransition.value = false
                nextReasoningSnippet.value = ''
              }, 500)
            }
          }, 2000)
        }
      } else if (!newLoading || isShowThinking) {
        // loading结束或展开时清理定时器
        if (snippetTimer.value) {
          clearInterval(snippetTimer.value)
          snippetTimer.value = null
        }
        // 无论是loading结束还是展开，都重置timerStarted
        // 这样再次折叠时可以重新启动定时器
        timerStarted = false
        if (!newLoading) {
          // loading结束时重置其他状态
          snippetTransition.value = false
          nextReasoningSnippet.value = ''
        }
      }

      // 当思考内容展开且正在流式更新时，自动滚动到底部
      if (isShowThinking && newLoading && newReasoningText && thinkingScrollRef.value) {
        nextTick(() => {
          if (thinkingScrollRef.value) {
            thinkingScrollRef.value.scrollTop = thinkingScrollRef.value.scrollHeight
          }
        })
      }
    }
  },
  { immediate: false }
)

// 组件卸载时清理定时器
onUnmounted(() => {
  if (snippetTimer.value) {
    clearInterval(snippetTimer.value)
    snippetTimer.value = null
  }
  timerStarted = false
  totalCharCount.value = 0
})

defineExpose({ textRef })

onMounted(() => {
  // 检测浏览器是否支持语音合成API
  isSpeechSynthesisSupported.value = 'speechSynthesis' in window

  // 注入主题覆盖样式
  injectThemeStyles()

  // 控制后续提问建议动画 - 仅在初次挂载时播放
  if (!promptSuggestionsAnimated.value && computedPromptReference.value) {
    shouldAnimatePrompts.value = true
    promptSuggestionsAnimated.value = true
  }

  // 添加复制功能
  const setupCodeCopy = () => {
    // 设置代码复制功能
    // 选择包含btn-copy类的按钮
    const copyButtons = document.querySelectorAll('.btn-copy[data-block-id]')
    copyButtons.forEach(button => {
      const blockId = button.getAttribute('data-block-id')
      if (!blockId) return

      // 检查按钮是否已经绑定了事件（添加自定义属性标记）
      if (button.getAttribute('data-listener-attached') === 'true') {
        return
      }

      // 添加新的事件处理程序
      button.addEventListener('click', event => {
        event.stopPropagation()
        event.preventDefault()
        // 复制按钮被点击
        handleCodeCopy(blockId, button as HTMLElement)
      })

      // 标记按钮已绑定事件
      button.setAttribute('data-listener-attached', 'true')
    })
  }

  // 初始设置和DOM更新后重新设置
  setupCodeCopy()

  // 监听DOM变化，当新的代码块出现时设置复制功能
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的代码块按钮被添加
    let hasNewButtons = false
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // 元素节点
            const element = node as HTMLElement
            // 检查是否包含未绑定事件的复制按钮
            const newButtons = element.querySelectorAll(
              '.btn-copy:not([data-listener-attached="true"])'
            )
            if (newButtons.length > 0) {
              hasNewButtons = true
            }
          }
        })
      }
    })

    // 只有在确实有新按钮时才执行设置
    if (hasNewButtons) {
      setupCodeCopy()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // 媒体状态刷新（处理中状态时定时刷新）
  watch(
    () => props.status,
    newStatus => {
      if (props.modelType && [2, 3, 4].includes(props.modelType)) {
        if (newStatus === 2 && !mediaRefreshTimer.value) {
          // 处理中状态，启动定时刷新
          mediaRefreshTimer.value = setInterval(async () => {
            try {
              if (props.chatId && props.index !== undefined) {
                const response = (await fetchQuerySingleChatLogAPI({
                  chatId: props.chatId,
                })) as any

                const result = response.data

                // 更新聊天数据
                chatStore.updateGroupChatSome(props.index, {
                  status: result.status,
                  content: result.content,
                  imageUrl: result.imageUrl,
                  videoUrl: result.videoUrl,
                  audioUrl: result.audioUrl,
                  drawId: result.drawId,
                  customId: result.customId,
                  taskData: result.taskData,
                  modelType: result.modelType,
                })

                // 如果状态不再是处理中，停止定时器
                if (result.status !== 2) {
                  clearInterval(mediaRefreshTimer.value)
                  mediaRefreshTimer.value = null
                }
              }
            } catch (error) {
              // 静默处理错误，避免打扰用户
            }
          }, 5000) // 每5秒刷新一次
        } else if (newStatus !== 2 && mediaRefreshTimer.value) {
          // 非处理中状态，停止刷新
          clearInterval(mediaRefreshTimer.value)
          mediaRefreshTimer.value = null
        }
      }
    },
    { immediate: true }
  )

  // 卸载时清理
  onUnmounted(() => {
    observer.disconnect()
    // 清理所有定时器
    copyTimeoutsMap.forEach(timeoutId => clearTimeout(timeoutId))
    copyTimeoutsMap.clear()
    // 清理媒体刷新定时器
    if (mediaRefreshTimer.value) {
      clearInterval(mediaRefreshTimer.value)
    }
  })

  const handlePreviewClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const markdownImage = target.closest('img.markdown-preview-image') as HTMLImageElement | null
    if (markdownImage?.getAttribute('src')) {
      event.stopPropagation()
      openSingleImagePreview(markdownImage.getAttribute('src') || '')
      return
    }

    // 查找包含btn-preview类的按钮或其父元素
    const previewButton = target.classList?.contains('btn-preview')
      ? target
      : target.closest('.btn-preview')

    if (previewButton && previewButton.getAttribute('data-block-id')) {
      event.stopPropagation()
      event.preventDefault()

      const blockId = previewButton.getAttribute('data-block-id')
      if (blockId) {
        const codeBlock = document.getElementById(blockId)
        if (codeBlock) {
          const codeElement = codeBlock.querySelector('code')
          if (codeElement && codeElement.textContent) {
            // 检查是否是Mermaid图表
            const isMermaid = previewButton.classList.contains('preview-mermaid')
            // 更新当前点击的内容到全局存储，标记类型
            globalStore.updateHtmlContent(
              codeElement.textContent || '',
              isMermaid ? 'mermaid' : 'html'
            )
            // 打开预览器，由预览器自动收集所有代码块
            globalStore.updateHtmlPreviewer(true)
          }
        }
      }
    }
  }

  document.addEventListener('click', handlePreviewClick)

  onUnmounted(() => {
    document.removeEventListener('click', handlePreviewClick)
  })

  // 初始化代码块样式
  nextTick(() => {
    const container = textRef.value
    if (container) {
      const codeElements = container.querySelectorAll('code.code-content-scrollable')
      codeElements.forEach(element => {
        const codeEl = element as HTMLElement
        const parentDiv = codeEl.parentElement

        // 设置样式
        codeEl.style.maxHeight = '50vh'
        codeEl.style.overflowY = 'auto'
        codeEl.style.display = 'block !important'
        codeEl.style.whiteSpace = 'pre !important'
        codeEl.style.minWidth = 'fit-content !important'

        if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
          parentDiv.style.overflowX = 'auto !important'
          parentDiv.style.maxWidth = '100% !important'
        }

        // 确保滚动条可见
        setTimeout(() => {
          // 强制重新计算布局，确保滚动条显示
          codeEl.style.overflow = 'hidden'
          void codeEl.offsetHeight // 触发回流
          codeEl.style.overflowY = 'auto'

          if (parentDiv) {
            void parentDiv.offsetHeight
            parentDiv.style.overflowX = 'auto !important'
          }
        }, 100)
      })
    }
  })

  // 停止音频播放并清理资源
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (speechSynthesisUtterance) {
    window.speechSynthesis.cancel()
  }

  // 监听 code button 点击事件
  setTimeout(() => {
    // 预览按钮
    const htmlPreviewBtns = document.querySelectorAll(
      '.btn-preview:not(.preview-mermaid):not(.preview-markmap)'
    )
    const mermaidPreviewBtns = document.querySelectorAll('.preview-mermaid')
    const markmapPreviewBtns = document.querySelectorAll('.preview-markmap')
    const copyBtns = document.querySelectorAll('.btn-copy')

    // HTML预览按钮点击处理
    htmlPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'html')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Mermaid预览按钮点击处理
    mermaidPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'mermaid')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Markmap预览按钮点击处理
    markmapPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'markmap')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Copy button click handlers
    copyBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          // 复制代码到剪贴板
          navigator.clipboard.writeText(code).then(() => {
            const copyBtn = e.currentTarget as HTMLElement
            // const copyIcon = copyBtn.querySelector('.copy-icon')
            const originalHTML = copyBtn.innerHTML

            // 显示成功状态
            copyBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-green-500">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 24L9 19L19 29L39 9L44 14L19 39L4 24Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                已复制
              `

            // 2秒后恢复原样
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML
            }, 2000)
          })
          // .catch(() => {
          //   // 复制失败处理
          //   alert('复制失败，请手动复制')
          // })
        }
      })
    })
  }, 100)
})

function openImagePreview(index: number) {
  // 通知父组件打开预览器
  if (onOpenImagePreviewer && imageUrlArray.value.length > 0) {
    onOpenImagePreviewer(imageUrlArray.value, index)
  }
}

// 打开单张图片预览
function openSingleImagePreview(src: string) {
  if (onOpenImagePreviewer) {
    onOpenImagePreviewer([src], 0)
  }
}
</script>

<template>
  <div class="text-wrap flex w-full flex-col px-1 group">
    <!-- 主文本内容 -->
    <div ref="textRef" class="flex w-full max-w-full overflow-hidden">
      <!-- AI回复内容 -->
      <div v-if="!isUserMessage" class="w-full max-w-full overflow-hidden">
        <!-- 统一的工具执行显示 -->
        <div v-if="toolExecutions.length > 0" class="flex flex-col gap-2 mb-2">
          <!-- 显示存在的工具执行 -->
          <ToolExecutionCard
            v-for="(execution, idx) in toolExecutions.filter(t => {
              // 必须有input
              if (!t.input) return false

              // 如果正在加载中，显示
              if (t.status === 'loading') return true

              // 如果是MCP工具，只要status是success就显示（不管结果多少）
              if (t.type === 'mcp' && t.status === 'success') return true

              // 对于搜索工具，检查是否有结果
              if (t.type === 'search' && t.output) {
                // 数组类型，检查长度
                if (Array.isArray(t.output)) {
                  return t.output.length > 0
                }
              }

              // 其他情况，有output就显示
              return !!t.output
            })"
            :key="execution.id"
            :tool="execution"
            :card-index="idx"
            :message-id="chatId"
          />
        </div>

        <!-- 深度思考内容 - 使用与工具卡片一致的样式 -->
        <div
          v-if="reasoningText || (loading && usingDeepThinking)"
          class="mb-2 thinking-card-wrapper"
        >
          <div
            class="thinking-card transition-all duration-300 ease-out rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col min-h-[2.625rem] overflow-hidden relative max-w-full"
            :class="{
              'bg-gray-50 dark:bg-gray-800 shadow-sm': showThinking,
              'hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-sm': !showThinking,
            }"
          >
            <!-- 主要状态栏 -->
            <button
              @click="showThinking = !showThinking"
              class="group flex flex-row items-center justify-between gap-4 transition-colors duration-200 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 min-h-[2.625rem] py-2 px-3 cursor-pointer"
            >
              <div class="flex flex-row items-center gap-2 min-w-0 flex-1">
                <!-- 图标 -->
                <TwoEllipses theme="outline" size="16" class="shrink-0" />

                <!-- 状态文本 -->
                <div
                  class="font-base text-left leading-tight overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0 relative"
                >
                  <!-- 显示深度思考片段或状态文本 -->
                  <div class="relative h-5 overflow-hidden">
                    <template
                      v-if="
                        !showThinking &&
                        reasoningLoading &&
                        totalCharCount >= 40 &&
                        reasoningSnippet
                      "
                    >
                      <!-- 固定宽度容器用于文字切换 -->
                      <div class="snippet-container">
                        <!-- 当前片段（向上滑出） -->
                        <span
                          class="snippet-text"
                          :class="{ 'snippet-slide-out': snippetTransition }"
                        >
                          {{ reasoningSnippet }}
                        </span>
                        <!-- 新片段（从下方滑入） -->
                        <span
                          v-if="nextReasoningSnippet && snippetTransition"
                          class="snippet-text snippet-slide-in"
                        >
                          {{ nextReasoningSnippet }}
                        </span>
                      </div>
                    </template>
                    <!-- 默认状态文本 -->
                    <template v-else>
                      <span class="block truncate">
                        {{ reasoningDisplayText }}
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <div class="flex flex-row items-center gap-1.5 min-w-0 shrink-0">
                <!-- 状态指示器 -->
                <LoadingOne v-if="reasoningLoading" class="animate-spin" size="16" />

                <!-- 展开/收起箭头 -->
                <div
                  v-if="reasoningText"
                  class="flex items-center justify-center transform transition-transform duration-300"
                  :class="{ '-rotate-180': showThinking }"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"
                    />
                  </svg>
                </div>
              </div>
            </button>

            <!-- 展开的深度思考内容 -->
            <transition name="slide-fade-reasoning">
              <div v-if="showThinking && reasoningText" class="overflow-hidden">
                <div class="px-3 pb-3 pt-0">
                  <div
                    ref="thinkingScrollRef"
                    :class="[
                      'markdown-body text-gray-600 dark:text-gray-400 max-h-96 overflow-y-auto overflow-x-hidden custom-scrollbar',
                      { 'markdown-body-generate': loading && !text },
                    ]"
                    v-html="reasoningText"
                  ></div>
                </div>
              </div>
            </transition>
          </div>
        </div>

        <!-- 三点加载动画 -->
        <div v-if="loading && !text" class="loading-animation inline-block align-middle ml-2">
          <span></span>
        </div>
        <div
          :class="[
            'markdown-body text-gray-950 dark:text-gray-100',
            { 'markdown-body-generate': loading || !text },
          ]"
          v-html="text"
        ></div>
      </div>

      <!-- 用户消息内容 -->
      <div
        v-else
        class="flex justify-end w-full max-w-full overflow-hidden"
        :class="[isMobile ? 'pl-20' : 'pl-28']"
        style="max-width: 100%"
      >
        <!-- 编辑模式 -->
        <div
          v-if="isEditable"
          class="p-3 rounded-2xl w-full bg-opacity dark:bg-gray-750 break-words"
          style="max-width: 100%"
        >
          <textarea
            v-model="editableContent"
            class="min-w-full text-base resize-none overflow-y-auto bg-transparent whitespace-pre-wrap text-gray-950 dark:text-gray-100"
            style="max-height: 60vh"
            @input="adjustTextareaHeight"
            ref="textarea"
          ></textarea>
          <div class="flex justify-end mt-3">
            <!-- 取消按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-floating btn-md mx-3"
                :class="{
                  'h-8 w-8': isMobile,
                  'bg-[#F4F4F4] border-[#F4F4F4] dark:bg-[#2f2f2f] dark:border-[#2f2f2f]': isMobile,
                }"
                @click="cancelEdit"
                aria-label="取消"
              >
                <Close size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">取消</div>
            </div>
            <!-- 发送按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-send"
                :class="{ 'h-8 w-8': isMobile }"
                @click="handleEditMessage"
                aria-label="发送"
              >
                <Send size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
            </div>
          </div>
        </div>
        <!-- 只读模式 -->
        <div
          v-else
          class="p-3 rounded-2xl text-base bg-opacity dark:bg-gray-750 break-words whitespace-pre-wrap text-gray-950 dark:text-gray-100"
          v-text="text"
          style="max-width: 100%"
        />
      </div>
    </div>

    <!-- 图片显示部分 -->
    <div
      v-if="imageUrlArray && imageUrlArray.length > 0 && isImageUrl"
      :class="['my-2 w-full flex', isUserMessage ? 'justify-end' : 'justify-start']"
      :style="{
        height: 'auto',
        minHeight: 'auto',
      }"
    >
      <div :class="getImageContainerClass()" :style="getImageContainerStyle()">
        <img
          v-for="(file, index) in imageUrlArray"
          :key="index"
          :src="file"
          alt="图片"
          @click="openImagePreview(index as number)"
          :class="getImageClass()"
          :style="getImageStyle()"
          loading="lazy"
        />
      </div>
    </div>

    <!-- 视频显示部分 -->
    <div
      v-if="videoUrlArray && videoUrlArray.length > 0 && isVideoUrl"
      :class="['my-2 w-full flex', isUserMessage ? 'justify-end' : 'justify-start']"
    >
      <div
        class="gap-2"
        :style="{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(videoUrlArray.length, 2)}, 1fr)`,
          gridAutoRows: '1fr',
          maxWidth: isUserMessage ? (isMobile ? '80vw' : '60vw') : '90vw',
          width: 'auto',
        }"
      >
        <video
          v-for="(file, index) in videoUrlArray"
          :key="index"
          :src="file"
          controls
          preload="metadata"
          class="rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 w-auto h-auto max-h-[40vh] object-cover"
          :style="{
            width: '100%',
            maxWidth: '400px',
          }"
          @click="handleMediaPreview()"
        >
          您的浏览器不支持视频播放。
        </video>
        <!-- 视频处理中占位符 -->
        <div
          v-if="props.modelType === 3 && isProcessing && videoUrlArray.length === 0"
          class="rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 relative"
          :style="{
            width: '100%',
            maxWidth: '400px',
            minHeight: '225px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }"
        >
          <div class="relative flex items-center justify-center">
            <!-- 简约现代圆形进度条 -->
            <svg class="w-16 h-16" viewBox="0 0 100 100">
              <!-- 静态背景圆 -->
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke-width="4"
                stroke="rgba(200, 200, 200, 0.2)"
                class="dark:stroke-gray-700"
              />
              <!-- 主旋转环 -->
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke-width="4"
                stroke="currentColor"
                stroke-linecap="round"
                class="text-primary-500 dark:text-primary-400 origin-center animate-spin"
                stroke-dasharray="80 180"
                style="animation-duration: 2s"
              />
            </svg>
            <!-- 中间的视频图标 -->
            <PlayOne
              class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary-500 dark:text-primary-400"
              theme="outline"
              size="24"
              fill="currentColor"
            />
          </div>
          <!-- 进度文字 -->
          <div class="absolute bottom-4 text-sm text-gray-500 dark:text-gray-400">
            {{ typeof progress === 'string' ? progress : '视频生成中' }}...
          </div>
        </div>
      </div>
    </div>

    <!-- 音频显示部分 -->
    <div
      v-if="audioUrlArray && audioUrlArray.length > 0 && isAudioUrl"
      :class="['my-2 w-full flex', isUserMessage ? 'justify-end' : 'justify-start']"
    >
      <div class="audio-container" :style="{ maxWidth: isUserMessage ? '60%' : '80%' }">
        <div
          v-for="(url, index) in audioUrlArray"
          :key="index"
          class="audio-player mb-2"
          @click="handleMediaPreview()"
          :style="{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'var(--n-bg-color-modal)',
            borderRadius: '8px',
            cursor: 'pointer',
          }"
        >
          <button
            class="play-button"
            @click.stop="toggleAudioPlay"
            :style="{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--n-primary-color)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }"
          >
            <PlayOne v-if="!isPlayingAudio" size="20" />
            <Pause v-else size="20" />
          </button>
          <div
            class="audio-wave"
            :style="{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              height: '24px',
              flex: 1,
            }"
          >
            <span
              v-for="i in 30"
              :key="i"
              class="wave-bar"
              :class="{ active: isPlayingAudio }"
              :style="{
                width: '2px',
                height: '12px',
                background: 'var(--n-primary-color)',
                opacity: isPlayingAudio ? '0.7' : '0.3',
                borderRadius: '1px',
                transition: 'all 0.3s',
                animation: isPlayingAudio ? 'wave 0.6s ease-in-out infinite alternate' : 'none',
                animationDelay: i % 2 === 0 ? '0s' : '0.15s',
              }"
            ></span>
          </div>
          <audio
            v-if="index === 0"
            ref="audioRef"
            :src="url"
            @ended="onAudioEnded"
            style="display: none"
          />
        </div>
        <!-- 处理中占位符 -->
        <div
          v-if="isProcessing && audioUrlArray.length === 0"
          class="audio-placeholder flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
          :style="{
            minHeight: '80px',
          }"
        >
          <div class="relative">
            <!-- 旋转的圆形进度指示器 -->
            <svg class="w-12 h-12" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke-width="4"
                class="text-gray-200 dark:text-gray-600"
                stroke="currentColor"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke-width="4"
                class="text-primary-500 animate-spin"
                stroke="currentColor"
                stroke-dasharray="80 180"
                stroke-dashoffset="0"
                transform-origin="50 50"
                style="animation: spin 2s linear infinite"
              />
            </svg>
            <!-- 中心音频图标 -->
            <div class="absolute inset-0 flex items-center justify-center">
              <MusicOne theme="outline" size="20" fill="currentColor" class="text-primary-500" />
            </div>
          </div>
          <!-- 进度文本 -->
          <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {{ typeof progress === 'string' ? progress : '音频生成中' }}...
          </div>
        </div>

        <!-- 歌词生成后的操作按钮 -->
        <div
          v-if="
            props.action === 'LYRICS' &&
            props.status === 3 &&
            props.taskData &&
            audioUrlArray.length === 0
          "
          class="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-400">歌词已生成，可以创作音乐了</span>
            <button
              @click="handleCreateMusic"
              class="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors text-sm font-medium"
            >
              生成音乐
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 后续提问建议，分享模式下不显示 -->
    <div
      v-if="computedPromptReference && !isUserMessage && isLast && !isShareMode"
      class="flex-row transition-opacity duration-500 prompt-suggestions-container"
    >
      <button
        v-for="(item, index) in computedPromptReference
          ? computedPromptReference
              .match(/{(.*?)}/g)
              ?.map((str: string | any[]) => str.slice(1, -1))
              .slice(0, 3)
          : []"
        :key="`prompt-${index}-${item}`"
        @click="handleMessage(item as string)"
        class="flex items-center overflow-hidden btn-pill py-4 px-4 mt-3 max-w-[80vw] text-ellipsis whitespace-nowrap"
        :class="{ 'prompt-suggestion-item': shouldAnimatePrompts }"
        :style="shouldAnimatePrompts ? `animation-delay: ${(index as number) * 100}ms` : ''"
        :title="item as string"
      >
        <span class="truncate">{{ item }}</span>
        <ArrowRight class="ml-1 flex-shrink-0" />
      </button>
    </div>

    <!-- 操作按钮区域 -->
    <div
      v-if="!isShareMode"
      :class="[
        'flex transition-opacity duration-300 text-gray-700',
        buttonGroupClass,
        { 'justify-end': isUserMessage },
      ]"
    >
      <div class="mt-2 flex group">
        <!-- 复制按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleCopy"
            aria-label="复制"
          >
            <Copy />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
        </div>

        <!-- 删除按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleDelete"
            aria-label="删除"
          >
            <Delete />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
        </div>

        <!-- 编辑按钮（用户消息） -->
        <div v-if="isUserMessage && !isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleEditMessage"
            :aria-label="t('common.edit')"
          >
            <Edit />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('common.edit') }}</div>
        </div>

        <!-- 编辑按钮（AI消息，仅桌面端） -->
        <div v-if="!isUserMessage && !isEditable && !isMobile" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleEditAIMessage"
            :aria-label="t('common.edit')"
          >
            <Edit />
          </button>
          <div class="tooltip tooltip-top">{{ t('common.edit') }}</div>
        </div>

        <!-- 重新生成按钮 -->
        <div v-if="!isUserMessage" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleRegenerate(index, chatId)"
            :aria-label="t('chat.regenerate')"
          >
            <Refresh />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.regenerate') }}</div>
        </div>

        <!-- 默认TTS朗读按钮 -->
        <div v-if="!isUserMessage && ttsMode === 1" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="playOrPause"
            aria-label="朗读"
          >
            <VoiceMessage v-if="playbackState === 'paused'" />
            <Rotation v-if="playbackState === 'loading'" class="rotate-icon" />
            <PauseOne v-else-if="playbackState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{
              playbackState === 'playing'
                ? t('chat.pause')
                : playbackState === 'loading'
                  ? t('chat.loading')
                  : t('chat.readAloud')
            }}
          </div>
        </div>

        <!-- 浏览器TTS朗读按钮 -->
        <div
          v-if="!isUserMessage && ttsMode === 2 && isSpeechSynthesisSupported"
          class="relative group-btn"
        >
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleBrowserTts"
            aria-label="浏览器朗读"
          >
            <Sound v-if="browserTtsState === 'paused'" />
            <PauseOne v-else-if="browserTtsState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{ browserTtsState === 'playing' ? '停止' : '朗读' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
/* 
  注意：主要的highlight.js主题覆盖已移至 injectThemeStyles 函数
  此处只保留动画和其他非主题相关样式
*/

@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotate-icon {
  animation: rotateAnimation 3s linear infinite;
  transform-origin: center;
}

@keyframes wave {
  0% {
    height: 12px;
  }
  100% {
    height: 24px;
  }
}

.hidden {
  display: none !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.new-text-fade-in {
  animation: fadeIn 0.5s ease-in;
  animation-fill-mode: forwards;
  display: inline;
}

/* 后续提问建议动画 */
@keyframes promptFadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.prompt-suggestion-item {
  animation: promptFadeInUp 0.4s ease-out forwards;
  opacity: 0;
  animation-fill-mode: both;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    /* 原始尺寸 */
    opacity: 1;
    /* 完全不透明 */
  }

  50% {
    transform: scale(0.5);
    /* 缩小到50%的尺寸 */
    opacity: 0.5;
    /* 半透明 */
  }
}

/* 三点加载动画 */
.loading-animation {
  display: inline-block;
  position: relative;
  width: 60px;
  height: 20px;
}

.loading-animation:before,
.loading-animation:after,
.loading-animation span {
  content: '';
  display: block;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6366f1;
  animation: dotBounce 1.4s infinite ease-in-out;
}

.loading-animation:before {
  left: 0;
  animation-delay: 0s;
}

.loading-animation span {
  left: 26px;
  animation-delay: 0.2s;
}

.loading-animation:after {
  left: 52px;
  animation-delay: 0.4s;
}

@keyframes dotBounce {
  0%,
  80%,
  100% {
    transform: translateY(-50%) scale(0.6);
    opacity: 0.6;
  }
  40% {
    transform: translateY(-50%) scale(1);
    opacity: 1;
  }
}

/* 折叠/展开动画 */
.fold-enter-active,
.fold-leave-active {
  transition: all 0.3s ease;
  max-height: 1000px;
  opacity: 1;
  overflow: hidden;
}

.fold-enter-from,
.fold-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

/* 为响应结果折叠添加特殊处理 */
pre.fold-enter-active,
pre.fold-leave-active {
  transition: all 0.25s ease;
  max-height: 500px;
  opacity: 1;
  margin-top: 0.5rem;
}

pre.fold-enter-from,
pre.fold-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

/* 使用全局样式配置，在 global.scss 中定义 */

/* Markdown样式 */
.markdown-body {
  background-color: transparent;
  // font-size: 1rem;
  max-width: min(50rem, 100%);
  overflow-x: hidden !important; /* 防止横向滚动 */
  overflow-y: visible;

  // p {
  //   white-space: pre-wrap;
  // }

  ol {
    list-style-type: decimal;
  }

  ul {
    list-style-type: disc;
  }

  pre code,
  pre tt {
    line-height: 1.65;
  }
}

/* 深色模式滚动条 */
.dark .custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.9);
}

/* 代码容器高度控制 */
.code-container {
  transition:
    max-height 0.3s ease,
    overflow 0.3s ease;
  overflow: auto;
  max-width: 100% !important;
  overflow-x: auto !important;
  width: 100% !important;
}

/* 生成完成状态下的代码容器限制高度 */
.markdown-body:not(.markdown-body-generate) .code-container {
  max-height: 50vh;
  overflow-y: auto;
}

/* 生成中状态下的代码容器不限制高度 */
.markdown-body-generate .code-container {
  max-height: none;
  overflow-y: visible;
}

/* 加载动画样式 */

/* 深度思考文字切换动画 - 从左到右渐变填充 */
.snippet-text {
  position: relative;
  display: inline-block;
}

/* 深度思考文字切换动画 */
.snippet-container {
  position: relative;
  width: 90%; /* 卡片宽度的90% */
}

.snippet-text {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 向上滑出动画 */
.snippet-slide-out {
  animation: slideUp 0.5s ease-in-out forwards;
  opacity: 1;
}

/* 从下方滑入动画 */
.snippet-slide-in {
  animation: slideIn 0.5s ease-in-out forwards;
  opacity: 0;
  transform: translateY(100%);
}

@keyframes slideUp {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(-100%);
    opacity: 0;
  }
}

@keyframes slideIn {
  0% {
    transform: translateY(100%);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 思考推理卡片渐入动画 */
@keyframes thinkingFadeIn {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.thinking-card {
  animation: thinkingFadeIn 0.4s ease-out;
  animation-fill-mode: both;
}

/* 文件搜索卡片渐入动画 */
@keyframes fileSearchFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.file-search-card {
  animation: fileSearchFadeIn 0.35s ease-out;
  animation-fill-mode: both;
}

/* 深度思考卡片展开/收起动画 */
.slide-fade-reasoning-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-reasoning-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-reasoning-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-reasoning-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* 文件搜索卡片展开/收起动画 */
.slide-fade-file-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-file-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-file-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-file-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
