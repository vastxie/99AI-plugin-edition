<script setup lang="ts">
import { createShare } from '@/api/share' // 引入分享 API
import type { ResData } from '@/api/types' // 引入 API 类型
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message' // 引入消息工具
import { html } from '@codemirror/lang-html'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  Close,
  Computer,
  Copy,
  Download,
  Edit,
  FullScreen,
  Ipad,
  Left,
  LoadingOne,
  OffScreen,
  Pencil,
  Phone,
  Quote,
  Right,
  Share,
  Translation,
} from '@icon-park/vue-next'
import { EditorView, basicSetup } from 'codemirror'
// @ts-ignore - Add this comment to ignore missing type declaration
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// 导入渲染器组件
import ContentRenderer from './ContentRenderer.vue'

interface Props {
  close: () => void
}
const props = defineProps<Props>()

const globalStore = useGlobalStoreWithOut()
const chatStore = useChatStore()
const appStore = useAppStore() // 添加appStore
const authStore = useAuthStore() // 添加authStore
const ms = message() // 获取消息实例
const isPreviewMode = ref(true) // Default to preview mode
const { isMobile } = useBasicLayout() // 获取是否为移动设备状态

// 记录打开预览之前的侧边栏状态，用于关闭预览时恢复
const sidebarStateBeforePreview = ref(true)

// 添加加载动画样式
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})

// 添加组件切换状态变量
const isComponentSwitching = ref(false)

// 暂存的HTML内容，用于流式输入时暂存
const pendingHtmlContent = ref<string>('')

// 新增内容类型计算属性
const contentType = computed(() => globalStore.contentType || 'html')

// 修改为支持多个代码块
const codeBlocks = ref<{ content: string; type: 'html' | 'mermaid' | 'markmap' }[]>([])
const currentBlockIndex = ref(0)

// 计算当前显示的HTML内容
const htmlContent = computed(() => {
  // 如果处于流式输入状态，优先显示暂存的内容
  if (isStreamIn.value && pendingHtmlContent.value) {
    return pendingHtmlContent.value
  }

  // 否则显示当前选中的代码块或全局内容
  if (codeBlocks.value.length > 0) {
    return codeBlocks.value[currentBlockIndex.value].content
  }
  return globalStore.htmlContent || ''
})

// 计算是否有多个代码块
const hasMultipleBlocks = computed(() => codeBlocks.value.length > 1)

// 计算当前内容类型
const currentContentType = computed(() => {
  if (codeBlocks.value.length > 0) {
    return codeBlocks.value[currentBlockIndex.value].type
  }
  return contentType.value
})

// 添加显示当前内容类型的中文名称
const contentTypeName = computed(() => {
  switch (currentContentType.value) {
    case 'html':
      return '网页'
    case 'mermaid':
      return '流程图'
    case 'markmap':
      return '思维导图'
    default:
      return '未知'
  }
})

// 修改收集代码块的函数，移除渲染调用
const collectAllCodeBlocks = () => {
  // 查找所有HTML和Mermaid代码块
  const htmlCodeBlocks = document.querySelectorAll('code.html')
  const mermaidCodeBlocks = document.querySelectorAll('code.mermaid')
  const markmapCodeBlocks = document.querySelectorAll('code.markmap')

  const blocks: { content: string; type: 'html' | 'mermaid' | 'markmap' }[] = []

  // 收集所有HTML代码块内容
  htmlCodeBlocks.forEach(block => {
    if (block.textContent && block.textContent.trim() !== '') {
      blocks.push({ content: block.textContent, type: 'html' })
    }
  })

  // 收集所有Mermaid代码块内容
  mermaidCodeBlocks.forEach(block => {
    if (block.textContent && block.textContent.trim() !== '') {
      blocks.push({ content: block.textContent, type: 'mermaid' })
    }
  })

  // 收集所有Markmap代码块内容
  markmapCodeBlocks.forEach(block => {
    if (block.textContent && block.textContent.trim() !== '') {
      blocks.push({ content: block.textContent, type: 'markmap' })
    }
  })

  // 如果找到代码块，重新初始化
  if (blocks.length > 0) {
    codeBlocks.value = blocks
    // 设置当前索引为用户点击的类型的最后一个
    const type = contentType.value
    const lastIndexOfType = blocks
      .map(b => b.type)
      .lastIndexOf(type as 'html' | 'mermaid' | 'markmap')
    currentBlockIndex.value = lastIndexOfType >= 0 ? lastIndexOfType : blocks.length - 1

    // 移除这里的updatePreview调用，避免双重渲染
    return true
  }

  return false
}

// 修改初始化代码块数组的函数
const initCodeBlocks = () => {
  // 尝试收集所有代码块
  const foundBlocks = collectAllCodeBlocks()

  // 如果没有找到代码块，但globalStore有内容，则使用全局存储的内容
  if (!foundBlocks && globalStore.htmlContent && globalStore.htmlContent.trim() !== '') {
    codeBlocks.value = [
      {
        content: globalStore.htmlContent,
        type: contentType.value as 'html' | 'mermaid' | 'markmap',
      },
    ]
    currentBlockIndex.value = 0
    // 移除这里的updatePreview调用，避免双重渲染
  }
  // 不返回任何值
}

