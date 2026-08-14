<script setup lang="ts">
import ChartWrapper from '@/components/Charts/ChartWrapper.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store/modules/app'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import type { DynamicSlide } from '@/types/ppt-dynamic'
import type { FlexibleSlide } from '@/types/ppt-flexible'
import type { CalculatedElement, CalculatedLayout } from '@/types/ppt-grid'
import { DynamicLayoutEngine } from '@/utils/dynamic-layout-engine'
import { FlexibleLayoutEngine } from '@/utils/flexible-layout-engine'
import { GridLayoutEngine } from '@/utils/grid-layout-engine'
import { message } from '@/utils/message'
import { exportToPptx, PptExporter } from '@/utils/ppt-export'
import { TemplateLayoutEngine } from '@/utils/template-layout-engine'
import { Close, Download, FullScreen, Left, OffScreen, Right } from '@icon-park/vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  close: () => void
}

const props = defineProps<Props>()

const globalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const ms = message()
const { isMobile } = useBasicLayout()
const { t } = useI18n()

// 记录打开预览之前的侧边栏状态
const sidebarStateBeforePreview = ref(appStore.siderCollapsed)

// 是否处于全屏模式
const isFullscreen = ref(false)
const isPresentationMode = ref(false)

// 预览容器的引用
const previewerContainerRef = ref<HTMLDivElement | null>(null)
const slideContainerRef = ref<HTMLDivElement | null>(null)

// 当前页面索引
const currentSlideIndex = ref(0)

// 幻灯片缩放比例
const slideScale = ref(1)

// 布局引擎实例
const layoutEngine = ref<GridLayoutEngine | null>(null)
const templateEngine = ref<TemplateLayoutEngine | null>(null)
const flexibleEngine = ref<FlexibleLayoutEngine | null>(null)
const dynamicEngine = ref<DynamicLayoutEngine | null>(null)

// 计算后的布局
const calculatedLayout = ref<CalculatedLayout | any | null>(null)

// 编辑状态
const editingElement = ref<string | null>(null) // 正在编辑的元素ID
const editingContent = ref<string>('') // 编辑的内容

// PPT工作流状态 - 只有在没有完整PPT数据时才使用
const workflowStatus = computed(() => {
  // 如果已经有完整的PPT内容，不需要显示工作流状态
  if (
    globalStore.pptContent &&
    globalStore.pptContent.slides &&
    globalStore.pptContent.slides.length > 0
  ) {
    return null
  }
  return globalStore.pptWorkflowStatus
})

// 获取当前PPT数据（支持实时更新）
const pptData = computed(() => {
  // 首先检查是否有完整的PPT内容
  const content = globalStore.pptContent
  if (content && content.slides && Array.isArray(content.slides) && content.slides.length > 0) {
    return content
  }

  // 检查工作流状态中是否有部分生成的PPT数据
  const workflowPptData = globalStore.pptWorkflowStatus?.pptData
  if (workflowPptData && workflowPptData.slides && workflowPptData.slides.length > 0) {
    // 使用工作流中的部分数据
    return workflowPptData
  }

  // 如果有大纲数据，显示大纲预览
  const outlineData = globalStore.pptWorkflowStatus?.pptOutline
  if (outlineData && outlineData.outline) {
    // 显示大纲预览
    // 将大纲转换为简单的预览格式
    const outlineSlides = outlineData.outline.map((item: any, index: number) => ({
      id: `outline-${index}`,
      template: item.template || 'multi-column',
      title: item.title,
      content: {
        title: item.title,
        columns: [
          {
            type: 'list',
            items: item.points || [],
          },
        ],
      },
    }))

    return {
      title: outlineData.title || t('ppt.generating'),
      author: outlineData.author || '',
      date: outlineData.date || '',
      slides: outlineSlides,
    }
  }

  // 如果没有数据，返回空的PPT结构
  return {
    id: 'empty-ppt',
    title: t('ppt.generating'),
    slides: [],
  }
})

// 当前幻灯片
const currentSlide = computed(() => {
  if (!pptData.value.slides || pptData.value.slides.length === 0) {
    return null
  }
  return pptData.value.slides[currentSlideIndex.value]
})

// 判断是否是封面或章节页
const isCoverOrChapterPage = computed(() => {
  const template = currentSlide.value?.template
  return template === 'cover' || template === 'chapter' || template === 'thank-you'
})

// 计算幻灯片缩放比例
const calculateSlideScale = () => {
  if (slideContainerRef.value) {
    const containerWidth = slideContainerRef.value.offsetWidth
    // 基准宽度：1280px (对应 max-w-6xl 在大屏幕上的实际宽度)
    const baseWidth = 1280
    slideScale.value = containerWidth / baseWidth
  }
}

// 初始化布局引擎
const initLayoutEngine = () => {
  if (slideContainerRef.value) {
    let width, height

    if (isPresentationMode.value) {
      // 演示模式使用全屏尺寸
      width = window.innerWidth
      height = window.innerHeight
    } else {
      // 正常模式使用容器尺寸
      const rect = slideContainerRef.value.getBoundingClientRect()
      width = rect.width
      height = rect.height
    }

    layoutEngine.value = new GridLayoutEngine(width, height)
    templateEngine.value = new TemplateLayoutEngine(width, height)
    flexibleEngine.value = new FlexibleLayoutEngine(width, height)
    dynamicEngine.value = new DynamicLayoutEngine(width, height)
    // 同时计算缩放比例
    calculateSlideScale()
  }
}

// 判断是否是灵活布局幻灯片
const isFlexibleSlide = (slide: any): slide is FlexibleSlide => {
  return slide && 'layout' in slide && 'columns' in slide && !('template' in slide)
}

// 判断是否是动态布局幻灯片
const isDynamicSlide = (slide: any): slide is DynamicSlide => {
  return slide && 'columns' in slide && !('template' in slide) && !('layout' in slide)
}

