<script lang="ts" setup>
import { fetchQuerySingleChatLogAPI } from '@/api/chatLog'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { Copy, Delete, Film, NewPicture } from '@icon-park/vue-next'
import { computed, inject, onUnmounted, ref, watch } from 'vue'

interface Props {
  inversion?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  asRawText?: boolean
  imageUrl?: string
  videoUrl?: string
  progress?: string
  model?: string
  customId?: string
  modelName?: string
  index?: number
  chatId?: number
  taskId?: string
  action?: string // ✨ 使用action传递工具类型
}

interface Emit {
  (ev: 'delete'): void
  (ev: 'copy'): void
}

const onConversation = inject<any>('onConversation')

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const { isMobile } = useBasicLayout()
const chatStore = useChatStore()

let intervalId: number | undefined

/**
 * 监听状态变化，管理轮询定时器
 * 复用 Image 组件的轮询逻辑，同时更新 imageUrl 和 videoUrl
 */
watch(
  () => props.status,
  currentStatus => {
    // 清除可能已经存在的定时器
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }

    // 当status为2（处理中）时，启动定时器
    if (currentStatus === 2) {
      // 设置定时器，每5秒查询一次消息状态
      intervalId = window.setInterval(async () => {
        try {
          if (props.chatId && props.index !== undefined) {
            const response = (await fetchQuerySingleChatLogAPI({
              chatId: props.chatId,
            })) as any

            const result = response.data

            chatStore.updateGroupChatSome(props.index, {
              status: result.status,
              content: result.content,
              imageUrl: result.imageUrl,
              videoUrl: result.videoUrl,
              taskId: result.taskId,
              action: result.action,
              customId: result.customId,
            })

            if (result.status !== 2) {
              clearInterval(intervalId)
              intervalId = undefined
            }
          }
        } catch (error) {
          // 静默处理错误
        }
      }, 5000) // 每5秒执行一次
    }
  },
  { immediate: true }
)

// 组件卸载时清除定时器
onUnmounted(() => {
  if (intervalId !== undefined) {
    clearInterval(intervalId)
  }
})

const textRef = ref<HTMLElement>()

// 图片URL数组（支持多张图片）
const imageUrlArray = computed(() => {
  return props.imageUrl ? props.imageUrl.split(',') : []
})

// 视频URL
const videoUrl = computed(() => props.videoUrl)

// 判断是否有媒体文件（图片或视频）
const hasMedia = computed(() => {
  return imageUrlArray.value.length > 0 || videoUrl.value
})

// 文本内容
const text = computed(() => {
  const value = props.content ?? ''
  return value
})

// ✨ 判断工具类型是图片还是视频(从action读取)
const mediaTypeFromTool = computed<'image' | 'video' | 'unknown'>(() => {
  if (!props.action) {
    return 'unknown'
  }
  const tool = props.action.toLowerCase()
  // ✨ 优先判断视频工具(避免image2video被误判为图片)
  if (
    tool.includes('2video') || // text2video, image2video, video2video
    tool.includes('video') ||
    tool === 'text2video' ||
    tool === 'image2video' ||
    tool === 'video2video'
  ) {
    return 'video'
  }
  // 图片相关工具
  if (
    tool.includes('2image') || // text2image, image2image
    tool.includes('image') ||
    tool === 'text2image' ||
    tool === 'image2image' ||
    tool === 'inpainting' ||
    tool === 'outpainting'
  ) {
    return 'image'
  }
  return 'unknown'
})

// ✨ 判断应该显示哪种加载框
const loadingType = computed<'image' | 'video' | 'dots'>(() => {
  // 如果已经有媒体文件,不需要显示加载框
  if (hasMedia.value) {
    return 'dots' // 有内容就不显示加载框
  }

  // ✨ 如果有action(工具类型),根据工具类型显示对应的加载框
  if (props.action) {
    if (mediaTypeFromTool.value === 'image') {
      return 'image'
    }
    if (mediaTypeFromTool.value === 'video') {
      return 'video'
    }
  }

  // 如果无法判断工具类型,显示三点loading
  return 'dots'
})

// ✨ 是否显示三点loading
const showDotsLoading = computed(() => {
  // ✨ 有action时不显示三点loading,显示对应的图片/视频加载框
  if (props.action) {
    return false
  }
  // 没有action时才显示三点loading
  const shouldShow = loadingType.value === 'dots' && (props.status === 1 || props.status === 2)
  return shouldShow
})

// ✨ 是否显示图片加载框
const showImageLoading = computed(() => {
  return (
    loadingType.value === 'image' && (props.status === 1 || props.status === 2) && !hasMedia.value
  )
})

// ✨ 是否显示视频加载框
const showVideoLoading = computed(() => {
  return (
    loadingType.value === 'video' && (props.status === 1 || props.status === 2) && !hasMedia.value
  )
})

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

/**
 * 解析 customId 字符串为按钮配置数组
 * 支持格式: JSON 字符串数组，每个元素包含 customId, emoji, label, type, style
 */
interface CustomButton {
  customId: string
  emoji?: string
  label: string
  type?: number
  style?: number
}

