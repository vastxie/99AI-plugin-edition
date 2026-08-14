import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/system',
  component: Layout,
  redirect: '/system/base',
  name: 'systemMenu',
  meta: {
    title: '系统管理',
    icon: 'tdesign:system-2',
  },
  children: [
    {
      path: 'base-configuration',
      name: 'ClientBaseConfig',
      component: () => import('@/views/system/baseConfiguration.vue'),
      meta: {
        title: '基础配置',
        icon: 'uil:setting',
      },
    },
    {
      path: 'points',
      name: 'PointsDisplay',
      component: () => import('@/views/system/displaySettings.vue'),
      meta: {
        title: '显示设置',
        icon: 'mdi:show-outline',
      },
    },
    {
      path: 'register',
      name: 'systemMenuRegister',
      component: () => import('@/views/user/register.vue'),
      meta: {
        title: '用户配置',
        icon: 'material-symbols:manage-accounts',
      },
    },
    {
      path: 'content-management',
      name: 'systemContentManagement',
      component: () => import('@/views/system/contentManagement.vue'),
      meta: {
        title: '公告配置',
        icon: 'mdi:bullhorn-outline',
      },
    },
    {
      path: 'baidu',
      name: 'systemMenuBase',
      component: () => import('@/views/system/baiduStatistics.vue'),
      meta: {
        title: '统计设置',
        icon: 'wpf:statistics',
      },
    },
    {
      path: 'database',
      name: 'systemMenuDatabase',
      component: () => import('@/views/system/databaseManagement.vue'),
      meta: {
        title: '数据库管理',
        icon: 'mdi:database-cog',
      },
    },
  ],
};

export default routes;
