<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Down } from '@icon-park/vue-next'

interface Props {
  template: string
  modelValue?: string
}

interface TemplateField {
  type: 'text' | 'number' | 'select'
  placeholder?: string
  defaultValue?: string
  options?: string[]
  value: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// 解析模板
const parseTemplate = (template: string): { parts: string[]; fields: TemplateField[] } => {
  const parts: string[] = []
  const fields: TemplateField[] = []
  const regex = /\{\{(text|number|select):([^}]+)\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(template)) !== null) {
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      parts.push(template.slice(lastIndex, match.index))
    }

    const type = match[1] as 'text' | 'number' | 'select'
    const content = match[2]

    let field: TemplateField = {
      type,
      value: '',
    }

    if (type === 'text') {
      field.placeholder = content
      field.value = ''
    } else if (type === 'number') {
      field.defaultValue = content
      field.value = content
    } else if (type === 'select') {
      field.options = content.split('|')
      field.value = field.options[0]
    }

    fields.push(field)
    parts.push(`__FIELD_${fields.length - 1}__`)
    lastIndex = regex.lastIndex
  }

  // 添加剩余文本
  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex))
  }

  return { parts, fields }
}

const { parts, fields } = parseTemplate(props.template)
const fieldValues = ref<TemplateField[]>(fields)

// 下拉菜单状态
const dropdownStates = ref<boolean[]>(fields.map(() => false))

// 切换下拉菜单
const toggleDropdown = (index: number) => {
  dropdownStates.value[index] = !dropdownStates.value[index]
  // 关闭其他下拉菜单
  dropdownStates.value.forEach((_, i) => {
    if (i !== index) dropdownStates.value[i] = false
  })
}

// 选择下拉选项
const selectOption = (fieldIndex: number, option: string) => {
  fieldValues.value[fieldIndex].value = option
  dropdownStates.value[fieldIndex] = false
  updateResult()
}

// 生成最终结果
const updateResult = () => {
  let result = props.template
  fieldValues.value.forEach((field, index) => {
    const pattern = new RegExp(`\\{\\{${field.type}:[^}]+\\}\\}`)
    result = result.replace(pattern, field.value || '')
  })
  emit('update:modelValue', result)
}

// 点击外部关闭下拉菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.template-dropdown')) {
    dropdownStates.value = dropdownStates.value.map(() => false)
  }
}

// 监听值变化
watch(
  fieldValues,
  () => {
    updateResult()
  },
  { deep: true }
)

// 生命周期
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  updateResult()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="template-input flex flex-wrap items-center gap-1 text-sm">
    <template v-for="(part, partIndex) in parts" :key="partIndex">
      <!-- 普通文本 -->
      <span v-if="!part.startsWith('__FIELD_')" class="text-gray-700 dark:text-gray-300">
        {{ part }}
      </span>

      <!-- 字段 -->
      <template v-else>
        <template
          v-for="fieldIndex in [parseInt(part.replace('__FIELD_', '').replace('__', ''))]"
          :key="fieldIndex"
        >
          <!-- 文本输入 -->
          <input
            v-if="fieldValues[fieldIndex].type === 'text'"
            v-model="fieldValues[fieldIndex].value"
            :placeholder="fieldValues[fieldIndex].placeholder"
            class="inline-flex px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 placeholder-primary-400/60 dark:placeholder-primary-500/60 focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[100px] max-w-[200px]"
            @input="updateResult"
          />

          <!-- 数字输入 -->
          <input
            v-else-if="fieldValues[fieldIndex].type === 'number'"
            v-model="fieldValues[fieldIndex].value"
            type="number"
            class="inline-flex px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 w-[80px] text-center"
            @input="updateResult"
          />

          <!-- 下拉选择 -->
          <div
            v-else-if="fieldValues[fieldIndex].type === 'select'"
            class="template-dropdown relative inline-flex"
          >
            <button
              @click.stop="toggleDropdown(fieldIndex)"
              class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors"
            >
              <span>{{ fieldValues[fieldIndex].value }}</span>
              <Down
                :class="[
                  'w-3 h-3 transition-transform',
                  dropdownStates[fieldIndex] ? 'rotate-180' : '',
                ]"
              />
            </button>

            <!-- 下拉菜单 -->
            <div
              v-if="dropdownStates[fieldIndex]"
              class="absolute top-full mt-1 z-50 min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg"
            >
              <button
                v-for="option in fieldValues[fieldIndex].options"
                :key="option"
                @click="selectOption(fieldIndex, option)"
                :class="[
                  'block w-full px-3 py-1.5 text-left text-sm',
                  'hover:bg-primary-50 dark:hover:bg-primary-900/20',
                  'transition-colors',
                  fieldValues[fieldIndex].value === option
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
    </template>
  </div>
</template>

<style scoped>
/* 移除数字输入框的箭头 */
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type='number'] {
  -moz-appearance: textfield;
}
</style>
