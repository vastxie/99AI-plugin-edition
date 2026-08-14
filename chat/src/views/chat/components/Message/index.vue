<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { computed, inject, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AvatarComponent from './Avatar.vue'
import CreativeComponent from './Creative/index.vue'
import MermaidComponent from './Mermaid/index.vue'
import MindMapComponent from './MindMap/index.vue'
import MusicComponent from './Music/index.vue'
import PptExecutionCard from './Ppt/PptExecutionCard.vue'
import PptThemeComponent from './Ppt/PptThemeComponent.vue'
import TextComponent from './Text/index.vue'

interface Props {
  chatId?: number
  dateTime?: string
  content?: string
  model?: string
  modelName?: string
  modelType?: number
  drawingType?: number
  status?: number
  role?: string
  loading?: boolean
  imageUrl?: string
  ttsUrl?: string
  useFileSearch?: boolean
  fileUrl?: string
  videoUrl?: string
  audioUrl?: string
  extend?: string
  customId?: string
  action?: string
  taskData?: string
  pluginParam?: string
  progress?: string
  index: number
  isLast?: boolean
  usingTool?: boolean
  usingDeepThinking?: boolean
  reasoningText?: string
  taskId?: string
  conversationId?: number
  agent_content?: string
  appId?: number
}

interface Emit {
  (ev: 'regenerate', data?: any): void
  (ev: 'delete'): void
}

const { isMobile } = useBasicLayout()
const globalStore = useGlobalStoreWithOut()
const { t } = useI18n()

const props = defineProps<Props>()
const emit = defineEmits<Emit>()
const ms = message()

// 检查是否在分享模式下
const isShareMode = inject('isShareMode', false)

// 调试props
if (props.pluginParam === 'ppt-generation') {
  // PPT生成组件初始化
}

// 添加计算属性判断是否是用户消息
const isUserMessage = computed(() => props.role === 'user')

// 解析agent_content中的数据
const parsedAgentContent = computed(() => {
  if (!props.agent_content) {
    return null
  }

  try {
    const parsed = JSON.parse(props.agent_content)
    return parsed
  } catch (e) {
    return null
  }
})

// 监听agent_content变化
watch(
  () => props.agent_content,
  (newVal, oldVal) => {
    if (newVal !== oldVal && props.pluginParam === 'ppt-generation') {
      // 仅在PPT生成时记录关键信息
      try {
        const parsed = newVal ? JSON.parse(newVal) : null
        if (parsed?.data?.ppt) {
          // PPT数据更新
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  },
  { immediate: true }
)

// 从agent_content中解析PPT数据
const pptData = computed(() => {
  // 尝试多种路径获取PPT数据
  let data = null

  if (parsedAgentContent.value) {
    // 路径1: 标准路径 data.ppt
    data = parsedAgentContent.value?.data?.ppt || null

    // 路径2: 从 toolExecutions 中查找 PPT 工具执行结果
    if (!data && parsedAgentContent.value?.data?.toolExecutions) {
      const toolExecutions = parsedAgentContent.value.data.toolExecutions

      // 筛选所有 PPT 相关的工具执行
      const pptExecutions = toolExecutions.filter(
        (exec: any) =>
          exec.name?.includes('PPT') ||
          exec.id?.includes('ppt') ||
          exec.output?.title || // PPT 主题数据
          exec.output?.slides // PPT 完整数据
      )

      if (pptExecutions.length > 0) {
        // 优先选择有结果的执行（失败或成功），其次选择最新的
        let selectedExecution = pptExecutions.find(
          (exec: any) => exec.status === 'failed' || (exec.status === 'success' && exec.output)
        )

        // 如果没有完成的执行，选择最后一个（最新的）
        if (!selectedExecution) {
          selectedExecution = pptExecutions[pptExecutions.length - 1]
        }

        // 构造 PPT 数据结构（即使失败也要构造，以便显示错误信息）
        if (selectedExecution) {
          data = {
            type: selectedExecution.name?.includes('主题')
              ? 'theme'
              : selectedExecution.name?.includes('大纲')
                ? 'outline'
                : selectedExecution.name?.includes('内容')
                  ? 'complete'
                  : 'complete',
            status:
              selectedExecution.status === 'success'
                ? 'completed'
                : selectedExecution.status === 'loading'
                  ? 'processing'
                  : selectedExecution.status === 'failed'
                    ? 'failed'
                    : 'processing',
            input: {
              title: selectedExecution.output?.title || '',
              subtitle: selectedExecution.output?.subtitle || '',
              requirements: selectedExecution.input || '',
            },
            output: selectedExecution.output || null,
            error: selectedExecution.error || null,
            statusMessage: selectedExecution.input || selectedExecution.error || '',
          }
        }
      }
    }

    // 路径3: 如果没找到，尝试直接访问 ppt
    if (!data && parsedAgentContent.value?.ppt) {
      data = parsedAgentContent.value.ppt
    }

    // 路径4: 如果是数组格式（可能是增量更新）
    if (!data && Array.isArray(parsedAgentContent.value)) {
      const pptItem = parsedAgentContent.value.find(item => item?.data?.ppt)
      data = pptItem?.data?.ppt || null
    }

    // 路径5: metadata格式
    if (!data && parsedAgentContent.value?.metadata && parsedAgentContent.value?.data?.ppt) {
      data = parsedAgentContent.value.data.ppt
    }
  }

  return data
})

// 判断PPT类型
const isPptTheme = computed(() => {
  const isTheme = pptData.value?.type === 'theme'

  return isTheme
})

// 获取预览器状态
const isPreviewerVisible = computed(
  () =>
    globalStore.showHtmlPreviewer ||
    globalStore.showImagePreviewer ||
    globalStore.isMarkdownPreviewerVisible ||
    globalStore.showMessageEditor
)

const messageRef = ref<HTMLElement>()

// 从父组件接收onOpenImagePreviewer
const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, mjData?: any) => void>('onOpenImagePreviewer')

const onMediaPreview = inject<(data: any) => void>('onMediaPreview')

// 将onOpenImagePreviewer提供给子组件，确保依赖注入链不断
provide('onOpenImagePreviewer', onOpenImagePreviewer)
provide('onMediaPreview', onMediaPreview)

function handleDelete() {
  if (!isShareMode) emit('delete')
}

function handleCopy() {
  if (!isShareMode) {
    copyText({ text: props.content ?? '' })
    if (props.content) {
      ms.success(t('chat.copySuccess'))
    }
  }
}

function handleRegenerate() {
  if (!isShareMode) {
    messageRef.value?.scrollIntoView()
    emit('regenerate')
  }
}

// 处理媒体预览

// 处理媒体编辑
</script>

<template>
  <div ref="messageRef" class="flex w-full my-2 pb-1 items-start flex-row">
    <div
      v-if="!isUserMessage && !isMobile && !isPreviewerVisible"
      class="items-center justify-center mr-2 rounded-full group-btn relative flex-shrink-0"
    >
      <AvatarComponent
        v-if="!isUserMessage"
        :image="isUserMessage"
        :model="model"
        :pluginParam="pluginParam"
        :appId="appId"
      />
      <div class="tooltip tooltip-top">{{ modelName }}</div>
    </div>

    <div class="text-sm items-start w-full min-w-0" style="overflow: visible">
      <div class="flex items-end gap-1 flex-row">
        <MindMapComponent
          v-if="pluginParam === 'mind-map' && !isUserMessage"
          :isUserMessage="isUserMessage"
          :extend="extend"
          :customId="customId"
          :content="content"
          :modelType="modelType"
          :imageUrl="imageUrl"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :index="index"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDelete"
        />
        <MermaidComponent
          v-else-if="pluginParam === 'mermaid' && !isUserMessage"
          :isUserMessage="isUserMessage"
          :extend="extend"
          :customId="customId"
          :content="content"
          :modelType="modelType"
          :ttsUrl="ttsUrl"
          :model="model"
          :modelName="modelName"
          :loading="loading"
          :status="status"
          :index="index"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDelete"
        />
        <!-- PPT主题选择卡片（优先判断） -->
        <PptThemeComponent
          v-else-if="
            pluginParam === 'ppt-generation' &&
            !isUserMessage &&
            pptData &&
            isPptTheme &&
            pptData.status === 'completed'
          "
          :pptData="pptData"
          :messageId="String(chatId)"
          :conversationId="String(conversationId)"
        />
        <!-- PPT执行卡片（显示生成进度，排除主题完成的情况） -->
        <PptExecutionCard
          v-else-if="
            pluginParam === 'ppt-generation' &&
            !isUserMessage &&
            pptData &&
            (pptData.status === 'processing' ||
              pptData.status === 'failed' ||
              (pptData.status === 'completed' && !isPptTheme))
          "
          :pptData="pptData"
          :isGenerating="loading"
          :conversationId="conversationId"
        />
        <!-- 通用创意组件（支持图片+视频） -->
        <CreativeComponent
          v-else-if="!isUserMessage && [2, 3, 6].includes(modelType!)"
          :index="index"
          :modelName="modelName"
          :chatId="chatId"
          :inversion="isUserMessage"
          :content="content"
          :modelType="modelType"
          :status="status"
          :imageUrl="imageUrl"
          :videoUrl="videoUrl"
          :taskId="taskId"
          :model="model"
          :loading="loading"
          :customId="customId"
          :action="action"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDelete"
        />
        <!-- 音乐组件 -->
        <MusicComponent
          v-else-if="!isUserMessage && modelType === 4"
          :index="index"
          :modelName="modelName"
          :chatId="chatId"
          :inversion="isUserMessage"
          :content="content"
          :modelType="modelType"
          :status="status"
          :imageUrl="imageUrl"
          :videoUrl="videoUrl"
          :audioUrl="audioUrl"
          :model="model"
          :loading="loading"
          :taskData="taskData"
          :action="action"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDelete"
        />
        <!-- 文本组件 -->
        <TextComponent
          v-else
          :index="index"
          :modelName="modelName"
          :chatId="chatId"
          :isUserMessage="isUserMessage"
          :content="content"
          :modelType="modelType"
          :status="status"
          :imageUrl="imageUrl"
          :videoUrl="videoUrl"
          :audioUrl="audioUrl"
          :ttsUrl="ttsUrl"
          :fileUrl="fileUrl"
          :useFileSearch="useFileSearch"
          :model="model"
          :loading="loading"
          :isLast="isLast"
          :agent_content="agent_content"
          :usingTool="usingTool"
          :usingDeepThinking="usingDeepThinking"
          :reasoningText="reasoningText"
          :progress="progress"
          :taskId="taskId"
          :customId="customId"
          :extend="extend"
          :taskData="taskData"
          :action="action"
          @regenerate="handleRegenerate"
          @copy="handleCopy"
          @delete="handleDelete"
        />
      </div>
    </div>
  </div>
</template>
