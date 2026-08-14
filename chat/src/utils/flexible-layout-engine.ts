/**
 * 灵活布局引擎
 * 处理基于栏目的动态内容布局
 */

import type {
  FlexibleSlide,
  Column,
  ContentBlock,
  LayoutMode,
  CalculatedLayout,
  CalculatedElement,
} from '@/types/ppt-flexible'

export class FlexibleLayoutEngine {
  private containerWidth: number = 1280
  private containerHeight: number = 720
  private config = {
    columns: 12, // 基础网格列数
    rows: 6, // 基础网格行数
    gap: 16, // 默认间隔
    padding: 32, // 默认内边距
  }

  constructor(containerWidth?: number, containerHeight?: number) {
    if (containerWidth) this.containerWidth = containerWidth
    if (containerHeight) this.containerHeight = containerHeight
  }

  /**
   * 布局主方法
   */
  layout(slide: FlexibleSlide): CalculatedLayout {
    const elements: CalculatedElement[] = []
    const { layout, columns, gap = '16px', padding = '32px' } = slide

    // 解析间隔和内边距
    const gapValue = parseInt(gap, 10)
    const paddingValue = parseInt(padding, 10)

    // 计算可用空间
    const availableWidth = this.containerWidth - paddingValue * 2
    const availableHeight = this.containerHeight - paddingValue * 2

    // 计算列宽
    const columnWidths = this.calculateColumnWidths(layout, columns, availableWidth, gapValue)

    // 处理每一栏
    let currentX = paddingValue

    columns.forEach((column, colIndex) => {
      const columnWidth = columnWidths[colIndex]
      const columnElements = this.layoutColumn(
        column,
        currentX,
        paddingValue,
        columnWidth,
        availableHeight,
        `col-${colIndex}`
      )

      elements.push(...columnElements)
      currentX += columnWidth + gapValue
    })

    // 如果有页面标题，添加到顶部
    if (slide.title) {
      elements.unshift(this.createTitleElement(slide.title, paddingValue, availableWidth))
    }

    return {
      elements,
      gridInfo: {
        columns: this.config.columns,
        rows: this.config.rows,
        columnWidth: availableWidth / this.config.columns,
        rowHeight: availableHeight / this.config.rows,
        gap: gapValue,
      },
      containerSize: {
        width: this.containerWidth,
        height: this.containerHeight,
      },
    }
  }

  /**
   * 计算各栏宽度
   */
  private calculateColumnWidths(
    layout: LayoutMode,
    columns: Column[],
    availableWidth: number,
    gap: number
  ): number[] {
    const columnCount = columns.length
    const totalGap = gap * (columnCount - 1)
    const contentWidth = availableWidth - totalGap

    // 如果指定了宽度比例，按比例分配
    const hasCustomWidths = columns.some(col => col.width !== undefined)

    if (hasCustomWidths) {
      const totalRatio = columns.reduce((sum, col) => sum + (col.width || 0), 0)
      return columns.map(col => {
        const ratio = (col.width || 0) / totalRatio
        return contentWidth * ratio
      })
    }

    // 否则平均分配
    const equalWidth = contentWidth / columnCount
    return columns.map(() => equalWidth)
  }

  /**
   * 布局单个栏目
   */
  private layoutColumn(
    column: Column,
    x: number,
    y: number,
    width: number,
    height: number,
    idPrefix: string
  ): CalculatedElement[] {
    const elements: CalculatedElement[] = []
    const { blocks, verticalAlign = 'top' } = column

    // 计算内容总高度
    const blockHeights = blocks.map(block => this.estimateBlockHeight(block, width))
    const totalContentHeight = blockHeights.reduce((sum, h) => sum + h, 0)
    const blockGap = 16 // 块间距

    // 根据垂直对齐计算起始Y位置
    let currentY = y
    if (verticalAlign === 'middle') {
      currentY = y + (height - totalContentHeight - blockGap * (blocks.length - 1)) / 2
    } else if (verticalAlign === 'bottom') {
      currentY = y + height - totalContentHeight - blockGap * (blocks.length - 1)
    }

    // 布局每个内容块
    blocks.forEach((block, index) => {
      const blockHeight = blockHeights[index]
      const element = this.createCalculatedElement(
        block,
        x,
        currentY,
        width,
        blockHeight,
        `${idPrefix}-block-${index}`
      )

      elements.push(element)
      currentY += blockHeight + blockGap
    })

    return elements
  }

