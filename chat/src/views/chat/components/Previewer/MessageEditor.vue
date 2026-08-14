<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store/modules/app'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message } from '@/utils/message'
import { sanitizeMarkdownHtml } from '@/utils/sanitizeHtml'
import { Close, Download, FileCode, FilePdf, FileWord, Printer } from '@icon-park/vue-next'
import mdKatex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import 'highlight.js/styles/atom-one-light.css'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  close?: () => void
}>()

const ms = message()
const { isMobile } = useBasicLayout()
const globalStore = useGlobalStoreWithOut()
const appStore = useAppStore()

const editorRef = ref<HTMLDivElement>()
const content = ref('')
const isExportMenuOpen = ref(false)
const sidebarStateBeforePreview = ref(false)

// 获取消息内容
const messageContent = computed(() => globalStore.editingMessageContent || '')
// 获取对话组名称
const conversationTitle = computed(() => globalStore.editingConversationTitle || '新对话')

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

// 提取标题（第一个一级标题）
const documentTitle = computed(() => {
  const match = content.value.match(/^#\s+(.+)$/m)
  return match ? match[1] : '编辑'
})

// 简化版 highlightBlock 函数 - 去掉语言标识栏
function highlightBlock(str: string, lang?: string) {
  // 直接返回代码块，没有 header，外层无边距
  return `<pre class="code-block-wrapper rounded-lg overflow-hidden">
    <code class="hljs code-content-scrollable custom-scrollbar px-3 py-2 text-sm bg-gray-50 dark:bg-[#282c34] leading-relaxed block overflow-x-auto">${str}</code>
  </pre>`
}

// 初始化 Markdown 渲染器
const mdi = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mdKatex, {
  throwOnError: false,
  errorColor: '#cc0000',
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true },
  ],
})

// 标记是否已初始化
let isInitialized = false

// 监听消息内容变化（用于初始化）
watch(
  messageContent,
  newVal => {
    // 首次初始化
    if (!isInitialized && newVal) {
      content.value = newVal
      nextTick(() => {
        initEditor()
      })
    }
  },
  { immediate: true }
)

// 监听待处理的编辑diff
watch(
  () => globalStore.pendingEditDiff,
  newDiff => {
    if (newDiff && isInitialized) {
      applyDiffWithAnimation(newDiff).then(() => {
        // 清除已处理的diff
        globalStore.clearPendingEditDiff()
      })
    }
  }
)

// 初始化编辑器
function initEditor() {
  if (!editorRef.value || isInitialized) return

  editorRef.value.innerHTML = markdownToHtml(content.value)
  renderMathInElement(editorRef.value)

  // 只添加一次事件监听器
  editorRef.value.addEventListener('input', handleInput)
  editorRef.value.addEventListener('paste', handlePaste)

  isInitialized = true
}

// 组件卸载时清理
onBeforeUnmount(() => {
  if (editorRef.value) {
    editorRef.value.removeEventListener('input', handleInput)
    editorRef.value.removeEventListener('paste', handlePaste)
  }
  if (renderTimer) clearTimeout(renderTimer)
  if (animationTimer) clearTimeout(animationTimer)

  // 清理注入的样式
  const styleElement = document.getElementById('editor-highlight-theme-overrides')
  if (styleElement) {
    document.head.removeChild(styleElement)
  }
})

// 动画相关
let animationTimer: NodeJS.Timeout | null = null

// 精确diff动画
async function applyDiffWithAnimation(editDiff: any) {
  if (!editorRef.value || !editDiff.changes) return

  // 清理之前的动画
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = null
  }

  // 获取当前内容的行
  const currentLines = content.value.split('\n')

  // 按顺序处理每个change
  for (const change of editDiff.changes) {
    await applyChangeWithAnimation(currentLines, change)
  }

  // 更新最终内容
  content.value = currentLines.join('\n')
  globalStore.updateEditingMessageContent(content.value)
}

