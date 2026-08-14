<script setup lang="ts">
import favicon from '@/assets/favicon.ico'

import GlobalImageViewer from '@/components/common/ImageViewer/GlobalImageViewer.vue'
import Watermark from '@/components/common/Watermark/index.vue'
import UserAgreementModal from '@/components/UserAgreementModal.vue'
import { ensureVisitorToken } from '@/services/visitorSession'
import { initWechatLogin } from '@/services/wechatLogin' // 导入微信登录相关功能
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { useChatStore } from '@/store/modules/chat'
import { useAppCatStore } from '@/store/modules/appStore'
import { ClientJS } from 'clientjs'
import { computed, onMounted, onUnmounted } from 'vue'

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const chatStore = useChatStore()
const appCatStore = useAppCatStore()

// 获取客户端指纹 - 添加错误处理
try {
  const client = new ClientJS()
  const fingerprint = client.getFingerprint()
  // 加固定偏移，确保指纹永远 >= 20亿，避免与真实用户 ID 碰撞
  useGlobalStore.updateFingerprint(2000000000 + (fingerprint % 147483647))
} catch (error) {
  // 使用备用方案生成一个随机ID
  const fallbackFingerprint = Date.now().toString(36) + Math.random().toString(36).substr(2)
  useGlobalStore.updateFingerprint(2000000000 + (Number(fallbackFingerprint) % 147483647))
}

// 获取配置
const faviconPath = computed(() => authStore.globalConfig?.clientFaviconPath || favicon)
const wechatSilentLoginStatus = computed(
  () => Number(authStore.globalConfig?.wechatSilentLoginStatus) === 1
)
const showWatermark = computed(() => Number(authStore.globalConfig?.showWatermark) === 1)
// 默认不清除缓存，需要在后台配置中设置为1才开启自动清除
const clearCacheEnabled = computed(() => Number(authStore.globalConfig?.clearCacheEnabled) === 1)

/**
 * 清除所有本地缓存
 * 包括localStorage、sessionStorage和indexedDB缓存
 * @param {boolean} forceClear 强制清除缓存，不考虑配置
 */
function clearAllCache(forceClear = false) {
  // 如果未启用清除缓存且未指定强制清除，则跳过
  if (!clearCacheEnabled.value && !forceClear) {
    return
  }

  // 获取当前登录状态
  const isUserLoggedIn = authStore.isLogin
  // 如果用户已登录，则不清除缓存
  if (isUserLoggedIn) {
    return
  }

  // 以下是用户未登录时的缓存清除逻辑
  // 保存所有本地存储的关键数据
  const savedData: Record<string, string | null> = {}

  // 保存主题
  savedData['theme'] = localStorage.getItem('theme') || 'light'

  // 保存其他非登录相关但需要保留的数据
  const preserveKeys = ['appLanguage', 'agreedToUserAgreement']

  // 保存这些数据
  preserveKeys.forEach(key => {
    const value = localStorage.getItem(key)
    if (value) savedData[key] = value

    const ssValue = sessionStorage.getItem(key)
    if (ssValue) savedData[`ss_${key}`] = ssValue
  })

  // 清除localStorage
  localStorage.clear()

  // 清除sessionStorage
  sessionStorage.clear()

  // 恢复所有保存的数据
  Object.keys(savedData).forEach(key => {
    const value = savedData[key]
    if (value !== null) {
      if (key.startsWith('ss_')) {
        // 恢复到sessionStorage
        sessionStorage.setItem(key.substring(3), value)
      } else {
        // 恢复到localStorage
        localStorage.setItem(key, value)
      }
    }
  })

  // 清除indexedDB数据库
  // 注意：indexedDB.databases() 并非所有浏览器都支持
  if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
    window.indexedDB
      .databases()
      .then(databases => {
        databases.forEach(database => {
          if (database.name) {
            window.indexedDB.deleteDatabase(database.name)
          }
        })
      })
      .catch(error => {})
  } else {
    // 对于不支持 databases() 的浏览器，可以尝试删除已知的数据库名称
    // 或者跳过这个步骤
  }

  // 清除应用缓存(如果支持)
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        caches.delete(key)
      })
    })
  }
}

function setDocumentTitle() {
  document.title = authStore.globalConfig?.siteTitle || authStore.globalConfig?.siteName || 'AI'
}

function setDocumentMeta() {
  const description = authStore.globalConfig?.siteDescription
  const keywords = authStore.globalConfig?.siteKeywords

  if (description) {
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute('content', description)
  }

  if (keywords) {
    let metaKeywords = document.querySelector('meta[name="keywords"]')
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta')
      metaKeywords.setAttribute('name', 'keywords')
      document.head.appendChild(metaKeywords)
    }
    metaKeywords.setAttribute('content', keywords)
  }
}

/**
 * 检测当前浏览器是否是微信内置浏览器
 * 区分微信和企业微信，只有微信浏览器返回true
 * @returns {boolean} 如果是微信浏览器返回 true，否则返回 false
 */
function isWechatBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase()

  // 检查是否是企业微信
  const isWXWork = ua.indexOf('wxwork') !== -1

  // 检查是否是微信，排除企业微信的情况
  const isWeixin = !isWXWork && ua.indexOf('micromessenger') !== -1

  return isWeixin
}

// 切换全屏状态
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    // 进入全屏
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`无法进入全屏模式: ${err.message}`)
    })
  } else {
    // 退出全屏
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}

