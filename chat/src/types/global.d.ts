// 全局类型定义

interface Window {
  wx?: unknown
  WeixinJSBridge: {
    invoke(
      method: string,
      params: Record<string, string>,
      callback: (res: { err_msg?: string }) => void
    ): void
  }
}

declare namespace NodeJS {
  interface Process {
    type?: string
  }
}
