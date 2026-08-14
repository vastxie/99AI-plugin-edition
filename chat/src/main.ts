import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/store/modules/auth'
import '@/styles/github-markdown.scss'
import '@/styles/global.scss'
import '@/styles/index.css'
import { message } from '@/utils/message'
import router from '@/utils/router'
import 'katex/dist/katex.min.css'
import { createApp } from 'vue'
import App from './App.vue'
import { setupI18n } from './locales'
import { setupImageViewer } from './plugins/imageViewer'
import { setupStore } from './store'
import { initializeStores } from './store/initStores'

// 检测系统主题并设置应用主题
function detectSystemTheme() {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)')
  const storedTheme = localStorage.getItem('theme')
  const theme = storedTheme || (prefersDarkScheme.matches ? 'dark' : 'light')
  localStorage.setItem('theme', theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')

  // 设置 data-theme 方式的主题系统
  document.documentElement.dataset.theme = theme
}

async function bootstrap() {
  const app = createApp(App)

  // 设置样式和资源
  setupStore(app)
  setupI18n(app)
  setupImageViewer(app)

  // 初始化 Store 事件监听器（必须在 setupStore 之后）
  initializeStores()

  // 在Pinia初始化后获取authStore
  const authStore = useAuthStore()

  // 安装Vue Router
  app.use(router)

  // 检测系统主题并设置应用主题
  detectSystemTheme()

  // 初始化主题
  const { init } = useTheme()
  init()

  // 初始化消息组件
  const msgInstance = message()

  const domain = `${window.location.protocol}//${window.location.hostname}${
    window.location.port ? `:${window.location.port}` : ''
  }`

  try {
    await authStore.getGlobalConfig(domain)
  } catch {
    // 继续启动应用，使用默认配置
  }

  // 延迟加载插件
  const VueViewer = (await import('v-viewer')).default
  app.use(VueViewer)
  const { MotionPlugin } = await import('@vueuse/motion')
  app.use(MotionPlugin)

  // 在卸载应用前清理资源
  app.config.globalProperties.$onAppUnmount = () => {
    if (msgInstance && typeof msgInstance.destroy === 'function') {
      msgInstance.destroy()
    }
  }

  app.mount('#app')
}

bootstrap()
