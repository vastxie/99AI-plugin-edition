<script setup lang="ts">
import { fetchUpdateInfoAPI } from '@/api'
import type { ResData } from '@/api/types'
import { uploadFile } from '@/api/upload'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { dialog } from '@/utils/dialog'
import { message as showMessage } from '@/utils/message'
import { BookOpen, Delete, Loading, Upload } from '@icon-park/vue-next'
import { computed, onMounted, ref, watch } from 'vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const chatStore = useChatStore()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const { isMobile } = useBasicLayout()
const userInfo = computed(() => authStore.userInfo)
const customInstruction = ref('')
const instructionLength = computed(() => customInstruction.value.length)
const maxLength = 500
const knowledgeFiles = ref<Array<{ fileName: string; fileUrl: string }>>([])
const uploadingFile = ref(false)
const MAX_FILES = 5
const ms = showMessage()

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 登录检测函数
function checkLoginStatus() {
  if (!isLogin.value) {
    // 显示消息提醒
    ms.warning('请登录后使用数据管理')
    // 关闭设置弹窗
    useGlobalStoreWithOut().updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

// 监听visible变化，当打开时加载用户信息
watch(
  () => props.visible,
  async newVal => {
    if (newVal) {
      // 首先检查登录状态
      if (!checkLoginStatus()) {
        return
      }

      // 先获取最新的用户信息
      await authStore.getUserInfo()
      // 然后更新自定义指令和知识库的值
      if (userInfo.value?.customInstruction) {
        customInstruction.value = userInfo.value.customInstruction
      } else {
        customInstruction.value = ''
      }
      if (userInfo.value?.knowledgeFiles && Array.isArray(userInfo.value.knowledgeFiles)) {
        knowledgeFiles.value = userInfo.value.knowledgeFiles
      } else {
        knowledgeFiles.value = []
      }
    }
  }
)

// 组件挂载时初始化
onMounted(async () => {
  // 如果组件已经可见，首先检查登录状态
  if (props.visible) {
    if (!checkLoginStatus()) {
      return
    }
    await authStore.getUserInfo()
  }
  if (userInfo.value?.customInstruction) {
    customInstruction.value = userInfo.value.customInstruction
  } else {
    customInstruction.value = ''
  }
  if (userInfo.value?.knowledgeFiles && Array.isArray(userInfo.value.knowledgeFiles)) {
    knowledgeFiles.value = userInfo.value.knowledgeFiles
  } else {
    knowledgeFiles.value = []
  }
})

/* 删除全部非置顶聊天 */
async function handleClearConversations() {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: t('chat.clearConversation'),
    content: t('chat.clearAllNonFavoriteConversations'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      loading.value = true
      try {
        await chatStore.delAllGroup()
        showMessage().success('已清空所有非收藏对话')
        loading.value = false
      } catch (error) {
        showMessage().error('清空失败，请重试')
        loading.value = false
      }
    },
  })
}

