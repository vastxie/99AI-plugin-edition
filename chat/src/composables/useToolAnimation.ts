/**
 * 工具卡片动画状态管理
 * 使用全局状态来跟踪已经播放过动画的工具，避免重复播放
 */

// 存储已播放动画的工具标识
// 使用消息ID + 工具名称 + 时间戳的组合作为唯一标识
const animatedTools = new Map<string, boolean>()

// 生成工具的唯一标识
function getToolKey(messageId: number | undefined, toolName: string, toolTime?: number): string {
  // 如果没有messageId，使用工具名称和时间作为key
  if (!messageId) {
    return `${toolName}_${toolTime || 0}`
  }
  return `${messageId}_${toolName}_${toolTime || 0}`
}

// 检查工具是否已经播放过动画
export function hasToolAnimated(
  messageId: number | undefined,
  toolName: string,
  toolTime?: number
): boolean {
  const key = getToolKey(messageId, toolName, toolTime)
  return animatedTools.has(key)
}

// 标记工具已播放动画
export function markToolAnimated(
  messageId: number | undefined,
  toolName: string,
  toolTime?: number
): void {
  const key = getToolKey(messageId, toolName, toolTime)
  animatedTools.set(key, true)

  // 防止Map无限增长，保留最近的200个记录
  if (animatedTools.size > 200) {
    const keysToDelete = Array.from(animatedTools.keys()).slice(0, 50)
    keysToDelete.forEach(k => animatedTools.delete(k))
  }
}

// 清理特定消息的动画记录（可选，用于清理已删除的消息）
export function clearMessageAnimations(messageId: number): void {
  const prefix = `${messageId}_`
  const keysToDelete: string[] = []

  animatedTools.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key)
    }
  })

  keysToDelete.forEach(key => animatedTools.delete(key))
}

// 清理所有动画记录
export function clearAllAnimations(): void {
  animatedTools.clear()
}