// 转换动态布局为计算后的布局格式
const convertDynamicToCalculatedLayout = (dynamicLayout: any): any => {
  const elements: any[] = []

  // 处理标题
  if (dynamicLayout.title) {
    elements.push({
      id: 'title',
      type: 'title',
      content: { text: dynamicLayout.title.text, level: 1 },
      calculatedPosition: {
        x: 0,
        y: 0,
        width: dynamicLayout.containerSize.width,
        height: dynamicLayout.title.height,
        col: 0,
        row: 0,
      },
    })
  }

  // 处理栏目内容
  dynamicLayout.columns.forEach((column: any, colIndex: number) => {
    column.blocks.forEach((block: any) => {
      // 转换content格式
      let content = block.content
      if (block.type === 'text' && content.text) {
        // 动态布局中text类型的content是{ text: string }，需要转换
        content = { text: content.text }
      } else if (block.type === 'quote') {
        // quote类型也需要特殊处理
        content = { text: content.text, author: content.author }
      } else if (block.type === 'list') {
        // list类型保持原有格式
        content = { items: content.items, ordered: content.ordered }
      }

      // 跳过spacer类型的渲染
      if (block.type === 'spacer') {
        return
      }

      const element: any = {
        id: block.id,
        type: block.type,
        content: content,
        calculatedPosition: {
          x: block.position.x,
          y: block.position.y,
          width: block.position.width,
          height: block.position.height,
          col: colIndex,
          row: 0,
        },
      }
      elements.push(element)
    })
  })

  return {
    elements,
    containerSize: dynamicLayout.containerSize,
    gridInfo: {
      columns: dynamicLayout.columns.length || 1,
      rows: 1,
      columnWidth: Math.floor(
        dynamicLayout.containerSize.width / (dynamicLayout.columns.length || 1)
      ),
      rowHeight: dynamicLayout.containerSize.height,
      gap: 16,
    },
  }
}

// 计算当前幻灯片布局
const calculateCurrentLayout = () => {
  if (!currentSlide.value) return

  try {
    // 检查是否使用动态布局系统
    if (isDynamicSlide(currentSlide.value) && dynamicEngine.value) {
      const layout = dynamicEngine.value.calculateLayout(currentSlide.value)
      // 转换为兼容的格式
      calculatedLayout.value = convertDynamicToCalculatedLayout(layout)
    } else if (isFlexibleSlide(currentSlide.value) && flexibleEngine.value) {
      // 使用灵活布局系统
      const layout = flexibleEngine.value.layout(currentSlide.value)
      calculatedLayout.value = layout
    } else if (currentSlide.value.template && templateEngine.value) {
      // 使用模板系统
      const layout = templateEngine.value.layout(currentSlide.value)
      calculatedLayout.value = layout
    } else if (layoutEngine.value && currentSlide.value.elements) {
      // 兼容旧的布局系统
      const layout = layoutEngine.value.layout(currentSlide.value)
      calculatedLayout.value = layout
    }
  } catch (error) {
    calculatedLayout.value = null
  }
}

// 监听幻灯片变化
watch(currentSlideIndex, () => {
  calculateCurrentLayout()
})

// 监听PPT数据变化
watch(
  () => pptData.value,
  (newData, oldData) => {
    // PPT数据变化
    if (newData && newData.slides && newData.slides.length > 0) {
      // 如果是从无到有，重置到第一页
      if (!oldData || !oldData.slides || oldData.slides.length === 0) {
        currentSlideIndex.value = 0
      } else {
        // 如果是增量更新，保持当前页面
        currentSlideIndex.value = Math.min(currentSlideIndex.value, newData.slides.length - 1)
      }
      // 重新初始化布局引擎
      nextTick(() => {
        initLayoutEngine()
        calculateCurrentLayout()
      })
    }
  },
  { deep: true }
)

// 监听工作流状态变化，实时更新PPT数据
watch(
  () => globalStore.pptWorkflowStatus,
  newStatus => {
    if (newStatus && (newStatus.pptData || newStatus.pptOutline)) {
      // 工作流状态更新
      // 触发PPT数据更新
      nextTick(() => {
        if (pptData.value.slides.length > 0) {
          calculateCurrentLayout()
        }
      })
    }
  },
  { deep: true }
)

// 监听容器大小变化
const resizeObserver = ref<ResizeObserver | null>(null)

// 获取元素样式
const getElementStyle = (element: any): any => {
  const position = element.calculatedPosition
  return {
    position: 'absolute' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    overflow: 'hidden',
  }
}

// 渲染元素内容类名
const renderElementContent = (element: any) => {
  const classes = ['h-full', 'flex', 'flex-col']

  // 只对不需要滚动的元素添加 overflow-hidden
  if (element.type !== 'text' && element.type !== 'list' && element.type !== 'table') {
    classes.push('overflow-hidden')
  }

  if (element.style?.padding) {
    classes.push(`p-${element.style.padding}`)
  }

  if (element.style?.background) {
    classes.push(`bg-${element.style.background}`)
  }

  if (element.style?.shadow) {
    classes.push('shadow-lg')
  }

  if (element.style?.borderRadius) {
    classes.push(`rounded-${element.style.borderRadius}`)
  }

  return classes
}

// 获取内容对齐类
const getContentAlignmentClass = (element: any): string => {
  // 检查是否有对齐信息（来自灵活布局）
  const align = element.content?.align || element.style?.align

  switch (align) {
    case 'left':
      return 'text-left'
    case 'center':
      return 'text-center'
    case 'right':
      return 'text-right'
    default:
      // 默认对齐方式根据元素类型
      if (element.type === 'title' || element.type === 'subtitle') {
        // 封面、章节页、致谢页的标题居中，其他页面左对齐
        if (isCoverOrChapterPage.value) {
          return 'text-center'
        }
        return 'text-left'
      }
      return 'text-left'
  }
}

// 获取幻灯片容器类名
const getSlideContainerClass = () => {
  // 不需要特殊类名，因为我们使用绝对定位
  return ''
}

// 计算响应式字体大小
const getResponsiveFontSize = (baseSize: number): string => {
  const scaledSize = baseSize * slideScale.value
  return `${scaledSize}px`
}

// 获取标题字体样式
const getTitleFontStyle = (element: any) => {
  let baseSize = 36 // 默认标题大小 (24 * 1.5)

  if (isCoverOrChapterPage.value) {
    baseSize = 72 // 封面/章节页标题更大 (48 * 1.5)
  } else if (element.content.level === 1 || !element.content.level) {
    baseSize = 48 // 一级标题 (32 * 1.5)
  } else if (element.content.level === 2) {
    baseSize = 36 // 二级标题 (24 * 1.5)
  } else if (element.content.level === 3) {
    baseSize = 30 // 三级标题 (20 * 1.5)
  }

  return {
    fontSize: getResponsiveFontSize(baseSize),
    lineHeight: 1.2,
  }
}

