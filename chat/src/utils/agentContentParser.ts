/**
 * Agent Content 解析器 - 简化版
 * 处理后端发送的agent_content，支持增量更新
 */

export interface AgentContentMetadata {
  updateType: 'incremental' | 'full' | 'final'
  timestamp: string
  nodeId?: string
  nodeType?: string
  type?: string
  workflowId?: string
  status?: string
}

export interface AgentUpdateItem {
  id: string
  type: string
  data: any
  timestamp?: string
}

export interface AgentContentUpdate {
  metadata: AgentContentMetadata
  updates?: AgentUpdateItem[]
  data?: any
}

/**
 * 解析可能被压缩的 agent_content（简化版，暂不支持压缩）
 */
export function parseAgentContent(content: string): AgentContentUpdate | null {
  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * 合并增量更新到现有数据（基于ID的智能合并）
 */
export function mergeIncrementalUpdates(existingData: any, updates: AgentUpdateItem[]): any {
  const result = { ...existingData }

  // 使用 Map 存储更新，ID作为key
  const updateMap = new Map<string, any>()

  // 先加载现有数据到Map
  if (result.toolExecutions) {
    result.toolExecutions.forEach((item: any) => {
      if (item.id) {
        updateMap.set(item.id, item)
      }
    })
  }
  if (result.networkSearches) {
    result.networkSearches.forEach((item: any) => {
      const itemId = item.id || item['_id']
      if (itemId) {
        updateMap.set(itemId, item)
      }
    })
  }

  // 处理每个更新（根据ID自动判断是新增还是更新）
  updates.forEach(update => {
    // 直接设置或更新，前端根据ID判断
    updateMap.set(update.id, {
      ...update.data,
      _id: update.id,
      _type: update.type,
      _timestamp: update.timestamp,
    })
  })

  // 根据类型重组数据
  const networkSearches: any[] = []
  const toolExecutions: any[] = []
  const workflowStatuses: any[] = []
  const otherData: Record<string, any> = {}

  updateMap.forEach((item, id) => {
    const type = item['_type'] || item.type

    switch (type) {
      case 'networkSearch':
        networkSearches.push(item)
        break
      case 'toolExecution':
        toolExecutions.push(item)
        break
      case 'workflowStatus':
        workflowStatuses.push(item)
        break
      default:
        // 其他类型直接存储
        if (!otherData[type]) {
          otherData[type] = {}
        }
        otherData[type][id] = item
    }
  })

  // 更新结果
  if (networkSearches.length > 0) {
    result.networkSearches = networkSearches
  }
  if (toolExecutions.length > 0) {
    result.toolExecutions = toolExecutions
  }
  if (workflowStatuses.length > 0) {
    result.workflowStatus = workflowStatuses
  }

  // 合并其他数据
  Object.assign(result, otherData)

  return result
}

/**
 * 提取显示所需的数据
 */
export function extractDisplayData(agentContent: AgentContentUpdate) {
  if (!agentContent) return {}

  if (agentContent.metadata?.updateType === 'incremental' && agentContent.updates) {
    // 处理增量更新
    return mergeIncrementalUpdates({}, agentContent.updates)
  } else if (agentContent.data) {
    // 处理完整数据
    return agentContent.data
  }

  return {}
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasSearchResults(value: unknown): boolean {
  return hasItems(value) || (typeof value === 'string' && value.length > 0)
}

/**
 * 检查是否需要显示特定组件
 */
export function getComponentVisibility(agentData: any) {
  return {
    showPPTTheme: !!agentData.ppt?.theme,
    showPPTOutline: !!agentData.ppt?.outline,
    showPPTContent: !!agentData.ppt?.content,
    showNetworkSearch:
      hasItems(agentData.networkSearches) || hasSearchResults(agentData.networkSearch?.results),
    showFileSearch: !!agentData.fileAnalysis?.searchResults,
    showToolExecutions: hasItems(agentData.toolExecutions),
    showReasoning: !!agentData.reasoning?.content,
    showQuestions: !!agentData.custom?.promptReference,
  }
}
