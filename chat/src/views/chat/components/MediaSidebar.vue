<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import {
  Close,
  Download,
  Share,
  Edit,
  Refresh,
  ZoomIn,
  ZoomOut,
  Rotate,
  Left,
  Right,
  PlayOne,
  Pause,
  VolumeNotice,
  FullScreenOne,
} from '@icon-park/vue-next'
import { t } from '@/locales'
import { message } from '@/utils/message'

interface MediaData {
  type: 'image' | 'video' | 'audio' | 'unknown'
  urls: string[]
  title: string
  content?: string
  metadata?: {
    model?: string
    modelName?: string
    taskId?: string
    customId?: string
    extend?: string
    taskData?: string
  }
}

interface Props {
  visible: boolean
  data?: MediaData | null
}

interface Emit {
  (ev: 'close'): void
  (ev: 'edit', data: any): void
  (ev: 'regenerate', data: any): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const ms = message()

// 当前显示的媒体索引
const currentIndex = ref(0)

// 图片缩放和旋转
const imageScale = ref(1)
const imageRotation = ref(0)

// 视频控制
const videoRef = ref<HTMLVideoElement>()
const isVideoPlaying = ref(false)
const videoVolume = ref(1)

// 音频控制
const audioRef = ref<HTMLAudioElement>()
const isAudioPlaying = ref(false)
const audioVolume = ref(1)
const audioProgress = ref(0)
const audioDuration = ref(0)

// 全屏状态
const isFullscreen = ref(false)

// 当前显示的URL
const currentUrl = computed(() => {
  if (!props.data?.urls?.length) return ''
  return props.data.urls[currentIndex.value] || ''
})

// 是否有多个媒体
const hasMultiple = computed(() => {
  return props.data?.urls && props.data.urls.length > 1
})

// 重置状态
const resetState = () => {
  currentIndex.value = 0
  imageScale.value = 1
  imageRotation.value = 0
  isVideoPlaying.value = false
  isAudioPlaying.value = false
  audioProgress.value = 0
}

// 监听visible变化
watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      resetState()
    }
  }
)

// 关闭侧边栏
const handleClose = () => {
  emit('close')
}

// 切换媒体
const switchMedia = (direction: 'prev' | 'next') => {
  if (!props.data?.urls) return

  const total = props.data.urls.length
  if (direction === 'prev') {
    currentIndex.value = (currentIndex.value - 1 + total) % total
  } else {
    currentIndex.value = (currentIndex.value + 1) % total
  }
}

// 图片操作
const handleZoomIn = () => {
  imageScale.value = Math.min(imageScale.value + 0.2, 3)
}

const handleZoomOut = () => {
  imageScale.value = Math.max(imageScale.value - 0.2, 0.5)
}

const handleRotateLeft = () => {
  imageRotation.value -= 90
}

const handleRotateRight = () => {
  imageRotation.value += 90
}

const resetImage = () => {
  imageScale.value = 1
  imageRotation.value = 0
}

// 视频操作
const toggleVideo = () => {
  if (!videoRef.value) return

  if (isVideoPlaying.value) {
    videoRef.value.pause()
  } else {
    videoRef.value.play()
  }
  isVideoPlaying.value = !isVideoPlaying.value
}

const handleVideoEnded = () => {
  isVideoPlaying.value = false
}

const handleVideoVolumeChange = (value: number) => {
  videoVolume.value = value
  if (videoRef.value) {
    videoRef.value.volume = value
  }
}

// 音频操作
const toggleAudio = () => {
  if (!audioRef.value) return

  if (isAudioPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
  isAudioPlaying.value = !isAudioPlaying.value
}

const handleAudioTimeUpdate = () => {
  if (!audioRef.value) return
  audioProgress.value = audioRef.value.currentTime
  audioDuration.value = audioRef.value.duration || 0
}

const handleAudioSeek = (value: number) => {
  if (!audioRef.value) return
  audioRef.value.currentTime = value
  audioProgress.value = value
}

const handleAudioEnded = () => {
  isAudioPlaying.value = false
}

const handleAudioVolumeChange = (value: number) => {
  audioVolume.value = value
  if (audioRef.value) {
    audioRef.value.volume = value
  }
}

// 格式化时间
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 下载当前媒体
const handleDownload = async () => {
  if (!currentUrl.value) return

  try {
    const link = document.createElement('a')
    link.href = currentUrl.value
    link.download = `${props.data?.title || 'media'}_${Date.now()}.${getFileExtension()}`
    link.click()
    ms.success(t('common.downloadSuccess'))
  } catch (error) {
    ms.error(t('common.downloadFailed'))
  }
}

// 获取文件扩展名
const getFileExtension = () => {
  switch (props.data?.type) {
    case 'image':
      return 'png'
    case 'video':
      return 'mp4'
    case 'audio':
      return 'mp3'
    default:
      return 'file'
  }
}

// 分享媒体
const handleShare = () => {
  navigator.clipboard.writeText(currentUrl.value)
  ms.success(t('common.linkCopied'))
}

// 编辑媒体
const handleEdit = () => {
  emit('edit', {
    url: currentUrl.value,
    type: props.data?.type,
    metadata: props.data?.metadata,
  })
}

// 重新生成
const handleRegenerate = () => {
  emit('regenerate', {
    type: props.data?.type,
    metadata: props.data?.metadata,
    content: props.data?.content,
  })
}

// 切换全屏
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}
</script>

