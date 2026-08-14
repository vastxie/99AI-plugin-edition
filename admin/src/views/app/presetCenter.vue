<route lang="yaml">
meta:
  title: 首页预设
</route>

<script lang="ts" setup>
  import { ref, reactive, onMounted, computed, watch } from 'vue';
  import { ElMessage, ElLoading } from 'element-plus';
  import type { FormInstance, FormRules } from 'element-plus';
  import { Search, MagicStick } from '@element-plus/icons-vue';
  import * as ElIcons from '@element-plus/icons-vue';
  import { Icon } from '@iconify/vue';
  import api from '@/api';
  import {
    buildAiGenerationMessage,
    parseAiResponse,
    beautifyPrompt,
  } from '@/utils/presetAiPrompt';

  // Tab control
  const activeTab = ref('preset');

  // ========== 预设管理相关 ==========
  interface Preset {
    id: number;
    title: string;
    description: string;
    prompt: string;
    categoryId: number;
    appId: number;
    pluginParameters: string;
    icon: string;
    iconColor: string;
    order: number;
    usageCount: number;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  }

  interface Category {
    id: number;
    name: string;
  }

  interface App {
    id: number;
    name: string;
    des: string;
    coverImg: string;
  }

  const loading = ref(false);
  const tableData = ref<Preset[]>([]);
  const total = ref(0);
  const categories = ref<Category[]>([]);
  const dialogVisible = ref(false);
  const dialogTitle = ref('');
  const formRef = ref<FormInstance>();
  const showIconDialog = ref(false);

  // 应用相关
  const appList = ref<App[]>([]);
  const appLoading = ref(false);

  // 插件相关
  const pluginList = ref<any[]>([]);
  const pluginLoading = ref(false);
  const selectedPluginId = ref('');

  // AI生成相关
  const aiGenerating = ref(false);

  // 图标列表 - 使用 Iconify 格式以兼容前端（扩展版）
  const iconListData = [
    // === 文档和办公 ===
    { value: 'ri:file-text-line', label: '文档', category: '文档办公' },
    { value: 'ri:file-list-3-line', label: '文件列表', category: '文档办公' },
    { value: 'ri:article-line', label: '文章', category: '文档办公' },
    { value: 'ri:book-open-line', label: '书籍', category: '文档办公' },
    { value: 'ri:folder-open-line', label: '文件夹', category: '文档办公' },
    { value: 'ri:file-pdf-line', label: 'PDF', category: '文档办公' },
    { value: 'ri:file-excel-line', label: 'Excel', category: '文档办公' },
    { value: 'ri:file-word-line', label: 'Word', category: '文档办公' },
    { value: 'ri:file-ppt-line', label: 'PPT', category: '文档办公' },
    { value: 'ri:clipboard-line', label: '剪贴板', category: '文档办公' },
    { value: 'ri:printer-line', label: '打印机', category: '文档办公' },
    { value: 'ri:slideshow-line', label: '幻灯片', category: '文档办公' },
    { value: 'carbon:document', label: '文档2', category: '文档办公' },
    { value: 'tabler:notebook', label: '笔记本', category: '文档办公' },

    // === 编辑和创作 ===
    { value: 'ri:quill-pen-line', label: '羽毛笔', category: '编辑创作' },
    { value: 'ri:pencil-line', label: '铅笔', category: '编辑创作' },
    { value: 'ri:edit-box-line', label: '编辑框', category: '编辑创作' },
    { value: 'ri:edit-line', label: '编辑', category: '编辑创作' },
    { value: 'ri:markup-line', label: '标记', category: '编辑创作' },
    { value: 'ri:text', label: '文本', category: '编辑创作' },
    { value: 'ri:font-size-2', label: '字体', category: '编辑创作' },
    { value: 'ri:palette-line', label: '调色板', category: '编辑创作' },
    { value: 'tabler:writing', label: '写作', category: '编辑创作' },
    { value: 'carbon:pen', label: '钢笔', category: '编辑创作' },
    { value: 'lucide:pen-tool', label: '画笔', category: '编辑创作' },

    // === 通讯和社交 ===
    { value: 'ri:message-2-line', label: '消息', category: '通讯社交' },
    { value: 'ri:chat-1-line', label: '聊天', category: '通讯社交' },
    { value: 'ri:mail-line', label: '邮件', category: '通讯社交' },
    { value: 'ri:send-plane-line', label: '发送', category: '通讯社交' },
    { value: 'ri:wechat-line', label: '微信', category: '通讯社交' },
    { value: 'ri:qq-line', label: 'QQ', category: '通讯社交' },
    { value: 'ri:telegram-line', label: 'Telegram', category: '通讯社交' },
    { value: 'ri:whatsapp-line', label: 'WhatsApp', category: '通讯社交' },
    { value: 'ri:twitter-x-line', label: 'Twitter', category: '通讯社交' },
    { value: 'ri:facebook-circle-line', label: 'Facebook', category: '通讯社交' },
    { value: 'ri:instagram-line', label: 'Instagram', category: '通讯社交' },
    { value: 'ri:linkedin-line', label: 'LinkedIn', category: '通讯社交' },
    { value: 'ri:discord-line', label: 'Discord', category: '通讯社交' },
    { value: 'ri:slack-line', label: 'Slack', category: '通讯社交' },
    { value: 'ri:team-line', label: '团队', category: '通讯社交' },
    { value: 'ri:customer-service-2-line', label: '客服', category: '通讯社交' },

    // === 媒体和娱乐 ===
    { value: 'ri:image-line', label: '图片', category: '媒体娱乐' },
    { value: 'ri:video-line', label: '视频', category: '媒体娱乐' },
    { value: 'ri:music-2-line', label: '音乐', category: '媒体娱乐' },
    { value: 'ri:movie-line', label: '电影', category: '媒体娱乐' },
    { value: 'ri:camera-line', label: '相机', category: '媒体娱乐' },
    { value: 'ri:mic-line', label: '麦克风', category: '媒体娱乐' },
    { value: 'ri:headphone-line', label: '耳机', category: '媒体娱乐' },
    { value: 'ri:play-circle-line', label: '播放', category: '媒体娱乐' },
    { value: 'ri:youtube-line', label: 'YouTube', category: '媒体娱乐' },
    { value: 'ri:spotify-line', label: 'Spotify', category: '媒体娱乐' },
    { value: 'ri:netflix-line', label: 'Netflix', category: '媒体娱乐' },
    { value: 'ri:gamepad-line', label: '游戏', category: '媒体娱乐' },
    { value: 'ri:live-line', label: '直播', category: '媒体娱乐' },

    // === 数据和分析 ===
    { value: 'ri:bar-chart-line', label: '柱状图', category: '数据分析' },
    { value: 'ri:line-chart-line', label: '折线图', category: '数据分析' },
    { value: 'ri:pie-chart-line', label: '饼图', category: '数据分析' },
    { value: 'ri:database-2-line', label: '数据库', category: '数据分析' },
    { value: 'ri:dashboard-line', label: '仪表盘', category: '数据分析' },
    { value: 'ri:bubble-chart-line', label: '气泡图', category: '数据分析' },
    { value: 'ri:donut-chart-line', label: '环形图', category: '数据分析' },
    { value: 'ri:stock-line', label: '股票', category: '数据分析' },
    { value: 'carbon:analytics', label: '分析', category: '数据分析' },
    { value: 'tabler:chart-histogram', label: '直方图', category: '数据分析' },
    { value: 'lucide:trending-up', label: '上升趋势', category: '数据分析' },
    { value: 'lucide:trending-down', label: '下降趋势', category: '数据分析' },

    // === 编程和开发 ===
    { value: 'ri:code-s-slash-line', label: '代码', category: '编程开发' },
    { value: 'ri:terminal-box-line', label: '终端', category: '编程开发' },
    { value: 'ri:bug-line', label: 'Bug', category: '编程开发' },
    { value: 'ri:code-box-line', label: '代码框', category: '编程开发' },
    { value: 'ri:brackets-line', label: '括号', category: '编程开发' },
    { value: 'ri:git-branch-line', label: 'Git分支', category: '编程开发' },
    { value: 'ri:github-line', label: 'GitHub', category: '编程开发' },
    { value: 'ri:gitlab-line', label: 'GitLab', category: '编程开发' },
    { value: 'ri:html5-line', label: 'HTML5', category: '编程开发' },
    { value: 'ri:css3-line', label: 'CSS3', category: '编程开发' },
    { value: 'ri:javascript-line', label: 'JavaScript', category: '编程开发' },
    { value: 'ri:vuejs-line', label: 'Vue', category: '编程开发' },
    { value: 'ri:reactjs-line', label: 'React', category: '编程开发' },
    { value: 'ri:nodejs-line', label: 'NodeJS', category: '编程开发' },
    { value: 'carbon:api', label: 'API', category: '编程开发' },
    { value: 'tabler:database', label: '数据库2', category: '编程开发' },
    { value: 'vscode-icons:file-type-python', label: 'Python', category: '编程开发' },
    { value: 'vscode-icons:file-type-java', label: 'Java', category: '编程开发' },

    // === 工具和设置 ===
    { value: 'ri:tools-line', label: '工具', category: '工具设置' },
    { value: 'ri:settings-3-line', label: '设置', category: '工具设置' },
    { value: 'ri:hammer-line', label: '锤子', category: '工具设置' },
    { value: 'ri:scissors-line', label: '剪刀', category: '工具设置' },
    { value: 'ri:ruler-line', label: '尺子', category: '工具设置' },
    { value: 'ri:compass-3-line', label: '指南针', category: '工具设置' },
    { value: 'ri:flashlight-line', label: '手电筒', category: '工具设置' },
    { value: 'ri:filter-3-line', label: '过滤器', category: '工具设置' },
    { value: 'ri:equalizer-line', label: '均衡器', category: '工具设置' },
    { value: 'ri:toggle-line', label: '切换', category: '工具设置' },

    // === AI和智能 ===
    { value: 'ri:robot-line', label: '机器人', category: 'AI智能' },
    { value: 'ri:cpu-line', label: 'CPU', category: 'AI智能' },
    { value: 'ri:brain-line', label: '大脑', category: 'AI智能' },
    { value: 'ri:lightbulb-line', label: '灯泡', category: 'AI智能' },
    { value: 'ri:sparkling-line', label: '闪光', category: 'AI智能' },
    { value: 'ri:magic-line', label: '魔法', category: 'AI智能' },
    { value: 'carbon:machine-learning', label: '机器学习', category: 'AI智能' },
    { value: 'tabler:robot', label: '机器人2', category: 'AI智能' },
    { value: 'lucide:brain', label: '智能', category: 'AI智能' },
    { value: 'heroicons:sparkles', label: 'AI魔法', category: 'AI智能' },

    // === 商务和金融 ===
    { value: 'ri:briefcase-line', label: '公文包', category: '商务金融' },
    { value: 'ri:bank-card-line', label: '银行卡', category: '商务金融' },
    { value: 'ri:wallet-line', label: '钱包', category: '商务金融' },
    { value: 'ri:money-dollar-circle-line', label: '美元', category: '商务金融' },
    { value: 'ri:exchange-dollar-line', label: '汇率', category: '商务金融' },
    { value: 'ri:stock-line', label: '股票', category: '商务金融' },
    { value: 'ri:funds-line', label: '基金', category: '商务金融' },
    { value: 'ri:percent-line', label: '百分比', category: '商务金融' },
    { value: 'ri:shopping-cart-line', label: '购物车', category: '商务金融' },
    { value: 'ri:shopping-bag-line', label: '购物袋', category: '商务金融' },
    { value: 'ri:store-line', label: '商店', category: '商务金融' },
    { value: 'ri:price-tag-3-line', label: '价格标签', category: '商务金融' },
    { value: 'ri:gift-line', label: '礼物', category: '商务金融' },
    { value: 'ri:coupon-line', label: '优惠券', category: '商务金融' },
    { value: 'ri:vip-crown-line', label: 'VIP', category: '商务金融' },

    // === 教育和学习 ===
    { value: 'ri:graduation-cap-line', label: '学士帽', category: '教育学习' },
    { value: 'ri:school-line', label: '学校', category: '教育学习' },
    { value: 'ri:book-read-line', label: '阅读', category: '教育学习' },
    { value: 'ri:book-2-line', label: '书本', category: '教育学习' },
    { value: 'ri:book-mark-line', label: '书签', category: '教育学习' },
    { value: 'ri:award-line', label: '奖状', category: '教育学习' },
    { value: 'ri:medal-line', label: '奖章', category: '教育学习' },
    { value: 'ri:trophy-line', label: '奖杯', category: '教育学习' },
    { value: 'carbon:education', label: '教育', category: '教育学习' },
    { value: 'tabler:certificate', label: '证书', category: '教育学习' },

    // === 生活和健康 ===
    { value: 'ri:home-line', label: '家', category: '生活健康' },
    { value: 'ri:heart-line', label: '心形', category: '生活健康' },
    { value: 'ri:heart-pulse-line', label: '心跳', category: '生活健康' },
    { value: 'ri:run-line', label: '跑步', category: '生活健康' },
    { value: 'ri:walk-line', label: '步行', category: '生活健康' },
    { value: 'ri:riding-line', label: '骑行', category: '生活健康' },
    { value: 'ri:basketball-line', label: '篮球', category: '生活健康' },
    { value: 'ri:football-line', label: '足球', category: '生活健康' },
    { value: 'ri:restaurant-line', label: '餐厅', category: '生活健康' },
    { value: 'ri:cup-line', label: '咖啡', category: '生活健康' },
    { value: 'ri:cake-3-line', label: '蛋糕', category: '生活健康' },
    { value: 'ri:plant-line', label: '植物', category: '生活健康' },
    { value: 'ri:sun-line', label: '太阳', category: '生活健康' },
    { value: 'ri:moon-line', label: '月亮', category: '生活健康' },
    { value: 'ri:umbrella-line', label: '雨伞', category: '生活健康' },

    // === 交通和旅行 ===
    { value: 'ri:map-pin-line', label: '地图标记', category: '交通旅行' },
    { value: 'ri:compass-line', label: '指南针', category: '交通旅行' },
    { value: 'ri:road-map-line', label: '路线图', category: '交通旅行' },
    { value: 'ri:car-line', label: '汽车', category: '交通旅行' },
    { value: 'ri:bus-line', label: '公交车', category: '交通旅行' },
    { value: 'ri:subway-line', label: '地铁', category: '交通旅行' },
    { value: 'ri:train-line', label: '火车', category: '交通旅行' },
    { value: 'ri:plane-line', label: '飞机', category: '交通旅行' },
    { value: 'ri:ship-line', label: '轮船', category: '交通旅行' },
    { value: 'ri:bike-line', label: '自行车', category: '交通旅行' },
    { value: 'ri:e-bike-line', label: '电动车', category: '交通旅行' },
    { value: 'ri:taxi-line', label: '出租车', category: '交通旅行' },
    { value: 'ri:luggage-cart-line', label: '行李', category: '交通旅行' },
    { value: 'ri:passport-line', label: '护照', category: '交通旅行' },
    { value: 'ri:hotel-line', label: '酒店', category: '交通旅行' },

    // === 通用图标 ===
    { value: 'ri:user-line', label: '用户', category: '通用' },
    { value: 'ri:group-line', label: '群组', category: '通用' },
    { value: 'ri:search-line', label: '搜索', category: '通用' },
    { value: 'ri:star-line', label: '星星', category: '通用' },
    { value: 'ri:flag-line', label: '旗帜', category: '通用' },
    { value: 'ri:bookmark-line', label: '书签', category: '通用' },
    { value: 'ri:calendar-line', label: '日历', category: '通用' },
    { value: 'ri:time-line', label: '时间', category: '通用' },
    { value: 'ri:alarm-line', label: '闹钟', category: '通用' },
    { value: 'ri:notification-line', label: '通知', category: '通用' },
    { value: 'ri:question-line', label: '问号', category: '通用' },
    { value: 'ri:information-line', label: '信息', category: '通用' },
    { value: 'ri:alert-line', label: '警告', category: '通用' },
    { value: 'ri:check-line', label: '勾选', category: '通用' },
    { value: 'ri:close-line', label: '关闭', category: '通用' },
    { value: 'ri:add-line', label: '添加', category: '通用' },
    { value: 'ri:subtract-line', label: '减少', category: '通用' },
    { value: 'ri:download-line', label: '下载', category: '通用' },
    { value: 'ri:upload-line', label: '上传', category: '通用' },
    { value: 'ri:share-line', label: '分享', category: '通用' },
    { value: 'ri:link', label: '链接', category: '通用' },
    { value: 'ri:attachment-line', label: '附件', category: '通用' },
    { value: 'ri:lock-line', label: '锁定', category: '通用' },
    { value: 'ri:unlock-line', label: '解锁', category: '通用' },
    { value: 'ri:eye-line', label: '查看', category: '通用' },
    { value: 'ri:eye-off-line', label: '隐藏', category: '通用' },
    { value: 'ri:thumb-up-line', label: '点赞', category: '通用' },
    { value: 'ri:thumb-down-line', label: '踩', category: '通用' },
    { value: 'ri:emotion-happy-line', label: '开心', category: '通用' },
    { value: 'ri:emotion-normal-line', label: '普通', category: '通用' },
    { value: 'ri:emotion-unhappy-line', label: '不开心', category: '通用' },
    { value: 'ri:fire-line', label: '火焰', category: '通用' },
    { value: 'ri:translate', label: '翻译', category: '通用' },
  ];

  // 图标分类
  const iconCategories = [
    '全部',
    '文档办公',
    '编辑创作',
    '通讯社交',
    '媒体娱乐',
    '数据分析',
    '编程开发',
    '工具设置',
    'AI智能',
    '商务金融',
    '教育学习',
    '生活健康',
    '交通旅行',
    '通用',
  ];

  // 图标搜索关键词
  const iconSearchKeyword = ref('');
  // 当前选中的图标分类
  const selectedIconCategory = ref('全部');

  // 根据搜索和分类过滤图标
  const iconList = computed(() => {
    let filtered = iconListData;

    // 按分类过滤
    if (selectedIconCategory.value !== '全部') {
      filtered = filtered.filter((icon) => icon.category === selectedIconCategory.value);
    }

    // 按关键词搜索
    if (iconSearchKeyword.value) {
      const keyword = iconSearchKeyword.value.toLowerCase();
      filtered = filtered.filter(
        (icon) =>
          icon.label.toLowerCase().includes(keyword) ||
          icon.value.toLowerCase().includes(keyword) ||
          icon.category.toLowerCase().includes(keyword),
      );
    }

    // 为兼容性添加 component 属性（用于显示）
    return filtered.map((icon) => ({
      ...icon,
      component: ElIcons.Document, // 使用默认组件，实际显示时会使用 iconify
    }));
  });

  // 颜色列表
  const colorList = [
    { value: 'text-blue-500', label: '蓝色', bgClass: 'bg-blue-500' },
    { value: 'text-green-500', label: '绿色', bgClass: 'bg-green-500' },
    { value: 'text-red-500', label: '红色', bgClass: 'bg-red-500' },
    { value: 'text-yellow-500', label: '黄色', bgClass: 'bg-yellow-500' },
    { value: 'text-purple-500', label: '紫色', bgClass: 'bg-purple-500' },
    { value: 'text-pink-500', label: '粉色', bgClass: 'bg-pink-500' },
    { value: 'text-orange-500', label: '橙色', bgClass: 'bg-orange-500' },
    { value: 'text-cyan-500', label: '青色', bgClass: 'bg-cyan-500' },
    { value: 'text-indigo-500', label: '靛蓝', bgClass: 'bg-indigo-500' },
    { value: 'text-teal-500', label: '青绿', bgClass: 'bg-teal-500' },
  ];

  const queryForm = reactive({
    categoryId: '',
    keyword: '',
    isEnabled: undefined as boolean | undefined,
    page: 1,
    size: 10,
  });

  const formData = reactive({
    id: 0,
    title: '',
    description: '',
    prompt: '',
    categoryId: undefined as number | undefined,
    appId: undefined as number | undefined,
    pluginParameters: '',
    icon: '',
    iconColor: '',
    order: 100,
    isEnabled: true,
  });

  const rules = reactive<FormRules>({
    title: [{ required: true, message: '请输入预设标题', trigger: 'blur' }],
    prompt: [{ required: true, message: '请输入提示词模板', trigger: 'blur' }],
    categoryId: [{ required: true, message: '请选择所属分类', trigger: 'change' }],
    order: [{ required: true, message: '请输入排序值', trigger: 'blur' }],
  });

  // 查询分类
  const queryCategories = async () => {
    try {
      const res = await api.get('preset-category', {
        params: { onlyEnabled: false },
      });
      categories.value = res.data.rows || res.data || [];
    } catch (error) {
      console.error('查询分类失败:', error);
    }
  };

  // 查询数据
  const queryData = async () => {
    loading.value = true;
    try {
      const res = await api.get('preset', {
        params: queryForm,
      });
      if (res.data) {
        tableData.value = res.data.rows || res.data || [];
        total.value = res.data.total || tableData.value.length;
      }
    } catch (error) {
      console.error('查询失败:', error);
      ElMessage.error('查询失败');
    } finally {
      loading.value = false;
    }
  };

  // 搜索应用
  const searchApps = async (keyword?: string) => {
    appLoading.value = true;
    try {
      const res = await api.get('preset/search-apps', {
        params: { keyword: keyword || '' },
      });
      appList.value = res.data || [];
    } catch (error) {
      console.error('搜索应用失败:', error);
    } finally {
      appLoading.value = false;
    }
  };

  // 应用下拉框显示时加载所有应用
  const handleAppSelectVisible = async (visible: boolean) => {
    if (visible && appList.value.length === 0) {
      await searchApps();
    }
  };

  // 搜索插件
  const searchPlugins = async (keyword?: string) => {
    pluginLoading.value = true;
    try {
      const res = await api.get('preset/search-plugins', {
        params: { keyword: keyword || '' },
      });
      pluginList.value = res.data || [];
    } catch (error) {
      console.error('搜索插件失败:', error);
    } finally {
      pluginLoading.value = false;
    }
  };

  // 插件下拉框显示时加载所有插件
  const handlePluginSelectVisible = async (visible: boolean) => {
    if (visible && pluginList.value.length === 0) {
      await searchPlugins();
    }
  };

  // 处理应用选择变化
  const handleAppChange = (appId: number) => {
    if (appId) {
      // 选择应用时，清空插件选择
      selectedPluginId.value = '';
      formData.pluginParameters = '';
    }
  };

  // 处理插件选择变化
  const handlePluginChange = (pluginId: string) => {
    if (pluginId) {
      // 选择插件时，清空应用选择
      formData.appId = undefined;

      // 设置插件参数
      const plugin = pluginList.value.find((p) => p.id === pluginId);
      if (plugin && plugin.parameters) {
        formData.pluginParameters = plugin.parameters;
      }
    }
  };

  // 清除插件
  const clearPlugin = () => {
    selectedPluginId.value = '';
    formData.pluginParameters = '';
  };

  // 处理图标搜索（防抖）
  const handleIconSearch = () => {
    // 搜索逻辑已通过 computed 实现
  };

  // 选择图标
  const selectIcon = (icon: string) => {
    formData.icon = icon;
    showIconDialog.value = false;
  };

  // AI生成预设配置
  const generatePresetWithAI = async () => {
    if (!formData.title) {
      ElMessage.warning('请先输入预设标题');
      return;
    }

    aiGenerating.value = true;
    const loadingInstance = ElLoading.service({
      text: 'AI正在生成预设配置...',
      background: 'rgba(0, 0, 0, 0.7)',
    });

    try {
      // 构建AI请求（传入当前可用的分类列表）
      const { system, messages } = buildAiGenerationMessage(formData.title, categories.value);

      // 调用系统AI接口（只传递system和messages）
      const response = await api.post('chatgpt/system-chat', { system, messages });

      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        throw new Error('AI响应格式错误');
      }

      // 获取AI生成的内容
      const aiContent = response.data.choices[0].message.content;

      // 解析AI响应
      const generatedConfig = parseAiResponse(aiContent);

      // 填充表单
      formData.description = generatedConfig.description;
      formData.prompt = beautifyPrompt(generatedConfig.prompt);

      // 查找并设置分类
      const category = categories.value.find((c) => c.name === generatedConfig.category);
      if (category) {
        formData.categoryId = category.id;
      }

      // 设置图标和颜色
      formData.icon = generatedConfig.icon;
      formData.iconColor = generatedConfig.iconColor;

      ElMessage.success('AI生成成功，已自动填充表单');
    } catch (error: any) {
      console.error('AI生成失败:', error);

      // 判断错误类型
      if (error?.response?.status === 403) {
        ElMessage.error('权限不足：需要超级管理员权限');
      } else if (error?.response?.status === 401) {
        ElMessage.error('登录已过期，请重新登录');
      } else if (error?.message?.includes('解析')) {
        ElMessage.error('AI生成的内容格式有误，请重试');
      } else {
        ElMessage.error('AI生成失败：' + (error?.message || '未知错误'));
      }
    } finally {
      aiGenerating.value = false;
      loadingInstance.close();
    }
  };

  // 获取分类名称
  const getCategoryName = (categoryId: number) => {
    const cat = categories.value.find((c) => c.id === categoryId);
    return cat ? cat.name : '-';
  };

  // 重置查询
  const handleReset = () => {
    queryForm.categoryId = '';
    queryForm.keyword = '';
    queryForm.isEnabled = undefined;
    queryForm.page = 1;
    queryData();
  };

  // 新增预设
  const handleCreate = () => {
    dialogTitle.value = '新增预设';
    formData.id = 0;
    formData.title = '';
    formData.description = '';
    formData.prompt = '';
    formData.categoryId = undefined;
    formData.appId = undefined;
    formData.pluginParameters = '';
    formData.icon = '';
    formData.iconColor = '';
    formData.order = 100;
    formData.isEnabled = true;
    appList.value = [];
    pluginList.value = [];
    selectedPluginId.value = '';
    dialogVisible.value = true;
  };

  // 编辑预设
  const handleEdit = async (row: Preset) => {
    dialogTitle.value = '编辑预设';

    // 先清空插件选择状态，避免上一个预设的插件选择影响当前预设
    selectedPluginId.value = '';

    // 逐个赋值以确保响应性
    formData.id = row.id;
    formData.title = row.title;
    formData.description = row.description;
    formData.prompt = row.prompt;
    formData.categoryId = row.categoryId;
    formData.appId = row.appId;
    formData.pluginParameters = row.pluginParameters || '';
    formData.icon = row.icon || '';
    formData.iconColor = row.iconColor || '';
    formData.order = row.order;
    formData.isEnabled = row.isEnabled;

    // 如果有关联应用，加载所有应用
    if (row.appId) {
      await searchApps();
    }

    // 如果有插件参数，尝试解析并加载插件列表
    if (row.pluginParameters) {
      try {
        const params = JSON.parse(row.pluginParameters);
        if (params.pluginId) {
          selectedPluginId.value = params.pluginId;
          await searchPlugins();
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    dialogVisible.value = true;
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!formRef.value) return;

    await formRef.value.validate(async (valid) => {
      if (valid) {
        try {
          if (formData.id) {
            await api.patch(`preset/${formData.id}`, formData);
            ElMessage.success('更新成功');
          } else {
            await api.post('preset', formData);
            ElMessage.success('创建成功');
          }
          dialogVisible.value = false;
          queryData();
        } catch (error) {
          console.error('提交失败:', error);
          ElMessage.error('提交失败');
        }
      }
    });
  };

  // 删除预设
  const handleDelete = async (row: Preset) => {
    try {
      await api.delete(`preset/${row.id}`);
      ElMessage.success('删除成功');
      queryData();
    } catch (error) {
      console.error('删除失败:', error);
      ElMessage.error('删除失败');
    }
  };

  // 状态切换
  const handleStatusChange = async (row: Preset) => {
    try {
      await api.patch(`preset/${row.id}`, { isEnabled: row.isEnabled });
      ElMessage.success('状态更新成功');
    } catch (error) {
      console.error('状态更新失败:', error);
      ElMessage.error('状态更新失败');
      row.isEnabled = !row.isEnabled;
    }
  };

  // ========== 预设分类相关 ==========
  interface PresetCategory {
    id: number;
    name: string;
    description?: string;
    order: number;
    isEnabled: boolean;
    presetCount?: number;
    createdAt: string;
    updatedAt: string;
  }

  const categoryLoading = ref(false);
  const categoryTableData = ref<PresetCategory[]>([]);
  const categoryTotal = ref(0);
  const categoryDialogVisible = ref(false);
  const categoryDialogTitle = ref('');
  const categoryFormRef = ref<FormInstance>();

  const categoryQueryForm = reactive({
    name: '',
    page: 1,
    size: 10,
  });

  const categoryFormData = reactive({
    id: 0,
    name: '',
    description: '',
    order: 100,
    isEnabled: true,
  });

  const categoryRules = reactive<FormRules>({
    name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
    order: [{ required: true, message: '请输入排序值', trigger: 'blur' }],
  });

  // 查询分类数据
  const queryCategoryData = async () => {
    categoryLoading.value = true;
    try {
      const res = await api.get('preset-category', {
        params: {
          ...categoryQueryForm,
          onlyEnabled: false,
        },
      });
      if (res.data) {
        categoryTableData.value = res.data.rows || res.data || [];
        categoryTotal.value = res.data.total || categoryTableData.value.length;
      }
    } catch (error) {
      console.error('查询失败:', error);
      ElMessage.error('查询失败');
    } finally {
      categoryLoading.value = false;
    }
  };

  // 重置分类查询
  const handleCategoryReset = () => {
    categoryQueryForm.name = '';
    categoryQueryForm.page = 1;
    queryCategoryData();
  };

  // 新增分类
  const handleCreateCategory = () => {
    categoryDialogTitle.value = '新增预设分类';
    categoryFormData.id = 0;
    categoryFormData.name = '';
    categoryFormData.order = 100;
    categoryFormData.isEnabled = true;
    categoryDialogVisible.value = true;
  };

  // 编辑分类
  const handleEditCategory = (row: PresetCategory) => {
    categoryDialogTitle.value = '编辑预设分类';
    Object.assign(categoryFormData, row);
    categoryDialogVisible.value = true;
  };

  // 提交分类表单
  const handleSubmitCategory = async () => {
    if (!categoryFormRef.value) return;

    await categoryFormRef.value.validate(async (valid) => {
      if (valid) {
        try {
          const submitData = {
            name: categoryFormData.name,
            description: categoryFormData.description,
            order: categoryFormData.order,
            isEnabled: categoryFormData.isEnabled,
          };

          if (categoryFormData.id) {
            await api.patch(`preset-category/${categoryFormData.id}`, submitData);
            ElMessage.success('更新成功');
          } else {
            await api.post('preset-category', submitData);
            ElMessage.success('创建成功');
          }
          categoryDialogVisible.value = false;
          queryCategoryData();
          // 同时刷新预设管理的分类列表
          queryCategories();
        } catch (error) {
          console.error('提交失败:', error);
          ElMessage.error('提交失败');
        }
      }
    });
  };

  // 删除分类
  const handleDeleteCategory = async (row: PresetCategory) => {
    try {
      await api.delete(`preset-category/${row.id}`);
      ElMessage.success('删除成功');
      queryCategoryData();
      // 同时刷新预设管理的分类列表
      queryCategories();
    } catch (error) {
      console.error('删除失败:', error);
      ElMessage.error('删除失败');
    }
  };

  // 分类状态切换
  const handleCategoryStatusChange = async (row: PresetCategory) => {
    try {
      await api.patch(`preset-category/${row.id}`, { isEnabled: row.isEnabled });
      ElMessage.success('状态更新成功');
    } catch (error) {
      console.error('状态更新失败:', error);
      ElMessage.error('状态更新失败');
      row.isEnabled = !row.isEnabled;
    }
  };

  // Watch tab changes
  watch(activeTab, (newTab) => {
    if (newTab === 'preset') {
      queryCategories();
      queryData();
    } else if (newTab === 'category') {
      queryCategoryData();
    }
  });

  onMounted(() => {
    if (activeTab.value === 'preset') {
      queryCategories();
      queryData();
    } else {
      queryCategoryData();
    }
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          首页预设
        </div>
      </template>
      <HButton outline @click="activeTab === 'preset' ? handleCreate() : handleCreateCategory()">
        <SvgIcon name="ic:baseline-plus" />
        {{ activeTab === 'preset' ? '新增预设' : '新增分类' }}
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <!-- 查询表单区域 -->
      <div class="mb-4">
        <!-- 预设管理查询表单 -->
        <el-form v-if="activeTab === 'preset'" ref="formRef" :inline="true" :model="queryForm">
          <el-form-item label="所属分类" prop="categoryId">
            <el-select
              v-model="queryForm.categoryId"
              placeholder="请选择分类"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="cat in categories"
                :key="cat.id"
                :label="cat.name"
                :value="cat.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="预设名称" prop="keyword">
            <el-input
              v-model="queryForm.keyword"
              placeholder="预设名称[模糊搜索]"
              clearable
              @keydown.enter.prevent="queryData"
            />
          </el-form-item>
          <el-form-item label="启用状态" prop="isEnabled">
            <el-select
              v-model="queryForm.isEnabled"
              placeholder="全部"
              clearable
              style="width: 120px"
            >
              <el-option label="启用" :value="true" />
              <el-option label="禁用" :value="false" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryData">查询</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 分类管理查询表单 -->
        <el-form
          v-if="activeTab === 'category'"
          ref="categoryFormRef"
          :inline="true"
          :model="categoryQueryForm"
        >
          <el-form-item label="分类名称" prop="name">
            <el-input
              v-model="categoryQueryForm.name"
              placeholder="分类名称[模糊搜索]"
              clearable
              @keydown.enter.prevent="queryCategoryData"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryCategoryData">查询</el-button>
            <el-button @click="handleCategoryReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- Tab 切换区域 -->
      <el-tabs v-model="activeTab">
        <el-tab-pane label="预设管理" name="preset">
          <el-table
            v-loading="loading"
            :data="tableData"
            border
            size="large"
            style="width: 100%; margin-top: 16px"
          >
            <el-table-column prop="title" label="预设标题" min-width="150" />
            <el-table-column
              prop="description"
              label="预设描述"
              min-width="200"
              show-overflow-tooltip
            />
            <el-table-column prop="category" label="所属分类" width="120" align="center">
              <template #default="{ row }">
                <el-tag type="info">{{ getCategoryName(row.categoryId) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="appId" label="关联应用" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.appId" type="success">是</el-tag>
                <el-tag v-else>否</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="order" label="排序" width="80" align="center" />
            <el-table-column prop="usageCount" label="使用次数" width="100" align="center" />
            <el-table-column prop="isEnabled" label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.isEnabled" @change="handleStatusChange(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEdit(row)"
                  >编辑</el-button
                >
                <el-popconfirm title="确定删除此预设吗？" @confirm="handleDelete(row)">
                  <template #reference>
                    <el-button link type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>

          <el-row class="mt-5 flex justify-end">
            <el-pagination
              v-model:current-page="queryForm.page"
              v-model:page-size="queryForm.size"
              class="mr-5"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="total"
              @size-change="queryData"
              @current-change="queryData"
            />
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="预设分类" name="category">
          <el-table
            v-loading="categoryLoading"
            :data="categoryTableData"
            border
            size="large"
            style="width: 100%; margin-top: 16px"
          >
            <el-table-column prop="name" label="分类名称" min-width="150" />
            <el-table-column prop="presetCount" label="预设数量" width="100" align="center">
              <template #default="{ row }">
                <el-tag type="primary">{{ row.presetCount || 0 }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="order" label="排序" width="100" align="center" />
            <el-table-column prop="isEnabled" label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.isEnabled" @change="handleCategoryStatusChange(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditCategory(row)"
                  >编辑</el-button
                >
                <el-popconfirm title="确定删除此分类吗？" @confirm="handleDeleteCategory(row)">
                  <template #reference>
                    <el-button link type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>

          <el-row class="mt-5 flex justify-end">
            <el-pagination
              v-model:current-page="categoryQueryForm.page"
              v-model:page-size="categoryQueryForm.size"
              class="mr-5"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="categoryTotal"
              @size-change="queryCategoryData"
              @current-change="queryCategoryData"
            />
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 预设管理对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="120px">
        <el-form-item label="预设标题" prop="title">
          <div class="flex gap-2 w-full">
            <el-input v-model="formData.title" placeholder="请输入预设标题" class="flex-1" />
            <el-button
              type="primary"
              :icon="MagicStick"
              :disabled="!formData.title || aiGenerating"
              :loading="aiGenerating"
              @click="generatePresetWithAI"
            >
              AI生成
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="预设描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="请输入预设描述"
          />
        </el-form-item>
        <el-form-item label="提示词模板" prop="prompt">
          <el-input
            v-model="formData.prompt"
            type="textarea"
            :rows="6"
            placeholder="支持模板语法: {{input:提示文字|默认值}}（默认值可选） 和 {{select:选项1|选项2|选项3}}"
          />
        </el-form-item>
        <el-form-item label="所属分类" prop="categoryId">
          <el-select v-model="formData.categoryId" placeholder="请选择分类" class="w-full">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联应用">
          <el-select
            v-model="formData.appId"
            placeholder="请选择应用（可搜索）"
            filterable
            clearable
            remote
            :remote-method="searchApps"
            :loading="appLoading"
            class="w-full"
            @change="handleAppChange"
            @clear="formData.appId = undefined"
            @visible-change="handleAppSelectVisible"
          >
            <el-option v-for="app in appList" :key="app.id" :label="app.name" :value="app.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联插件">
          <el-select
            v-model="selectedPluginId"
            placeholder="请选择插件（可搜索）"
            filterable
            clearable
            remote
            :remote-method="searchPlugins"
            :loading="pluginLoading"
            class="w-full"
            @change="handlePluginChange"
            @clear="clearPlugin"
            @visible-change="handlePluginSelectVisible"
          >
            <el-option
              v-for="plugin in pluginList"
              :key="plugin.id"
              :label="plugin.name"
              :value="plugin.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="插件参数" v-if="selectedPluginId">
          <el-input
            v-model="formData.pluginParameters"
            type="textarea"
            :rows="3"
            placeholder="插件参数（JSON格式）"
          />
        </el-form-item>
        <el-form-item label="图标" prop="icon">
          <div class="flex items-center gap-3 w-full">
            <div class="flex items-center gap-2">
              <!-- 图标预览 -->
              <div
                class="w-16 h-12 border-2 border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 transition-colors"
                @click="showIconDialog = true"
              >
                <Icon
                  v-if="formData.icon"
                  :icon="formData.icon"
                  :class="[formData.iconColor || 'text-gray-600', 'text-2xl']"
                />
                <span v-else class="text-gray-400 text-xs">点击选择</span>
              </div>
              <!-- 颜色选择器 -->
              <div class="flex gap-2 items-center">
                <div
                  v-for="color in colorList"
                  :key="color.value"
                  class="cursor-pointer p-0.5 rounded-full transition-all"
                  @click="formData.iconColor = color.value"
                >
                  <div
                    :class="[
                      'w-5 h-5 rounded-full transition-all',
                      color.bgClass,
                      formData.iconColor === color.value
                        ? 'ring-2 ring-gray-400 ring-offset-2'
                        : '',
                    ]"
                    :title="color.label"
                  />
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序" prop="order">
          <el-input-number v-model="formData.order" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="启用状态" prop="isEnabled">
          <el-switch v-model="formData.isEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 分类管理对话框 -->
    <el-dialog
      v-model="categoryDialogVisible"
      :title="categoryDialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="categoryFormRef"
        :model="categoryFormData"
        :rules="categoryRules"
        label-width="100px"
      >
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="categoryFormData.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序" prop="order">
          <el-input-number v-model="categoryFormData.order" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="启用状态" prop="isEnabled">
          <el-switch v-model="categoryFormData.isEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmitCategory">确定</el-button>
      </template>
    </el-dialog>

    <!-- 图标选择弹窗 -->
    <el-dialog v-model="showIconDialog" title="选择图标" width="800px" destroy-on-close>
      <div class="icon-selector">
        <!-- 搜索和分类 -->
        <div class="mb-4">
          <el-input
            v-model="iconSearchKeyword"
            placeholder="搜索图标..."
            clearable
            class="mb-3"
            @input="handleIconSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <div class="flex flex-wrap gap-2">
            <el-button
              v-for="cat in iconCategories"
              :key="cat"
              size="small"
              :type="selectedIconCategory === cat ? 'primary' : 'default'"
              @click="selectedIconCategory = cat"
            >
              {{ cat }}
            </el-button>
          </div>
        </div>

        <!-- 图标网格 -->
        <div class="icon-grid">
          <div
            v-for="icon in iconList"
            :key="icon.value"
            class="icon-item"
            :class="{ selected: formData.icon === icon.value }"
            @click="selectIcon(icon.value)"
          >
            <Icon :icon="icon.value" class="text-2xl" />
            <span class="icon-label">{{ icon.label }}</span>
          </div>
        </div>

        <div class="mt-3 text-xs text-gray-500">共 {{ iconList.length }} 个图标</div>
      </div>

      <template #footer>
        <el-button @click="showIconDialog = false">取消</el-button>
        <el-button type="primary" @click="showIconDialog = false">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
  }

  .icon-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s;
    height: 80px;
  }

  .icon-item:hover {
    background-color: #f5f7fa;
    border-color: #409eff;
  }

  .icon-item.selected {
    background-color: #f5f5f5;
    border-color: #6b7280;
    box-shadow: 0 0 0 2px rgba(107, 114, 128, 0.2);
  }

  .icon-label {
    font-size: 12px;
    margin-top: 5px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
</style>
