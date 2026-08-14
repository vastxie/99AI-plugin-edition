/**
 * PPT导出工具类
 * 基于PptxGenJS实现网页PPT导出为真实PPTX文件
 */

import PptxGenJS from 'pptxgenjs'
import type { SlideLayout, SlideContent } from '@/types/ppt-grid'
import type { DynamicSlide } from '@/types/ppt-dynamic'

type ChartPosition = {
  x: number
  y: number
  w: number
  h: number
}

type ChartCount = 1 | 2 | 3 | 4

function toChartCount(count: number): ChartCount {
  if (count === 2 || count === 3 || count === 4) {
    return count
  }

  return 1
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = Reflect.get(error, 'message')
    if (message) {
      return String(message)
    }
  }

  return String(error)
}

export class PptExporter {
  private pptx: any
  private fontFace: string

  constructor() {
    this.pptx = new PptxGenJS()
    this.fontFace = this.detectBestFont()
    this.setupDefaults()
  }

  /**
   * 智能检测最佳字体
   */
  private detectBestFont(): string {
    // 检测操作系统
    const platform = navigator.platform.toLowerCase()
    const userAgent = navigator.userAgent.toLowerCase()

    // macOS/iOS - 使用苹方
    if (platform.includes('mac') || userAgent.includes('mac')) {
      return 'PingFang SC'
    }

    // Windows - 使用微软雅黑
    if (platform.includes('win') || userAgent.includes('windows')) {
      return 'Microsoft YaHei'
    }

    // 默认使用Arial作为后备
    return 'Arial'
  }

  /**
   * 设置字体（允许用户覆盖）
   */
  setFontFace(fontFace: string) {
    this.fontFace = fontFace
  }

  /**
   * 获取当前字体
   */
  getFontFace(): string {
    return this.fontFace
  }

