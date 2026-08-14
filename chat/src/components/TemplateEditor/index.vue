<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Down } from '@icon-park/vue-next'

interface Props {
  modelValue: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'parsed-content': [value: string]
}>()

// 解析模板字段
interface TemplateField {
  type: 'input' | 'number' | 'select'
  start: number
  end: number
  content: string
  value?: string
  placeholder?: string
  options?: string[]
  defaultValue?: string
}

type TextSegment = {
  type: 'text'
  content: string
}

type FieldSegment = {
  type: 'field'
  index: number
  field: TemplateField
}

type TemplateSegment = TextSegment | FieldSegment

const dropdownField = ref<number>(-1)
const fieldValues = ref<Record<number, string>>({})

// 解析模板
const parseTemplate = (template: string): TemplateField[] => {
  const fields: TemplateField[] = []
  const regex = /\{\{(input|number|select):([^}]+)\}\}/g
  let match

  while ((match = regex.exec(template)) !== null) {
    const type = match[1] as 'input' | 'number' | 'select'
    const content = match[2]

    let field: TemplateField = {
      type,
      start: match.index,
      end: regex.lastIndex,
      content: match[0],
    }

    if (type === 'input') {
      // input 类型：占位符，用户需要填写
      field.placeholder = content
    } else if (type === 'number') {
      // number 类型：预填充的数字
      field.defaultValue = content
      field.value = content
    } else if (type === 'select') {
      // select 类型：下拉选择
      field.options = content.split('|')
      field.value = field.options[0]
    }

    fields.push(field)
  }

  return fields
}

// 解析的字段
const templateFields = computed(() => parseTemplate(props.modelValue))

// 渲染内容片段
const renderSegments = computed<TemplateSegment[]>(() => {
  const segments: TemplateSegment[] = []
  let lastIndex = 0

  templateFields.value.forEach((field, index) => {
    // 添加字段前的文本
    if (field.start > lastIndex) {
      segments.push({
        type: 'text',
        content: props.modelValue.slice(lastIndex, field.start),
      })
    }

    // 添加字段
    segments.push({
      type: 'field',
      index,
      field,
    })

    lastIndex = field.end
  })

  // 添加最后的文本
  if (lastIndex < props.modelValue.length) {
    segments.push({
      type: 'text',
      content: props.modelValue.slice(lastIndex),
    })
  }

  return segments
})

// 获取字段显示值
const getFieldDisplay = (field: TemplateField, index: number) => {
  const value = fieldValues.value[index]
  if (value !== undefined) return value
  if (field.value) return field.value
  if (field.defaultValue) return field.defaultValue
  return ''
}

// 获取解析后的内容
const getParsedContent = () => {
  let result = props.modelValue

  // 从后往前替换，避免位置偏移
  const fields = Array.from(templateFields.value)
  fields.reverse().forEach((field, reverseIndex) => {
    const index = templateFields.value.length - 1 - reverseIndex
    const value = getFieldDisplay(field, index)
    result = result.slice(0, field.start) + value + result.slice(field.end)
  })

  return result
}

// 选择下拉选项
const selectOption = (fieldIndex: number, option: string) => {
  fieldValues.value[fieldIndex] = option
  dropdownField.value = -1
  updateValue()
}

// 更新值
const updateValue = () => {
  const parsed = getParsedContent()
  emit('parsed-content', parsed)
}

// 监听值变化
watch(
  () => props.modelValue,
  () => {
    // 重置字段值
    fieldValues.value = {}
    templateFields.value.forEach((field, index) => {
      if (field.type === 'number' && field.defaultValue) {
        // number 类型使用默认值
        fieldValues.value[index] = field.defaultValue
      } else if (field.type === 'select' && field.options) {
        // select 类型使用第一个选项
        fieldValues.value[index] = field.options[0]
      } else if (field.type === 'input') {
        // input 类型初始为空
        fieldValues.value[index] = ''
      }
    })
    updateValue()
  },
  { immediate: true }
)

// 监听字段值变化
watch(
  fieldValues,
  () => {
    updateValue()
  },
  { deep: true }
)
</script>

<template>
  <div class="template-editor flex flex-wrap items-center gap-1 text-base">
    <template v-for="(segment, segIndex) in renderSegments" :key="segIndex">
      <!-- 普通文本 -->
      <span v-if="segment.type === 'text'" class="text-gray-700 dark:text-gray-400">
        {{ segment.content }}
      </span>

      <!-- 字段 -->
      <template v-else-if="segment.type === 'field'">
        <!-- input 类型：空白输入框 -->
        <input
          v-if="segment.field.type === 'input'"
          v-model="fieldValues[segment.index]"
          :placeholder="`[${segment.field.placeholder}]`"
          :class="[
            'inline-flex px-2 py-0.5 rounded-md',
            'border focus:outline-none focus:ring-2 focus:ring-primary-500/30',
            'min-w-[100px] transition-colors',
            fieldValues[segment.index] && fieldValues[segment.index].trim()
              ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
              : 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 placeholder-gray-400/80 dark:placeholder-gray-500/80',
          ]"
          @input="updateValue"
        />

        <!-- number 类型：预填充的数字 -->
        <input
          v-else-if="segment.field.type === 'number'"
          v-model="fieldValues[segment.index]"
          type="text"
          :class="[
            'inline-flex px-2 py-0.5 rounded-md',
            'border focus:outline-none focus:ring-2 focus:ring-primary-500/30',
            'w-[60px] text-center transition-colors',
            fieldValues[segment.index] && fieldValues[segment.index] !== segment.field.defaultValue
              ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
              : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400',
          ]"
          @input="updateValue"
        />

        <!-- 下拉选择字段 -->
        <div v-else-if="segment.field.type === 'select'" class="relative inline-flex">
          <button
            @click.stop="dropdownField = dropdownField === segment.index ? -1 : segment.index"
            :class="[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md',
              'border hover:bg-primary-100 dark:hover:bg-primary-900/30',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors',
              getFieldDisplay(segment.field, segment.index) !== segment.field.options?.[0]
                ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400',
            ]"
          >
            <span>{{ getFieldDisplay(segment.field, segment.index) }}</span>
            <Down
              :class="[
                'w-3 h-3 transition-transform',
                dropdownField === segment.index ? 'rotate-180' : '',
              ]"
            />
          </button>

          <!-- 下拉菜单 -->
          <div
            v-if="dropdownField === segment.index"
            class="absolute top-full mt-1 z-50 min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg"
          >
            <button
              v-for="option in segment.field.options || []"
              :key="option"
              @click="selectOption(segment.index, option)"
              :class="[
                'block w-full px-3 py-1.5 text-left text-sm',
                'hover:bg-primary-50 dark:hover:bg-primary-900/20',
                'transition-colors',
                getFieldDisplay(segment.field, segment.index) === option
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'text-gray-700 dark:text-gray-300',
              ]"
            >
              {{ option }}
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- 空状态占位符 -->
    <span v-if="!renderSegments.length && placeholder" class="text-gray-400 dark:text-gray-500">
      {{ placeholder }}
    </span>
  </div>
</template>

<style scoped>
/* 移除数字输入框的箭头 */
input[type='text']::-webkit-inner-spin-button,
input[type='text']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