<template>
  <n-drawer
    v-model:show="props.visible"
    :width="800"
    :placement="'right'"
    :trap-focus="false"
    :block-scroll="false"
    :to="false"
    class="media-sidebar"
    :class="{ fullscreen: isFullscreen }"
  >
    <n-drawer-content :native-scrollbar="false">
      <!-- 头部 -->
      <template #header>
        <div class="sidebar-header">
          <h3 class="sidebar-title">{{ data?.title || t('common.preview') }}</h3>
          <div class="header-actions">
            <n-button text @click="toggleFullscreen">
              <FullScreenOne theme="outline" size="20" />
            </n-button>
            <n-button text @click="handleClose">
              <Close theme="outline" size="20" />
            </n-button>
          </div>
        </div>
      </template>

      <!-- 主体内容 -->
      <div class="sidebar-content">
        <!-- 媒体预览区 -->
        <div class="preview-container">
          <!-- 多媒体切换器 -->
          <div v-if="hasMultiple" class="media-switcher">
            <n-button text @click="switchMedia('prev')">
              <Left theme="outline" size="24" />
            </n-button>
            <span class="switcher-info">{{ currentIndex + 1 }} / {{ data?.urls.length }}</span>
            <n-button text @click="switchMedia('next')">
              <Right theme="outline" size="24" />
            </n-button>
          </div>

          <!-- 图片预览 -->
          <div v-if="data?.type === 'image'" class="image-container">
            <img
              :src="currentUrl"
              :alt="data?.title"
              :style="{
                transform: `scale(${imageScale}) rotate(${imageRotation}deg)`,
                transition: 'transform 0.3s',
              }"
              class="preview-image"
            />

            <!-- 图片控制栏 -->
            <div class="image-controls">
              <n-button-group>
                <n-button @click="handleZoomOut" :disabled="imageScale <= 0.5">
                  <ZoomOut theme="outline" size="16" />
                </n-button>
                <n-button @click="resetImage"> {{ Math.round(imageScale * 100) }}% </n-button>
                <n-button @click="handleZoomIn" :disabled="imageScale >= 3">
                  <ZoomIn theme="outline" size="16" />
                </n-button>
              </n-button-group>

              <n-button-group>
                <n-button @click="handleRotateLeft" :title="t('common.rotateLeft')">
                  <Rotate theme="outline" size="16" style="transform: scaleX(-1)" />
                </n-button>
                <n-button @click="handleRotateRight" :title="t('common.rotateRight')">
                  <Rotate theme="outline" size="16" />
                </n-button>
              </n-button-group>
            </div>
          </div>

          <!-- 视频预览 -->
          <div v-else-if="data?.type === 'video'" class="video-container">
            <video
              ref="videoRef"
              :src="currentUrl"
              @ended="handleVideoEnded"
              class="preview-video"
              controls
            />

            <!-- 视频控制栏 -->
            <div class="video-controls">
              <n-button @click="toggleVideo">
                <PlayOne v-if="!isVideoPlaying" theme="outline" size="16" />
                <Pause v-else theme="outline" size="16" />
              </n-button>

              <div class="volume-control">
                <VolumeNotice theme="outline" size="16" />
                <n-slider
                  v-model:value="videoVolume"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  @update:value="handleVideoVolumeChange"
                  style="width: 100px"
                />
              </div>
            </div>
          </div>

          <!-- 音频预览 -->
          <div v-else-if="data?.type === 'audio'" class="audio-container">
            <audio
              ref="audioRef"
              :src="currentUrl"
              @timeupdate="handleAudioTimeUpdate"
              @ended="handleAudioEnded"
            />

            <div class="audio-visualizer">
              <div class="audio-icon">
                <n-button circle size="large" @click="toggleAudio">
                  <PlayOne v-if="!isAudioPlaying" theme="outline" size="24" />
                  <Pause v-else theme="outline" size="24" />
                </n-button>
              </div>

              <div class="audio-info">
                <h4>{{ data?.title || t('common.audio') }}</h4>
                <p>{{ data?.content || t('common.noDescription') }}</p>
              </div>
            </div>

            <!-- 音频控制栏 -->
            <div class="audio-controls">
              <div class="progress-control">
                <span class="time">{{ formatTime(audioProgress) }}</span>
                <n-slider
                  v-model:value="audioProgress"
                  :min="0"
                  :max="audioDuration"
                  :step="1"
                  @update:value="handleAudioSeek"
                  style="flex: 1"
                />
                <span class="time">{{ formatTime(audioDuration) }}</span>
              </div>

              <div class="volume-control">
                <VolumeNotice theme="outline" size="16" />
                <n-slider
                  v-model:value="audioVolume"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  @update:value="handleAudioVolumeChange"
                  style="width: 100px"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 信息和操作区 -->
        <div class="info-section">
          <!-- 描述信息 -->
          <n-card v-if="data?.content" :title="t('common.description')" size="small">
            <p>{{ data.content }}</p>
          </n-card>

          <!-- 元数据信息 -->
          <n-card v-if="data?.metadata" :title="t('common.metadata')" size="small">
            <n-descriptions :column="2" label-placement="left">
              <n-descriptions-item v-if="data.metadata.model" :label="t('common.model')">
                {{ data.metadata.model }}
              </n-descriptions-item>
              <n-descriptions-item v-if="data.metadata.modelName" :label="t('common.modelName')">
                {{ data.metadata.modelName }}
              </n-descriptions-item>
              <n-descriptions-item v-if="data.metadata.taskId" :label="t('common.taskId')">
                {{ data.metadata.taskId }}
              </n-descriptions-item>
            </n-descriptions>
          </n-card>

          <!-- 操作按钮 -->
          <n-card :title="t('common.actions')" size="small">
            <n-space>
              <n-button type="primary" @click="handleEdit">
                <template #icon>
                  <Edit theme="outline" />
                </template>
                {{ t('common.edit') }}
              </n-button>

              <n-button @click="handleRegenerate">
                <template #icon>
                  <Refresh theme="outline" />
                </template>
                {{ t('common.regenerate') }}
              </n-button>

              <n-button @click="handleDownload">
                <template #icon>
                  <Download theme="outline" />
                </template>
                {{ t('common.download') }}
              </n-button>

              <n-button @click="handleShare">
                <template #icon>
                  <Share theme="outline" />
                </template>
                {{ t('common.share') }}
              </n-button>
            </n-space>
          </n-card>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