  /**
   * 估算内容块高度
   */
  private estimateBlockHeight(block: ContentBlock, width: number): number {
    const baseHeight = 60 // 基础高度

    switch (block.type) {
      case 'title':
        return block.level === 1 ? 80 : 60
      case 'text':
        // 根据文字长度估算高度
        const charPerLine = width / 16 // 假设每个字符16px
        const lines = Math.ceil(block.content.length / charPerLine)
        return Math.min(lines * 24 + 20, 200) // 行高24px，最大200px
      case 'list':
        return block.items.length * 30 + 20
      case 'image':
        return width * 0.75 // 假设4:3比例
      case 'chart':
        return 400 // 图表固定高度，增加到400px
      case 'quote':
        return 120
      case 'spacer':
        return block.height || 40
      default:
        return baseHeight
    }
  }

  /**
   * 创建计算后的元素
   */
  private createCalculatedElement(
    block: ContentBlock,
    x: number,
    y: number,
    width: number,
    height: number,
    id: string
  ): CalculatedElement {
    // 映射内容块类型到元素类型
    const typeMap: Record<string, string> = {
      title: 'title',
      text: 'text',
      list: 'list',
      image: 'image',
      chart: 'chart',
      quote: 'text',
      spacer: 'divider',
    }

    const elementType = typeMap[block.type] || 'text'

    // 构建内容对象
    let content: any = {}
    switch (block.type) {
      case 'title':
        content = { text: block.text, level: block.level }
        break
      case 'text':
        content = { text: block.content, markdown: block.markdown }
        break
      case 'list':
        content = { items: block.items, ordered: block.ordered }
        break
      case 'image':
        content = {
          src: block.src,
          alt: block.alt,
          caption: block.caption,
          rounded: block.rounded,
        }
        break
      case 'chart':
        content = {
          type: block.chartType,
          title: block.title,
          data: block.data,
          options: block.options,
        }
        break
      case 'quote':
        content = {
          text: `"${block.text}"${block.author ? `\n— ${block.author}` : ''}`,
        }
        break
    }

    return {
      id,
      type: elementType as any,
      content,
      calculatedPosition: {
        col: Math.floor(x / (this.containerWidth / this.config.columns)),
        row: Math.floor(y / (this.containerHeight / this.config.rows)),
        width,
        height,
        x,
        y,
      },
    }
  }

  /**
   * 创建页面标题元素
   */
  private createTitleElement(title: string, padding: number, width: number): CalculatedElement {
    return {
      id: 'page-title',
      type: 'title',
      content: { text: title, level: 1 },
      calculatedPosition: {
        col: 0,
        row: 0,
        width,
        height: 60,
        x: padding,
        y: padding,
      },
    }
  }
}

/**
 * 创建预设幻灯片的便捷函数
 */
export function createPresetSlide(type: string, data: Record<string, any>): FlexibleSlide {
  const baseSlide: FlexibleSlide = {
    id: `slide-${Date.now()}`,
    layout: 'single',
    columns: [],
  }

  switch (type) {
    case 'cover':
      return {
        ...baseSlide,
        layout: 'single',
        columns: [
          {
            verticalAlign: 'middle',
            align: 'center',
            blocks: [
              { type: 'title', text: data.title, level: 1 },
              { type: 'title', text: data.subtitle, level: 2 },
              { type: 'spacer', height: 40 },
              { type: 'text', content: `${data.author} | ${data.date}` },
            ],
          },
        ],
      }

    case 'chapter':
      return {
        ...baseSlide,
        layout: 'single',
        columns: [
          {
            verticalAlign: 'middle',
            align: 'center',
            blocks: [
              { type: 'title', text: data.chapterNumber, level: 2 },
              { type: 'title', text: data.chapterTitle, level: 1 },
            ],
          },
        ],
      }

    case 'comparison':
      return {
        ...baseSlide,
        layout: 'double',
        title: data.title,
        columns: [
          {
            blocks: [
              { type: 'title', text: data.leftTitle, level: 2 },
              { type: 'list', items: data.leftItems },
            ],
          },
          {
            blocks: [
              { type: 'title', text: data.rightTitle, level: 2 },
              { type: 'list', items: data.rightItems },
            ],
          },
        ],
      }

    default:
      return baseSlide
  }
}
