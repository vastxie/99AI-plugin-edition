import { createPinia } from 'pinia'
import type { App } from 'vue'

export const store = createPinia()

export function setupStore(app: App) {
  app.use(store)
}

// 导出各个 store 模块路径，让组件直接导入
// 避免在这里重新导出，防止循环依赖
export * from './modules/app'
export * from './modules/appStore'
export * from './modules/auth'
export * from './modules/chat'
export * from './modules/global'
export * from './modules/prompt'
export * from './modules/users'