// 应用单个change的动画
async function applyChangeWithAnimation(lines: string[], change: any) {
  const { type, startLine, endLine, oldText, newText } = change
  const startIndex = startLine - 1 // 转换为0基索引

  if (!editorRef.value) return

  // 先高亮要修改的部分，传入实际要修改的文本内容用于匹配
  const textToHighlight = type === 'insert' ? lines[startIndex] : oldText
  await highlightChangeArea(startLine, endLine || startLine, textToHighlight)
  await sleep(300) // 短暂停留，让用户看到要修改的地方

  switch (type) {
    case 'replace': {
      // 替换动画：先删除，再插入
      const endIndex = (endLine || startLine) - 1

      // 删除动画
      for (let i = endIndex; i >= startIndex; i--) {
        await animateLineChange(i, lines[i], '', 'delete')
        lines[i] = ''
      }

      // 插入动画
      const newLines = newText.split('\n')
      lines.splice(startIndex, endIndex - startIndex + 1, ...newLines)

      for (let i = 0; i < newLines.length; i++) {
        await animateLineChange(startIndex + i, '', newLines[i], 'insert')
      }
      break
    }

    case 'insert': {
      // 插入动画 - 在startLine之后插入
      const newLines = newText.split('\n')

      // 如果startIndex超出范围，插入到末尾
      const insertPosition = Math.min(startIndex + 1, lines.length)

      lines.splice(insertPosition, 0, ...newLines)

      for (let i = 0; i < newLines.length; i++) {
        await animateLineChange(insertPosition + i, '', newLines[i], 'insert')
      }
      break
    }

    case 'delete': {
      // 删除动画
      const endIndex = (endLine || startLine) - 1

      for (let i = endIndex; i >= startIndex; i--) {
        await animateLineChange(i, lines[i], '', 'delete')
      }

      lines.splice(startIndex, endIndex - startIndex + 1)
      break
    }
  }
}

// 单行变化动画
async function animateLineChange(
  lineIndex: number,
  oldText: string,
  newText: string,
  animationType: 'delete' | 'insert' | 'replace'
) {
  if (!editorRef.value) return

  // 确保当前行在视图内
  const ensureLineInView = () => {
    const lines = editorRef.value?.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')
    if (lines && lines[lineIndex]) {
      const targetElement = lines[lineIndex] as HTMLElement
      const rect = targetElement.getBoundingClientRect()
      const editorRect = editorRef.value?.getBoundingClientRect()

      // 只有当元素不在视窗内时才滚动
      if (editorRect && (rect.top < editorRect.top || rect.bottom > editorRect.bottom)) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }
  }

  // 计算总字符数和动画速度
  const minDuration = 750 // 最小持续时间 0.75秒
  const maxDuration = 1250 // 最大持续时间 1.25秒

  // 计算需要处理的总字符数
  let totalChars = 0
  if (animationType === 'delete') {
    totalChars = oldText.length
  } else if (animationType === 'insert') {
    totalChars = newText.length
  } else if (animationType === 'replace') {
    totalChars = oldText.length + newText.length
  }

  // 确保至少有1个字符，避免除零
  totalChars = Math.max(1, totalChars)

  // 根据字符数计算总时间，在1.5-2.5秒之间
  // 字符越多，时间越接近最大值
  const duration = Math.min(maxDuration, Math.max(minDuration, minDuration + totalChars * 10))

  // 计算每个字符的延迟
  const speed = Math.floor(duration / totalChars)

  // 在动画开始前确保行在视图内
  ensureLineInView()

  if (animationType === 'delete' || animationType === 'replace') {
    // 删除动画：逐字消失
    const deleteSpeed =
      animationType === 'replace'
        ? Math.floor(
            ((duration / (oldText.length + newText.length)) * oldText.length) / oldText.length
          )
        : speed
    for (let i = oldText.length; i > 0; i--) {
      const tempContent = content.value.split('\n')
      tempContent[lineIndex] = oldText.slice(0, i - 1)
      content.value = tempContent.join('\n')
      editorRef.value.innerHTML = markdownToHtml(content.value)
      await sleep(deleteSpeed)
    }
  }

  if (animationType === 'insert' || animationType === 'replace') {
    // 插入动画：逐字出现
    const insertSpeed =
      animationType === 'replace'
        ? Math.floor(
            ((duration / (oldText.length + newText.length)) * newText.length) / newText.length
          )
        : speed

    // 在插入动画开始前再次确保在视图内
    ensureLineInView()

    for (let i = 0; i <= newText.length; i++) {
      const tempContent = content.value.split('\n')
      tempContent[lineIndex] = newText.slice(0, i)
      content.value = tempContent.join('\n')
      editorRef.value.innerHTML = markdownToHtml(content.value)

      // 每10个字符或最后渲染一次数学公式
      if (i % 10 === 0 || i === newText.length) {
        renderMathInElement(editorRef.value)
      }

      if (i < newText.length) {
        await sleep(insertSpeed)
      }
    }
  }
}