const customButtons = computed<CustomButton[]>(() => {
  if (!props.customId) return []

  try {
    const parsed = JSON.parse(props.customId)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
})

/**
 * 通用按钮点击处理
 * 点击时将 customId 和 taskId 附加到 extraParam 中
 */
async function handleCustomButtonClick(button: CustomButton) {
  try {
    await onConversation({
      msg: getButtonText(button),
      extraParam: {
        customId: button.customId,
        taskId: props.taskId,
      },
    })
  } catch (error) {
    // 静默处理错误
  }
}

/**
 * 获取按钮显示文本
 * 如果同时有 emoji 和 label,拼接显示(emoji在前)
 */
function getButtonText(button: CustomButton): string {
  if (button.emoji && button.label) {
    return `${button.emoji} ${button.label}`
  }
  return button.emoji || button.label || '执行操作'
}

// 获取图片容器样式类
function getImageContainerClass() {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return '' // 单张图片不需要额外容器样式
  } else {
    // 统一使用弹性布局+自动换行，确保容器高度自动增长
    return 'flex flex-wrap gap-2 items-start'
  }
}

// 获取单个图片的样式类
function getImageClass() {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return 'max-w-md shadow-sm'
  } else {
    // 多张图片统一使用 flex 布局，防止图片被压缩
    return 'shadow-sm flex-shrink-0'
  }
}

// 获取图片内联样式
function getImageStyle() {
  const count = imageUrlArray.value.length

  if (count === 1) {
    return {
      maxHeight: '25vh',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain' as const,
    }
  } else {
    // 多张图片限制最大高度：移动端20vh，桌面端25vh
    return {
      maxWidth: '100%',
      height: 'auto',
      maxHeight: isMobile.value ? '20vh' : '25vh',
      objectFit: 'contain' as const,
    }
  }
}

// 获取加载容器样式类
function getLoadingContainerClass() {
  // 加载框默认使用单图样式
  return 'max-w-md'
}

// 获取加载框内联样式
function getLoadingStyle() {
  // 加载框默认使用单图的1:1比例样式
  return {
    height: '25vh',
    width: '25vh', // 1:1比例
  }
}

// 打开图片预览的方法
function openImagePreview(index: number) {
  // 通知父组件打开预览器
  if (onOpenImagePreviewer) {
    // 准备MJ相关数据
    const mjData = {
      model: props.model,
      status: props.status,
      customId: props.customId,
      modelName: props.modelName,
    }

    // 将MJ数据传递给预览器
    onOpenImagePreviewer(imageUrlArray.value, index, mjData)
  }
}

const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, mjData?: any) => void>('onOpenImagePreviewer')

defineExpose({ textRef })
</script>