// 获取副标题字体样式
const getSubtitleFontStyle = () => {
  return {
    fontSize: getResponsiveFontSize(30), // 20 * 1.5
    lineHeight: 1.3,
  }
}

// 获取正文字体样式
const getTextFontStyle = () => {
  return {
    fontSize: getResponsiveFontSize(24), // 16 * 1.5
    lineHeight: 1.6,
  }
}

// 获取列表字体样式
const getListFontStyle = () => {
  return {
    fontSize: getResponsiveFontSize(27), // 18 * 1.5，增大字体
    lineHeight: 1.8,
  }
}

// 获取表格字体样式
const getTableFontStyle = () => {
  return {
    fontSize: getResponsiveFontSize(21), // 14 * 1.5
    lineHeight: 1.4,
  }
}

// 获取小字体样式（用于图片说明等）
const getSmallFontStyle = () => {
  return {
    fontSize: getResponsiveFontSize(18), // 12 * 1.5
    lineHeight: 1.4,
  }
}

// 根据元素高度获取文本样式（包含行数限制）
const getTextStyleWithClamp = (element: any) => {
  const baseStyle = getTextFontStyle()

  if (!element.calculatedPosition) {
    return {
      ...baseStyle,
      display: '-webkit-box',
      WebkitLineClamp: 8,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
    }
  }

  const elementHeight = element.calculatedPosition.height
  const fontSize = 24 * slideScale.value // 基础字体大小
  const lineHeight = fontSize * 1.6 // 行高
  const padding = 48 * slideScale.value // 上下内边距总和，也需要缩放

  const availableHeight = elementHeight - padding
  const maxLines = Math.floor(availableHeight / lineHeight)

  // 检查文本长度，估算需要的行数
  const textLength = element.content?.text?.length || 0
  const estimatedLines = Math.ceil(textLength / 50) // 估算每行50字符

  // 如果估算的行数小于等于可用行数，则不截断
  if (estimatedLines <= maxLines && maxLines >= 2) {
    return {
      ...baseStyle,
      overflow: 'auto',
    }
  }

  // 限制在合理范围内，至少显示2行
  const lineClamp = Math.max(2, Math.min(maxLines, 20))

  return {
    ...baseStyle,
    display: '-webkit-box',
    WebkitLineClamp: lineClamp,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  }
}

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (isPresentationMode.value) {
    switch (event.key) {
      case 'Escape':
        exitPresentation()
        break
      case 'ArrowLeft':
        prevSlide()
        break
      case 'ArrowRight':
      case ' ':
        nextSlide()
        break
    }
  } else {
    if (event.key === 'ArrowLeft') {
      prevSlide()
    } else if (event.key === 'ArrowRight') {
      nextSlide()
    } else if (event.key === 'Escape') {
      handleClose()
    }
  }
}

// 生命周期钩子
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  sidebarStateBeforePreview.value = appStore.siderCollapsed
  if (!appStore.siderCollapsed) {
    appStore.setSiderCollapsed(true)
  }

  // 初始化布局
  initLayoutEngine()
  calculateCurrentLayout()

  // 监听容器大小变化
  if (slideContainerRef.value) {
    resizeObserver.value = new ResizeObserver(() => {
      initLayoutEngine()
      calculateCurrentLayout()
      calculateSlideScale() // 重新计算缩放比例
    })
    resizeObserver.value.observe(slideContainerRef.value)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)

  if (appStore.siderCollapsed !== sidebarStateBeforePreview.value) {
    appStore.setSiderCollapsed(sidebarStateBeforePreview.value)
  }

  if (resizeObserver.value) {
    resizeObserver.value.disconnect()
  }
})

// 处理关闭
const handleClose = () => {
  props.close()
}

// 全屏切换
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) {
    previewerContainerRef.value?.requestFullscreen?.()
  } else {
    document.exitFullscreen?.()
    // 退出全屏时重新计算布局
    nextTick(() => {
      setTimeout(() => {
        initLayoutEngine()
        calculateCurrentLayout()
        calculateSlideScale()
      }, 100)
    })
  }
}

const startPresentation = () => {
  isPresentationMode.value = true
  isFullscreen.value = true
  previewerContainerRef.value?.requestFullscreen?.()
  // 延时重新计算布局，确保全屏生效后计算
  nextTick(() => {
    setTimeout(() => {
      initLayoutEngine()
      calculateCurrentLayout()
    }, 100)
  })
}

const exitPresentation = () => {
  isPresentationMode.value = false
  isFullscreen.value = false
  document.exitFullscreen?.()
  // 延时重新计算布局，确保退出全屏后计算
  nextTick(() => {
    setTimeout(() => {
      // 强制重新初始化所有布局引擎
      initLayoutEngine()
      calculateCurrentLayout()
      calculateSlideScale()

      // 强制重新渲染，避免尺寸突变
      const container = slideContainerRef.value
      if (container) {
        // 临时隐藏容器避免闪烁
        container.style.opacity = '0'

        // 重新计算容器尺寸
        setTimeout(() => {
          initLayoutEngine()
          calculateCurrentLayout()
          calculateSlideScale()

          // 恢复可见性
          container.style.opacity = '1'
        }, 50)
      }
    }, 100)
  })
}

// 导出为真实PPT文件
const exportPptx = async () => {
  try {
    // 使用PptExporter类来获取检测到的字体
    const pptExporter = new PptExporter()
    const detectedFont = pptExporter.getFontFace()

    // 静默导出，不显示任何提示
    await exportToPptx(pptData.value.slides as any, pptData.value.title, detectedFont)
  } catch (error: any) {
    ms.error(`PPT导出失败: ${error?.message || '未知错误'}`)
  }
}

// 幻灯片导航
const nextSlide = () => {
  if (currentSlideIndex.value < pptData.value.slides.length - 1) {
    currentSlideIndex.value++
  }
}

const prevSlide = () => {
  if (currentSlideIndex.value > 0) {
    currentSlideIndex.value--
  }
}

const goToSlide = (index: number) => {
  currentSlideIndex.value = index
}

// 开始编辑文字
const startEditing = (elementId: string, currentText: string) => {
  if (isPresentationMode.value) return // 演示模式下不允许编辑
  editingElement.value = elementId
  editingContent.value = currentText
  // 下一帧聚焦输入框
  nextTick(() => {
    const input = document.querySelector(
      `[data-element-id="${elementId}"] input, [data-element-id="${elementId}"] textarea`
    ) as HTMLInputElement | HTMLTextAreaElement
    if (input) {
      input.focus()
      // 将光标定位到文字末尾，而不是全选
      if (input.type === 'text' || input.tagName === 'INPUT') {
        const length = input.value.length
        input.setSelectionRange(length, length)
      }
    }
  })
}

