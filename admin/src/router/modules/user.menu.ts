import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/user',
  component: Layout,
  redirect: '/user/email',
  name: 'userMenu',
  meta: {
    title: '配置管理',
    icon: 'mdi:cog-outline',
  },
  children: [
    {
      path: 'email',
      name: 'systemMenuEmail',
      component: () => import('@/views/user/email.vue'),
      meta: {
        title: '邮件配置',
        icon: 'material-symbols:mail-outline',
      },
    },
    {
      path: 'wechat',
      name: 'systemMenuWechat',
      component: Layout,
      redirect: '/user/wechat/config',
      meta: {
        title: '微信配置',
        icon: 'la:weixin',
      },
      children: [
        {
          path: 'config',
          name: 'systemMenuWechatConfig',
          component: () => import('@/views/user/wechat.vue'),
          meta: {
            title: '微信登录配置',
          },
        },
        {
          path: 'migration',
          name: 'systemMenuWechatMigration',
          component: () => import('@/views/user/wechatMigration.vue'),
          meta: {
            title: '微信迁移配置',
          },
        },
        {
          path: 'menu',
          name: 'systemMenuWechatMenu',
          component: () => import('@/views/user/wechatMenu.vue'),
          meta: {
            title: '微信公众号菜单',
          },
        },
      ],
    },
    {
      path: 'ali-phone',
      name: 'AliPhoneMenu',
      component: () => import('@/views/user/phone.vue'),
      meta: {
        title: '短信配置',
        icon: 'tabler:message',
      },
    },
    {
      path: 'storage-config',
      name: 'StorageConfig',
      component: () => import('@/views/storage/config.vue'),
      meta: {
        title: '存储配置',
        icon: 'icon-park-outline:cloud-storage',
      },
    },
    {
      path: 'externalLinks',
      name: 'externalLinks',
      component: () => import('@/views/model/externalLinks.vue'),
      meta: {
        title: '外链配置',
        icon: 'mdi:link',
      },
    },
  ],
};

export default routes;
