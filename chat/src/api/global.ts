import type { Response } from '@/utils/request'
import { get } from '@/utils/request'

/* get notice */
export function fetchGetGlobalNoticeAPI<T>(): Promise<Response<T>> {
  return get<T>({
    url: '/config/notice',
  })
}
