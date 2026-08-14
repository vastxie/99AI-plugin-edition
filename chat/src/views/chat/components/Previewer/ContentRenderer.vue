<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'

// 动态导入渲染器组件
const HtmlRenderer = defineAsyncComponent(() => import('./Renderers/HtmlRenderer.vue'))
const MermaidRenderer = defineAsyncComponent(() => import('./Renderers/MermaidRenderer.vue'))
const MarkMapRenderer = defineAsyncComponent(() => import('./Renderers/MarkMapRenderer.vue'))

const props = defineProps<{
  contentType: 'html' | 'mermaid' | 'markmap'
  content: string
  previewSize?: 'desktop' | 'tablet' | 'mobile'
}>()

// 定义事件
const emit = defineEmits(['loading-state-change'])

// 使用key来强制组件重新渲染
const renderKey = ref(0)
// 添加加载状态跟踪
const isLoading = ref(false)

// 监听内容变化，强制重新渲染
watch([() => props.content, () => props.contentType], () => {
  // 设置加载状态
  isLoading.value = true
  emit('loading-state-change', true)

  renderKey.value++

  // 延迟重置加载状态（给组件一些时间来渲染）
  setTimeout(() => {
    isLoading.value = false
    emit('loading-state-change', false)
  }, 500)
})

// 计算当前要显示的组件
const currentComponent = computed(() => {
  switch (props.contentType) {
    case 'html':
      return HtmlRenderer
    case 'mermaid':
      return MermaidRenderer
    case 'markmap':
      return MarkMapRenderer
    default:
      return HtmlRenderer
  }
})
</script>

<template>
  <div class="content-renderer h-full w-full bg-gray-50 dark:bg-gray-900">
    <component
      :is="currentComponent"
      :key="renderKey"
      :content="content"
      :preview-size="previewSize"
    />
  </div>
</template>