onMounted(async () => {
  // 处理URL参数
  const urlParams = new URLSearchParams(window.location.search)

  // 兼容旧版分享链接格式: /?shareCode=xxx -> /shareHtml/xxx
  const shareCode = urlParams.get('shareCode')
  if (shareCode) {
    // 重定向到新格式的分享链接
    window.location.href = `/shareHtml/${shareCode}`
    return
  }

  // 处理支付宝支付回调
  const alipayMethod = urlParams.get('method')
  const orderIdFromUrl = urlParams.get('out_trade_no')

  if (alipayMethod === 'alipay.trade.page.pay.return' && orderIdFromUrl) {
    // 清理URL中的所有支付参数
    const newUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, document.title, newUrl)

    // 如果是在新窗口打开的（opener存在），显示提示后自动关闭
    if (window.opener && !window.opener.closed) {
      // 检测当前主题
      const isDark =
        localStorage.getItem('theme') === 'dark' ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)

      // 给用户一个简短提示
      document.body.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 1rem;
          background: ${isDark ? '#1a1a1a' : '#f5f5f5'};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          transition: background-color 0.3s;
        ">
          <div style="
            position: relative;
            background: ${isDark ? '#2d2d2d' : '#ffffff'};
            border-radius: 0.75rem;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, ${isDark ? '0.5' : '0.1'}),
                        0 8px 10px -6px rgba(0, 0, 0, ${isDark ? '0.3' : '0.05'});
            padding: 3rem 4rem;
            text-align: center;
            max-width: 400px;
            width: 100%;
          ">
            <div style="
              width: 80px;
              height: 80px;
              margin: 0 auto 1.5rem;
              background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              animation: scaleIn 0.3s ease-out;
            ">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h3 style="
              font-size: 1.5rem;
              font-weight: 600;
              color: ${isDark ? '#f3f4f6' : '#1f2937'};
              margin: 0 0 0.5rem 0;
            ">支付完成</h3>
            <p style="
              font-size: 0.95rem;
              color: ${isDark ? '#9ca3af' : '#6b7280'};
              margin: 0;
            ">窗口将在 <span id="countdown" style="
              color: ${isDark ? '#818cf8' : '#4f46e5'};
              font-weight: 600;
            ">3</span> 秒后自动关闭</p>
          </div>
        </div>
        <style>
          @keyframes scaleIn {
            from {
              transform: scale(0);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
        </style>
      `
      // 倒计时关闭窗口
      let countdown = 3
      const countdownEl = document.getElementById('countdown')
      const timer = setInterval(() => {
        countdown--
        if (countdownEl) countdownEl.textContent = countdown.toString()
        if (countdown <= 0) {
          clearInterval(timer)
          window.close()
        }
      }, 1000)
      return
    }
  }

  // 设置网站标题
  setDocumentTitle()

  // 设置网站 SEO meta 信息
  setDocumentMeta()

  // 检查当前路由是否是分享页面（包括对话分享和HTML分享）
  const currentPath = window.location.pathname
  const isShareRoute = currentPath.includes('/share/') || currentPath.includes('/shareHtml/')

  // 如果开启微信静默登录，并且是微信浏览器，且不是分享页面，执行微信登录逻辑
  if (wechatSilentLoginStatus.value && isWechatBrowser() && !isShareRoute) {
    await initWechatLogin() // 初始化微信登录
  }

  // 尝试自动清除缓存
  clearAllCache()

  // 确保游客 token 可用（未登录用户需要 visitor token 才能访问游客功能）
  await ensureVisitorToken().catch(() => {})

  // 初始化全局数据（模型、插件、应用列表）
  // 这些数据在整个应用中都需要使用，在 App 层统一加载
  await Promise.all([
    chatStore.queryModels(),
    chatStore.queryPlugins(),
    appCatStore.queryAllApps(),
    appCatStore.queryMineApps(),
    appCatStore.queryAppCats(),
  ])
  // 侧栏可能早于模型列表加载完成；模型状态明确后再初始化默认会话。
  await chatStore.queryMyGroup()

  /* 动态设置网站ico svg格式 */
  const link = document.createElement('link')
  link.rel = 'shortcut icon'
  link.href = faviconPath.value
  link.type = 'image/png' // 设置正确的图像类型

  // 移除已存在的favicon链接，防止冲突
  const existingFavicons = document.querySelectorAll('link[rel="shortcut icon"], link[rel="icon"]')
  existingFavicons.forEach(node => node.parentNode?.removeChild(node))

  // 添加新的favicon链接
  document.head.appendChild(link)

  // 添加全屏快捷键支持 (F11 或 Ctrl/Cmd + Shift + F)
  const handleKeyPress = (event: KeyboardEvent) => {
    // F11 键
    if (event.key === 'F11') {
      event.preventDefault()
      toggleFullscreen()
      return
    }

    // Ctrl/Cmd + Shift + F 组合键
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      toggleFullscreen()
      return
    }
  }

  // 监听键盘事件
  window.addEventListener('keydown', handleKeyPress)

  // 组件卸载时移除监听器
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyPress)
  })
})
</script>

<template>
  <!-- 水印组件（如果启用） -->
  <Watermark v-if="showWatermark"></Watermark>

  <!-- 主要内容使用router-view -->
  <router-view />

  <!-- 共享内容对话框 -->

  <!-- 全局图片预览器 -->
  <GlobalImageViewer />

  <!-- 用户协议弹窗 -->
  <UserAgreementModal :visible="useGlobalStore.userAgreementDialog" />
</template>
