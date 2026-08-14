import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/content-management',
  component: Layout,
  redirect: '/content-management/vector-config',
  name: 'ContentManagement',
  meta: {
    title: '内容管理',
    icon: 'material-symbols:content-paste-go',
  },
  children: [
    {
      path: 'vector-config',
      name: 'VectorConfig',
      component: () => import('@/views/contentManagement/vectorConfig.vue'),
      meta: {
        title: '向量配置',
        icon: 'mdi:vector-square',
      },
    },
    {
      path: 'knowledge',
      name: 'KnowledgeManagement',
      component: () => import('@/views/contentManagement/knowledgeManagement.vue'),
      meta: {
        title: '知识库管理',
        icon: 'mdi:folder-network-outline',
      },
    },
    {
      path: 'reply-preset',
      name: 'ReplyPreset',
      component: () => import('@/views/contentManagement/replyPreset.vue'),
      meta: {
        title: '回复预设',
        icon: 'ic:outline-question-answer',
      },
    },
  ],
};

export default routes;
