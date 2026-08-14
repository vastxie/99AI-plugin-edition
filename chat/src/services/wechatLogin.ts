import { fetchLoginByCodeAPI, fetchWxLoginRedirectAPI } from '@/api/user'
import { useAuthStore } from '@/store/modules/auth'
import router from '@/utils/router'

function isWechatOAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'open.weixin.qq.com'
      && parsed.pathname.startsWith('/connect/')
  } catch {
    return false
  }
}

// 微信登录逻辑
export async function loginByWechat() {
  // 在函数内部使用 store，确保 Pinia 已初始化
  const authStore = useAuthStore()

  if (authStore.isLogin) {
    return
  }

  const urlParams = new URLSearchParams(window.location.search)

  const codes = urlParams.getAll('code')
  const code = codes.length > 0 ? codes[codes.length - 1] : null

  if (code) {
    try {
      const res = await fetchLoginByCodeAPI<any>({ code: code })
      if (res.success) {
        authStore.setToken(res.data)
        await authStore.getUserInfo()
        authStore.setLoginDialog(false)
        router.replace('/')
      }
    } catch {}
  } else {
    try {
      const currentUrl = window.location.href
      const res = await fetchWxLoginRedirectAPI<any>({ url: currentUrl })
      if (res.success && typeof res.data === 'string') {
        if (!isWechatOAuthUrl(res.data)) {
          console.error('[WechatLogin] 重定向URL不合法:', res.data)
          return
        }
        window.location.replace(res.data)
      }
    } catch {}
  }

  return { success: false }
}

// /**
//  * 检测当前浏览器是否是微信内置浏览器
//  * 区分微信和企业微信，只有微信浏览器返回true
//  * @returns {boolean} 如果是微信浏览器返回 true，否则返回 false
//  */
// export function isWechatBrowser(): boolean {
//   const ua = navigator.userAgent.toLowerCase();

//   // 检查是否是企业微信
//   const isWXWork = ua.indexOf('wxwork') !== -1;

//   // 检查是否是微信，排除企业微信的情况
//   const isWeixin = !isWXWork && ua.indexOf('micromessenger') !== -1;

//   return isWeixin;
// }

// 初始化微信登录
export async function initWechatLogin() {
  try {
    // if (isWechatBrowser()) {
    await loginByWechat() // 执行微信登录逻辑
    // }
  } catch {
    // 失败后不影响页面其他功能
  }
}