// 添加新的代码块
const addCodeBlock = (content: string, type: 'html' | 'mermaid' | 'markmap') => {
  if (!content || content.trim() === '') return

  // 检查是否已存在相同内容的代码块
  const exists = codeBlocks.value.findIndex(block => block.content.trim() === content.trim())
  if (exists === -1) {
    codeBlocks.value.push({ content, type })
    currentBlockIndex.value = codeBlocks.value.length - 1
  } else {
    // 如果已存在，切换到该代码块
    currentBlockIndex.value = exists
  }
}

// 切换到下一个代码块
const nextBlock = () => {
  if (currentBlockIndex.value < codeBlocks.value.length - 1) {
    // 设置切换状态为true
    isComponentSwitching.value = true
    currentBlockIndex.value++

    // 确保切换到预览模式
    isPreviewMode.value = true

    // 300ms后重置切换状态
    setTimeout(() => {
      isComponentSwitching.value = false
    }, 300)
  } else {
  }
}

// 切换到上一个代码块
const prevBlock = () => {
  if (currentBlockIndex.value > 0) {
    // 设置切换状态为true
    isComponentSwitching.value = true
    currentBlockIndex.value--

    // 确保切换到预览模式
    isPreviewMode.value = true

    // 300ms后重置切换状态
    setTimeout(() => {
      isComponentSwitching.value = false
    }, 300)
  } else {
  }
}

// 修复主题监听：直接监听appStore而不是DOM检测
const isDarkMode = computed(() => appStore.theme === 'dark')
let editor: EditorView | null = null

// 新增状态
const previewSize = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const isFullscreen = ref(false)
const previewerContainerRef = ref<HTMLDivElement | null>(null) // Ref for the root element
const hoveredButton = ref('') // 添加悬停按钮状态
let menuCloseTimer: ReturnType<typeof setTimeout> | null = null // 添加菜单关闭定时器

// 新增分享弹窗状态
const showSharePopover = ref(false)
const shareLinkToShow = ref('')
const shareInputRef = ref<HTMLInputElement | null>(null) // Ref for share input

// 修改 PDF 生成加载状态为通用下载状态
const isExporting = ref(false)
const exportType = ref('')

// 计算页面标题
const pageTitle = computed(() => {
  if (currentContentType.value === 'mermaid') {
    return 'Mermaid图表预览'
  } else if (currentContentType.value === 'markmap') {
    return '思维导图预览'
  }

  const content = htmlContent.value
  if (!content) return '页面预览'
  // 使用简单正则尝试提取 title，注意：这可能不适用于所有复杂情况
  const titleMatch = content.match(/<title>(.*?)<\/title>/i)
  return titleMatch && titleMatch[1] ? titleMatch[1].trim() : '页面预览'
})

// 计算站点名称
const siteName = computed(() => authStore.globalConfig?.siteName || '99AI Plugin Edition')

// 添加回编辑器相关变量
const localEditableText = ref(htmlContent.value)
const editorContainerRef = ref<HTMLDivElement | null>(null)

// 修改watch函数
watch([htmlContent, currentContentType], ([newContent, newType]) => {
  if (newContent !== localEditableText.value) {
    localEditableText.value = newContent
    if (editor && !isPreviewMode.value) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: newContent || '' },
      })
    }
  }
})

// 恢复监听全局store变化的代码
// Watch for external changes to htmlContent from globalStore
watch(
  () => [globalStore.htmlContent, globalStore.contentType],
  ([newContent, newType]) => {
    if (newContent && newContent.trim() !== '') {
      if (isStreamIn.value) {
        // 在流式输入状态时，只暂存内容，不添加到代码块列表
        pendingHtmlContent.value = newContent
      } else {
        // 非流式输入状态时，正常添加到代码块列表
        addCodeBlock(newContent, newType as 'html' | 'mermaid' | 'markmap')
      }
    }
  }
)

// 监听流式输入状态变化
watch(isStreamIn, (newVal, oldVal) => {
  // 当流式输入结束时 (从true变为false)，如果有暂存内容，则添加到代码块列表
  if (oldVal === true && newVal === false && pendingHtmlContent.value) {
    // 延迟一小段时间后添加，确保内容已经完全生成
    setTimeout(() => {
      // 再次从globalStore获取最新内容，以确保内容完整
      const finalContent = globalStore.htmlContent || pendingHtmlContent.value
      addCodeBlock(finalContent, contentType.value as 'html' | 'mermaid' | 'markmap')
      pendingHtmlContent.value = ''
    }, 300) // 300ms延迟，通常足够等待内容完成
  }
})

