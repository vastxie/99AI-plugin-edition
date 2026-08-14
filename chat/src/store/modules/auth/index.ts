import { defineStore } from 'pinia'
import { eventBus } from '@/core/events/eventBus'
import { fetchGetInfo } from '@/api'
import { fetchGetBalanceQueryAPI } from '@/api/balance'
import { fetchQueryConfigAPI } from '@/api/config'
import type { ResData } from '@/api/types'
import type { AuthState, GetInfoResponse, GlobalConfig, UserBalance } from './helper'
import {
  createDefaultUserBalance,
  createDefaultUserInfo,
  getToken,
  removeToken,
  setToken,
} from './helper'

export const useAuthStore = defineStore('auth-store', {
  state: (): AuthState => ({
    token: getToken(),
    loginDialog: false,
    globalConfigLoading: true,
    userInfo: createDefaultUserInfo(),
    userBalance: createDefaultUserBalance(),
    globalConfig: {} as GlobalConfig,
    loadInit: false,
  }),

  getters: {
    isLogin: (state: AuthState) => !!state.token,
  },

  actions: {
    async getUserInfo(): Promise<GetInfoResponse | undefined> {
      if (!this.loadInit) await this.getGlobalConfig()

      const res = await fetchGetInfo<GetInfoResponse>()
      if (!res) return undefined
      const { data } = res
      const { userInfo, userBalance } = data
      this.userInfo = { ...userInfo }
      this.userBalance = { ...userBalance }
      // 登录态下再读取一次余额专用接口，确保页面初始化始终展示最新额度。
      if (this.isLogin) await this.getUserBalance()
      return data
    },

    updateUserBalance(userBalance: UserBalance) {
      this.userBalance = userBalance
    },

    async getUserBalance() {
      const res: ResData = await fetchGetBalanceQueryAPI()
      const { success, data } = res
      if (success) this.userBalance = data
    },

    async getGlobalConfig(domain = '') {
      const res = await fetchQueryConfigAPI({ domain })
      // 为缺失的字段提供默认值，确保配置的完整性
      const configData = res.data as any
      if (configData) {
        // 确保 clientFaviconPath 字段存在
        if (!('clientFaviconPath' in configData)) {
          configData.clientFaviconPath = ''
        }
      }
      this.globalConfig = configData as GlobalConfig
      this.globalConfigLoading = false
      this.loadInit = true

      // 设置初始语言 - 处理语言可用性验证
      const savedLocale = localStorage.getItem('appLanguage')

      // 解析启用的语言列表
      let enabledLanguages: string[] = []
      try {
        if (typeof this.globalConfig?.enabledLanguages === 'string') {
          enabledLanguages = JSON.parse(this.globalConfig.enabledLanguages)
        } else if (Array.isArray(this.globalConfig?.enabledLanguages)) {
          enabledLanguages = this.globalConfig.enabledLanguages
        }
      } catch {
        // 如果解析失败，使用默认的语言列表
        enabledLanguages = ['zh-CN', 'en-US']
      }

      // 如果没有配置启用的语言，使用默认列表
      if (!enabledLanguages || enabledLanguages.length === 0) {
        enabledLanguages = ['zh-CN', 'en-US']
      }

      const { setLocale } = await import('@/locales')
      const { useAppStore } = await import('@/store')
      const appStore = useAppStore()

      // 检查保存的语言是否在启用列表中
      if (savedLocale && enabledLanguages.includes(savedLocale)) {
        // 保存的语言仍然可用，继续使用
        return
      }

      // 如果保存的语言不可用或没有保存的语言
      let targetLanguage = this.globalConfig?.defaultLanguage || 'zh-CN'

      // 确保默认语言也在启用列表中
      if (!enabledLanguages.includes(targetLanguage)) {
        // 如果默认语言也不在启用列表中，使用第一个可用的语言
        targetLanguage = enabledLanguages[0] || 'zh-CN'
      }

      // 设置语言
      setLocale(targetLanguage as any)
      appStore.setLanguage(targetLanguage as any)

      // 如果之前有保存的语言但现在不可用了，清除它
      if (savedLocale && !enabledLanguages.includes(savedLocale)) {
        localStorage.removeItem('appLanguage')
      }
    },

    setToken(token: string) {
      this.token = token
      setToken(token)
    },

    removeToken() {
      this.token = undefined
      removeToken()
    },

    setLoginDialog(bool: boolean) {
      this.loginDialog = bool
    },

    logOut() {
      this.token = undefined
      removeToken()
      this.userInfo = createDefaultUserInfo()
      this.userBalance = createDefaultUserBalance()
      // message().success('登出账户成功！')
      // 触发登出事件，让服务层处理
      eventBus.emit('auth:logout')
    },

    updatePasswordSuccess() {
      this.token = undefined
      removeToken()
      this.userInfo = createDefaultUserInfo()
      this.userBalance = createDefaultUserBalance()
      this.loginDialog = true
    },
  },
})

export function useAuthStoreWithout() {
  // 直接使用 useAuthStore，不再引入 store
  return useAuthStore()
}
