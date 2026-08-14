/**
 * Z-Index 层级管理常量
 * 统一管理所有组件的层级关系，避免层级冲突
 */

export const Z_INDEX = {
  // 背景层 (0-9)
  BACKGROUND: 0,
  BACKGROUND_IMAGE: 1,
  BACKGROUND_OVERLAY: 2,

  // 内容层 (10-19)
  CONTENT: 10,
  CONTENT_ELEVATED: 15,

  // 交互层 (20-29)
  BUTTON: 20,
  FLOATING_BUTTON: 25,

  // 导航层 (30-39)
  HEADER: 30,
  SIDEBAR: 35,
  NAV_OVERLAY: 38,

  // 弹出层 (40-49)
  DROPDOWN: 40,
  TOOLTIP: 45,
  POPOVER: 48,

  // 模态框层 (50-59)
  MODAL: 50,
  MODAL_OVERLAY: 49,
  DIALOG: 55,
  SLIDER_CAPTCHA: 55,

  // 全局提示层 (60-69)
  NOTIFICATION: 60,
  TOAST: 65,

  // 最高层级 (70+)
  IMAGE_VIEWER: 70,
  CONFIRM_DIALOG: 75,
  BAD_WORDS_DIALOG: 80,
  GLOBAL_MESSAGE: 99,
} as const

// Tailwind 兼容的 z-index 映射
export const Z_INDEX_TAILWIND = {
  0: Z_INDEX.BACKGROUND,
  10: Z_INDEX.CONTENT,
  20: Z_INDEX.BUTTON,
  30: Z_INDEX.HEADER,
  40: Z_INDEX.DROPDOWN,
  50: Z_INDEX.MODAL,
} as const

// 获取 Tailwind 类名
export function getZIndexClass(level: keyof typeof Z_INDEX): string {
  const value = Z_INDEX[level]
  // 查找对应的 Tailwind 值
  const tailwindValue = Object.entries(Z_INDEX_TAILWIND).find(([_, v]) => v === value)?.[0]
  return tailwindValue ? `z-${tailwindValue}` : `z-[${value}]`
}