// 高亮要修改的区域
async function highlightChangeArea(startLine: number, endLine: number, targetText?: string) {
  if (!editorRef.value) return

  // 查找目标元素
  let targetElements: HTMLElement[] = []

  // 首先尝试使用data-line属性精确匹配
  for (let line = startLine; line <= endLine; line++) {
    const elementsWithLine = editorRef.value.querySelectorAll(`[data-line="${line}"]`)
    elementsWithLine.forEach(el => {
      const element = el as HTMLElement
      if (!targetElements.includes(element)) {
        targetElements.push(element)
      }
    })
  }

  // 如果没找到，尝试通过文本内容匹配
  if (targetElements.length === 0 && targetText) {
    const allElements = editorRef.value.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote'
    )
    const cleanTarget = targetText.trim()

    allElements.forEach(el => {
      const element = el as HTMLElement
      const elementText = element.textContent?.trim()

      if (elementText && (elementText.includes(cleanTarget) || cleanTarget.includes(elementText))) {
        targetElements.push(element)
      }
    })
  }

  // 如果还是没找到，使用索引估算作为fallback
  if (targetElements.length === 0) {
    const allElements = editorRef.value.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote'
    )
    const visibleElements = Array.from(allElements).filter(el => {
      const element = el as HTMLElement
      return element.textContent?.trim()
    }) as HTMLElement[]

    // 使用行号作为索引（注意这是估算）
    const estimatedIndex = Math.min(Math.max(0, startLine - 1), visibleElements.length - 1)
    if (visibleElements[estimatedIndex]) {
      targetElements = [visibleElements[estimatedIndex]]
    }
  }

  // 滚动和高亮
  if (targetElements.length > 0) {
    // 滚动到第一个元素
    targetElements[0].scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })

    // 高亮所有目标元素
    targetElements.forEach(element => {
      element.classList.add('diff-highlight')
    })

    // 清除高亮
    setTimeout(() => {
      targetElements.forEach(element => {
        element.classList.remove('diff-highlight')
      })
    }, 600)
  }
}

// 辅助函数：睡眠
function sleep(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

// 处理输入
function handleInput() {
  if (!editorRef.value) return

  // 直接更新内容，不做任何DOM操作
  content.value = htmlToMarkdown(editorRef.value.innerHTML)

  // 更新全局store中的内容
  globalStore.updateEditingMessageContent(content.value)

  // 延迟渲染数学公式，避免频繁重渲染
  debounceRenderMath()
}

// 防抖渲染数学公式
let renderTimer: NodeJS.Timeout | null = null
function debounceRenderMath() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    if (editorRef.value) {
      // 获取当前光标位置
      const selection = window.getSelection()
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

      // 渲染数学公式
      renderMathInElement(editorRef.value)

      // 恢复光标位置
      if (range && selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }, 2000) // 增加延迟时间，减少渲染频率
}

// 处理粘贴
function handlePaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

// Markdown 转 HTML（带行号标记）
function markdownToHtml(markdown: string): string {
  let processedMarkdown = markdown
    .replace(/\\\((.+?)\\\)/g, (match, inlineMathContent) => `$${inlineMathContent}$`)
    .replace(/\\\[(.+?)\\\]/g, (match, blockMathContent) => `$$${blockMathContent}$$`)

  // 先正常渲染
  const html = sanitizeMarkdownHtml(mdi.render(processedMarkdown))

  // 为生成的HTML添加行号标记
  return addLineNumbersToHtml(html, markdown)
}

