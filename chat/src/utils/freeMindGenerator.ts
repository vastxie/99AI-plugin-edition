export interface MindMapNode {
  id: string
  title: string
  children?: MindMapNode[]
  style?: {
    color?: string
    background_color?: string
    font?: {
      bold?: boolean
      italic?: boolean
      size?: number
    }
    position?: 'left' | 'right'
  }
  notes?: string
}

/**
 * FreeMind (.mm) 格式生成器
 * 轻量级思维导图格式，纯 XML 结构
 */
export class FreeMindGenerator {
  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  }

  /**
   * 生成 FreeMind XML 内容
   */
  private generateXMLContent(rootNode: MindMapNode): string {
    const generateNodeXML = (node: MindMapNode, depth: number = 0): string => {
      const indent = '  '.repeat(depth)

      // 生成节点属性
      const attributes = [`ID="${this.escapeXML(node.id)}"`, `TEXT="${this.escapeXML(node.title)}"`]

      // 添加样式属性
      if (node.style?.color) {
        attributes.push(`COLOR="${this.escapeXML(node.style.color)}"`)
      }
      if (node.style?.background_color) {
        attributes.push(`BACKGROUND_COLOR="${this.escapeXML(node.style.background_color)}"`)
      }
      if (node.style?.position) {
        attributes.push(`POSITION="${node.style.position}"`)
      }

      // 添加字体样式
      const fontStyles = []
      if (node.style?.font?.bold) fontStyles.push('BOLD')
      if (node.style?.font?.italic) fontStyles.push('ITALIC')
      if (node.style?.font?.size) {
        fontStyles.push(`SIZE=${node.style.font.size}`)
      }

      if (fontStyles.length > 0) {
        attributes.push(`FONT_NAME="${fontStyles.join(';')}"`)
      }

      // 生成子节点
      const childrenXML =
        node.children && node.children.length > 0
          ? node.children.map(child => generateNodeXML(child, depth + 1)).join('\n')
          : ''

      // 生成备注
      const notesXML = node.notes
        ? `\n${indent}  <node TEXT="${this.escapeXML(node.notes)}" STYLE="fork"/>`
        : ''

      return `${indent}<node ${attributes.join(' ')}>${notesXML}${childrenXML ? '\n' + childrenXML + '\n' + indent : ''}</node>`
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
${generateNodeXML(rootNode)}
</map>`
  }

  /**
   * XML 转义函数
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * 参考 markmap 的 Markdown 解析逻辑
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体
      .replace(/`(.*?)`/g, '$1') // 移除行内代码
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 移除链接，保留文本
      .trim()
  }

  /**
   * 参考 markmap 的层级检测逻辑
   */
  private getLevel(line: string): number {
    const trimmed = line.trim()

    // 处理标题：# ## ### 等
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#+)\s*(.*)$/)
      if (match) {
        return match[1].length - 1 // 标题级别：# = 0, ## = 1, ### = 2 等
      }
    }

    // 处理列表项：- * 1. 等
    if (trimmed.match(/^[-*+]\s*/) || trimmed.match(/^\d+\.\s*/)) {
      const leadingSpaces = line.length - line.trimStart().length
      return Math.floor(leadingSpaces / 2) + 1 // 2个空格缩进为一个层级
    }

    // 处理普通段落：基于缩进
    const leadingSpaces = line.length - line.trimStart().length
    return Math.floor(leadingSpaces / 2) + 1
  }

  /**
   * 参考 markmap 的标记删除逻辑
   */
  private removeMarkdownMarkers(content: string): string {
    return content
      .replace(/^#+\s*/, '') // 移除标题标记
      .replace(/^[-*+]\s*/, '') // 移除无序列表标记
      .replace(/^\d+\.\s*/, '') // 移除有序列表标记
      .replace(/^\s{2,}/, '') // 移除多余缩进
      .trim()
  }

  /**
   * 从 Markdown 生成思维导图数据（参考 markmap transformer）
   */
  static generateFromMarkdown(markdown: string): MindMapNode {
    const generator = new FreeMindGenerator()
    return generator.parseMarkdownToMindMap(markdown)
  }

  /**
   * 实例方法：解析 Markdown 到 FreeMind
   */
  private parseMarkdownToMindMap(markdown: string): MindMapNode {
    const lines = markdown.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      return { id: 'root', title: '思维导图' }
    }

    // 参考 markmap 的根节点处理逻辑
    let rootTitle = '思维导图'
    let contentStartIndex = 0

    // 寻找第一个有效的内容作为根标题
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim()) {
        // 如果找到标题行，使用标题作为根标题
        if (line.trim().startsWith('#')) {
          rootTitle = this.removeMarkdownMarkers(line)
          contentStartIndex = i + 1
          break
        }
        // 否则使用第一个非空行作为根标题
        else if (rootTitle === '思维导图') {
          rootTitle = line.trim()
          contentStartIndex = i + 1
          break
        }
      }
    }

    const root: MindMapNode = {
      id: this.generateNodeId(),
      title: rootTitle,
      style: {
        background_color: '#f5f5f5',
        font: { bold: true, size: 14 },
      },
      children: [],
    }

    // 参考 markmap 的解析逻辑
    const parseSection = (
      sectionLines: string[],
      startIndex: number,
      parentLevel: number = 0,
      isRoot: boolean = false
    ): MindMapNode[] => {
      const nodes: MindMapNode[] = []
      let i = startIndex

      while (i < sectionLines.length) {
        const line = sectionLines[i]
        const trimmedLine = line.trim()

        // 跳过空行
        if (!trimmedLine) {
          i++
          continue
        }

        const currentLevel = this.getLevel(line)

        // 如果当前行级别小于等于父级，结束当前部分
        if (currentLevel <= parentLevel && !isRoot) {
          break
        }

        // 清理标题内容
        const title = this.removeMarkdownMarkers(line)

        if (title) {
          const newNode: MindMapNode = {
            id: this.generateNodeId(),
            title: this.cleanTitle(title),
            style: {
              color: this.getNodeColor(currentLevel),
              font: {
                size: Math.max(10, 14 - currentLevel),
                bold: currentLevel <= 1,
              },
            },
            children: [],
          }

          // 设置位置（可选，用于左右布局）
          if (currentLevel === 1 && nodes.length % 2 === 1) {
            if (newNode.style) {
              newNode.style.position = 'left'
            } else {
              newNode.style = { position: 'left' }
            }
          }

          // 查找子节点
          const childLines = []
          let j = i + 1

          // 收集属于当前节点的子内容
          while (j < sectionLines.length) {
            const childLine = sectionLines[j]
            const childTrimmed = childLine.trim()

            if (!childTrimmed) {
              j++
              continue
            }

            const childLevel = this.getLevel(childLine)

            // 如果子行级别大于当前级别，属于当前节点
            if (childLevel > currentLevel) {
              childLines.push(childLine)
              j++
            } else {
              break
            }
          }

          // 递归解析子节点
          if (childLines.length > 0) {
            newNode.children = parseSection(lines, i + 1, currentLevel, false)
            i = j - 1
          }

          nodes.push(newNode)
        }

        i++
      }

      return nodes
    }

    // 解析所有子节点
    const childNodes = parseSection(lines, contentStartIndex, 0, true)
    root.children = childNodes

    return root
  }

  /**
   * 根据层级获取节点颜色
   */
  private getNodeColor(level: number): string {
    const colors = [
      '#333333', // 根节点 - 黑色
      '#4a90e2', // 1级 - 蓝色
      '#f5a623', // 2级 - 橙色
      '#7ed321', // 3级 - 绿色
      '#bd10e0', // 4级 - 紫色
      '#50e3c2', // 5级 - 青色
      '#f8e71c', // 6级 - 黄色
      '#d0021b', // 7+级 - 红色
    ]
    return colors[Math.min(level, colors.length - 1)]
  }

  /**
   * 导出为 FreeMind 文件
   */
  async exportToFreeMind(rootNode: MindMapNode, filename: string = 'mindmap'): Promise<void> {
    try {
      // 生成 XML 内容
      const xmlContent = this.generateXMLContent(rootNode)

      // 创建 Blob
      const blob = new Blob([xmlContent], {
        type: 'application/xml;charset=utf-8',
      })

      // 清理文件名，移除特殊字符
      const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')

      // 使用 FileSaver 下载文件
      const { saveAs } = await import('file-saver')
      saveAs(blob, `${cleanFilename}.mm`)
    } catch (error) {
      console.error('导出 FreeMind 文件失败:', error)
      throw new Error('导出 FreeMind 文件失败', { cause: error })
    }
  }
}
