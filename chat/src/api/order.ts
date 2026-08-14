import type { Response } from '@/utils/request'
import { get, post } from '@/utils/request'

/* order buy */
export function fetchOrderBuyAPI<T>(data: {
  goodsId: number
  payType?: string
}): Promise<Response<T>> {
  return post<T>({
    url: '/order/buy',
    data,
  })
}

/* order buy v2 - 支持新的支付方式 */
export function fetchOrderBuyV2API<T>(data: {
  goodsId: number
  method: string
  device?: string
}): Promise<Response<T>> {
  return post<T>({
    url: '/order/buyV2',
    data,
  })
}

/* order query */
export function fetchOrderQueryAPI<T>(data: { orderId: string }): Promise<Response<T>> {
  return get<T>({
    url: '/order/queryByOrderId',
    data,
  })
}

/* 获取可用支付方式 */
export function fetchAvailablePaymentMethods<T>(): Promise<Response<T>> {
  return get<T>({
    url: '/config/payment/methods',
  })
}
