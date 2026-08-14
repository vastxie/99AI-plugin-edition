<script setup lang="ts">
import { useChatStore } from '@/store/modules/chat'
import { sanitizeSvgContent } from '@/utils/sanitizeHtml'
import { computed, ref, watch, watchEffect } from 'vue'

const chatStore = useChatStore()
const customKeyId = ref(100)
const dataSources = computed(() => chatStore.groupList)
const groupKeyWord = computed(() => chatStore.groupKeyWord)

// 默认插件列表
const defaultPlugins: any[] = [
  // {
  //   pluginId: '1',
  //   pluginName: '思维导图',
  //   description: '支持思维导图的创建、编辑、分享、查看等功能',
  //   pluginImg: mindmap,
  //   parameters: 'usingMindMap',
  // },
  // {
  //   pluginName: 'Midjourney',
  //   description: '使用 Midjourney 绘图, 为你的创意添加更多可能性',
  //   pluginImg: midjourney,
  //   parameters: 'midjourney',
  // },
  {
    pluginId: '2',
    pluginName: 'Mermaid流程图',
    description: '支持Mermaid流程图的创建、编辑和查看，轻松可视化流程和关系',
    pluginImg: '',
    parameters: 'mermaid',
    drawingType: 0,
  },
  {
    pluginId: '3',
    pluginName: 'PPT生成器',
    description: '智能生成PPT演示文稿，包含大纲规划、内容生成和格式化功能',
    pluginImg: '',
    parameters: 'ppt-generation',
    drawingType: 0,
  },
]

// 计算属性插件列表
const pluginList = computed(() =>
  chatStore.pluginList?.length ? chatStore.pluginList : defaultPlugins
)

watch(dataSources, () => (customKeyId.value = customKeyId.value + 1))
watch(groupKeyWord, () => (customKeyId.value = customKeyId.value + 1))
const usingPlugin = computed(() => chatStore.currentPlugin)

dataSources.value.filter(item =>
  groupKeyWord.value ? item.title.includes(groupKeyWord.value) && item.isSticky : item.isSticky
)

function toggleSelection(plugin: any) {
  if (usingPlugin.value?.parameters === plugin.parameters) {
    // Clear the current plugin because it is already selected
    chatStore.setUsingPlugin(null) // Clear the selection
  } else {
    // Set the current plugin to the selected plugin
    chatStore.setUsingPlugin(plugin)
  }
}

// SVG 支持相关逻辑
const svgContents = ref<Record<string, string>>({})
const loadingStates = ref<Record<string, boolean>>({})

// 检查是否为 SVG 源代码
function isSvgCode(content: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  return trimmed.startsWith('<svg') && trimmed.includes('</svg>')
}

// 检查是否为 SVG URL
function isSvgUrl(url: string): boolean {
  if (!url) return false
  const urlWithoutQuery = url.split('?')[0].toLowerCase()
  return urlWithoutQuery.endsWith('.svg')
}

// 清理和处理 SVG 内容
function sanitizeSvg(svgText: string): string {
  return sanitizeSvgContent(svgText)
}

// 获取 SVG 内容（支持源代码和 URL）
async function fetchSvgContent(content: string, pluginId: string) {
  if (!content || svgContents.value[pluginId]) return

  // 如果是 SVG 源代码，直接处理
  if (isSvgCode(content)) {
    svgContents.value[pluginId] = sanitizeSvg(content)
    return
  }

  // 如果是 SVG URL，则 fetch
  if (!isSvgUrl(content)) return

  loadingStates.value[pluginId] = true
  try {
    const response = await fetch(content)
    if (!response.ok) throw new Error('Failed to fetch SVG')

    const svgText = await response.text()
    svgContents.value[pluginId] = sanitizeSvg(svgText)
  } catch (error) {
  } finally {
    loadingStates.value[pluginId] = false
  }
}

// 检查是否应该渲染 SVG（源代码或 URL）
function shouldRenderSvg(content: string): boolean {
  return isSvgCode(content) || isSvgUrl(content)
}

