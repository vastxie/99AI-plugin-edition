<script setup lang="ts">
import { useAppStore } from '@/store/modules/app'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { sanitizeMarkdownHtml } from '@/utils/sanitizeHtml'
import {
  Close,
  Copy,
  Download,
  Earth,
  FileText,
  FullScreen,
  Help,
  OffScreen,
  Quote,
} from '@icon-park/vue-next'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
// 引入MarkdownIt用于渲染Markdown
import { useBasicLayout } from '@/hooks/useBasicLayout'
import mdKatex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'

interface Props {
  close: () => void
}

const props = defineProps<Props>()

const markdownContent = ref('')
const ms = message()
const globalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const chatStore = useChatStore()
const { isMobile } = useBasicLayout()

// 记录打开预览之前的侧边栏状态，用于关闭预览时恢复
const sidebarStateBeforePreview = ref(appStore.siderCollapsed)

// 是否处于全屏模式
const isFullscreen = ref(false)

// 预览容器的引用
const previewerContainerRef = ref<HTMLDivElement | null>(null)

// 检查当前是否为暗黑模式
const isDarkMode = ref(document.documentElement.classList.contains('dark'))
let darkModeObserver: MutationObserver | null = null

// 文本选择相关状态
const selectedText = ref('')
const isSelectionMenuVisible = ref(false)
const selectionMenuPosition = ref({ top: 0, left: 0 })
const activeMenuId = ref<string | null>(null)
const isTextSelectionInProgress = ref(false)

// 获取onConversation函数从父组件
const onConversation = inject<(params: any) => void>('onConversation')

// 菜单选项配置
const menuOptions = [
  {
    label: '引用',
    value: 'quote',
    icon: Quote,
  },
  {
    label: '解释',
    value: 'explain',
    icon: Help,
  },
  {
    label: '总结',
    value: 'summarize',
    icon: FileText,
  },
  {
    label: '翻译',
    value: 'translate',
    icon: Earth,
  },
]

