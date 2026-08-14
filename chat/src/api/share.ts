import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'

/* order buy */
export function createShare<T>(data: { htmlContent: string }): Promise<Response<T>> {
  return post<T>({
    url: '/share/create',
    data,
  })
}

export function getShare<T>(shareCode: string): Promise<Response<T>> {
  return get<T>({
    url: `/share/${shareCode}`,
  })
}