// 保存编辑内容
const saveEdit = () => {
  if (!editingElement.value || !calculatedLayout.value) return

  // 找到正在编辑的元素
  const element = calculatedLayout.value.elements.find((el: any) => el.id === editingElement.value)
  if (element && element.content) {
    // 更新内容
    if ('text' in element.content) {
      element.content.text = editingContent.value
    } else if ('items' in element.content && Array.isArray(element.content.items)) {
      // 如果是列表，更新对应项
      element.content.items = editingContent.value.split('\n').filter(item => item.trim())
    }

    // 如果使用模板系统，同步更新原始数据
    if (currentSlide.value?.template) {
      updateTemplateContent(element.id, editingContent.value)
    }
  }

  // 清除编辑状态
  editingElement.value = null
  editingContent.value = ''
}

// 更新模板内容
const updateTemplateContent = (elementId: string, newContent: string) => {
  // 处理灵活布局系统
  if (isFlexibleSlide(currentSlide.value)) {
    const slide = currentSlide.value as FlexibleSlide
    // 解析elementId格式: col-0-block-1
    const parts = elementId.split('-')
    if (parts.length >= 4 && parts[0] === 'col' && parts[2] === 'block') {
      const colIndex = parseInt(parts[1], 10)
      const blockIndex = parseInt(parts[3], 10)
      const block = slide.columns[colIndex]?.blocks[blockIndex]
      if (block) {
        if ('text' in block) {
          ;(block as any).text = newContent
        } else if ('content' in block) {
          ;(block as any).content = newContent
        } else if ('items' in block) {
          ;(block as any).items = newContent.split('\n').filter(item => item.trim())
        }
      }
    }
    return
  }

  // 处理模板系统
  if (!currentSlide.value?.content) return

  const content = currentSlide.value.content

  // 根据元素ID更新对应的内容字段
  if (elementId.includes('title')) {
    content.title = newContent
  } else if (elementId.includes('subtitle')) {
    content.subtitle = newContent
  } else if (elementId.includes('text')) {
    content.text = newContent
  } else if (elementId.includes('author')) {
    content.author = newContent
  } else if (elementId.includes('date')) {
    content.date = newContent
  } else if (elementId.includes('contact')) {
    content.contact = newContent
  } else if (elementId.includes('chapterNumber')) {
    content.chapterNumber = newContent
  } else if (elementId.includes('chapterTitle')) {
    content.chapterTitle = newContent
  } else if (elementId.includes('description')) {
    content.description = newContent
  }

  // 这里可以触发保存到后端的逻辑
  // 静默保存，不显示提示
}

// 获取幻灯片预览文本
const getSlidePreviewText = (slide: any): string => {
  if (!slide.content) return ''

  // 根据不同模板类型获取预览文本
  switch (slide.template) {
    case 'cover':
      return slide.content.subtitle || slide.content.author || ''
    case 'chapter':
      return slide.content.chapterTitle || ''
    case 'contents':
      return slide.content.items?.[0] || ''
    case 'multi-column':
      return slide.content.columns?.[0]?.text || slide.content.columns?.[0]?.items?.[0] || ''
    case 'qa':
      return slide.content.question || ''
    case 'quote':
      return slide.content.quote || ''
    case 'team':
      return slide.content.members?.[0]?.name || ''
    default:
      return slide.content.text || slide.content.description || ''
  }
}

// 处理幻灯片容器点击
const handleSlideClick = (event: MouseEvent) => {
  if (editingElement.value) {
    const target = event.target as HTMLElement
    const elementContainer = document.querySelector(`[data-element-id="${editingElement.value}"]`)

    // 如果点击的不是正在编辑的元素，保存编辑
    if (elementContainer && !elementContainer.contains(target)) {
      saveEdit()
    }
  }
}

// 判断图片是否是团队成员头像
const isTeamAvatar = (element: CalculatedElement): boolean => {
  // 检查当前幻灯片是否是团队模板
  if (currentSlide.value?.template === 'team') {
    // 检查图片是否来自团队成员数据
    const content = element.content
    if (typeof content === 'string') {
      // 如果content是字符串（图片路径），检查是否包含在成员头像中
      const members = currentSlide.value?.content?.members || []
      return members.some((member: any) => member.avatar === content)
    }
  }

  // 检查灵活布局系统中的rounded属性
  if (element.content?.rounded === true) {
    return true
  }

  return false
}

// 监听全屏变化事件
const handleFullscreenChange = () => {
  const isCurrentlyFullscreen = document.fullscreenElement !== null

  // 如果浏览器退出全屏但我们的状态还是全屏，需要同步状态并重新布局
  if (!isCurrentlyFullscreen && (isFullscreen.value || isPresentationMode.value)) {
    isFullscreen.value = false
    isPresentationMode.value = false

    // 重新计算布局
    nextTick(() => {
      setTimeout(() => {
        initLayoutEngine()
        calculateCurrentLayout()
        calculateSlideScale()
      }, 100)
    })
  }
}

// 添加全屏变化监听器
onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

// 获取节点类型标签
const getNodeTypeLabel = (nodeType: string): string => {
  const labels: Record<string, string> = {
    ppt_outline: t('ppt.generatingOutline'),
    ppt_research: t('ppt.researching'),
    ppt_content: t('ppt.generatingContent'),
    ppt_formatter: t('ppt.formatting'),
  }
  return labels[nodeType] || nodeType
}
</script>

