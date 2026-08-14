<template>
  <div class="flex flex-col gap-1 tool-card-wrapper">
    <!-- 搜索目的说明（如果有） -->
    <div
      v-if="searchExplanation"
      class="text-base text-gray-800 dark:text-gray-200 mb-1 search-explanation"
    >
      {{ searchExplanation }}
    </div>

    <!-- 普通工具执行卡片 -->
    <div
      class="transition-all duration-300 ease-out rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col my-0 min-h-[2.625rem] overflow-hidden relative max-w-full"
      :class="{
        'tool-card-animated': shouldAnimate,
        'bg-gray-50 dark:bg-gray-800 shadow-sm': expanded,
        'hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-sm': !expanded,
      }"
      :style="{ 'animation-delay': animationDelay }"
    >
      <!-- 主要状态栏 -->
      <button
        @click="toggleExpanded"
        class="group flex flex-row items-center justify-between gap-4 transition-colors duration-200 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 min-h-[2.625rem] py-2 px-3 cursor-pointer"
      >
        <div class="flex flex-row items-center gap-2 min-w-0 flex-1">
          <!-- 图标 -->
          <component :is="toolIcon" theme="outline" size="16" class="shrink-0" />

          <!-- 状态文本 -->
          <div
            class="font-base text-left leading-tight overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0"
          >
            <span class="block truncate">
              {{ displayText }}
            </span>
          </div>
        </div>

        <div class="flex flex-row items-center gap-1.5 min-w-0 shrink-0">
          <!-- 状态指示器 -->
          <LoadingOne v-if="loading" class="animate-spin" size="16" />
          <CheckOne v-else-if="success" class="text-green-600 dark:text-green-400" size="16" />
          <CloseOne v-else-if="error" class="text-red-600 dark:text-red-400" size="16" />

          <!-- 展开/收起箭头 -->
          <div
            v-if="hasDetails"
            class="flex items-center justify-center transform transition-transform duration-300"
            :class="{ '-rotate-180': expanded }"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M14.128 7.16482C14.3126 6.95983 14.6298 6.94336 14.835 7.12771C15.0402 7.31242 15.0567 7.62952 14.8721 7.83477L10.372 12.835L10.2939 12.9053C10.2093 12.9667 10.1063 13 9.99995 13C9.85833 12.9999 9.72264 12.9402 9.62788 12.835L5.12778 7.83477L5.0682 7.75273C4.95072 7.55225 4.98544 7.28926 5.16489 7.12771C5.34445 6.96617 5.60969 6.95939 5.79674 7.09744L5.87193 7.16482L9.99995 11.7519L14.128 7.16482Z"
              />
            </svg>
          </div>
        </div>
      </button>

      <!-- 展开的详情内容 -->
      <transition name="slide-fade">
        <div v-if="expanded && hasDetails" class="overflow-hidden">
          <div class="px-3 pb-3 pt-0">
            <!-- 统一格式渲染 -->
            <div class="flex flex-col gap-2">
              <!-- 输出结果 -->
              <div v-if="tool.output" class="text-sm">
                <!-- 搜索结果列表 -->
                <div
                  v-if="isSearchResults(tool.output)"
                  class="flex flex-col gap-1 max-h-96 overflow-y-auto overflow-x-hidden custom-scrollbar"
                >
                  <a
                    v-for="(result, idx) in tool.output"
                    :key="idx"
                    :href="result.url || result.link"
                    target="_blank"
                    class="flex flex-row items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group/link"
                  >
                    <!-- 网站图标 -->
                    <img
                      :src="getFavicon(result)"
                      :alt="getDomain(result)"
                      class="w-4 h-4 shrink-0 rounded"
                      @error="handleFaviconError"
                    />

                    <!-- 标题和域名 -->
                    <div class="flex-1 min-w-0 overflow-hidden">
                      <p
                        class="text-sm text-gray-800 dark:text-gray-200 truncate group-hover/link:underline"
                      >
                        {{ idx + 1 }}. {{ result.title }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-500 truncate">
                        {{ getDomain(result) }}
                      </p>
                    </div>
                  </a>
                </div>

                <!-- 文件分析结果 -->
                <div
                  v-else-if="isFileSearchResult(tool)"
                  class="flex flex-col gap-1 max-h-96 overflow-y-auto overflow-x-hidden custom-scrollbar"
                >
                  <div
                    v-for="(item, idx) in getFileSearchResults(tool.output)"
                    :key="idx"
                    class="flex flex-row items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 group/file"
                  >
                    <!-- 文件名和内容预览 -->
                    <div class="flex-1 min-w-0 overflow-hidden">
                      <p class="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {{ idx + 1 }}. {{ item.fileName || '未知文件' }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-500 truncate">
                        {{ (item.content || '').substring(0, 100)
                        }}{{ (item.content || '').length > 100 ? '...' : '' }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- 错误信息 -->
                <div v-else-if="tool.status === 'error'" class="text-red-600 dark:text-red-400">
                  {{ tool.output }}
                </div>

                <!-- MCP工具结果 -->
                <div
                  v-else-if="isMcpOutput(tool)"
                  class="text-gray-700 dark:text-gray-300 max-h-96 overflow-y-auto overflow-x-hidden custom-scrollbar"
                >
                  <div class="whitespace-pre-wrap font-mono text-xs break-words p-2 rounded">
                    {{ extractMcpResult(tool.output) }}
                  </div>
                </div>

                <!-- 通用输出 -->
                <div
                  v-else
                  class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words"
                >
                  {{ formatOutput(tool.output) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hasToolAnimated, markToolAnimated } from '@/composables/useToolAnimation'
import {
  CheckOne,
  CloseOne,
  FileSearchOne,
  LoadingOne,
  Sphere,
  TreasureChest,
} from '@icon-park/vue-next'
import { computed, onMounted, onUnmounted, onUpdated, ref } from 'vue'

// 统一的工具执行格式
interface MinimalToolExecution {
  name: string // 工具名称
  status: string // 状态: loading | success | error
  input: any // 输入参数
  output: any // 输出结果
  time: number // 时间戳
  type?: string // 工具类型（可选）
}

const props = defineProps<{
  tool: MinimalToolExecution
  cardIndex?: number // 卡片索引，用于控制动画延迟
  messageId?: number // 消息ID，用于动画状态管理
}>()

// 控制动画播放
const shouldAnimate = ref(false)

// 添加更新日志
onUpdated(() => {
  // 工具卡片更新
})

onUnmounted(() => {
  // 工具卡片卸载
})

// 计算动画延迟
const animationDelay = computed(() => {
  if (!shouldAnimate.value || props.cardIndex === undefined) return ''
  return `${props.cardIndex * 50}ms`
})

onMounted(() => {
  // 使用全局的动画状态管理
  const toolName = props.tool.name
  const toolTime = props.tool.time

  // 检查该工具是否已经播放过动画
  if (!hasToolAnimated(props.messageId, toolName, toolTime)) {
    // 添加微小延迟，确保DOM已稳定
    requestAnimationFrame(() => {
      shouldAnimate.value = true
      markToolAnimated(props.messageId, toolName, toolTime)
    })
  }
})

const expanded = ref(false)
// 文件内容展开状态（每个文件单独控制）
const fileContentExpanded = ref<Record<number, boolean>>({})

// 智能推断工具名称
const inferToolName = () => {
  if (props.tool.name) return props.tool.name

  // 根据 type 推断
  if (props.tool.type === 'search') return '联网搜索'
  if (props.tool.type === 'file') return '文件搜索'
  if (props.tool.type === 'mcp') return 'MCP工具'

  return '工具调用'
}

// 提取搜索目的说明
const searchExplanation = computed(() => {
  // 只对搜索类工具显示说明
  const toolName = inferToolName()
  if (props.tool.type !== 'search' && !toolName.includes('搜索')) {
    return null
  }

  // 从 input 中提取 explanation
  if (typeof props.tool.input === 'object' && props.tool.input?.explanation) {
    return props.tool.input.explanation
  }

  return null
})

// 智能推断状态
const inferStatus = () => {
  // 优先使用显式的status
  if (props.tool.status) {
    return props.tool.status
  }

  // 如果有输出，认为是成功
  if (
    props.tool.output &&
    (Array.isArray(props.tool.output) ? props.tool.output.length > 0 : true)
  ) {
    return 'success'
  }

  // 没有status且没有output，可能仍在加载中
  return 'loading' // 默认loading而非success
}

// 根据工具类型选择图标
const toolIcon = computed(() => {
  const type = props.tool.type || ''
  const name = (props.tool.name || '').toLowerCase()

  if (type === 'search' || name.includes('搜索') || name.includes('search')) {
    return Sphere
  } else if (
    type === 'file_search' ||
    type === 'file' ||
    name.includes('文档分析') ||
    name.includes('文件')
  ) {
    return FileSearchOne
  } else {
    return TreasureChest
  }
})

// 状态
const loading = computed(() => inferStatus() === 'loading')
const success = computed(() => inferStatus() === 'success')
const error = computed(() => inferStatus() === 'error')

// 显示文本
const displayText = computed(() => {
  const tool = props.tool
  const name = inferToolName()
  const status = inferStatus()

  if (status === 'loading') {
    // 加载中的统一处理
    const query =
      typeof tool.input === 'string' ? tool.input : tool.input?.query || tool.input?.q || ''
    if (query && name.includes('搜索')) {
      return `正在搜索"${query}"...`
    } else if (tool.type === 'file_search') {
      return `正在分析文档...`
    }
    return `正在调用 ${name}...`
  } else if (status === 'error') {
    // 错误状态
    return `${name} 失败`
  } else if (status === 'success') {
    // 成功状态，根据输出内容决定显示方式

    // 检查是否是搜索结果格式（数组且包含url/link的对象）
    if (isSearchResults(tool.output)) {
      const query =
        typeof tool.input === 'string' ? tool.input : tool.input?.query || tool.input?.q || ''
      const resultCount = tool.output.length
      if (resultCount > 0) {
        return `搜索"${query}" - ${resultCount} 条结果`
      } else {
        return `${name} 已完成`
      }
    }

    // 文件分析结果
    if (isFileSearchResult(tool)) {
      const results = getFileSearchResults(tool.output)
      if (results && results.length > 0) {
        return `已阅读 ${results.length} 段相关文本`
      }
    }

    // 对于其他所有工具，不管是否有结果，都显示"已完成"
    return `${name} 已完成`
  }

  return name
})

// 是否有详情可展示
const hasDetails = computed(() => {
  return !!(props.tool.output || props.tool.input)
})

// 切换展开状态
const toggleExpanded = () => {
  if (hasDetails.value) {
    expanded.value = !expanded.value
  }
}

// 判断是否是搜索结果数组
const isSearchResults = (output: any): output is Array<any> => {
  if (!Array.isArray(output)) return false
  if (output.length === 0) return false

  const first = output[0]
  // 检查是否符合搜索结果格式（title + url/link）
  return !!(first && first.title && (first.url || first.link || first.domain))
}

// 格式化输入

// 判断是否是MCP工具输出
const isMcpOutput = (tool: any): boolean => {
  // 首先检查工具类型
  if (tool.type === 'mcp') return true

  // 检查工具名称
  const name = (tool.name || '').toLowerCase()
  if (
    name.includes('_repositories') ||
    name.includes('github') ||
    name.includes('mcp') ||
    name.includes('api_') ||
    name.includes('tool_') ||
    name.includes('execute_') ||
    name.includes('call_')
  ) {
    return true
  }

  // 检查输出格式（包含【工具】标记的，或包含content/type的结构）
  if (typeof tool.output === 'string') {
    if (tool.output.includes('【工具')) return true
    // 检查是否是包装的JSON内容
    try {
      const parsed = JSON.parse(tool.output)
      if (parsed.content && Array.isArray(parsed.content)) {
        return true
      }
    } catch {
      // 不是JSON，继续检查
    }
  }

  // 检查输出是否是特定的JSON结构
  if (
    tool.output &&
    typeof tool.output === 'object' &&
    tool.output.content &&
    Array.isArray(tool.output.content)
  ) {
    return true
  }

  return false
}

// 提取MCP结果内容
const extractMcpResult = (output: any): string => {
  if (typeof output === 'string') {
    // 如果包含【工具】标记，提取实际内容
    const match = output.match(/【工具[^】]*】\s*([\s\S]*)/)
    if (match && match[1]) {
      const content = match[1].trim()
      // 尝试格式化JSON
      try {
        const parsed = JSON.parse(content)
        return JSON.stringify(parsed, null, 2)
      } catch {
        // 不是JSON，返回原始内容
        return content
      }
    }

    // 检查是否是包装的JSON格式 {"content": [{"type": "text", "text": "..."}]}
    try {
      const parsed = JSON.parse(output)
      if (parsed.content && Array.isArray(parsed.content)) {
        // 提取content中的实际文本
        const textContent = parsed.content
          .filter((item: { type: string }) => item.type === 'text')
          .map((item: { text: any }) => item.text)
          .join('\n')

        // 尝试进一步解析内部的JSON
        if (textContent) {
          try {
            const innerParsed = JSON.parse(textContent)
            return JSON.stringify(innerParsed, null, 2)
          } catch {
            // 内部不是JSON，返回文本内容
            return textContent
          }
        }
      }
      // 如果不是特殊格式，直接格式化
      return JSON.stringify(parsed, null, 2)
    } catch {
      // 不是JSON，返回原始内容
      return output
    }
  }

  // 对象类型
  if (output && typeof output === 'object') {
    // 检查是否是包装的content格式
    if (output.content && Array.isArray(output.content)) {
      const textContent = output.content
        .filter((item: { type: string }) => item.type === 'text')
        .map((item: { text: any }) => item.text)
        .join('\n')

      if (textContent) {
        try {
          const parsed = JSON.parse(textContent)
          return JSON.stringify(parsed, null, 2)
        } catch {
          return textContent
        }
      }
    }

    // 格式化为JSON
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }

  return String(output)
}

// 格式化输出
const formatOutput = (output: any): string => {
  if (typeof output === 'string') {
    return output
  }
  return JSON.stringify(output, null, 2)
}

// 获取域名
const getDomain = (result: any) => {
  if (result.domain) return result.domain
  if (result.url || result.link) {
    try {
      const url = new URL(result.url || result.link)
      return url.hostname
    } catch {
      return ''
    }
  }
  return ''
}

// 获取网站图标
const getFavicon = (result: any) => {
  if (result.url || result.link) {
    try {
      const url = new URL(result.url || result.link)
      return `${url.protocol}//${url.hostname}/favicon.ico`
    } catch {
      return getDefaultIcon()
    }
  }
  return getDefaultIcon()
}

// 默认图标
const getDefaultIcon = () => {
  return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIj48L2NpcmNsZT48bGluZSB4MT0iMiIgeTE9IjEyIiB4Mj0iMjIiIHkyPSIxMiI+PC9saW5lPjxwYXRoIGQ9Ik0xMiAyYTE1LjMgMTUuMyAwIDAgMSA0IDEwIDE1LjMgMTUuMyAwIDAgMS00IDEwIDE1LjMgMTUuMyAwIDAgMS00LTEwIDE1LjMgMTUuMyAwIDAgMSA0LTEweiI+PC9wYXRoPjwvc3ZnPg=='
}

// 处理图标加载错误
const handleFaviconError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.src = getDefaultIcon()
}

// 判断是否是文件搜索结果
const isFileSearchResult = (tool: any): boolean => {
  // 检查工具类型
  if (tool.type === 'file_search') {
    return true
  }

  // 检查工具名称
  const name = (tool.name || '').toLowerCase()
  if (name.includes('文档分析') || name.includes('文件分析')) {
    return true
  }

  // 检查输出格式（formattedResults 数组）
  if (tool.output) {
    // 字符串输出，尝试解析
    if (typeof tool.output === 'string') {
      try {
        const parsed = JSON.parse(tool.output)
        if (parsed.formattedResults && Array.isArray(parsed.formattedResults)) {
          return true
        }
      } catch {
        // 不是JSON
      }
    }

    // 对象输出
    if (
      typeof tool.output === 'object' &&
      tool.output.formattedResults &&
      Array.isArray(tool.output.formattedResults)
    ) {
      return true
    }
  }

  return false
}

// 获取文件搜索结果
const getFileSearchResults = (output: any): any[] => {
  if (!output) return []

  // 字符串输出，尝试解析
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output)
      if (parsed.formattedResults && Array.isArray(parsed.formattedResults)) {
        return parsed.formattedResults
      }
    } catch {
      // 不是JSON
    }
  }

  // 对象输出
  if (
    typeof output === 'object' &&
    output.formattedResults &&
    Array.isArray(output.formattedResults)
  ) {
    return output.formattedResults
  }

  // 如果直接就是数组格式（formattedResults）
  if (
    Array.isArray(output) &&
    output.length > 0 &&
    output[0].similarity !== undefined &&
    output[0].content
  ) {
    return output
  }

  return []
}

