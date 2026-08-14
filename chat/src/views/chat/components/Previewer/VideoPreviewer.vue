<script setup lang="ts">
import { t } from '@/locales'
import { message } from '@/utils/message'
import {
  Close,
  Download,
  FullScreenOne,
  Pause,
  PlayOne,
  Speed,
  VolumeMute,
  VolumeNotice,
} from '@icon-park/vue-next'
import { onMounted, onUnmounted, ref } from 'vue'

interface Props {
  videoUrl?: string
  title?: string
  close: () => void
}

const props = defineProps<Props>()

const ms = message()

// 视频播放器引用
const videoRef = ref<HTMLVideoElement>()
const isPlaying = ref(false)
const isMuted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const isFullscreen = ref(false)
const showControls = ref(true)

// 播放速度选项
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2]
const showSpeedMenu = ref(false)

// 格式化时间
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 播放/暂停
const togglePlay = () => {
  if (!videoRef.value) return

  if (isPlaying.value) {
    videoRef.value.pause()
  } else {
    videoRef.value.play()
  }
}

// 静音切换
const toggleMute = () => {
  if (!videoRef.value) return
  videoRef.value.muted = !videoRef.value.muted
  isMuted.value = videoRef.value.muted
}

// 全屏切换
const toggleFullscreen = () => {
  if (!videoRef.value) return

  if (!document.fullscreenElement) {
    videoRef.value.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

// 设置播放速度
const setPlaybackRate = (rate: number) => {
  if (!videoRef.value) return
  videoRef.value.playbackRate = rate
  playbackRate.value = rate
  showSpeedMenu.value = false
}

// 进度条拖动
const onProgressChange = (value: number) => {
  if (!videoRef.value) return
  videoRef.value.currentTime = value
}

// 下载视频
const handleDownload = () => {
  if (!props.videoUrl) return

  try {
    const link = document.createElement('a')
    link.href = props.videoUrl
    link.download = `video_${Date.now()}.mp4`
    link.click()
    ms.success(t('common.downloadSuccess'))
  } catch (error) {
    ms.error(t('common.downloadFailed'))
  }
}

// 视频事件监听
const onVideoPlay = () => {
  isPlaying.value = true
}

const onVideoPause = () => {
  isPlaying.value = false
}

const onVideoTimeUpdate = () => {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
}

const onVideoLoadedMetadata = () => {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
}

// 键盘快捷键
const handleKeydown = (e: KeyboardEvent) => {
  if (!videoRef.value) return

  switch (e.key) {
    case ' ':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime - 5)
      break
    case 'ArrowRight':
      e.preventDefault()
      videoRef.value.currentTime = Math.min(duration.value, videoRef.value.currentTime + 5)
      break
    case 'ArrowUp':
      e.preventDefault()
      videoRef.value.volume = Math.min(1, videoRef.value.volume + 0.1)
      break
    case 'ArrowDown':
      e.preventDefault()
      videoRef.value.volume = Math.max(0, videoRef.value.volume - 0.1)
      break
    case 'm':
      e.preventDefault()
      toggleMute()
      break
    case 'f':
      e.preventDefault()
      toggleFullscreen()
      break
    case 'Escape':
      if (isFullscreen.value) {
        toggleFullscreen()
      } else {
        props.close()
      }
      break
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="video-previewer">
    <!-- 顶部工具栏 -->
    <div class="preview-header">
      <h3 class="preview-title">{{ title || t('common.video') }}</h3>
      <div class="header-actions">
        <n-button size="small" @click="handleDownload" :disabled="!videoUrl">
          <Download theme="outline" size="18" />
        </n-button>
        <n-button size="small" @click="close">
          <Close theme="outline" size="18" />
        </n-button>
      </div>
    </div>

    <!-- 视频播放器 -->
    <div class="video-container">
      <video
        v-if="videoUrl"
        ref="videoRef"
        :src="videoUrl"
        class="video-player"
        @play="onVideoPlay"
        @pause="onVideoPause"
        @timeupdate="onVideoTimeUpdate"
        @loadedmetadata="onVideoLoadedMetadata"
        @click="togglePlay"
      />

      <div v-else class="no-video">
        {{ t('common.noVideo') }}
      </div>

      <!-- 自定义控制栏 -->
      <div v-if="videoUrl" class="video-controls" :class="{ show: showControls }">
        <!-- 进度条 -->
        <div class="progress-bar">
          <n-slider
            :value="currentTime"
            :max="duration"
            :tooltip="false"
            @update:value="onProgressChange"
          />
          <div class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
        </div>

        <!-- 控制按钮 -->
        <div class="control-buttons">
          <div class="left-controls">
            <!-- 播放/暂停 -->
            <n-button text @click="togglePlay">
              <PlayOne v-if="!isPlaying" theme="outline" size="24" fill="white" />
              <Pause v-else theme="outline" size="24" fill="white" />
            </n-button>

            <!-- 静音 -->
            <n-button text @click="toggleMute">
              <VolumeNotice v-if="!isMuted" theme="outline" size="20" fill="white" />
              <VolumeMute v-else theme="outline" size="20" fill="white" />
            </n-button>
          </div>

          <div class="right-controls">
            <!-- 播放速度 -->
            <n-dropdown
              v-model:show="showSpeedMenu"
              :options="speedOptions.map(s => ({ label: `${s}x`, key: s }))"
              @select="setPlaybackRate"
            >
              <n-button text>
                <Speed theme="outline" size="20" fill="white" />
                <span class="speed-text">{{ playbackRate }}x</span>
              </n-button>
            </n-dropdown>

            <!-- 全屏 -->
            <n-button text @click="toggleFullscreen">
              <FullScreenOne theme="outline" size="20" fill="white" />
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷键提示 -->
    <div class="keyboard-hints">
      <span>{{ t('common.keyboardHints') }}:</span>
      <span>{{ t('common.space') }}: {{ t('common.playPause') }}</span>
      <span>← →: {{ t('common.seek') }}</span>
      <span>↑ ↓: {{ t('common.volume') }}</span>
      <span>M: {{ t('common.mute') }}</span>
      <span>F: {{ t('common.fullscreen') }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.video-previewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--n-bg-color);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--n-border-color);

  .preview-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }
}

.video-container {
  flex: 1;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;

  .video-player {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .no-video {
    color: #666;
    font-size: 14px;
  }
}

.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 20px;
  opacity: 0;
  transition: opacity 0.3s;

  &.show,
  &:hover {
    opacity: 1;
  }

  .progress-bar {
    margin-bottom: 12px;

    .time-display {
      text-align: center;
      color: white;
      font-size: 12px;
      margin-top: 4px;
    }
  }

  .control-buttons {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .left-controls,
    .right-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .speed-text {
      color: white;
      font-size: 12px;
      margin-left: 4px;
    }
  }
}

.keyboard-hints {
  padding: 8px 16px;
  background: var(--n-bg-color-modal);
  font-size: 12px;
  color: var(--n-text-color-disabled);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

// 移动端适配
@media (max-width: 768px) {
  .keyboard-hints {
    display: none;
  }

  .video-controls {
    padding: 12px;

    .control-buttons {
      .speed-text {
        display: none;
      }
    }
  }
}
</style>