<template>
  <div
    ref="previewerContainerRef"
    class="flex flex-col h-full w-full bg-white dark:bg-gray-800 border-l dark:border-gray-600 rounded-tl-2xl rounded-bl-2xl shadow-lg"
    :class="{ fullscreen: isFullscreen }"
  >
    <!-- 工具栏 -->
    <div
      v-if="!isPresentationMode"
      class="flex justify-between items-center h-16 border-b dark:border-gray-700 flex-shrink-0"
      :class="{ 'px-2': isMobile, 'px-4': !isMobile }"
    >
      <!-- 左侧：标题和导航 -->
      <div class="flex items-center space-x-4">
        <!-- 移动端返回按钮 -->
        <button
          v-if="isMobile"
          @click="handleClose"
          class="btn-icon btn-ghost btn-md mr-2"
          aria-label="返回"
        >
          <Left :size="20" />
        </button>

        <!-- PPT标题 -->
        <div class="flex items-center">
          <span class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {{ pptData.title || t('ppt.preview') }}
            <span
              v-if="
                workflowStatus &&
                workflowStatus.status !== 'completed' &&
                (!pptData.slides || pptData.slides.length === 0)
              "
              class="ml-2 text-sm text-gray-500 dark:text-gray-400"
            >
              ({{ workflowStatus.statusMessage || t('ppt.generating') }})
            </span>
          </span>
        </div>
      </div>

      <!-- 右侧：操作按钮 -->
      <div class="flex items-center space-x-2">
        <!-- 导出PPT -->
        <div class="relative group">
          <button
            class="btn-icon btn-ghost btn-md"
            @click="exportPptx"
            :aria-label="t('ppt.export')"
          >
            <Download :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ t('ppt.export') }}</div>
        </div>

        <!-- 播放按钮 -->
        <div class="relative group">
          <button class="btn-icon btn-md" @click="startPresentation" :aria-label="t('ppt.play')">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 5V19L19 12L8 5Z" fill="currentColor" />
            </svg>
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ t('ppt.play') }}</div>
        </div>

        <!-- 全屏按钮 -->
        <div class="relative group">
          <button
            class="btn-icon btn-ghost btn-md"
            @click="toggleFullscreen"
            :aria-label="t('ppt.fullscreen')"
          >
            <FullScreen v-if="!isFullscreen" :size="20" />
            <OffScreen v-else :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ t('ppt.fullscreen') }}</div>
        </div>

        <!-- 关闭按钮 -->
        <div v-if="!isFullscreen" class="relative group">
          <button
            class="btn-icon btn-ghost btn-md"
            @click="handleClose"
            :aria-label="t('ppt.close')"
          >
            <Close :size="20" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-bottom">{{ t('ppt.close') }}</div>
        </div>
      </div>
    </div>

    <!-- 幻灯片内容区域 -->
    <div class="flex-1 overflow-hidden relative bg-gray-50 dark:bg-gray-900 flex">
      <!-- 全屏模式下的左侧缩略图导航 -->
      <div
        v-if="isFullscreen && !isPresentationMode && pptData.slides.length > 1"
        class="w-48 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-r border-gray-200 dark:border-gray-700 flex-shrink-0"
      >
        <div class="h-full overflow-y-auto custom-scrollbar">
          <div class="p-4 space-y-3">
            <div
              v-for="(slide, index) in pptData.slides"
              :key="slide.id"
              class="relative cursor-pointer group"
              :class="{
                'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20':
                  index === currentSlideIndex,
                'hover:ring-1 hover:ring-gray-300 dark:hover:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50':
                  index !== currentSlideIndex,
              }"
              @click="goToSlide(index as number)"
            >
              <!-- 缩略图容器 -->
              <div
                class="w-full bg-white dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600"
                style="aspect-ratio: 16/9"
              >
                <!-- 缩略图内容 -->
                <div class="h-full p-2 text-xs">
                  <div
                    class="text-center font-semibold truncate text-gray-800 dark:text-gray-200 mb-1"
                  >
                    {{ slide.title || `幻灯片 ${(index as number) + 1}` }}
                  </div>
                  <div class="text-gray-600 dark:text-gray-400 text-[10px] line-clamp-3">
                    {{ getSlidePreviewText(slide) }}
                  </div>
                </div>
              </div>

              <!-- 页面编号 -->
              <div
                class="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded"
              >
                {{ (index as number) + 1 }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 幻灯片展示区 -->
      <div
        class="flex-1 h-full relative"
        :class="isPresentationMode ? '' : 'flex items-center justify-center p-8'"
      >
        <!-- 左侧点击区域 -->
        <div
          v-if="currentSlideIndex > 0"
          class="absolute left-0 top-0 w-1/3 h-full cursor-pointer"
          :class="isPresentationMode ? 'z-[100]' : 'z-[5]'"
          @click="prevSlide"
        ></div>

        <!-- 右侧点击区域 -->
        <div
          v-if="currentSlideIndex < pptData.slides.length - 1"
          class="absolute right-0 top-0 w-1/3 h-full cursor-pointer"
          :class="isPresentationMode ? 'z-[100]' : 'z-[5]'"
          @click="nextSlide"
        ></div>

        <div
          ref="slideContainerRef"
          class="relative bg-white dark:bg-gray-800 overflow-hidden"
          :class="
            isPresentationMode ? 'w-screen h-screen' : 'w-full max-w-6xl rounded-xl shadow-lg'
          "
          :style="isPresentationMode ? '' : 'aspect-ratio: 16/9'"
          @click="handleSlideClick"
        >
          <!-- PPT生成中状态或无内容显示 -->
          <div
            v-if="!pptData.slides || pptData.slides.length === 0"
            class="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800"
          >
            <div class="text-center">
              <!-- 加载动画 -->
              <div class="mb-6">
                <div class="loading-animation"><span></span></div>
              </div>

              <!-- 状态文字 -->
              <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                {{ workflowStatus?.statusMessage || t('ppt.generating') }}
              </h3>

              <!-- 进度条 -->
              <div v-if="workflowStatus?.progress" class="max-w-xs mx-auto">
                <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                  <div
                    class="bg-primary-500 h-2 rounded-full"
                    :style="{ width: `${workflowStatus?.progress}%` }"
                  ></div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {{ t('ppt.progress') }}: {{ workflowStatus?.progress }}%
                </p>
              </div>

              <!-- 当前节点信息 -->
              <div v-if="workflowStatus?.nodeType" class="mt-4">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ getNodeTypeLabel(workflowStatus?.nodeType) }}
                </p>
              </div>
            </div>
          </div>

          <!-- 栅栏布局容器 -->
          <div
            v-else-if="calculatedLayout"
            :key="currentSlideIndex"
            class="relative w-full h-full"
            :class="getSlideContainerClass()"
          >
            <!-- 渲染每个元素 -->
            <div
              v-for="element in calculatedLayout.elements"
              :key="`${currentSlideIndex}-${element.id}`"
              :style="getElementStyle(element)"
              :class="renderElementContent(element)"
            >
              <!-- 标题元素 -->
              <div
                v-if="element.type === 'title'"
                class="flex h-full p-2 relative group cursor-pointer transition-all duration-200 rounded-lg z-[10] overflow-auto"
                :class="{
                  'items-center': element.content.text && element.content.text.length < 50,
                  'items-start pt-4': element.content.text && element.content.text.length >= 50,
                  'justify-center': isCoverOrChapterPage,
                  'justify-start': !isCoverOrChapterPage,
                  'hover:bg-gray-50 dark:hover:bg-gray-700':
                    !isPresentationMode && editingElement !== element.id,
                  'bg-gray-50 dark:bg-gray-700': editingElement === element.id,
                  [getContentAlignmentClass(element)]: true,
                }"
                :data-element-id="element.id"
                @click.stop="
                  !isPresentationMode &&
                  editingElement !== element.id &&
                  startEditing(element.id, element.content.text)
                "
              >
                <h1
                  v-if="editingElement !== element.id"
                  class="font-bold text-gray-900 dark:text-white break-words"
                  :style="getTitleFontStyle(element)"
                >
                  {{ element.content.text }}
                </h1>
                <input
                  v-else
                  v-model="editingContent"
                  @keydown.enter="saveEdit"
                  @keydown.esc="editingElement = null"
                  @blur="saveEdit"
                  class="w-full font-bold bg-transparent outline-none px-1"
                  :class="getContentAlignmentClass(element)"
                  :style="getTitleFontStyle(element)"
                />
              </div>

              <!-- 副标题元素 -->
              <div
                v-else-if="element.type === 'subtitle'"
                class="flex h-full p-2 relative group cursor-pointer transition-all duration-200 rounded-lg z-[10] overflow-auto"
                :class="{
                  'items-center': element.content.text && element.content.text.length < 80,
                  'items-start pt-2': element.content.text && element.content.text.length >= 80,
                  'justify-center': isCoverOrChapterPage,
                  'justify-start': !isCoverOrChapterPage,
                  'hover:bg-gray-50 dark:hover:bg-gray-700':
                    !isPresentationMode && editingElement !== element.id,
                  'bg-gray-50 dark:bg-gray-700': editingElement === element.id,
                  [getContentAlignmentClass(element)]: true,
                }"
                :data-element-id="element.id"
                @click.stop="
                  !isPresentationMode &&
                  editingElement !== element.id &&
                  startEditing(element.id, element.content.text)
                "
              >
                <h2
                  v-if="editingElement !== element.id"
                  class="font-semibold text-gray-700 dark:text-gray-300 break-words"
                  :style="getSubtitleFontStyle()"
                >
                  {{ element.content.text }}
                </h2>
                <input
                  v-else
                  v-model="editingContent"
                  @keydown.enter="saveEdit"
                  @keydown.esc="editingElement = null"
                  @blur="saveEdit"
                  class="w-full font-semibold bg-transparent outline-none px-1"
                  :class="getContentAlignmentClass(element)"
                  :style="getSubtitleFontStyle()"
                />
              </div>

              <!-- 文本元素 -->
              <div
                v-else-if="element.type === 'text'"
                class="h-full p-3 md:p-4 lg:p-5 overflow-hidden rounded-lg cursor-pointer transition-all duration-200 z-[10]"
                :class="{
                  'hover:bg-gray-50 dark:hover:bg-gray-700':
                    !isPresentationMode && editingElement !== element.id,
                  'bg-gray-50 dark:bg-gray-700': editingElement === element.id,
                  [getContentAlignmentClass(element)]: true,
                }"
                :data-element-id="element.id"
                @click.stop="
                  !isPresentationMode &&
                  editingElement !== element.id &&
                  startEditing(element.id, element.content.text)
                "
              >
                <p
                  v-if="editingElement !== element.id"
                  class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
                  :style="getTextStyleWithClamp(element)"
                >
                  {{ element.content.text }}
                </p>
                <textarea
                  v-else
                  v-model="editingContent"
                  @keydown.enter.stop
                  @keydown.esc="editingElement = null"
                  @blur="saveEdit"
                  class="w-full h-full bg-transparent outline-none px-2 py-1 resize-none"
                  :class="getContentAlignmentClass(element)"
                  :style="getTextFontStyle()"
                  :rows="Math.max(3, element.content.text.split('\n').length)"
                />
              </div>

              <!-- 图片元素 -->
              <div v-else-if="element.type === 'image'" class="h-full p-4">
                <div class="h-full flex flex-col">
                  <div class="flex-1 min-h-0 flex items-center justify-center">
                    <img
                      :src="element.content.src"
                      :alt="element.content.alt"
                      :class="[
                        'max-w-full max-h-full object-contain',
                        isTeamAvatar(element) ? 'rounded-full' : 'rounded-lg',
                      ]"
                      loading="lazy"
                    />
                  </div>
                  <p
                    v-if="element.content.caption"
                    class="text-gray-600 dark:text-gray-400 mt-2 text-center flex-shrink-0"
                    :style="getSmallFontStyle()"
                  >
                    {{ element.content.caption }}
                  </p>
                </div>
              </div>

              <!-- 图表元素 -->
              <div v-else-if="element.type === 'chart'" class="h-full p-2 md:p-3 lg:p-4">
                <div class="h-full flex flex-col">
                  <h3
                    class="font-semibold text-gray-900 dark:text-white mb-1 md:mb-2 flex-shrink-0 truncate"
                    :style="{ fontSize: getResponsiveFontSize(27) }"
                  >
                    {{ element.content.title }}
                  </h3>
                  <div class="flex-1 min-h-0 relative">
                    <ChartWrapper
                      :key="`${currentSlideIndex}-${element.id}`"
                      :type="element.content.type"
                      :data="element.content.data"
                      :options="element.content.options"
                      class="absolute inset-0 w-full h-full"
                    />
                  </div>
                </div>
              </div>

              <!-- 列表元素 -->
              <div
                v-else-if="element.type === 'list'"
                class="h-full p-3 md:p-4 lg:p-5 overflow-hidden rounded-lg cursor-pointer transition-all duration-200 z-[10]"
                :class="{
                  'hover:bg-gray-50 dark:hover:bg-gray-700':
                    !isPresentationMode && editingElement !== element.id,
                  'bg-gray-50 dark:bg-gray-700': editingElement === element.id,
                }"
                :data-element-id="element.id"
                @click.stop="
                  !isPresentationMode &&
                  editingElement !== element.id &&
                  startEditing(element.id, element.content.items.join('\n'))
                "
              >
                <ul
                  v-if="editingElement !== element.id && !element.content.ordered"
                  class="space-y-1 md:space-y-2"
                >
                  <li v-for="item in element.content.items" :key="item" class="flex items-start">
                    <span class="text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0">•</span>
                    <span
                      class="text-gray-700 dark:text-gray-300 break-words"
                      :style="getListFontStyle()"
                      >{{ item }}</span
                    >
                  </li>
                </ul>
                <ol v-else-if="editingElement !== element.id" class="space-y-1 md:space-y-2">
                  <li
                    v-for="(item, index) in element.content.items"
                    :key="item"
                    class="flex items-start"
                  >
                    <span class="text-primary-600 dark:text-primary-400 mr-2 flex-shrink-0"
                      >{{ (index as number) + 1 }}.</span
                    >
                    <span
                      class="text-gray-700 dark:text-gray-300 break-words"
                      :style="getListFontStyle()"
                      >{{ item }}</span
                    >
                  </li>
                </ol>
                <textarea
                  v-else
                  v-model="editingContent"
                  @keydown.enter.stop
                  @keydown.esc="editingElement = null"
                  @blur="saveEdit"
                  class="w-full h-full bg-transparent outline-none px-2 py-1 resize-none"
                  :style="getListFontStyle()"
                  :rows="Math.max(3, element.content.items.length)"
                />
              </div>

              <!-- 表格元素 -->
              <div
                v-else-if="element.type === 'table'"
                class="h-full p-2 md:p-3 lg:p-4 overflow-hidden"
              >
                <div class="min-w-full">
                  <table class="w-full border-collapse" :style="getTableFontStyle()">
                    <thead>
                      <tr class="bg-gray-100 dark:bg-gray-700">
                        <th
                          v-for="header in element.content.headers"
                          :key="header"
                          class="border border-gray-300 dark:border-gray-600 px-2 py-1 md:px-3 md:py-2 text-left font-semibold text-gray-900 dark:text-white"
                        >
                          {{ header }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(row, rowIndex) in element.content.rows"
                        :key="rowIndex"
                        :class="
                          !isPresentationMode ? 'hover:bg-gray-50 dark:hover:bg-gray-750' : ''
                        "
                      >
                        <td
                          v-for="(cell, cellIndex) in row"
                          :key="cellIndex"
                          class="border border-gray-300 dark:border-gray-600 px-2 py-1 md:px-3 md:py-2 text-gray-700 dark:text-gray-300"
                        >
                          {{ cell }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 图标网格元素 -->
              <div v-else-if="element.type === 'icon-grid'" class="h-full p-4 overflow-hidden">
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  <div
                    v-for="(item, index) in element.content.items"
                    :key="index"
                    class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center transition-shadow"
                    :class="!isPresentationMode ? 'hover:shadow-md' : ''"
                  >
                    <div class="text-3xl mb-2">{{ item.icon }}</div>
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                      {{ item.title }}
                    </h4>
                    <p v-if="item.description" class="text-xs text-gray-600 dark:text-gray-400">
                      {{ item.description }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- 时间线元素 -->
              <!-- 水平时间线元素 -->
              <div v-else-if="element.type === 'timeline'" class="h-full p-4 overflow-hidden">
                <!-- 检查是否有timeline数据且是水平布局 -->
                <div
                  v-if="element.content.timeline && element.content.timeline.length > 0"
                  class="h-full flex flex-col justify-center"
                >
                  <!-- 水平时间线 -->
                  <div class="relative">
                    <!-- 水平线 -->
                    <div
                      class="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600 transform -translate-y-1/2"
                    ></div>

                    <!-- 时间点 -->
                    <div class="relative flex justify-between items-center">
                      <div
                        v-for="(item, index) in element.content.timeline.slice(0, 4)"
                        :key="index"
                        class="flex flex-col items-center"
                        :style="{ width: `${100 / Math.min(element.content.timeline.length, 4)}%` }"
                      >
                        <!-- 时间点圆圈 -->
                        <div
                          class="relative z-10 w-4 h-4 rounded-full border-2 mb-2"
                          :class="{
                            'bg-red-500 border-red-500': item.milestone,
                            'bg-primary-500 border-primary-500': !item.milestone,
                          }"
                        ></div>

                        <!-- 日期 -->
                        <div class="text-center mb-2">
                          <p
                            class="text-xs font-medium text-gray-600 dark:text-gray-400"
                            :style="{ fontSize: getResponsiveFontSize(14) }"
                          >
                            {{ item.date }}
                          </p>
                        </div>

                        <!-- 标题 -->
                        <div class="text-center mb-1">
                          <h4
                            class="font-semibold text-gray-900 dark:text-white"
                            :style="{ fontSize: getResponsiveFontSize(16) }"
                          >
                            {{ item.title }}
                          </h4>
                        </div>

                        <!-- 描述 -->
                        <div class="text-center px-1">
                          <p
                            class="text-gray-600 dark:text-gray-400 leading-tight"
                            :style="{ fontSize: getResponsiveFontSize(12) }"
                          >
                            {{ item.description }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 兜底：垂直时间线（如果数据格式不匹配） -->
                <div v-else-if="element.content.items" class="space-y-4">
                  <div
                    v-for="(item, index) in element.content.items"
                    :key="index"
                    class="flex items-start space-x-4"
                  >
                    <!-- 时间线标记 -->
                    <div class="flex-shrink-0 mt-1">
                      <div
                        class="w-4 h-4 rounded-full border-2"
                        :class="{
                          'bg-green-500 border-green-500': item.status === 'completed',
                          'bg-primary-500 border-primary-500': item.status === 'current',
                          'bg-gray-300 border-gray-300': item.status === 'upcoming',
                        }"
                      ></div>
                    </div>

                    <!-- 时间线内容 -->
                    <div class="flex-1">
                      <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
                        {{ item.title }}
                      </h4>
                      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {{ item.description }}
                      </p>
                      <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {{ item.date }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 引用块元素 -->
              <div
                v-else-if="element.type === 'quote'"
                class="h-full p-6 flex items-center justify-center"
              >
                <div class="max-w-3xl mx-auto text-center">
                  <svg
                    class="w-8 h-8 text-gray-400 dark:text-gray-600 mb-4 mx-auto"
                    fill="currentColor"
                    viewBox="0 0 32 32"
                  >
                    <path
                      d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z"
                    />
                  </svg>
                  <blockquote
                    class="font-medium text-gray-800 dark:text-gray-200 italic leading-relaxed"
                    :style="{ fontSize: getResponsiveFontSize(36), lineHeight: 1.4 }"
                  >
                    {{ element.content.text || element.content.quote }}
                  </blockquote>
                  <cite
                    v-if="element.content.author"
                    class="block mt-4 text-gray-600 dark:text-gray-400 not-italic"
                    :style="{ fontSize: getResponsiveFontSize(24) }"
                  >
                    — {{ element.content.author }}
                  </cite>
                </div>
              </div>

              <!-- Q&A问答元素 -->
              <div v-else-if="element.type === 'qa'" class="h-full p-4 flex flex-col">
                <div class="space-y-6 h-full flex flex-col">
                  <!-- 问题 -->
                  <div class="flex items-start space-x-3">
                    <div
                      class="flex-shrink-0 w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center font-bold"
                      :style="{ fontSize: getResponsiveFontSize(20) }"
                    >
                      Q
                    </div>
                    <div class="flex-1">
                      <p
                        class="text-gray-800 dark:text-gray-200 font-medium leading-relaxed"
                        :style="{ fontSize: getResponsiveFontSize(28) }"
                      >
                        {{ element.content.question }}
                      </p>
                    </div>
                  </div>

                  <!-- 答案 -->
                  <div
                    v-if="element.content.answer && element.content.showAnswer !== false"
                    class="flex items-start space-x-3 flex-1 overflow-y-auto"
                  >
                    <div
                      class="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold"
                      :style="{ fontSize: getResponsiveFontSize(20) }"
                    >
                      A
                    </div>
                    <div class="flex-1">
                      <p
                        class="text-gray-700 dark:text-gray-300 leading-relaxed"
                        :style="{ fontSize: getResponsiveFontSize(24) }"
                      >
                        {{ element.content.answer }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 团队成员元素 -->
              <div v-else-if="element.type === 'team'" class="h-full p-4 overflow-hidden">
                <div class="grid grid-cols-3 gap-4 h-full">
                  <div
                    v-for="(member, index) in element.content.members?.slice(0, 3)"
                    :key="index"
                    class="flex flex-col items-center text-center"
                  >
                    <!-- 头像 -->
                    <div
                      class="w-20 h-20 mb-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0"
                    >
                      <img
                        v-if="member.avatar"
                        :src="member.avatar"
                        :alt="member.name"
                        class="w-full h-full object-cover"
                        @error="($event.target as HTMLImageElement).style.display = 'none'"
                      />
                      <div
                        v-else
                        class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500"
                        :style="{ fontSize: getResponsiveFontSize(24) }"
                      >
                        👤
                      </div>
                    </div>

                    <!-- 姓名 -->
                    <h4
                      class="font-semibold text-gray-900 dark:text-white mb-1"
                      :style="{ fontSize: getResponsiveFontSize(18) }"
                    >
                      {{ member.name }}
                    </h4>

                    <!-- 职位 -->
                    <p
                      class="text-gray-600 dark:text-gray-400 mb-2"
                      :style="{ fontSize: getResponsiveFontSize(14) }"
                    >
                      {{ member.role }}
                    </p>

                    <!-- 描述 -->
                    <p
                      v-if="member.description"
                      class="text-gray-500 dark:text-gray-500 text-xs leading-tight"
                      :style="{ fontSize: getResponsiveFontSize(12) }"
                    >
                      {{ member.description }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- 间隔块元素 -->
              <div
                v-else-if="element.type === 'spacer' || element.type === 'divider'"
                class="h-full"
              >
                <!-- 空白间隔，仅占据空间 -->
              </div>
            </div>
          </div>

          <!-- 栅栏网格指示器（开发模式） -->
          <div v-if="false && calculatedLayout" class="absolute inset-0 pointer-events-none">
            <div
              class="grid h-full"
              :style="{
                gridTemplateColumns: `repeat(${calculatedLayout?.gridInfo.columns || 12}, 1fr)`,
                gap: `${calculatedLayout?.gridInfo.gap || 16}px`,
                padding: '32px',
              }"
            >
              <div
                v-for="i in (calculatedLayout?.gridInfo.columns || 12) *
                (calculatedLayout?.gridInfo.rows || 6)"
                :key="i"
                class="border border-dashed border-gray-300 dark:border-gray-600 opacity-30"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 页面指示器 -->
      <div
        v-if="pptData.slides.length > 1 && !isPresentationMode && !isFullscreen"
        class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-3 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1 z-30"
      >
        <!-- 左侧翻页按钮 -->
        <button
          :disabled="currentSlideIndex === 0"
          @click="prevSlide"
          class="text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all p-1"
          aria-label="上一页"
        >
          <Left :size="14" />
        </button>

        <!-- 页面指示点 -->
        <div class="flex items-center space-x-2">
          <button
            v-for="(slide, index) in pptData.slides"
            :key="slide.id"
            class="w-2 h-2 rounded-full transition-all duration-200"
            :class="index === currentSlideIndex ? 'bg-white w-8' : 'bg-white/50 hover:bg-white/70'"
            @click="goToSlide(index as number)"
            :title="`第 ${(index as number) + 1} 页`"
          />
        </div>

        <!-- 右侧翻页按钮 -->
        <button
          :disabled="currentSlideIndex === pptData.slides.length - 1"
          @click="nextSlide"
          class="text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all p-1"
          aria-label="下一页"
        >
          <Right :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 70;
  border-radius: 0 !important;
  border: none !important;
}

/* 动画效果 */
.slide-element {
  animation: fadeIn 0.5s ease-out;
  animation-fill-mode: both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 按钮样式 */
.btn-icon {
  @apply p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-sm {
  @apply p-1.5;
}

/* 工具提示 */
.tooltip {
  @apply absolute z-10 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 pointer-events-none transition-opacity duration-200 whitespace-nowrap;
}

.group:hover .tooltip {
  @apply opacity-100;
}

/* 演示模式样式 */
.presentation-mode {
  background: black !important;
  color: white !important;
}

.presentation-mode {
  padding: 0 !important;
  height: 100vh !important;
  width: 100vw !important;
  overflow: hidden !important;
}

.tooltip-bottom {
  @apply top-full left-1/2 transform -translate-x-1/2 mt-2;
}

/* 自定义滚动条样式 */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 2px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.8);
}

/* line-clamp 样式 */
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .slide-container {
    @apply p-4;
  }
}
</style>