/* 保存自定义指令 */
async function handleSaveInstruction() {
  if (customInstruction.value.length > maxLength) {
    showMessage().warning(`自定义指令不能超过${maxLength}字符`)
    return
  }

  saving.value = true
  try {
    const res = (await fetchUpdateInfoAPI({
      customInstruction: customInstruction.value.trim(),
    })) as ResData

    if (res.success) {
      // 更新本地存储的用户信息
      await authStore.getUserInfo()
      showMessage().success('自定义指令已保存')
    } else {
      showMessage().error(res.message || '保存失败')
    }
  } catch (error) {
    showMessage().error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

/* 清空自定义指令 */
function handleClearInstruction() {
  customInstruction.value = ''
}

/* 上传知识库文件 */
async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files

  if (!files || files.length === 0) {
    return
  }

  if (knowledgeFiles.value.length >= MAX_FILES) {
    showMessage().warning(`最多只能上传${MAX_FILES}个知识库文件`)
    target.value = ''
    return
  }

  const file = files[0]
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]
  const fileExtension = file.name.split('.').pop()?.toLowerCase()

  // 检查文件类型
  if (
    !validTypes.includes(file.type) &&
    !['pdf', 'doc', 'docx', 'txt'].includes(fileExtension || '')
  ) {
    showMessage().error('仅支持上传 PDF、Word、TXT 格式的文件')
    target.value = ''
    return
  }

  uploadingFile.value = true
  try {
    // 使用项目的 uploadFile API，指定知识库目录
    const response = await uploadFile(file, 'knowledge')

    if (response.data) {
      const fileUrl = response.data
      // 保存原始文件名和URL
      knowledgeFiles.value.push({
        fileName: file.name,
        fileUrl: fileUrl,
      })

      // 保存到后端
      const res = (await fetchUpdateInfoAPI({
        knowledgeFiles: knowledgeFiles.value,
      })) as ResData

      if (res.success) {
        // 同步更新 authStore 中的用户信息
        await authStore.getUserInfo()
        showMessage().success('文件上传成功')
      } else {
        showMessage().error(res.message || '保存失败')
        // 如果保存失败，回滚本地修改
        knowledgeFiles.value.pop()
      }
    } else {
      showMessage().error('上传失败')
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || '上传失败，请重试'
    showMessage().error(errorMessage)
  } finally {
    uploadingFile.value = false
    target.value = ''
  }
}

/* 删除知识库文件 */
async function handleRemoveFile(index: number) {
  // 保存要删除的文件URL，以便失败时恢复
  const removedFile = knowledgeFiles.value[index]

  // 先从本地列表中删除
  knowledgeFiles.value.splice(index, 1)

  try {
    // 保存到后端
    const res = (await fetchUpdateInfoAPI({
      knowledgeFiles: knowledgeFiles.value,
    })) as ResData

    if (res.success) {
      // 同步更新 authStore 中的用户信息
      await authStore.getUserInfo()
      showMessage().success('文件已删除')
    } else {
      showMessage().error(res.message || '删除失败')
      // 如果保存失败，恢复文件
      knowledgeFiles.value.splice(index, 0, removedFile)
    }
  } catch (error) {
    showMessage().error('删除失败，请重试')
    // 如果保存失败，恢复文件
    knowledgeFiles.value.splice(index, 0, removedFile)
  }
}
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 清空对话卡片 -->
    <div
      class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
    >
      <!-- 卡片标题 -->
      <div
        class="text-base font-semibold text-gray-900 dark:text-gray-100 pb-2 mb-4 border-b border-gray-200 dark:border-gray-700"
      >
        对话管理
      </div>

      <!-- 清空对话内容 -->
      <div class="space-y-3">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          清空所有非收藏的对话记录，收藏的对话将被保留。
        </div>
        <button @click="handleClearConversations" :disabled="loading" class="btn btn-danger btn-md">
          <Delete v-if="!loading" theme="outline" size="16" class="mr-2" />
          <svg
            v-else
            class="animate-spin h-4 w-4 mr-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>{{ loading ? '清空中...' : '清空非收藏对话' }}</span>
        </button>
      </div>
    </div>

    <!-- 自定义指令卡片 -->
    <div
      class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
    >
      <!-- 卡片标题 -->
      <div
        class="text-base font-semibold text-gray-900 dark:text-gray-100 pb-2 mb-4 border-b border-gray-200 dark:border-gray-700"
      >
        个性化设置
      </div>

      <!-- 知识库管理 -->
      <div class="mb-6">
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            用户知识库
          </label>
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            上传您自己的知识库文件（PDF、Word、TXT），AI将基于这些文件回答问题。最多5个文件。
          </div>
        </div>

        <!-- 已上传文件列表 -->
        <div v-if="knowledgeFiles.length > 0" class="space-y-2 mb-3">
          <div
            v-for="(file, index) in knowledgeFiles"
            :key="index"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
          >
            <div class="flex items-center flex-1 min-w-0">
              <BookOpen theme="outline" size="20" class="text-gray-400 mr-2 flex-shrink-0" />
              <a
                :href="file.fileUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-gray-700 dark:text-gray-300 truncate hover:underline cursor-pointer"
                :title="file.fileName"
              >
                {{ file.fileName }}
              </a>
            </div>
            <button
              @click="handleRemoveFile(index)"
              class="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              title="删除文件"
            >
              <Delete theme="outline" size="20" />
            </button>
          </div>
        </div>

        <!-- 上传按钮 -->
        <div>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            @change="handleFileUpload"
            :disabled="uploadingFile || knowledgeFiles.length >= MAX_FILES"
            class="hidden"
            id="knowledge-file-input"
          />
          <label
            for="knowledge-file-input"
            class="btn btn-secondary btn-md"
            :class="{
              'opacity-50 cursor-not-allowed': uploadingFile || knowledgeFiles.length >= MAX_FILES,
            }"
          >
            <Loading v-if="uploadingFile" theme="outline" size="16" class="mr-2 animate-spin" />
            <Upload v-else theme="outline" size="16" class="mr-2" />
            {{ uploadingFile ? '上传中...' : `上传文件 (${knowledgeFiles.length}/${MAX_FILES})` }}
          </label>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-gray-200 dark:border-gray-600 my-4"></div>

      <!-- 自定义指令内容 -->
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            自定义指令
          </label>
          <div class="relative">
            <textarea
              v-model="customInstruction"
              :maxlength="maxLength"
              placeholder="请输入您的职业、兴趣爱好、期望的AI回复风格等信息。例如：我是一名软件工程师，希望AI的回复更加专业和技术性..."
              class="input input-md w-full resize-none"
              rows="4"
            ></textarea>
            <div class="absolute bottom-2 right-2 text-xs text-gray-500 dark:text-gray-400">
              {{ instructionLength }}/{{ maxLength }}
            </div>
          </div>
          <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            AI 将基于您的自定义指令来调整回复风格和内容。请避免输入敏感信息或不当内容。
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-2">
          <button @click="handleSaveInstruction" :disabled="saving" class="btn btn-primary btn-md">
            <svg
              v-if="saving"
              class="animate-spin h-4 w-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {{ saving ? '保存中...' : '保存指令' }}
          </button>
          <button @click="handleClearInstruction" class="btn btn-secondary btn-md">清空</button>
        </div>
      </div>
    </div>
  </div>
</template>