// 格式化相似度显示

// 切换文件内容展开状态

// 监听点击外部事件，自动折叠
const handleClickOutside = (event: MouseEvent) => {
  // 检查点击是否在文件分析区域外
  const target = event.target as HTMLElement
  const fileAnalysisCard = target.closest('.file-analysis-card')

  // 如果点击在文件分析卡片外部，折叠所有展开的内容
  if (!fileAnalysisCard) {
    Object.keys(fileContentExpanded.value).forEach(key => {
      fileContentExpanded.value[parseInt(key, 10)] = false
    })
  }
}

// 展开动画

// 折叠动画

// 组件挂载时添加点击监听
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* 工具卡片渐入动画 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 搜索说明文字动画 */
.search-explanation {
  animation: fadeInUp 0.4s ease-out;
}

/* 工具卡片主体动画 - 仅在有该类名时播放 */
.tool-card-animated {
  animation: fadeInScale 0.3s ease-out;
  animation-fill-mode: both;
}

/* 展开内容的过渡动画 */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* 自定义滚动条样式 */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.7);
}

/* 暗色主题下的滚动条 */
.dark .custom-scrollbar {
  scrollbar-color: rgba(75, 85, 99, 0.5) transparent;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(75, 85, 99, 0.5);
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(75, 85, 99, 0.7);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.7);
}

/* 文件内容展开/折叠动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease-out;
  overflow: hidden;
}

.slide-down-enter-from {
  height: 0;
  opacity: 0;
}

.slide-down-leave-to {
  height: 0;
  opacity: 0;
}
</style>
