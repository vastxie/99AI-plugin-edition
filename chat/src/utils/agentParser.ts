/**
 * Agent Content 解析工具
 * 统一处理 agent_content 字段的解析逻辑
 */

export interface ParsedAgentData {
  // PPT 相关
  pptTheme?: any
  pptOutline?: any
  pptData?: any

  // 网络搜索
  networkSearchResult?: string
  searchResults?: any[]
  searchImages?: string[]

  // 文件分析
  fileVectorResult?: string

  // 工具调用
  tool_calls?: string
  mcpToolResults?: string

  // 推理内容
  reasoning_content?: string

  // 问题推荐
  promptReference?: string
  recommendedQuestions?: string[]

  // 显示参数
  pluginParam?: string
}

/**
 * 解析 agent_content 字段
 * @param agentContent 原始的 agent_content JSON 字符串
 * @param fallbackData 回退数据（旧字段）
 * @returns 解析后的数据
 */
export function parseAgentContent(
  agentContent: string | undefined,
  fallbackData?: Partial<ParsedAgentData>
): ParsedAgentData {
  const result: ParsedAgentData = {}

  // 如果有 agent_content，尝试解析
  if (agentContent) {
    try {
      const agentData = JSON.parse(agentContent)

      // 提取 PPT 数据
      if (agentData.data?.ppt) {
        result.pptTheme = agentData.data.ppt.theme
        result.pptOutline = agentData.data.ppt.outline
        result.pptData = agentData.data.ppt.content
      }

      // 提取网络搜索数据
      if (agentData.data?.networkSearch) {
        const searchData = agentData.data.networkSearch
        if (searchData.results) {
          // 处理搜索结果
          if (typeof searchData.results === 'string') {
            result.networkSearchResult = searchData.results
            try {
              result.searchResults = JSON.parse(searchData.results)
            } catch {
              result.searchResults = []
            }
          } else if (Array.isArray(searchData.results)) {
            result.searchResults = searchData.results
            result.networkSearchResult = JSON.stringify(searchData.results, null, 2)
          } else {
            result.searchResults = []
            result.networkSearchResult = JSON.stringify(searchData.results, null, 2)
          }
        }

        // 处理图片
        if (searchData.images) {
          result.searchImages = searchData.images
        }
      }

      // 提取文件分析数据
      if (agentData.data?.fileAnalysis) {
        const fileData = agentData.data.fileAnalysis
        if (fileData.searchResults) {
          result.fileVectorResult =
            typeof fileData.searchResults === 'string'
              ? fileData.searchResults
              : JSON.stringify(fileData.searchResults)
        }
      }

      // 提取工具调用数据
      if (agentData.data?.toolCalls) {
        const toolCallsData = agentData.data.toolCalls
        result.tool_calls =
          typeof toolCallsData === 'string' ? toolCallsData : JSON.stringify(toolCallsData)
      }

      // 提取MCP工具结果
      if (agentData.data?.custom?.mcpToolResults) {
        result.mcpToolResults = agentData.data.custom.mcpToolResults
      }

      // 提取推理内容
      if (agentData.data?.reasoning) {
        result.reasoning_content = agentData.data.reasoning.content
      }

      // 提取问题推荐
      if (agentData.data?.custom?.promptReference) {
        result.promptReference = agentData.data.custom.promptReference
        // 尝试解析推荐问题
        if (result.promptReference) {
          const matches = result.promptReference.match(/\{([^}]+)\}/g)
          if (matches) {
            result.recommendedQuestions = matches.map(m => m.slice(1, -1))
          }
        }
      }

      // 提取显示参数
      if (agentData.display?.pluginParam) {
        result.pluginParam = agentData.display.pluginParam
      }
    } catch {}
  }

  // 使用回退数据填充未解析到的字段
  if (fallbackData) {
    Object.keys(fallbackData).forEach(key => {
      if (result[key as keyof ParsedAgentData] === undefined) {
        result[key as keyof ParsedAgentData] = fallbackData[key as keyof ParsedAgentData]
      }
    })
  }

  return result
}

/**
 * 判断是否需要显示某个特殊组件
 */
export function getSpecialDisplay(parsedData: ParsedAgentData): {
  showPPTTheme: boolean
  showPPTOutline: boolean
  showPPTContent: boolean
  showNetworkSearch: boolean
  showFileSearch: boolean
  showToolCalls: boolean
  showReasoning: boolean
} {
  return {
    showPPTTheme: !!parsedData.pptTheme,
    showPPTOutline: !!parsedData.pptOutline,
    showPPTContent: !!parsedData.pptData,
    showNetworkSearch: !!parsedData.searchResults && parsedData.searchResults.length > 0,
    showFileSearch: !!parsedData.fileVectorResult,
    showToolCalls: !!parsedData.tool_calls,
    showReasoning: !!parsedData.reasoning_content,
  }
}
