import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/secure',
  component: Layout,
  redirect: '/secure/sensitive-config',
  name: 'SecureMenu',
  meta: {
    title: '安全中心',
    icon: 'ri:secure-payment-line',
  },
  children: [
    {
      path: 'sensitive-config',
      name: 'SensitiveConfig',
      component: () => import('@/views/security/baiduSensitive.vue'),
      meta: {
        title: '敏感词配置',
        icon: 'ri:shield-keyhole-line',
      },
    },
    {
      path: 'whitelist',
      name: 'Whitelist',
      component: () => import('@/views/security/whitelist.vue'),
      meta: {
        title: '白名单管理',
        icon: 'ri:shield-check-line',
      },
    },
    {
      path: 'identity-verification',
      name: 'IdentityVerification',
      component: () => import('@/views/security/identityVerification.vue'),
      meta: {
        title: '风控安全配置',
        icon: 'hugeicons:identification',
      },
    },
    {
      path: 'sensitive-violation',
      name: 'SensitiveViolationLog',
      component: () => import('@/views/security/violation.vue'),
      meta: {
        title: '违规检测记录',
        icon: 'tabler:ban',
      },
    },
  ],
};

export default routes;