  /**
   * 设置默认样式和配置
   */
  private setupDefaults() {
    // 设置幻灯片尺寸为16:9
    this.pptx.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 5.625 })
    this.pptx.layout = 'LAYOUT_16x9'
  }

  /**
   * 获取文本样式（包含字体）
   */
  private getTextStyle(options: any = {}) {
    // 确保 fontFace 不被覆盖
    const { fontFace, ...otherOptions } = options
    const style = {
      ...otherOptions,
      fontFace: fontFace || this.fontFace, // 优先使用传入的fontFace，否则使用默认的
    }
    return style
  }

  /**
   * 根据模板内容创建幻灯片
   */
  async exportSlides(slides: SlideLayout[], title: string = 'AI技术前沿演示'): Promise<void> {
    try {
      // 设置演示文稿属性
      this.pptx.author = '99AI Plugin Edition contributors'
      this.pptx.company = '99AI Plugin Edition'
      this.pptx.subject = title
      this.pptx.title = title

      for (const slide of slides) {
        try {
          // 处理幻灯片
          await this.createSlide(slide)
        } catch (error) {
          // 幻灯片创建失败
          console.warn('PPT幻灯片创建失败，已跳过:', getErrorMessage(error))
          // 继续处理其他幻灯片
        }
      }

      // 生成并下载文件
      const fileName = `${title}-${Date.now()}.pptx`
      await this.pptx.writeFile({ fileName })
    } catch (error) {
      throw new Error(`PPT导出失败: ${getErrorMessage(error)}`, { cause: error })
    }
  }

  /**
   * 根据模板类型创建单个幻灯片
   */
  private async createSlide(slideData: SlideLayout) {
    const slide = this.pptx.addSlide()
    const { template, content } = slideData

    switch (template) {
      case 'cover':
        this.createCoverSlide(slide, content)
        break
      case 'chapter':
        this.createChapterSlide(slide, content)
        break
      case 'contents':
        this.createContentsSlide(slide, content)
        break
      case 'multi-column':
        await this.createMultiColumnSlide(slide, content)
        break
      case 'image-right':
        this.createImageRightSlide(slide, content)
        break
      case 'image-left':
        this.createImageLeftSlide(slide, content)
        break
      case 'data-chart':
        await this.createDataChartSlide(slide, content)
        break
      case 'thank-you':
        this.createThankYouSlide(slide, content)
        break
      case 'multi-chart':
        await this.createMultiChartSlide(slide, content)
        break
      case 'timeline-horizontal':
        this.createTimelineHorizontalSlide(slide, content)
        break
      case 'quote':
        this.createQuoteSlide(slide, content)
        break
      case 'qa':
        this.createQASlide(slide, content)
        break
      case 'team':
        this.createTeamSlide(slide, content)
        break
      // 保留旧模板的兼容性
      case 'title-content':
        await this.createLegacyTitleContentSlide(slide, content)
        break
      case 'two-column':
        await this.createLegacyTwoColumnSlide(slide, content)
        break
      case 'three-column':
        await this.createLegacyThreeColumnSlide(slide, content)
        break
      case 'comparison':
        await this.createLegacyComparisonSlide(slide, content)
        break
      default:
        await this.createMultiColumnSlide(slide, content)
    }
  }

  /**
   * 封面页
   */
  private createCoverSlide(slide: any, content: SlideContent) {
    // 主标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 1,
          y: 2,
          w: 8,
          h: 1,
          fontSize: 36,
          bold: true,
          color: '333333',
          align: 'center',
        })
      )
    }

    // 副标题
    if (content.subtitle) {
      slide.addText(
        content.subtitle,
        this.getTextStyle({
          x: 1,
          y: 3,
          w: 8,
          h: 0.8,
          fontSize: 24,
          color: '666666',
          align: 'center',
        })
      )
    }

    // 作者和日期
    if (content.author || content.date) {
      const authorText = `${content.author || ''} | ${content.date || ''}`
      slide.addText(
        authorText,
        this.getTextStyle({
          x: 1,
          y: 4.5,
          w: 8,
          h: 0.5,
          fontSize: 16,
          color: '888888',
          align: 'center',
        })
      )
    }
  }

  /**
   * 章节页
   */
  private createChapterSlide(slide: any, content: SlideContent) {
    // 章节编号
    if (content.chapterNumber) {
      slide.addText(
        content.chapterNumber,
        this.getTextStyle({
          x: 1,
          y: 2,
          w: 8,
          h: 0.8,
          fontSize: 24,
          color: '666666',
          align: 'center',
        })
      )
    }

    // 章节标题
    if (content.chapterTitle) {
      slide.addText(
        content.chapterTitle,
        this.getTextStyle({
          x: 1,
          y: 2.8,
          w: 8,
          h: 1,
          fontSize: 32,
          bold: true,
          color: '333333',
          align: 'center',
        })
      )
    }
  }

  /**
   * 目录页
   */
  private createContentsSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 目录列表
    if (content.items && content.items.length > 0) {
      const listText = content.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
      slide.addText(
        listText,
        this.getTextStyle({
          x: 0.5,
          y: 1.5,
          w: 4.5,
          h: 3.5,
          fontSize: 18,
          color: '333333',
          bullet: { type: 'number' },
        })
      )
    }

    // 图片
    if (content.image?.src) {
      try {
        // 处理图片路径
        const imagePath = content.image.src
        // 添加图片

        // 4.0版本支持URL图片
        const imageOptions: any = {
          x: 5.5,
          y: 1.5,
          w: 4,
          h: 3,
        }

        if (imagePath.startsWith('http')) {
          // 网络图片使用path属性
          imageOptions.path = imagePath
        } else if (imagePath.startsWith('data:')) {
          // Base64图片使用data属性
          imageOptions.data = imagePath
        } else {
          // 本地图片路径
          imageOptions.path = imagePath
        }

        // 添加sizing选项（v4.0.1）
        imageOptions.sizing = { type: 'contain', w: 4, h: 3 }

        slide.addImage(imageOptions)

        // 添加图片说明
        if (content.image.caption) {
          slide.addText(
            content.image.caption,
            this.getTextStyle({
              x: 5.5,
              y: 4.5,
              w: 4,
              h: 0.3,
              fontSize: 12,
              color: '666666',
              align: 'center',
            })
          )
        }
      } catch {
        slide.addText(
          `图片：${content.image.caption || '图片内容'}\n\n（请在PowerPoint中插入实际图片）`,
          this.getTextStyle({
            x: 5.5,
            y: 1.5,
            w: 4,
            h: 3,
            fontSize: 14,
            color: '666666',
            align: 'center',
            valign: 'middle',
            border: { pt: 1, color: 'CCCCCC' },
          })
        )
      }
    }
  }

  /**
   * 多栏页（融合了title-content、two-column、three-column、comparison）
   */
  private async createMultiColumnSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 处理多栏内容
    const columns = content.columns || []
    const columnCount = columns.length

    if (columnCount === 0) {
      // 如果没有columns定义，回退到使用text字段（兼容旧格式）
      if (content.text) {
        slide.addText(
          content.text,
          this.getTextStyle({
            x: 0.5,
            y: 1.5,
            w: 9,
            h: 3.5,
            fontSize: 16,
            color: '333333',
            valign: 'top',
          })
        )
      }
      return
    }

    // 计算每栏的宽度和位置
    const columnWidth = 9 / columnCount
    const startY = content.title ? 1.5 : 0.5
    const availableHeight = content.title ? 3.5 : 4.5

    for (const [index, column] of columns.entries()) {
      const columnX = 0.5 + index * columnWidth
      let currentY = startY

      // 栏标题
      if (column.title) {
        slide.addText(
          column.title,
          this.getTextStyle({
            x: columnX,
            y: currentY,
            w: columnWidth - 0.2,
            h: 0.6,
            fontSize: 20,
            bold: true,
            color: '333333',
          })
        )
        currentY += 0.7
      }

      // 栏内容
      const contentHeight = availableHeight - (column.title ? 0.7 : 0)

      if (column.image) {
        // 图片内容
        try {
          const imageOptions: any = {
            x: columnX,
            y: currentY,
            w: columnWidth - 0.2,
            h: contentHeight - (column.image.caption ? 0.4 : 0.1),
            sizing: {
              type: 'contain',
              w: columnWidth - 0.2,
              h: contentHeight - (column.image.caption ? 0.4 : 0.1),
            },
          }

          if (column.image.src.startsWith('http') || column.image.src.startsWith('https')) {
            imageOptions.path = column.image.src
          } else if (column.image.src.startsWith('data:')) {
            imageOptions.data = column.image.src
          } else {
            imageOptions.path = column.image.src
          }

          slide.addImage(imageOptions)

          // 添加图片说明
          if (column.image.caption) {
            slide.addText(
              column.image.caption,
              this.getTextStyle({
                x: columnX,
                y: currentY + contentHeight - 0.4,
                w: columnWidth - 0.2,
                h: 0.3,
                fontSize: 10,
                color: '888888',
                align: 'center',
              })
            )
          }
        } catch {
          // 图片加载失败，显示占位符
          slide.addText(
            `[图片: ${column.image.alt || '图片加载失败'}]${column.image.caption ? '\n' + column.image.caption : ''}`,
            this.getTextStyle({
              x: columnX,
              y: currentY,
              w: columnWidth - 0.2,
              h: contentHeight,
              fontSize: 12,
              color: '#999999',
              align: 'center',
              valign: 'middle',
              fill: { color: 'F5F5F5' },
            })
          )
        }
      } else if (column.chart) {
        // 图表内容
        try {
          await this.addChartToSlide(slide, column.chart, {
            x: columnX,
            y: currentY,
            w: columnWidth - 0.2,
            h: contentHeight - (column.chart.title ? 0.4 : 0),
          })

          // 添加图表标题
          if (column.chart.title) {
            slide.addText(
              column.chart.title,
              this.getTextStyle({
                x: columnX,
                y: currentY + contentHeight - 0.4,
                w: columnWidth - 0.2,
                h: 0.4,
                fontSize: 12,
                bold: true,
                color: '333333',
                align: 'center',
              })
            )
          }
        } catch {
          // 图表创建失败，使用文本格式
          const chartText = `图表: ${column.chart.title || '数据图表'}\n\n${this.formatChartData(column.chart.data)}`
          slide.addText(
            chartText,
            this.getTextStyle({
              x: columnX,
              y: currentY,
              w: columnWidth - 0.2,
              h: contentHeight,
              fontSize: 10,
              color: '555555',
              align: 'left',
              fill: { color: 'F8F9FA' },
            })
          )
        }
      } else if (column.text) {
        // 文本内容
        slide.addText(
          column.text,
          this.getTextStyle({
            x: columnX,
            y: currentY,
            w: columnWidth - 0.2,
            h: contentHeight,
            fontSize: column.type === 'comparison' ? 14 : 16,
            color: '333333',
            valign: 'top',
          })
        )
      } else if (column.items && column.items.length > 0) {
        // 列表内容
        const listText = column.items.join('\n')
        slide.addText(
          listText,
          this.getTextStyle({
            x: columnX,
            y: currentY,
            w: columnWidth - 0.2,
            h: contentHeight,
            fontSize: column.type === 'comparison' ? 14 : 16,
            color: '333333',
            bullet: column.type === 'comparison' ? true : false,
            valign: 'top',
          })
        )
      }
    }
  }

  /**
   * 标题内容页（已废弃，保留兼容性）
   */
  private async createLegacyTitleContentSlide(slide: any, content: SlideContent) {
    // 转换为multi-column格式
    const convertedContent = {
      ...content,
      columns: content.text ? [{ text: content.text, type: 'text' as const }] : [],
    }
    await this.createMultiColumnSlide(slide, convertedContent)
  }

  /**
   * 双栏页（已废弃，保留兼容性）
   */
  private async createLegacyTwoColumnSlide(slide: any, content: SlideContent) {
    // 转换为multi-column格式
    const columns = []
    if (content.leftContent) {
      columns.push({
        title: content.leftContent.title,
        text: content.leftContent.text,
        items: content.leftContent.items,
        type: 'text' as const,
      })
    }
    if (content.rightContent) {
      columns.push({
        title: content.rightContent.title,
        text: content.rightContent.text,
        items: content.rightContent.items,
        type: 'text' as const,
      })
    }

    const convertedContent = {
      ...content,
      columns,
    }
    await this.createMultiColumnSlide(slide, convertedContent)
  }

  /**
   * 图文混排右图
   */
  private createImageRightSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 左侧文本
    if (content.text) {
      slide.addText(
        content.text,
        this.getTextStyle({
          x: 0.5,
          y: 1.5,
          w: 4.5,
          h: 3.5,
          fontSize: 16,
          color: '333333',
          valign: 'top',
        })
      )
    }

    // 右侧图片
    if (content.image?.src) {
      try {
        const imagePath = content.image.src
        const imageOptions: any = {
          x: 5.5,
          y: 1.5,
          w: 4,
          h: 3,
          sizing: { type: 'contain', w: 4, h: 3 },
        }

        if (imagePath.startsWith('http') || imagePath.startsWith('https')) {
          imageOptions.path = imagePath
        } else if (imagePath.startsWith('data:')) {
          imageOptions.data = imagePath
        } else {
          imageOptions.path = imagePath
        }

        slide.addImage(imageOptions)
      } catch {
        slide.addText(
          `图片：${content.image.caption || '图片'}\n\n（请手动插入）`,
          this.getTextStyle({
            x: 5.5,
            y: 1.5,
            w: 4,
            h: 3,
            fontSize: 14,
            color: '666666',
            align: 'center',
            valign: 'middle',
            border: { pt: 1, color: 'CCCCCC' },
          })
        )
      }
    }
  }

  /**
   * 图文混排左图
   */
  private createImageLeftSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 左侧图片
    if (content.image?.src) {
      try {
        const imagePath = content.image.src
        const imageOptions: any = {
          x: 0.5,
          y: 1.5,
          w: 4,
          h: 3,
          sizing: { type: 'contain', w: 4, h: 3 },
        }

        if (imagePath.startsWith('http') || imagePath.startsWith('https')) {
          imageOptions.path = imagePath
        } else if (imagePath.startsWith('data:')) {
          imageOptions.data = imagePath
        } else {
          imageOptions.path = imagePath
        }

        slide.addImage(imageOptions)
      } catch {
        slide.addText(
          `图片：${content.image.caption || '图片'}\n\n（请手动插入）`,
          this.getTextStyle({
            x: 0.5,
            y: 1.5,
            w: 4,
            h: 3,
            fontSize: 14,
            color: '666666',
            align: 'center',
            valign: 'middle',
            border: { pt: 1, color: 'CCCCCC' },
          })
        )
      }
    }

    // 右侧文本
    if (content.text) {
      slide.addText(
        content.text,
        this.getTextStyle({
          x: 5,
          y: 1.5,
          w: 4.5,
          h: 3.5,
          fontSize: 16,
          color: '333333',
          valign: 'top',
        })
      )
    }
  }

  /**
   * 对比页（已废弃，保留兼容性）
   */
  private async createLegacyComparisonSlide(slide: any, content: SlideContent) {
    // 转换为multi-column格式
    const columns = []
    if (content.leftContent) {
      columns.push({
        title: content.leftContent.title,
        text: content.leftContent.text,
        items: content.leftContent.items,
        type: 'comparison' as const,
      })
    }
    if (content.rightContent) {
      columns.push({
        title: content.rightContent.title,
        text: content.rightContent.text,
        items: content.rightContent.items,
        type: 'comparison' as const,
      })
    }

    const convertedContent = {
      ...content,
      columns,
    }
    await this.createMultiColumnSlide(slide, convertedContent)
  }

  /**
   * 数据图表页
   */
  private async createDataChartSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 图表 - 使用4.0版本的正确格式
    if (content.chart) {
      try {
        await this.addChartToSlide(slide, content.chart)
      } catch {
        slide.addText(
          `图表：${content.chart.title || '数据图表'}\n\n（请在PowerPoint中手动插入图表）\n\n图表类型：${content.chart.type}\n数据点：${content.chart.data?.labels?.join(', ') || '无'}`,
          this.getTextStyle({
            x: 0.5,
            y: 1.5,
            w: 6.5,
            h: 3.5,
            fontSize: 16,
            color: '666666',
            align: 'center',
            valign: 'middle',
            border: { pt: 1, color: 'CCCCCC' },
          })
        )
      }
    }

    // 描述文字
    if (content.description) {
      slide.addText(
        content.description,
        this.getTextStyle({
          x: 7.5,
          y: 1.5,
          w: 2,
          h: 3.5,
          fontSize: 14,
          color: '333333',
          valign: 'top',
        })
      )
    }
  }

  /**
   * 添加图表到幻灯片（4.0.1版本API）
   */
  private async addChartToSlide(slide: any, chartData: any, position?: ChartPosition) {
    const { type, data, title, position: chartDataPosition } = chartData

    // 正在处理图表

    if (!data || !data.labels || !data.datasets || !data.datasets[0]) {
      throw new Error('图表数据格式不正确')
    }

    const dataset = data.datasets[0]
    const labels = data.labels
    const values = dataset.data

    // 确保数据是有效的
    if (!Array.isArray(labels) || !Array.isArray(values)) {
      throw new Error('图表数据必须是数组格式')
    }

    if (labels.length === 0 || values.length === 0) {
      throw new Error('图表数据不能为空')
    }

    if (labels.length !== values.length) {
      throw new Error(`标签和数据长度不匹配: labels(${labels.length}) vs values(${values.length})`)
    }

    // 使用提供的位置或默认位置
    const chartPosition = chartDataPosition || position || { x: 0.5, y: 1.5, w: 6.5, h: 3.5 }

    try {
      // 使用简化的数据格式，避免复杂的数据结构
      // 尝试添加真实图表

      if (type === 'pie' || type === 'doughnut') {
        // 饼图使用正确的格式：数组包含一个对象
        const pieData = [
          {
            name: title || '数据系列',
            labels: labels.map(String),
            values: values.map(v => Number(v) || 0),
          },
        ]

        slide.addChart('pie', pieData, {
          ...chartPosition,
          title: title || '数据图表',
          showTitle: true,
          showLegend: true,
          legendPos: 'r',
          showPercent: true,
        })

        // 饼图添加成功
      } else {
        // 折线图/柱状图使用官方示例格式
        const seriesChartData = [
          {
            name: dataset.label || '数据系列',
            labels: labels.map(String),
            values: values.map(v => Number(v) || 0),
          },
        ]

        // 确定图表类型
        const chartType = type === 'line' ? 'line' : 'bar'

        slide.addChart(chartType, seriesChartData, {
          ...chartPosition,
          title: title || '数据图表',
          showTitle: true,
          showLegend: true,
          showValue: false,
        })

        // 图表添加成功
      }
    } catch {
      // 图表添加失败，降级到表格

      // 降级方案：创建一个表格来显示图表数据
      let tableText = `${title || '数据图表'}\n\n`

      if (type === 'pie' || type === 'doughnut') {
        // 饼图数据表格
        tableText += '类别 | 数值 | 占比\n'
        tableText += '---|---|---\n'
        const total = values.reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        labels.forEach((label: string, i: number) => {
          const value = Number(values[i]) || 0
          const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
          tableText += `${label} | ${value} | ${percent}%\n`
        })
      } else {
        // 柱状图/折线图数据表格
        tableText += labels.map((l: string) => l).join(' | ') + '\n'
        tableText += labels.map(() => '---').join(' | ') + '\n'
        tableText += values.map((v: any) => Number(v) || 0).join(' | ') + '\n'
      }

      tableText += '\n（图表生成失败，请在PowerPoint中手动创建）'

      // 添加数据表格作为文本
      slide.addText(
        tableText,
        this.getTextStyle({
          ...chartPosition,
          fontSize: 12,
          color: '666666',
          align: 'left',
          valign: 'top',
          // 不覆盖默认字体，让它使用系统字体
        })
      )

      // 已降级为数据表格
    }
  }

  /**
   * 致谢页
   */
  private createThankYouSlide(slide: any, content: SlideContent) {
    // 致谢标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 1,
          y: 2,
          w: 8,
          h: 1,
          fontSize: 36,
          bold: true,
          color: '333333',
          align: 'center',
        })
      )
    }

    // 联系信息
    if (content.contact) {
      slide.addText(
        content.contact,
        this.getTextStyle({
          x: 1,
          y: 3.5,
          w: 8,
          h: 0.8,
          fontSize: 18,
          color: '666666',
          align: 'center',
        })
      )
    }
  }

  /**
   * 三栏页（已废弃，保留兼容性）
   */
  private async createLegacyThreeColumnSlide(slide: any, content: SlideContent) {
    // 转换为multi-column格式
    const columns = []
    if (content.leftContent) {
      columns.push({
        title: content.leftContent.title,
        text: content.leftContent.text,
        items: content.leftContent.items,
        type: 'text' as const,
      })
    }
    if (content.centerContent) {
      columns.push({
        title: content.centerContent.title,
        text: content.centerContent.text,
        items: content.centerContent.items,
        type: 'text' as const,
      })
    }
    if (content.rightContent) {
      columns.push({
        title: content.rightContent.title,
        text: content.rightContent.text,
        items: content.rightContent.items,
        type: 'text' as const,
      })
    }

    const convertedContent = {
      ...content,
      columns,
    }
    await this.createMultiColumnSlide(slide, convertedContent)
  }

  /**
   * 多图表页
   */
  private async createMultiChartSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 多图表布局
    if (content.charts && content.charts.length > 0) {
      const chartCount = toChartCount(Math.min(content.charts.length, 4))

      // 定义位置映射
      const positions: Record<ChartCount, ChartPosition[]> = {
        1: [{ x: 2, y: 1.5, w: 6, h: 3.5 }],
        2: [
          { x: 0.5, y: 1.5, w: 4.5, h: 3.5 },
          { x: 5.5, y: 1.5, w: 4, h: 3.5 },
        ],
        3: [
          { x: 0.5, y: 1.5, w: 4.5, h: 1.7 },
          { x: 5.5, y: 1.5, w: 4, h: 1.7 },
          { x: 2.75, y: 3.3, w: 4.5, h: 1.7 },
        ],
        4: [
          { x: 0.5, y: 1.5, w: 4.5, h: 1.7 },
          { x: 5.5, y: 1.5, w: 4, h: 1.7 },
          { x: 0.5, y: 3.3, w: 4.5, h: 1.7 },
          { x: 5.5, y: 3.3, w: 4, h: 1.7 },
        ],
      }

      const layout = positions[chartCount] || positions[1]

      for (let i = 0; i < chartCount; i++) {
        const chart = content.charts[i]
        const pos = layout[i]

        try {
          await this.addChartToSlide(slide, {
            ...chart,
            position: pos,
          })
        } catch {
          slide.addText(
            `图表${i + 1}: ${chart.title}`,
            this.getTextStyle({
              ...pos,
              fontSize: 14,
              color: '666666',
              align: 'center',
              valign: 'middle',
              border: { pt: 1, color: 'CCCCCC' },
            })
          )
        }
      }
    }
  }

  /**
   * 横向时间轴页
   */
  private createTimelineHorizontalSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 时间轴
    if (content.timeline && content.timeline.length > 0) {
      const timelineY = 2.8
      const lineStartX = 1
      const lineEndX = 9
      const lineWidth = lineEndX - lineStartX

      // 画时间线
      slide.addShape('line', {
        x: lineStartX,
        y: timelineY,
        w: lineWidth,
        h: 0,
        line: { color: '333333', width: 2 },
      })

      // 添加时间点
      const pointCount = content.timeline.length
      const spacing = lineWidth / (pointCount - 1)

      content.timeline.forEach((item, index) => {
        const x = lineStartX + index * spacing

        // 时间点圆圈
        slide.addShape('ellipse', {
          x: x - 0.15,
          y: timelineY - 0.15,
          w: 0.3,
          h: 0.3,
          fill: item.milestone ? 'FF6B6B' : '4169E1',
          line: { color: 'FFFFFF', width: 2 },
        })

        // 日期
        slide.addText(
          item.date,
          this.getTextStyle({
            x: x - 0.8,
            y: timelineY - 0.8,
            w: 1.6,
            h: 0.4,
            fontSize: 12,
            bold: item.milestone,
            color: '333333',
            align: 'center',
          })
        )

        // 标题
        slide.addText(
          item.title,
          this.getTextStyle({
            x: x - 1,
            y: timelineY + 0.3,
            w: 2,
            h: 0.5,
            fontSize: 14,
            bold: true,
            color: '333333',
            align: 'center',
          })
        )

        // 描述
        if (item.description) {
          slide.addText(
            item.description,
            this.getTextStyle({
              x: x - 1.2,
              y: timelineY + 0.8,
              w: 2.4,
              h: 1,
              fontSize: 11,
              color: '666666',
              align: 'center',
              valign: 'top',
            })
          )
        }
      })
    }
  }

  /**
   * 引用页
   */
  private createQuoteSlide(slide: any, content: SlideContent) {
    // 背景装饰 - 大引号
    slide.addText('"', {
      x: 1,
      y: 1.5,
      w: 1,
      h: 1,
      fontSize: 72,
      color: 'E0E0E0',
      bold: true,
    })

    // 引用文字
    if (content.quote) {
      slide.addText(content.quote, {
        x: 1.5,
        y: 2,
        w: 7,
        h: 2,
        fontSize: 24,
        color: '333333',
        align: 'center',
        valign: 'middle',
        italic: true,
      })
    }

    // 作者
    if (content.author) {
      slide.addText(`— ${content.author}`, {
        x: 2,
        y: 4,
        w: 6,
        h: 0.5,
        fontSize: 18,
        color: '666666',
        align: 'right',
      })
    }
  }

  /**
   * 问答页
   */
  private createQASlide(slide: any, content: SlideContent) {
    // 问题
    if (content.question) {
      // Q标识
      slide.addText(
        'Q',
        this.getTextStyle({
          x: 0.5,
          y: 1,
          w: 1,
          h: 1,
          fontSize: 48,
          bold: true,
          color: '4169E1',
          align: 'center',
        })
      )

      // 问题文本
      slide.addText(
        content.question,
        this.getTextStyle({
          x: 1.5,
          y: 1,
          w: 8,
          h: 1.5,
          fontSize: 20,
          bold: true,
          color: '333333',
          valign: 'middle',
        })
      )
    }

    // 答案（如果显示）
    if (content.answer && content.showAnswer !== false) {
      // A标识
      slide.addText(
        'A',
        this.getTextStyle({
          x: 0.5,
          y: 3,
          w: 1,
          h: 1,
          fontSize: 48,
          bold: true,
          color: 'FF6B6B',
          align: 'center',
        })
      )

      // 答案文本
      slide.addText(
        content.answer,
        this.getTextStyle({
          x: 1.5,
          y: 3,
          w: 8,
          h: 2,
          fontSize: 18,
          color: '333333',
          valign: 'top',
        })
      )
    }
  }

  /**
   * 团队页
   */
  private createTeamSlide(slide: any, content: SlideContent) {
    // 标题
    if (content.title) {
      slide.addText(
        content.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.5,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
        })
      )
    }

    // 团队成员网格 - 固定3列布局
    if (content.members && content.members.length > 0) {
      const memberCount = Math.min(content.members.length, 3) // 最多显示3个成员
      const cols = 3
      const rows = 1

      const containerWidth = 9
      const containerHeight = 3.5
      const gap = 0.3
      const cardWidth = (containerWidth - (cols - 1) * gap) / cols
      const cardHeight = (containerHeight - (rows - 1) * gap) / rows

      content.members.slice(0, memberCount).forEach((member, index) => {
        const row = Math.floor(index / cols)
        const col = index % cols

        const x = 0.5 + col * (cardWidth + gap)
        const y = 1.5 + row * (cardHeight + gap)

        // 成员卡片背景
        slide.addShape('rect', {
          x,
          y,
          w: cardWidth,
          h: cardHeight,
          fill: 'F5F5F5',
          line: { color: 'E0E0E0', width: 1 },
        })

        // 头像占位符或图片
        if (member.avatar) {
          try {
            const avatarSize = Math.min(cardWidth, cardHeight) * 0.4
            const avatarX = x + (cardWidth - avatarSize) / 2
            const avatarY = y + 0.2

            const imageOptions: any = {
              x: avatarX,
              y: avatarY,
              w: avatarSize,
              h: avatarSize,
              sizing: { type: 'cover', w: avatarSize, h: avatarSize },
            }

            if (member.avatar.startsWith('http') || member.avatar.startsWith('https')) {
              imageOptions.path = member.avatar
            } else if (member.avatar.startsWith('data:')) {
              imageOptions.data = member.avatar
            } else {
              imageOptions.path = member.avatar
            }

            slide.addImage(imageOptions)
          } catch {
            // 使用圆形占位符
            const avatarSize = Math.min(cardWidth, cardHeight) * 0.4
            slide.addShape('ellipse', {
              x: x + (cardWidth - avatarSize) / 2,
              y: y + 0.2,
              w: avatarSize,
              h: avatarSize,
              fill: 'CCCCCC',
            })
          }
        } else {
          // 使用圆形占位符
          const avatarSize = Math.min(cardWidth, cardHeight) * 0.4
          slide.addShape('ellipse', {
            x: x + (cardWidth - avatarSize) / 2,
            y: y + 0.2,
            w: avatarSize,
            h: avatarSize,
            fill: 'CCCCCC',
          })
        }

        // 姓名
        slide.addText(
          member.name,
          this.getTextStyle({
            x,
            y: y + cardHeight * 0.5,
            w: cardWidth,
            h: 0.3,
            fontSize: 14,
            bold: true,
            color: '333333',
            align: 'center',
          })
        )

        // 职位
        slide.addText(
          member.role,
          this.getTextStyle({
            x,
            y: y + cardHeight * 0.65,
            w: cardWidth,
            h: 0.25,
            fontSize: 12,
            color: '666666',
            align: 'center',
          })
        )

        // 描述（如果有）
        if (member.description) {
          slide.addText(
            member.description,
            this.getTextStyle({
              x: x + 0.1,
              y: y + cardHeight * 0.8,
              w: cardWidth - 0.2,
              h: cardHeight * 0.15,
              fontSize: 10,
              color: '888888',
              align: 'center',
            })
          )
        }
      })
    }
  }

  /**
   * 导出动态布局幻灯片
   */
  async exportDynamicSlides(
    slides: DynamicSlide[],
    title: string = 'AI技术前沿演示'
  ): Promise<void> {
    try {
      // 设置演示文稿属性
      this.pptx.author = '99AI Plugin Edition contributors'
      this.pptx.company = '99AI Plugin Edition'
      this.pptx.subject = title
      this.pptx.title = title

      for (const slide of slides) {
        try {
          // 处理动态幻灯片
          await this.createDynamicSlide(slide)
        } catch (error) {
          // 动态幻灯片创建失败
          console.warn('动态PPT幻灯片创建失败，已跳过:', getErrorMessage(error))
          // 继续处理其他幻灯片
        }
      }

      // 生成并下载文件
      const fileName = `${title}-${Date.now()}.pptx`
      await this.pptx.writeFile({ fileName })
    } catch (error) {
      throw new Error(`动态PPT导出失败: ${getErrorMessage(error)}`, { cause: error })
    }
  }

  /**
   * 创建动态布局幻灯片
   */
  private async createDynamicSlide(slideData: DynamicSlide) {
    const slide = this.pptx.addSlide()

    // 检查是否是封面页或章节页（单栏居中布局）
    const isCenterLayout = this.isCenterLayout(slideData)

    if (isCenterLayout) {
      // 封面页或章节页 - 垂直居中布局
      await this.createCenterLayoutSlide(slide, slideData)
    } else {
      // 普通页面 - 标准布局
      await this.createStandardLayoutSlide(slide, slideData)
    }
  }

  /**
   * 判断是否是居中布局（封面页、章节页、致谢页）
   */
  private isCenterLayout(slideData: DynamicSlide): boolean {
    if (!slideData.columns || slideData.columns.length !== 1) return false

    const column = slideData.columns[0]
    const blocks = column.blocks || []

    // 检查是否主要由标题和spacer组成，或者包含quote
    const titleBlocks = blocks.filter(b => b.type === 'title')
    const spacerBlocks = blocks.filter(b => b.type === 'spacer')
    const quoteBlocks = blocks.filter(b => b.type === 'quote')
    const otherBlocks = blocks.filter(
      b => b.type !== 'title' && b.type !== 'spacer' && b.type !== 'text' && b.type !== 'quote'
    )

    // 如果有quote块，也认为是居中布局
    return (
      (titleBlocks.length > 0 && spacerBlocks.length >= 2 && otherBlocks.length === 0) ||
      (quoteBlocks.length > 0 && spacerBlocks.length >= 2)
    )
  }

  /**
   * 创建居中布局幻灯片（封面、章节、致谢）
   */
  private async createCenterLayoutSlide(slide: any, slideData: DynamicSlide) {
    const blocks = slideData.columns?.[0]?.blocks || []

    // 过滤出非spacer的内容块
    const contentBlocks = blocks.filter(b => b.type !== 'spacer')

    // 垂直居中布局
    const startY = 1.5 // 从中间开始
    let currentY = startY

    for (const block of contentBlocks) {
      switch (block.type) {
        case 'title':
          const isMainTitle = block.level === 1 || !block.level
          slide.addText(
            block.text,
            this.getTextStyle({
              x: 1,
              y: currentY,
              w: 8,
              h: isMainTitle ? 1.2 : 0.8,
              fontSize: isMainTitle ? 44 : 32,
              bold: true,
              color: '333333',
              align: 'center',
              valign: 'middle',
            })
          )
          currentY += isMainTitle ? 1.5 : 1.0
          break

        case 'text':
          slide.addText(
            block.content,
            this.getTextStyle({
              x: 1,
              y: currentY,
              w: 8,
              h: 0.6,
              fontSize: 18,
              color: '666666',
              align: 'center',
              valign: 'middle',
            })
          )
          currentY += 0.8
          break

        case 'quote':
          // 引用文本 - 居中显示
          slide.addText(
            `"${block.text}"`,
            this.getTextStyle({
              x: 1,
              y: currentY,
              w: 8,
              h: 1.5,
              fontSize: 24,
              italic: true,
              color: '555555',
              align: 'center',
              valign: 'middle',
            })
          )
          currentY += 1.8

          // 作者 - 居中显示
          if (block.author) {
            slide.addText(
              `— ${block.author}`,
              this.getTextStyle({
                x: 1,
                y: currentY,
                w: 8,
                h: 0.6,
                fontSize: 16,
                color: '777777',
                align: 'center',
                valign: 'middle',
              })
            )
            currentY += 0.8
          }
          break
      }
    }
  }

  /**
   * 创建标准布局幻灯片
   */
  private async createStandardLayoutSlide(slide: any, slideData: DynamicSlide) {
    // 添加页面标题
    if (slideData.title) {
      slide.addText(
        slideData.title,
        this.getTextStyle({
          x: 0.5,
          y: 0.2,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '333333',
          align: 'center',
        })
      )
    }

    // 处理栏目内容
    if (slideData.columns && slideData.columns.length > 0) {
      const titleHeight = slideData.title ? 1.2 : 0.2
      const contentHeight = 5.625 - titleHeight - 0.4
      const columnCount = slideData.columns.length
      const columnWidth = columnCount === 1 ? 8.5 : 9 / columnCount
      const startX = columnCount === 1 ? 0.75 : 0.5

      for (let colIndex = 0; colIndex < slideData.columns.length; colIndex++) {
        const column = slideData.columns[colIndex]
        const columnX = startX + colIndex * columnWidth
        let currentY = titleHeight

        // 计算当前栏的内容块数量（不包括spacer）
        const contentBlocks = column.blocks?.filter(b => b.type !== 'spacer') || []
        const blockCount = contentBlocks.length

        for (const block of column.blocks || []) {
          if (block.type === 'spacer') continue

          // 为每栏独立计算高度，避免多栏互相影响
          let blockHeight
          if (block.height) {
            // 使用指定的百分比高度
            blockHeight = (contentHeight * block.height) / 100
          } else {
            // 根据当前栏的内容数量分配高度
            blockHeight = this.calculateOptimalBlockHeight(
              block,
              contentHeight,
              blockCount,
              slideData.columns?.length || 1
            )
          }

          try {
            switch (block.type) {
              case 'title':
                slide.addText(
                  block.text,
                  this.getTextStyle({
                    x: columnX,
                    y: currentY,
                    w: columnWidth - 0.2,
                    h: blockHeight,
                    fontSize: block.level === 1 ? 24 : block.level === 2 ? 20 : 16,
                    bold: true,
                    color: '333333',
                    align: 'center',
                  })
                )
                break

              case 'text':
                slide.addText(
                  block.content,
                  this.getTextStyle({
                    x: columnX,
                    y: currentY,
                    w: columnWidth - 0.2,
                    h: blockHeight,
                    fontSize: 14,
                    color: '555555',
                    align: 'left',
                  })
                )
                break

              case 'list':
                const listText =
                  block.items
                    ?.map((item: string, index: number) =>
                      block.ordered ? `${index + 1}. ${item}` : `• ${item}`
                    )
                    .join('\n') || ''

                slide.addText(
                  listText,
                  this.getTextStyle({
                    x: columnX,
                    y: currentY,
                    w: columnWidth - 0.2,
                    h: blockHeight,
                    fontSize: 16, // 从12增加到16
                    color: '555555',
                    align: 'left',
                  })
                )
                break

              case 'quote':
                // 引用文本
                slide.addText(
                  `"${block.text}"`,
                  this.getTextStyle({
                    x: columnX,
                    y: currentY,
                    w: columnWidth - 0.2,
                    h: blockHeight * 0.7,
                    fontSize: 18,
                    italic: true,
                    color: '666666',
                    align: 'center',
                  })
                )

                // 作者
                if (block.author) {
                  slide.addText(
                    `— ${block.author}`,
                    this.getTextStyle({
                      x: columnX,
                      y: currentY + blockHeight * 0.7,
                      w: columnWidth - 0.2,
                      h: blockHeight * 0.3,
                      fontSize: 14,
                      color: '888888',
                      align: 'center',
                    })
                  )
                }
                break

              case 'image':
                try {
                  const imageWidth = columnWidth - 0.2
                  const availableHeight = blockHeight - (block.caption ? 0.4 : 0.1)

                  // 计算合适的图片尺寸，保持宽高比
                  let imageHeight
                  if (block.rounded) {
                    // 圆形头像 - 使用正方形，取较小的尺寸
                    const size = Math.min(imageWidth, availableHeight)
                    imageHeight = size
                    // 居中显示圆形图片
                    slide.addImage({
                      path: block.src,
                      x: columnX + (imageWidth - size) / 2,
                      y: currentY + (availableHeight - size) / 2,
                      w: size,
                      h: size,
                      rounding: true,
                    })
                  } else {
                    // 普通图片 - 使用更合理的宽高比
                    // 根据列数调整默认宽高比
                    let aspectRatio
                    if (slideData.columns && slideData.columns.length > 2) {
                      // 多列布局使用更方的比例
                      aspectRatio = 4 / 3
                    } else {
                      // 单列或双列使用16:9
                      aspectRatio = 16 / 9
                    }

                    const calculatedHeight = imageWidth / aspectRatio

                    if (calculatedHeight <= availableHeight) {
                      // 按宽度适配
                      imageHeight = calculatedHeight
                    } else {
                      // 按高度适配，但给图片更多空间
                      imageHeight = Math.min(availableHeight, imageWidth * 0.8) // 限制最大高度为宽度的80%
                    }

                    slide.addImage({
                      path: block.src,
                      x: columnX,
                      y: currentY,
                      w: imageWidth,
                      h: imageHeight,
                      sizing: { type: 'contain', w: imageWidth, h: imageHeight },
                    })
                  }

                  // 添加图片说明
                  if (block.caption) {
                    slide.addText(
                      block.caption,
                      this.getTextStyle({
                        x: columnX,
                        y: currentY + imageHeight + 0.1,
                        w: columnWidth - 0.2,
                        h: 0.3,
                        fontSize: 10,
                        color: '888888',
                        align: 'center',
                      })
                    )
                  }
                } catch {
                  // 图片加载失败，显示占位符
                  slide.addText(
                    `[图片: ${block.alt || '图片加载失败'}]${block.caption ? '\n' + block.caption : ''}`,
                    this.getTextStyle({
                      x: columnX,
                      y: currentY,
                      w: columnWidth - 0.2,
                      h: blockHeight,
                      fontSize: 12,
                      color: '#999999',
                      align: 'center',
                      valign: 'middle',
                      fill: { color: 'F5F5F5' },
                    })
                  )
                }
                break

              case 'chart':
                try {
                  // 尝试创建真实图表
                  await this.addChartToSlideWithPosition(slide, block, {
                    x: columnX,
                    y: currentY,
                    w: columnWidth - 0.2,
                    h: blockHeight - 0.4,
                  })

                  // 添加图表标题
                  if (block.title) {
                    slide.addText(
                      block.title,
                      this.getTextStyle({
                        x: columnX,
                        y: currentY + blockHeight - 0.4,
                        w: columnWidth - 0.2,
                        h: 0.4,
                        fontSize: 12,
                        bold: true,
                        color: '333333',
                        align: 'center',
                      })
                    )
                  }
                } catch {
                  // 图表创建失败，使用文本格式
                  const chartText = `图表: ${block.title || '数据图表'}\n\n${this.formatChartData(block.data)}`
                  slide.addText(
                    chartText,
                    this.getTextStyle({
                      x: columnX,
                      y: currentY,
                      w: columnWidth - 0.2,
                      h: blockHeight,
                      fontSize: 10,
                      color: '555555',
                      align: 'left',
                      fill: { color: 'F8F9FA' },
                    })
                  )
                }
                break
            }
          } catch {}

          currentY += blockHeight + 0.15 // 增加间距
        }
      }
    }
  }

  /**
   * 向幻灯片添加图表（带位置参数）
   */
  private async addChartToSlideWithPosition(slide: any, block: any, position: any) {
    const chartData = []
    const labels = block.data?.labels || []
    const datasets = block.data?.datasets || []

    // 图表数据调试

    if (datasets.length > 0) {
      // 准备图表数据
      const values = datasets[0].data || []

      if (block.chartType === 'pie' || block.chartType === 'doughnut') {
        // 饼图数据 - PptxGenJS需要的格式
        chartData.push({
          name: datasets[0].label || '数据分布',
          labels: labels,
          values: values,
        })
      } else {
        // 柱状图/折线图数据
        chartData.push({
          name: datasets[0].label || '数据',
          labels: labels,
          values: values,
        })
      }

      // 转换后的图表数据

      // 添加图表 - 使用标准的图表类型字符串
      let chartType
      switch (block.chartType) {
        case 'line':
          chartType = 'line'
          break
        case 'pie':
          chartType = 'pie'
          break
        case 'doughnut':
          chartType = 'doughnut'
          break
        default:
          chartType = 'bar'
      }

      slide.addChart(chartType, chartData, {
        x: position.x,
        y: position.y,
        w: position.w,
        h: position.h,
        showLegend: true,
        showTitle: false,
        showValue: true,
      })
    }
  }

  /**
   * 计算块的高度
   */
  private calculateBlockHeight(block: any, totalHeight: number, columnCount: number = 1): number {
    if (block.height) {
      return (totalHeight * block.height) / 100
    }

    // 根据列数调整默认高度
    const columnMultiplier = columnCount > 2 ? 1.2 : 1.0 // 多列时增加高度

    // 默认高度
    switch (block.type) {
      case 'title':
        return 0.6 * columnMultiplier
      case 'text':
        return 0.8 * columnMultiplier
      case 'list':
        return 1.0 * columnMultiplier
      case 'quote':
        return 1.2 * columnMultiplier
      case 'chart':
        // 图表高度根据列数调整
        if (columnCount >= 4) return 1.8 // 四列或更多
        if (columnCount === 3) return 2.2 // 三列
        return 2.5 // 单列或双列
      case 'image':
        // 图片高度根据是否是圆形头像和列数来决定
        if (block.rounded) return 1.0 * columnMultiplier
        // 多列时图片使用更方的比例
        return columnCount > 2 ? 1.3 : 1.8
      default:
        return 0.5 * columnMultiplier
    }
  }

  /**
   * 计算最优的块高度（考虑当前栏的内容数量）
   */
  private calculateOptimalBlockHeight(
    block: any,
    totalHeight: number,
    blockCountInColumn: number,
    columnCount: number = 1
  ): number {
    // 基础高度计算
    const baseHeight = this.calculateBlockHeight(block, totalHeight, columnCount)

    // 如果栏内只有一个内容块，给它更多空间
    if (blockCountInColumn === 1) {
      switch (block.type) {
        case 'image':
          // 单独的图片可以占用更多空间
          return Math.min(totalHeight * 0.8, baseHeight * 2)
        case 'chart':
          // 单独的图表可以占用更多空间
          return Math.min(totalHeight * 0.85, baseHeight * 1.5)
        case 'text':
        case 'list':
          // 单独的文本/列表适中增加
          return Math.min(totalHeight * 0.7, baseHeight * 1.3)
        default:
          return Math.min(totalHeight * 0.6, baseHeight * 1.2)
      }
    }

    // 多个内容块时，按比例分配，但确保最小高度
    const availableHeight = totalHeight - (blockCountInColumn - 1) * 0.15 // 减去间距
    const averageHeight = availableHeight / blockCountInColumn

    // 确保不会太小
    const minHeight = this.getMinHeightForType(block.type, columnCount)
    return Math.max(averageHeight, minHeight)
  }

  /**
   * 获取不同类型内容的最小高度
   */
  private getMinHeightForType(blockType: string, columnCount: number): number {
    const multiplier = columnCount > 2 ? 1.1 : 1.0

    switch (blockType) {
      case 'title':
        return 0.4 * multiplier
      case 'text':
        return 0.5 * multiplier
      case 'list':
        return 0.6 * multiplier
      case 'quote':
        return 0.8 * multiplier
      case 'chart':
        return 1.5 * multiplier
      case 'image':
        return 0.8 * multiplier
      default:
        return 0.3 * multiplier
    }
  }

  /**
   * 格式化图表数据为文本
   */
  private formatChartData(data: any): string {
    if (!data || !data.labels || !data.datasets) return ''

    const labels = data.labels
    const values = data.datasets[0]?.data || []

    return labels
      .map((label: string, index: number) => `${label}: ${values[index] || 0}`)
      .join('\n')
  }
}

/**
 * 导出PPT的便捷函数
 */
export async function exportToPptx(
  slides: SlideLayout[] | DynamicSlide[],
  title?: string,
  fontFace?: string
): Promise<void> {
  const exporter = new PptExporter()

  // 如果提供了字体，使用用户指定的字体
  if (fontFace) {
    exporter.setFontFace(fontFace)
  }

  // 检查是否是动态布局
  if (slides.length > 0 && 'columns' in slides[0] && !('template' in slides[0])) {
    await exporter.exportDynamicSlides(slides as DynamicSlide[], title)
  } else {
    await exporter.exportSlides(slides as SlideLayout[], title)
  }
}
