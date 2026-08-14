import { get, post } from '@/utils/request'

// 获取用户可见的预设
export function fetchUserPresetsAPI() {
  return get({
    url: '/preset/user-presets',
  })
}

// 增加预设使用次数
export function incrementPresetUsageAPI(id: number) {
  return post({
    url: `/preset/${id}/increment-usage`,
  })
}
