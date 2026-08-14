<script lang="ts" setup>
import { fetchQuerySingleChatLogAPI } from '@/api/chatLog'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useChatStore } from '@/store/modules/chat'
import { Close, Copy, Delete, DownloadOne, Pause, PlayOne } from '@icon-park/vue-next'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
interface Props {
  chatId?: number
  modelType?: number
  status?: number
  loading?: boolean
  videoUrl?: string
  audioUrl?: string
  model?: string
  drawId?: string
  customId?: string
  extend?: string
  imageUrl?: string
  ttsUrl?: string
  modelName?: string
  action?: string
  taskData?: string
  index: number
  content?: string
}

interface Emit {
  (ev: 'delete'): void
  (ev: 'copy'): void
  (ev: 'regenerate'): void
}

const isPlayingIndex = ref(-1)

const isInstrumental = ref(false)
const useMusicStyle = ref('')

// 添加下拉菜单状态管理
const dropdownStates = ref({
  musicModel: false,
  musicStyle: false,
  musicModelInDialog: false,
  musicStyleInDialog: false,
})

const onConversation = inject<any>('onConversation')

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { isMobile } = useBasicLayout()
let intervalId: number | undefined

const isDialogVisible = ref(false)
const customIdData = ref({ title: '', text: '' })

// 定义一个方法来更新 customIdData
const updateCustomIdData = () => {
  customIdData.value = JSON.parse(props.taskData || '{}')
}

// 监听 props.taskData 的变化并更新 customIdData
watch(
  () => props.taskData,
  () => {
    updateCustomIdData()
  },
  { immediate: true } // 确保在组件加载时立即运行一次
)

// 在组件加载时立即更新 customIdData
onMounted(() => {
  updateCustomIdData()
})

const closeDialog = () => {
  isDialogVisible.value = false
}

const musicModel = ref([
  {
    id: 'default',
    title: '普通歌曲',
    values: false,
  },
  {
    id: 'instrumental',
    title: '纯音乐',
    values: true,
  },
])

const musicStyle = ref([
  {
    id: 'default',
    title: '默认',
    values: '',
  },
  {
    id: 'pop',
    title: '流行',
    values: 'pop',
  },
  {
    id: 'rock',
    title: '摇滚',
    values: 'rock',
  },
  {
    id: 'hiphop',
    title: '嘻哈/说唱',
    values: 'hiphop',
  },
  {
    id: 'jazz',
    title: '爵士',
    values: 'jazz',
  },
  {
    id: 'blues',
    title: '蓝调/灵魂',
    values: 'blues',
  },
  {
    id: 'country',
    title: '乡村',
    values: 'country',
  },
  {
    id: 'classical',
    title: '古典',
    values: 'classical',
  },
  {
    id: 'folk',
    title: '民谣',
    values: 'folk',
  },
  {
    id: 'latin',
    title: '拉丁',
    values: 'latin',
  },
  {
    id: 'world',
    title: '世界音乐',
    values: 'world',
  },
  {
    id: 'electronic',
    title: '电子',
    values: 'electronic',
  },
  {
    id: 'newage',
    title: '新世纪',
    values: 'newage',
  },
  {
    id: 'metal',
    title: '重金属',
    values: 'metal',
  },
  {
    id: 'punk',
    title: '朋克',
    values: 'punk',
  },
  {
    id: 'rnb',
    title: '节奏布鲁斯',
    values: 'rnb',
  },
])

const selectedMusicModel = ref(musicModel.value[0])

const selectedMusicStyle = ref(musicStyle.value[0])

const switchInstrumental = (option: any) => {
  isInstrumental.value = option.values
  selectedMusicModel.value = option
}

const switchMusicStyle = (option: any) => {
  useMusicStyle.value = option.values
  selectedMusicStyle.value = option
}

const filteredLines = computed(() => {
  return customIdData.value.text.split('\n').filter(line => line.trim() !== '')
})

// 选择音乐类型
const selectMusicType = (option: any) => {
  switchInstrumental(option)
}

// 选择音乐风格
const selectMusicStyle = (option: any) => {
  switchMusicStyle(option)
}

