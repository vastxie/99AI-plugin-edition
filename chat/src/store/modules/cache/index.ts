import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CacheState, UserInfo, Model, AppCategory, App, Plugin } from './helper'
import { CACHE_KEYS } from './helper'

export const useCacheStore = defineStore('cache', () => {
  // ============ 状态 ============

  // 用户信息
  const userInfo = ref<UserInfo | null>(null)

  // 模型列表
  const models = ref<Model[]>([])

  // 应用分类
  const appCategories = ref<AppCategory[]>([])

  // 全部应用
  const allApps = ref<App[]>([])

  // 我的应用
  const myApps = ref<App[]>([])

  // 插件列表
  const plugins = ref<Plugin[]>([])

  // ============ 工具方法 ============

  /**
   * 获取缓存数据
   * @param key 缓存键名
   * @returns 缓存数据，如果不存在返回 null
   */
  const get = (key: keyof CacheState): any => {
    const dataMap: Record<string, any> = {
      userInfo: userInfo.value,
      models: models.value,
      appCategories: appCategories.value,
      allApps: allApps.value,
      myApps: myApps.value,
      plugins: plugins.value,
    }

    return dataMap[key] || null
  }

  /**
   * 设置缓存数据
   * @param key 缓存键名
   * @param data 要缓存的数据
   */
  const set = (key: keyof CacheState, data: any): void => {
    if (key === CACHE_KEYS.USER_INFO) {
      userInfo.value = data
    } else if (key === CACHE_KEYS.MODELS) {
      models.value = data
    } else if (key === CACHE_KEYS.APP_CATEGORIES) {
      appCategories.value = data
    } else if (key === CACHE_KEYS.ALL_APPS) {
      allApps.value = data
    } else if (key === CACHE_KEYS.MY_APPS) {
      myApps.value = data
    } else if (key === CACHE_KEYS.PLUGINS) {
      plugins.value = data
    }
  }

  /**
   * 清除特定缓存
   */
  const clear = (key: keyof CacheState): void => {
    if (key === CACHE_KEYS.USER_INFO) {
      userInfo.value = null
    } else if (key === CACHE_KEYS.MODELS) {
      models.value = []
    } else if (key === CACHE_KEYS.APP_CATEGORIES) {
      appCategories.value = []
    } else if (key === CACHE_KEYS.ALL_APPS) {
      allApps.value = []
    } else if (key === CACHE_KEYS.MY_APPS) {
      myApps.value = []
    } else if (key === CACHE_KEYS.PLUGINS) {
      plugins.value = []
    }
  }

  /**
   * 清除所有缓存
   */
  const clearAll = (): void => {
    Object.values(CACHE_KEYS).forEach(key => {
      clear(key as keyof CacheState)
    })
  }

  // ============ computed ============

  const hasUserInfo = computed(() => !!userInfo.value)
  const hasModels = computed(() => models.value.length > 0)
  const hasAppCategories = computed(() => appCategories.value.length > 0)
  const hasAllApps = computed(() => allApps.value.length > 0)
  const hasMyApps = computed(() => myApps.value.length > 0)
  const hasPlugins = computed(() => plugins.value.length > 0)

  return {
    // 状态
    userInfo,
    models,
    appCategories,
    allApps,
    myApps,
    plugins,

    // computed
    hasUserInfo,
    hasModels,
    hasAppCategories,
    hasAllApps,
    hasMyApps,
    hasPlugins,

    // 方法
    get,
    set,
    clear,
    clearAll,
  }
})
