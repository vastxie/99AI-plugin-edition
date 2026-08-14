/**
 * Store 初始化器
 * 在应用启动时初始化所有 store 的事件监听器
 */

import { useGlobalStore } from './modules/global'
import { useChatStore } from './modules/chat'

/**
 * 初始化所有 Store 的事件监听器
 * 应该在 main.ts 中调用
 */
export function initializeStores() {
  // 初始化各个 store 的事件监听器
  const globalStore = useGlobalStore()
  const chatStore = useChatStore()

  // 调用初始化方法
  if (globalStore.initEventListeners) {
    globalStore.initEventListeners()
  }

  if (chatStore.initEventListeners) {
    chatStore.initEventListeners()
  }

  // Store 初始化完成
}
