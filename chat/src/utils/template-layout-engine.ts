/**
 * PPT模板布局引擎
 */

import type {
  SlideLayout,
  SlideTemplate,
  SlideContent,
  LayoutElement,
  CalculatedElement,
  CalculatedLayout,
  ElementType,
} from '@/types/ppt-grid'

// 模板布局定义
interface TemplateLayoutConfig {
  elements: Array<{
    type: ElementType
    position: { col: number; row: number; colSpan: number; rowSpan: number }
    contentKey: keyof SlideContent | 'custom'
    customContent?: (content: SlideContent) => any
  }>
}

// 各模板的布局配置
const TEMPLATE_LAYOUTS: Record<SlideTemplate, TemplateLayoutConfig> = {
  // 封面模板
  cover: {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 2, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'subtitle',
        position: { col: 0, row: 3, colSpan: 12, rowSpan: 1 },
        contentKey: 'subtitle',
      },
      {
        type: 'text',
        position: { col: 0, row: 5, colSpan: 12, rowSpan: 1 },
        contentKey: 'custom',
        customContent: content => ({
          text: `${content.author || ''} | ${content.date || ''}`,
        }),
      },
    ],
  },

  // 章节页模板
  chapter: {
    elements: [
      {
        type: 'subtitle',
        position: { col: 0, row: 2, colSpan: 12, rowSpan: 1 },
        contentKey: 'chapterNumber',
      },
      {
        type: 'title',
        position: { col: 0, row: 3, colSpan: 12, rowSpan: 1 },
        contentKey: 'chapterTitle',
      },
    ],
  },

  // 目录页模板
  contents: {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'list',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'items',
      },
      {
        type: 'image',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'image',
      },
    ],
  },

  // 万能多栏页模板（动态生成）
  'multi-column': {
    elements: [], // 将在运行时动态生成
  },

  // 标题内容页模板（已废弃，使用multi-column替代）
  'title-content': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'text',
        position: { col: 0, row: 1, colSpan: 12, rowSpan: 4 },
        contentKey: 'text',
      },
    ],
  },

  // 双栏页模板
  'two-column': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'text',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.leftContent?.text || '',
        }),
      },
      {
        type: 'text',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.rightContent?.text || '',
        }),
      },
    ],
  },

  // 图文混排右图模板
  'image-right': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'text',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'text',
      },
      {
        type: 'image',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'image',
      },
    ],
  },

  // 图文混排左图模板
  'image-left': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'image',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'image',
      },
      {
        type: 'text',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 4 },
        contentKey: 'text',
      },
    ],
  },

  // 对比页模板
  comparison: {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'subtitle',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 1 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.leftContent?.title || '',
        }),
      },
      {
        type: 'subtitle',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 1 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.rightContent?.title || '',
        }),
      },
      {
        type: 'list',
        position: { col: 0, row: 2, colSpan: 6, rowSpan: 3 },
        contentKey: 'custom',
        customContent: content => ({
          items: content.leftContent?.items || [],
        }),
      },
      {
        type: 'list',
        position: { col: 6, row: 2, colSpan: 6, rowSpan: 3 },
        contentKey: 'custom',
        customContent: content => ({
          items: content.rightContent?.items || [],
        }),
      },
    ],
  },

  // 数据图表页模板
  'data-chart': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'chart',
        position: { col: 0, row: 1, colSpan: 8, rowSpan: 4 },
        contentKey: 'chart',
      },
      {
        type: 'text',
        position: { col: 8, row: 1, colSpan: 4, rowSpan: 4 },
        contentKey: 'description',
      },
    ],
  },

  // 致谢页模板
  'thank-you': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 2, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'text',
        position: { col: 0, row: 4, colSpan: 12, rowSpan: 1 },
        contentKey: 'contact',
      },
    ],
  },

  // 三栏页模板
  'three-column': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'text',
        position: { col: 0, row: 1, colSpan: 4, rowSpan: 4 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.leftContent?.text || '',
        }),
      },
      {
        type: 'text',
        position: { col: 4, row: 1, colSpan: 4, rowSpan: 4 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.centerContent?.text || '',
        }),
      },
      {
        type: 'text',
        position: { col: 8, row: 1, colSpan: 4, rowSpan: 4 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.rightContent?.text || '',
        }),
      },
    ],
  },

  // 多图表模板
  'multi-chart': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'chart',
        position: { col: 0, row: 1, colSpan: 6, rowSpan: 2 },
        contentKey: 'custom',
        customContent: content => content.charts?.[0] || null,
      },
      {
        type: 'chart',
        position: { col: 6, row: 1, colSpan: 6, rowSpan: 2 },
        contentKey: 'custom',
        customContent: content => content.charts?.[1] || null,
      },
      {
        type: 'chart',
        position: { col: 0, row: 3, colSpan: 6, rowSpan: 2 },
        contentKey: 'custom',
        customContent: content => content.charts?.[2] || null,
      },
      {
        type: 'chart',
        position: { col: 6, row: 3, colSpan: 6, rowSpan: 2 },
        contentKey: 'custom',
        customContent: content => content.charts?.[3] || null,
      },
    ],
  },

  // 水平时间线模板
  'timeline-horizontal': {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'timeline',
        position: { col: 0, row: 1, colSpan: 12, rowSpan: 4 },
        contentKey: 'timeline',
      },
    ],
  },

  // 引言模板
  quote: {
    elements: [
      {
        type: 'quote',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 6 },
        contentKey: 'custom',
        customContent: content => ({
          text: content.quote,
          author: content.author,
        }),
      },
    ],
  },

  // 问答模板
  qa: {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'qa',
        position: { col: 0, row: 1, colSpan: 12, rowSpan: 5 },
        contentKey: 'custom',
        customContent: content => ({
          question: content.question,
          answer: content.answer,
          showAnswer: content.showAnswer,
        }),
      },
    ],
  },

  // 团队成员模板 - 3列布局
  team: {
    elements: [
      {
        type: 'title',
        position: { col: 0, row: 0, colSpan: 12, rowSpan: 1 },
        contentKey: 'title',
      },
      {
        type: 'team',
        position: { col: 0, row: 1, colSpan: 12, rowSpan: 5 },
        contentKey: 'members',
      },
    ],
  },
}

