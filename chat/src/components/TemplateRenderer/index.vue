<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch, onBeforeUnmount } from 'vue'
import { Down } from '@icon-park/vue-next'

interface Props {
  modelValue: string
  placeholder?: string
}

interface Segment {
  type: 'plain' | 'input' | 'select'
  id?: string
  content?: string
  placeholder?: string
  value?: string
  options?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keypress: [event: KeyboardEvent]
}>()

// 本地值存储
const localValues = ref<Record<string, string>>({})
const plainTextValues = ref<Record<string, string>>({})

// 下拉状态
const dropdownStates = ref<Record<string, boolean>>({})
const selectedValues = ref<Record<string, string>>({})
const dropdownPositions = ref<Record<string, { top: number; left: number; width: number }>>({})
const selectButtonRefs = ref<Record<string, HTMLElement>>({})

// 解析模板
const parseTemplate = (text: string): Segment[] => {
  if (!text) return []

  const segments: Segment[] = []
  const regex = /\{\{(input|select):([^}]+)\}\}/g
  let lastIndex = 0
  let match
  let fieldIndex = 0

  while ((match = regex.exec(text)) !== null) {
    // 添加普通文本
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index)
      // 将普通文本按空格分割成更小的块，便于换行
      const words = content.split(/(\s+)/)
      words.forEach(word => {
        if (word) {
          const plainId = `plain_${fieldIndex}_${segments.length}`
          segments.push({
            type: 'plain',
            id: plainId,
            content: word,
          })
          // 初始化普通文本值
          if (plainTextValues.value[plainId] === undefined) {
            plainTextValues.value[plainId] = word
          }
        }
      })
    }

    const fieldType = match[1]
    const fieldContent = match[2]
    const fieldId = `field_${fieldIndex++}`

    if (fieldType === 'input') {
      // 支持新语法：{{input:占位符|默认值}}
      let placeholder = ''
      let defaultValue = ''

      if (fieldContent.includes('|')) {
        // 新语法：用 | 分隔占位符和默认值
        const parts = fieldContent.split('|')
        placeholder = parts[0].trim()
        defaultValue = parts[1]?.trim() || ''
      } else {
        // 兼容旧语法：默认都当作占位符处理
        // 除非内容看起来像是已填充的值（比如包含具体数据）
        placeholder = fieldContent
        defaultValue = ''
      }

      segments.push({
        type: 'input',
        id: fieldId,
        placeholder: placeholder,
        value: defaultValue,
      })

      // 初始化输入值为默认值
      if (localValues.value[fieldId] === undefined) {
        localValues.value[fieldId] = defaultValue
      }
    } else if (fieldType === 'select') {
      // 解析 select:option1|option2[selected] 格式
      const selectMatch = fieldContent.match(/^([^[]+)(?:\[([^\]]+)\])?$/)
      if (selectMatch) {
        const options = selectMatch[1].split('|')
        const selected = selectMatch[2] || options[0]
        segments.push({
          type: 'select',
          id: fieldId,
          options,
          value: selected,
        })
        selectedValues.value[fieldId] = selected
      }
    }

    lastIndex = regex.lastIndex
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    const content = text.slice(lastIndex)
    // 将普通文本按空格分割
    const words = content.split(/(\s+)/)
    words.forEach(word => {
      if (word) {
        const plainId = `plain_end_${segments.length}`
        segments.push({
          type: 'plain',
          id: plainId,
          content: word,
        })
        // 初始化普通文本值
        if (plainTextValues.value[plainId] === undefined) {
          plainTextValues.value[plainId] = word
        }
      }
    })
  }

  return segments
}

const segments = computed(() => parseTemplate(props.modelValue))

