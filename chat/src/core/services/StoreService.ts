/**
 * Store 服务层 - 处理 Store 之间的交互逻辑
 * 避免 Store 直接相互调用，通过服务层解耦
 */

import { eventBus } from '../events/eventBus'

export class StoreService {
  private static instance: StoreService

  private constructor() {
    this.setupEventListeners()
  }

  static getInstance(): StoreService {
    if (!StoreService.instance) {
      StoreService.instance = new StoreService()
    }
    return StoreService.instance
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    // 监听登出事件，执行清理操作
    eventBus.on('auth:logout', () => {
      this.handleLogout()
    })

    // 监听对话组切换事件
    eventBus.on('chat:groupChanged', () => {
      this.handleGroupChange()
    })
  }

  /**
   * 处理登出逻辑
   */
  private async handleLogout() {
    // 触发清理事件，让各个 store 自行清理
    eventBus.emit('chat:clear')
    eventBus.emit('ui:closeAllPreviewers')
    eventBus.emit('data:cleared', { module: 'all' })

    // 延迟重载页面，确保清理完成
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }

  /**
   * 处理对话组切换
   */
  private handleGroupChange() {
    // 关闭 UI 组件
    eventBus.emit('ui:toggleAppList', { visible: false })
    eventBus.emit('ui:closeAllPreviewers')

    // 通知数据同步
    eventBus.emit('data:syncRequired', { module: 'chat' })
  }

  /**
   * 清除插件状态（对外暴露的方法）
   */
  clearPlugin() {
    eventBus.emit('chat:setPlugin', { pluginId: null })
  }

  /**
   * 显示图片预览
   */
  showImagePreview(urls: string[], index = 0, mjData?: any) {
    // 触发图片预览事件
    eventBus.emit('ui:imagePreview', { urls, index, mjData })
  }

  /**
   * 关闭所有预览器
   */
  closeAllPreviewers() {
    eventBus.emit('ui:closeAllPreviewers')
  }

  /**
   * 切换应用列表显示
   */
  toggleAppList(visible: boolean) {
    eventBus.emit('ui:toggleAppList', { visible })
  }
}

// 导出单例
export const storeService = StoreService.getInstance()