export class TemplateLayoutEngine {
  private containerWidth: number = 1280 // 16:9标准宽度
  private containerHeight: number = 720 // 16:9标准高度
  private config = {
    columns: 12,
    rows: 6, // 固定6行高度
    gap: 16,
    padding: 32,
  }

  constructor(containerWidth?: number, containerHeight?: number) {
    if (containerWidth) this.containerWidth = containerWidth
    if (containerHeight) this.containerHeight = containerHeight

    // 强制16:9比例
    const aspectRatio = 16 / 9
    const currentRatio = this.containerWidth / this.containerHeight

    if (Math.abs(currentRatio - aspectRatio) > 0.01) {
      // 以宽度为准，调整高度
      this.containerHeight = Math.round(this.containerWidth / aspectRatio)
    }
  }

  /**
   * 主布局方法
   */
  layout(slide: SlideLayout): CalculatedLayout {
    const template = slide.template
    const content = slide.content

    // 特殊处理multi-column模板
    if (template === 'multi-column') {
      return this.layoutMultiColumn(slide)
    }

    const templateConfig = TEMPLATE_LAYOUTS[template]

    if (!templateConfig) {
      throw new Error(`Unknown template: ${template}`)
    }

    // 根据模板配置生成元素
    const elements: LayoutElement[] = []
    let elementId = 0

    for (const elementConfig of templateConfig.elements) {
      const { type, contentKey, customContent } = elementConfig

      // 获取内容
      let elementContent: any = null
      if (contentKey === 'custom' && customContent) {
        elementContent = customContent(content)
      } else if (contentKey !== 'custom') {
        elementContent = content[contentKey]
      }

      // 跳过没有内容的元素
      if (!elementContent) continue

      // 创建布局元素
      if (type === 'title' || type === 'subtitle' || type === 'text') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: {
            text: typeof elementContent === 'string' ? elementContent : elementContent.text,
          },
        })
      } else if (type === 'list') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: {
            items: Array.isArray(elementContent) ? elementContent : elementContent.items || [],
          },
        })
      } else if (type === 'image') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: elementContent,
        })
      } else if (type === 'chart') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: elementContent,
        })
      } else if (type === 'timeline') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: {
            timeline: Array.isArray(elementContent)
              ? elementContent
              : elementContent.timeline || elementContent,
          },
        })
      } else if (type === 'quote') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: elementContent,
        })
      } else if (type === 'qa') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: elementContent,
        })
      } else if (type === 'team') {
        elements.push({
          id: `element-${elementId++}`,
          type,
          content: {
            members: Array.isArray(elementContent)
              ? elementContent
              : elementContent.members || elementContent,
          },
        })
      }
    }

    // 计算元素位置
    const calculatedElements: CalculatedElement[] = []
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      const position = templateConfig.elements[i].position

      calculatedElements.push({
        ...element,
        calculatedPosition: {
          col: position.col,
          row: position.row,
          width: 0, // 稍后计算
          height: 0,
          x: 0,
          y: 0,
        },
      })
    }

    // 计算实际像素位置
    return this.calculatePixelPositions(calculatedElements, templateConfig)
  }

  /**
   * 计算实际像素位置
   */
  private calculatePixelPositions(
    elements: CalculatedElement[],
    templateConfig: TemplateLayoutConfig
  ): CalculatedLayout {
    const padding = Array.isArray(this.config.padding)
      ? this.config.padding
      : [this.config.padding, this.config.padding, this.config.padding, this.config.padding]

    const contentWidth = this.containerWidth - padding[1] - padding[3]
    const contentHeight = this.containerHeight - padding[0] - padding[2]

    const columnWidth =
      (contentWidth - this.config.gap * (this.config.columns - 1)) / this.config.columns
    const rowHeight = (contentHeight - this.config.gap * (this.config.rows - 1)) / this.config.rows

    // 计算每个元素的像素位置
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      const position = templateConfig.elements[i].position
      const { col, row, colSpan, rowSpan } = position

      element.calculatedPosition.x = padding[3] + col * (columnWidth + this.config.gap)
      element.calculatedPosition.y = padding[0] + row * (rowHeight + this.config.gap)
      element.calculatedPosition.width = colSpan * columnWidth + (colSpan - 1) * this.config.gap
      element.calculatedPosition.height = rowSpan * rowHeight + (rowSpan - 1) * this.config.gap
    }

    return {
      elements,
      gridInfo: {
        columns: this.config.columns,
        rows: this.config.rows,
        columnWidth,
        rowHeight,
        gap: this.config.gap,
      },
      containerSize: {
        width: this.containerWidth,
        height: this.containerHeight,
      },
    }
  }

  /**
   * 处理多栏模板的动态布局
   */
  private layoutMultiColumn(slide: SlideLayout): CalculatedLayout {
    const content = slide.content
    const columns = content.columns || []

    // 如果没有columns，回退到单栏text内容
    if (columns.length === 0) {
      return this.layoutFallbackSingleColumn(slide)
    }

    const elements: CalculatedElement[] = []
    let elementId = 0

    // 计算容器尺寸
    const padding = [
      this.config.padding,
      this.config.padding,
      this.config.padding,
      this.config.padding,
    ]
    const contentWidth = this.containerWidth - padding[1] - padding[3]
    const contentHeight = this.containerHeight - padding[0] - padding[2]

    // 标题区域
    let titleHeight = 0
    if (content.title) {
      titleHeight = 80 // 固定标题高度
      elements.push({
        id: `title-${elementId++}`,
        type: 'title',
        content: { text: content.title },
        calculatedPosition: {
          col: 0,
          row: 0,
          x: padding[3],
          y: padding[0],
          width: contentWidth,
          height: titleHeight,
        },
      })
    }

    // 内容区域
    const contentStartY = padding[0] + titleHeight + (content.title ? this.config.gap : 0)
    const availableContentHeight =
      contentHeight - titleHeight - (content.title ? this.config.gap : 0)

    // 计算栏宽
    const columnCount = columns.length
    const columnWidth = (contentWidth - (columnCount - 1) * this.config.gap) / columnCount

    // 渲染每栏内容
    columns.forEach((column, colIndex) => {
      const columnX = padding[3] + colIndex * (columnWidth + this.config.gap)
      let currentY = contentStartY
      let availableHeight = availableContentHeight

      // 栏标题
      if (column.title) {
        const columnTitleHeight = 50
        elements.push({
          id: `column-title-${elementId++}`,
          type: 'subtitle',
          content: { text: column.title },
          calculatedPosition: {
            col: colIndex,
            row: 1,
            x: columnX,
            y: currentY,
            width: columnWidth,
            height: columnTitleHeight,
          },
        })
        currentY += columnTitleHeight + 10
        availableHeight -= columnTitleHeight + 10
      }

      // 栏内容
      if (column.image) {
        // 图片内容
        elements.push({
          id: `column-image-${elementId++}`,
          type: 'image',
          content: column.image,
          calculatedPosition: {
            col: colIndex,
            row: 2,
            x: columnX,
            y: currentY,
            width: columnWidth,
            height: availableHeight,
          },
        })
      } else if (column.chart) {
        // 图表内容
        elements.push({
          id: `column-chart-${elementId++}`,
          type: 'chart',
          content: column.chart,
          calculatedPosition: {
            col: colIndex,
            row: 2,
            x: columnX,
            y: currentY,
            width: columnWidth,
            height: availableHeight,
          },
        })
      } else if (column.items && column.items.length > 0) {
        // 列表内容
        elements.push({
          id: `column-list-${elementId++}`,
          type: 'list',
          content: { items: column.items },
          calculatedPosition: {
            col: colIndex,
            row: 2,
            x: columnX,
            y: currentY,
            width: columnWidth,
            height: availableHeight,
          },
        })
      } else if (column.text) {
        // 文本内容
        elements.push({
          id: `column-text-${elementId++}`,
          type: 'text',
          content: { text: column.text },
          calculatedPosition: {
            col: colIndex,
            row: 2,
            x: columnX,
            y: currentY,
            width: columnWidth,
            height: availableHeight,
          },
        })
      }
    })

    return {
      elements,
      gridInfo: {
        columns: columnCount,
        rows: 3,
        columnWidth,
        rowHeight: availableContentHeight / 2,
        gap: this.config.gap,
      },
      containerSize: {
        width: this.containerWidth,
        height: this.containerHeight,
      },
    }
  }

  /**
   * 单栏兜底布局（用于兼容旧的text字段）
   */
  private layoutFallbackSingleColumn(slide: SlideLayout): CalculatedLayout {
    const content = slide.content
    const elements: CalculatedElement[] = []
    let elementId = 0

    const padding = [
      this.config.padding,
      this.config.padding,
      this.config.padding,
      this.config.padding,
    ]
    const contentWidth = this.containerWidth - padding[1] - padding[3]
    const contentHeight = this.containerHeight - padding[0] - padding[2]

    // 标题
    let titleHeight = 0
    if (content.title) {
      titleHeight = 80
      elements.push({
        id: `title-${elementId++}`,
        type: 'title',
        content: { text: content.title },
        calculatedPosition: {
          col: 0,
          row: 0,
          x: padding[3],
          y: padding[0],
          width: contentWidth,
          height: titleHeight,
        },
      })
    }

    // 正文
    if (content.text) {
      const textY = padding[0] + titleHeight + (content.title ? this.config.gap : 0)
      const textHeight = contentHeight - titleHeight - (content.title ? this.config.gap : 0)

      elements.push({
        id: `text-${elementId++}`,
        type: 'text',
        content: { text: content.text },
        calculatedPosition: {
          col: 0,
          row: 1,
          x: padding[3],
          y: textY,
          width: contentWidth,
          height: textHeight,
        },
      })
    }

    return {
      elements,
      gridInfo: {
        columns: 1,
        rows: 2,
        columnWidth: contentWidth,
        rowHeight: contentHeight / 2,
        gap: this.config.gap,
      },
      containerSize: {
        width: this.containerWidth,
        height: this.containerHeight,
      },
    }
  }
}
