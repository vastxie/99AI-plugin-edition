<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50"
      @click.self="handleMaskClick"
      @wheel.prevent="handleWheel"
    >
      <!-- 工具栏 -->
      <div
        class="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 flex items-center space-x-2 bg-white/90 dark:bg-black/60 rounded-2xl px-4 py-2 backdrop-blur-sm shadow-xl"
      >
        <!-- 缩小 - 移动端隐藏 -->
        <div v-if="!isMobile" class="group relative">
          <button class="btn-icon" @click="zoomOut" :disabled="scale <= minScale">
            <ZoomOut size="20" />
          </button>
          <div class="tooltip tooltip-top">缩小 (Ctrl + -)</div>
        </div>

        <!-- 放大 - 移动端隐藏 -->
        <div v-if="!isMobile" class="group relative">
          <button class="btn-icon" @click="zoomIn" :disabled="scale >= maxScale">
            <ZoomIn size="20" />
          </button>
          <div class="tooltip tooltip-top">放大 (Ctrl + +)</div>
        </div>

        <!-- 分割线 - 移动端隐藏 -->
        <div v-if="!isMobile" class="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

        <!-- 逆时针旋转 -->
        <div class="group relative">
          <button class="btn-icon" @click="rotateLeft">
            <Rotate size="20" />
          </button>
          <div class="tooltip tooltip-top">向左旋转 (Ctrl + ←)</div>
        </div>

        <!-- 顺时针旋转 -->
        <div class="group relative">
          <button class="btn-icon" @click="rotateRight">
            <Rotate size="20" style="transform: scaleX(-1)" />
          </button>
          <div class="tooltip tooltip-top">向右旋转 (Ctrl + →)</div>
        </div>

        <!-- 分割线 -->
        <div class="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

        <!-- 重置 -->
        <div class="group relative">
          <button class="btn-icon" @click="reset">
            <Refresh size="20" />
          </button>
          <div class="tooltip tooltip-top">重置 (Ctrl + 0)</div>
        </div>

        <!-- 保存 -->
        <div class="group relative">
          <button class="btn-icon" @click="save">
            <Download size="20" />
          </button>
          <div class="tooltip tooltip-top">保存 (Ctrl + S)</div>
        </div>

        <!-- 分割线 -->
        <div class="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

        <!-- 关闭 -->
        <div class="group relative">
          <button class="btn-icon" @click="close">
            <Close size="20" />
          </button>
          <div class="tooltip tooltip-top">关闭 (ESC)</div>
        </div>
      </div>

      <!-- 图片容器 -->
      <div
        ref="imageContainer"
        class="relative flex items-center justify-center overflow-hidden pointer-events-none"
      >
        <!-- 图片 -->
        <img
          ref="imageRef"
          :src="imageUrl"
          class="max-w-none max-h-none select-none rounded-2xl cursor-grab pointer-events-auto"
          :class="{ 'cursor-grabbing': isDragging }"
          :style="imageStyle"
          alt="预览图片"
          @load="handleImageLoad"
          @error="handleImageError"
          @dragstart.prevent
          @mousedown="startDrag"
          @mousemove="drag"
          @mouseup="stopDrag"
          @mouseleave="stopDrag"
        />

        <!-- 加载状态 -->
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
          <div class="text-white text-lg">{{ t('common.loading') }}</div>
        </div>

        <!-- 错误状态 -->
        <div v-if="error" class="absolute inset-0 flex items-center justify-center">
          <div class="text-white text-lg">图片加载失败</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { Close, Download, Refresh, Rotate, ZoomIn, ZoomOut } from '@icon-park/vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  visible: boolean
  imageUrl: string
  fileName?: string
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  fileName: 'image',
})

const emit = defineEmits<Emits>()

// 移动端检测
const { isMobile } = useBasicLayout()

// 图片状态
const imageRef = ref<HTMLImageElement>()
const imageContainer = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref(false)

// 变换状态
const scale = ref(1)
const rotation = ref(0)
const translateX = ref(0)
const translateY = ref(0)

// 缩放限制
const minScale = 0.1
const maxScale = 5

// 拖拽状态
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })

// 图片原始尺寸
const originalSize = ref({ width: 0, height: 0 })

// 计算图片样式
const imageStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  transformOrigin: 'center center',
}))

// 处理图片加载
function handleImageLoad() {
  loading.value = false
  error.value = false

  if (imageRef.value) {
    originalSize.value = {
      width: imageRef.value.naturalWidth,
      height: imageRef.value.naturalHeight,
    }

    // 自动适配屏幕尺寸
    autoFit()
  }
}

// 处理图片加载错误
function handleImageError() {
  loading.value = false
  error.value = true
}

