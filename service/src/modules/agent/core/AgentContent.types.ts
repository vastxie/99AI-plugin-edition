/**
 * AgentContent 增量更新系统类型定义
 * 统一增量更新机制
 */

/**
 * Agent内容更新类型（简化版）
 */
export enum AgentUpdateType {
  TOOL_EXECUTION = 'toolExecution', // 统一的工具执行类型
  WORKFLOW_STATUS = 'workflowStatus',
  PPT = 'ppt',
  REASONING = 'reasoning',
  CUSTOM = 'custom',
  LLM_RESPONSE = 'llmResponse',
  TOKEN_USAGE = 'tokenUsage',
}

/**
 * 单个更新项 (简化版：移除action，由前端根据ID判断)
 */
export interface AgentUpdateItem {
  id: string; // 唯一标识符（前端根据此ID判断是新增还是更新）
  type: AgentUpdateType;
  data: any; // 具体数据
  timestamp?: string;
}

/**
 * 增量更新消息格式
 */
export interface AgentContentUpdate {
  metadata: {
    updateType: 'incremental' | 'full';
    timestamp: string;
    nodeId?: string; // 发送更新的节点ID
    nodeType?: string; // 节点类型
  };
  updates: AgentUpdateItem[];
}

/**
 * 生成唯一ID的辅助函数
 */
export function generateUpdateId(type: AgentUpdateType, suffix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return suffix ? `${type}_${suffix}_${timestamp}_${random}` : `${type}_${timestamp}_${random}`;
}

/**
 * 创建增量更新消息 (简化版)
 */
export function createIncrementalUpdate(
  updates: AgentUpdateItem[],
  nodeId?: string,
  nodeType?: string,
): AgentContentUpdate {
  return {
    metadata: {
      updateType: 'incremental',
      timestamp: new Date().toISOString(),
      nodeId,
      nodeType,
    },
    updates: updates.map(update => ({
      ...update,
      timestamp: update.timestamp || new Date().toISOString(),
    })),
  };
}

/**
 * 创建全量更新消息（用于初始化或重置）
 */
export function createFullUpdate(
  data: Record<string, any>,
  nodeId?: string,
  nodeType?: string,
): AgentContentUpdate {
  // 将数据转换为更新项数组
  const updates: AgentUpdateItem[] = [];

  // 处理不同类型的数据
  Object.entries(data).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        updates.push({
          id: item.id || `${key}_${index}`,
          type: key as AgentUpdateType,
          data: item,
        });
      });
    } else if (value && typeof value === 'object') {
      updates.push({
        id: value.id || key,
        type: key as AgentUpdateType,
        data: value,
      });
    }
  });

  return {
    metadata: {
      updateType: 'full',
      timestamp: new Date().toISOString(),
      nodeId,
      nodeType,
    },
    updates,
  };
}

/**
 * 判断是否为增量更新格式
 */
export function isIncrementalFormat(agentContent: any): agentContent is AgentContentUpdate {
  return (
    agentContent?.metadata?.updateType === 'incremental' ||
    agentContent?.metadata?.updateType === 'full'
  );
}

/**
 * 极简的工具执行数据格式
 */
export interface MinimalToolExecution {
  name: string; // 工具名称
  status: string; // 状态: loading | success | error
  input: any; // 输入参数
  output: any; // 输出结果
  time: number; // 时间戳
}

/**
 * 创建工具执行更新
 */
export function createToolExecution(id: string, tool: MinimalToolExecution): AgentUpdateItem {
  return {
    id,
    type: AgentUpdateType.TOOL_EXECUTION,
    data: tool,
    timestamp: new Date().toISOString(),
  };
}
