import { ss } from '@/utils/storage'

function detectEnvironment(): Env {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/micromessenger/i.test(userAgent)) return 'wechat'
  else if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  )
    return 'webApp'
  else if (/(Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone)/i.test(userAgent))
    return 'mobile'
  else return 'webBrowser'
}

const LOCAL_NAME = 'appSetting'

export type Theme = 'light' | 'dark' | 'auto'

export type Language =
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

export type Env = 'wechat' | 'webApp' | 'mobile' | 'webBrowser' | 'web'

export interface AppState {
  siderCollapsed: boolean
  theme: Theme
  language: Language
  env: Env
}

export function defaultSetting(): AppState {
  return {
    siderCollapsed: false,
    theme: 'light',
    language: 'zh-CN',
    env: detectEnvironment(),
  }
}

export function getLocalSetting(): AppState {
  const localSetting: AppState | undefined = ss.get(LOCAL_NAME)
  // 从 localStorage读取语言设置，优先使用appLanguage
  const savedLanguage = localStorage.getItem('appLanguage') as Language
  const setting = { ...defaultSetting(), ...localSetting }
  if (savedLanguage) {
    setting.language = savedLanguage
  }
  return setting
}

export function setLocalSetting(setting: AppState): void {
  ss.set(LOCAL_NAME, setting)
}