// Initialize CodeMirror Editor
const initializeEditor = () => {
  if (!editorContainerRef.value || editor) return // Prevent re-initialization

  const extensions = [
    basicSetup,
    html(),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString()
        localEditableText.value = newContent
        // 更新全局存储时保留当前内容类型，而不是默认设置为html
        // 从当前代码块中获取内容类型
        const currentType = codeBlocks.value[currentBlockIndex.value]?.type || contentType.value
        // Update global store immediately while editing, but keep the original content type
        globalStore.updateHtmlContent(newContent, currentType)
      }
    }),
  ]
  if (isDarkMode.value) {
    extensions.push(oneDark)
  }
  const state = EditorState.create({
    doc: localEditableText.value, // Use local ref for initial doc
    extensions,
  })
  editor = new EditorView({ state, parent: editorContainerRef.value })
}

// 修改Switch to Edit Mode
const switchToEdit = () => {
  if (isPreviewMode.value) {
    isPreviewMode.value = false
    nextTick(() => {
      if (!editor) {
        initializeEditor()
      } else {
        // Ensure editor content matches global store content when switching to edit
        const currentEditorContent = editor.state.doc.toString()
        if (currentEditorContent !== htmlContent.value) {
          editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: htmlContent.value || '' },
          })
          localEditableText.value = htmlContent.value // Sync local ref too
        }
      }
      // Focus the editor when switching
      editor?.focus()
    })
  }
}

// 设置预览尺寸 (确保切换回预览模式)
const setPreviewSize = (size: 'desktop' | 'tablet' | 'mobile') => {
  switchToPreview() // 点击尺寸按钮时，总是切换回预览模式
  previewSize.value = size
}

// Switch to Preview Mode
const switchToPreview = () => {
  // 移除 if 条件，强制切换
  isPreviewMode.value = true
}

// 全屏切换逻辑
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    previewerContainerRef.value?.requestFullscreen().catch(err => {})
  } else {
    document.exitFullscreen()
  }
}

// 同步全屏状态
const syncFullscreenState = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// 兼容性更好的剪贴板复制方法 (从 HtmlDialog 复制)
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    return false
  }
}

// 处理分享：获取链接并显示弹窗
const handleShare = async () => {
  try {
    const res: ResData = await createShare({
      htmlContent: htmlContent.value,
    })
    // 获取分享代码
    const shareCode = res.data.shareCode
    // HTML分享使用专门的路由 /shareHtml/
    shareLinkToShow.value = `${window.location.origin}/shareHtml/${shareCode}`
    showSharePopover.value = true
    // 聚焦输入框以便用户查看或手动复制
    nextTick(() => {
      shareInputRef.value?.focus()
      shareInputRef.value?.select()
    })
  } catch (err) {
    ms.error('生成分享链接失败')
  }
}

// 关闭分享弹窗
const closeSharePopover = () => {
  showSharePopover.value = false
  shareLinkToShow.value = ''
}

// 在弹窗内处理复制
const handleCopyInPopover = async () => {
  if (!shareLinkToShow.value) return
  const success = await copyToClipboard(shareLinkToShow.value)
  if (success) {
    ms.success('链接已复制到剪贴板')
    closeSharePopover() // 复制成功后关闭弹窗
  } else {
    ms.error('复制失败，请手动复制')
    shareInputRef.value?.select()
  }
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

// 关闭HTML预览器
const handleClose = () => {
  // 恢复侧边栏状态
  if (!isMobile.value && !sidebarStateBeforePreview.value && appStore.siderCollapsed) {
    appStore.setSiderCollapsed(false)
  }

  // 清空HTML代码块数组
  codeBlocks.value = []
  currentBlockIndex.value = 0

  // 关闭预览器
  props.close()

  // 如果是移动端，确保全屏状态正确恢复
  if (isMobile.value) {
    // 强制清除全屏状态
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }

  // 重置页面标题
  document.title = siteName.value
}

// 新增下拉菜单状态
const showDownloadMenu = ref(false)

// 添加HTML下载功能
const handleSaveAsHtml = async () => {
  if (isExporting.value || currentContentType.value !== 'html') return

  isExporting.value = true
  exportType.value = 'HTML'

  try {
    // 获取HTML内容
    const content = htmlContent.value
    if (!content) {
      ms.error('无法获取网页内容')
      return
    }

    // 创建Blob
    const htmlBlob = new Blob([content], { type: 'text/html;charset=utf-8' })

    // 创建下载链接
    const downloadLink = document.createElement('a')
    downloadLink.href = URL.createObjectURL(htmlBlob)
    downloadLink.download = `${pageTitle.value || 'index'}.html`

    // 触发下载
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)

    ms.success('HTML 文件已开始下载')
  } catch (error) {
    ms.error('导出 HTML 失败。')
  } finally {
    isExporting.value = false
    exportType.value = ''
  }
}