// 监听插件列表变化，预加载 SVG
watchEffect(() => {
  pluginList.value.forEach(plugin => {
    if (plugin.pluginImg && shouldRenderSvg(plugin.pluginImg)) {
      fetchSvgContent(plugin.pluginImg, plugin.pluginId || plugin.parameters)
    }
  })
})
</script>

<template>
  <div class="custom-scrollbar flex flex-col gap-3 px-4 py-1 overflow-y-auto h-full">
    <div
      v-for="plugin in pluginList"
      :key="plugin.parameters"
      class="select-none relative h-26 bg-white shadow flex flex-col items-start gap-3 px-3 py-1 break-all rounded-lg cursor-pointer group font-medium dark:bg-gray-800"
      role="region"
      :aria-label="`${plugin.pluginName}插件卡片`"
    >
      <div class="flex items-center w-full my-1 min-w-0">
        <div class="flex items-center space-x-2 flex-1 min-w-0">
          <!-- 头像部分 -->
          <div
            class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-500 flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 flex-shrink-0"
          >
            <!-- SVG 内联渲染（支持源代码和 URL） -->
            <div
              v-if="
                plugin.pluginImg &&
                shouldRenderSvg(plugin.pluginImg) &&
                svgContents[plugin.pluginId || plugin.parameters]
              "
              v-html="svgContents[plugin.pluginId || plugin.parameters]"
              class="w-full h-full flex items-center justify-center"
            />
            <!-- 普通图片渲染 -->
            <img
              v-else-if="plugin.pluginImg && !shouldRenderSvg(plugin.pluginImg)"
              :src="plugin.pluginImg"
              :alt="`${plugin.pluginName}插件图标`"
              class="w-full h-full object-cover"
            />
            <!-- 加载状态 -->
            <div
              v-else-if="plugin.pluginImg && loadingStates[plugin.pluginId || plugin.parameters]"
              class="w-full h-full flex items-center justify-center"
            >
              <div
                class="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"
              ></div>
            </div>
            <!-- 文本回退 -->
            <span v-else class="text-sm font-medium">
              {{ plugin.pluginName.charAt(0) }}
            </span>
          </div>

          <!-- 名称部分 -->
          <span
            class="line-clamp-1 overflow-hidden text-ellipsis block whitespace-nowrap font-medium text-base text-gray-700 dark:text-gray-100 flex-1 min-w-0"
          >
            {{ plugin.pluginName }}
          </span>
        </div>

        <!-- 开关控件部分，确保固定宽度和位置 -->
        <div class="flex-shrink-0 ml-2">
          <button
            :class="[
              'group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none',
            ]"
            @click.prevent="toggleSelection(plugin)"
            role="switch"
            :aria-checked="usingPlugin?.parameters === plugin.parameters"
            :aria-label="`${usingPlugin?.parameters === plugin.parameters ? '禁用' : '启用'}${plugin.pluginName}插件`"
          >
            <span
              aria-hidden="true"
              class="pointer-events-none absolute h-full w-full rounded-full bg-white dark:bg-transparent"
            ></span>
            <span
              aria-hidden="true"
              :class="[
                usingPlugin?.parameters === plugin.parameters
                  ? 'bg-indigo-600'
                  : 'bg-gray-200 dark:bg-gray-700',
                'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out',
              ]"
            ></span>
            <span
              aria-hidden="true"
              :class="[
                usingPlugin?.parameters === plugin.parameters ? 'translate-x-5' : 'translate-x-0',
                'pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-500 shadow ring-0 transition-transform duration-200 ease-in-out',
              ]"
            ></span>
          </button>
        </div>
      </div>

      <div>
        <span class="min-h-[2rem] text-xs line-clamp-2 text-gray-600 dark:text-gray-400 mb-2">
          {{ plugin.description }}
        </span>
      </div>
    </div>
  </div>
</template>
