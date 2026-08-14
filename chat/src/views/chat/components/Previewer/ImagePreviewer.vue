<script setup lang="ts">
import { uploadFile } from '@/api/upload'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { useAppStore } from '@/store/modules/app'
import { message } from '@/utils/message'
import {
  AddPicture,
  Back,
  Close,
  Delete,
  Download,
  Left,
  Next,
  SendOne,
  WritingFluently,
} from '@icon-park/vue-next'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'

// 添加尺寸选择相关类型
interface SizeOption {
  id: string
  title: string
  values: string
  aspectRatio?: string
}

// 添加模型选择相关类型
interface ModelOption {
  title: string
  value: string
  drawingType?: number // 绘画类型：0=非绘画 1=通用格式 2=gpt-image-1 3=midjourney 4=chat正则提取
}

interface Props {
  close: () => void // 关闭预览的方法
}

const authStore = useAuthStore()
const sideDrawingEditModel = computed(() => authStore.globalConfig?.sideDrawingEditModel)

// 解析模型配置字符串，支持新格式 name:value:drawingType
const parseModelOptions = (modelString: string | undefined): ModelOption[] => {
  if (!modelString || modelString.trim() === '') {
    return []
  }

  try {
    // 去除可能的中文括号和分割
    const cleanString = modelString.replace(/【|】/g, '').trim()
    if (!cleanString) return []

    const modelPairs = cleanString.split(',')
    const options: ModelOption[] = []

    modelPairs.forEach((pair, index) => {
      const parts = pair.split(':')
      if (parts.length >= 2) {
        // 支持三部分格式：name:value:drawingType
        const title = parts[0]?.trim()
        const value = parts[1]?.trim()
        const drawingType = parts[2] ? parseInt(parts[2].trim(), 10) || 0 : 0

        if (title && value) {
          options.push({
            title,
            value,
            drawingType,
          })
        }
      }
    })

    return options
  } catch (error) {
    return []
  }
}

// 模型选项列表
const modelOptions = computed(() => parseModelOptions(sideDrawingEditModel.value))

// 当前选择的模型
const selectedModel = ref<ModelOption | null>(null)

// 控制模型下拉菜单的显示状态
const isModelMenuOpen = ref(false)

// 是否显示模型选择下拉框（只有多个模型时显示）
const shouldShowModelSelector = computed(() => modelOptions.value.length > 1)

// 获取当前使用的模型值
const currentModelValue = computed(() => {
  if (selectedModel.value) {
    return selectedModel.value.value
  }

  // 如果有模型选项，使用第一个
  if (modelOptions.value.length > 0) {
    return modelOptions.value[0].value
  }

  // 默认返回 gpt-image-1
  return 'gpt-image-1'
})

// 切换选择的模型
const switchModel = (option: ModelOption) => {
  selectedModel.value = option
}

// 初始化选中的模型
const initSelectedModel = () => {
  if (modelOptions.value.length > 0 && !selectedModel.value) {
    selectedModel.value = modelOptions.value[0]
  }
}

const props = defineProps<Props>()
const emit = defineEmits(['update:index'])
const ms = message()

// 全局状态
const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()

const { isMobile } = useBasicLayout() // 获取是否为移动设备状态

// 存储所有图片的统一数组（包括主图和参考图）
const allImages = ref<string[]>([])

// 格式化图片URL数组
const imageUrlArray = computed(() => {
  return useGlobalStore.previewImageUrls || []
})

// 主图URL - 始终是数组中的第一个元素
const mainImageUrl = computed(() => (allImages.value.length > 0 ? allImages.value[0] : ''))

// 参考图URL列表 - 数组中剩余的元素
const referenceImages = computed(() => (allImages.value.length > 1 ? allImages.value.slice(1) : []))

// 当前显示的图片索引 (保留此变量用于其他功能)
const currentIndex = ref(0)

// 注入会话方法
const onConversation = inject<any>('onConversation')

// 侧边栏状态
const isSidebarCollapsed = ref(false)

// 蒙版绘制相关状态（已在上面定义）
const maskCanvasRef = ref<HTMLCanvasElement | null>(null)
const maskCtx = ref<CanvasRenderingContext2D | null>(null)

// 路径框选相关状态
const isDrawMode = ref(false)
const maskImageUrl = ref('') // 蒙版图片URL独立存储

// 路径历史记录，用于撤销/重做
const pathHistory = ref<{ x: number; y: number }[][][]>([]) // 路径历史记录
const historyIndex = ref(-1) // 当前历史索引

// 连续拖拽绘制状态
const isDrawing = ref(false) // 是否正在绘制
const currentPath = ref<{ x: number; y: number }[]>([]) // 当前拖拽路径点
const allPaths = ref<{ x: number; y: number }[][]>([]) // 所有已完成的路径

// 参考图和编辑图相关状态
const hasEditReady = ref(false)
const editType = ref<'MASK' | 'REFERENCE' | null>(null)
const editAction = ref<'EDIT_IMAGE' | 'REFERENCE_EDIT' | 'REGENERATE' | null>(null)

// 用户输入的编辑描述
const editDescription = ref('')

// 记录预览前的侧边栏状态
const sidebarStateBeforePreview = ref(false)