// 修改设备选项的计算属性
const showDeviceOptions = computed(() => {
  return (
    currentContentType.value !== 'mermaid' &&
    currentContentType.value !== 'markmap' &&
    !isMobile.value
  )
})

// 修改分享按钮计算属性
const showShareButton = computed(() => {
  return (
    currentContentType.value !== 'mermaid' &&
    currentContentType.value !== 'markmap' &&
    authStore.isLogin
  )
})

// 新增选择菜单相关的状态
const selectionMenu = ref({
  show: false,
  x: 0,
  y: 0,
  text: '',
  upward: false, // 是否向上展开
})

// 改进处理编辑器中的文本选择逻辑
const handleTextSelection = () => {
  // 确保在编辑模式下
  if (isPreviewMode.value || !editor) return

  // 获取当前选择
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed) {
    selectionMenu.value.show = false
    return
  }

  // 获取选中的文本
  const selectedText = selection.toString().trim()
  if (!selectedText) {
    selectionMenu.value.show = false
    return
  }

  // 检查选择是否在编辑器内部
  let inEditor = false
  const editorElement = editorContainerRef.value

  if (editorElement) {
    // 检查所有选择范围是否在编辑器内
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      const commonAncestor = range.commonAncestorContainer

      // 检查选择范围是否在编辑器内
      if (editorElement.contains(commonAncestor as Node)) {
        inEditor = true
        break
      }
    }
  }

  // 如果选择不在编辑器内，不显示菜单
  if (!inEditor) {
    selectionMenu.value.show = false
    return
  }

  try {
    // 获取选区范围
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // 如果没有宽度或高度，可能是不可见元素，不显示菜单
    if (rect.width === 0 || rect.height === 0) {
      selectionMenu.value.show = false
      return
    }

    // 获取编辑器容器的位置信息
    const editorRect = editorContainerRef.value?.getBoundingClientRect() || { top: 0, left: 0 }

    // 计算相对于编辑器容器的坐标
    const x = rect.left - editorRect.left + rect.width / 2
    const y = rect.bottom - editorRect.top

    // 确定菜单是向上还是向下展开
    // 如果选择在页面下半部分，菜单向上展开
    const windowHeight = window.innerHeight
    const upward = rect.bottom > windowHeight * 0.7

    // 更新菜单状态
    selectionMenu.value = {
      show: true,
      x,
      y,
      text: selectedText,
      upward,
    }
  } catch (error) {
    selectionMenu.value.show = false
  }
}

// 添加防抖函数
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function (this: any, ...args: Parameters<T>): void {
    const context = this
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), wait)
  }
}

// 使用防抖处理文本选择
const debouncedHandleTextSelection = debounce(handleTextSelection, 200)

// 文本选择操作处理函数
const handleSelectionAction = (action: 'quote' | 'polish' | 'translate'): void => {
  const text = selectionMenu.value.text
  if (!text) return

  // 这里只是关闭菜单，不实现实际功能
  selectionMenu.value.show = false

  // 实际功能实现将在后续添加
}

// 添加关闭下拉菜单函数
const closeDownloadMenu = () => {
  showDownloadMenu.value = false
}

// 显示下载菜单
const showDownloadMenuHandler = () => {
  // 切换菜单显示状态
  showDownloadMenu.value = !showDownloadMenu.value

  // 如果有定时器，清除它
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer)
    menuCloseTimer = null
  }
}

// 取消关闭菜单的定时器 - 保留但不再主动使用
const clearMenuCloseTimer = () => {
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer)
    menuCloseTimer = null
  }
}

// 添加事件监听器，点击其他区域关闭下拉菜单
const setupClickOutsideListener = () => {
  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (showDownloadMenu.value && !target.closest('.download-dropdown')) {
      showDownloadMenu.value = false // 立即隐藏，不使用延迟
    }
  }

  document.addEventListener('click', handleClickOutside)

  // 组件卸载时移除事件监听
  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })
}

// Lifecycle hooks
onMounted(() => {
  // 设置标题
  document.title = pageTitle.value

  // 添加移动端全屏样式
  if (isMobile.value) {
    document.documentElement.classList.add('overflow-hidden')
    document.body.classList.add('overflow-hidden')
  }

  document.addEventListener('fullscreenchange', syncFullscreenState)

  // 折叠侧边栏
  collapseSidebar()

  // 只初始化代码块，但不渲染
  initCodeBlocks()

  // 添加选择变化监听
  document.addEventListener('selectionchange', debouncedHandleTextSelection)

  // 添加鼠标弹起事件，用于触发选择菜单
  editorContainerRef.value?.addEventListener('mouseup', debouncedHandleTextSelection)

  // 点击其他区域关闭菜单
  document.addEventListener('click', e => {
    // 如果点击的不是菜单内部，关闭菜单
    if (selectionMenu.value.show) {
      const target = e.target as HTMLElement
      if (!target.closest('.selection-menu')) {
        selectionMenu.value.show = false
      }
    }
  })

  setupClickOutsideListener() // 添加点击外部关闭菜单的监听

  // 监听来自子组件的导出状态事件
  document.addEventListener('mermaid-export-start', handleChildExportStart)
  document.addEventListener('mermaid-export-end', handleChildExportEnd)
  document.addEventListener('markmap-export-start', handleChildExportStart)
  document.addEventListener('markmap-export-end', handleChildExportEnd)

  // 监听来自子组件的导出状态事件（HTML相关）
  document.addEventListener('html-export-start', handleChildExportStart)
  document.addEventListener('html-export-end', handleChildExportEnd)

  // 监听来自子组件的消息事件
  document.addEventListener('show-message', handleShowMessage)
})

