export interface MineApp {
  userId: number
  appId: number
  public: boolean
  status: number
  demoData: string
  order: number
  appDes: string
  preset: string
  appRole: string
  coverImg: string
  appName: string
  loading?: boolean
  backgroundImg?: string
  prompt?: string
}

export interface App {
  id: number
  name: string
  des?: string
  coverImg?: string
  catId?: string
  catName?: string
  backgroundImg?: string
  prompt?: string
  loading?: boolean
  [key: string]: any
}

export interface AppStoreState {
  catId: number
  mineApps: MineApp[]
  allApps: App[]
  appDetails: Record<number, any> // 应用详细缓存 { appId: appDetail }
  appCategories: AppCategory[] // 应用分类列表
}

export interface AppCategory {
  id: number
  name: string
  coverImg?: string
  des?: string
  isMember?: number
  hideFromNonMember?: number
}
