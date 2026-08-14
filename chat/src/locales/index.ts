import type { Language } from '@/store/modules/app/helper'
import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import jaJP from './ja-JP.json'
import koKR from './ko-KR.json'
import ruRU from './ru-RU.json'
import frFR from './fr-FR.json'
import deDE from './de-DE.json'
import esES from './es-ES.json'
import arSA from './ar-SA.json'
import itIT from './it-IT.json'
import ptPT from './pt-PT.json'
import hiIN from './hi-IN.json'
import thTH from './th-TH.json'
import viVN from './vi-VN.json'

// 从 localStorage 读取保存的语言偏好
const savedLocale = localStorage.getItem('appLanguage') as Language
const defaultLocale = savedLocale || 'zh-CN'

// 导出一个函数用于获取初始语言
export function getInitialLocale(globalConfig?: any): Language {
  // 优先使用用户保存的语言设置
  const storedLocale = localStorage.getItem('appLanguage') as Language
  if (storedLocale) {
    return storedLocale
  }

  // 如果没有保存的设置，使用全局配置的默认语言
  if (globalConfig?.defaultLanguage) {
    return globalConfig.defaultLanguage as Language
  }

  // 最后的fallback
  return 'zh-CN'
}

const i18n = createI18n({
  legacy: false, // 设置为false启用Composition API模式
  globalInjection: true, // 启用全局注入
  locale: defaultLocale,
  fallbackLocale: 'en-US',
  allowComposition: true,
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ja-JP': jaJP,
    'ko-KR': koKR,
    'ru-RU': ruRU,
    'fr-FR': frFR,
    'de-DE': deDE,
    'es-ES': esES,
    'ar-SA': arSA,
    'it-IT': itIT,
    'pt-PT': ptPT,
    'hi-IN': hiIN,
    'th-TH': thTH,
    'vi-VN': viVN,
  },
})

// 导出t函数以便在组件外部使用
export function t(key: string, params?: Record<string, unknown>) {
  return params === undefined ? i18n.global.t(key) : i18n.global.t(key, params)
}

export function setLocale(locale: Language) {
  // 由于i18n.global.locale.value只接受特定字符串类型，需要进行类型断言
  i18n.global.locale.value = locale as
    | 'zh-CN'
    | 'zh-TW'
    | 'en-US'
    | 'ja-JP'
    | 'ko-KR'
    | 'ru-RU'
    | 'fr-FR'
    | 'de-DE'
    | 'es-ES'
    | 'ar-SA'
    | 'it-IT'
    | 'pt-PT'
    | 'hi-IN'
    | 'th-TH'
    | 'vi-VN'
  // 将新的语言设置保存到 localStorage
  localStorage.setItem('appLanguage', locale)
}

export function setupI18n(app: App) {
  app.use(i18n)
}

export default i18n