onUnmounted(() => {
  if (editor) {
    editor.destroy()
    editor = null
  }
  document.removeEventListener('fullscreenchange', syncFullscreenState)

  // 确保在组件卸载时也能恢复侧边栏状态
  restoreSidebar()

  // 清理菜单定时器
  if (menuCloseTimer) {
    clearTimeout(menuCloseTimer)
    menuCloseTimer = null
  }

  // 针对移动端，移除全屏样式
  if (isMobile.value) {
    document.documentElement.classList.remove('overflow-hidden')
    document.body.classList.remove('overflow-hidden')
  }

  // 重置页面标题
  document.title = siteName.value

  // 移除事件监听
  document.removeEventListener('selectionchange', debouncedHandleTextSelection)
  editorContainerRef.value?.removeEventListener('mouseup', debouncedHandleTextSelection)

  // 清理子组件导出状态事件监听
  document.removeEventListener('mermaid-export-start', handleChildExportStart)
  document.removeEventListener('mermaid-export-end', handleChildExportEnd)
  document.removeEventListener('markmap-export-start', handleChildExportStart)
  document.removeEventListener('markmap-export-end', handleChildExportEnd)

  // 清理子组件导出状态事件（HTML相关）
  document.removeEventListener('html-export-start', handleChildExportStart)
  document.removeEventListener('html-export-end', handleChildExportEnd)

  // 清理子组件的消息事件
  document.removeEventListener('show-message', handleShowMessage)
})

// Watch dark mode changes to re-theme editor if it exists
watch(isDarkMode, () => {
  if (editor && !isPreviewMode.value) {
    // Re-initialize or update theme if editor is visible
    editor.destroy()
    editor = null
    initializeEditor()
  }
})

// 修改导出方法，委托给子组件处理

const handleExportPng = () => {
  // 委托给子组件处理导出
  if (currentContentType.value === 'mermaid' || currentContentType.value === 'markmap') {
    // 通过事件通知子组件进行导出
    document.dispatchEvent(new CustomEvent(`${currentContentType.value}-export-png`))
  }
  closeDownloadMenu()
  clearMenuCloseTimer()
}

const handleExportSvg = () => {
  // 委托给子组件处理导出
  if (currentContentType.value === 'mermaid' || currentContentType.value === 'markmap') {
    // 通过事件通知子组件进行导出
    document.dispatchEvent(new CustomEvent(`${currentContentType.value}-export-svg`))
  }
  closeDownloadMenu()
  clearMenuCloseTimer()
}

// 处理来自子组件的消息显示
const handleShowMessage = (event: Event) => {
  const customEvent = event as CustomEvent
  const { type, message: payloadMessage } = customEvent.detail || {}

  if (type === 'success') {
    ms.success(payloadMessage)
  } else if (type === 'error') {
    ms.error(payloadMessage)
  } else if (type === 'info') {
    ms.info(payloadMessage)
  }
}

// 处理子组件导出开始
const handleChildExportStart = (event: Event) => {
  const customEvent = event as CustomEvent
  isExporting.value = true
  exportType.value = customEvent.detail?.type || ''
}

// 处理子组件导出结束
const handleChildExportEnd = () => {
  isExporting.value = false
  exportType.value = ''
}

// FreeMind 导出功能 - 委托给 markmap 组件处理
const handleExportFreeMind = () => {
  if (isExporting.value || currentContentType.value !== 'markmap') return

  // 委托给子组件处理导出
  document.dispatchEvent(new CustomEvent('markmap-export-freemind'))
  closeDownloadMenu()
}
</script>

