import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/package',
  component: Layout,
  redirect: '/package/list',
  name: 'packageMenu',
  meta: {
    title: '支付中心',
    icon: 'icon-park-outline:buy',
  },
  children: [
    {
      path: 'list',
      name: 'packageMenuList',
      component: () => import('@/views/package/package.vue'),
      meta: {
        title: '套餐设置',
        icon: 'icon-park-outline:commodity',
      },
    },
    {
      path: 'crami',
      name: 'cramiMenuList',
      component: () => import('@/views/package/crami.vue'),
      meta: {
        title: '卡密管理',
        icon: 'solar:passport-broken',
      },
    },
    {
      path: 'payment',
      name: 'PaymentConfig',
      component: () => import('@/views/pay/payment.vue'),
      meta: {
        title: '支付配置',
        icon: 'carbon:wallet',
      },
    },
    {
      path: 'channel',
      name: 'ChannelConfig',
      component: () => import('@/views/pay/channel.vue'),
      meta: {
        title: '渠道配置',
        icon: 'carbon:settings',
      },
    },
  ],
};

export default routes;
