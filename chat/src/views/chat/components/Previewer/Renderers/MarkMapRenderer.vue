<script setup lang="ts">
import { message } from '@/utils/message'
import * as htmlToImage from 'html-to-image'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 导入 FreeMind 生成器
import { FreeMindGenerator } from '@/utils/freeMindGenerator'

const props = defineProps<{
  content: string
}>()

const ms = message()
const svgContainer = ref<SVGElement | null>(null)
const isRendering = ref(false)
const transformer = new Transformer()

// 存储当前markmap实例
let markmapInstance: Markmap | undefined = undefined

// 渲染思维导图
const renderMarkmap = async () => {
  if (!svgContainer.value || !props.content) return

  isRendering.value = true

  try {
    // 销毁旧的实例
    destroyOldInstance()

    // 彻底清空SVG
    cleanupSvg()

    // 变换 Markdown 为思维导图数据
    const { root } = transformer.transform(props.content)

    // 创建新实例并渲染
    markmapInstance = Markmap.create(svgContainer.value)
    markmapInstance.setData(root)
    markmapInstance.fit()

    // 添加延迟确保 DOM 完全更新
    await new Promise(resolve => setTimeout(resolve, 200))

    // 执行重置视图确保完整内容可见
    await resetMarkmapView()
  } catch (error) {
    displayError(error instanceof Error ? error.message : String(error))
  } finally {
    isRendering.value = false
  }
}

// 销毁旧的markmap实例
const destroyOldInstance = () => {
  if (!markmapInstance) return

  try {
    // @ts-ignore - markmap 可能没有 destroy 方法
    if (typeof markmapInstance.destroy === 'function') {
      markmapInstance.destroy()
    } else {
      // 清除所有引用
      Object.keys(markmapInstance).forEach(key => {
        // @ts-ignore
        markmapInstance[key] = null
      })
    }
    markmapInstance = undefined
  } catch (e) {}
}

// 彻底清空SVG元素
const cleanupSvg = () => {
  if (!svgContainer.value) return

  // 移除所有子元素
  while (svgContainer.value.firstChild) {
    svgContainer.value.removeChild(svgContainer.value.firstChild)
  }

  // 重置class和移除style
  svgContainer.value.setAttribute('class', 'w-full h-full markmap-svg')
  svgContainer.value.removeAttribute('style')

  // 移除其他属性，但保留基本属性
  const attributeNames = []
  for (let i = 0; i < svgContainer.value.attributes.length; i++) {
    const attr = svgContainer.value.attributes[i]
    if (attr.name !== 'class' && attr.name !== 'ref') {
      attributeNames.push(attr.name)
    }
  }

  // 移除收集到的属性
  attributeNames.forEach(name => {
    svgContainer.value?.removeAttribute(name)
  })
}

// 显示错误信息
const displayError = (errorMessage: string) => {
  if (!svgContainer.value || !svgContainer.value.parentElement) return

  const wrapper = document.createElement('div')
  wrapper.className = 'p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg'

  const heading = document.createElement('h3')
  heading.className = 'font-bold mb-2'
  heading.textContent = '思维导图渲染错误'

  const detail = document.createElement('p')
  detail.className = 'mb-2'
  detail.textContent = errorMessage

  wrapper.appendChild(heading)
  wrapper.appendChild(detail)

  svgContainer.value.parentElement.replaceChildren(wrapper)
  isRendering.value = false
}

// 重置markmap视图以确保完整内容可见
const resetMarkmapView = async () => {
  if (!markmapInstance) return

  try {
    // 重置缩放和平移，确保完整内容可见
    markmapInstance.fit()

    // 给一点时间让动画完成
    await new Promise(resolve => setTimeout(resolve, 300))
  } catch (error) {}
}

// 等待渲染完成
const waitForRenderComplete = async (maxWaitTime = 2000) => {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const svgElement = svgContainer.value as SVGSVGElement
    if (!svgElement || svgElement.children.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
      continue
    }

    try {
      const bbox = svgElement.getBBox()
      if (isFinite(bbox.width) && isFinite(bbox.height) && bbox.width > 0 && bbox.height > 0) {
        return true
      }
    } catch (error) {}

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return false
}