<template>
  <div
    ref="previewerContainerRef"
    class="flex flex-col h-full w-full shadow-lg"
    :class="{
      'bg-white dark:bg-gray-800': true,
      'border-l dark:border-gray-600 rounded-tl-2xl rounded-bl-2xl': !isFullscreen,
      'rounded-none border-none': isFullscreen,
    }"
  >
    <!-- Header with Close Button -->
    <div
      class="flex justify-between items-center h-16 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800"
      :class="{
        'px-2': isMobile,
        'px-4': !isMobile,
        'rounded-tl-2xl': !isFullscreen,
      }"
    >
      <!-- Left side: Tab-style Buttons -->
      <div class="flex items-center space-x-2">
        <!-- Mobile back button with higher visibility -->
        <button v-if="isMobile" @click="handleClose" class="btn-icon btn-sm mr-2" aria-label="返回">
          <Left :size="20" />
        </button>

        <!-- 将前4个按钮放到左侧 -->
        <div class="tab-group tab-group-default">
          <!-- 预览尺寸控制按钮 - 只在HTML模式下显示 -->
          <button
            @click="setPreviewSize('desktop')"
            @mouseleave="hoveredButton = ''"
            class="tab tab-md flex items-center gap-1 px-3 relative"
            :class="{ 'tab-active': isPreviewMode && previewSize === 'desktop' }"
            aria-label="桌面预览"
          >
            <Computer size="16" />
            <span
              v-if="!isMobile"
              class="text-btn-label"
              :class="{
                'opacity-100 max-w-16':
                  hoveredButton === 'desktop' || (isPreviewMode && previewSize === 'desktop'),
                'opacity-0 max-w-0 overflow-hidden':
                  hoveredButton !== 'desktop' && !(isPreviewMode && previewSize === 'desktop'),
              }"
              >{{ isMobile ? '预览' : '桌面' }}</span
            >
          </button>
          <button
            v-if="showDeviceOptions"
            @click="setPreviewSize('tablet')"
            @mouseleave="hoveredButton = ''"
            class="tab tab-md flex items-center gap-1 px-3 relative"
            :class="{ 'tab-active': isPreviewMode && previewSize === 'tablet' }"
            aria-label="平板预览"
          >
            <Ipad size="16" />
            <span
              class="text-btn-label"
              :class="{
                'opacity-100 max-w-16':
                  hoveredButton === 'tablet' || (isPreviewMode && previewSize === 'tablet'),
                'opacity-0 max-w-0 overflow-hidden':
                  hoveredButton !== 'tablet' && !(isPreviewMode && previewSize === 'tablet'),
              }"
              >平板</span
            >
          </button>
          <button
            v-if="showDeviceOptions"
            @click="setPreviewSize('mobile')"
            @mouseleave="hoveredButton = ''"
            class="tab tab-md flex items-center gap-1 px-3 relative"
            :class="{ 'tab-active': isPreviewMode && previewSize === 'mobile' }"
            aria-label="手机预览"
          >
            <Phone size="16" />
            <span
              class="text-btn-label"
              :class="{
                'opacity-100 max-w-16':
                  hoveredButton === 'mobile' || (isPreviewMode && previewSize === 'mobile'),
                'opacity-0 max-w-0 overflow-hidden':
                  hoveredButton !== 'mobile' && !(isPreviewMode && previewSize === 'mobile'),
              }"
              >手机</span
            >
          </button>
          <!-- 编辑按钮 -->
          <button
            @click="switchToEdit"
            @mouseleave="hoveredButton = ''"
            class="tab tab-md flex items-center gap-1 px-3 relative"
            :class="{ 'tab-active': !isPreviewMode }"
            aria-label="编辑代码"
          >
            <Edit size="16" />
            <span
              v-if="!isMobile"
              class="text-btn-label"
              :class="{
                'opacity-100 max-w-16': hoveredButton === 'edit' || !isPreviewMode,
                'opacity-0 max-w-0 overflow-hidden': hoveredButton !== 'edit' && isPreviewMode,
              }"
              >编辑</span
            >
          </button>
        </div>
      </div>

      <!-- Right side: Actions -->
      <div class="flex items-center space-x-1">
        <!-- 右侧保持普通按钮样式 -->
        <div class="flex">
          <!-- 分享按钮 - 只在HTML模式下显示 -->
          <div v-if="showShareButton" class="relative group mx-1">
            <button @click="handleShare" class="btn-icon btn-md" aria-label="分享页面">
              <Share size="20" />
            </button>
            <!-- 悬停提示 -->
            <div v-if="!isMobile" class="tooltip tooltip-bottom">分享页面</div>
          </div>

          <!-- 下载按钮 -->
          <div class="relative group mx-1 download-dropdown">
            <!-- 如果是HTML，直接下载 -->
            <template v-if="currentContentType === 'html'">
              <button
                @click="handleSaveAsHtml"
                class="btn-icon btn-md"
                :class="{ 'opacity-75 pointer-events-none': isExporting }"
                :disabled="isExporting"
                aria-label="下载HTML"
              >
                <LoadingOne v-if="exportType === 'HTML'" size="20" class="animate-spin" />
                <Download v-else size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">下载 HTML</div>
            </template>

            <!-- 如果是图表，显示下拉菜单 -->
            <template v-else>
              <button
                class="btn-icon btn-md"
                aria-label="导出文件"
                aria-haspopup="true"
                :aria-expanded="showDownloadMenu"
                @click="showDownloadMenuHandler"
              >
                <LoadingOne v-if="isExporting" size="20" class="animate-spin" />
                <Download v-else size="20" />
              </button>
              <div v-if="!isMobile && !showDownloadMenu" class="tooltip tooltip-bottom">
                导出文件
              </div>

              <!-- 下拉菜单 -->
              <Transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
              >
                <div
                  v-if="showDownloadMenu"
                  class="absolute right-0 mt-2 z-50 py-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
                  @click.stop
                >
                  <!-- PNG选项 -->
                  <button
                    @click="handleExportPng"
                    class="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    :class="{ 'opacity-75 pointer-events-none': isExporting }"
                  >
                    <span>导出 PNG</span>
                    <span v-if="exportType === 'PNG'" class="ml-auto">
                      <LoadingOne size="16" class="animate-spin" />
                    </span>
                  </button>

                  <!-- SVG选项 - 仅对图表显示 -->
                  <button
                    @click="handleExportSvg"
                    class="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    :class="{ 'opacity-75 pointer-events-none': isExporting }"
                  >
                    <span>导出 SVG</span>
                    <span v-if="exportType === 'SVG'" class="ml-auto">
                      <LoadingOne size="16" class="animate-spin" />
                    </span>
                  </button>

                  <!-- FreeMind选项 - 仅对思维导图显示 -->
                  <button
                    v-if="currentContentType === 'markmap'"
                    @click="handleExportFreeMind"
                    class="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    :class="{ 'opacity-75 pointer-events-none': isExporting }"
                  >
                    <span>导出 .mm 文件</span>
                    <span v-if="exportType === 'FreeMind'" class="ml-auto">
                      <LoadingOne size="16" class="animate-spin" />
                    </span>
                  </button>
                </div>
              </Transition>
            </template>
          </div>

          <!-- 全屏按钮 -->
          <div v-if="!isMobile" class="relative group mx-1">
            <button
              @click="toggleFullscreen"
              class="btn-icon btn-md"
              :aria-label="isFullscreen ? '退出全屏' : '全屏'"
            >
              <OffScreen v-if="isFullscreen" size="20" />
              <FullScreen v-else size="20" />
            </button>
            <!-- 悬停提示 -->
            <div v-if="!isMobile" class="tooltip tooltip-bottom">
              {{ isFullscreen ? '退出全屏' : '全屏' }}
            </div>
          </div>
        </div>

        <!-- 关闭按钮 -->
        <div v-if="!isMobile && !isFullscreen" class="relative group">
          <button @click="handleClose" class="btn-icon btn-md" aria-label="关闭预览">
            <Close size="20" />
          </button>
          <!-- 悬停提示 -->
          <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭预览</div>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div
      class="flex-grow overflow-hidden relative"
      :class="{
        'rounded-bl-2xl': !isFullscreen,
      }"
    >
      <!-- 统一加载指示器 - 处理所有加载状态 -->
      <div
        v-show="isStreamIn || isComponentSwitching"
        class="absolute top-10 left-1/2 transform -translate-x-1/2 z-30 flex items-center justify-center"
      >
        <div class="loading-animation">
          <span></span>
        </div>
      </div>

      <!-- Preview Area -->
      <div
        :class="[
          'absolute inset-0 transition-opacity duration-300 p-1 preview-area',
          isPreviewMode ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
        ]"
      >
        <!-- 使用统一的内容渲染器组件 -->
        <ContentRenderer
          v-if="isPreviewMode"
          :content-type="currentContentType"
          :content="htmlContent"
          :preview-size="previewSize"
          @loading-state-change="isComponentSwitching = $event"
        />
      </div>

      <!-- Editor Area -->
      <div
        :class="[
          'absolute inset-0 transition-opacity duration-300 code-editor-container-html h-full overflow-hidden',
          !isPreviewMode ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
        ]"
        ref="editorContainerRef"
      >
        <!-- CodeMirror will be mounted here -->
      </div>

      <!-- HTML代码导航控制 (悬浮在下方) -->
      <div
        v-show="isPreviewMode && !isStreamIn && hasMultipleBlocks"
        class="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30 flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 shadow-md"
      >
        <!-- 左切换按钮 -->
        <button
          :disabled="currentBlockIndex === 0"
          @click="prevBlock"
          class="p-1.5 rounded-md text-sm transition-colors duration-200 focus:outline-none"
          :class="[
            currentBlockIndex === 0
              ? 'opacity-50 cursor-not-allowed'
              : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50',
          ]"
          title="上一个代码块"
        >
          <Left size="16" />
        </button>

        <!-- 代码块导航计数和类型显示 -->
        <span class="px-2 py-1 text-sm text-gray-700 dark:text-gray-300 self-center">
          {{ currentBlockIndex + 1 }}/{{ codeBlocks.length }}
          <span
            class="ml-1 px-1.5 py-0.5 text-xs rounded-md"
            :class="{
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300':
                currentContentType === 'html',
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':
                currentContentType === 'mermaid',
              'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300':
                currentContentType === 'markmap',
            }"
          >
            {{ contentTypeName }}
          </span>
        </span>

        <!-- 右切换按钮 -->
        <button
          :disabled="currentBlockIndex === codeBlocks.length - 1"
          @click="nextBlock"
          class="p-1.5 rounded-md text-sm transition-colors duration-200 focus:outline-none"
          :class="[
            currentBlockIndex === codeBlocks.length - 1
              ? 'opacity-50 cursor-not-allowed'
              : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50',
          ]"
          title="下一个代码块"
        >
          <Right size="16" />
        </button>
      </div>

      <!-- 新增: 选择文本后的弹出菜单 -->
      <Transition
        v-if="false"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <div
          v-show="selectionMenu.show && !isPreviewMode"
          class="selection-menu absolute z-50"
          :style="{
            left: `${selectionMenu.x}px`,
            [selectionMenu.upward ? 'bottom' : 'top']:
              `${selectionMenu.upward ? 'auto' : selectionMenu.y}px`,
            transform: 'translateX(-50%)',
            top: selectionMenu.upward ? 'auto' : `${selectionMenu.y}px`,
            bottom: selectionMenu.upward ? `calc(100% - ${selectionMenu.y}px + 10px)` : 'auto',
          }"
          @click.stop
        >
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow-xl flex items-stretch overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            <!-- 引用按钮 -->
            <button @click="handleSelectionAction('quote')" class="selection-menu-btn" title="引用">
              <Quote size="16" />
              <span class="ml-1">引用</span>
            </button>

            <!-- 分隔线 -->
            <div class="w-px h-auto self-stretch bg-gray-200 dark:bg-gray-700"></div>

            <!-- 润色按钮 -->
            <button
              @click="handleSelectionAction('polish')"
              class="selection-menu-btn"
              title="润色"
            >
              <Pencil size="16" />
              <span class="ml-1">润色</span>
            </button>

            <!-- 分隔线 -->
            <div class="w-px h-auto self-stretch bg-gray-200 dark:bg-gray-700"></div>

            <!-- 翻译按钮 -->
            <button
              @click="handleSelectionAction('translate')"
              class="selection-menu-btn"
              title="翻译"
            >
              <Translation size="16" />
              <span class="ml-1">翻译</span>
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Share Popover (Inline Dialog) -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div v-if="showSharePopover" class="absolute inset-0 z-30 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="closeSharePopover"></div>
        <!-- Dialog Content -->
        <div
          class="relative w-[90vw] max-w-[450px] bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden transform transition-all"
          @click.stop
        >
          <div
            class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
          >
            <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
              分享: {{ pageTitle }}
            </h3>
            <Close size="18" class="btn-icon btn-md" @click="closeSharePopover" />
          </div>
          <div class="p-5">
            <input
              ref="shareInputRef"
              type="text"
              :value="shareLinkToShow"
              readonly
              class="input input-md w-full"
              placeholder="分享链接..."
              @focus="($event.target as HTMLInputElement)?.select()"
            />
          </div>
          <div class="flex justify-end gap-3 px-5 py-4">
            <button class="btn btn-secondary btn-md" @click="closeSharePopover">关闭</button>
            <button
              class="btn btn-primary btn-md flex items-center gap-1"
              @click="handleCopyInPopover"
            >
              <Copy size="14" />
              复制
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 全屏模式下确保暗黑模式正确应用 - 使用Tailwind颜色 */
:fullscreen {
  @apply bg-white;
}