.media-sidebar {
  &.fullscreen {
    :deep(.n-drawer-content-wrapper) {
      width: 100% !important;
    }
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .sidebar-title {
    margin: 0;
    font-size: 16px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }
}

.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-container {
  position: relative;
  background: var(--n-bg-color-modal);
  border-radius: 8px;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  flex-direction: column;

  .media-switcher {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 8px 16px;
    border-radius: 24px;
    z-index: 10;

    .switcher-info {
      font-size: 14px;
    }
  }
}

.image-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .image-controls {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 16px;
    background: rgba(255, 255, 255, 0.9);
    padding: 8px;
    border-radius: 8px;
  }
}

.video-container {
  flex: 1;
  display: flex;
  flex-direction: column;

  .preview-video {
    width: 100%;
    flex: 1;
    object-fit: contain;
    background: black;
  }

  .video-controls {
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--n-bg-color);

    .volume-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
}

.audio-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;

  .audio-visualizer {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-bottom: 32px;

    .audio-icon {
      display: flex;
    }

    .audio-info {
      h4 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      p {
        margin: 0;
        color: var(--n-text-color-disabled);
      }
    }
  }

  .audio-controls {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    .progress-control {
      display: flex;
      align-items: center;
      gap: 12px;

      .time {
        font-size: 12px;
        color: var(--n-text-color-disabled);
        min-width: 40px;
      }
    }

    .volume-control {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }
  }
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// 深色模式适配
html.dark {
  .image-controls {
    background: rgba(0, 0, 0, 0.8);
  }
}
</style>
