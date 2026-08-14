import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'
import { getVisitorToken } from '@/services/visitorSession'

/* get rechargeLog */
export function fetchGetRechargeLogAPI<T>(data: {
  page?: number
  size?: number
}): Promise<Response<T>> {
  return get<T>({
    url: '/balance/rechargeLog',
    data,
  })
}

/* query balance */
export function fetchGetBalanceQueryAPI<T>(): Promise<Response<T>> {
  return get<T>({
    url: '/balance/query',
  })
}

export function fetchVisitorCountAPI<T>(): Promise<Response<T>> {
  return get<T>({
    url: '/balance/getVisitorCount',
  })
}

export function fetchSyncVisitorDataAPI<T>(): Promise<Response<T>> {
  return post<T>({
    url: '/balance/inheritVisitorData',
    data: { visitorToken: getVisitorToken() },
  })
}