html.dark :fullscreen {
  @apply bg-gray-800;
}

/* 全屏时保持正确的背景色 */

/* CodeMirror编辑器样式 - 这些必须保留因为是深度选择器 */
.code-editor-container-html :deep(.cm-editor) {
  @apply h-full font-mono text-sm;
  outline: none !important;
  border: none !important;
}
.code-editor-container-html :deep(.cm-scroller) {
  @apply overflow-auto;
}
.code-editor-container-html :deep(.cm-gutters) {
  @apply border-r border-gray-300 bg-gray-50;
}
html.dark .code-editor-container-html :deep(.cm-gutters) {
  @apply border-gray-600 bg-gray-800;
}
.code-editor-container-html :deep(.cm-focused) {
  outline: none !important;
  box-shadow: none !important;
}

/* 预览区域样式已通过Tailwind类处理 */

/* 动画已使用Tailwind的内置类 animate-spin, animate-pulse 等 */

/* 移除所有自定义全屏样式，使用Tailwind处理 */

/* 选择菜单样式 */
.selection-menu {
  @apply select-none;
}

.selection-menu-btn {
  @apply flex items-center px-3 py-2 text-sm text-gray-600 bg-transparent border-none cursor-pointer transition-all whitespace-nowrap;
  @apply hover:bg-gray-100 hover:text-gray-900;
  @apply dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-gray-50;
}

/* 按钮文字标签过渡效果 */
.text-btn-label {
  @apply whitespace-nowrap overflow-hidden;
}
</style>
