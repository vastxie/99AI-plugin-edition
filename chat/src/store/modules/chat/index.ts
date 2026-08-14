import {
  fetchCreateGroupAPI,
  fetchDelAllGroupAPI,
  fetchDelGroupAPI,
  fetchQueryGroupAPI,
  fetchUpdateGroupAPI,
} from '@/api/group'
import { defineStore } from 'pinia'
import { getLocalState, setLocalState } from './helper'
import { parseAgentContent } from '@/utils/agentParser'

import {
  fetchDelChatLogAPI,
  fetchDelChatLogByGroupIdAPI,
  fetchDeleteGroupChatsAfterIdAPI,
  fetchQueryChatLogListAPI,
} from '@/api/chatLog'
import { fetchModelBaseConfigAPI, fetchQueryModelsListAPI } from '@/api/models'
import { fetchQueryPluginsAPI } from '@/api/plugin'
import { eventBus } from '@/core/events/eventBus'
import { storeService } from '@/core/services/StoreService'
import { useCacheStore } from '../cache'
import { message } from '@/utils/message'

let defaultGroupCreationPromise: Promise<boolean> | null = null
let noModelNoticeShown = false

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    /* 当前选用模型的配置 */
    activeConfig: state => {
      const uuid = state.active
      if (!uuid) return {}
      const config = state.groupList.find(item => item.uuid === uuid)?.config
      const parsedConfig = config ? JSON.parse(config) : state.baseConfig

      return parsedConfig
    },

    activeGroupAppId: state => {
      const uuid = state.active
      if (!uuid) return null
      return state.groupList.find(item => item.uuid === uuid)?.appId
    },

    activeGroupPluginId: state => {
      const uuid = state.active
      if (!uuid) return null
      return state.groupList.find(item => item.uuid === uuid)?.pluginId
    },

    activeGroupFileUrl: state => {
      const uuid = state.active
      if (!uuid) return null
      return state.groupList.find(item => item.uuid === uuid)?.fileUrl
    },

    /* 当前选用模型的名称 */
    activeModel(): Chat.Chat['model'] {
      return this.activeConfig?.modelInfo?.model
    },

    /* 当前选用模型的名称 */
    activeModelName(): Chat.Chat['modelName'] {
      return this.activeConfig?.modelInfo?.modelName
    },

    /* 当前选用模型的扣费类型 */
    activeModelDeductType(): number | undefined {
      return this.activeConfig?.modelInfo?.deductType
    },

    /* 当前选用模型的模型类型 */
    activeModelKeyType(): number | undefined {
      return this.activeConfig?.modelInfo?.keyType
    },

    /* 当前选用模型支持上传文件的格式 */
    activeModelFileUpload(): number | undefined {
      return this.activeConfig?.modelInfo?.isFileUpload
    },

    /* 当前选用模型的调用价格 */
    activeModelPrice(): number | undefined {
      return this.activeConfig?.modelInfo?.deduct
    },
  },

  actions: {
    /* 查询插件列表 */
    async queryPlugins() {
      try {
        const cacheStore = useCacheStore()

        // 先从缓存获取
        const cachedPlugins = cacheStore.get('plugins')
        if (cachedPlugins && cacheStore.hasPlugins) {
          this.pluginList = cachedPlugins
          return
        }

        // 从API获取
        const res: any = await fetchQueryPluginsAPI()
        if (res.success && res.code === 200) {
          // 后端直接返回数组
          const plugins = res.data.map((plugin: any) => ({
            pluginId: plugin.id,
            pluginName: plugin.name,
            description: plugin.description,
            pluginImg: plugin.pluginImg,
            parameters: plugin.parameters,
            uploadTypes: plugin.uploadTypes,
            customOptions: plugin.customOptions,
            keyType: plugin.keyType,
          }))

          this.pluginList = plugins as any

          // 缓存插件列表
          cacheStore.set('plugins', plugins)
        }
      } catch {}
    },

    /* 查询模型列表 */
    async queryModels() {
      try {
        const cacheStore = useCacheStore()

        // 先从缓存获取
        const cachedModels = cacheStore.get('models')
        let modelList: any

        if (cachedModels && cacheStore.hasModels) {
          modelList = cachedModels
        } else {
          // 从API获取（后端现在直接返回数组）
          const res: any = await fetchQueryModelsListAPI()
          if (res.success && res.code === 200) {
            modelList = res.data
            // 缓存模型列表
            cacheStore.set('models', modelList)
          } else {
            return
          }
        }

        // 后端现在直接返回模型数组，不需要扁平化处理
        // 只保留需要的字段
        this.modelList = modelList.map((model: any) => {
          return {
            id: model.id,
            model: model.model,
            modelName: model.modelName,
            modelAvatar: model.modelAvatar,
            modelType: model.keyType,
            deductType: model.deductType,
            deduct: model.deduct,
            isFileUpload: model.isFileUpload,
            isImageUpload: model.isImageUpload,
            isToolSupported: model.isToolSupported,
            deepThinkingType: model.deepThinkingType,
            modelDescription: model.modelDescription,
          }
        })
        this.modelsLoaded = true
        if (this.modelList.length > 0) noModelNoticeShown = false
      } catch (error) {
        this.modelsLoaded = true
        console.error('[chatStore] queryModels 异常:', error)
      }
    },

    /* 对话组过滤 */
    setGroupKeyWord(keyWord: string) {
      this.groupKeyWord = keyWord
    },

    /* 计算拿到当前选择的对话组信息 */
    getChatByGroupInfo() {
      if (this.active) return this.groupList.find(item => item.uuid === this.active)
    },

    /*  */
    getConfigFromUuid(uuid: any) {
      return this.groupList.find(item => item.uuid === uuid)?.config
    },

    /* 新增新的对话组 */
    async addNewChatGroup(
      appId = 0,
      modelConfig?: any,
      params?: string,
      skipGroupRefresh = false
    ) {
      // 新建对话时不传递 pluginId，让后端保存为 null
      const res: any = await fetchCreateGroupAPI({
        appId,
        modelConfig,
        params,
      })

      // 使用服务层关闭预览栏
      storeService.closeAllPreviewers()

      this.active = res.data.id
      this.usingTool = false
      this.usingDeepThinking = false
      // 清空输入框内容
      this.prompt = ''
      // 清空插件选择（新建对话不保留插件）
      this.currentPlugin = null
      this.recordState()

      if (!skipGroupRefresh) await this.queryMyGroup()

      await this.setActiveGroup(res.data.id)
    },

    /* 查询基础模型配置  */
    async getBaseModelConfig() {
      try {
        const res = await fetchModelBaseConfigAPI()
        this.baseConfig = res?.data
      } catch (error: any) {
        console.error('[chatStore] getBaseModelConfig failed:', error?.message)
      }
    },

    /* 恢复当前对话组的插件状态 */
    async restorePluginState() {
      const group = this.groupList.find(item => item.uuid === this.active)

      if (group?.pluginId) {
        // 从插件列表中查找对应的插件
        const pluginToRestore = this.pluginList.find(
          (p: any) =>
            p.pluginId === group.pluginId ||
            p.pluginId === String(group.pluginId) ||
            Number(p.pluginId) === group.pluginId
        )

        // 设置插件
        this.currentPlugin = pluginToRestore || undefined
      } else {
        this.currentPlugin = undefined
      }
    },

    /* 查询我的对话组 */
    async queryMyGroup() {
      const res: any = await fetchQueryGroupAPI()
      this.groupList = res.data.map((item: any) => {
        const {
          id: uuid,
          title,
          isSticky,
          createdAt,
          updatedAt,
          appId,
          pluginId,
          config,
          appLogo,
          isFixedModel,
          isGpts,
          params,
          fileUrl,
          content,
          appModel,
        } = item
        return {
          uuid,
          title,
          isEdit: false,
          appId,
          pluginId,
          config,
          isSticky,
          appLogo,
          createdAt,
          isFixedModel,
          isGpts,
          params,
          fileUrl,
          content,
          appModel,
          updatedAt: new Date(updatedAt).getTime(),
        }
      })

      const isHasActive = this.groupList.some(
        (item: { uuid: any }) => Number(item.uuid) === Number(this.active)
      )
      if (!this.active || !isHasActive) {
        if (this.groupList.length > 0) {
          this.setActiveGroup(this.groupList[0].uuid)
        }
      } else {
        // 已有激活对话组，恢复插件状态
        this.restorePluginState()
      }
      // 如果 groupList 为空，新建一个对话组
      if (this.groupList.length === 0) {
        if (!this.modelsLoaded) return
        if (this.modelList.length === 0) {
          if (!noModelNoticeShown) {
            message().warning('当前站点尚未配置可用模型，请联系管理员完成模型配置')
            noModelNoticeShown = true
          }
          this.active = 0
          this.recordState()
          return
        }

        if (!defaultGroupCreationPromise) {
          defaultGroupCreationPromise = this.addNewChatGroup(0, undefined, undefined, true)
            .then(() => true)
            .catch((error: any) => {
              const errorMessage = error?.message || ''
              if (error?.status === 503 || errorMessage.includes('未配置可用模型')) {
                if (!noModelNoticeShown) {
                  message().warning('当前站点尚未配置可用模型，请联系管理员完成模型配置')
                  noModelNoticeShown = true
                }
                this.active = 0
                return false
              }
              throw error
            })
            .finally(() => {
              defaultGroupCreationPromise = null
            })
        }
        const created = await defaultGroupCreationPromise
        if (!created) {
          this.recordState()
          return
        }
        await this.queryMyGroup()
        return
      }
      this.recordState()
    },

    /* 修改对话组信息 */
    async updateGroupInfo(params: {
      groupId: number
      title?: string
      isSticky?: boolean
      fileUrl?: string
    }) {
      await fetchUpdateGroupAPI(params)
      await this.queryMyGroup()
    },

    /* 变更对话组 */
    // 设置当前激活的对话组
    async setActiveGroup(uuid: number) {
      // 使用服务层处理 UI 状态
      storeService.toggleAppList(false)
      storeService.closeAllPreviewers()
      // this.chatList = [];
      this.active = uuid

      // 清空输入框内容
      this.prompt = ''

      // 先从后端数据查找要恢复的插件
      const group = this.groupList.find(item => item.uuid === uuid)
      let pluginToRestore = null
      if (group?.pluginId) {
        // 从插件列表中查找对应的插件（考虑类型可能是 number 或 string）
        pluginToRestore = this.pluginList.find(
          (p: any) =>
            p.pluginId === group.pluginId ||
            p.pluginId === String(group.pluginId) ||
            Number(p.pluginId) === group.pluginId
        )
      }

      // 一次性设置插件（避免中间状态触发不必要的更新）
      this.currentPlugin = pluginToRestore || undefined

      this.groupList.forEach(item => (item.isEdit = false))

      if (this.active) {
        await this.queryActiveChatLogList()
      } else {
        this.chatList = []
      }

      // 记录当前状态
      this.recordState()
    },

    /* 删除对话组 */
    async deleteGroup(params: Chat.History) {
      const curIndex = this.groupList.findIndex(item => item.uuid === params.uuid)
      const { uuid: groupId } = params
      await fetchDelGroupAPI({ groupId })
      await this.queryMyGroup()
      if (this.groupList.length === 0) await this.setActiveGroup(0)

      if (curIndex > 0 && curIndex < this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex].uuid)

      if (curIndex === 0 && this.groupList.length > 0)
        await this.setActiveGroup(this.groupList[0].uuid)

      if (curIndex > this.groupList.length || (curIndex === 0 && this.groupList.length === 0))
        await this.setActiveGroup(0)

      if (curIndex > 0 && curIndex === this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex - 1].uuid)

      this.recordState()
    },

    /* 删除全部非置顶对话组 */
    async delAllGroup() {
      if (!this.active || this.groupList.length === 0) return
      await fetchDelAllGroupAPI()
      await this.queryMyGroup()
      if (this.groupList.length === 0) await this.setActiveGroup(0)
      else await this.setActiveGroup(this.groupList[0].uuid)
    },

    // /* 查询当前对话组的聊天记录 */
    // async queryActiveChatLogList() {
    //   if (!this.active || Number(this.active) === 0) return;
    //   const res: any = await fetchQueryChatLogListAPI({ groupId: this.active });
    //   this.chatList = res.data;
    //   this.recordState();
    // },

    /* 查询当前对话组的聊天记录 */
    /* 查询当前对话组的聊天记录 */
    async queryActiveChatLogList() {
      // 如果没有激活的对话组，或者 groupId 为 0，则不进行查询
      if (!this.active || Number(this.active) === 0) {
        this.chatList = [] // 确保没有数据时清空 chatList
        return
      }

      try {
        // 调用 API 查询聊天记录
        const res: any = await fetchQueryChatLogListAPI({
          groupId: this.active,
        })

        // 检查响应数据并更新 chatList
        if (res && res.data) {
          // 解析每条消息的 agent_content
          this.chatList = res.data.map((item: any) => {
            if (item.agent_content) {
              // 解析 agent_content 并合并到消息中
              const parsedData = parseAgentContent(item.agent_content, {
                networkSearchResult: item.networkSearchResult,
                fileVectorResult: item.fileVectorResult,
                tool_calls: item.tool_calls,
                reasoning_content: item.reasoning_content,
                promptReference: item.promptReference,
                pluginParam: item.pluginParam,
                pptTheme: item.pptTheme,
                pptOutline: item.pptOutline,
              })

              // 将解析后的数据合并到原始项中
              return Object.assign({}, item, parsedData)
            }
            return item
          })
        } else {
          this.chatList = [] // 如果没有数据，确保 chatList 为空数组
        }
      } catch {
        // 捕获错误并处理
        this.chatList = [] // 出错时清空 chatList
      } finally {
        // 无论成功还是失败，都调用 recordState

        this.recordState()
      }
    },

    /* 添加一条虚拟的对话记录 */
    addGroupChat(data: Chat.Chat) {
      // 使用push直接修改数组，避免创建新数组触发整个列表重新渲染
      this.chatList.push(data)
    },

    /* 动态修改对话记录 */
    updateGroupChat(index: number, data: Chat.Chat) {
      // 直接修改对象属性，避免创建新对象
      if (this.chatList[index]) {
        Object.assign(this.chatList[index], data)
      }
    },

    /* 修改其中部分内容 */
    updateGroupChatSome(index: number, data: Partial<Chat.Chat>) {
      // 确保索引有效
      if (!this.chatList[index]) return

      // 直接更新对象属性，Vue 3的响应式系统会自动检测
      Object.assign(this.chatList[index], data)
    },

    /* 删除一条对话记录 */
    async deleteChatById(chatId: number | undefined) {
      if (!chatId) return
      await fetchDelChatLogAPI({ id: chatId })
      await this.queryActiveChatLogList()
    },

    /* 删除一条对话记录 */
    async deleteChatsAfterId(chatId: number | undefined) {
      if (!chatId) return
      await fetchDeleteGroupChatsAfterIdAPI({ id: chatId })
      await this.queryActiveChatLogList()
    },

    /* 设置使用上下文 */
    setUsingContext(context: boolean) {
      this.usingContext = context
      this.recordState()
    },

    /* 设置使用深度思考 */
    setUsingDeepThinking(context: boolean) {
      this.usingDeepThinking = context
      this.recordState()
    },

    /* 设置使用统一工具（网络搜索和MCP工具） */
    setUsingTool(context: boolean) {
      this.usingTool = context
      this.recordState()
    },

    setUsingPlugin(plugin: any) {
      // Set the current plugin to the new plugin if provided, else clear it
      this.currentPlugin = plugin || undefined
      this.recordState() // Record the state change

      // 同步插件ID到后端
      if (this.active) {
        const pluginId = plugin?.pluginId || null
        fetchUpdateGroupAPI({
          groupId: this.active,
          pluginId,
        })
          .then(() => {
            // 更新本地 groupList 中的 pluginId（临时缓存，下次切换会重新从后端获取）
            const group = this.groupList.find(item => item.uuid === this.active)
            if (group) {
              group.pluginId = pluginId || undefined
            }
          })
          .catch(error => {
            console.error('Failed to save pluginId to backend:', error)
          })
      }
    },

    async setPrompt(prompt: string) {
      this.prompt = prompt
      this.recordState()
    },

    setStreamIn(isStreamIn: boolean) {
      this.isStreamIn = isStreamIn
      this.recordState()
    },

    /* 删除当前对话组的全部内容 */
    async clearChatByGroupId() {
      if (!this.active) return

      await fetchDelChatLogByGroupIdAPI({ groupId: this.active })
      await this.queryActiveChatLogList()
    },

    recordState() {
      setLocalState(this.$state)
    },

    /* 设置全局的selectedApp状态 */
    setSelectedApp(app: any) {
      this.selectedApp = app
      this.isSelectedApp = !!app
      this.recordState()
    },

    /* 清空全局的selectedApp状态 */
    clearSelectedApp() {
      this.selectedApp = null
      this.isSelectedApp = false
      this.recordState()
    },

    clearChat() {
      this.chatList = []
      this.groupList = []
      this.active = 0
      this.recordState()
    },

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
      // 监听清空聊天事件
      eventBus.on('chat:clear', () => {
        this.clearChat()
      })

      // 监听设置插件事件
      eventBus.on('chat:setPlugin', ({ pluginId }) => {
        this.setUsingPlugin(pluginId)
      })
    },
  },
})
