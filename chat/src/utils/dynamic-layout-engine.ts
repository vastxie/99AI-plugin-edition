/**
 * 动态布局引擎
 * 根据内容自动计算栏目和高度分配
 */

import type {
  DynamicSlide,
  DynamicColumn,
  ContentBlock,
  CalculatedSlideLayout,
  CalculatedColumnLayout,
  CalculatedBlock,
} from '@/types/ppt-dynamic'

export class DynamicLayoutEngine {
  private containerWidth: number = 1280
  private containerHeight: number = 720
  private defaultTitleHeight: number = 80
  private defaultPadding: number = 32
  private defaultGap: number = 16

  constructor(containerWidth?: number, containerHeight?: number) {
    if (containerWidth) this.containerWidth = containerWidth
    if (containerHeight) this.containerHeight = containerHeight
  }

  /**
   * 计算幻灯片布局
   */
  calculateLayout(slide: DynamicSlide): CalculatedSlideLayout {
    const titleHeight = slide.title ? slide.titleHeight || this.defaultTitleHeight : 0
    const contentAreaY = titleHeight
    const contentAreaHeight = this.containerHeight - titleHeight

    // 如果没有定义columns，创建单栏布局
    const columns = slide.columns || [
      {
        blocks: [],
      },
    ]

    // 计算每栏的布局
    const calculatedColumns = this.calculateColumns(columns, contentAreaY, contentAreaHeight)

    return {
      title: slide.title
        ? {
            text: slide.title,
            height: titleHeight,
          }
        : undefined,
      columns: calculatedColumns,
      containerSize: {
        width: this.containerWidth,
        height: this.containerHeight,
      },
    }
  }

  /**
   * 计算栏目布局
   */
  private calculateColumns(
    columns: DynamicColumn[],
    startY: number,
    availableHeight: number
  ): CalculatedColumnLayout[] {
    const columnCount = columns.length
    if (columnCount === 0) return []

    // 计算每栏的宽度
    const totalDefinedWidth = columns.reduce((sum, col) => sum + (col.width || 0), 0)
    const hasDefinedWidths = totalDefinedWidth > 0

    const columnLayouts: CalculatedColumnLayout[] = []
    let currentX = this.defaultPadding

    columns.forEach(column => {
      // 计算栏宽
      let columnWidth: number
      if (hasDefinedWidths) {
        // 按比例分配
        const widthRatio = (column.width || 0) / totalDefinedWidth
        const totalAvailableWidth =
          this.containerWidth - this.defaultPadding * 2 - this.defaultGap * (columnCount - 1)
        columnWidth = totalAvailableWidth * widthRatio
      } else {
        // 平均分配
        const totalAvailableWidth =
          this.containerWidth - this.defaultPadding * 2 - this.defaultGap * (columnCount - 1)
        columnWidth = totalAvailableWidth / columnCount
      }

      // 计算栏内内容
      const columnLayout = this.calculateColumnContent(
        column,
        currentX,
        startY + this.defaultPadding,
        columnWidth,
        availableHeight - this.defaultPadding * 2
      )

      columnLayouts.push(columnLayout)
      currentX += columnWidth + this.defaultGap
    })

    return columnLayouts
  }

  /**
   * 计算单个栏目内的内容布局
   */
  private calculateColumnContent(
    column: DynamicColumn,
    x: number,
    y: number,
    width: number,
    height: number
  ): CalculatedColumnLayout {
    const blocks = column.blocks
    const gap = column.gap || this.defaultGap
    const padding = {
      top: column.padding?.top || 0,
      right: column.padding?.right || 0,
      bottom: column.padding?.bottom || 0,
      left: column.padding?.left || 0,
    }

    // 实际可用空间
    const contentX = x + padding.left
    const contentY = y + padding.top
    const contentWidth = width - padding.left - padding.right
    const contentHeight = height - padding.top - padding.bottom

    // 计算高度分配
    const heightAllocations = this.calculateHeightAllocations(blocks, contentHeight, gap)

    // 创建计算后的块
    const calculatedBlocks: CalculatedBlock[] = []
    let currentY = contentY

    blocks.forEach((block, index) => {
      const blockHeight = heightAllocations[index]

      calculatedBlocks.push({
        id: block.id || `block-${index}`,
        type: block.type,
        content: this.extractBlockContent(block),
        position: {
          x: contentX,
          y: currentY,
          width: contentWidth,
          height: blockHeight,
        },
      })

      currentY += blockHeight + gap
    })

    return {
      x,
      y,
      width,
      height,
      blocks: calculatedBlocks,
    }
  }

