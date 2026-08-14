<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  content: string
  previewSize?: 'desktop' | 'tablet' | 'mobile'
}>()

const iframe = ref<HTMLIFrameElement | null>(null)

const renderHtml = () => {
  if (iframe.value) {
    iframe.value.srcdoc = props.content
  } else {
  }
}

const exportAsHtml = async () => {
  try {
    // 获取HTML内容
    const content = props.content
    if (!content) {
      document.dispatchEvent(
        new CustomEvent('show-message', {
          detail: { type: 'error', message: '无法获取网页内容' },
        })
      )
      return
    }

    // 通知父组件开始导出
    document.dispatchEvent(
      new CustomEvent('html-export-start', {
        detail: { type: 'HTML' },
      })
    )

    // 创建Blob
    const htmlBlob = new Blob([content], { type: 'text/html;charset=utf-8' })

    // 创建下载链接
    const downloadLink = document.createElement('a')
    downloadLink.href = URL.createObjectURL(htmlBlob)

    // 生成文件名
    const titleMatch = content.match(/<title>(.*?)<\/title>/i)
    const filename = titleMatch && titleMatch[1] ? `${titleMatch[1].trim()}.html` : 'index.html'

    downloadLink.download = filename

    // 触发下载
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)

    document.dispatchEvent(
      new CustomEvent('show-message', {
        detail: { type: 'success', message: 'HTML 文件已开始下载' },
      })
    )
  } catch (error) {
    document.dispatchEvent(
      new CustomEvent('show-message', {
        detail: { type: 'error', message: '导出 HTML 失败' },
      })
    )
  } finally {
    // 通知父组件导出结束
    document.dispatchEvent(
      new CustomEvent('html-export-end', {
        detail: { type: 'HTML' },
      })
    )
  }
}

onMounted(() => {
  if (iframe.value) {
    renderHtml()
  } else {
    // 如果iframe还没准备好，稍后尝试
    setTimeout(renderHtml, 50)
  }

  // 监听来自父组件的导出事件
  document.addEventListener('html-export-html', exportAsHtml)
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  // 移除事件监听
  document.removeEventListener('html-export-html', exportAsHtml)
})

// 响应内容变化
watch(
  () => props.content,
  newContent => {
    renderHtml()
  }
)

// 计算iframe样式
const iframeStyle = computed(() => {
  switch (props.previewSize) {
    case 'tablet':
      return {
        width: '600px',
        height: '80%',
        margin: 'auto',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transition: 'width 0.3s ease-in-out',
      }
    case 'mobile':
      return {
        width: '320px',
        height: '80%',
        margin: 'auto',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transition: 'width 0.3s ease-in-out',
      }
    default: // desktop
      return {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '0',
        boxShadow: 'none',
        transition: 'width 0.3s ease-in-out',
      }
  }
})
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <iframe
      ref="iframe"
      :style="iframeStyle"
      class="border dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg rounded-lg"
      frameborder="0"
      sandbox="allow-scripts"
    ></iframe>
  </div>
</template>

<style scoped>
/* 样式已通过Tailwind类处理 */
</style>