// 初始化MarkdownIt实例用于渲染Markdown
const mdi = new MarkdownIt({
  linkify: true,
  html: false,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, {
  blockClass: 'katexmath-block rounded-md p-[10px]',
  inlineClass: 'katexmath-inline',
  errorColor: ' #cc0000',
})

const renderedMarkdownContent = computed(() =>
  sanitizeMarkdownHtml(mdi.render(markdownContent.value))
)

// 代码高亮显示的辅助函数
function highlightBlock(str: string, lang?: string) {
  const blockId = `code-block-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  return `<pre
    style="max-width:100%;"
    class="code-block-wrapper rounded-md overflow-auto"
    id="${blockId}"
  ><div class="code-block-header flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800">
    <span class="code-block-header__lang text-xs font-medium text-gray-500 dark:text-gray-400">${lang || 'text'}</span>
    <div class="code-block-header__buttons">
      <span class="code-block-header__copy text-xs cursor-pointer px-2 hover:text-primary-600" data-block-id="${blockId}">复制</span>
    </div>
  </div><code
    class="hljs block p-4 overflow-auto"
    style="max-height: 400px;"
  >${str}</code></pre>`
}

// 打开预览时折叠侧边栏
const collapseSidebar = () => {
  // 记录当前侧边栏状态
  sidebarStateBeforePreview.value = appStore.siderCollapsed
  // 折叠侧边栏
  if (!appStore.siderCollapsed) {
    appStore.setSiderCollapsed(true)
  }
}

// 关闭预览时恢复侧边栏状态
const restoreSidebar = () => {
  // 只在非移动设备上执行恢复
  if (!isMobile.value && !sidebarStateBeforePreview.value && appStore.siderCollapsed) {
    appStore.setSiderCollapsed(false)
  }
}

// 处理文本选择
const handleTextSelection = () => {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    // 如果没有选中文本，隐藏菜单
    isSelectionMenuVisible.value = false
    isTextSelectionInProgress.value = false
    return
  }

  // 获取选择范围并确保选择的内容在组件内部
  const range = selection.getRangeAt(0)
  if (!previewerContainerRef.value?.contains(range.commonAncestorContainer)) {
    isSelectionMenuVisible.value = false
    isTextSelectionInProgress.value = false
    return
  }

  // 获取选中的文本
  const text = selection.toString().trim()

  if (!text || text.length < 3) {
    // 如果选中的文本太短，隐藏菜单
    isSelectionMenuVisible.value = false
    isTextSelectionInProgress.value = false
    return
  }

  selectedText.value = text

  // 获取选中区域的位置
  const rect = range.getBoundingClientRect()

  // 获取预览器容器的位置

  // 菜单预估尺寸
  const menuHeight = 40

  // 计算菜单位置：相对于选中文本定位，滚动时跟随移动
  const selectionCenterY = (rect.top + rect.bottom) / 2
  const isInUpperHalf = selectionCenterY < window.innerHeight / 2

  // 使用固定定位，相对于视窗，水平居中通过CSS实现
  const menuTop = isInUpperHalf ? rect.bottom + 2 : rect.top - menuHeight - 2

  const menuPosition = {
    top: menuTop,
  }

  selectionMenuPosition.value = {
    top: menuPosition.top,
    left: 0, // 添加left属性以满足类型要求,实际位置由CSS控制
  }

  // 标记文本选择正在进行，防止立即隐藏菜单
  isTextSelectionInProgress.value = true

  // 显示菜单
  isSelectionMenuVisible.value = true

  // 延迟重置标记，避免立即触发的 click 事件隐藏菜单
  setTimeout(() => {
    isTextSelectionInProgress.value = false
  }, 100)
}

// 处理菜单项点击
const handleMenuItemClick = (action: string) => {
  // 隐藏菜单
  isSelectionMenuVisible.value = false
  activeMenuId.value = null

  // 处理动作
  handleAction(action)
}

// 处理菜单动作
const handleAction = (action: string) => {
  if (!selectedText.value) {
    return
  }

  // 处理引用功能
  if (action === 'quote') {
    // 将选中的文本替换到chatStore.prompt中
    chatStore.setPrompt(selectedText.value)

    // 清空选中文本
    selectedText.value = ''

    // 清除文本选择
    window.getSelection()?.removeAllRanges()

    // 关闭预览器
    // props.close()

    // ms.success('已将选中内容设置为输入框内容')
    return
  }

  // 处理其他快速提问功能
  if (!onConversation) {
    return
  }

  let prompt = ''
  switch (action) {
    case 'explain':
      prompt = `请解释这段文字的含义：\n\n${selectedText.value}`
      break
    case 'summarize':
      prompt = `请总结这段文字的要点：\n\n${selectedText.value}`
      break
    case 'translate':
      prompt = `请将这段文字翻译成中文：\n\n${selectedText.value}`
      break
    default:
      prompt = `请处理这段文字：\n\n${selectedText.value}`
  }

  // 关闭菜单并清空选中文本
  isSelectionMenuVisible.value = false
  selectedText.value = ''

  // 调用对话函数
  onConversation({ msg: prompt })

  // 清除文本选择
  window.getSelection()?.removeAllRanges()

  // 关闭预览器
  // props.close()
}

// 添加复制功能
const setupCodeCopy = () => {
  const copyButtons = document.querySelectorAll('.code-block-header__copy')
  copyButtons.forEach(button => {
    const blockId = button.getAttribute('data-block-id')
    if (!blockId) return

    button.addEventListener('click', event => {
      event.stopPropagation()
      event.preventDefault()

      const codeBlock = document.getElementById(blockId)
      if (codeBlock) {
        const codeElement = codeBlock.querySelector('code')
        if (codeElement && codeElement.textContent) {
          navigator.clipboard
            .writeText(codeElement.textContent)
            .then(() => {
              const originalText = button.textContent
              button.textContent = '已复制'

              setTimeout(() => {
                button.textContent = originalText
              }, 2000)

              ms.success('代码已复制')
            })
            .catch(() => ms.error('复制失败'))
        }
      }
    })
  })
}

// 全屏切换逻辑
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    previewerContainerRef.value?.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen()
  }
}

// 同步全屏状态
const syncFullscreenState = () => {
  isFullscreen.value = !!document.fullscreenElement

  // 全屏时手动应用暗黑模式
  if (isFullscreen.value && previewerContainerRef.value) {
    if (isDarkMode.value) {
      previewerContainerRef.value.classList.add('force-dark-mode')
    }
  } else if (previewerContainerRef.value) {
    // 退出全屏时移除强制暗黑模式
    previewerContainerRef.value.classList.remove('force-dark-mode')
  }
}

// 监听暗黑模式变化
const watchDarkMode = () => {
  const observer = new MutationObserver(() => {
    isDarkMode.value = document.documentElement.classList.contains('dark')

    // 如果当前是全屏状态，立即更新全屏元素的暗黑模式
    if (isFullscreen.value && previewerContainerRef.value) {
      if (isDarkMode.value) {
        previewerContainerRef.value.classList.add('force-dark-mode')
      } else {
        previewerContainerRef.value.classList.remove('force-dark-mode')
      }
    }
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  return observer
}

// 关闭预览器
const handleClose = () => {
  // 恢复侧边栏状态
  restoreSidebar()

  // 关闭预览器
  props.close()

  // 清空全局状态中的Markdown内容
  globalStore.markdownContent = ''

  // 如果是移动端，确保全屏状态正确恢复
  if (isMobile.value) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }
}

// 下载Markdown内容
function downloadMarkdown() {
  if (!markdownContent.value) {
    ms.error('没有可下载的Markdown内容')
    return
  }

  const blob = new Blob([markdownContent.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'document.md'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ms.success('Markdown文件已下载')
}

// 复制Markdown内容
async function copyMarkdown() {
  if (!markdownContent.value) {
    ms.error('没有可复制的Markdown内容')
    return
  }

  try {
    await navigator.clipboard.writeText(markdownContent.value)
    ms.success('Markdown内容已复制到剪贴板')
  } catch (err) {
    ms.error('复制失败')
  }
}

// 在组件创建时立即折叠侧边栏（不等待挂载）
collapseSidebar()

// 初始化组件设置
const initializeComponent = async () => {
  // 1. 等待DOM先渲染一次
  await nextTick()

  // 2. 添加移动端全屏样式
  if (isMobile.value) {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
  }

  // 3. 添加全屏变化监听
  document.addEventListener('fullscreenchange', syncFullscreenState)

  // 4. 再次等待DOM和样式应用
  await nextTick()

  // 5. 从全局状态获取Markdown内容
  if (globalStore.markdownContent) {
    markdownContent.value = globalStore.markdownContent
    // 设置代码复制功能
    await nextTick()
    setupCodeCopy()
  }

  // 6. 监听全局状态中Markdown内容的变化
  watch(
    () => globalStore.markdownContent,
    async newContent => {
      if (newContent) {
        markdownContent.value = newContent
        // 等待DOM更新后设置代码复制功能
        await nextTick()
        setupCodeCopy()
      }
    },
    { immediate: false }
  )

  // 7. 设置文本选择监听 - 只在组件内部生效
  if (previewerContainerRef.value) {
    previewerContainerRef.value.addEventListener('mouseup', handleTextSelection)

    previewerContainerRef.value.addEventListener('click', event => {
      // 如果正在进行文本选择，不处理点击事件
      if (isTextSelectionInProgress.value) {
        return
      }

      // 如果点击不在选择菜单内，则隐藏菜单
      const target = event.target as HTMLElement
      if (!target.closest('.selection-menu') && isSelectionMenuVisible.value) {
        isSelectionMenuVisible.value = false
        activeMenuId.value = null
      }
    })
  }
}

onMounted(() => {
  // 组件挂载时初始化
  initializeComponent()

  // 启动暗黑模式监听
  darkModeObserver = watchDarkMode()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState)

  // 移除组件内部的事件监听器
  if (previewerContainerRef.value) {
    previewerContainerRef.value.removeEventListener('mouseup', handleTextSelection)
  }

  // 确保在组件卸载时也能恢复侧边栏状态
  restoreSidebar()

  // 针对移动端，移除全屏样式
  if (isMobile.value) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }

  // 清理暗黑模式监听器
  if (darkModeObserver) {
    darkModeObserver.disconnect()
    darkModeObserver = null
  }
})
</script>

<template>
  <div
    ref="previewerContainerRef"
    class="h-full w-full flex flex-col relative shadow-lg"
    :class="{
      'bg-white dark:bg-gray-800': true,
      'border-l dark:border-gray-600 rounded-tl-2xl rounded-bl-2xl': !isFullscreen,
      'rounded-none border-none': isFullscreen,
    }"
  >
    <!-- 顶部工具栏 -->
    <div
      class="flex justify-between items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800"
      :class="{
        'rounded-tl-2xl': !isFullscreen,
      }"
    >
      <div class="flex items-center">
        <span class="text-lg font-semibold text-gray-800 dark:text-gray-200"> 文档阅读 </span>
      </div>
      <div class="flex items-center space-x-2">
        <!-- Markdown工具按钮 -->
        <div class="relative group">
          <button class="btn-icon btn-md" @click="copyMarkdown">
            <Copy :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">复制Markdown</div>
        </div>
        <div class="relative group">
          <button class="btn-icon btn-md" @click="downloadMarkdown">
            <Download :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">下载Markdown</div>
        </div>

        <!-- 全屏按钮 -->
        <div class="relative group">
          <button class="btn-icon btn-md" @click="toggleFullscreen">
            <FullScreen v-if="!isFullscreen" :size="20" />
            <OffScreen v-else :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">全屏</div>
        </div>

        <!-- 关闭按钮 -->
        <div class="relative group">
          <button class="btn-icon btn-md" @click="handleClose">
            <Close :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭预览</div>
        </div>
      </div>
    </div>

    <!-- 内容区域 - 始终显示 -->
    <div
      class="flex-1 overflow-hidden relative"
      :class="{
        'rounded-bl-2xl': !isFullscreen,
      }"
    >
      <!-- 文本选择菜单 -->
      <div
        v-if="isSelectionMenuVisible"
        class="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
        :style="{
          top: `${selectionMenuPosition.top}px`,
          left: '50%',
          transform: 'translate(-50%, 0)',
        }"
      >
        <div class="flex items-stretch">
          <div v-for="(option, index) in menuOptions" :key="option.value" class="relative">
            <button
              class="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 first:rounded-l-lg last:rounded-r-lg"
              :class="{
                'border-r border-gray-200 dark:border-gray-700': index < menuOptions.length - 1,
              }"
              @click="handleMenuItemClick(option.value)"
            >
              <component :is="option.icon" :size="16" />
              <span class="ml-1">{{ option.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Markdown内容 -->
      <div class="overflow-auto p-4 h-full bg-transparent custom-scrollbar">
        <div class="markdown-content">
          <div
            v-if="markdownContent"
            class="markdown-body animate-fade-in"
            v-html="renderedMarkdownContent"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 移除不需要的自定义类，所有样式通过条件类处理 */

/* 全屏模式下强制暗黑模式样式 */
:deep(.force-dark-mode) {
  background-color: #1f2937 !important;
}

:deep(.force-dark-mode .bg-white) {
  background-color: #1f2937 !important;
}

:deep(.force-dark-mode .dark\\:bg-gray-800) {
  background-color: #1f2937 !important;
}

.markdown-content {
  @apply max-w-4xl mx-auto p-4 min-h-[200px];
}

/* 移动端响应式样式 */
@media (max-width: 768px) {
  .markdown-previewer {
    @apply min-w-full;
  }
}

/* 添加淡入动画类 */
.animate-fade-in {
  animation: fade-in 0.3s ease-in-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>

<style>
/* 这里放置非scoped样式，比如markdown渲染后的样式 */
.markdown-body {
  font-size: 16px;
  line-height: 1.6;
  word-wrap: break-word;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 {
  font-size: 2em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-body h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-body p {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body code {
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 0.25rem;
  padding: 0.125rem 0.25rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.dark .markdown-body code {
  background-color: rgba(255, 255, 255, 0.1);
}

.markdown-body a {
  color: #4f46e5;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.dark .markdown-body a {
  color: #818cf8;
}

.markdown-body pre {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

.markdown-body ul,
.markdown-body ol {
  padding-left: 2em;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body img {
  max-width: 100%;
  box-sizing: content-box;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
  margin: 0 0 16px 0;
}

.dark .markdown-body blockquote {
  color: #8b949e;
  border-left-color: #3b3b3b;
}

.markdown-body table {
  display: block;
  width: 100%;
  overflow: auto;
  margin-top: 0;
  margin-bottom: 16px;
  border-spacing: 0;
  border-collapse: collapse;
}

.markdown-body table th,
.markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-body table tr {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

.dark .markdown-body table tr {
  background-color: #0d1117;
  border-top: 1px solid #30363d;
}

.dark .markdown-body table th,
.dark .markdown-body table td {
  border: 1px solid #30363d;
}

.markdown-body table tr:nth-child(2n) {
  background-color: #f6f8fa;
}

.dark .markdown-body table tr:nth-child(2n) {
  background-color: #161b22;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}

.dark .markdown-body hr {
  background-color: #30363d;
}
</style>
