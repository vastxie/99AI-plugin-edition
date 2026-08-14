/**
 * PPT栅栏布局引擎
 */

import type {
  SlideLayout,
  LayoutElement,
  CalculatedElement,
  CalculatedLayout,
  LayoutConflict,
  ElementType,
} from '@/types/ppt-grid'

// 元素默认大小配置
const DEFAULT_ELEMENT_SIZES: Record<ElementType, { colSpan: number; rowSpan: number }> = {
  title: { colSpan: 12, rowSpan: 1 }, // 标题默认1行
  subtitle: { colSpan: 12, rowSpan: 1 },
  text: { colSpan: 6, rowSpan: 2 }, // 减少默认文本高度，后续会根据内容调整
  image: { colSpan: 6, rowSpan: 4 },
  chart: { colSpan: 6, rowSpan: 4 }, // 适当减少图表高度
  table: { colSpan: 8, rowSpan: 4 }, // 适当减少表格高度
  list: { colSpan: 6, rowSpan: 3 }, // 适当减少列表高度
  timeline: { colSpan: 12, rowSpan: 3 }, // 适当减少时间线高度
  'icon-grid': { colSpan: 12, rowSpan: 3 },
  quote: { colSpan: 12, rowSpan: 3 },
  team: { colSpan: 12, rowSpan: 4 },
  qa: { colSpan: 12, rowSpan: 4 },
}

export class GridLayoutEngine {
  private grid: boolean[][] = [] // 占用矩阵
  private elements: LayoutElement[] = []
  private config: {
    columns: number
    rowHeight: number | 'auto'
    gap: number
    padding: number | [number, number, number, number]
  }
  private containerWidth: number = 1280 // 16:9标准宽度
  private containerHeight: number = 720 // 16:9标准高度
  private maxIterations: number = 5 // 最大迭代次数，防止死循环

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