// 为HTML元素添加data-line属性
function addLineNumbersToHtml(html: string, markdown: string): string {
  // 创建临时DOM来处理HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html

  // 获取Markdown源文本的行
  const markdownLines = markdown.split('\n')

  // 获取所有可能需要标记的元素
  const elements = tempDiv.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, table, hr'
  )

  // 创建内容到行号的映射
  const contentToLineMap = new Map<string, number>()

  // 遍历Markdown行，建立内容到行号的映射
  markdownLines.forEach((line, index) => {
    const trimmedLine = line.trim()
    if (trimmedLine) {
      // 移除Markdown标记来匹配渲染后的文本
      const cleanLine = trimmedLine
        .replace(/^#+\s+/, '') // 移除标题标记
        .replace(/^[-*+]\s+/, '') // 移除列表标记
        .replace(/^\d+\.\s+/, '') // 移除有序列表标记
        .replace(/^>\s+/, '') // 移除引用标记
        .trim()

      if (cleanLine) {
        contentToLineMap.set(cleanLine, index + 1)
      }
    }
  })

  // 为每个元素添加data-line属性
  elements.forEach((element: Element) => {
    const elementText = element.textContent?.trim()
    if (elementText) {
      // 尝试找到对应的行号
      for (const [lineContent, lineNum] of contentToLineMap.entries()) {
        if (elementText.includes(lineContent) || lineContent.includes(elementText)) {
          element.setAttribute('data-line', lineNum.toString())
          break
        }
      }
    }
  })

  return tempDiv.innerHTML
}

// 渲染数学公式
function renderMathInElement(element: HTMLElement) {
  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const hasInlineMath = /\$[^$]+\$|\\\(.+?\\\)/i.test(text)
      const hasBlockMath = /\$\$[^$]+\$\$|\\\[.+?\\\]/i.test(text)

      if (!hasInlineMath && !hasBlockMath) return

      const fragment = document.createDocumentFragment()
      let lastIndex = 0
      let hasReplacement = false

      const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g

      let match
      while ((match = mathRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
        }

        try {
          let latex = ''
          let isBlock = false

          if (match[1]) {
            latex = match[1]
            isBlock = true
          } else if (match[2]) {
            latex = match[2]
          } else if (match[3]) {
            latex = match[3]
            isBlock = true
          } else if (match[4]) {
            latex = match[4]
          }

          if (latex) {
            const span = document.createElement('span')
            span.innerHTML = katex.renderToString(latex, {
              displayMode: isBlock,
              throwOnError: false,
            })
            fragment.appendChild(span)
            hasReplacement = true
          } else {
            fragment.appendChild(document.createTextNode(match[0]))
          }
        } catch (e) {
          fragment.appendChild(document.createTextNode(match[0]))
        }

        lastIndex = match.index + match[0].length
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }

      if (hasReplacement && node.parentNode) {
        const span = document.createElement('span')
        span.appendChild(fragment)
        node.parentNode.replaceChild(span, node)
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childElement = node as HTMLElement
      if (
        childElement.classList.contains('katex') ||
        childElement.classList.contains('katex-html') ||
        childElement.tagName === 'CODE' ||
        childElement.tagName === 'PRE'
      ) {
        return
      }

      const childNodes = Array.from(node.childNodes)
      childNodes.forEach(child => processNode(child))
    }
  }

  processNode(element)
}

// HTML 转 Markdown
function htmlToMarkdown(html: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = html

  let markdown = ''

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement
      const tagName = elem.tagName.toLowerCase()
      let nodeContent = ''

      elem.childNodes.forEach(child => {
        nodeContent += processNode(child)
      })

      switch (tagName) {
        case 'h1':
          return `# ${nodeContent}\n\n`
        case 'h2':
          return `## ${nodeContent}\n\n`
        case 'h3':
          return `### ${nodeContent}\n\n`
        case 'h4':
          return `#### ${nodeContent}\n\n`
        case 'h5':
          return `##### ${nodeContent}\n\n`
        case 'h6':
          return `###### ${nodeContent}\n\n`
        case 'p':
          return `${nodeContent}\n\n`
        case 'strong':
        case 'b':
          return `**${nodeContent}**`
        case 'em':
        case 'i':
          return `*${nodeContent}*`
        case 'code':
          if (elem.parentElement?.tagName.toLowerCase() === 'pre') {
            return nodeContent
          }
          return `\`${nodeContent}\``
        case 'pre':
          return `\`\`\`\n${nodeContent}\n\`\`\`\n\n`
        case 'ul':
          return nodeContent
        case 'ol':
          return nodeContent
        case 'li':
          const listParent = elem.parentElement?.tagName.toLowerCase()
          if (listParent === 'ul') return `- ${nodeContent}\n`
          if (listParent === 'ol') {
            const index = Array.from(elem.parentElement?.children || []).indexOf(elem) + 1
            return `${index}. ${nodeContent}\n`
          }
          return nodeContent
        case 'a':
          const href = elem.getAttribute('href') || ''
          return `[${nodeContent}](${href})`
        case 'img':
          const src = elem.getAttribute('src') || ''
          const alt = elem.getAttribute('alt') || ''
          return `![${alt}](${src})`
        case 'blockquote':
          return `> ${nodeContent}\n`
        case 'hr':
          return '---\n\n'
        case 'br':
          return '\n'
        case 'div':
          return `${nodeContent}\n`
        default:
          return nodeContent
      }
    }

    return ''
  }

  temp.childNodes.forEach(node => {
    markdown += processNode(node)
  })

  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