  /**
   * 计算高度分配
   */
  private calculateHeightAllocations(
    blocks: ContentBlock[],
    availableHeight: number,
    gap: number
  ): number[] {
    const blockCount = blocks.length
    if (blockCount === 0) return []

    // 减去间距
    const totalGap = gap * (blockCount - 1)
    const contentHeight = availableHeight - totalGap

    // 分离固定高度和自动高度的块
    const fixedHeights: number[] = []
    const autoIndices: number[] = []
    let totalFixedHeight = 0

    blocks.forEach((block, index) => {
      if (block.height !== undefined) {
        // 固定高度（百分比）
        const height = (contentHeight * block.height) / 100
        fixedHeights[index] = height
        totalFixedHeight += height
      } else {
        // 自动高度
        autoIndices.push(index)
      }
    })

    // 计算自动高度块的高度，并应用最小高度约束
    const remainingHeight = contentHeight - totalFixedHeight
    let autoHeight = autoIndices.length > 0 ? remainingHeight / autoIndices.length : 0

    // 合并结果，应用最小高度约束
    const heights: number[] = []
    let totalCalculatedHeight = 0

    blocks.forEach((block, index) => {
      if (fixedHeights[index] !== undefined) {
        // 固定高度块应用最小高度
        const minHeight = this.getMinimumHeight(block)
        const height = Math.max(fixedHeights[index], minHeight)
        heights.push(height)
        totalCalculatedHeight += height
      } else {
        // 自动高度块应用最小高度
        const minHeight = this.getMinimumHeight(block)
        const height = Math.max(autoHeight, minHeight)
        heights.push(height)
        totalCalculatedHeight += height
      }
    })

    // 如果总高度超出可用空间，按比例缩小
    if (totalCalculatedHeight > contentHeight) {
      const scale = contentHeight / totalCalculatedHeight
      heights.forEach((height, index) => {
        heights[index] = Math.max(height * scale, 40) // 最小40px
      })
    }

    return heights
  }

  /**
   * 获取内容块的最小高度要求
   */
  private getMinimumHeight(block: ContentBlock): number {
    switch (block.type) {
      case 'title':
        return 60 // 标题最小60px
      case 'text':
        // 根据文本长度估算最小高度
        const textLength = block.content?.length || 0
        const estimatedLines = Math.ceil(textLength / 50) // 假设每行50字符
        return Math.max(80, estimatedLines * 28) // 最小80px，每行28px
      case 'list':
        // 根据列表项数量估算
        const itemCount = block.items?.length || 1
        return Math.max(60, itemCount * 32) // 最小60px，每项32px
      case 'quote':
        return 150 // 引用块最小150px，确保引用文本和作者名称都能完整显示
      case 'chart':
        return 250 // 图表最小250px，降低默认高度
      case 'image':
        return 200 // 图片最小200px
      case 'spacer':
        return 0 // spacer无最小高度要求
      default:
        return 40 // 默认最小40px
    }
  }

  /**
   * 提取内容块的内容
   */
  private extractBlockContent(block: ContentBlock): any {
    switch (block.type) {
      case 'title':
        return { text: block.text, level: block.level }
      case 'text':
        return { text: block.content, markdown: block.markdown }
      case 'list':
        return { items: block.items, ordered: block.ordered }
      case 'image':
        return {
          src: block.src,
          alt: block.alt,
          caption: block.caption,
          rounded: block.rounded,
        }
      case 'chart':
        return {
          type: block.chartType,
          title: block.title,
          data: block.data,
          options: block.options,
        }
      case 'quote':
        return {
          text: block.text,
          author: block.author,
        }
      case 'spacer':
        return {}
      default:
        return {}
    }
  }

  /**
   * 创建单栏布局的便捷方法
   */
  static createSingleColumn(blocks: ContentBlock[]): DynamicColumn[] {
    return [
      {
        blocks,
      },
    ]
  }

  /**
   * 创建等宽多栏布局的便捷方法
   */
  static createEqualColumns(...columnsBlocks: ContentBlock[][]): DynamicColumn[] {
    return columnsBlocks.map(blocks => ({ blocks }))
  }

  /**
   * 创建自定义宽度多栏布局的便捷方法
   */
  static createCustomColumns(
    columnConfigs: Array<{ width: number; blocks: ContentBlock[] }>
  ): DynamicColumn[] {
    return columnConfigs
  }
}
