/**
 * 全局缓存模块类型定义
 */

export interface CacheState {
  // 用户信息缓存
  userInfo: UserInfo | null

  // 模型列表缓存
  models: Model[]

  // 应用分类缓存
  appCategories: AppCategory[]

  // 全部应用缓存
  allApps: App[]

  // 我的应用缓存
  myApps: App[]

  // 插件列表缓存
  plugins: Plugin[]
}

export interface UserInfo {
  id: number
  username: string
  email: string
  avatar?: string
  balance?: number
  // ... 其他用户信息字段
}

export interface Model {
  id: number
  model: string
  modelName: string
  deductType: number
  deduct: number
  // ... 其他模型字段
}

export interface AppCategory {
  id: number
  name: string
  icon?: string
  // ... 其他分类字段
}

export interface App {
  id: number
  name: string
  coverImg?: string
  des?: string
  // ... 其他应用字段
}

export interface Plugin {
  pluginId: number | string
  pluginName: string
  description?: string
  // ... 其他插件字段
}

// 缓存键名常量
export const CACHE_KEYS = {
  USER_INFO: 'userInfo',
  MODELS: 'models',
  APP_CATEGORIES: 'appCategories',
  ALL_APPS: 'allApps',
  MY_APPS: 'myApps',
  PLUGINS: 'plugins',
}