// 准备导出的 HTML
function prepareExportHtml(markdown: string): string {
  let processedMarkdown = markdown
    .replace(/\\\((.+?)\\\)/g, '$$$1$$')
    .replace(/\\\[(.+?)\\\]/g, '$$$$1$$$$')

  const html = sanitizeMarkdownHtml(mdi.render(processedMarkdown))
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html

  return tempDiv.innerHTML
}

// 导出功能
async function handleExport(type: string) {
  isExportMenuOpen.value = false
  // 优先使用对话组名称，其次是文档标题，最后是默认名称
  const filename =
    conversationTitle.value || documentTitle.value || `编辑内容_${new Date().toLocaleDateString()}`

  let htmlWithMath = ''
  if (editorRef.value) {
    const clonedContent = editorRef.value.cloneNode(true) as HTMLElement
    htmlWithMath = clonedContent.innerHTML
  } else {
    htmlWithMath = prepareExportHtml(content.value)
  }
  htmlWithMath = sanitizeMarkdownHtml(htmlWithMath)
  const safeFilename = filename.replace(/[<>"'&]/g, character => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '&': '&amp;',
    }
    return entities[character]
  })

  try {
    switch (type) {
      case 'word':
        const { exportToWord } = await import('@/utils/simpleExport')
        // 直接传递 Markdown 源内容
        await exportToWord(content.value, filename)
        ms.success('Word 导出成功')
        break
      case 'pdf':
        const { exportToPdf } = await import('@/utils/simpleExport')
        await exportToPdf(htmlWithMath, filename)
        ms.success('PDF 导出成功')
        break
      case 'markdown':
        downloadFile(content.value, `${filename}.md`, 'text/markdown')
        ms.success('Markdown 导出成功')
        break
      case 'print':
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          const printDocument = printWindow.document
          const title = printDocument.createElement('title')
          title.textContent = filename
          const meta = printDocument.createElement('meta')
          meta.setAttribute('charset', 'UTF-8')
          const katexStyles = printDocument.createElement('link')
          katexStyles.rel = 'stylesheet'
          katexStyles.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
          const styles = printDocument.createElement('style')
          styles.textContent = `
@media print { @page { size: A4; margin: 20mm; } }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  line-height: 1.8; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px;
}
h1 { font-size: 28px; margin: 20px 0; font-weight: bold; }
h2 { font-size: 24px; margin: 18px 0; font-weight: bold; }
h3 { font-size: 20px; margin: 16px 0; font-weight: bold; }
p { margin: 12px 0; }
pre { background: #f5f5f5; padding: 12px; overflow-x: auto; border-radius: 4px; }
code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
blockquote { border-left: 4px solid #ddd; margin: 16px 0; padding-left: 20px; color: #666; }
ul, ol { margin: 12px 0; padding-left: 30px; }
li { margin: 6px 0; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
th { background: #f5f5f5; font-weight: bold; }
img { max-width: 100%; height: auto; }
.katex { font-size: 1.1em; }
.katex-display { margin: 1em 0; }
`
          printDocument.head.replaceChildren(meta, title, katexStyles, styles)

          const parsedContent = new DOMParser().parseFromString(htmlWithMath, 'text/html')
          const printContent = printDocument.createElement('main')
          parsedContent.body.childNodes.forEach(node => {
            printContent.appendChild(printDocument.importNode(node, true))
          })
          printDocument.body.replaceChildren(printContent)

          let didPrint = false
          const printNow = () => {
            if (didPrint || printWindow.closed) return
            didPrint = true
            printWindow.focus()
            printWindow.onafterprint = () => printWindow.close()
            printWindow.print()
          }
          katexStyles.addEventListener('load', printNow, { once: true })
          printWindow.setTimeout(printNow, 800)
        }
        ms.success('正在打开打印页面...')
        break
      case 'html':
        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeFilename}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
    }
    pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 2px 4px; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; }
    .katex { font-size: 1.1em; }
    .katex-display { margin: 1em 0; }
  </style>