// 统一的尺寸调整函数（宽度和高度）
const autoResize = (element: HTMLElement) => {
  if (element.tagName === 'TEXTAREA') {
    const textarea = element as HTMLTextAreaElement
    const value = textarea.value || textarea.placeholder

    // 获取容器宽度
    const container = textarea.closest('.template-renderer') as HTMLElement
    const containerWidth = container ? container.clientWidth : window.innerWidth

    // 创建临时元素来测量文本宽度
    const temp = document.createElement('span')
    temp.style.visibility = 'hidden'
    temp.style.position = 'absolute'
    temp.style.fontSize = window.getComputedStyle(textarea).fontSize
    temp.style.fontFamily = window.getComputedStyle(textarea).fontFamily
    temp.style.fontWeight = window.getComputedStyle(textarea).fontWeight
    temp.style.letterSpacing = window.getComputedStyle(textarea).letterSpacing
    temp.style.whiteSpace = 'pre'
    temp.textContent = value
    document.body.appendChild(temp)

    // 计算宽度（添加适当的内边距）
    const computedStyle = window.getComputedStyle(textarea)
    const paddingLeft = parseInt(computedStyle.paddingLeft, 10) || 8
    const paddingRight = parseInt(computedStyle.paddingRight, 10) || 8
    const textWidth = temp.offsetWidth + paddingLeft + paddingRight + 4 // 4px额外空间防止文字被截断
    document.body.removeChild(temp)

    // 判断是否需要换行
    const maxInlineWidth = containerWidth * 0.8 // 最大占容器80%宽度

    if (textWidth > maxInlineWidth) {
      // 需要换行，使用100%宽度并允许多行
      textarea.style.width = '100%'
      textarea.style.whiteSpace = 'pre-wrap'
      textarea.parentElement!.style.width = '100%'
    } else {
      // 不需要换行，宽度自适应
      const finalWidth = Math.max(textWidth, 60)
      textarea.style.width = `${finalWidth}px`
      textarea.style.whiteSpace = 'nowrap'
      textarea.parentElement!.style.width = 'auto'
    }

    // 调整高度
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${Math.max(scrollHeight, 32)}px`
  }
}

// 更新输入值
const updateValue = (fieldId: string, value: string, type: string, placeholder?: string) => {
  if (!fieldId) return

  let newText = props.modelValue
  let fieldIndex = 0

  newText = newText.replace(/\{\{(input|select):([^}]+)\}\}/g, (match, fieldType, content) => {
    const currentFieldId = `field_${fieldIndex++}`

    if (currentFieldId === fieldId) {
      if (type === 'input') {
        // 检查原始内容是否包含 | 分隔符
        if (content.includes('|')) {
          // 新语法：保持占位符，更新值
          const parts = content.split('|')
          const originalPlaceholder = parts[0].trim()
          // 如果有用户输入，则保存；否则保持原格式
          if (value) {
            return `{{input:${originalPlaceholder}|${value}}}`
          } else {
            return `{{input:${originalPlaceholder}}}`
          }
        } else {
          // 旧语法：直接保留原始内容
          return `{{input:${content}}}`
        }
      } else if (type === 'select') {
        const options = content.split('|').map((opt: string) => opt.replace(/\[.*\]$/, ''))
        return `{{select:${options.join('|')}[${value}]}}`
      }
    }
    return match
  })

  emit('update:modelValue', newText)
}

// 更新普通文本
const updatePlainText = (segmentId: string, event: Event) => {
  const target = event.target as HTMLElement
  const newContent = target.textContent || ''

  // 只更新本地状态，不重建整个模板
  plainTextValues.value[segmentId] = newContent

  // 延迟发送更新，避免频繁重建
  debounceEmitUpdate()
}

// 防抖发送更新
let updateTimer: any = null
const debounceEmitUpdate = () => {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => {
    emitCompleteText()
  }, 300)
}

// 发送完整文本
const emitCompleteText = () => {
  let result = ''

  segments.value.forEach(segment => {
    if (segment.type === 'plain') {
      result += plainTextValues.value[segment.id!] || segment.content || ''
    } else if (segment.type === 'input') {
      result += `{{input:${segment.placeholder}}}`
    } else if (segment.type === 'select') {
      const value = selectedValues.value[segment.id!] || segment.value || ''
      result += `{{select:${segment.options?.join('|')}[${value}]}}`
    }
  })

  emit('update:modelValue', result)
}

// 计算最长选项的宽度
const calculateDropdownWidth = (options: string[] = [], buttonWidth: number) => {
  // 创建临时元素来测量选项宽度
  const temp = document.createElement('div')
  temp.style.visibility = 'hidden'
  temp.style.position = 'absolute'
  temp.style.fontSize = '14px' // text-sm
  temp.style.padding = '8px 12px' // px-3 py-2
  temp.style.whiteSpace = 'nowrap'
  document.body.appendChild(temp)

  let maxWidth = buttonWidth // 至少和按钮一样宽

  options.forEach(option => {
    temp.textContent = option
    const optionWidth = temp.offsetWidth + 24 // 加上左右padding
    maxWidth = Math.max(maxWidth, optionWidth)
  })

  document.body.removeChild(temp)

  // 限制最大宽度
  return Math.min(maxWidth, 400) // 最大400px
}

// 更新下拉菜单位置
const updateDropdownPosition = (fieldId: string) => {
  const button = selectButtonRefs.value[fieldId]
  if (!button) return

  const rect = button.getBoundingClientRect()

  // 获取对应的segment来获取选项列表
  const segment = segments.value.find(s => s.id === fieldId)
  const dropdownWidth = segment?.options
    ? calculateDropdownWidth(segment.options, rect.width)
    : rect.width

  // 始终向下显示
  dropdownPositions.value[fieldId] = {
    top: rect.bottom + 4, // 向下显示，留4px间距
    left: rect.left,
    width: dropdownWidth,
  }
}

// 切换下拉菜单
const toggleDropdown = (fieldId: string) => {
  const newState = !dropdownStates.value[fieldId]

  // 关闭其他所有下拉菜单
  Object.keys(dropdownStates.value).forEach(key => {
    dropdownStates.value[key] = false
  })

  if (newState) {
    updateDropdownPosition(fieldId)
  }

  dropdownStates.value[fieldId] = newState
}

// 处理下拉选择
const selectOption = (fieldId: string, option: string) => {
  if (!fieldId) return
  selectedValues.value[fieldId] = option
  dropdownStates.value[fieldId] = false
  updateValue(fieldId, option, 'select')
}

// 点击外部关闭下拉菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement

  // 检查点击是否在任何下拉菜单或按钮内
  const isInsideDropdown =
    target.closest('.template-select-dropdown') || target.closest('.select-button')

  if (!isInsideDropdown) {
    Object.keys(dropdownStates.value).forEach(key => {
      dropdownStates.value[key] = false
    })
  }
}

// 监听滚动事件更新位置
const handleScroll = () => {
  Object.keys(dropdownStates.value).forEach(fieldId => {
    if (dropdownStates.value[fieldId]) {
      updateDropdownPosition(fieldId)
    }
  })
}

// 处理键盘事件
const handleKeypress = (event: KeyboardEvent) => {
  emit('keypress', event)
}

const handleInputChange = (event: Event, segment: any) => {
  const target = event.target as HTMLTextAreaElement
  // 传递当前值和占位符，保持格式
  const currentValue = localValues.value[segment.id!] || ''
  updateValue(segment.id!, currentValue, 'input', segment.placeholder)
  autoResize(target)
}

// 获取解析后的内容
const getParsedContent = () => {
  let result = props.modelValue

  // 替换所有模板标记
  let fieldIndex = 0
  result = result.replace(/\{\{(input|select):([^}]+)\}\}/g, (match, type, content) => {
    const fieldId = `field_${fieldIndex++}`

    if (type === 'input') {
      return localValues.value[fieldId] || ''
    } else if (type === 'select') {
      return selectedValues.value[fieldId] || ''
    }

    return match
  })

  return result
}

// 组件挂载后自动调整所有文本框尺寸
onMounted(() => {
  nextTick(() => {
    const textareas = document.querySelectorAll('.input-block textarea')
    textareas.forEach((textarea: any) => {
      // 立即调整初始宽度
      autoResize(textarea)
    })
  })

  // 添加事件监听
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleScroll)
})

// 组件卸载时清理
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleScroll)
})

// 监听值变化
watch(
  () => props.modelValue,
  (newVal, oldVal) => {
    // 如果值被清空了（从有值变为空），重置所有内部状态
    if (!newVal && oldVal) {
      // 清空所有输入值
      Object.keys(localValues.value).forEach(key => {
        localValues.value[key] = ''
      })

      // 清空所有普通文本
      Object.keys(plainTextValues.value).forEach(key => {
        plainTextValues.value[key] = ''
      })

      // 重置选择框
      Object.keys(selectedValues.value).forEach(key => {
        selectedValues.value[key] = ''
      })
    }

    nextTick(() => {
      const textareas = document.querySelectorAll('.input-block textarea')
      textareas.forEach((textarea: any) => {
        autoResize(textarea)
      })
    })
  },
  { immediate: true }
)

// 清空模板内容
const clearTemplate = () => {
  // 清空所有输入值
  Object.keys(localValues.value).forEach(key => {
    localValues.value[key] = ''
  })

  // 清空所有普通文本
  Object.keys(plainTextValues.value).forEach(key => {
    plainTextValues.value[key] = ''
  })

  // 重置选择框到默认值
  segments.value.forEach(segment => {
    if (segment.type === 'select' && segment.id) {
      selectedValues.value[segment.id] = segment.value || segment.options?.[0] || ''
    }
  })

  // 强制更新DOM中的普通文本内容
  nextTick(() => {
    const plainBlocks = document.querySelectorAll('.plain-block')
    plainBlocks.forEach((block: any) => {
      block.textContent = ''
    })

    // 也清空 textarea 的值
    const textareas = document.querySelectorAll(
      '.input-block textarea'
    ) as NodeListOf<HTMLTextAreaElement>
    textareas.forEach(textarea => {
      textarea.value = ''
    })
  })

  // 发送更新
  emitCompleteText()
}

// 暴露方法
defineExpose({
  getParsedContent,
  clearTemplate,
})
</script>

<template>
  <div class="template-renderer flex flex-wrap items-start">
    <template v-for="segment in segments" :key="segment.id">
      <!-- 普通文本块 -->
      <div
        v-if="segment.type === 'plain'"
        class="template-block plain-block"
        :contenteditable="true"
        @input="updatePlainText(segment.id!, $event)"
        @keypress="handleKeypress"
        :data-placeholder="plainTextValues[segment.id!] === '' ? '...' : ''"
      >
        {{ plainTextValues[segment.id!] || segment.content }}
      </div>

      <!-- input 字段块 -->
      <div v-else-if="segment.type === 'input'" class="template-block input-block">
        <textarea
          v-model="localValues[segment.id!]"
          :placeholder="`[${segment.placeholder || ''}]`"
          @input="handleInputChange($event, segment)"
          @focus="autoResize($event.target as HTMLTextAreaElement)"
          @keypress="handleKeypress"
          :ref="
            el => {
              if (el) nextTick(() => autoResize(el as HTMLTextAreaElement))
            }
          "
          class="rounded-lg border border-primary-200 bg-primary-50 text-primary-600 placeholder-gray-400 dark:bg-primary-950 dark:border-primary-800 dark:text-primary-400 dark:placeholder-gray-500"
          rows="1"
        />
      </div>

      <!-- select 字段块 -->
      <div v-else-if="segment.type === 'select'" class="template-block select-block">
        <button
          :ref="
            el => {
              if (el) selectButtonRefs[segment.id!] = el as HTMLElement
            }
          "
          @click.stop="toggleDropdown(segment.id!)"
          class="select-button inline-flex items-center gap-1 px-2 py-1 min-h-[32px] rounded-lg border border-primary-200 bg-primary-50 text-primary-600 cursor-pointer outline-none transition-all dark:bg-primary-950 dark:border-primary-800 dark:text-primary-400"
        >
          <span class="text-primary-600 dark:text-primary-400">{{
            selectedValues[segment.id!] || segment.value
          }}</span>
          <Down
            :class="[
              'icon text-primary-600 dark:text-primary-400',
              dropdownStates[segment.id!] ? 'rotate-180' : '',
            ]"
          />
        </button>

        <!-- 使用 Teleport 将下拉菜单渲染到 body -->
        <Teleport to="body">
          <div
            v-if="dropdownStates[segment.id!] && dropdownPositions[segment.id!]"
            class="template-select-dropdown fixed max-h-60 overflow-y-auto custom-scrollbar bg-white border border-gray-200 rounded-lg shadow-xl dark:bg-gray-800 dark:border-gray-700"
            :style="{
              top: `${dropdownPositions[segment.id!].top}px`,
              left: `${dropdownPositions[segment.id!].left}px`,
              width: `${dropdownPositions[segment.id!].width}px`,
              zIndex: 9999,
            }"
          >
            <div class="py-1">
              <button
                v-for="option in segment.options"
                :key="option"
                @click="selectOption(segment.id!, option)"
                :class="[
                  'block w-full px-3 py-2 text-left text-sm transition-colors',
                  (selectedValues[segment.id!] || segment.value) === option
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700',
                ]"
              >
                {{ option }}
              </button>
            </div>
          </div>
        </Teleport>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 容器样式 */
.template-renderer {
  gap: 0.25rem;
  line-height: 1.5;
}

/* 统一的块样式 */
.template-block {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  max-width: 100%;
  word-break: break-word;
}

/* 普通文本块 */
.plain-block {
  padding: 4px 2px;
  outline: none;
  cursor: text;
  white-space: pre-wrap;
}

.plain-block:empty:before {
  content: attr(data-placeholder);
  color: #9ca3af;
}

/* 输入框块 - 宽度自适应 */
.input-block {
  display: inline-block;
  max-width: 100%;
}

.input-block textarea {
  display: inline-block;
  min-width: 60px;
  max-width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.5;
  overflow: hidden;
  white-space: nowrap;
  transition: width 0.2s ease;
}

/* select 样式 */
.select-block {
  position: relative;
  min-width: 80px;
}

.select-button .icon {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
}

/* 响应式调整 */
@media (max-width: 640px) {
  .template-block {
    max-width: 100%;
  }
}
</style>
