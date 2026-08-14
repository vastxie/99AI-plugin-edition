/**
 * 全局事件总线 - 解决 Store 之间的循环依赖
 * 使用事件驱动架构解耦各个模块
 */

import mitt from 'mitt'
import type { Emitter } from 'mitt'

/**
 * 事件类型定义
 */
export type StoreEvents = {
  // Chat 相关事件
  'chat:clear': void
  'chat:setPlugin': { pluginId: string | null }
  'chat:groupChanged': { groupId: number }

  // Global UI 相关事件
  'ui:closeAllPreviewers': void
  'ui:toggleAppList': { visible: boolean }
  'ui:imagePreview': {
    urls: string[]
    index: number
    mjData?: any
  }

  // Auth 相关事件
  'auth:logout': void
  'auth:loginSuccess': { token: string }
  'auth:tokenExpired': void

  // App 相关事件
  'app:themeChanged': { theme: 'light' | 'dark' | 'auto' }
  'app:languageChanged': { lang: string }

  // 数据同步事件
  'data:syncRequired': { module: string }
  'data:cleared': { module: string }
}

// 创建类型安全的事件总线
export const eventBus: Emitter<StoreEvents> = mitt<StoreEvents>()

// 导出常用的事件方法
export const emit = eventBus.emit
export const on = eventBus.on
export const off = eventBus.off
