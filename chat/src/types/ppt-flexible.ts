/**
 * PPT灵活布局系统类型定义
 * 基于布局模式 + 内容块的组合方式
 */

// 布局模式：单栏、双栏、三栏、四栏
export type LayoutMode = 'single' | 'double' | 'triple' | 'quad'

// 内容块基础接口
export interface BaseContentBlock {
  type: string
  id?: string // 可选的唯一标识
}

// 标题块
export interface TitleBlock extends BaseContentBlock {
  type: 'title'
  text: string
  level?: 1 | 2 | 3 // 标题级别
}

// 文本块
export interface TextBlock extends BaseContentBlock {
  type: 'text'
  content: string
  markdown?: boolean // 是否支持Markdown
}

// 列表块
export interface ListBlock extends BaseContentBlock {
  type: 'list'
  items: string[]
  ordered?: boolean // 是否有序列表
}

// 图片块
export interface ImageBlock extends BaseContentBlock {
  type: 'image'
  src: string
  alt: string
  caption?: string
  rounded?: boolean // 是否圆角（如头像）
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
  height?: number // 间隔高度（相对单位）
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
export interface Column {
  width?: number // 栏目宽度比例（百分比）
  align?: 'left' | 'center' | 'right' // 内容对齐
  verticalAlign?: 'top' | 'middle' | 'bottom' // 垂直对齐
  blocks: ContentBlock[] // 内容块数组
}

// 灵活布局幻灯片定义
export interface FlexibleSlide {
  id: string
  layout: LayoutMode
  columns: Column[]
  title?: string // 页面级标题（可选）
  background?: string // 背景色或图片
  padding?: string // 内边距
  gap?: string // 栏目间距
  theme?: 'default' | 'dark' | 'accent' // 主题样式
}

// 演示文稿定义
export interface FlexiblePresentation {
  title: string
  author?: string
  date?: string
  slides: FlexibleSlide[]
}

// 预设模板类型（用于快速创建）
export type PresetTemplate =
  | 'cover' // 封面
  | 'chapter' // 章节
  | 'toc' // 目录
  | 'content' // 内容
  | 'comparison' // 对比
  | 'team' // 团队
  | 'thanks' // 致谢

// 预设模板配置
export interface PresetConfig {
  template: PresetTemplate
  data: Record<string, any>
}

// 工具函数类型
export interface LayoutUtils {
  createSlide: (layout: LayoutMode, columns?: Partial<Column>[]) => FlexibleSlide
  addBlock: (column: Column, block: ContentBlock) => void
  createPreset: (preset: PresetConfig) => FlexibleSlide
}

// 计算后的元素（用于渲染）
export interface CalculatedElement {
  id: string
  type: string
  content: any
  calculatedPosition: {
    col: number
    row: number
    width: number
    height: number
    x: number
    y: number
  }
  style?: any
}

// 计算后的布局
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