// 自动适配屏幕尺寸
function autoFit() {
  if (!imageRef.value || !imageContainer.value) return

  // 获取视口尺寸（减去工具栏和边距）
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 80 // 留出边距
  const availableWidth = viewportWidth - margin
  const availableHeight = viewportHeight - margin

  const imageWidth = originalSize.value.width
  const imageHeight = originalSize.value.height

  // 计算适合的缩放比例，确保图片完全在可视区域内
  const scaleX = availableWidth / imageWidth
  const scaleY = availableHeight / imageHeight
  const fitScale = Math.min(scaleX, scaleY)

  scale.value = fitScale
}

// 放大
function zoomIn() {
  const newScale = Math.min(scale.value * 1.2, maxScale)
  scale.value = newScale
}

// 缩小
function zoomOut() {
  const newScale = Math.max(scale.value / 1.2, minScale)
  scale.value = newScale
}

// 顺时针旋转
function rotateRight() {
  rotation.value += 90
}

// 逆时针旋转
function rotateLeft() {
  rotation.value -= 90
}

// 重置
function reset() {
  scale.value = 1
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  autoFit()
}

// 保存图片
async function save() {
  if (!props.imageUrl) return

  try {
    // 优先使用 fetch 方法（适用于同源和跨域CORS图片）
    try {
      const response = await fetch(props.imageUrl, {
        mode: 'cors',
        credentials: 'omit',
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `${props.fileName}.${getFileExtension(props.imageUrl)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      window.URL.revokeObjectURL(url)
      // fetch下载成功
      return
    } catch (fetchError) {
      // 如果fetch失败，尝试canvas方法（适用于跨域图片）
      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise((resolve, reject) => {
        img.addEventListener('load', () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight

            ctx?.drawImage(img, 0, 0)

            canvas.toBlob(blob => {
              if (blob) {
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${props.fileName}.${getFileExtension(props.imageUrl)}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)
                // canvas下载成功
                resolve(true)
              } else {
                reject(new Error('无法生成图片blob'))
              }
            }, 'image/png')
          } catch (canvasError) {
            reject(canvasError)
          }
        })

        img.addEventListener('error', () => {
          reject(new Error('图片加载失败'))
        })

        img.src = props.imageUrl
      })
    }
  } catch {
    // 所有下载方法都失败，在新页面打开图片
    try {
      const a = document.createElement('a')
      a.href = props.imageUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // 已在新窗口打开图片，请手动保存
    } catch (linkError) {
      // 所有方法都失败了
    }
  }
}

// 获取文件扩展名
function getFileExtension(url: string): string {
  const match = url.match(/\.([^.]+)$/)
  return match ? match[1] : 'png'
}

// 处理鼠标滚轮缩放
function handleWheel(event: WheelEvent) {
  event.preventDefault()

  const delta = event.deltaY > 0 ? -1 : 1
  const zoomFactor = 1.1
  const newScale =
    delta > 0
      ? Math.min(scale.value * zoomFactor, maxScale)
      : Math.max(scale.value / zoomFactor, minScale)

  scale.value = newScale
}

// 开始拖拽
function startDrag(event: MouseEvent) {
  if (event.button !== 0) return // 只响应左键

  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragOffset.value = { x: translateX.value, y: translateY.value }
}

// 拖拽中
function drag(event: MouseEvent) {
  if (!isDragging.value) return

  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y

  translateX.value = dragOffset.value.x + deltaX
  translateY.value = dragOffset.value.y + deltaY
}

// 停止拖拽
function stopDrag() {
  isDragging.value = false
}

// 关闭预览
function close() {
  emit('update:visible', false)
  emit('close')
}

// 处理遮罩点击
function handleMaskClick() {
  close()
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  const { key, ctrlKey, metaKey } = event
  const isCtrl = ctrlKey || metaKey

  switch (key) {
    case 'Escape':
      close()
      break
    case '=':
    case '+':
      if (isCtrl) {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (isCtrl) {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (isCtrl) {
        event.preventDefault()
        reset()
      }
      break
    case 'ArrowLeft':
      if (isCtrl) {
        event.preventDefault()
        rotateLeft()
      }
      break
    case 'ArrowRight':
      if (isCtrl) {
        event.preventDefault()
        rotateRight()
      }
      break
    case 's':
      if (isCtrl) {
        event.preventDefault()
        save()
      }
      break
  }
}

// 监听visible变化，重置状态
watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      loading.value = true
      error.value = false
      reset()
    }
  }
)

// 监听imageUrl变化
watch(
  () => props.imageUrl,
  () => {
    if (props.visible) {
      loading.value = true
      error.value = false
      reset()
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>