<template>
  <div class="flex flex-col group w-full overflow-visible">
    <!-- ✨ 三点加载动画 - 独立显示在内容区域外面 -->
    <div v-if="showDotsLoading" class="flex items-center justify-start ml-2">
      <div class="loading-animation">
        <span></span>
      </div>
    </div>
    <div v-else ref="textRef" class="leading-relaxed break-words w-full overflow-visible">
      <div class="flex flex-col items-start w-full overflow-visible">
        <div class="w-full overflow-visible">
          <div v-text="text" class="whitespace-pre-wrap text-base" />
        </div>
      </div>
    </div>

    <div class="text-wrap rounded-lg min-w-12 text-gray-800 dark:text-gray-400 overflow-visible">
      <div class="overflow-visible">
        <div class="overflow-visible">
          <div
            class="my-1 flex w-auto overflow-visible"
            :style="{
              maxWidth: isMobile ? '100%' : '',
              objectFit: 'contain',
            }"
          >
            <!-- 媒体文件加载区域容器 -->
            <div class="relative flex w-full overflow-visible">
              <!-- 使用单一transition组件和mode="out-in"确保先出后进 -->
              <transition name="fade-transition" mode="out-in">
                <!-- ✨ 包装加载框和媒体显示的容器 -->
                <div :key="hasMedia ? 'media' : loadingType" class="w-full">
                  <!-- ✨ 图片加载框 - 当工具类型为图片时显示 -->
                  <div
                    v-if="showImageLoading"
                    class="flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700"
                    :class="getLoadingContainerClass()"
                    :style="getLoadingStyle()"
                  >
                    <div class="relative flex items-center justify-center">
                      <!-- 简约现代圆形进度条 -->
                      <svg class="w-16 h-16" viewBox="0 0 100 100">
                        <!-- 静态背景圆 -->
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke-width="4"
                          stroke="rgba(200, 200, 200, 0.2)"
                          class="dark:stroke-gray-700"
                        />

                        <!-- 主旋转环 -->
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke-width="4"
                          stroke="currentColor"
                          stroke-linecap="round"
                          class="text-primary-500 dark:text-primary-400 origin-center animate-spin"
                          stroke-dasharray="80 180"
                          style="animation-duration: 2s"
                        />
                      </svg>

                      <!-- 中间的图片图标 -->
                      <NewPicture
                        class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary-500 dark:text-primary-400"
                        theme="outline"
                        size="24"
                        fill="currentColor"
                      />
                    </div>
                  </div>

                  <!-- ✨ 视频加载框 - 当工具类型为视频时显示 -->
                  <div
                    v-if="showVideoLoading"
                    class="flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700"
                    :class="getLoadingContainerClass()"
                    :style="getLoadingStyle()"
                  >
                    <div class="relative flex items-center justify-center">
                      <!-- 简约现代圆形进度条 -->
                      <svg class="w-16 h-16" viewBox="0 0 100 100">
                        <!-- 静态背景圆 -->
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke-width="4"
                          stroke="rgba(200, 200, 200, 0.2)"
                          class="dark:stroke-gray-700"
                        />

                        <!-- 主旋转环 -->
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke-width="4"
                          stroke="currentColor"
                          stroke-linecap="round"
                          class="text-primary-500 dark:text-primary-400 origin-center animate-spin"
                          stroke-dasharray="80 180"
                          style="animation-duration: 2s"
                        />
                      </svg>

                      <!-- 中间的视频图标 -->
                      <Film
                        class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary-500 dark:text-primary-400"
                        theme="outline"
                        size="24"
                        fill="currentColor"
                      />
                    </div>
                  </div>

                  <!-- 媒体文件显示区域 -->
                  <div
                    v-if="hasMedia"
                    class="w-full flex flex-col gap-2"
                    style="height: auto; min-height: auto"
                  >
                    <!-- 图片显示区域 -->
                    <div v-if="imageUrlArray.length > 0" :class="getImageContainerClass()">
                      <img
                        v-for="(imageSrc, index) in imageUrlArray"
                        :key="`img-${index}`"
                        :src="imageSrc"
                        alt="图片"
                        @click="openImagePreview(index)"
                        class="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        :class="getImageClass()"
                        :style="getImageStyle()"
                        loading="lazy"
                      />
                    </div>

                    <!-- 视频显示区域 -->
                    <div v-if="videoUrl" class="w-full">
                      <video
                        :src="videoUrl"
                        controls
                        class="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        :style="{
                          maxWidth: '100%',
                          maxHeight: isMobile ? '' : '25vh',
                          objectFit: 'contain',
                        }"
                      >
                        {{ t('video.browserNotSupport') }}
                      </video>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
          </div>

          <!-- 通用自定义操作按钮 -->
          <div v-if="customButtons.length > 0 && imageUrl && status === 3" class="mt-2">
            <div class="flex flex-wrap w-full gap-4 my-1 pr-20">
              <button
                v-for="(button, index) in customButtons"
                :key="`btn-${index}`"
                @click="handleCustomButtonClick(button)"
                class="min-w-12 px-3 shadow-sm rounded-md py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-400 ring-1 ring-inset ring-gray-100 dark:bg-gray-800 dark:ring-gray-800 whitespace-nowrap"
              >
                {{ getButtonText(button) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div
      class="flex opacity-0 transition-opacity duration-300 group-hover:opacity-100 text-gray-700"
    >
      <div>
        <div class="mt-1 flex">
          <div class="relative group overflow-visible">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleCopy"
              aria-label="复制"
            >
              <Copy class="flex" />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
          </div>
          <div class="relative group overflow-visible">
            <button
              class="btn-icon btn-sm btn-icon-action mx-1"
              @click="handleDelete"
              aria-label="删除"
            >
              <Delete class="flex" />
            </button>
            <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 确保图片和加载框位置一致，避免移动效果 */
.flex > div {
  position: relative;
}

/* 确保Safari浏览器中的旋转效果正常 */
@media not all and (min-resolution: 0.001dpcm) {
  @supports (-webkit-appearance: none) {
    .animate-spin {
      animation-name: spin;
      animation-iteration-count: infinite;
      animation-timing-function: linear;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(360deg);
      }
    }
  }
}

/* 淡入淡出过渡效果 */
.fade-transition-enter-active,
.fade-transition-leave-active {
  transition: opacity 0.35s ease;
}

.fade-transition-enter-from,
.fade-transition-leave-to {
  opacity: 0;
}

/* 瀑布流布局支持 */
.columns-2 {
  columns: 2;
  column-gap: 0.5rem;
}

.columns-3 {
  columns: 3;
  column-gap: 0.5rem;
}

/* 防止图片在瀑布流中被分割 */
.break-inside-avoid {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ✨ 三点加载动画 */
.loading-animation {
  display: inline-block;
  position: relative;
  width: 60px;
  height: 20px;
}

.loading-animation:before,
.loading-animation:after,
.loading-animation span {
  content: '';
  display: block;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6366f1;
  animation: dotBounce 1.4s infinite ease-in-out;
}

.loading-animation:before {
  left: 0;
  animation-delay: 0s;
}

.loading-animation span {
  left: 26px;
  animation-delay: 0.2s;
}

.loading-animation:after {
  left: 52px;
  animation-delay: 0.4s;
}

@keyframes dotBounce {
  0%,
  80%,
  100% {
    transform: translateY(-50%) scale(0.6);
    opacity: 0.6;
  }
  40% {
    transform: translateY(-50%) scale(1);
    opacity: 1;
  }
}
</style>
