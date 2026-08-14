/**
 * PPT栅栏布局系统类型定义
 */

// PPT模板类型
export type SlideTemplate =
  | 'cover' // 封面：大标题 + 副标题 + 作者信息
  | 'chapter' // 章节页：章节编号 + 章节标题
  | 'contents' // 目录页：标题 + 目录列表
  | 'multi-column' // 万能多栏页：标题 + 1-N栏内容（融合了title-content、two-column、three-column、comparison、image-right、image-left、data-chart、multi-chart）
  | 'title-content' // 旧模板兼容：标题内容页
  | 'two-column' // 旧模板兼容：双栏页
  | 'three-column' // 旧模板兼容：三栏页
  | 'comparison' // 旧模板兼容：对比页
  | 'image-right' // 旧模板兼容：右图页
  | 'image-left' // 旧模板兼容：左图页
  | 'data-chart' // 旧模板兼容：数据图表页
  | 'multi-chart' // 旧模板兼容：多图表页
  | 'timeline-horizontal' // 横向时间轴：标题 + 时间线
  | 'quote' // 引用页：大号引用文字 + 作者
  | 'qa' // 问答页：问题 + 答案
  | 'team' // 团队介绍：标题 + 成员网格
  | 'thank-you' // 致谢页：感谢语 + 联系方式

// 元素类型
export type ElementType =
  | 'title'
  | 'subtitle'
  | 'text'
  | 'image'
  | 'chart'
  | 'list'
  | 'table'
  | 'icon-grid'
  | 'timeline'
  | 'quote'
  | 'qa'
  | 'team'

// 对齐方式
export type Alignment = 'start' | 'center' | 'end' | 'stretch'

// 响应式断点
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg'

// 栅栏布局模式
export type LayoutMode = 'grid' | 'auto' | 'manual'

// 栅栏布局配置
export interface GridLayoutConfig {
  mode: LayoutMode
  columns: number // 栅栏列数，默认12
  rowHeight: number | 'auto' // 行高，可以固定或自动
  gap: number // 栅栏间距
  padding: number | [number, number, number, number] // 内边距
}

// 响应式布局配置
export interface ResponsiveLayout {
  col?: number // 起始列
  row?: number // 起始行
  colSpan: number // 占用列数
  rowSpan: number // 占用行数
}

// 元素布局配置
export interface ElementLayout {
  // 栅栏位置（可选，自动布局时由系统计算）
  col?: number // 起始列（0-11）
  row?: number // 起始行（0-n）

  // 占用大小
  colSpan: number // 占用列数（1-12）
  rowSpan: number // 占用行数（1-n）

  // 响应式配置
  responsive?: {
    xs?: ResponsiveLayout
    sm?: ResponsiveLayout
    md?: ResponsiveLayout
    lg?: ResponsiveLayout
  }

  // 布局优先级和约束
  priority?: number // 布局优先级（1-10）
  minColSpan?: number // 最小列宽
  maxColSpan?: number // 最大列宽
  aspectRatio?: number // 宽高比约束
  alignment?: Alignment // 对齐方式
}

// 元素样式配置
export interface ElementStyle {
  padding?: number | string
  margin?: number | string
  background?: string
  border?: string
  shadow?: boolean
  borderRadius?: string
}

// 布局元素定义
export interface LayoutElement {
  id: string
  type: ElementType
  content: any // 具体内容根据类型而定
  style?: ElementStyle
}

// 布局约束
export interface LayoutConstraints {
  maxRows?: number // 最大行数限制
  preferCompact?: boolean // 是否优先紧凑布局
  alignmentGrid?: boolean // 是否对齐到网格
  avoidOverlap?: boolean // 避免重叠（默认true）
}

// 幻灯片布局定义
export interface SlideLayout {
  id: string
  title?: string
  template: SlideTemplate // 使用的模板类型
  content: SlideContent // 模板对应的内容
  theme?: string // 主题名称
  elements?: LayoutElement[] // 兼容动态布局的元素数组
}

