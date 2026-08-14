<script lang="ts" setup>
import ModelAvatar from '@/components/common/ModelAvatar/index.vue'
import { useAppCatStore } from '@/store/modules/appStore'
import { useChatStore } from '@/store/modules/chat'
import { computed } from 'vue'

const props = defineProps<Props>()

const chatStore = useChatStore()
const appCatStore = useAppCatStore()

interface Props {
  image?: boolean
  model?: string
  pluginParam?: string
  appId?: number
}

// 获取当前活动的对话组信息
const activeGroupInfo = computed(() => {
  return chatStore.groupList.find((item: any) => item.uuid === chatStore.active)
})

/**
 * 头像获取优先级：插件 > 应用 > 模型
 * 1. 如果有 pluginParam，从 pluginList 缓存中按参数查找插件的 pluginImg
 * 2. 如果有 appId（优先使用消息的 appId，降级到对话组的 appId），从 allApps 缓存中查找应用的 coverImg
 * 3. 如果有 model，从 modelList 缓存中查找模型的 modelAvatar
 */

// 1. 获取插件头像（最高优先级）
const pluginAvatar = computed(() => {
  if (!props.pluginParam) return null

  // 从 chatStore 的 pluginList 缓存中按参数查找
  const plugins = chatStore.pluginList || []
  const plugin = plugins.find((p: any) => p.parameters === props.pluginParam) as any
  return plugin?.pluginImg || null
})

// 2. 获取应用头像（第二优先级）
const appAvatar = computed(() => {
  // 优先使用消息的 appId，降级到对话组的 appId
  const messageAppId = props.appId
  const groupAppId = activeGroupInfo.value?.appId
  const appId = messageAppId || groupAppId

  if (!appId) {
    return null
  }

  // 从 appStore 的 allApps 缓存中查找
  const app = appCatStore.allApps.find((cachedApp: any) => cachedApp.id === appId)

  if (app?.coverImg) {
    return app.coverImg
  }

  // 降级：从 groupInfo 中获取 appLogo
  return activeGroupInfo.value?.appLogo || null
})

// 3. 获取模型头像（第三优先级）
const modelAvatar = computed(() => {
  if (!props.model) {
    return null
  }

  // 从 chatStore 的 modelList 缓存中查找
  const models = chatStore.modelList || []
  const model = models.find((m: any) => m.model === props.model) as any

  if (model?.modelAvatar) {
    return model.modelAvatar
  }

  // 降级：从 groupInfo.config 中获取
  const config = activeGroupInfo.value?.config
  if (!config) {
    return null
  }

  try {
    const configObj = typeof config === 'string' ? JSON.parse(config) : config

    // 验证模型是否匹配（防止错误的头像显示）
    if (configObj?.modelInfo?.model === props.model) {
      return configObj.modelInfo.modelAvatar || null
    }

    return null
  } catch (error) {
    return null
  }
})

// 头像优先级：插件 > 应用 > 模型
const finalAvatar = computed(() => {
  return pluginAvatar.value || appAvatar.value || modelAvatar.value
})
</script>

<template>
  <ModelAvatar :model="model" :modelAvatar="finalAvatar" size="md" />
</template>
