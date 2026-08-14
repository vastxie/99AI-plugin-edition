<template>
  <!-- 简化后的卡片容器，减少了不必要的嵌套 -->
  <div
    class="flex flex-col max-w-full w-full text-base mb-2 text-gray-800 dark:text-gray-100 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-sans leading-7 tracking-wide transition-all duration-300"
    :class="[isMobile ? '' : 'mr-10']"
  >
    <!-- 卡片标题 -->
    <div class="px-5 pt-5 pb-3 border-b border-gray-200/30 dark:border-gray-700/30 text-center">
      <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
        {{ pptData.output?.title || pptData.input?.title || 'PPT主题选择' }}
      </h2>
      <p
        v-if="pptData.output?.subtitle || pptData.statusMessage"
        class="text-gray-600 dark:text-gray-400 mt-1 text-sm"
      >
        {{ pptData.output?.subtitle || pptData.statusMessage }}
      </p>
    </div>

    <!-- 卡片内容区域 -->
    <div class="px-5 py-4 flex-1 overflow-hidden">
      <!-- 主题选项列表 -->
      <div class="space-y-2">
        <div
          v-for="(theme, index) in pptData.output?.themes || []"
          :key="index"
          @click="selectTheme(theme, index)"
          class="p-3 rounded-lg border cursor-pointer transition-all duration-200"
          :class="
            selectedThemeIndex === index
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
          "
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h4 class="font-medium text-gray-900 dark:text-gray-100">
                {{ theme.title }}
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ theme.description }}
              </p>
            </div>
            <div class="ml-3">
              <div
                class="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                :class="
                  selectedThemeIndex === index
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-gray-300 dark:border-gray-600'
                "
              >
                <Icon
                  v-if="selectedThemeIndex === index"
                  icon="tabler:check"
                  class="w-3 h-3 text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部按钮区域 -->
    <div
      class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-b-lg"
    >
      <div class="flex justify-between items-center">
        <!-- PPT模式选择下拉菜单 -->
        <DropdownMenu
          v-model="dropdownOpen"
          position="top-left"
          min-width="200px"
          class="relative inline-block text-left"
        >
          <template #trigger>
            <div
              class="btn btn-secondary btn-md inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Icon icon="tabler:adjustments" class="w-4 h-4" />
              {{ selectedMode.title }}模式
              <Icon icon="tabler:chevron-down" class="w-4 h-4" />
            </div>
          </template>

          <template #menu="{ close }">
            <div>
              <div
                v-for="mode in pptModes"
                :key="mode.id"
                @click="
                  () => {
                    selectMode(mode)
                    close()
                  }
                "
                class="menu-item menu-item-md"
                :class="{ 'menu-item-active': selectedMode.id === mode.id }"
              >
                <div>
                  <div class="font-medium">{{ mode.title }}</div>
                  <div class="text-xs opacity-70 mt-0.5">
                    {{ mode.description }} · {{ mode.slideRange }}
                  </div>
                </div>
              </div>
            </div>
          </template>
        </DropdownMenu>

        <!-- 确认生成按钮 -->
        <button
          @click="handleConfirm"
          class="btn btn-primary btn-md flex items-center gap-2"
          :disabled="!selectedTheme || generating"
        >
          <Icon icon="tabler:check" v-if="!generating" />
          <Icon icon="eos-icons:loading" v-else class="animate-spin" />
          确认生成PPT
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { Icon } from '@iconify/vue'
import { inject, ref } from 'vue'

interface PPTTheme {
  title: string
  description: string
  keywords?: string[]
}

interface PPTMode {
  id: string
  title: string
  description: string
  slideRange: string
  value: string
}

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
      title?: string
      subtitle?: string
      themes?: PPTTheme[]
      pptData?: any
    }
    error?: string
    timestamp?: string
  }
  messageId: string
  conversationId: string
}

const props = defineProps<Props>()

const { isMobile } = useBasicLayout()

// 注入 onConversation 函数
const onConversation = inject<any>('onConversation')

const generating = ref(false)
const selectedTheme = ref<PPTTheme | null>(null)
const selectedThemeIndex = ref<number>(-1)

// PPT生成模式
const pptModes = ref<PPTMode[]>([
  {
    id: 'simple',
    title: '简单',
    description: '适合快速演示',
    slideRange: '10-15页',
    value: 'simple',
  },
  {
    id: 'normal',
    title: '普通',
    description: '标准展示内容',
    slideRange: '15-25页',
    value: 'normal',
  },
  {
    id: 'detailed',
    title: '详细',
    description: '深入分析讲解',
    slideRange: '30-40页',
    value: 'detailed',
  },
])

const selectedMode = ref<PPTMode>(pptModes.value[1]) // 默认选择普通模式

// 下拉菜单状态
const dropdownOpen = ref(false)

const selectTheme = (theme: PPTTheme, index: number) => {
  selectedTheme.value = theme
  selectedThemeIndex.value = index
}

const selectMode = (mode: PPTMode) => {
  selectedMode.value = mode
}

const handleConfirm = () => {
  if (!onConversation || !selectedTheme.value) {
    return
  }

  generating.value = true

  // 构建基于主题生成PPT的消息
  const message = `请基于以下主题生成PPT：

主题：${selectedTheme.value.title}
说明：${selectedTheme.value.description}
${selectedTheme.value.keywords ? `关键词：${selectedTheme.value.keywords.join('、')}` : ''}

要求：
- 生成模式：${selectedMode.value.title}（${selectedMode.value.description}）
- 页数范围：${selectedMode.value.slideRange}
- 请先生成详细的大纲，然后基于大纲生成完整的PPT内容`

  // 提交新的对话请求
  onConversation({
    msg: message,
    action: 'generate_ppt_from_theme',
    pptMode: selectedMode.value.value,
    selectedTheme: selectedTheme.value,
  })

  // 3秒后恢复按钮状态
  setTimeout(() => {
    generating.value = false
  }, 3000)
}
</script>
