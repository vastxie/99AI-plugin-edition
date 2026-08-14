<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { computed } from 'vue'

// 接收父组件传递的选中分类
interface Props {
  isHideDefaultPreset: boolean
  selectedCategory?: string
  presetData?: any[]
}

const { isMobile } = useBasicLayout()
const props = withDefaults(defineProps<Props>(), {
  selectedCategory: '全部',
  presetData: () => [],
})
const emit = defineEmits<{
  (
    e: 'click',
    box: {
      appId?: number
      prompt: any
      pluginParameters?: string
    }
  ): void
}>()

// 根据选中分类筛选预设
const filteredItems = computed(() => {
  // 只使用从后端获取的数据，如果没有数据则返回空数组
  const dataSource = props.presetData || []

  if (props.selectedCategory === '全部') {
    return dataSource
  }
  return dataSource.filter((item: any) => item.category === props.selectedCategory)
})

const getRandomColorClass = () => {
  const colors = [
    'text-red-500',
    'text-blue-500',
    'text-green-500',
    'text-yellow-500',
    'text-purple-500',
    'text-pink-500',
    'text-indigo-500',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
</script>

<template>
  <div v-if="!isHideDefaultPreset && !isMobile && filteredItems.length > 0" class="w-full py-1">
    <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 px-2">
      <button
        v-for="item in filteredItems"
        :key="item.title"
        @click="emit('click', item)"
        class="btn-pill rounded-2xl p-4 h-full w-full overflow-hidden"
      >
        <div class="flex flex-col items-start gap-2 w-full">
          <!-- 上排：图标和标题 -->
          <div class="flex items-center gap-2 w-full">
            <SvgIcon
              :icon="item.icon"
              :class="[
                'mb-0 inline-block text-lg flex-shrink-0',
                item.iconColor || getRandomColorClass(),
              ]"
            />
            <div class="text-gray-700 dark:text-gray-300 text-sm font-medium truncate">
              {{ item.title }}
            </div>
          </div>
          <!-- 下排：描述 -->
          <div
            class="text-gray-500 dark:text-gray-400 text-xs text-left w-full line-clamp-2"
            :title="item.description"
          >
            {{ item.description }}
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
