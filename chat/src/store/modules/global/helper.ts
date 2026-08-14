import { ss } from '@/utils/storage'
import { UserState } from '../users/helper'
import { t } from '@/locales'

const LOCAL_NAME = 'userStorage'

export interface UserInfo {
  avatar: string
  name: string
}

export interface OrderInfo {
  pkgInfo: {
    id: number
    des: string
    name: string
    price: string
    priceUsd: number
    model3Count: number
    model4Count: number
    drawMjCount: number
    coverImg: string
    days: number
  }
}

export interface GlobalState {
  loading: boolean
  showLoginDialog: boolean
  goodsDialog: boolean
  fingerprint: number
  noticeDialog: boolean
  bindWxDialog: boolean
  signInDialog: boolean
  appDialog: boolean
  identityDialog: boolean
  phoneIdentityDialog: boolean
  userAgreementDialog: boolean
  BadWordsDialog: boolean
  pythonDialog: boolean
  pythonContent: string
  settingsDialog: boolean
  mobileSettingsDialog: boolean
  settingsActiveTab: number
  mobileInitialTab?: string
  isChatIn: boolean
  isCacheEnabled: boolean
  useKnowledgeBase: boolean // 是否使用用户知识库
  orderInfo: OrderInfo
  model: number
  iframeUrl: string
  clipboardText: string
  htmlContent: string
  contentType: 'html' | 'mermaid' | 'markmap' | ''
  full_json: string
  externalLinkDialog: boolean
  showAppListComponent: boolean
  showBadWordsDialog: boolean
  showHtmlPreviewer: boolean
  showImagePreviewer: boolean
  showVideoPreviewer: boolean
  videoPreviewerUrl: string
  videoPreviewerTitle: string
  showMarkdownPreviewer: boolean
  showPptPreviewer: boolean
  showTextEditor: boolean
  showMessageEditor: boolean
  editingMessageContent: string
  editingConversationTitle: string
  isMarkdownPreviewerVisible: boolean
  previewImageUrls: string[]
  initialImageIndex: number
  currentExternalLink: string | null
  mjImageData: any
  markdownContent: string
  pptContent: any
  pptWorkflowStatus: {
    nodeType?: string
    status?: string
    statusMessage?: string
    progress?: number
    pptOutline?: any
    pptContent?: any
    pptData?: any
  }
  pptWorkflowStatusMap?: Record<string, any>
  pendingEditDiff: any
}

export function defaultSetting(): UserState {
  return {
    userInfo: {
      avatar: '',
      name: t('common.notLoggedIn'),
    },
  }
}

export function getLocalState(): UserState {
  const localSetting: UserState | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: UserState): void {
  ss.set(LOCAL_NAME, setting)
}
