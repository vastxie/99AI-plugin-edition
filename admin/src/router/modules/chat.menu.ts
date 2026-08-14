import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/chat',
  component: Layout,
  redirect: '/chat/dashboard',
  name: 'chatMenu',
  meta: {
    title: '数据中心',
    icon: 'majesticons:data-line',
  },
  children: [
    {
      path: 'dashboard',
      name: 'dashboardMenu',
      component: () => import('@/views/user/list.vue'),
      meta: {
        title: '用户信息',
        icon: 'fa6-solid:list-ul',
      },
    },
    {
      path: 'list',
      name: 'chatMenuList',
      component: () => import('@/views/chat/chat.vue'),
      meta: {
        title: '对话记录',
        icon: 'material-symbols-light:chat-outline',
      },
    },
    {
      path: 'order-list',
      name: 'OrderMenuList',
      component: () => import('@/views/order/list.vue'),
      meta: {
        title: '订单列表',
        icon: 'lets-icons:order',
      },
    },
    {
      path: 'account-log',
      name: 'AccountLogMenu',
      component: () => import('@/views/user/accountLog.vue'),
      meta: {
        title: '账户明细',
        icon: 'carbon:account',
      },
    },
  ],
};

export default routes;
