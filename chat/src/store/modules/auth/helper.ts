import { ss } from '@/utils/storage'

const LOCAL_NAME = 'SECRET_TOKEN'

export function getToken() {
  return ss.get(LOCAL_NAME)
}

export function setToken(token: string) {
  return ss.set(LOCAL_NAME, token)
}

export function removeToken() {
  return ss.remove(LOCAL_NAME)
}

export interface UserBalance {
  packageId?: number | null
  isMember: boolean
  model3Count: number
  model4Count: number
  drawMjCount: number
  memberModel3Count: number
  memberModel4Count: number
  memberDrawMjCount: number
  useModel3Count: number
  useModel4Count: number
  useModel3Token: number
  useModel4Token: number
  useDrawMjToken: number
  sumModel3Count: number
  sumModel4Count: number
  sumDrawMjCount: number
  expirationTime: string | null
}

export interface UserInfo {
  username: string
  email: string
  role: string
  id: string | number
  avatar?: string
  sign?: string
  isBindWx: boolean | number
  consecutiveDays: number
  nickname: string
  customInstruction?: string
  knowledgeFiles?: Array<{ fileName: string; fileUrl: string }>
  phone?: string
  realName?: string
  idCard?: string
}

export interface GetInfoResponse {
  userInfo: UserInfo
  userBalance: UserBalance
}

export interface GlobalConfig {
  siteName: string
  siteTitle: string
  siteDescription: string
  siteKeywords: string
  siteUrl: string
  qqNumber: string
  vxNumber: string
  buyCramiAddress: string
  noticeInfo: string
  registerSendStatus: string
  registerSendModel3Count: string
  registerSendModel4Count: string
  registerSendDrawMjCount: string
  clientHomePath: string
  clientLogoPath: string
  enableHtmlRender: string
  clientFaviconPath: string
  userDefaultAvatar: string
  siteRobotName: string
  mindDefaultData: string
  payEpayStatus: string
  payHupiStatus: string
  payWechatStatus: string
  payEpayChannel: string
  payHupiChannel: string
  payWechatChannel: string
  payEpayApiPayUrl: string
  payMpayStatus: string
  payMpayChannel: string
  isAutoOpenNotice: string
  isShowAppCatIcon: string
  salesBaseRatio: string
  salesSeniorRatio: string
  salesAllowDrawMoney: string
  companyName: string
  filingNumber: string
  publicSecurityFilingNumber: string // 公安备案号
  emailLoginStatus: string
  phoneLoginStatus: string
  openIdentity: string
  openPhoneValidation: string
  wechatRegisterStatus: string
  wechatSilentLoginStatus: string
  oldWechatMigrationStatus: string
  officialOldAccountSuccessText: string
  officialOldAccountFailText: string
  signInStatus: string
  signInModel3Count: string
  signInModel4Count: string
  signInMjDrawToken: string
  appMenuHeaderTips: string
  appMenuHeaderBgUrl: string
  pluginFirst: string
  mjHideNotBlock: string
  mjUseBaiduFy: string
  mjHideWorkIn: string
  isVerifyEmail: string
  payLtzfStatus: string
  isHidePlugin: string
  isHideSidebarApps: string
  showWatermark: string
  ttsMode: string // 0-不显示播放按钮, 1-默认TTS, 2-浏览器TTS
  isHideDefaultPreset: string
  isHideModel3Point: string
  isHideModel4Point: string
  isHideDrawMjPoint: string
  model3Name: string
  model4Name: string
  drawMjName: string
  isModelInherited: string
  noVerifyRegister: string
  homeHtml: string
  isAutoOpenAgreement: string
  agreementInfo: string
  agreementTitle: string
  isEnableExternalLinks: string
  externalLinks: string
  clearCacheEnabled: string
  noticeTitle: string
  streamCacheEnabled: string
  homeWelcomeContent: string
  sideDrawingEditModel: string
  defaultLanguage: string
  enabledLanguages: string
  modelSelectorPosition: string
  maxInputLength: string
  uploadFileLimit: string
  uploadFileSizeLimit: string
}

export interface AuthState {
  token: string | undefined
  loginDialog: boolean
  globalConfigLoading: boolean
  loadInit: boolean
  userInfo: UserInfo
  userBalance: UserBalance
  globalConfig: GlobalConfig
}

export function createDefaultUserInfo(): UserInfo {
  return {
    username: '',
    email: '',
    role: '',
    id: '',
    avatar: '',
    sign: '',
    isBindWx: false,
    consecutiveDays: 0,
    nickname: '',
    customInstruction: '',
    knowledgeFiles: [],
    phone: '',
    realName: '',
  }
}

export function createDefaultUserBalance(): UserBalance {
  return {
    packageId: null,
    isMember: false,
    model3Count: 0,
    model4Count: 0,
    drawMjCount: 0,
    memberModel3Count: 0,
    memberModel4Count: 0,
    memberDrawMjCount: 0,
    useModel3Count: 0,
    useModel4Count: 0,
    useModel3Token: 0,
    useModel4Token: 0,
    useDrawMjToken: 0,
    sumModel3Count: 0,
    sumModel4Count: 0,
    sumDrawMjCount: 0,
    expirationTime: null,
  }
}
