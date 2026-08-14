import { useAppStore } from '@/store/modules/app'
import type { Language } from '@/store/modules/app/helper'
import { computed } from 'vue'

type LocaleConfig = {
  locale: Language
  name: string
  dateFormat: string
  timeFormat: string
}

// 定义本地化配置
const locales: Record<Language, LocaleConfig> = {
  'en-US': {
    locale: 'en-US',
    name: 'English',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: 'h:mm:ss A',
  },
  'zh-CN': {
    locale: 'zh-CN',
    name: '简体中文',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
  },
  'zh-TW': {
    locale: 'zh-TW',
    name: '繁體中文',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
  },
  'ja-JP': {
    locale: 'ja-JP',
    name: '日本語',
    dateFormat: 'YYYY/MM/DD',
    timeFormat: 'HH:mm:ss',
  },
  'ko-KR': {
    locale: 'ko-KR',
    name: '한국어',
    dateFormat: 'YYYY. MM. DD.',
    timeFormat: 'HH:mm:ss',
  },
  'ru-RU': {
    locale: 'ru-RU',
    name: 'Русский',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'fr-FR': {
    locale: 'fr-FR',
    name: 'Français',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'de-DE': {
    locale: 'de-DE',
    name: 'Deutsch',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'es-ES': {
    locale: 'es-ES',
    name: 'Español',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'ar-SA': {
    locale: 'ar-SA',
    name: 'العربية',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'it-IT': {
    locale: 'it-IT',
    name: 'Italiano',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'pt-PT': {
    locale: 'pt-PT',
    name: 'Português',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'hi-IN': {
    locale: 'hi-IN',
    name: 'हिन्दी',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'th-TH': {
    locale: 'th-TH',
    name: 'ไทย',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
  'vi-VN': {
    locale: 'vi-VN',
    name: 'Tiếng Việt',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm:ss',
  },
}

export function useLanguage() {
  const appStore = useAppStore()

  // 计算当前语言配置
  const currentLocale = computed(() => {
    const lang = appStore.language
    return locales[lang] || locales['zh-CN']
  })

  // 监听 appStore.language 的变化，并据此更新 Vue I18n 的语言环境
  // watch(() => appStore.language, (newLocale) => {
  //   setLocale(newLocale);
  // }, { immediate: true });

  return { currentLocale }
}