// 创作音乐
const handleEditSubmit = async () => {
  try {
    customIdData.value = JSON.parse(props.taskData || '{}')

    const customId = JSON.stringify({
      title: customIdData.value.title,
      prompt: isInstrumental.value ? '' : props.content,
      text: props.content,
      mv: 'chirp-crow',
      make_instrumental: isInstrumental.value,
      tags: useMusicStyle.value,
    })

    await onConversation({
      msg: `${customIdData.value.title}`,
      action: 'MUSIC',
      customId: customId,
      modelType: 2,
      model: 'suno-music',
      modelName: props.modelName || 'AI音乐',
      pluginParam: 'suno-music',
    })
  } catch (error) {}
}

watch(
  () => props.status,
  currentStatus => {
    // 清除可能已经存在的定时器
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }

    // 当status为2时，启动定时器
    if (currentStatus === 2) {
      intervalId = window.setInterval(async () => {
        // 这里替换为你想要定期执行的操作

        await chatStore.queryActiveChatLogList()
        // 例如，可以在这里调用 chatStore.queryActiveChatLogList();
      }, 5000) // 每5秒执行一次
    }
  },
  { immediate: true }
)

watch(
  () => props.status,
  currentStatus => {
    // 清除可能已经存在的定时器
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      intervalId = undefined
    }

    // 当status为2（处理中）且有chatId时，启动定时器
    if (currentStatus === 2) {
      // 设置定时器，每10秒查询一次消息状态
      intervalId = window.setInterval(async () => {
        try {
          if (props.chatId) {
            const response = (await fetchQuerySingleChatLogAPI({
              chatId: props.chatId,
            })) as any

            const result = response.data
            chatStore.updateGroupChatSome(props.index, {
              status: result.status,
              content: result.content,
              imageUrl: result.imageUrl,
              taskId: result.taskId,
              taskData: result.taskData,
              audioUrl: result.audioUrl,
              videoUrl: result.videoUrl,
              // audioInfo: result.audioInfo,
            })
            if (result.status !== 2) {
              clearInterval(intervalId)
              intervalId = undefined
            }
          }
        } catch (error) {}
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

const imageInfo = computed(() => {
  const result = props.imageUrl
    ? props.imageUrl
        .split(',')
        .map(url => url.trim())
        .filter(Boolean)
        .map(url => ({ type: 'image', url }))
    : []
  return result
})

const videoInfo = computed(() => {
  const result = props.videoUrl
    ? props.videoUrl
        .split(',')
        .map(url => url.trim())
        .filter(Boolean)
        .map(url => ({ type: 'video', url }))
    : []
  return result
})

const audioInfo = computed(() => {
  const result = props.audioUrl
    ? props.audioUrl
        .split(',')
        .map(url => url.trim())
        .filter(Boolean)
        .map(url => ({ type: 'audio', url }))
    : []
  return result
})

const mediaInfo = computed(() => {
  customIdData.value = JSON.parse(props.taskData || '{}')

  const maxLength = Math.max(imageInfo.value.length, videoInfo.value.length, audioInfo.value.length)

  const result = Array.from({ length: maxLength }, (_, index) => ({
    image: imageInfo.value[index] || { type: 'image', url: '' },
    video: videoInfo.value[index] || { type: 'video', url: '' },
    audio: audioInfo.value[index] || { type: 'audio', url: '' },
    title: '标题',
    subtitle: '媒体风格',
  }))

  return result
})

// const progress = ref<number[]>([]);
const progress = ref(new Array(mediaInfo.value.length).fill(0))
const updateTime = (index: number) => {
  const audio = audioRefs.value[index]
  if (audio) {
    currentTime.value[index] = audio.currentTime
    if (audio.duration) {
      duration.value[index] = audio.duration
    }
    progress.value[index] = (audio.currentTime / audio.duration) * 100
  }
}

const updateProgress = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement
  progress.value[index] = Number(input.value)
}

const seek = (index: number, event: Event) => {
  const audio = audioRefs.value[index]
  const input = event.target as HTMLInputElement
  if (audio) {
    const seekTime = (Number(input.value) / 100) * audio.duration
    audio.currentTime = seekTime
  }
}

const audioRefs = ref<HTMLAudioElement[]>([])

const togglePlay = (index: number) => {
  const currentAudio = audioRefs.value[index]

  if (currentAudio) {
    // 暂停所有其他音频
    audioRefs.value.forEach((audio, idx) => {
      if (audio && idx !== index) {
        audio.pause()
        audio.currentTime = 0 // 可选：重置音频到起始位置
      }
    })

    if (currentAudio.paused) {
      currentAudio.play()

      isPlayingIndex.value = index
    } else {
      currentAudio.pause()

      isPlayingIndex.value = -1
    }
  } else {
  }
}
const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return ''
  }

  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`
}

const currentTime = ref<number[]>([])
const duration = ref<number[]>([])

const textRef = ref<HTMLElement>()
const chatStore = useChatStore()

function downloadAudio(url: string) {
  fetch(url)
    .then(response => response.blob())
    .then(blob => {
      const link = document.createElement('a')
      const objectURL = URL.createObjectURL(blob)
      link.href = objectURL
      const title = props.content || '音频文件'
      link.setAttribute('download', `${title}.mp3`) // 可以根据需要修改文件名
      link.style.display = 'none' // 隐藏链接
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectURL) // 释放URL对象
    })
    .catch(() => {})
}

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

defineExpose({ textRef })

const isVideoDialogVisible = ref(false)
const currentVideoUrl = ref('')

const showVideoDialog = (videoUrl: string) => {
  if (!videoUrl) {
    chatStore.queryActiveChatLogList()
    return
  }
  currentVideoUrl.value = videoUrl
  isVideoDialogVisible.value = true
}

const closeVideoDialog = () => {
  isVideoDialogVisible.value = false
}
</script>

<template>
  <div class="flex flex-col group max-w-full w-full">
    <div ref="textRef" class="leading-relaxed break-words w-full">
      <div class="w-full flex flex-col items-start" :class="isMobile ? '' : 'pr-10'">
        <!-- 卡片容器 -->
        <div
          class="w-full text-base text-gray-800 dark:text-gray-100 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-850 p-0 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col relative font-sans leading-7 tracking-wide transition-all duration-300"
          :class="isMobile ? 'min-h-[300px]' : 'min-h-[150px]'"
          style="width: 100%"
        >
          <!-- 卡片标题 -->
          <div
            class="px-5 pt-3 pb-3 flex-shrink-0 border-b border-gray-200/30 dark:border-gray-700/30"
          >
            <div
              class="font-medium mb-0 text-gray-900 dark:text-gray-200 text-center text-lg pb-2 relative"
            >
              {{
                status === 2
                  ? '生成中'
                  : props.action === 'LYRICS'
                    ? customIdData.title || '歌词'
                    : '音乐'
              }}
              <div
                class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[60px] h-[1px] bg-gradient-to-r from-transparent via-primary-500 to-transparent rounded"
              ></div>
            </div>
          </div>

          <!-- 卡片内容区域 -->
          <div class="px-5 flex-1 overflow-hidden relative">
            <!-- 加载状态 -->
            <div v-if="status !== 3" class="py-8 flex flex-col items-center justify-center h-full">
              <div class="loading-animation mb-3"><span></span></div>
              <span class="text-gray-500 dark:text-gray-400">
                {{
                  props.action === 'LYRICS'
                    ? t('music.generatingLyrics')
                    : t('music.generatingMusic')
                }}
              </span>
            </div>

            <!-- 音频播放器区域 - 只在状态不为2且有音频URL时显示 -->
            <div v-else-if="audioInfo && audioInfo.length > 0" class="py-3">
              <div
                v-for="(item, index) in mediaInfo"
                :key="index"
                class="flex flex-col rounded-lg overflow-hidden shadow-sm bg-white/5 dark:bg-gray-800/30 backdrop-blur-sm border border-gray-100/10 dark:border-gray-700/30"
                :class="index > 0 ? 'mt-2' : ''"
              >
                <!-- 播放器上半部分：专辑图片和标题 -->
                <div class="flex items-start px-4 py-2">
                  <!-- 专辑封面图片 -->
                  <div
                    v-if="item.audio.url"
                    class="relative flex-shrink-0 group hover:opacity-95 transition-opacity duration-300"
                  >
                    <img
                      v-if="item.image.url"
                      :src="item.image.url"
                      @click="togglePlay(index)"
                      class="rounded-lg cursor-pointer transition-all duration-300 shadow-md hover:shadow-lg"
                      :style="{
                        width: isMobile ? '80px' : '120px',
                        height: isMobile ? '80px' : '120px',
                        objectFit: 'cover',
                      }"
                      :class="{
                        'ring-2 ring-primary-400 dark:ring-primary-500': isPlayingIndex === index,
                      }"
                    />
                    <!-- 无封面时显示默认音乐图标 -->
                    <div
                      v-else
                      @click="togglePlay(index)"
                      class="rounded-lg cursor-pointer transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"
                      :style="{
                        width: isMobile ? '80px' : '120px',
                        height: isMobile ? '80px' : '120px',
                      }"
                      :class="{
                        'ring-2 ring-primary-400 dark:ring-primary-500': isPlayingIndex === index,
                      }"
                    >
                      <component
                        :is="isPlayingIndex === index ? Pause : PlayOne"
                        class="text-white"
                        :size="isMobile ? 32 : 48"
                      />
                    </div>
                    <!-- 播放/暂停悬浮层 - 仅在有封面图时显示 -->
                    <div
                      v-if="item.image.url"
                      class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg transition-opacity duration-300"
                      :class="
                        isPlayingIndex === index ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'
                      "
                    >
                      <component
                        :is="isPlayingIndex === index ? Pause : PlayOne"
                        class="text-white text-4xl transition-transform duration-300"
                        @click="togglePlay(index)"
                        :class="
                          isPlayingIndex === index
                            ? 'transform scale-110'
                            : 'transform group-hover:scale-110'
                        "
                      />
                    </div>
                  </div>

                  <div class="flex flex-col ml-4 flex-grow">
                    <h3
                      class="text-gray-800 dark:text-gray-200 text-lg font-medium mb-1 line-clamp-2 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer transition-colors duration-200"
                      @click="showVideoDialog(item.video.url)"
                    >
                      {{ props.content }}
                    </h3>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">AI生成音乐</p>

                    <div class="flex items-center mt-auto pt-2">
                      <button
                        @click="downloadAudio(item.audio.url)"
                        class="text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200 flex items-center"
                      >
                        <DownloadOne class="mr-1" size="18" />
                        <span class="text-sm">下载</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 播放器下半部分：进度条和时间 -->
                <div v-if="item.audio.url" class="px-4 pb-3 pt-1">
                  <div class="flex items-center justify-between">
                    <span class="text-gray-600 dark:text-gray-400 text-sm">{{
                      formatTime(currentTime[index] || 0)
                    }}</span>
                    <span class="text-gray-600 dark:text-gray-400 text-sm">{{
                      formatTime(duration[index] || 0)
                    }}</span>
                  </div>

                  <div class="w-full">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      v-model="progress[index]"
                      @input="updateProgress(index, $event)"
                      @change="seek(index, $event)"
                      class="w-full accent-primary-500 custom-range"
                    />
                  </div>
                </div>

                <audio
                  ref="audioRefs"
                  :src="item.audio.url"
                  @timeupdate="updateTime(index)"
                  hidden
                ></audio>
              </div>
            </div>

            <!-- 歌词显示区域 - 只在状态不为2且有文本时显示 -->
            <div
              v-else-if="content"
              class="py-2 overflow-y-auto overflow-x-hidden scroll-content custom-scrollbar h-[40vh]"
            >
              <template v-for="(line, index) in content.split('\n')" :key="index">
                <div
                  v-if="line.trim()"
                  class="mb-2.5 py-0.5 transition-all duration-200 text-center origin-center relative hover:scale-105 hover:text-primary-600 dark:hover:text-primary-400"
                  :class="[
                    line.startsWith('[') && line.endsWith(']')
                      ? 'text-sm opacity-70 mt-3 mb-1 text-gray-500 dark:text-gray-400 font-medium'
                      : '',
                    line.trim().endsWith('。') || line.trim().endsWith('.') ? 'mb-5' : '',
                  ]"
                >
                  {{ line }}
                </div>
              </template>
            </div>

            <!-- 生成中 -->
          </div>

          <!-- 固定在底部的按钮区域 - 只在状态为3时显示 -->
          <div
            v-if="status === 3 && action === 'LYRICS' && content"
            class="px-3 py-3 border-t border-gray-200 dark:border-gray-700 mt-auto bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-b-xl"
          >
            <div class="flex justify-between items-center">
              <div class="flex space-x-3">
                <!-- 歌曲类型选择 -->
                <DropdownMenu
                  v-model="dropdownStates.musicModel"
                  position="top-left"
                  max-height="20vh"
                >
                  <template #trigger>
                    <button class="btn btn-secondary btn-md">
                      {{ selectedMusicModel.title }}
                    </button>
                  </template>

                  <template #menu="{ close }">
                    <div>
                      <div
                        v-for="(option, index) in musicModel"
                        :key="index"
                        class="menu-item menu-item-md"
                        :class="{ 'menu-item-active': selectedMusicModel.id === option.id }"
                        @click="
                          () => {
                            selectMusicType(option)
                            close()
                          }
                        "
                        role="menuitem"
                        tabindex="0"
                      >
                        <div class="menu-item-content">
                          <div class="menu-item-title">{{ option.title }}</div>
                        </div>
                      </div>
                    </div>
                  </template>
                </DropdownMenu>

                <!-- 风格选择 -->
                <DropdownMenu
                  v-model="dropdownStates.musicStyle"
                  position="top-left"
                  max-height="40vh"
                >
                  <template #trigger>
                    <button class="btn btn-secondary btn-md">
                      风格：{{ selectedMusicStyle.title }}
                    </button>
                  </template>

                  <template #menu="{ close }">
                    <div>
                      <div
                        v-for="(option, index) in musicStyle"
                        :key="index"
                        class="menu-item menu-item-md"
                        :class="{ 'menu-item-active': selectedMusicStyle.id === option.id }"
                        @click="
                          () => {
                            selectMusicStyle(option)
                            close()
                          }
                        "
                        role="menuitem"
                        tabindex="0"
                      >
                        <div class="menu-item-content">
                          <div class="menu-item-title">{{ option.title }}</div>
                        </div>
                      </div>
                    </div>
                  </template>
                </DropdownMenu>
              </div>

              <!-- 创作按钮 -->
              <button @click="handleEditSubmit" class="btn btn-primary btn-md w-24">
                <span>创作</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-300 text-gray-700 opacity-0 group-hover:opacity-100"
    >
      <div class="mt-2 flex group overflow-visible">
        <div class="relative group-btn overflow-visible">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleCopy"
            aria-label="复制"
          >
            <Copy />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
        </div>

        <div class="relative group-btn overflow-visible">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleDelete"
            aria-label="删除"
          >
            <Delete />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 新增的视频弹窗 -->
  <div
    v-if="isVideoDialogVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click="closeVideoDialog"
  >
    <div class="relative p-0 rounded-md shadow-md max-w-full max-h-full" @click.stop>
      <Close
        @click="closeVideoDialog"
        class="absolute top-2 -right-8 text-gray-500 hover:text-gray-600"
        size="26"
      />
      <video :src="currentVideoUrl" controls class="w-full h-full rounded-md"></video>
    </div>
  </div>

  <div
    v-if="isDialogVisible"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50"
  >
    <div
      class="bg-white p-6 w-full flex flex-col dark:bg-gray-900 dark:text-gray-400 relative"
      :class="[isMobile ? 'w-full h-full' : 'max-h-[80vh] max-w-3xl rounded-lg shadow-lg']"
    >
      <Close size="18" class="absolute top-3 right-3 cursor-pointer z-30" @click="closeDialog" />
      <div class="flex-none">
        <h2 class="text-2xl mb-4 font-semibold">歌词编辑</h2>
        <p class="mb-4">您可以点击内容进行编辑修改</p>
      </div>
      <div class="flex-1 overflow-y-auto p-4 rounded-lg border-2 dark:border-gray-700">
        <div>
          <div class="flex items-center mb-4">
            <label class="w-12 text-gray-500 font-semibold">标题</label>
            <input
              type="text"
              v-model="customIdData.title"
              class="flex-1 p-2 text-lg font-semibold dark:bg-gray-900 dark:text-gray-400"
            />
          </div>
          <div class="mb-4">
            <!-- <label class="text-gray-500 font-semibold">歌词</label> -->
            <div class="flex flex-col">
              <div v-for="(line, index) in filteredLines" :key="index" class="py-2">
                <span
                  v-if="line.startsWith('[') && line.endsWith(']')"
                  class="text-gray-500 font-semibold"
                  >{{ line }}</span
                >
                <textarea
                  v-else
                  v-model="filteredLines[index]"
                  class="ml-3 flex-1 py-1 w-full dark:bg-gray-900 dark:text-gray-400"
                  rows="1"
                  style="resize: none"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex mt-4">
        <div class="flex-1 justify-start">
          <DropdownMenu v-model="dropdownStates.musicModelInDialog" position="top-left">
            <template #trigger>
              <button class="btn btn-secondary btn-md">
                {{ selectedMusicModel.title }}
              </button>
            </template>

            <template #menu="{ close }">
              <div>
                <div
                  v-for="(option, index) in musicModel"
                  :key="index"
                  class="menu-item menu-item-md"
                  :class="{ 'menu-item-active': selectedMusicModel.id === option.id }"
                  @click="
                    () => {
                      selectMusicType(option)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  <div class="menu-item-content">
                    <div class="menu-item-title">{{ option.title }}</div>
                  </div>
                </div>
              </div>
            </template>
          </DropdownMenu>

          <DropdownMenu
            v-model="dropdownStates.musicStyleInDialog"
            position="top-left"
            max-height="60vh"
          >
            <template #trigger>
              <button class="btn btn-secondary btn-md">风格：{{ selectedMusicStyle.title }}</button>
            </template>

            <template #menu="{ close }">
              <div>
                <div
                  v-for="(option, index) in musicStyle"
                  :key="index"
                  class="menu-item menu-item-md"
                  :class="{ 'menu-item-active': selectedMusicStyle.id === option.id }"
                  @click="
                    () => {
                      selectMusicStyle(option)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  <div class="menu-item-content">
                    <div class="menu-item-title">{{ option.title }}</div>
                  </div>
                </div>
              </div>
            </template>
          </DropdownMenu>
        </div>
        <div class="flex justify-end">
          <button
            @click="closeDialog"
            class="px-4 py-2 shadow-sm ring-1 ring-inset bg-white ring-gray-300 hover:bg-gray-50 text-gray-900 rounded-md mr-4 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:ring-gray-700 dark:hover:ring-gray-600"
          >
            取消
          </button>
          <button
            @click="handleEditSubmit"
            class="px-4 py-2 shadow-sm bg-primary-600 hover:bg-primary-500 text-white rounded-md"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 加载动画样式 */
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

/* 自定义滚动条样式 - 这些没有直接的Tailwind替代，所以保留 */
.scroll-content::-webkit-scrollbar {
  width: 4px;
}

.scroll-content::-webkit-scrollbar-track {
  background: transparent;
}

.scroll-content::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 2px;
}

.scroll-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(107, 114, 128, 0.7);
}

/* 暗黑模式下的滚动条样式 */
:deep(.dark) .scroll-content::-webkit-scrollbar-thumb {
  background-color: rgba(75, 85, 99, 0.5);
}

:deep(.dark) .scroll-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(107, 114, 128, 0.7);
}

/* 默认隐藏滚动条，悬停时显示 */
.scroll-content {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.scroll-content:hover {
  scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

/* 自定义音频进度条样式 */
.custom-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(209, 213, 219, 0.3);
  border-radius: 10px;
  outline: none;
  transition: all 0.2s;
  margin: 0;
}

.dark .custom-range {
  background: rgba(75, 85, 99, 0.3);
}

.custom-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.custom-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  transition: all 0.3s;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.custom-range::-webkit-slider-thumb:hover {
  background: #60a5fa;
  transform: scale(1.2);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.2);
}

.custom-range::-webkit-slider-thumb:active {
  transform: scale(1.3);
}

.custom-range::-moz-range-thumb:hover {
  background: #60a5fa;
  transform: scale(1.2);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.2);
}

.custom-range::-moz-range-thumb:active {
  transform: scale(1.3);
}

.dark .custom-range::-webkit-slider-thumb {
  background: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.15);
}

.dark .custom-range::-moz-range-thumb {
  background: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.15);
}

.dark .custom-range::-webkit-slider-thumb:hover {
  background: #93c5fd;
  box-shadow: 0 0 0 4px rgba(147, 197, 253, 0.25);
}

.dark .custom-range::-moz-range-thumb:hover {
  background: #93c5fd;
  box-shadow: 0 0 0 4px rgba(147, 197, 253, 0.25);
}
</style>
