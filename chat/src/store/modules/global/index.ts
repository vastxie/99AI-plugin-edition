//  // 移除循环依赖
import { ss } from '@/utils/storage'
import { defineStore } from 'pinia'
import { eventBus } from '@/core/events/eventBus'
import type { GlobalState } from './helper'

// 定义对话框的索引常量，方便后续使用
export const DIALOG_TABS = {
  ACCOUNT: 0, // 账户管理
  MEMBER: 1, // 会员中心
  NOTICE: 2, // 网站公告
  AGREEMENT: 3, // 用户协议
}

export const useGlobalStore = defineStore('global-store', {
  state: (): GlobalState => ({
    loading: false,
    showAppListComponent: false,
    settingsDialog: false,
    showLoginDialog: false,
    showBadWordsDialog: false,
    showHtmlPreviewer: false,
    showImagePreviewer: false,
    showVideoPreviewer: false,
    showMarkdownPreviewer: false,
    showPptPreviewer: false,
    showTextEditor: false,
    previewImageUrls: [],
    initialImageIndex: 0,
    videoPreviewerUrl: '',
    videoPreviewerTitle: '',
    pythonDialog: false,
    isChatIn: false,
    settingsActiveTab: 0,
    htmlContent: '',
    contentType: '',
    pythonContent: '',
    full_json: '',
    externalLinkDialog: false,
    currentExternalLink: null,
    mobileSettingsDialog: false,
    goodsDialog: false,
    fingerprint: 0,
    noticeDialog: false,
    bindWxDialog: false,
    signInDialog: false,
    appDialog: false,
    identityDialog: false,
    phoneIdentityDialog: false,
    userAgreementDialog: false,
    BadWordsDialog: false,
    isCacheEnabled: false,
    useKnowledgeBase: false, // 默认不使用知识库
    orderInfo: {
      pkgInfo: {
        id: 0,
        des: '',
        name: '',
        price: '',
        priceUsd: 0,
        model3Count: 0,
        model4Count: 0,
        drawMjCount: 0,
        coverImg: '',
        days: 0,
      },
    },
    model: 0,
    iframeUrl: '',
    clipboardText: '',
    mjImageData: {},
    mobileInitialTab: undefined,
    markdownContent: '',
    pptContent: null,
    pptWorkflowStatus: {}, // 全局状态，用于当前正在生成的PPT
    pptWorkflowStatusMap: {}, // 按conversationId存储的PPT状态
    isMarkdownPreviewerVisible: false,
    showMessageEditor: false,
    editingMessageContent: '',
    editingConversationTitle: '',
    pendingEditDiff: null as any,
  }),

  actions: {
    updateClipboardText(text: string) {
      this.clipboardText = text
    },

    updateFullJson(json: string) {
      this.full_json = json
    },

    updateFingerprint(str: number) {
      let id = Number(str)
      /* 拒绝小于 20 亿的值，防止与真实用户 ID 碰撞 */
      if (isNaN(id) || !Number.isInteger(id) || id < 2000000000) {
        id = 2000000000 + Math.floor(Math.random() * 147483647)
      }
      /* 超过mysql最大值进行截取 */
      if (id > 2147483647) {
        id = Number(id.toString().slice(-9))
        if (id < 2000000000) {
          id = 2000000000 + Math.floor(Math.random() * 147483647)
        }
      }
      ss.set('fingerprint', id)
      this.fingerprint = id
    },

    updateIframeUrl(iframeUrl: string) {
      this.iframeUrl = iframeUrl
    },

    updateUserAgreementDialog(userAgreementDialog: boolean) {
      this.userAgreementDialog = userAgreementDialog
    },

    UpdateBadWordsDialog(BadWordsDialog: boolean) {
      this.BadWordsDialog = BadWordsDialog
    },

    updateHtmlContent(
      htmlContent: string,
      contentType: 'html' | 'mermaid' | 'markmap' | '' = 'html'
    ) {
      this.htmlContent = htmlContent
      this.contentType = contentType
    },

    updateHtmlPreviewer(visible: boolean) {
      // 如果要打开HTML预览，先关闭其他侧边面板
      if (visible) {
        this.closeSidePanels(['html'])
      }
      this.showHtmlPreviewer = visible
    },

    updateImagePreviewer(
      visible: boolean,
      imageUrls: string[] = [],
      initialIndex: number = 0,
      mjData?: any
    ) {
      this.showImagePreviewer = visible
      if (visible) {
        this.previewImageUrls = imageUrls
        this.initialImageIndex = initialIndex
        this.mjImageData = mjData || {}
      }
    },

    updateVideoPreviewer(visible: boolean, videoUrl: string = '', title: string = '') {
      this.showVideoPreviewer = visible
      if (visible) {
        this.videoPreviewerUrl = videoUrl
        this.videoPreviewerTitle = title
      }
    },

    updateIsChatIn(isChatIn: boolean) {
      this.isChatIn = isChatIn
    },

    updateGoodsDialog(goodsDialog: boolean) {
      this.goodsDialog = goodsDialog
    },

    updateBindwxDialog(bindWxDialog: boolean) {
      this.bindWxDialog = bindWxDialog
    },

    updateSignInDialog(signInDialog: boolean) {
      this.signInDialog = signInDialog
    },

    updateNoticeDialog(noticeDialog: boolean) {
      this.noticeDialog = noticeDialog
    },

    updateAppDialog(appDialog: boolean) {
      this.appDialog = appDialog
    },

    updateIdentityDialog(identityDialog: boolean) {
      this.identityDialog = identityDialog
    },

    updatePhoneDialog(phoneIdentityDialog: boolean) {
      this.phoneIdentityDialog = phoneIdentityDialog
    },

    updateModel(model: number) {
      ss.set('model', model)
      this.model = model
    },

    updateOrderInfo(info: any) {
      // Add appropriate type
      this.orderInfo = info
    },

    updatePythonDialog(pythonDialog: boolean) {
      this.pythonDialog = pythonDialog
    },

    updatePythonContent(content: string) {
      // updatePythonContent
      this.pythonContent = content
    },

    updateExternalLinkDialog(visible: boolean, url: string | null = null) {
      this.externalLinkDialog = visible
      this.currentExternalLink = url
    },

    updateSettingsDialog(settingsDialog: boolean, activeTab?: number) {
      this.settingsDialog = settingsDialog
      if (settingsDialog && activeTab !== undefined) {
        this.settingsActiveTab = activeTab
      }
    },

    updateMobileSettingsDialog(mobileSettingsDialog: boolean, activeTab?: number | string) {
      this.mobileSettingsDialog = mobileSettingsDialog

      if (activeTab !== undefined) {
        // 如果是数字索引，转换为对应的tabId
        if (typeof activeTab === 'number') {
          const tabIds = ['account', 'member', 'notice', 'agreement']
          this.mobileInitialTab = tabIds[activeTab] || undefined
        } else {
          // 如果直接传入了tabId字符串
          this.mobileInitialTab = activeTab
        }
      } else {
        this.mobileInitialTab = undefined
      }
    },

    updateShowAppListComponent(showAppListComponent: boolean) {
      this.showAppListComponent = showAppListComponent
    },

    setCurrentExternalLink(link: string | null) {
      this.currentExternalLink = link
      if (link) {
        this.externalLinkDialog = true
      }
    },

    updateSettingsActiveTab(tab: number) {
      this.settingsActiveTab = tab
    },

    updateUseKnowledgeBase(useKnowledgeBase: boolean) {
      this.useKnowledgeBase = useKnowledgeBase
    },

    updateMarkdownPreviewer(visible: boolean, markdownContent?: string) {
      // 如果要打开文档阅读，先关闭其他侧边面板
      if (visible) {
        this.closeSidePanels(['markdown'])
      }
      this.isMarkdownPreviewerVisible = visible
      if (markdownContent) {
        this.markdownContent = markdownContent
      }
      if (!visible) {
        this.markdownContent = ''
      }
    },

    updateMessageEditor(visible: boolean, content?: string, title?: string) {
      // 如果要打开消息编辑器，先关闭其他侧边面板
      if (visible) {
        this.closeSidePanels(['messageEditor'])
      }
      this.showMessageEditor = visible
      if (content !== undefined) {
        this.editingMessageContent = content
      }
      if (title !== undefined) {
        this.editingConversationTitle = title
      }
      if (!visible) {
        this.editingMessageContent = ''
        this.editingConversationTitle = ''
      }
    },

    updateEditingMessageContent(content: string) {
      this.editingMessageContent = content
    },

    setPendingEditDiff(diff: any) {
      this.pendingEditDiff = diff
    },

    clearPendingEditDiff() {
      this.pendingEditDiff = null
    },

    updatePptPreviewer(visible: boolean, pptContent?: any) {
      // 如果要打开PPT预览，先关闭其他侧边面板
      if (visible) {
        this.closeSidePanels(['ppt'])
      }
      this.showPptPreviewer = visible
      if (pptContent) {
        this.pptContent = pptContent
      }
      if (!visible) {
        this.pptContent = null
        this.pptWorkflowStatus = {}
      }
    },

    updateTextEditor(visible: boolean) {
      // 如果要打开文本编辑器，先关闭其他侧边面板
      if (visible) {
        this.closeSidePanels(['textEditor'])
      }
      this.showTextEditor = visible
    },

    updatePptWorkflowStatus(status: any, conversationId?: string) {
      // 更新全局状态（用于当前正在生成的PPT）
      this.pptWorkflowStatus = status

      // 如果提供了conversationId，也更新对应的状态
      if (conversationId) {
        if (!this.pptWorkflowStatusMap) {
          this.pptWorkflowStatusMap = {}
        }
        if (!this.pptWorkflowStatusMap[conversationId]) {
          this.pptWorkflowStatusMap[conversationId] = {}
        }
        this.pptWorkflowStatusMap[conversationId] = { ...status }
      }
    },

    getPptWorkflowStatus(conversationId?: string) {
      if (
        conversationId &&
        this.pptWorkflowStatusMap &&
        this.pptWorkflowStatusMap[conversationId]
      ) {
        return this.pptWorkflowStatusMap[conversationId]
      }
      return this.pptWorkflowStatus
    },

    // 关闭指定以外的侧边面板
    closeSidePanels(except: string[] = []) {
      // 关闭所有侧边面板，除了except中指定的
      if (!except.includes('html')) {
        this.showHtmlPreviewer = false
        this.htmlContent = ''
      }
      if (!except.includes('markdown')) {
        this.isMarkdownPreviewerVisible = false
        this.markdownContent = ''
      }
      if (!except.includes('ppt')) {
        this.showPptPreviewer = false
        this.pptContent = null
        this.pptWorkflowStatus = {}
      }
      if (!except.includes('messageEditor')) {
        this.showMessageEditor = false
        this.editingMessageContent = ''
      }
      if (!except.includes('textEditor')) {
        this.showTextEditor = false
      }
      // 其他预览器也可以加入这里
      if (!except.includes('image')) {
        this.showImagePreviewer = false
        this.previewImageUrls = []
      }
      if (!except.includes('video')) {
        this.showVideoPreviewer = false
        this.videoPreviewerUrl = ''
        this.videoPreviewerTitle = ''
      }
    },

    // 关闭所有预览器
    closeAllPreviewers() {
      this.closeSidePanels([])
      // 还有一些非侧边面板的预览器
      this.showMarkdownPreviewer = false
    },

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
      // 监听 UI 关闭所有预览器事件
      eventBus.on('ui:closeAllPreviewers', () => {
        this.closeAllPreviewers()
      })

      // 监听应用列表切换事件
      eventBus.on('ui:toggleAppList', ({ visible }) => {
        this.updateShowAppListComponent(visible)
      })

      // 监听图片预览事件
      eventBus.on('ui:imagePreview', ({ urls, index, mjData }) => {
        this.updateImagePreviewer(true, urls, index, mjData)
      })
    },
  },
})

export function useGlobalStoreWithOut() {
  // 直接使用 useGlobalStore，不再引入 store
  return useGlobalStore()
}
