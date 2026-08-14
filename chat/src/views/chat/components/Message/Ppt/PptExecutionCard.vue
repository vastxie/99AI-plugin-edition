<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { LoadingOne } from '@icon-park/vue-next'
import { Icon } from '@iconify/vue'
import { computed, inject } from 'vue'

interface Props {
  pptData: {
    type: 'theme' | 'complete'
    status: 'processing' | 'completed' | 'failed'
    statusMessage?: string
    input: {
      title?: string
      requirements?: string
    }
    output?: {
      themes?: any[]
      pptData?: any
      // 直接在output下的PPT数据结构
      title?: string
      subtitle?: string
      author?: string
      date?: string
      slides?: any[]
      outline?: any[]
      pageCount?: number
    }
    error?: string
    timestamp?: string
  }
  isGenerating?: boolean
  conversationId?: string | number
}

const props = defineProps<Props>()
const globalStore = useGlobalStoreWithOut()
const isShareMode = inject('isShareMode', false)
const { isMobile } = useBasicLayout()

// 获取PPT标题
function getPptTitle() {
  // 优先使用output中的标题
  const outputTitle = props.pptData.output?.title || props.pptData.output?.pptData?.title
  if (outputTitle) {
    return outputTitle
  }

  // 其次使用input中的标题
  if (props.pptData.input?.title) {
    return props.pptData.input.title
  }

  // 根据类型返回默认标题
  return props.pptData.type === 'theme' ? 'PPT主题' : 'PPT生成'
}

// 获取状态文本
function getStatusText() {
  if (props.pptData.status === 'processing') {
    return props.pptData.statusMessage || '正在生成PPT...'
  } else if (props.pptData.status === 'completed') {
    if (props.pptData.type === 'theme') {
      return `已生成${props.pptData.output?.themes?.length || 0}个主题选项`
    } else {
      // 从多种可能的数据结构中获取页数
      const pageCount =
        // 直接在output中的slides
        props.pptData.output?.slides?.length ||
        // 直接在output中的outline
        props.pptData.output?.outline?.length ||
        // 在pptData下的slides
        props.pptData.output?.pptData?.slides?.length ||
        // 在pptData下的outline
        props.pptData.output?.pptData?.outline?.length ||
        // pageCount属性
        props.pptData.output?.pptData?.pageCount ||
        props.pptData.output?.pageCount ||
        0
      return `生成完成，共${pageCount}页`
    }
  } else if (props.pptData.status === 'failed') {
    return props.pptData.error || '生成失败'
  }
  return '准备中...'
}

// 获取PPT完整数据
const pptFullData = computed(() => {
  // 优先返回直接包含slides的output
  if (props.pptData?.output?.slides) {
    return props.pptData.output
  }
  // 其次返回嵌套的pptData
  return props.pptData?.output?.pptData || null
})

// 打开PPT预览
function openPptPreview() {
  if (pptFullData.value) {
    globalStore.updatePptPreviewer(true, pptFullData.value)
  }
}
</script>

<template>
  <!-- 简化后的卡片容器，减少了不必要的嵌套 -->
  <div
    class="flex items-center justify-between max-w-full w-full px-5 py-4 text-base text-gray-800 dark:text-gray-100 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-sans leading-7 tracking-wide transition-all duration-300 hover:bg-gray-50 dark:hover:bg-gray-750 hover:shadow-sm"
    :class="isMobile ? '' : 'mr-10'"
    style="min-height: 80px"
  >
    <!-- 左侧信息 -->
    <div class="flex-1">
      <div class="text-base font-medium text-gray-900 dark:text-gray-100">
        {{ getPptTitle() }}
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {{ getStatusText() }}
      </div>
    </div>

    <!-- 右侧按钮/状态 -->
    <div class="ml-4">
      <!-- 生成中显示加载动画 -->
      <div v-if="pptData.status === 'processing'" class="flex items-center gap-2">
        <LoadingOne class="animate-spin" size="16" />
      </div>

      <!-- 完成后显示查看PPT按钮 -->
      <button
        v-else-if="pptData.status === 'completed' && pptFullData && !isShareMode"
        @click="openPptPreview"
        class="btn btn-primary btn-sm flex items-center gap-2"
      >
        <Icon icon="mdi:presentation-play" class="w-4 h-4" />
        查看PPT
      </button>

      <!-- 失败状态图标 -->
      <Icon
        v-else-if="pptData.status === 'failed'"
        icon="mdi:alert-circle"
        class="w-5 h-5 text-red-500"
      />
    </div>
  </div>
</template>