// 统一的图片尺寸配置 - 与Footer组件保持一致
const imageSize = [
  {
    id: 'square',
    title: '自动（1:1）',
    values: 'auto',
    aspectRatio: '1 / 1',
  },
  {
    id: 'illustration',
    title: t('chat.illustration'),
    values: '4:3',
    aspectRatio: '4 / 3',
  },
  {
    id: 'wallpaper',
    title: t('chat.wallpaper'),
    values: '16:9',
    aspectRatio: '16 / 9',
  },
  {
    id: 'media',
    title: t('chat.media'),
    values: '3:4',
    aspectRatio: '3 / 4',
  },
  {
    id: 'poster',
    title: t('chat.poster'),
    values: '9:16',
    aspectRatio: '9 / 16',
  },
]

// 当前选择的尺寸
const selectedSize = ref<SizeOption>(imageSize[0])

// 控制尺寸下拉菜单的显示状态
const isSizeMenuOpen = ref(false)

const getAspectRatioStyle = (aspectRatioString: string, fixedSize = 16) => {
  const [height, width] = aspectRatioString.split(' / ').map(Number)
  const aspectRatio = height / width

  // 当宽度大于高度时，固定高度，动态调整宽度
  if (width > height) {
    return {
      width: `${fixedSize * aspectRatio}px`, // 宽度根据比例动态调整
      height: `${fixedSize}px`, // 固定高度
    }
  }
  // 当高度大于或等于宽度时，固定宽度，动态调整高度
  else {
    return {
      width: `${fixedSize}px`, // 固定宽度
      height: `${fixedSize / aspectRatio}px`, // 高度根据比例动态调整
    }
  }
}

// 切换选择的尺寸
const switchSize = (option: SizeOption) => {
  selectedSize.value = option
}

// 初始化图片数组
function initImages() {
  const images = [...imageUrlArray.value]

  // 如果有有效的初始索引，重新排列数组，让点击的图片成为主图
  const initialIndex = useGlobalStore.initialImageIndex
  if (initialIndex > 0 && initialIndex < images.length) {
    // 将用户点击的图片移到数组第一位作为主图
    const [clickedImage] = images.splice(initialIndex, 1)
    images.unshift(clickedImage)
  }

  allImages.value = images
}

// 设置主图 - 将指定索引的参考图设为主图
function setAsMainImage(index: number) {
  // 在绘制模式下不允许切换主图
  if (isDrawMode.value) {
    ms.warning('编辑模式下不能切换主图')
    return
  }

  if (index < 0 || index >= referenceImages.value.length) return

  // 将当前点击的参考图移到数组第一位
  const image = allImages.value[index + 1] // +1 因为参考图从索引1开始
  allImages.value.splice(index + 1, 1) // 从参考图中移除
  allImages.value.unshift(image) // 添加到数组开头作为主图
}

// 删除参考图
function removeImage(index: number) {
  if (index < 0 || index >= referenceImages.value.length) return

  // 删除指定索引的参考图（需要+1因为参考图从索引1开始）
  allImages.value.splice(index + 1, 1)

  // 如果删除后没有图片了，重置编辑状态
  if (allImages.value.length <= 1) {
    hasEditReady.value = false
    editType.value = null
    editAction.value = null
  }
}

// 切换到下一张图片
function nextImage() {
  if (imageUrlArray.value.length > 1) {
    currentIndex.value = (currentIndex.value + 1) % imageUrlArray.value.length
    emit('update:index', currentIndex.value)
    // 退出绘制模式
    if (isDrawMode.value) {
      toggleDrawMode()
    }
    // 清除编辑状态
    clearEditState()
  }
}

// 切换到上一张图片
function prevImage() {
  if (imageUrlArray.value.length > 1) {
    currentIndex.value =
      (currentIndex.value - 1 + imageUrlArray.value.length) % imageUrlArray.value.length
    emit('update:index', currentIndex.value)
    // 退出绘制模式
    if (isDrawMode.value) {
      toggleDrawMode()
    }
    // 清除编辑状态
    clearEditState()
  }
}

// 清除编辑状态
function clearEditState() {
  maskImageUrl.value = ''
  // 保留主图，移除所有参考图（如果有的话）
  if (allImages.value.length > 1) {
    const mainImage = allImages.value[0]
    allImages.value = [mainImage] // 只保留主图
  }
  hasEditReady.value = false
  editType.value = null
  editAction.value = null
  // 清除输入框内容
  editDescription.value = ''

  // 清除蒙版相关状态
  if (maskCtx.value && maskCanvasRef.value) {
    maskCtx.value.clearRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
  }
  // 清空所有路径和绘制历史
  allPaths.value = []
  currentPath.value = []
  isDrawing.value = false
  pathHistory.value = []
  historyIndex.value = -1
}

// 处理键盘事件
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (isDrawMode.value) {
      toggleDrawMode()
    } else {
      props.close()
    }
  } else if (event.key === 'ArrowLeft') {
    prevImage()
  } else if (event.key === 'ArrowRight') {
    nextImage()
  }
}

// 处理关闭
function handleClose() {
  // 关闭时展开侧边栏
  isSidebarCollapsed.value = false

  // 恢复预览前的侧边栏状态
  appStore.setSiderCollapsed(sidebarStateBeforePreview.value)

  props.close()
}