</head>
<body>
  ${htmlWithMath}
</body>
</html>`
        downloadFile(fullHtml, `${filename}.html`, 'text/html')
        ms.success('HTML 导出成功')
        break
    }
  } catch (error) {
    ms.error('导出失败，请重试')
  }
}

// 下载文件
function downloadFile(fileContent: string, filename: string, type: string) {
  const blob = new Blob([fileContent], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 关闭编辑器
function handleClose() {
  // 恢复侧边栏状态
  restoreSidebar()

  if (props.close) {
    props.close()
  }
}

// 注入主题样式覆盖
const injectThemeStyles = () => {
  // 检查是否已存在样式元素
  const existingStyle = document.getElementById('editor-highlight-theme-overrides')
  if (existingStyle) return

  // 创建新的样式元素 - 与对话组保持一致
  const style = document.createElement('style')
  style.id = 'editor-highlight-theme-overrides'
  style.textContent = `
    /* 浅色模式覆盖 */
    html:not(.dark) .prose .hljs {
      background: transparent !important;
      color: #383a42 !important;
    }

    /* 深色模式覆盖 */
    html.dark .prose .hljs {
      background: transparent !important;
      color: #abb2bf !important;
    }

    /* 代码块没有额外的容器背景，仅使用 code 元素的背景 */
  `
  document.head.appendChild(style)
}

// 组件挂载时折叠侧边栏
onMounted(() => {
  collapseSidebar()
  injectThemeStyles()
})
</script>

<template>
  <div
    class="h-full w-full flex flex-col bg-white dark:bg-gray-800 border-l dark:border-gray-600 rounded-tl-2xl rounded-bl-2xl shadow-lg"
  >
    <!-- 顶部工具栏 -->
    <div
      class="flex justify-between items-center p-3 border-b dark:border-gray-700"
      :class="{ 'px-2': isMobile, 'px-4': !isMobile }"
    >
      <div class="flex items-center space-x-2">
        <!-- 标题 -->
        <h2 class="text-lg font-medium dark:text-gray-200">AI 编辑</h2>
      </div>

      <div class="flex items-center space-x-2">
        <!-- 导出菜单 -->
        <DropdownMenu v-model="isExportMenuOpen" position="bottom-right">
          <template #trigger>
            <div class="relative group">
              <button class="btn-icon btn-md" aria-label="导出文档">
                <Download :size="20" />
              </button>
              <!-- 菜单打开时不显示 tooltip -->
              <div v-if="!isMobile && !isExportMenuOpen" class="tooltip tooltip-bottom">
                导出文档
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <div>
              <div
                class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b dark:border-gray-600"
              >
                导出格式
              </div>
              <button
                @click="
                  () => {
                    handleExport('word')
                    close()
                  }
                "
                class="menu-item flex items-center w-full"
              >
                <FileWord class="text-blue-500 mr-2" :size="18" />
                <span>Word 文档</span>
              </button>
              <button
                @click="
                  () => {
                    handleExport('pdf')
                    close()
                  }
                "
                class="menu-item flex items-center w-full"
              >
                <FilePdf class="text-red-500 mr-2" :size="18" />
                <span>PDF 文档</span>
              </button>
              <button
                @click="
                  () => {
                    handleExport('print')
                    close()
                  }
                "
                class="menu-item flex items-center w-full"
              >
                <Printer class="text-green-500 mr-2" :size="18" />
                <span>打印（高清PDF）</span>
              </button>
              <button
                @click="
                  () => {
                    handleExport('html')
                    close()
                  }
                "
                class="menu-item flex items-center w-full"
              >
                <FileCode class="text-orange-500 mr-2" :size="18" />
                <span>HTML 网页</span>
              </button>
              <button
                @click="
                  () => {
                    handleExport('markdown')
                    close()
                  }
                "
                class="menu-item flex items-center w-full"
              >
                <FileCode class="text-purple-500 mr-2" :size="18" />
                <span>Markdown</span>
              </button>
            </div>
          </template>
        </DropdownMenu>

        <!-- 关闭按钮 -->
        <div class="relative group">
          <button @click="handleClose" class="btn-icon btn-md" aria-label="关闭编辑器">
            <Close :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭编辑器</div>
        </div>
      </div>
    </div>

    <!-- 编辑器内容区（所见即所得） -->
    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar editor-scroll-container">
      <div
        ref="editorRef"
        contenteditable="true"
        class="min-h-full focus:outline-none prose prose-gray dark:prose-invert max-w-none editor-content"
        style="
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.8;
        "
      ></div>
      <!-- 底部空白区域，确保底部内容也能滚动到中心 -->
      <div class="editor-bottom-spacer"></div>
    </div>
  </div>
</template>

<style scoped>
/* 按钮样式 */
.btn-icon {
  @apply p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-md {
  @apply p-2;
}

/* 工具提示 */
.tooltip {
  @apply absolute z-10 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 pointer-events-none transition-opacity duration-200 whitespace-nowrap;
}

.tooltip-bottom {
  @apply top-full mt-1 left-1/2 transform -translate-x-1/2;
}

.group:hover .tooltip {
  @apply opacity-100;
}

/* 菜单项样式 */
.menu-item {
  @apply px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left;
}

/* 编辑器滚动容器 */
.editor-scroll-container {
  position: relative;
}

/* 编辑器内容区 */
.editor-content {
  position: relative;
}

/* 底部空白区域，确保底部内容能滚动到中心 */
.editor-bottom-spacer {
  height: 50vh; /* 视口高度的50%，确保底部内容能居中 */
  pointer-events: none; /* 不响应鼠标事件 */
}

/* 编辑器样式 */
:deep(.prose) {
  color: inherit;
}

:deep(.prose h1) {
  font-size: 2em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.prose h2) {
  font-size: 1.5em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.prose h3) {
  font-size: 1.25em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.prose p) {
  margin: 0.5em 0;
}

:deep(.prose ul),
:deep(.prose ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

:deep(.prose li) {
  margin: 0.25em 0;
}

/* 内联代码样式 */
:deep(.prose code:not(.hljs)) {
  @apply bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm;
  font-family: 'Courier New', monospace;
}

/* 代码块容器样式 */
:deep(.prose .code-block-wrapper) {
  @apply rounded-lg overflow-hidden;
  @apply border border-gray-200 dark:border-gray-700;
  margin: 0;
}

/* 代码块内容 */
:deep(.prose .code-content-scrollable) {
  @apply px-3 py-2 text-sm leading-relaxed block overflow-x-auto;
  @apply bg-gray-50;
  font-family: 'Courier New', monospace;
  white-space: pre !important;
  max-height: 50vh;
}

/* 深色模式代码块背景 */
html.dark :deep(.prose .code-content-scrollable) {
  background-color: #282c34;
}

/* 保持 highlight.js 样式透明 */
:deep(.prose .hljs) {
  background: transparent !important;
}

:deep(.prose blockquote) {
  @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 italic;
  @apply text-gray-600 dark:text-gray-400;
}

/* KaTeX 公式样式 */
:deep(.katex) {
  font-size: 1.1em;
}

:deep(.katex-display) {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

:deep(.katex-html) {
  color: inherit;
}

.dark :deep(.katex-html) {
  color: #e5e7eb;
}

/* diff高亮效果 - 使用主题色 */
:deep(.diff-highlight) {
  @apply bg-violet-500/15 border-l-4 border-violet-500 pl-2 animate-pulse transition-all duration-300;
}

/* 深色模式下的高亮 */
.dark :deep(.diff-highlight) {
  @apply bg-violet-400/20 border-violet-400;
}
</style>
