<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

interface Props {
  name?: string // 支持 name 属性（兼容旧的 icon 属性）
  icon?: string // 保留 icon 属性以兼容旧代码
  size?: string | number
  color?: string
  flip?: 'horizontal' | 'vertical' | 'both'
  rotate?: number
}

const props = defineProps<Props>()

// 兼容处理：优先使用 name，如果没有则使用 icon
const iconName = computed(() => props.name || props.icon || '')

// 计算样式
const style = computed(() => {
  const styles: Record<string, any> = {}

  if (props.color) {
    styles.color = props.color
  }

  if (props.size) {
    const sizeValue = typeof props.size === 'number' ? `${props.size}px` : props.size
    styles.width = sizeValue
    styles.height = sizeValue
  }

  const transforms: string[] = []
  if (props.flip) {
    switch (props.flip) {
      case 'horizontal':
        transforms.push('rotateY(180deg)')
        break
      case 'vertical':
        transforms.push('rotateX(180deg)')
        break
      case 'both':
        transforms.push('rotateX(180deg) rotateY(180deg)')
        break
    }
  }

  if (props.rotate) {
    transforms.push(`rotate(${props.rotate % 360}deg)`)
  }

  if (transforms.length > 0) {
    styles.transform = transforms.join(' ')
  }

  return styles
})
</script>

<template>
  <Icon :icon="iconName" :style="style" />
</template>
