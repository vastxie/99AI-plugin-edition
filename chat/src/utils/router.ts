import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Chat',
    component: () => import('@/views/chat/chat.vue'),
  },
  {
    path: '/share/:shareCode',
    name: 'Share',
    component: () => import('@/views/share/index.vue'),
  },
  {
    path: '/shareHtml/:shareCode',
    name: 'ShareHtml',
    component: () => import('@/views/share/shareHtml.vue'),
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
