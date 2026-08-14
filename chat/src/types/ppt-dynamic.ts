/**
 * PPT动态布局系统类型定义
 * 基于内容自动计算栏目，精确控制高度分配
 */

// 内容块基础接口
export interface BaseContentBlock {
  type: string
  id?: string
  height?: number // 高度百分比（0-100），不指定则自动计算
}

// 标题块
export interface TitleBlock extends BaseContentBlock {
  type: 'title'
  text: string
  level?: 1 | 2 | 3
}

// 文本块
export interface TextBlock extends BaseContentBlock {
  type: 'text'
  content: string
  markdown?: boolean
}

// 列表块
export interface ListBlock extends BaseContentBlock {
  type: 'list'
  items: string[]
  ordered?: boolean
}

// 图片块
export interface ImageBlock extends BaseContentBlock {
  type: 'image'
  src: string
  alt: string
  caption?: string
  rounded?: boolean
}

// 图表块
export interface ChartBlock extends BaseContentBlock {
  type: 'chart'
  chartType: 'line' | 'bar' | 'pie' | 'doughnut'
  title?: string
  data: any
  options?: any
}

// 间隔块
export interface SpacerBlock extends BaseContentBlock {
  type: 'spacer'
  // height 属性从基类继承
}

// 引用块
export interface QuoteBlock extends BaseContentBlock {
  type: 'quote'
  text: string
  author?: string
}

// 联合类型：所有内容块
export type ContentBlock =
  | TitleBlock
  | TextBlock
  | ListBlock
  | ImageBlock
  | ChartBlock
  | SpacerBlock
  | QuoteBlock

// 栏目定义
export interface DynamicColumn {
  width?: number // 栏目宽度比例（如不指定则平均分配）
  gap?: number // 内容块之间的间距（像素）
  padding?: {
    // 栏目内边距
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  blocks: ContentBlock[]
}

// 动态布局幻灯片定义
export interface DynamicSlide {
  id: string
  title?: string // 页面标题（独立于内容区的固定高度区域）
  titleHeight?: number // 标题区高度（像素，默认80）
  columns?: DynamicColumn[] // 栏目数组，数量不限
  background?: string
  theme?: 'default' | 'dark' | 'accent'
}

// 演示文稿定义
export interface DynamicPresentation {
  title: string
  author?: string
  date?: string
  slides: DynamicSlide[]
}

// 计算后的布局信息
export interface CalculatedBlock {
  id: string
  type: string
  content: any
  position: {
    x: number // 绝对X坐标
    y: number // 绝对Y坐标
    width: number // 宽度
    height: number // 高度
  }
}

export interface CalculatedColumnLayout {
  x: number
  y: number
  width: number
  height: number
  blocks: CalculatedBlock[]
}

export interface CalculatedSlideLayout {
  title?: {
    text: string
    height: number
  }
  columns: CalculatedColumnLayout[]
  containerSize: {
    width: number
    height: number
  }
}
