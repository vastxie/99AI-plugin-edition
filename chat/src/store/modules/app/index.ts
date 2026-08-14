//  // 移除循环依赖
import { defineStore } from 'pinia'
import type { AppState, Language, Theme } from './helper'
import { getLocalSetting, setLocalSetting } from './helper'

export const useAppStore = defineStore('app-store', {
  state: (): AppState => getLocalSetting(),
  actions: {
    setSiderCollapsed(collapsed: boolean) {
      this.siderCollapsed = collapsed
      this.recordState()
    },

    setTheme(theme: Theme) {
      localStorage.theme = theme
      this.theme = theme
      window.theme = theme
      this.recordState()
      // 切换暗黑模式逻辑
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    },

    setLanguage(language: Language) {
      if (this.language !== language) {
        this.language = language
        this.recordState()
      }
    },

    recordState() {
      setLocalSetting(this.$state)
    },

    setEnv() {
      const isWeChat = /micromessenger/i.test(navigator.userAgent)

      const isMobile = /(iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone)/i.test(
        navigator.userAgent
      )

      const isWeb = !isWeChat

      if (isWeChat) this.env = 'wechat'
      else if (isMobile) this.env = 'mobile'
      else if (isWeb) this.env = 'web'
    },
  },
})

export function useAppStoreWithOut() {
  return useAppStore()
}
