import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'

/* use crami */
export function fetchUseCramiAPI<T>(data: { code: string }): Promise<Response<T>> {
  return post<T>({
    url: '/crami/useCrami',
    data,
  })
}

/* get all crami package */
export function fetchGetPackageAPI<T>(data: {
  status: number
  type?: number
  size?: number
}): Promise<Response<T>> {
  return get<T>({
    url: '/crami/queryAllPackage',
    data,
  })
}