    // 初始化默认配置
    this.config = {
      columns: 12,
      rowHeight: 'auto',
      gap: 16,
      padding: 32,
    }
  }

  /**
   * 主布局方法
   */
  layout(slide: SlideLayout): CalculatedLayout {
    // 使用默认配置
    this.config = {
      columns: 12,
      rowHeight: 'auto',
      gap: 16,
      padding: 32,
    }
    this.elements = slide.elements ?? []
    this.initGrid()

    // 使用智能迭代布局
    let calculatedElements = this.smartIterativeLayout()

    // 检查是否需要垂直居中（标题页）
    if (this.isTitleSlide(slide)) {
      calculatedElements = this.centerVertically(calculatedElements)
    }

    // 计算实际像素位置
    const finalLayout = this.calculatePixelPositions(calculatedElements)

    return finalLayout
  }

  /**
   * 初始化占用网格
   */
  private initGrid() {
    const estimatedRows = 10 // 初始行数，会根据需要动态扩展
    this.grid = Array(estimatedRows)
      .fill(null)
      .map(() => Array(this.config.columns).fill(false))
  }

  /**
   * 智能迭代布局算法
   */
  private smartIterativeLayout(): CalculatedElement[] {
    let bestLayout: CalculatedElement[] = []
    let bestScore = -Infinity
    let iteration = 0

    // 第一步：预估算空间需求
    const spaceRequirements = this.estimateSpaceRequirements()

    // 第二步：迭代优化布局
    while (iteration < this.maxIterations) {
      // 重置网格
      this.initGrid()

      // 根据当前迭代调整元素尺寸策略
      const adjustedElements = this.adjustElementSizes(iteration, spaceRequirements)

      // 执行布局
      const layout = this.autoLayoutWithAdjustedSizes(adjustedElements)

      // 应用紧凑布局
      const compactedLayout = this.compactLayout(layout)

      // 评估布局质量
      const { score, issues } = this.evaluateLayout(compactedLayout)

      // 如果当前布局更好，保存它
      if (score > bestScore) {
        bestLayout = compactedLayout
        bestScore = score
      }

      // 如果没有问题，或者已经足够好，停止迭代
      if (issues.length === 0 || score > 0.9) {
        break
      }

      // 根据问题调整下一次迭代的策略
      this.adjustStrategyForNextIteration(issues)

      iteration++
    }

    return bestLayout
  }

  /**
   * 预估算空间需求
   */
  private estimateSpaceRequirements(): Map<string, { minSpace: number; idealSpace: number }> {
    const requirements = new Map()

    for (const element of this.elements) {
      let minSpace = 1
      let idealSpace = 1

      switch (element.type) {
        case 'text':
          if (element.content?.text) {
            const textLength = element.content.text.length
            // 基于文字长度估算需要的格子数
            minSpace = Math.ceil(textLength / 100) * 2 // 每100字符约需2格
            idealSpace = Math.ceil(textLength / 80) * 2 // 理想情况下每80字符2格
          }
          break
        case 'image':
          minSpace = 12 // 图片至少需要12格（3x4）
          idealSpace = 24 // 理想24格（6x4）
          break
        case 'chart':
          minSpace = 16 // 图表至少需要16格（4x4）
          idealSpace = 24 // 理想24格（6x4）
          break
        case 'list':
          if (element.content?.items) {
            const itemCount = element.content.items.length
            minSpace = itemCount * 2 // 每项至少2格
            idealSpace = itemCount * 3 // 理想每项3格
          }
          break
        case 'table':
          minSpace = 20 // 表格至少需要20格
          idealSpace = 32 // 理想32格
          break
      }

      requirements.set(element.id, { minSpace, idealSpace })
    }

    return requirements
  }

  /**
   * 根据迭代次数调整元素尺寸
   */
  private adjustElementSizes(
    iteration: number,
    spaceRequirements: Map<string, { minSpace: number; idealSpace: number }>
  ): LayoutElement[] {
    const adjusted: any[] = [...this.elements]

    // 迭代策略：从理想尺寸逐步向最小尺寸收敛
    const ratio = 1 - iteration * 0.2 // 每次迭代减少20%

    for (let i = 0; i < adjusted.length; i++) {
      const element = adjusted[i]
      const req = spaceRequirements.get(element.id)
      if (req) {
        // 计算当前迭代应该使用的空间大小
        const targetSpace = req.minSpace + (req.idealSpace - req.minSpace) * ratio

        // 将空间需求转换为具体的列宽和行高
        // 这里暂时存储在元素上，后续会在getResponsiveLayout中使用
        element.targetSpace = targetSpace
      }
    }

    return adjusted
  }

  /**
   * 使用调整后的尺寸执行自动布局
   */
  private autoLayoutWithAdjustedSizes(elements: LayoutElement[]): CalculatedElement[] {
    // 临时保存原始元素
    const originalElements = this.elements
    this.elements = elements

    // 执行布局
    const result = this.autoLayout()

    // 恢复原始元素
    this.elements = originalElements

    return result
  }

  /**
   * 评估布局质量
   */
  private evaluateLayout(layout: CalculatedElement[]): { score: number; issues: string[] } {
    let score = 1.0
    const issues: string[] = []

    // 检查是否有元素溢出底部
    const maxAllowedRow = 7 // 为底部预留空间
    for (const element of layout) {
      const endRow = element.calculatedPosition.row + this.getResponsiveLayout(element).rowSpan
      if (endRow > maxAllowedRow) {
        score -= 0.3
        issues.push(`overflow:${element.id}`)
      }
    }

    // 检查文本元素是否有足够空间
    for (const element of layout) {
      if (element.type === 'text' && element.content?.text) {
        const responsiveLayout = this.getResponsiveLayout(element)
        const area = responsiveLayout.colSpan * responsiveLayout.rowSpan
        const textLength = element.content.text.length
        const neededArea = Math.ceil(textLength / 50) // 每50字符需要1格

        if (area < neededArea) {
          score -= 0.2
          issues.push(`cramped:${element.id}`)
        }
      }
    }

    // 检查元素间距是否合理
    const hasGoodSpacing = this.checkElementSpacing(layout)
    if (!hasGoodSpacing) {
      score -= 0.1
      issues.push('poor-spacing')
    }

    // 检查对齐情况
    const alignmentScore = this.calculateAlignmentScore(layout)
    score = score * 0.7 + alignmentScore * 0.3

    return { score: Math.max(0, score), issues }
  }

  /**
   * 检查元素间距
   */
  private checkElementSpacing(layout: CalculatedElement[]): boolean {
    // 简单检查：确保元素之间至少有1格间距
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const elem1 = layout[i]
        const elem2 = layout[j]

        // 检查是否紧贴
        if (this.areTouching(elem1, elem2)) {
          return false
        }
      }
    }
    return true
  }

  /**
   * 检查两个元素是否紧贴
   */
  private areTouching(elem1: CalculatedElement, elem2: CalculatedElement): boolean {
    const pos1 = elem1.calculatedPosition
    const pos2 = elem2.calculatedPosition
    const layout1 = this.getResponsiveLayout(elem1)
    const layout2 = this.getResponsiveLayout(elem2)

    // 检查是否在同一行且紧贴
    if (pos1.row === pos2.row) {
      if (pos1.col + layout1.colSpan === pos2.col || pos2.col + layout2.colSpan === pos1.col) {
        return true
      }
    }

    // 检查是否在同一列且紧贴
    if (pos1.col === pos2.col) {
      if (pos1.row + layout1.rowSpan === pos2.row || pos2.row + layout2.rowSpan === pos1.row) {
        return true
      }
    }

    return false
  }

  /**
   * 计算对齐得分
   */
  private calculateAlignmentScore(layout: CalculatedElement[]): number {
    let alignedCount = 0
    let totalPairs = 0

    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        totalPairs++

        const elem1 = layout[i]
        const elem2 = layout[j]

        // 检查是否对齐
        if (
          elem1.calculatedPosition.col === elem2.calculatedPosition.col ||
          elem1.calculatedPosition.row === elem2.calculatedPosition.row
        ) {
          alignedCount++
        }
      }
    }

    return totalPairs > 0 ? alignedCount / totalPairs : 1
  }

  /**
   * 根据问题调整下一次迭代的策略
   */
  private adjustStrategyForNextIteration(issues: string[]) {
    // 分析问题类型
    const hasOverflow = issues.some(issue => issue.startsWith('overflow:'))
    const hasCramped = issues.some(issue => issue.startsWith('cramped:'))

    if (hasOverflow) {
      // 如果有溢出，下次迭代需要更激进地减小元素尺寸
      // 这会在adjustElementSizes中通过iteration参数体现
    }

    if (hasCramped) {
      // 如果有拥挤，可能需要调整布局优先级
      // 暂时通过iteration参数控制
    }
  }

  /**
   * 自动布局算法
   */
  private autoLayout(): CalculatedElement[] {
    // 1. 分析页面内容特征
    const contentAnalysis = this.analyzeContent()

    // 2. 根据内容特征选择布局策略
    if (contentAnalysis.layoutStrategy === 'two-column') {
      return this.twoColumnLayout()
    } else if (contentAnalysis.layoutStrategy === 'single-column') {
      return this.singleColumnLayout()
    } else {
      // 默认使用智能混合布局
      return this.smartMixedLayout()
    }
  }

  /**
   * 分析内容特征
   */
  private analyzeContent(): { layoutStrategy: 'two-column' | 'single-column' | 'mixed' } {
    const elements = this.elements

    // 统计各类型元素
    const hasTitle = elements.some(el => el.type === 'title')
    const textElements = elements.filter(el => el.type === 'text')
    const imageElements = elements.filter(el => el.type === 'image')
    const chartElements = elements.filter(el => el.type === 'chart')

    // 计算内容复杂度
    const totalElements = elements.length
    const visualElements = imageElements.length + chartElements.length

    // 如果只有标题和少量元素，使用单列布局
    if (totalElements <= 3 && hasTitle) {
      return { layoutStrategy: 'single-column' }
    }

    // 如果有图片/图表和文本的组合，适合两列布局
    if (visualElements > 0 && textElements.length > 0 && totalElements <= 6) {
      return { layoutStrategy: 'two-column' }
    }

    // 其他情况使用混合布局
    return { layoutStrategy: 'mixed' }
  }

  /**
   * 两列布局策略
   */
  private twoColumnLayout(): CalculatedElement[] {
    const calculated: CalculatedElement[] = []

    // 将元素分为左右两组
    const leftElements: LayoutElement[] = []
    const rightElements: LayoutElement[] = []

    // 标题始终占满整行
    const titles = this.elements.filter(el => el.type === 'title' || el.type === 'subtitle')
    const others = this.elements.filter(el => el.type !== 'title' && el.type !== 'subtitle')

    // 智能分配左右内容
    for (let i = 0; i < others.length; i++) {
      const element = others[i]
      // 图片和图表倾向于放在右侧
      if (element.type === 'image' || element.type === 'chart') {
        rightElements.push(element)
      } else {
        // 文本和列表放在左侧
        leftElements.push(element)
      }
    }

    // 如果分配不均，重新平衡
    if (leftElements.length === 0 && rightElements.length > 1) {
      leftElements.push(rightElements.shift()!)
    } else if (rightElements.length === 0 && leftElements.length > 1) {
      rightElements.push(leftElements.pop()!)
    }

    let currentRow = 0

    // 先放置标题
    for (const title of titles) {
      this.placeElement(0, currentRow, title)
      calculated.push({
        ...title,
        calculatedPosition: {
          col: 0,
          row: currentRow,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
      })
      currentRow += this.getResponsiveLayout(title).rowSpan
    }

    // 左右并排放置其他元素
    const leftStartRow = currentRow
    const rightStartRow = currentRow

    // 放置左侧元素
    let leftRow = leftStartRow
    for (const element of leftElements) {
      const layout = this.getResponsiveLayout(element)
      // 左侧元素占6列，但需要调整高度以适应窄宽度
      let adjustedRowSpan = layout.rowSpan

      // 文本在窄列中需要更多高度
      if (element.type === 'text' && element.content?.text) {
        const textLength = element.content.text.length
        // 6列宽度下，文字需要更多行来显示
        adjustedRowSpan = Math.max(3, Math.ceil(textLength / 50)) // 每50字符至少1行，最少3行
      }

      const adjustedLayout = { colSpan: 6, rowSpan: adjustedRowSpan }

      this.placeElementWithLayout(0, leftRow, element, adjustedLayout)
      calculated.push({
        ...element,
        calculatedPosition: {
          col: 0,
          row: leftRow,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
      })
      leftRow += adjustedLayout.rowSpan
    }

    // 放置右侧元素
    let rightRow = rightStartRow
    for (const element of rightElements) {
      const layout = this.getResponsiveLayout(element)
      // 右侧元素占6列，从第7列开始
      let adjustedRowSpan = layout.rowSpan

      // 图片在窄列中可能需要调整高度以保持比例
      if (element.type === 'image') {
        adjustedRowSpan = Math.max(4, layout.rowSpan) // 图片至少4行高
      }

      const adjustedLayout = { colSpan: 6, rowSpan: adjustedRowSpan }

      this.placeElementWithLayout(6, rightRow, element, adjustedLayout)
      calculated.push({
        ...element,
        calculatedPosition: {
          col: 6,
          row: rightRow,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
      })
      rightRow += adjustedLayout.rowSpan
    }

    return calculated
  }

  /**
   * 单列布局策略
   */
  private singleColumnLayout(): CalculatedElement[] {
    const calculated: CalculatedElement[] = []
    const sorted = this.sortElementsByPriority()

    let currentRow = 0

    for (const element of sorted) {
      const layout = this.getResponsiveLayout(element)

      // 所有元素都占满整行
      this.placeElement(0, currentRow, element)
      calculated.push({
        ...element,
        calculatedPosition: {
          col: 0,
          row: currentRow,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
      })
      currentRow += layout.rowSpan
    }

    return calculated
  }

  /**
   * 智能混合布局
   */
  private smartMixedLayout(): CalculatedElement[] {
    const calculated: CalculatedElement[] = []

    // 1. 根据元素类型和优先级排序
    const sorted = this.sortElementsByPriority()

    // 2. 检查是否是内容密集型页面（有多个需要大空间的元素）
    const hasLongText = sorted.some(el => el.type === 'text' && el.content?.text?.length > 100)
    const hasImage = sorted.some(el => el.type === 'image')
    const hasList = sorted.some(el => el.type === 'list')

    // 如果页面内容较多，调整布局策略
    if (hasLongText && (hasImage || hasList)) {
      // 对于内容密集的页面，优先考虑横向布局
      for (const element of sorted) {
        if (element.type === 'text' && element.content?.text?.length > 100) {
          // 长文本在有图片或列表时，占用更多宽度
          const layout = this.getResponsiveLayout(element)
          layout.colSpan = Math.min(12, layout.colSpan + 2)
        }
      }
    }

    // 3. 使用贪心算法逐个放置
    for (const element of sorted) {
      const position = this.findBestPosition(element)
      if (position) {
        this.placeElement(position.col, position.row, element)
        calculated.push({
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
    }

    return calculated
  }

  /**
   * 根据优先级排序元素
   */
  private sortElementsByPriority(elements?: LayoutElement[]): LayoutElement[] {
    const toSort = elements || this.elements
    return [...toSort].sort((a, b) => {
      // 根据元素类型确定优先级
      const typeOrder = [
        'title',
        'subtitle',
        'chart',
        'image',
        'list',
        'text',
        'quote',
        'qa',
        'team',
        'table',
        'timeline',
        'icon-grid',
      ]
      const priorityA = typeOrder.indexOf(a.type)
      const priorityB = typeOrder.indexOf(b.type)

      if (priorityA !== priorityB) {
        return priorityA - priorityB // 索引小的优先级高
      }

      // 相同类型，大元素先放置
      const sizeA = DEFAULT_ELEMENT_SIZES[a.type].colSpan * DEFAULT_ELEMENT_SIZES[a.type].rowSpan
      const sizeB = DEFAULT_ELEMENT_SIZES[b.type].colSpan * DEFAULT_ELEMENT_SIZES[b.type].rowSpan
      return sizeB - sizeA
    })
  }

  /**
   * 查找最佳位置
   */
  private findBestPosition(
    element: LayoutElement
  ): { col: number; row: number; score: number } | null {
    const positions: Array<{ col: number; row: number; score: number }> = []

    // 获取响应式配置
    const layout = this.getResponsiveLayout(element)
    const { colSpan, rowSpan } = layout

    // 扫描所有可能位置
    const maxRows = this.grid.length
    const maxCols = this.config.columns

    // 对于长文本，如果宽度被调整过，需要重新计算可用列
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col <= maxCols - colSpan; col++) {
        if (this.canPlace(col, row, element)) {
          const score = this.calculatePositionScore(col, row, element)
          positions.push({ col, row, score })
        }
      }
    }

    // 如果没有找到合适位置，且是文本元素，尝试使用全宽
    if (positions.length === 0 && element.type === 'text') {
      // 尝试全宽布局
      const fullWidthLayout = { colSpan: 12, rowSpan: Math.max(1, Math.ceil(rowSpan / 2)) }
      for (let row = 0; row < maxRows; row++) {
        if (this.canPlaceWithLayout(0, row, element, fullWidthLayout)) {
          const score = this.calculatePositionScore(0, row, element)
          positions.push({ col: 0, row, score })
        }
      }
    }

    // 返回得分最高的位置
    if (positions.length === 0) return null
    return positions.sort((a, b) => b.score - a.score)[0]
  }

  /**
   * 获取响应式布局配置
   */
  private getResponsiveLayout(element: LayoutElement) {
    // 检查是否有迭代调整的目标空间
    const targetSpace = (element as any).targetSpace

    if (targetSpace !== undefined) {
      // 根据目标空间计算列宽和行高
      // 优先横向扩展，其次纵向
      let colSpan = Math.min(12, Math.ceil(Math.sqrt(targetSpace) * 1.5))
      let rowSpan = Math.ceil(targetSpace / colSpan)

      // 特殊类型调整
      if (element.type === 'title' || element.type === 'subtitle') {
        colSpan = 12
        rowSpan = 1
      }

      return { colSpan, rowSpan }
    }

    // 获取默认值
    const defaultSize = DEFAULT_ELEMENT_SIZES[element.type]
    let colSpan = defaultSize.colSpan
    let rowSpan = defaultSize.rowSpan

    // 对文本类型进行内容感知调整 - 重点优化高度计算
    if (element.type === 'text' && element.content?.text) {
      const textLength = element.content.text.length

      // 根据文字长度动态调整宽度和高度
      if (textLength > 150) {
        // 长文本：增加宽度，确保足够高度
        colSpan = 10
        rowSpan = Math.max(3, Math.ceil(textLength / 100)) // 至少3行，每100字符增加1行
      } else if (textLength > 100) {
        // 中等文本：明显增加宽度和高度
        colSpan = 8
        rowSpan = Math.max(2, Math.ceil(textLength / 80)) // 至少2行
      } else if (textLength > 50) {
        // 短文本：适度增加宽度
        colSpan = 7
        rowSpan = 2
      } else {
        // 非常短的文本：使用默认宽度
        colSpan = 6
        rowSpan = 1
      }
    }

    // 对列表类型根据项目数量调整
    if (element.type === 'list' && element.content?.items) {
      const itemCount = element.content.items.length
      if (itemCount > 5) {
        colSpan = 8 // 多项目列表需要更宽
        rowSpan = Math.max(4, itemCount) // 确保每个项目都有空间
      } else if (itemCount > 3) {
        colSpan = 7
        rowSpan = Math.max(3, itemCount) // 至少容纳所有项目
      } else {
        rowSpan = Math.max(rowSpan, itemCount) // 基础高度至少容纳所有项目
      }
    }

    return { colSpan, rowSpan }
  }

  /**
   * 检查是否可以放置元素
   */
  private canPlace(col: number, row: number, element: LayoutElement): boolean {
    const layout = this.getResponsiveLayout(element)
    return this.canPlaceWithLayout(col, row, element, layout)
  }

  /**
   * 使用指定布局检查是否可以放置元素
   */
  private canPlaceWithLayout(
    col: number,
    row: number,
    element: LayoutElement,
    layout: { colSpan: number; rowSpan: number }
  ): boolean {
    const { colSpan, rowSpan } = layout

    // 检查是否超出边界
    if (col + colSpan > this.config.columns) return false
    if (row + rowSpan > this.grid.length) return false

    // 检查占用情况
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        if (this.grid[r] && this.grid[r][c]) {
          return false
        }
      }
    }

    return true
  }

  /**
   * 放置元素到网格
   */
  private placeElement(col: number, row: number, element: LayoutElement) {
    const layout = this.getResponsiveLayout(element)
    this.placeElementWithLayout(col, row, element, layout)
  }

  /**
   * 使用指定布局放置元素到网格
   */
  private placeElementWithLayout(
    col: number,
    row: number,
    element: LayoutElement,
    layout: { colSpan: number; rowSpan: number }
  ) {
    const { colSpan, rowSpan } = layout

    // 确保有足够的行
    while (row + rowSpan > this.grid.length) {
      this.grid.push(Array(this.config.columns).fill(false))
    }

    // 标记占用
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        this.grid[r][c] = true
      }
    }
  }

  /**
   * 计算位置得分
   */
  private calculatePositionScore(col: number, row: number, element: LayoutElement): number {
    let score = 0
    const layout = this.getResponsiveLayout(element)

    // 1. 优先靠上（行权重更大）
    score -= row * 100

    // 2. 其次考虑列位置
    if (element.type === 'title' || element.type === 'subtitle') {
      // 标题居中
      score -= Math.abs(col - (this.config.columns - layout.colSpan) / 2) * 10
      // 标题元素在第0行有额外加分
      if (row === 0) {
        score += 100
      }
    } else if (element.type === 'chart' || element.type === 'image') {
      // 图表和图片倾向于左右两侧
      if (col === 0 || col === this.config.columns - layout.colSpan) {
        score += 50
      }
    } else {
      // 其他元素轻微倾向于靠左
      score -= col * 5
    }

    // 3. 避免产生空隙
    const hasGapAbove = this.hasEmptyRowAbove(col, row, element)
    if (hasGapAbove && row > 0) {
      score -= 200 // 严重惩罚
    }

    // 4. 邻居奖励（紧凑布局）
    const neighbors = this.countNeighbors(col, row, element)
    score += neighbors * 20

    // 5. 对齐奖励
    if (this.hasAlignedElements(col, row)) {
      score += 30
    }

    // 6. 避免超出预期行数，为底部预留空间
    const estimatedEndRow = row + layout.rowSpan
    const maxAllowedRows = 6 // 大幅减少最大行数，确保底部有充足空间
    if (estimatedEndRow > maxAllowedRows) {
      score -= (estimatedEndRow - maxAllowedRows) * 200 // 加大惩罚力度，防止元素过于靠下
    }

    return score
  }

  /**
   * 统计邻居数量
   */
  private countNeighbors(col: number, row: number, element: LayoutElement): number {
    const layout = this.getResponsiveLayout(element)
    const { colSpan, rowSpan } = layout
    let count = 0

    // 检查上下左右
    const positions = [
      { r: row - 1, c: col }, // 上
      { r: row + rowSpan, c: col }, // 下
      { r: row, c: col - 1 }, // 左
      { r: row, c: col + colSpan }, // 右
    ]

    for (const pos of positions) {
      if (
        pos.r >= 0 &&
        pos.r < this.grid.length &&
        pos.c >= 0 &&
        pos.c < this.config.columns &&
        this.grid[pos.r] &&
        this.grid[pos.r][pos.c]
      ) {
        count++
      }
    }

    return count
  }

  /**
   * 检查是否有对齐的元素
   */
  private hasAlignedElements(col: number, row: number): boolean {
    // 检查同一列
    for (let r = 0; r < this.grid.length; r++) {
      if (r !== row && this.grid[r] && this.grid[r][col]) {
        return true
      }
    }

    // 检查同一行
    for (let c = 0; c < this.config.columns; c++) {
      if (c !== col && this.grid[row] && this.grid[row][c]) {
        return true
      }
    }

    return false
  }

  /**
   * 检查上方是否有空隙
   */
  private hasEmptyRowAbove(col: number, row: number, element: LayoutElement): boolean {
    const layout = this.getResponsiveLayout(element)
    const { colSpan } = layout

    if (row === 0) return false

    // 检查上一行对应列是否全部为空
    for (let r = row - 1; r >= 0; r--) {
      let hasElement = false
      for (let c = col; c < col + colSpan; c++) {
        if (this.grid[r] && this.grid[r][c]) {
          hasElement = true
          break
        }
      }

      if (!hasElement) {
        // 找到了一个完全空的行
        return true
      } else {
        // 如果这一行有元素，就不算有空隙
        return false
      }
    }

    return false
  }

  /**
   * 紧凑布局优化
   */
  private compactLayout(elements: CalculatedElement[]): CalculatedElement[] {
    // 按行排序
    const sorted = [...elements].sort((a, b) => {
      if (a.calculatedPosition.row !== b.calculatedPosition.row) {
        return a.calculatedPosition.row - b.calculatedPosition.row
      }
      return a.calculatedPosition.col - b.calculatedPosition.col
    })

    // 重新初始化网格
    this.initGrid()

    // 尝试向上移动每个元素
    for (const element of sorted) {
      let bestRow = element.calculatedPosition.row

      // 从第0行开始尝试
      for (let row = 0; row < element.calculatedPosition.row; row++) {
        if (this.canPlace(element.calculatedPosition.col, row, element)) {
          bestRow = row
          break
        }
      }

      // 更新位置
      if (bestRow !== element.calculatedPosition.row) {
        element.calculatedPosition.row = bestRow
      }

      // 重新放置
      this.placeElement(element.calculatedPosition.col, bestRow, element)
    }

    return sorted
  }

  /**
   * 计算实际像素位置
   */
  private calculatePixelPositions(elements: CalculatedElement[]): CalculatedLayout {
    const padding = Array.isArray(this.config.padding)
      ? this.config.padding
      : [this.config.padding, this.config.padding, this.config.padding, this.config.padding]

    const contentWidth = this.containerWidth - padding[1] - padding[3]
    const contentHeight = this.containerHeight - padding[0] - padding[2]

    const columnWidth =
      (contentWidth - this.config.gap * (this.config.columns - 1)) / this.config.columns

    // 计算最大行数
    let maxRow = 0
    for (const element of elements) {
      const endRow = element.calculatedPosition.row + this.getResponsiveLayout(element).rowSpan
      if (endRow > maxRow) maxRow = endRow
    }

    // 基于容器高度计算行高，确保内容不会溢出
    // 为下方预留更多的空白边距（预留总高度的15%或最小80px）
    const bottomReserve = Math.max(this.containerHeight * 0.15, 80)
    const availableContentHeight = contentHeight - bottomReserve

    // 设置最小行高为70px，确保文字有足够空间显示
    const calculatedRowHeight =
      maxRow > 0 ? (availableContentHeight - this.config.gap * (maxRow - 1)) / maxRow : 80
    const minRowHeight = 70 // 提高最小行高，确保文字不会被压缩
    const autoRowHeight = Math.max(calculatedRowHeight, minRowHeight)
    const rowHeight =
      this.config.rowHeight === 'auto'
        ? autoRowHeight
        : Math.max(this.config.rowHeight, minRowHeight)

    // 计算每个元素的像素位置
    for (const element of elements) {
      const layout = this.getResponsiveLayout(element)
      const { col, row } = element.calculatedPosition
      const { colSpan, rowSpan } = layout

      element.calculatedPosition.x = padding[3] + col * (columnWidth + this.config.gap)
      element.calculatedPosition.y = padding[0] + row * (rowHeight + this.config.gap)
      element.calculatedPosition.width = colSpan * columnWidth + (colSpan - 1) * this.config.gap
      element.calculatedPosition.height = rowSpan * rowHeight + (rowSpan - 1) * this.config.gap
    }

    return {
      elements,
      gridInfo: {
        columns: this.config.columns,
        rows: maxRow,
        columnWidth,
        rowHeight,
        gap: this.config.gap,
      },
      containerSize: {
        width: this.containerWidth,
        height: Math.max(
          this.containerHeight,
          padding[0] + padding[2] + maxRow * rowHeight + (maxRow - 1) * this.config.gap
        ),
      },
    }
  }

  /**
   * 检查是否是标题页
   */
  private isTitleSlide(slide: SlideLayout): boolean {
    const elements = slide.elements ?? []
    if (elements.length === 0) return false

    // 所有元素都是标题类型
    const allTitleElements = elements.every(
      el => el.type === 'title' || el.type === 'subtitle' || el.type === 'text'
    )

    // 元素数量不超过4个
    const fewElements = elements.length <= 4

    // 检查是否所有元素都占满整行（colSpan >= 10）
    const allFullWidth = elements.every(el => DEFAULT_ELEMENT_SIZES[el.type].colSpan >= 10)

    return allTitleElements && fewElements && allFullWidth
  }

  /**
   * 垂直居中布局
   */
  private centerVertically(elements: CalculatedElement[]): CalculatedElement[] {
    if (elements.length === 0) return elements

    // 找出所有元素占用的行范围
    let minRow = Infinity
    let maxRow = -Infinity

    for (const element of elements) {
      const row = element.calculatedPosition.row
      const endRow = row + this.getResponsiveLayout(element).rowSpan
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, endRow)
    }

    // 计算内容总高度
    const contentHeight = maxRow - minRow

    // 基于16:9比例计算理想的垂直位置
    // 视觉中心应该略微偏上（黄金分割点约为0.382）
    const visualCenterRatio = 0.35 // 更偏上一些，让视觉效果更明显
    const idealRows = 5 // 进一步减少理想行数，确保底部有更多空间

    // 计算理想的起始行，确保底部有足够空间
    const idealStartRow = Math.max(1, Math.floor((idealRows - contentHeight) * visualCenterRatio))

    // 计算偏移量
    const offset = idealStartRow - minRow

    // 调整所有元素的行位置
    if (offset !== 0) {
      for (const element of elements) {
        element.calculatedPosition.row += offset
      }
    }

    return elements
  }

  /**
   * 检测布局冲突
   */
  detectConflicts(elements: CalculatedElement[]): LayoutConflict[] {
    const conflicts: LayoutConflict[] = []

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const elem1 = elements[i]
        const elem2 = elements[j]

        // 检查重叠
        if (this.isOverlapping(elem1, elem2)) {
          conflicts.push({
            elem1,
            elem2,
            type: 'overlap',
          })
        }
      }
    }

    return conflicts
  }

  /**
   * 检查两个元素是否重叠
   */
  private isOverlapping(elem1: CalculatedElement, elem2: CalculatedElement): boolean {
    const pos1 = elem1.calculatedPosition
    const pos2 = elem2.calculatedPosition

    return !(
      pos1.col + this.getResponsiveLayout(elem1).colSpan <= pos2.col ||
      pos2.col + this.getResponsiveLayout(elem2).colSpan <= pos1.col ||
      pos1.row + this.getResponsiveLayout(elem1).rowSpan <= pos2.row ||
      pos2.row + this.getResponsiveLayout(elem2).rowSpan <= pos1.row
    )
  }
}
