<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { ShuffleOne } from '@icon-park/vue-next'
import { computed, ref } from 'vue'

interface MermaidChartOption {
  title: string
  values: string
}

interface CustomOption {
  paramName: string
  name: string
  options: Array<{
    value: string
    label: string
  }>
}

const props = defineProps({
  isMermaidModel: {
    type: Boolean,
    default: false,
  },
  customOptions: {
    type: Array as () => CustomOption[],
    default: () => [],
  },
  customOptionValues: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits<{
  'update-custom-option': [paramName: string, value: string]
  appendStyle: [style: string]
}>()

const { isMobile } = useBasicLayout()
const randomMermaidCharts = ref<string[]>([])
const useGlobalStore = useGlobalStoreWithOut()

const isImagePreviewerVisible = computed(() => useGlobalStore.showImagePreviewer)

// 定义mermaid图表类型数据
const mermaidChartTypes: MermaidChartOption[] = [
  { title: t('chat.flowchart'), values: t('chat.generateFlowchart') },
  { title: t('chat.sequenceDiagram'), values: t('chat.generateSequenceDiagram') },
  { title: t('chat.classDiagram'), values: t('chat.generateClassDiagram') },
  { title: t('chat.stateDiagram'), values: t('chat.generateStateDiagram') },
  { title: t('chat.entityRelationship'), values: t('chat.generateEntityRelationship') },
  { title: t('chat.userJourney'), values: t('chat.generateUserJourney') },
  { title: t('chat.ganttChart'), values: t('chat.generateGanttChart') },
  { title: t('chat.pieChart'), values: t('chat.generatePieChart') },
  { title: t('chat.quadrantChart'), values: t('chat.generateQuadrantChart') },
  { title: t('chat.requirementDiagram'), values: t('chat.generateRequirementDiagram') },
  { title: t('chat.gitGraph'), values: t('chat.generateGitGraph') },
  { title: t('chat.c4Diagram'), values: t('chat.generateC4Diagram') },
  { title: t('chat.mindMap'), values: t('chat.generateMindMap') },
  { title: t('chat.timeline'), values: t('chat.generateTimeline') },
  { title: t('chat.sankeyDiagram'), values: t('chat.generateSankeyDiagram') },
  { title: t('chat.xyChart'), values: t('chat.generateXYChart') },
  { title: t('chat.blockDiagram'), values: t('chat.generateBlockDiagram') },
]
// 初始化randomMermaidCharts或者在需要时更新它
const updateRandomMermaidCharts = () => {
  const shuffled = [...mermaidChartTypes].sort(() => 0.5 - Math.random())
  // 每次显示5个图表类型
  const displayCount = 5
  randomMermaidCharts.value = shuffled.slice(0, displayCount).map(chart => chart.title)
}

// 通过标题查找对应的mermaid图表模板
const appendMermaidChartToInput = (chartTitle: string) => {
  const chart = mermaidChartTypes.find(c => c.title === chartTitle)
  if (chart) {
    emit('appendStyle', chart.values)
  }
}

const getAspectRatioStyle = (aspectRatioString: string, fixedSize = 16) => {
  const [height, width] = aspectRatioString.split(' / ').map(Number)
  const aspectRatio = height / width

  // 当宽度大于高度时，固定高度，动态调整宽度
  if (width > height) {
    return {
      width: `${fixedSize * aspectRatio}px`, // 宽度根据比例动态调整
      height: `${fixedSize}px`, // 固定高度
    }
  }
  // 当高度大于或等于宽度时，固定宽度，动态调整高度
  else {
    return {
      width: `${fixedSize}px`, // 固定宽度
      height: `${fixedSize / aspectRatio}px`, // 高度根据比例动态调整
    }
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

// 解析自定义选项值中的比例信息
const parseAspectRatio = (value: string) => {
  // 支持多种格式：
  // "16:9" -> { height: 16, width: 9 }
  // "16/9" -> { height: 16, width: 9 }
  // "1:1" -> { height: 1, width: 1 }
  // "16 9" -> { height: 16, width: 9 }
  // "2048x2048" -> { height: 2048, width: 2048 }
  // "1024*1024" -> { height: 1024, width: 1024 }
  if (!value) return null

  // 尝试匹配 "数字x数字" 或 "数字*数字" 格式(如 2048x2048, 1024*1024)
  const pixelMatch = value.match(/(\d+)\s*[x*]\s*(\d+)/i)
  if (pixelMatch) {
    const height = parseInt(pixelMatch[1], 10)
    const width = parseInt(pixelMatch[2], 10)
    // 计算最大公约数来简化比例
    const divisor = gcd(height, width)
    return {
      height,
      width,
      aspectRatio: `${height / divisor} / ${width / divisor}`,
    }
  }

  // 尝试匹配 "数字:数字" 或 "数字/数字" 格式
  const ratioMatch = value.match(/(\d+)\s*[:/]\s*(\d+)/)
  if (ratioMatch) {
    const height = parseInt(ratioMatch[1], 10)
    const width = parseInt(ratioMatch[2], 10)
    return { height, width, aspectRatio: `${height} / ${width}` }
  }

  return null
}

// 判断自定义选项是否需要显示比例预览框
const shouldShowPreview = (paramName: string) => {
  return paramName === 'size' || paramName === 'aspect_ratio'
}

// 初始化随机mermaid图表
updateRandomMermaidCharts()

// 添加下拉菜单状态管理
const dropdownStates = ref<Record<string, boolean>>({})
</script>

<template>
  <div class="toolbar-options w-full min-w-0 bg-transparent">
    <!-- Mermaid图表类型按钮 -->
    <div
      v-if="isMermaidModel && !isMobile && !isImagePreviewerVisible"
      class="toolbar-options-scroll custom-scrollbar"
    >
      <button
        v-for="(chartType, index) in randomMermaidCharts"
        :key="index"
        @click="appendMermaidChartToInput(chartType)"
        class="btn btn-secondary btn-md mx-1 whitespace-nowrap"
      >
        {{ chartType }}
      </button>

      <button
        @click="updateRandomMermaidCharts"
        class="btn btn-secondary btn-md mx-1 whitespace-nowrap"
      >
        <ShuffleOne theme="outline" size="16" class="" />
      </button>
    </div>

    <div
      v-if="customOptions.length"
      class="menu-container toolbar-options-scroll toolbar-custom-options custom-scrollbar bg-transparent"
    >
      <div class="toolbar-custom-options-inner">
        <!-- 自定义选项 -->
        <DropdownMenu
          v-for="customOption in customOptions"
          :key="customOption.paramName"
          v-model="dropdownStates[`custom_${customOption.paramName}`]"
          position="top-right"
          :min-width="shouldShowPreview(customOption.paramName) ? '160px' : '112px'"
          max-height="30vh"
          teleport
          :z-index="99999"
          class="relative inline-block flex-shrink-0 text-left group mt-1 mb-2"
        >
          <template #trigger>
            <div
              class="btn btn-secondary btn-md inline-flex w-full justify-center whitespace-nowrap cursor-pointer"
            >
              {{ customOption.name }}：{{
                customOption.options.find(
                  opt => opt.value === customOptionValues[customOption.paramName]
                )?.label || customOption.options[0]?.label
              }}
            </div>
          </template>

          <template #menu="{ close }">
            <div>
              <div
                v-for="(option, index) in customOption.options"
                :key="index"
                @click="
                  () => {
                    emit('update-custom-option', customOption.paramName, option.value)
                    close()
                  }
                "
                :class="[
                  'menu-item menu-item-md',
                  shouldShowPreview(customOption.paramName) ? 'flex items-center' : '',
                ]"
              >
                <!-- 如果是 size 或 aspect_ratio 参数，显示比例预览框 -->
                <template v-if="shouldShowPreview(customOption.paramName)">
                  <div class="flex flex-1 justify-center mr-3">
                    <div
                      v-if="parseAspectRatio(option.value)"
                      :style="getAspectRatioStyle(parseAspectRatio(option.value)!.aspectRatio)"
                      class="flex border border-gray-500 dark:border-gray-300 rounded-sm"
                    ></div>
                    <div v-else class="w-4 h-4"></div>
                  </div>
                  <div class="w-28">
                    {{ option.label }}
                  </div>
                </template>
                <!-- 其他参数正常显示 -->
                <template v-else>
                  {{ option.label }}
                </template>
              </div>
            </div>
          </template>
        </DropdownMenu>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-options {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.toolbar-options-scroll {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.25rem 0.5rem 0.5rem;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

.toolbar-custom-options {
  flex: 1 1 auto;
}

.toolbar-custom-options-inner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: max-content;
  margin-left: auto;
}
</style>
