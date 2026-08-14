import {
  fetchQueryAppsAPI,
  fetchQueryMineAppsAPI,
  fetchQueryAppCatsAPI,
  fetchQueryOneCatAPI,
} from '@/api/appStore'
//  // 移除循环依赖
import { defineStore } from 'pinia'
import type { App, AppCategory, AppStoreState, MineApp } from './helper'
import { useCacheStore } from '../cache'

export const useAppCatStore = defineStore('app-cat-store', {
  state: (): AppStoreState => ({
    catId: 0,
    mineApps: [],
    allApps: [],
    appDetails: {},
    appCategories: [],
  }),

  actions: {
    setCatId(catId: number) {
      this.catId = catId
    },

    async queryMineApps(forceRefresh = false) {
      const cacheStore = useCacheStore()

      // 先从缓存获取 (除非强制刷新)
      const cachedApps = cacheStore.get('myApps')
      if (!forceRefresh && cachedApps && cacheStore.hasMyApps) {
        this.mineApps = cachedApps
        return
      }

      // 从API获取
      const res = await fetchQueryMineAppsAPI<{ rows: MineApp[] }>()
      this.mineApps = res?.data?.rows || []

      // 缓存数据
      if (res?.data?.rows) {
        cacheStore.set('myApps', res.data.rows)
      }
    },

    async queryAllApps() {
      const cacheStore = useCacheStore()

      // 先从缓存获取
      const cachedApps = cacheStore.get('allApps')
      if (cachedApps && cacheStore.hasAllApps) {
        this.allApps = cachedApps
        return
      }

      // 从API获取
      const res = await fetchQueryAppsAPI<{ rows: App[] }>()
      this.allApps = res?.data?.rows || []

      // 缓存数据
      if (res?.data?.rows) {
        cacheStore.set('allApps', res.data.rows)
      }
    },

    async queryAppCats() {
      const cacheStore = useCacheStore()

      // 先从缓存获取
      const cachedCats = cacheStore.get('appCategories')
      if (cachedCats && cacheStore.hasAppCategories) {
        this.appCategories = cachedCats
        return cachedCats
      }

      // 从API获取
      const res = await fetchQueryAppCatsAPI<{ rows: AppCategory[] }>()
      const cats = res?.data?.rows || []

      // 存储到 state
      this.appCategories = cats

      // 缓存数据
      if (res?.data?.rows) {
        cacheStore.set('appCategories', cats)
      }

      return cats
    },

    /**
     * 查询单个应用详情(带缓存)
     */
    async queryAppDetail(appId: number): Promise<any> {
      // 检查缓存
      if (this.appDetails[appId]) {
        return this.appDetails[appId]
      }

      // 从API获取
      const res: any = await fetchQueryOneCatAPI({ id: appId })
      const detail = res.data

      // 缓存结果
      this.appDetails[appId] = detail
      return detail
    },
  },
})

export function useAppCatStoreWithOut() {
  return useAppCatStore()
}
