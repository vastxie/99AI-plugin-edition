import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/app',
  component: Layout,
  redirect: '/app/app-center',
  name: 'AppMenu',
  meta: {
    title: '功能管理',
    icon: 'tdesign:app',
  },
  children: [
    {
      path: 'plugin-menu',
      name: 'PluginMenu',
      component: () => import('@/views/app/plugin.vue'),
      meta: {
        title: '插件列表',
        icon: 'mingcute:plugin-2-line',
      },
    },
    {
      path: 'app-center',
      name: 'AppCenter',
      component: () => import('@/views/app/appCenter.vue'),
      meta: {
        title: '应用中心',
        icon: 'clarity:vmw-app-line',
      },
    },
    {
      path: 'mcp',
      name: 'MCP',
      component: () => import('@/views/app/mcp.vue'),
      meta: {
        title: 'MCP 管理',
        icon: 'ph:toolbox-light',
      },
    },
    {
      path: 'preset-center',
      name: 'PresetCenter',
      component: () => import('@/views/app/presetCenter.vue'),
      meta: {
        title: '首页预设',
        icon: 'material-symbols:auto-awesome',
      },
    },
  ],
};

export default routes;
