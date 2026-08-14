import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'

/* sign in */
export function fetchSignInAPI<T>(): Promise<Response<T>> {
  return post<T>({
    url: '/signin/sign',
  })
}

/* sign log */
export function fetchSignLogAPI<T>(): Promise<Response<T>> {
  return get<T>({
    url: '/signin/signinLog',
  })
}
