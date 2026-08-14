/**
 * 工具执行数据解析器 - 统一格式版本
 */

// 极简的工具执行数据格式
export interface MinimalToolExecution {
  name: string // 工具名称
  status: string // 状态: loading | success | error
  input: any // 输入参数
  output: any // 输出结果
  time: number // 时间戳
}

// 前端展示用的工具执行格式
export interface DisplayToolExecution extends MinimalToolExecution {
  id: string // 唯一标识符
  type?: string // 工具类型（可选，用于图标选择）
}

const getOrder = (id: string): number => {
  const match = id.match(/^tool_\d+_(\d+)$/)
  return match ? parseInt(match[1], 10) : -1
}

/**
 * 解析并合并增量工具执行更新（简化版 - 只支持新格式）
 */
export function parseToolExecutions(agentContent: any): DisplayToolExecution[] {
  if (!agentContent) return []

  try {
    const toolMap = new Map<string, DisplayToolExecution>()

    // 只处理 data.toolExecutions 格式（当前标准格式）
    if (agentContent.data?.toolExecutions && Array.isArray(agentContent.data.toolExecutions)) {
      agentContent.data.toolExecutions.forEach((tool: any, index: number) => {
        // 使用工具ID或生成稳定的ID
        const id = tool.id || `tool_${tool.name}_${index}`

        const parsedTool = {
          id,
          type: tool.type || inferToolType(tool.name),
          name: tool.name,
          status: tool.status || 'loading',
          input: tool.input || tool.query,
          output: tool.output || tool.results,
          time: tool.time || Date.now(),
        }

        // 如果工具有输出但状态仍是loading，自动更正为success
        if (parsedTool.output && parsedTool.status === 'loading') {
          parsedTool.status = 'success'
        }

        toolMap.set(id, parsedTool)
      })
    }

    // 转换为数组并排序
    // 优先按照 ID 中的执行顺序号排序，如果没有则按时间排序
    const result = Array.from(toolMap.values()).sort((a, b) => {
      const orderA = getOrder(a.id)
      const orderB = getOrder(b.id)

      // 如果都有执行顺序号，按顺序号排序
      if (orderA !== -1 && orderB !== -1) {
        return orderA - orderB
      }

      // 否则按时间排序
      return a.time - b.time
    })
    // 解析完成
    return result
  } catch {
    return []
  }
}

/**
 * 推断工具类型
 */
function inferToolType(name: string): string {
  const lowerName = name.toLowerCase()

  // 优先检查是否是MCP工具（GitHub、特定API调用等）
  if (
    lowerName.includes('_repositories') || // GitHub仓库搜索
    lowerName.includes('github') ||
    lowerName.includes('mcp_') ||
    lowerName.includes('api_') ||
    lowerName.includes('tool_') ||
    lowerName.includes('execute_') ||
    lowerName.includes('call_')
  ) {
    return 'mcp'
  }

  // 然后检查其他类型
  if (
    lowerName === '搜索' ||
    lowerName === 'search' ||
    lowerName === '网络搜索' ||
    lowerName === 'web_search'
  ) {
    return 'search'
  } else if (lowerName.includes('文件') || lowerName.includes('file')) {
    return 'file'
  } else if (lowerName.includes('图') || lowerName.includes('image')) {
    return 'image'
  } else {
    // 默认为MCP类型
    return 'mcp'
  }
}

/**
 * 检查工具是否有有效的输出
 */
export function hasValidOutput(tool: DisplayToolExecution): boolean {
  if (!tool.output) return false

  // 数组类型的输出
  if (Array.isArray(tool.output)) {
    return tool.output.length > 0
  }

  // 字符串类型的输出
  if (typeof tool.output === 'string') {
    return tool.output.trim().length > 0
  }

  // 对象类型的输出
  if (typeof tool.output === 'object') {
    return Object.keys(tool.output).length > 0
  }

  return true
}

/**
 * 格式化工具输入显示
 */
export function formatToolInput(input: any): string {
  if (!input) return ''

  if (typeof input === 'string') {
    return input
  }

  // 如果是对象，尝试提取关键信息
  if (typeof input === 'object') {
    // 搜索查询
    if (input.query) return input.query
    if (input.q) return input.q

    // 文件路径
    if (input.path) return input.path
    if (input.file) return input.file

    // 通用文本
    if (input.text) return input.text
    if (input.content) return input.content

    // 如果没有特定字段，返回JSON字符串
    return JSON.stringify(input)
  }

  return String(input)
}

/**
 * 判断是否是搜索结果格式
 */
export function isSearchResults(output: any): boolean {
  if (!Array.isArray(output)) return false
  if (output.length === 0) return true // 空数组也算搜索结果

  // 检查第一个元素是否符合搜索结果格式
  const first = output[0]
  return !!(first && (first.title || first.content) && (first.url || first.link))
}