// 优化后的PNG导出 - 使用html-to-image
const exportAsPng = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'PNG' } }))

  try {
    ms.info('正在导出 PNG，请稍候...')

    if (!markmapInstance || !svgContainer.value) {
      ms.error('思维导图未正确初始化，请刷新重试')
      return
    }

    // 重置视图确保完整内容可见
    await resetMarkmapView()

    // 等待渲染完成
    await waitForRenderComplete()

    // 使用html-to-image直接导出PNG，通过类型断言处理SVG
    const dataUrl = await htmlToImage.toPng(svgContainer.value as unknown as HTMLElement, {
      quality: 1.0,
      pixelRatio: 2, // 高分辨率
      backgroundColor: '#ffffff',
      style: {
        transform: 'none', // 移除任何变换
      },
      // 添加一些边距
      width: svgContainer.value.clientWidth + 40,
      height: svgContainer.value.clientHeight + 40,
    })

    // 下载文件
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'markmap-mindmap.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    ms.success('PNG 已开始下载')
  } catch (error) {
    ms.error('导出PNG失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// 优化后的SVG导出 - 直接使用XMLSerializer
const exportAsSvg = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'SVG' } }))

  try {
    ms.info('正在导出 SVG，请稍候...')

    if (!markmapInstance || !svgContainer.value) {
      ms.error('思维导图未正确初始化，请刷新重试')
      return
    }

    // 重置视图确保完整内容可见
    await resetMarkmapView()

    // 等待渲染完成
    await waitForRenderComplete()

    const svgElement = svgContainer.value as SVGSVGElement

    // 克隆SVG元素
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement

    // 获取边界框并设置完整的viewBox
    try {
      const bbox = svgElement.getBBox()
      const padding = 20
      const fullWidth = bbox.width + padding * 2
      const fullHeight = bbox.height + padding * 2

      svgClone.setAttribute(
        'viewBox',
        `${bbox.x - padding} ${bbox.y - padding} ${fullWidth} ${fullHeight}`
      )
      svgClone.setAttribute('width', fullWidth.toString())
      svgClone.setAttribute('height', fullHeight.toString())
    } catch (error) {}

    // 添加必要的样式
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      svg { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        background-color: white;
      }
      text { font-weight: 400; }
    `
    svgClone.insertBefore(style, svgClone.firstChild)

    // 序列化SVG
    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(svgClone)

    // 添加XML声明
    svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString

    // 创建并下载文件
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'markmap-mindmap.svg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ms.success('SVG 已开始下载')
  } catch (error) {
    ms.error('导出SVG失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// FreeMind 格式导出功能
const exportAsFreeMind = async () => {
  document.dispatchEvent(new CustomEvent('markmap-export-start', { detail: { type: 'FreeMind' } }))

  try {
    ms.info('正在保存为 .mm 格式...')

    if (!props.content) {
      ms.error('思维导图内容为空')
      return
    }

    // 使用 FreeMindGenerator 从 Markdown 生成思维导图
    const rootNode = FreeMindGenerator.generateFromMarkdown(props.content)

    // 使用 FreeMindGenerator 导出
    const freeMindGenerator = new FreeMindGenerator()
    await freeMindGenerator.exportToFreeMind(rootNode, rootNode.title)

    ms.success('.mm 文件已开始下载')
  } catch (error) {
    console.error('导出 .mm 格式失败:', error)
    ms.error('导出失败，请重试')
  } finally {
    document.dispatchEvent(new CustomEvent('markmap-export-end'))
  }
}

// 来自父组件的导出事件处理函数
const handleExportPngFromParent = () => {
  exportAsPng()
}

const handleExportSvgFromParent = () => {
  exportAsSvg()
}

const handleExportFreeMindFromParent = () => {
  exportAsFreeMind()
}

// 组件挂载后初始化
onMounted(() => {
  renderMarkmap()

  // 监听来自父组件的导出事件
  document.addEventListener('markmap-export-png', handleExportPngFromParent)
  document.addEventListener('markmap-export-svg', handleExportSvgFromParent)
  document.addEventListener('markmap-export-freemind', handleExportFreeMindFromParent)
})

// 组件销毁前清理
onBeforeUnmount(() => {
  destroyOldInstance()

  // 清理来自父组件的导出事件监听
  document.removeEventListener('markmap-export-png', handleExportPngFromParent)
  document.removeEventListener('markmap-export-svg', handleExportSvgFromParent)
  document.removeEventListener('markmap-export-freemind', handleExportFreeMindFromParent)
})

// 监听内容变化
watch(
  () => props.content,
  () => {
    renderMarkmap()
  }
)
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="relative w-full h-full overflow-auto custom-scrollbar">
      <!-- 加载动画 -->
      <div
        v-if="isRendering"
        class="absolute top-10 left-1/2 transform -translate-x-1/2 z-30 flex items-center justify-center"
      >
        <div class="loading-animation">
          <span></span>
        </div>
      </div>

      <!-- Markmap SVG容器 -->
      <svg ref="svgContainer" class="w-full h-full markmap-svg"></svg>
    </div>
  </div>
</template>

<style scoped>
/* 加载动画 - 暂时保留自定义动画，后续可替换为Tailwind组件 */
.loading-animation {
  @apply inline-block relative w-16 h-16;
}
.loading-animation span {
  @apply absolute border-4 border-purple-500 opacity-100 rounded-full;
  animation: loading 1.5s cubic-bezier(0, 0.2, 0.8, 1) infinite;
}
@keyframes loading {
  0% {
    top: 28px;
    left: 28px;
    width: 0;
    height: 0;
    opacity: 1;
  }
  100% {
    top: -1px;
    left: -1px;
    width: 58px;
    height: 58px;
    opacity: 0;
  }
}
</style>