// 各模板的内容定义
export interface SlideContent {
  // 通用字段
  title?: string
  subtitle?: string

  // 封面模板专用
  author?: string
  date?: string

  // 章节模板专用
  chapterNumber?: string
  chapterTitle?: string

  // 目录模板专用
  items?: string[]

  // 内容模板专用（已废弃，使用multi-column替代）
  text?: string

  // 万能多栏模板专用（融合了title-content、two-column、three-column、comparison、image-right、image-left、data-chart、multi-chart）
  columns?: Array<{
    title?: string // 栏标题（可选）
    text?: string // 文本内容
    items?: string[] // 列表内容
    image?: {
      // 图片内容
      src: string
      alt: string
      caption?: string
    }
    chart?: {
      // 图表内容
      type: 'line' | 'bar' | 'pie' | 'doughnut'
      title?: string
      data: any
      options?: any
    }
    type?: 'text' | 'list' | 'comparison' | 'image' | 'chart' // 内容类型，影响渲染样式
  }>

  // 双栏/对比模板专用（已废弃，使用multi-column替代）
  leftContent?: {
    title?: string
    text?: string
    items?: string[]
  }
  rightContent?: {
    title?: string
    text?: string
    items?: string[]
  }

  // 三栏模板专用（已废弃，使用multi-column替代）
  centerContent?: {
    title?: string
    text?: string
    items?: string[]
  }

  // 图片模板专用
  image?: {
    src: string
    alt: string
    caption?: string
  }

  // 图表模板专用
  chart?: ChartContent
  description?: string

  // 多图表模板专用
  charts?: Array<{
    type: 'line' | 'bar' | 'pie' | 'doughnut'
    title: string
    data: any
    position?: 'tl' | 'tr' | 'bl' | 'br'
  }>

  // 时间轴模板专用
  timeline?: Array<{
    date: string
    title: string
    description?: string
    milestone?: boolean
  }>

  // 引用模板专用
  quote?: string

  // 问答模板专用
  question?: string
  answer?: string
  showAnswer?: boolean

  // 团队模板专用
  members?: Array<{
    name: string
    role: string
    avatar?: string
    description?: string
  }>

  // 致谢模板专用
  contact?: string
}

// 计算后的元素位置
export interface CalculatedElement extends LayoutElement {
  layout?: any // 临时保留，用于兼容
  calculatedPosition: {
    col: number
    row: number
    width: number // 实际像素宽度
    height: number // 实际像素高度
    x: number // 实际X坐标
    y: number // 实际Y坐标
  }
}

// 计算后的布局结果
export interface CalculatedLayout {
  elements: CalculatedElement[]
  gridInfo: {
    columns: number
    rows: number
    columnWidth: number
    rowHeight: number
    gap: number
  }
  containerSize: {
    width: number
    height: number
  }
}

// 冲突信息
export interface LayoutConflict {
  elem1: CalculatedElement
  elem2: CalculatedElement
  type: 'overlap' | 'spacing' | 'alignment'
}

// 元素内容类型定义
export interface TitleContent {
  text: string
  level?: 1 | 2 | 3
}

export interface TextContent {
  text: string
  markdown?: boolean
}

export interface ImageContent {
  src: string
  alt: string
  caption?: string
}

export interface ChartContent {
  type: 'line' | 'bar' | 'pie' | 'doughnut'
  title: string
  data: any
  options?: any
}

export interface ListContent {
  items: string[]
  ordered?: boolean
}

export interface TableContent {
  headers: string[]
  rows: string[][]
  striped?: boolean
}

export interface IconGridContent {
  items: Array<{
    icon: string
    title: string
    description?: string
  }>
}

export interface TimelineContent {
  items: Array<{
    title: string
    description: string
    date: string
    status?: 'completed' | 'current' | 'upcoming'
  }>
}
