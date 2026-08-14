import { useAuthStore } from '@/store/modules/auth'
import { getVisitorToken } from '@/services/visitorSession'
import axios, { type AxiosResponse } from 'axios'

const service = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
  timeout: 2400 * 1000,
  adapter: 'fetch',
})

service.interceptors.request.use(
  config => {
    const token = useAuthStore().token
    const currentDomain = window.location.origin
    config.headers['X-Website-Domain'] = currentDomain
    const requestToken = token || getVisitorToken()
    if (requestToken) config.headers.Authorization = `Bearer ${requestToken}`
    return config
  },
  error => {
    return Promise.reject(error.response)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if ([200, 201].includes(response.status)) return response
    throw new Error(response.status.toString())
  },
  error => {
    return Promise.reject(error)
  }
)

export default service