// 下载当前图片
async function handleDownload() {
  if (!mainImageUrl.value) return

  try {
    // 优先使用 fetch 方法（适用于同源和跨域CORS图片）
    try {
      const response = await fetch(mainImageUrl.value, {
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
      a.download = `image-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      ms.success('图片下载成功')
      return
    } catch (fetchError) {
      // 如果fetch失败，尝试canvas方法（适用于跨域图片）
      try {
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
                  a.download = `image-${Date.now()}.png`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  window.URL.revokeObjectURL(url)
                  ms.success('图片下载成功')
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

          img.src = mainImageUrl.value
        })
      } catch (canvasError) {
        throw canvasError
      }
    }
  } catch (error: any) {
    // 所有下载方法都失败，在新页面打开图片
    try {
      const a = document.createElement('a')
      a.href = mainImageUrl.value
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      ms.warning('已在新窗口打开图片，请手动保存')
    } catch (linkError) {
      ms.error(`图片下载失败: ${error?.message || '未知错误'}`)
    }
  }
}

// 切换绘制模式 - 简化版本
function toggleDrawMode() {
  isDrawMode.value = !isDrawMode.value

  if (isDrawMode.value) {
    // 开启绘制模式
    editType.value = 'MASK'
    editAction.value = 'EDIT_IMAGE'
    // 简化初始化，移除动画
    nextTick(() => {
      initCanvas()
    })
  } else {
    // 关闭绘制模式
    if (maskCanvasRef.value && maskCtx.value) {
      maskCtx.value.clearRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
    }
    maskImageUrl.value = ''
  }
}

// 初始化画布 - 简化版本
async function initCanvas() {
  if (!maskCanvasRef.value) {
    setTimeout(() => {
      if (maskCanvasRef.value) {
        initCanvas()
      } else {
        isDrawMode.value = false
      }
    }, 100)
    return
  }

  const imageUrl = imageUrlArray.value[currentIndex.value]
  if (!imageUrl) {
    isDrawMode.value = false
    return
  }

  try {
    // 获取图片尺寸
    const { width: imageWidth, height: imageHeight } = await getImageDimensions(imageUrl)

    // 计算显示尺寸
    const maxWidth = window.innerWidth * 0.6
    const maxHeight = window.innerHeight * 0.7

    let canvasWidth = imageWidth
    let canvasHeight = imageHeight

    if (canvasWidth > maxWidth || canvasHeight > maxHeight) {
      const ratio = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight)
      canvasWidth = canvasWidth * ratio
      canvasHeight = canvasHeight * ratio
    }

    // 设置蒙版画布尺寸
    maskCanvasRef.value.style.width = `${canvasWidth}px`
    maskCanvasRef.value.style.height = `${canvasHeight}px`
    maskCanvasRef.value.width = imageWidth
    maskCanvasRef.value.height = imageHeight

    // 获取蒙版画布上下文
    maskCtx.value = maskCanvasRef.value.getContext('2d')

    if (maskCtx.value) {
      // 清空蒙版画布
      maskCtx.value.clearRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
      // 初始化历史记录和路径
      pathHistory.value = []
      historyIndex.value = -1
      allPaths.value = []
      currentPath.value = []
      savePathToHistory()
    } else {
      isDrawMode.value = false
    }
  } catch (error) {
    isDrawMode.value = false
  }
}

// 获取图片尺寸的函数 - 只获取尺寸，不加载图片内容
async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.addEventListener('load', () => {
      resolve({ width: img.width, height: img.height })
    })

    img.addEventListener('error', () => {
      reject(new Error('无法获取图片尺寸'))
    })

    // 不设置crossOrigin，只获取尺寸信息
    img.src = imageUrl
  })
}

// 保存当前路径状态到历史记录
const savePathToHistory = () => {
  // 如果当前不在历史记录的末尾，删除后面的记录
  if (historyIndex.value < pathHistory.value.length - 1) {
    pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
  }

  // 深拷贝当前路径状态并添加到历史记录
  const currentState = JSON.parse(JSON.stringify(allPaths.value))
  pathHistory.value.push(currentState)
  historyIndex.value = pathHistory.value.length - 1

  // 限制历史记录数量，避免内存过大
  if (pathHistory.value.length > 20) {
    pathHistory.value.shift()
    historyIndex.value--
  }
}

// 撤销操作
const undo = () => {
  if (historyIndex.value > 0) {
    historyIndex.value--
    // 恢复到上一个历史状态
    allPaths.value = JSON.parse(JSON.stringify(pathHistory.value[historyIndex.value]))

    // 取消当前正在绘制的路径
    if (isDrawing.value) {
      currentPath.value = []
      isDrawing.value = false
    }

    // 重新绘制
    drawAllPaths()

    // 更新本地保存状态
    if (checkMaskContent()) {
      localSaveMask()
    } else {
      hasEditReady.value = false
    }
  }
}

// 重做操作
const redo = () => {
  if (historyIndex.value < pathHistory.value.length - 1) {
    historyIndex.value++
    // 恢复到下一个历史状态
    allPaths.value = JSON.parse(JSON.stringify(pathHistory.value[historyIndex.value]))

    // 取消当前正在绘制的路径
    if (isDrawing.value) {
      currentPath.value = []
      isDrawing.value = false
    }

    // 重新绘制
    drawAllPaths()

    // 更新本地保存状态
    if (checkMaskContent()) {
      localSaveMask()
    } else {
      hasEditReady.value = false
    }
  }
}

// 绘制所有路径和选中区域
const drawAllPaths = () => {
  if (!maskCtx.value || !maskCanvasRef.value) return

  // 清空画布
  maskCtx.value.clearRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)

  // 绘制所有已完成的路径
  allPaths.value.forEach(path => {
    if (path.length > 2) {
      drawFilledPath(path)
    }
  })

  // 绘制当前正在绘制的路径
  if (currentPath.value.length > 2) {
    drawFilledPath(currentPath.value)
  }
}

// 绘制填充的路径区域
const drawFilledPath = (path: { x: number; y: number }[]) => {
  if (!maskCtx.value || path.length < 3) return

  // 绘制填充区域
  maskCtx.value.globalCompositeOperation = 'source-over'
  maskCtx.value.beginPath()
  maskCtx.value.moveTo(path[0].x, path[0].y)

  for (let i = 1; i < path.length; i++) {
    maskCtx.value.lineTo(path[i].x, path[i].y)
  }

  maskCtx.value.closePath()

  // 填充浅蓝色低透明度背景
  maskCtx.value.fillStyle = 'rgba(59, 130, 246, 0.2)' // 浅蓝色，20%透明度
  maskCtx.value.fill()

  // 绘制网格
  drawGridInPath(path)
}

// 在路径区域内绘制网格
const drawGridInPath = (path: { x: number; y: number }[]) => {
  if (!maskCtx.value || !maskCanvasRef.value) return

  // 设置裁剪区域为路径
  maskCtx.value.save()
  maskCtx.value.beginPath()
  maskCtx.value.moveTo(path[0].x, path[0].y)

  for (let i = 1; i < path.length; i++) {
    maskCtx.value.lineTo(path[i].x, path[i].y)
  }

  maskCtx.value.closePath()
  maskCtx.value.clip()

  // 绘制网格线
  const gridSpacing = 8
  maskCtx.value.strokeStyle = 'rgba(37, 99, 235, 0.4)' // 深蓝色网格线
  maskCtx.value.lineWidth = 0.5

  // 绘制垂直网格线
  for (let x = 0; x < maskCanvasRef.value.width; x += gridSpacing) {
    maskCtx.value.beginPath()
    maskCtx.value.moveTo(x, 0)
    maskCtx.value.lineTo(x, maskCanvasRef.value.height)
    maskCtx.value.stroke()
  }

  // 绘制水平网格线
  for (let y = 0; y < maskCanvasRef.value.height; y += gridSpacing) {
    maskCtx.value.beginPath()
    maskCtx.value.moveTo(0, y)
    maskCtx.value.lineTo(maskCanvasRef.value.width, y)
    maskCtx.value.stroke()
  }

  maskCtx.value.restore()
}

// 开始拖拽绘制
const startDrawing = (e: MouseEvent) => {
  if (!isDrawMode.value || !maskCanvasRef.value || !maskCtx.value) return

  const rect = maskCanvasRef.value.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (maskCanvasRef.value.width / rect.width)
  const y = (e.clientY - rect.top) * (maskCanvasRef.value.height / rect.height)

  // 开始新的拖拽路径
  isDrawing.value = true
  currentPath.value = [{ x, y }]

  // 保存当前状态到历史记录
  savePathToHistory()
}

// 拖拽绘制过程中（鼠标移动）
const draw = (e: MouseEvent) => {
  if (!isDrawing.value || !maskCanvasRef.value || !maskCtx.value) return

  const rect = maskCanvasRef.value.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (maskCanvasRef.value.width / rect.width)
  const y = (e.clientY - rect.top) * (maskCanvasRef.value.height / rect.height)

  // 优化：只有当距离上一个点足够远时才添加新点，避免过多密集点
  const lastPoint = currentPath.value[currentPath.value.length - 1]
  const distance = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2)

  if (distance > 3) {
    // 距离大于3像素才添加新点
    currentPath.value.push({ x, y })
    // 重新绘制所有路径（包括当前正在绘制的）
    drawAllPaths()
  }
}

// 完成拖拽绘制（鼠标松开）
const stopDrawing = () => {
  if (!isDrawing.value) return

  // 将当前路径添加到已完成路径列表
  if (currentPath.value.length > 2) {
    allPaths.value.push([...currentPath.value])
    // 保存到历史记录
    savePathToHistory()
  }

  currentPath.value = []
  isDrawing.value = false

  // 重新绘制所有路径
  drawAllPaths()

  // 本地保存蒙版状态
  if (checkMaskContent()) {
    localSaveMask()
  }
}

// 取消当前路径绘制
// 移除笔刷大小调节功能，使用固定大小

// 清理蒙版（保留函数，可能在其他地方使用）
const clearMask = () => {
  if (!maskCtx.value || !maskCanvasRef.value) return
  maskCtx.value.clearRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
  maskImageUrl.value = ''
  hasEditReady.value = false
  // 清空所有路径和绘制历史
  allPaths.value = []
  currentPath.value = []
  isDrawing.value = false
  pathHistory.value = []
  historyIndex.value = -1
  // 保存清空后的状态
  savePathToHistory()
}

// 笔刷预览相关函数已移除

// 本地保存蒙版状态（不上传，只标记状态）
function localSaveMask() {
  if (!maskCanvasRef.value) return

  try {
    const hasMaskContent = checkMaskContent()
    if (!hasMaskContent) return

    // 只设置编辑状态，不上传蒙版
    hasEditReady.value = true
    editType.value = 'MASK'
    editAction.value = 'EDIT_IMAGE'
  } catch (error) {}
}

// 生成蒙版数据（提交时调用）
async function generateMaskData(): Promise<string | null> {
  if (!maskCanvasRef.value || !maskCtx.value) return null

  try {
    const hasMaskContent = checkMaskContent()
    if (!hasMaskContent) return null

    // 加载原始图片以获取像素数据
    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise((resolve, reject) => {
      img.addEventListener('load', event => resolve(event))
      img.addEventListener('error', event => reject(event))
      img.src = mainImageUrl.value
    })

    // 创建一个临时canvas来获取原图数据
    const tempImageCanvas = document.createElement('canvas')
    tempImageCanvas.width = maskCanvasRef.value.width
    tempImageCanvas.height = maskCanvasRef.value.height
    const tempImageCtx = tempImageCanvas.getContext('2d')

    if (!tempImageCtx) return null

    // 绘制原图到临时画布
    tempImageCtx.drawImage(img, 0, 0, tempImageCanvas.width, tempImageCanvas.height)

    // 获取原图的像素数据
    const originalImageData = tempImageCtx.getImageData(
      0,
      0,
      tempImageCanvas.width,
      tempImageCanvas.height
    )

    // 创建另一个临时canvas来生成标准蒙版
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = maskCanvasRef.value.width
    tempCanvas.height = maskCanvasRef.value.height
    const tempCtx = tempCanvas.getContext('2d')

    if (!tempCtx) return null

    // 获取蒙版画布数据（蓝色标记区域）
    const maskData = maskCtx.value.getImageData(
      0,
      0,
      maskCanvasRef.value.width,
      maskCanvasRef.value.height
    )
    if (!maskData) return null

    // 创建标准蒙版数据 - 符合 OpenAI gpt-image-1 要求的透明PNG格式
    const standardMaskData = new ImageData(maskCanvasRef.value.width, maskCanvasRef.value.height)

    // 按照 OpenAI 标准创建mask: 完全透明(alpha=0)表示需要编辑的区域，不透明(alpha=255)表示保持不变的区域
    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i + 3]
      const blue = maskData.data[i + 2]
      const red = maskData.data[i]
      const green = maskData.data[i + 1]

      // 检测是否为我们绘制的蓝色区域（路径填充区域）
      if (alpha > 0 && blue > red && blue > green) {
        // 蓝色分量最高，这是选中区域，设为完全透明（需要编辑的区域）
        standardMaskData.data[i] = 0 // R = 0
        standardMaskData.data[i + 1] = 0 // G = 0
        standardMaskData.data[i + 2] = 0 // B = 0
        standardMaskData.data[i + 3] = 0 // A = 0 (完全透明，表示AI需要编辑此区域)
      } else {
        // 非选中区域，保持原图像素数据，设为不透明（保持原图不变的区域）
        standardMaskData.data[i] = originalImageData.data[i] // R = 原图R值
        standardMaskData.data[i + 1] = originalImageData.data[i + 1] // G = 原图G值
        standardMaskData.data[i + 2] = originalImageData.data[i + 2] // B = 原图B值
        standardMaskData.data[i + 3] = 255 // A = 255 (完全不透明，表示保持原图)
      }
    }

    // 将处理后的数据绘制到临时画布
    tempCtx.putImageData(standardMaskData, 0, 0)

    // 导出标准蒙版 - 使用PNG格式，8bit编码
    const maskDataUrl = tempCanvas.toDataURL('image/png')

    const response = await fetch(maskDataUrl)
    const maskBlob = await response.blob()

    const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' })

    const uploadResponse = await uploadFile(maskFile)
    return uploadResponse.data
  } catch (error) {
    return null
  }
}

// 检查蒙版是否有内容
function checkMaskContent() {
  // 检查是否有已完成的路径
  return allPaths.value.length > 0
}

// 处理上传参考图像
function handleUploadReference() {
  // 创建文件输入元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true

  // 处理文件选择
  input.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLInputElement
    if (!target.files || target.files.length === 0) return

    // 将FileList转换为数组
    const files = Array.from(target.files)
    processReferenceFiles(files)
  })

  // 触发文件选择
  input.click()
}

// 处理参考图像文件
function processReferenceFiles(files: File[]) {
  if (!files || files.length === 0) return

  // 检查是否已达到最大图片数量限制（主图+4张参考图=5张）
  if (allImages.value.length >= 5) {
    // 提示用户已达到最大图片数量
    ms.warning('最多只能上传4张参考图像')
    return
  }

  // 过滤出图片文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))

  if (imageFiles.length === 0) {
    ms.warning('请选择图片文件')
    return
  }

  const reader = new FileReader()
  let fileIndex = 0

  const readNextFile = () => {
    if (fileIndex >= imageFiles.length) return

    // 检查是否超过最大图片数量（考虑当前正在添加的图片）
    if (allImages.value.length + fileIndex >= 5) {
      ms.warning(`已达到最大图片数量限制，仅添加了${fileIndex}张图片`)
      return
    }

    const file = imageFiles[fileIndex]

    // 检查图片类型
    const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
    if (!acceptedTypes.includes(file.type)) {
      ms.warning(`不支持的图片类型: ${file.name}，请使用jpg、png、gif、webp或bmp格式`)
      fileIndex++
      readNextFile()
      return
    }

    // 检查图片大小限制（10MB）
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      ms.warning(`图片过大: ${file.name}，最大支持10MB`)
      fileIndex++
      readNextFile()
      return
    }

    reader.onload = e => {
      if (e.target?.result) {
        // 添加到统一图片数组
        allImages.value.push(e.target.result as string)
        fileIndex++
        readNextFile()
      }
    }
    reader.readAsDataURL(file)
  }

  readNextFile()

  // 设置编辑状态（如果没有蒙版的话）
  if (!maskImageUrl.value) {
    editType.value = 'REFERENCE'
    hasEditReady.value = true
    editAction.value = 'REFERENCE_EDIT'
  }
}

// 处理粘贴事件，支持直接粘贴图片
const handlePaste = async (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData || (window as any).clipboardData
  const items = clipboardData.items

  const imageFiles: File[] = []

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file && file.type.startsWith('image/')) {
        imageFiles.push(file)
      }
    }
  }

  if (imageFiles.length > 0) {
    // 复用现有的 processReferenceFiles 函数
    processReferenceFiles(imageFiles)
  }
}

// 提交编辑
async function submitEdit() {
  if (!editDescription.value) return

  try {
    // 构建图片数组，采用JSON格式
    const editImageUrlArray = []

    // 添加主图
    editImageUrlArray.push({
      url: mainImageUrl.value,
      type: 'image',
      index: 0,
    })

    // 添加参考图
    if (referenceImages.value.length > 0) {
      referenceImages.value.forEach((url, idx) => {
        editImageUrlArray.push({
          url,
          type: 'image',
          index: idx + 1,
        })
      })
    }

    // 如果有蒙版绘制，在提交时生成并上传蒙版
    if (editType.value === 'MASK' && checkMaskContent()) {
      ms.info('正在生成蒙版...')
      const maskUrl = await generateMaskData()
      if (maskUrl) {
        editImageUrlArray.push({
          url: maskUrl,
          type: 'mask',
        })
        ms.success('蒙版生成成功')
      } else {
        ms.error('蒙版生成失败')
        return
      }
    }

    // 构建额外参数对象
    const extraParam: Record<string, any> = {}

    // 设置尺寸参数
    if (selectedSize.value && selectedSize.value.values !== 'auto') {
      extraParam.size = selectedSize.value.values
    }

    // 只传递基础参数
    if (onConversation) {
      onConversation({
        msg: editDescription.value,
        imageUrl: JSON.stringify(editImageUrlArray),
        modelType: 2,
        model: currentModelValue.value,
        extraParam: extraParam, // 添加extraParam参数
      })

      // 清除编辑状态
      clearEditState()
    }
  } catch (error) {
    ms.error('提交失败，请重试')
  }
}

// 折叠侧边栏
function collapseSidebar() {
  // 记录当前侧边栏状态
  sidebarStateBeforePreview.value = appStore.siderCollapsed

  // 折叠侧边栏
  if (!appStore.siderCollapsed) {
    appStore.setSiderCollapsed(true)
  }
}

// 添加和移除键盘事件监听
onMounted(() => {
  // 初始化图片数组
  initImages()

  // 折叠侧边栏
  collapseSidebar()

  // 初始化选中的模型
  initSelectedModel()

  window.addEventListener('keydown', handleKeyDown)
  // 添加点击事件监听器，点击外部时关闭菜单
  document.addEventListener('click', closeMenusOnClickOutside)

  if (isDrawMode.value && maskCanvasRef.value) {
    initCanvas()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  // 移除点击事件监听器
  document.removeEventListener('click', closeMenusOnClickOutside)

  // 恢复预览前的侧边栏状态
  appStore.setSiderCollapsed(sidebarStateBeforePreview.value)
})

// 点击外部关闭菜单
function closeMenusOnClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement

  // 关闭尺寸菜单
  if (isSizeMenuOpen.value) {
    const sizeMenuElement = document.querySelector('.size-menu-container')
    if (sizeMenuElement && !sizeMenuElement.contains(target)) {
      isSizeMenuOpen.value = false
    }
  }

  // 关闭模型菜单
  if (isModelMenuOpen.value) {
    const modelMenuElement = document.querySelector('.model-menu-container')
    if (modelMenuElement && !modelMenuElement.contains(target)) {
      isModelMenuOpen.value = false
    }
  }
}

// 监听图片URL数组变化
watch(
  () => useGlobalStore.previewImageUrls,
  newVal => {
    if (newVal && newVal.length > 0) {
      initImages()

      // 如果在绘制模式且图片URL变化，退出绘制模式并清空蒙版
      if (isDrawMode.value) {
        isDrawMode.value = false
        clearMask()
        ms.info('图片已更新，已退出编辑模式')
      }
    }
  },
  { deep: true }
)

// 监听主图变化
watch(
  () => mainImageUrl.value,
  (newVal, oldVal) => {
    if (newVal !== oldVal && isDrawMode.value) {
      isDrawMode.value = false
      clearMask()
      ms.info('主图已更改，已退出编辑模式')
    }
  }
)

// 监听模型配置变化
watch(
  () => sideDrawingEditModel.value,
  () => {
    // 当模型配置变化时，重新初始化选中的模型
    selectedModel.value = null
    initSelectedModel()
  }
)

// 更新鼠标指针样式
// redrawCanvas函数已删除，因为我们不再需要底层Canvas

/* Midjourney相关操作函数 */
/* 提交放大绘制任务 */

/* 提交变换绘制任务 */

/* 提交绘制任务 */

/* 提交扩图绘制任务 */

/* 提交高级变换绘制任务 */

/* 提交平移绘制任务 */

function handleImageClick() {
  if (!isDrawMode.value && mainImageUrl.value) {
    // 使用全局图片预览器
    openImageViewer({
      imageUrl: mainImageUrl.value,
      fileName: 'preview-image',
    })
  }
}
</script>

<template>
  <div class="image-previewer-container h-full w-full">
    <!-- 主容器 -->
    <div
      class="flex flex-col h-full w-full bg-white dark:bg-gray-800 border-l dark:border-gray-600 rounded-tl-2xl rounded-bl-2xl shadow-lg"
    >
      <!-- 顶部工具栏 -->
      <div
        class="flex justify-between items-center p-3 border-b dark:border-gray-700"
        :class="{ 'px-2': isMobile, 'px-4': !isMobile }"
      >
        <div class="flex items-center space-x-2">
          <button
            v-if="isMobile"
            @click="handleClose"
            class="btn btn-ghost btn-sm mr-2"
            aria-label="返回"
          >
            <Left :size="20" />
          </button>

          <!-- 模型选择下拉菜单 -->
          <DropdownMenu
            v-if="shouldShowModelSelector"
            v-model="isModelMenuOpen"
            position="bottom-left"
          >
            <template #trigger>
              <button class="menu-trigger" aria-label="选择模型">
                <span class="truncate whitespace-nowrap overflow-hidden">
                  模型：{{ selectedModel?.title || modelOptions[0]?.title || 'GPT图像' }}
                </span>
              </button>
            </template>
            <template #menu="{ close }">
              <div>
                <div
                  v-for="(option, index) in modelOptions"
                  :key="index"
                  class="menu-item menu-item-md"
                  :class="{
                    'menu-item-active':
                      selectedModel?.value === option.value || (!selectedModel && index === 0),
                  }"
                  @click="
                    () => {
                      switchModel(option)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  <div class="flex-grow text-left">{{ option.title }}</div>
                </div>
              </div>
            </template>
          </DropdownMenu>

          <!-- 尺寸选项下拉菜单 -->
          <DropdownMenu v-model="isSizeMenuOpen" position="bottom-left">
            <template #trigger>
              <button class="menu-trigger" aria-label="选择尺寸">
                <span class="truncate whitespace-nowrap overflow-hidden">
                  {{ t('chat.size') + selectedSize.title }}
                </span>
              </button>
            </template>
            <template #menu="{ close }">
              <div>
                <div
                  v-for="(option, index) in imageSize"
                  :key="index"
                  class="menu-item menu-item-md"
                  :class="{ 'menu-item-active': selectedSize.id === option.id }"
                  @click="
                    () => {
                      switchSize(option)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  <div class="flex justify-center w-5 mr-2 flex-shrink-0">
                    <div
                      :style="getAspectRatioStyle(option.aspectRatio)"
                      class="flex border border-gray-500 dark:border-gray-300 rounded-sm"
                    ></div>
                  </div>
                  <div class="flex-grow text-left">{{ option.title }}</div>
                </div>
              </div>
            </template>
          </DropdownMenu>
        </div>

        <!-- 右侧：按钮组 -->
        <div class="flex items-center space-x-2 mr-1">
          <!-- 编辑模式下的按钮 -->
          <template v-if="isDrawMode">
            <!-- 撤销按钮 -->
            <div class="relative group">
              <button
                class="btn-icon btn-md"
                @click="undo"
                :disabled="historyIndex <= 0"
                :class="{ 'opacity-50 cursor-not-allowed': historyIndex <= 0 }"
                aria-label="撤销"
              >
                <Back size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">撤销</div>
            </div>

            <!-- 重做按钮 -->
            <div class="relative group">
              <button
                class="btn-icon btn-md"
                @click="redo"
                :disabled="historyIndex >= pathHistory.length - 1"
                :class="{ 'opacity-50 cursor-not-allowed': historyIndex >= pathHistory.length - 1 }"
                aria-label="重做"
              >
                <Next size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">重做</div>
            </div>

            <!-- 取消按钮 -->
            <div class="relative group">
              <button class="menu-trigger" @click="toggleDrawMode" aria-label="取消编辑">
                取消
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">取消编辑</div>
            </div>
          </template>

          <!-- 普通模式下的按钮 -->
          <template v-else>
            <div v-if="!isMobile" class="relative group">
              <button class="btn-icon btn-md" @click="toggleDrawMode" aria-label="区域重绘">
                <WritingFluently size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">区域重绘</div>
            </div>

            <div class="relative group">
              <button class="btn-icon btn-md" @click="handleDownload" aria-label="下载图片">
                <Download size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">下载图片</div>
            </div>

            <div class="relative group">
              <button class="btn-icon btn-md" @click="handleClose" aria-label="关闭预览">
                <Close size="20" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭预览</div>
            </div>
          </template>
        </div>
      </div>

      <!-- 主要内容区域：图片预览和侧边参考图 -->
      <div class="flex-grow relative">
        <!-- 主图片区域 -->
        <div class="w-full h-full flex items-center justify-center relative p-4">
          <!-- 统一的图片显示区域 -->
          <div
            v-if="allImages.length > 0"
            class="relative max-w-[80%] max-h-[70vh] transparency-grid rounded-lg"
          >
            <!-- 主图片 -->
            <img
              :src="mainImageUrl"
              class="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-all duration-200"
              :class="{ 'cursor-crosshair': isDrawMode }"
              alt="主图"
              @click="handleImageClick"
            />

            <!-- 蒙版绘制画布 - 仅在编辑模式下显示 -->
            <canvas
              v-if="isDrawMode"
              ref="maskCanvasRef"
              class="absolute top-0 left-0 max-w-full max-h-[70vh] cursor-crosshair"
              @mousedown="startDrawing"
              @mousemove="draw"
              @mouseup="stopDrawing"
              @mouseleave="stopDrawing"
            ></canvas>
          </div>

          <div v-else class="text-gray-500 dark:text-gray-400">没有图片可预览</div>

          <!-- 底部输入框和提交按钮 -->
          <div
            class="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 w-[90%] max-w-2xl"
            :class="{ 'w-[95%]': isMobile }"
          >
            <div
              class="relative flex items-center border border-gray-200 dark:border-gray-600 rounded-full bg-white dark:bg-gray-700 shadow-sm hover:shadow-md transition-all"
            >
              <!-- 上传图片按钮 -->
              <button
                class="flex-shrink-0 ml-1 rounded-full text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 p-2"
                :class="{ 'p-1.5': isMobile }"
                @click="handleUploadReference"
                title="上传参考图"
              >
                <AddPicture :size="isMobile ? 18 : 20" />
              </button>

              <!-- 输入框 -->
              <input
                v-model="editDescription"
                class="flex-grow border-0 bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
                :class="{ 'py-2.5 px-1.5 text-sm': isMobile, 'py-3 px-2': !isMobile }"
                placeholder="请输入编辑要求（必填）"
                required
                @keydown.enter="editDescription.trim() && submitEdit()"
                @paste="handlePaste"
              />

              <!-- 发送按钮 -->
              <button
                @click="submitEdit"
                class="flex-shrink-0 rounded-full text-white mr-1"
                :class="{
                  'bg-primary-600 dark:bg-primary-700': editDescription.trim(),
                  'bg-primary-300 dark:bg-gray-600': !editDescription.trim(),
                  'p-1.5 mr-1': isMobile,
                  'p-2 mr-2': !isMobile,
                }"
                :disabled="!editDescription.trim()"
                title="提交"
              >
                <SendOne :size="isMobile ? 14 : 16" />
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧参考图预览区域 -->
        <div
          v-if="referenceImages.length > 0"
          class="absolute right-4 top-20 w-16 max-h-[70vh] flex flex-col gap-2 z-20"
        >
          <div
            v-for="(url, index) in referenceImages"
            :key="index"
            class="relative w-full aspect-square bg-gray-100/70 dark:bg-gray-800/70 rounded-lg overflow-hidden cursor-pointer group shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
            @click="setAsMainImage(index)"
          >
            <img :src="url" class="w-full h-full object-cover" alt="参考图" />
            <!-- 删除按钮 -->
            <button
              class="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              @click.stop="removeImage(index)"
              title="删除参考图"
            >
              <Delete size="12" />
            </button>
            <!-- 悬浮时的放大预览 -->
            <div
              class="absolute -right-64 top-0 w-60 h-60 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-xl z-20 pointer-events-none"
            >
              <img :src="url" class="w-full h-full object-contain" alt="参考图预览" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-previewer-container {
  position: relative;
  overflow: hidden;
}

/* 图片操作按钮样式 */
.image-action-btn {
  @apply px-3 py-1.5 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-600 shadow-sm font-medium;
}

.image-action-btn-active {
  @apply bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300;
}

/* 提交按钮样式 */
.image-submit-btn {
  @apply px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white font-medium transition-all duration-200 shadow-sm;
}

/* 透明背景网格 - 用于显示透明区域 */
.transparency-grid {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
}

.dark .transparency-grid {
  background-image:
    linear-gradient(45deg, #555 25%, transparent 25%),
    linear-gradient(-45deg, #555 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #555 75%),
    linear-gradient(-45deg, transparent 75%, #555 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
}

/* 确保Canvas容器始终可见 */
.canvas-container {
  min-height: 200px;
  min-width: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.05);
}

.dark .canvas-container {
  background-color: rgba(255, 255, 255, 0.05);
}

/* 画笔自定义样式 */
input[type='range'] {
  -webkit-appearance: none;
  height: 6px;
  background: #e4e4e7;
  border-radius: 3px;
  outline: none;
}

.dark input[type='range'] {
  background: #3f3f46;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

input[type='range']::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

/* 文本按钮样式 */
.btn-text {
  @apply px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-all duration-200;
}

.drawing-tools {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 10px;
  z-index: 101;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px;
  border-radius: 8px;
}

.tool-button {
  background: rgba(60, 60, 60, 0.7);
  border: none;
  border-radius: 4px;
  color: white;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-button:hover {
  background: rgba(80, 80, 80, 0.9);
}

.tool-button.active {
  background: rgba(55, 125, 255, 0.7);
}
</style>
