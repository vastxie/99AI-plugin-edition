<script lang="ts" setup>
import { fetchUpdateGroupAPI } from '@/api/group'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import ModelAvatar from '@/components/common/ModelAvatar/index.vue'
import { useChatStore } from '@/store/modules/chat'
import { useAppCatStore } from '@/store/modules/appStore'
import { CheckOne, Right } from '@icon-park/vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  triggerClass?: string
  menuPosition?: 'bottom-left' | 'top-left' | 'bottom-right' | 'top-right'
}

const Props = withDefaults(defineProps<Props>(), {
  triggerClass: '',
  menuPosition: 'top-left',
})

const { t } = useI18n()
const chatStore = useChatStore()
const appCatStore = useAppCatStore()

const isMenuOpen = ref(false)
const modelOptions = ref<any[]>([])
const appDetail = ref<any>(null)

const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const configObj = computed(
  () => activeGroupInfo.value?.config && JSON.parse(activeGroupInfo.value.config)
)
const chatGroupId = computed(() => activeGroupInfo.value?.uuid)
const activeAppId = computed(() => activeGroupInfo.value?.appId)
const usingPlugin = computed(() => chatStore.currentPlugin)

const notSwitchModel = computed(() => {
  return (
    (activeGroupInfo?.value?.appId &&
      (configObj.value?.modelInfo?.isFixedModel === 1 ||
        configObj.value?.modelInfo?.isGPTs === 1 ||
        configObj.value?.modelInfo?.isFlowith === 1)) ||
    (usingPlugin.value && usingPlugin?.value?.deductType !== 0)
  )
})

const shouldShowSelector = computed(() => {
  return modelOptions.value.length > 1 && !notSwitchModel.value
})

function queryModelList() {
  // 如果 modelOptions 已经有数据,直接返回
  if (modelOptions.value.length > 0) {
    return
  }

  // 从 chatStore.modelList 读取已加载的模型数据
  const allModels = (chatStore.modelList || []) as any[]

  // 当前没有 active 信息时，默认选择所有模型
  if (!activeGroupInfo.value) {
    modelOptions.value = allModels.map((model: any) => ({
      label: model.modelName,
      value: model.model,
      deductType: model.deductType,
      keyType: model.modelType,
      deduct: model.deduct,
      isFileUpload: model.isFileUpload,
      isImageUpload: model.isImageUpload,
      isToolSupported: model.isToolSupported || 0,
      deepThinkingType: model.deepThinkingType,
      modelAvatar: model.modelAvatar,
      modelDescription: model.modelDescription,
    }))
    return
  }

  // 当前对话模型信息
  const modelInfo = configObj.value?.modelInfo

  // 根据当前使用的模型类型,筛选对应的模型
  let filteredModels = allModels
  if (modelInfo?.modelType) {
    filteredModels = allModels.filter((model: any) => model.modelType === modelInfo.modelType)
  }

  // 转换为modelOptions格式
  modelOptions.value = filteredModels.map((model: any) => ({
    label: model.modelName,
    value: model.model,
    deductType: model.deductType,
    keyType: model.modelType,
    deduct: model.deduct,
    isFileUpload: model.isFileUpload,
    isImageUpload: model.isImageUpload,
    isToolSupported: model.isToolSupported || 0,
    deepThinkingType: model.deepThinkingType,
    modelAvatar: model.modelAvatar,
    modelDescription: model.modelDescription,
  }))
}

async function switchModel(option: any) {
  chatStore.setUsingDeepThinking(false)
  chatStore.setUsingTool(false)
  chatStore.currentPlugin = undefined

  const currentConfig = chatStore.activeConfig
  const { modelInfo } = currentConfig
  const { isGPTs, isFixedModel, modelName, isFlowith } = modelInfo || {}

  const config = {
    modelInfo: {
      keyType: option.keyType,
      modelName: (activeGroupInfo?.value?.appId ? modelName : option.label) || '',
      model: option.value,
      deductType: option.deductType,
      deduct: option.deduct,
      isFileUpload: option.isFileUpload,
      isImageUpload: option.isImageUpload,
      isToolSupported: option.isToolSupported || 0,
      deepThinkingType: option.deepThinkingType,
      modelAvatar: option.modelAvatar || '',
      isGPTs: isGPTs || false,
      isFlowith: isFlowith || false,
      isFixedModel: isFixedModel || false,
    },
  }

  const params = {
    groupId: chatGroupId.value,
    config: JSON.stringify(config),
  }
  await fetchUpdateGroupAPI(params)
  await chatStore.queryMyGroup()
}

watch(
  activeAppId,
  val => {
    if (val) queryAppDetail(val)
    else appDetail.value = null
  },
  { immediate: true }
)

async function queryAppDetail(id: number) {
  // 使用 appCatStore 的缓存方法
  appDetail.value = await appCatStore.queryAppDetail(id)
}

// 模型列表已在 App.vue 中统一加载,这里不需要重复查询
// 模型列表已在 App.vue 中统一加载
// 这里只需从 store 读取并格式化数据,不再查询 API
watch(
  activeGroupInfo,
  () => {
    queryModelList()
  },
  { immediate: true }
) // 立即执行,初始化 modelOptions
</script>

<template>
  <DropdownMenu
    v-if="shouldShowSelector || (activeGroupInfo?.appId && modelOptions.length > 1)"
    v-model="isMenuOpen"
    :position="menuPosition"
    max-height="35vh"
    menu-class="max-w-[280px]"
    :z-index="99999"
  >
    <template #trigger>
      <button
        :class="[triggerClass || 'btn-pill inline-flex items-center gap-1.5 pl-4']"
        :aria-label="t('common.selectModel')"
      >
        <span class="truncate whitespace-nowrap overflow-hidden max-w-[150px]">
          {{ configObj?.modelInfo?.modelName || t('common.selectModel') }}
        </span>
        <Right
          :class="{ 'rotate-90': isMenuOpen }"
          size="14"
          class="transition-transform duration-200 flex-shrink-0"
        />
      </button>
    </template>
    <template #menu="{ close }">
      <div>
        <div
          v-for="(item, index) in modelOptions"
          :key="`${item.value}_${index}`"
          class="menu-item menu-item-md"
          :class="{ 'menu-item-active': configObj?.modelInfo?.model === item.value }"
          @click="
            () => {
              switchModel(item)
              close()
            }
          "
          role="menuitem"
          tabindex="0"
        >
          <ModelAvatar
            :model="item.value"
            :modelAvatar="item.modelAvatar"
            :modelName="item.label"
            size="md"
          />
          <div class="menu-item-content">
            <div class="menu-item-title">
              {{ item.label }}
            </div>
            <div v-if="item.modelDescription" class="menu-item-description">
              {{ item.modelDescription }}
            </div>
          </div>
          <div class="flex-shrink-0" v-if="configObj?.modelInfo?.model === item.value">
            <CheckOne theme="filled" size="16" class="text-gray-500 dark:text-gray-400" />
          </div>
        </div>
      </div>
    </template>
  </DropdownMenu>
</template>
