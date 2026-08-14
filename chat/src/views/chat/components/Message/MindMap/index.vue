<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { Copy, Delete, Edit } from '@icon-park/vue-next'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const { isMobile } = useBasicLayout()

interface Props {
  chatId?: number
  inversion?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  asRawText?: boolean
  ttsUrl?: string
  model?: string
  drawId?: string
  extend?: string
  customId?: string
  modelName?: string
  index?: number
}

interface Emit {
  (ev: 'delete'): void
  (ev: 'copy'): void
}

const transformer = new Transformer()

const props = defineProps<Props>()

const emit = defineEmits<Emit>()
const svgRef = ref()

const textRef = ref<HTMLElement>()
const globalStore = useGlobalStoreWithOut()

// 从内容中提取第一个一级标题
const extractTitle = computed(() => {
  const lines = props.content?.split('\n') || []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }
  return '思维导图'
})

let updateTimeout: string | number | NodeJS.Timeout | null | undefined = null
let mm: Markmap | undefined

onMounted(() => {
  mm = Markmap.create(svgRef.value, { paddingX: 16 })
  if (props.content) {
    renderMarkmap()
  }
})

const renderMarkmap = () => {
  if (updateTimeout) clearTimeout(updateTimeout)

  updateTimeout = setTimeout(() => {
    if (!props.content || !mm) return

    try {
      const { root } = transformer.transform(props.content)
      mm.setData(root)

      // 确保在DOM更新和字体加载后执行fit
      nextTick(() => {
        const refit = () => {
          if (mm) mm.fit()
        }
        if (document.fonts?.ready) {
          document.fonts.ready.then(refit)
        } else {
          // Fallback
          setTimeout(refit, 0)
        }
      })
    } catch (error) {}
  }, 100) // 减少延迟以提高响应性
}

// 监听content变化，实现渐进式渲染
watch(
  () => props.content,
  (newContent, oldContent) => {
    // 只有内容真正发生变化时才重新渲染
    if (newContent !== oldContent && newContent) {
      // MindMap内容已更新
      renderMarkmap()
    }
  },
  { immediate: false }
)

// 同时监听loading状态，当loading结束时也触发一次渲染
watch(
  () => props.loading,
  (newLoading, oldLoading) => {
    // 当loading从true变为false时，确保最终渲染
    if (oldLoading && !newLoading && props.content) {
      // MindMap loading完成，执行最终渲染
      setTimeout(() => {
        renderMarkmap()
      }, 200)
    }
  }
)

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

// 修改为使用HTML预览器显示思维导图
const showFullscreen = () => {
  if (props.content && props.content.trim() !== '') {
    // 设置全局存储的内容和类型
    globalStore.updateHtmlContent(props.content, 'markmap')
    // 打开HTML预览器
    globalStore.updateHtmlPreviewer(true)
  }
}

defineExpose({ textRef })
</script>

<template>
  <div class="flex flex-col group max-w-full w-full">
    <div ref="textRef" class="leading-relaxed break-words w-full">
      <div class="w-full flex flex-col items-start" :class="isMobile ? '' : 'pr-10'">
        <!-- 卡片容器 -->
        <div
          class="w-full text-base text-gray-800 dark:text-gray-100 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 p-0 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col relative font-sans leading-7 tracking-wide transition-all duration-300"
          style="width: 100%"
        >
          <!-- 卡片标题 -->
          <div
            class="px-5 pt-3 pb-3 flex-shrink-0 border-b border-gray-200/30 dark:border-gray-700/30 relative"
          >
            <div
              class="font-medium mb-0 text-gray-900 dark:text-gray-200 text-center text-lg pb-2 relative"
            >
              {{ extractTitle }}
              <div
                class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[60px] h-[1px] bg-gradient-to-r from-transparent via-primary-500 to-transparent rounded"
              ></div>
            </div>

            <!-- 编辑按钮（原全屏按钮）放到右上角 -->
            <div class="group-btn absolute top-3 right-3">
              <button
                @click="showFullscreen"
                class="btn-icon btn-md btn-icon-action"
                aria-label="编辑思维导图"
              >
                <Edit size="18" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-left">编辑思维导图</div>
            </div>
          </div>

          <!-- 卡片内容区域 -->
          <div @click="showFullscreen" class="px-5 py-4 flex-1 overflow-hidden relative">
            <div class="flex w-full relative">
              <svg
                ref="svgRef"
                class="box-border w-full h-[40vh] dark:text-gray-100"
                draggable="false"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-300 text-gray-700 opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-2 flex group">
          <!-- 复制按钮 -->
          <div class="relative group-btn">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleCopy"
              aria-label="复制"
            >
              <Copy />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">复制</div>
          </div>

          <!-- 删除按钮 -->
          <div class="relative group-btn">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleDelete"
              aria-label="删除"
            >
              <Delete />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">删除</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
