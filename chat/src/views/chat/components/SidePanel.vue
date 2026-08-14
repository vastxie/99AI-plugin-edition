<script setup lang="ts">
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { computed, defineAsyncComponent } from 'vue'

// 异步加载预览组件
const ImagePreviewer = defineAsyncComponent(() => import('./Previewer/ImagePreviewer.vue'))
const VideoPreviewer = defineAsyncComponent(() => import('./Previewer/VideoPreviewer.vue'))
const HtmlPreviewer = defineAsyncComponent(() => import('./Previewer/HtmlPreviewer.vue'))
const MarkdownPreviewer = defineAsyncComponent(() => import('./Previewer/MarkdownPreviewer.vue'))
const PptPreviewer = defineAsyncComponent(() => import('./Previewer/PptGridPreviewer.vue'))
const MessageEditor = defineAsyncComponent(() => import('./Previewer/MessageEditor.vue'))

// 获取全局状态
const useGlobalStore = useGlobalStoreWithOut()

// 计算当前应该显示哪个预览器
const activePanel = computed(() => {
  const htmlVisible = useGlobalStore.showHtmlPreviewer
  const imageVisible = useGlobalStore.showImagePreviewer
  const videoVisible = useGlobalStore.showVideoPreviewer
  const markdownVisible = useGlobalStore.isMarkdownPreviewerVisible
  const pptVisible = useGlobalStore.showPptPreviewer
  const messageEditorVisible = useGlobalStore.showMessageEditor

  if (htmlVisible) return 'html'
  if (imageVisible) return 'image'
  if (videoVisible) return 'video'
  if (markdownVisible) return 'markdown'
  if (pptVisible) return 'ppt'
  if (messageEditorVisible) return 'messageEditor'

  return null
})

// 提供的关闭方法
const closeHtmlPreviewer = () => {
  useGlobalStore.updateHtmlPreviewer(false)
}

const closeImagePreviewer = () => {
  useGlobalStore.updateImagePreviewer(false)
}

const closeVideoPreviewer = () => {
  useGlobalStore.updateVideoPreviewer(false)
}

const closeMarkdownPreviewer = () => {
  useGlobalStore.updateMarkdownPreviewer(false)
}

const closePptPreviewer = () => {
  useGlobalStore.updatePptPreviewer(false)
}

const closeMessageEditor = () => {
  useGlobalStore.updateMessageEditor(false)
}

// 统一关闭侧边栏的方法
const closeSidePanel = () => {
  if (useGlobalStore.showHtmlPreviewer) closeHtmlPreviewer()
  if (useGlobalStore.showImagePreviewer) closeImagePreviewer()
  if (useGlobalStore.showVideoPreviewer) closeVideoPreviewer()
  if (useGlobalStore.isMarkdownPreviewerVisible) closeMarkdownPreviewer()
  if (useGlobalStore.showPptPreviewer) closePptPreviewer()
  if (useGlobalStore.showMessageEditor) closeMessageEditor()
}

// 暴露给父组件的方法
defineExpose({
  closeSidePanel,
})
</script>

<template>
  <div class="h-full w-full">
    <transition name="fade" mode="out-in">
      <HtmlPreviewer
        v-if="activePanel === 'html'"
        :close="closeHtmlPreviewer"
        class="h-full w-full"
      />
      <ImagePreviewer
        v-else-if="activePanel === 'image'"
        :close="closeImagePreviewer"
        class="h-full w-full"
      />
      <VideoPreviewer
        v-else-if="activePanel === 'video'"
        :close="closeVideoPreviewer"
        :videoUrl="useGlobalStore.videoPreviewerUrl"
        :title="useGlobalStore.videoPreviewerTitle"
        class="h-full w-full"
      />
      <MarkdownPreviewer
        v-else-if="activePanel === 'markdown'"
        :close="closeMarkdownPreviewer"
        class="h-full w-full"
      />
      <PptPreviewer
        v-else-if="activePanel === 'ppt'"
        :close="closePptPreviewer"
        class="h-full w-full"
      />
      <MessageEditor
        v-else-if="activePanel === 'messageEditor'"
        :close="closeMessageEditor"
        class="h-full w-full"
      />
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
