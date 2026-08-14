<route lang="yaml">
name: home
meta:
  title: 主页
</route>

<script lang="ts" setup>
  import apiDashboard from '@/api/modules/dashboard';
  import useSettingsStore from '@/store/modules/settings';
  import * as echarts from 'echarts';
  // import { ElNotification } from 'element-plus';
  import {
    ChatDotRound,
    Headset,
    Picture,
    ShoppingCart,
    TrendCharts,
    User,
    VideoPlay,
  } from '@element-plus/icons-vue';
  import { marked } from 'marked';
  import ResizeObserver from 'resize-observer-polyfill';
  import { computed, nextTick, onBeforeMount, onMounted, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  // 导入CHANGELOG.md文件内容
  import changelogMd from '@/assets/CHANGELOG.md?raw';

  const settingsStore = useSettingsStore();
  const router = useRouter();

  const colorScheme = computed(() => {
    return settingsStore.settings.app.colorScheme;
  });

  const { pkg } = __SYSTEM_INFO__;

  // 处理更新日志内容
  const changelogHtml = computed(() => {
    return marked(changelogMd);
  });

  // 提取最新的几个版本更新（用于主页显示）
  const latestUpdates = computed(() => {
    const lines = changelogMd.split('\n');
    const updates = [];
    let currentVersion = '';
    let currentContent = [];
    let inStableSection = false;
    let inPluginSection = false;

    for (let i = 0; i < lines.length && updates.length < 3; i++) {
      const line = lines[i];

      // 检测稳定版或插件版标题
      if (line.includes('## 稳定版 v') || line.includes('## 插件版 v')) {
        // 保存前一个版本
        if (currentVersion && currentContent.length > 0) {
          updates.push({
            version: currentVersion,
            content: currentContent.slice(0, 8).join('\n'), // 只取前8行内容
            isStable: currentVersion.includes('稳定版'),
          });
        }

        currentVersion = line.replace('## ', '');
        currentContent = [];
        inStableSection = line.includes('稳定版');
        inPluginSection = line.includes('插件版');
      } else if (
        currentVersion &&
        (inStableSection || inPluginSection) &&
        line.trim() &&
        !line.startsWith('```') &&
        !line.includes('</details>')
      ) {
        // 收集版本内容，跳过空行和过长的代码块
        currentContent.push(line);
      }
    }

    // 添加最后一个版本
    if (currentVersion && currentContent.length > 0 && updates.length < 3) {
      updates.push({
        version: currentVersion,
        content: currentContent.slice(0, 8).join('\n'),
        isStable: currentVersion.includes('稳定版'),
      });
    }

    return updates;
  });

  const baseInfo = ref({
    userCount: 0,
    newUserCount: 0,
    chatCount: 0,
    newChatCount: 0,
    drawCount: 0,
    newDrawCount: 0,
    videoCount: 0,
    newVideoCount: 0,
    musicCount: 0,
    newMusicCount: 0,
    orderCount: 0,
    newOrderCount: 0,
  });
  interface ApiDashboard {
    getBaseInfo: () => Promise<any>;
    getBaiduVisit: (params: any) => Promise<any>;
    getChatStatistic: (params: any) => Promise<any>;
    getObserverCharts: (params: any) => Promise<any>;
  }

  let charCharts: echarts.ECharts;
  let baiduCharts: echarts.ECharts;
  let orderCharts: echarts.ECharts;
  let observer: ResizeObserver;
  const chatDays = ref(30);
  const baiduDays = ref(30);
  const orderDays = ref(30);
  const activeTab = ref('chat');

  const chatChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['对话数量', '绘画数量', '视频数量', '音乐数量'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: true,
        data: [],
        splitLine: {
          show: true,
          lineStyle: {
            color: ['#ffffff1a'],
            width: 1,
            type: 'solid',
          },
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: {
          show: true,
          lineStyle: {
            width: 1,
            color: ['#ffffff1a'],
            type: 'solid',
          },
        },
      },
    ],
    series: [
      {
        name: '对话数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '绘画数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '视频数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(168, 85, 247, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '音乐数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(251, 146, 60, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
    ],
  };

  const baiduVisitChartsOption: any = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['pv', 'uv', 'ip'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: [],
      splitLine: {
        show: true,
        lineStyle: {
          // 分隔线样式
          color: ['#ffffff1a'],
          width: 1,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: true,
        lineStyle: {
          width: 1,
          color: ['#ffffff1a'],
          type: 'solid',
        },
      },
    },
    series: [
      {
        name: 'pv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'uv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'ip',
        type: 'bar',
        itemStyle: {
          color: 'rgba(255, 193, 7, 0.8)',
        },
        data: [],
      },
    ],
  };

  const orderChartsOption: any = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['订单数量', '订单金额'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: [],
      splitLine: {
        show: true,
        lineStyle: {
          color: ['#ffffff1a'],
          width: 1,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: true,
        lineStyle: {
          width: 1,
          color: ['#ffffff1a'],
          type: 'solid',
        },
      },
    },
    series: [
      {
        name: '订单数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)', // 蓝色，与对话统计风格一致
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '订单金额',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)', // 青色，与对话统计风格一致
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
    ],
  };

  const daysList = [
    {
      label: 7,
      value: '最近七天',
    },
    {
      label: 15,
      value: '最近半月',
    },
    {
      label: 30,
      value: '最近一月',
    },
    {
      label: 90,
      value: '最近三月',
    },
  ];

  async function getBaseInfo() {
    const res = await apiDashboard.getBaseInfo();
    baseInfo.value = res.data;
  }

  async function getBaiduVisitInfo() {
    try {
      const res = await apiDashboard.getBaiduVisit({ days: baiduDays.value });

      const { data } = res;

      // 处理不同格式的返回数据
      let items = null;

      // 如果 data 直接是数组
      if (Array.isArray(data)) {
        items = data;
      }
      // 如果 data.items 是数组
      else if (data && data.items && Array.isArray(data.items)) {
        items = data.items;
      }
      // 如果 data 有其他格式，尝试提取有用的数据
      else if (data && typeof data === 'object') {
        // 尝试查找可能的数据字段
        if (data.result && Array.isArray(data.result)) {
          items = data.result;
        } else if (data.body && data.body.data && Array.isArray(data.body.data)) {
          items = data.body.data;
        }
      }

      // 检查数据是否存在且格式正确
      if (!items || !Array.isArray(items) || items.length === 0) {
        // 静默处理：设置默认空数据，不输出日志
        baiduVisitChartsOption.xAxis.data = [];
        baiduVisitChartsOption.series.forEach((item: any) => {
          item.data = [];
        });
      } else if (items.length < 2) {
        // 静默处理：如果只有一个数组，设置空数据
        baiduVisitChartsOption.xAxis.data = [];
        baiduVisitChartsOption.series.forEach((item: any) => {
          item.data = [];
        });
      } else {
        // 安全地处理数据
        if (items[0] && Array.isArray(items[0])) {
          baiduVisitChartsOption.xAxis.data = items[0].map((t: Array<{}>) => {
            return Array.isArray(t) && t[0] ? t[0] : '';
          });
        } else {
          baiduVisitChartsOption.xAxis.data = [];
        }

        if (items[1] && Array.isArray(items[1])) {
          baiduVisitChartsOption.series.forEach((item: any, index: number) => {
            item.data = items[1].map((t: Array<{}>) => {
              return Array.isArray(t) && t[index] !== undefined ? t[index] : 0;
            });
          });
        } else {
          baiduVisitChartsOption.series.forEach((item: any) => {
            item.data = [];
          });
        }
      }

      // 确保DOM完全渲染后再初始化图表
      await nextTick();

      // 延迟执行以确保DOM尺寸正确
      setTimeout(() => {
        const chartDom = document.getElementById('baidu') as HTMLElement;
        if (chartDom && chartDom.offsetWidth > 0 && chartDom.offsetHeight > 0) {
          if (baiduCharts) {
            baiduCharts.dispose();
          }
          baiduCharts = echarts.init(chartDom);
          baiduCharts.setOption(baiduVisitChartsOption);

          // 再次延迟调用resize以确保图表正确渲染
          setTimeout(() => {
            if (baiduCharts) {
              baiduCharts.resize();
            }
          }, 200);
        } else {
          // 静默处理：如果容器还没有尺寸，再等一会儿重试
          setTimeout(() => {
            const retryDom = document.getElementById('baidu') as HTMLElement;
            if (retryDom && retryDom.offsetWidth > 0 && retryDom.offsetHeight > 0) {
              if (baiduCharts) {
                baiduCharts.dispose();
              }
              baiduCharts = echarts.init(retryDom);
              baiduCharts.setOption(baiduVisitChartsOption);
              baiduCharts.resize();
            }
          }, 500);
        }
      }, 100);
    } catch (error) {
      console.error('获取百度统计信息失败:', error);
      // 设置空数据避免图表错误
      baiduVisitChartsOption.xAxis.data = [];
      baiduVisitChartsOption.series.forEach((item: any) => {
        item.data = [];
      });
    }
  }

  async function getChatStatisticInfo() {
    const res = await apiDashboard.getChatStatistic({ days: chatDays.value });
    const { date, chat, draw, video, music } = res.data;
    chatChartsOption.xAxis[0].data = date;
    chatChartsOption.series[0].data = chat;
    chatChartsOption.series[1].data = draw;
    chatChartsOption.series[2].data = video;
    chatChartsOption.series[3].data = music;

    await nextTick();
    const chartDom = document.getElementById('chat') as HTMLElement;
    if (charCharts) {
      charCharts.dispose();
    }
    charCharts = echarts.init(chartDom);
    charCharts.setOption(chatChartsOption);
    setTimeout(() => {
      charCharts.resize();
    }, 100);
  }

  async function getOrderStatisticInfo() {
    try {
      const res = await apiDashboard.getOrderStatistic({ days: orderDays.value });
      const { date, orderCount, orderAmount } = res.data;
      orderChartsOption.xAxis.data = date;
      orderChartsOption.series[0].data = orderCount;
      orderChartsOption.series[1].data = orderAmount;

      await nextTick();
      const chartDom = document.getElementById('order') as HTMLElement;
      if (chartDom && chartDom.offsetWidth > 0 && chartDom.offsetHeight > 0) {
        if (orderCharts) {
          orderCharts.dispose();
        }
        orderCharts = echarts.init(chartDom);
        orderCharts.setOption(orderChartsOption);
        setTimeout(() => {
          orderCharts.resize();
        }, 100);
      }
    } catch (error) {
      console.error('获取订单统计信息失败:', error);
      // 设置空数据避免图表错误
      orderChartsOption.xAxis.data = [];
      orderChartsOption.series.forEach((item: any) => {
        item.data = [];
      });
    }
  }

  watch(colorScheme, () => {
    changeColorScheme();
  });

  function changeColorScheme() {
    const currentColorScheme = settingsStore.settings.app.colorScheme;
    const lineColor = currentColorScheme === 'dark' ? ['#ffffff1a'] : ['#0000001a'];
    chatChartsOption.yAxis[0].splitLine.lineStyle.color = lineColor;
    chatChartsOption.xAxis[0].splitLine.lineStyle.color = lineColor;
    if (charCharts) {
      charCharts.setOption(chatChartsOption);
    }
    baiduVisitChartsOption.yAxis.splitLine.lineStyle.color = lineColor;
    baiduVisitChartsOption.xAxis.splitLine.lineStyle.color = lineColor;
    if (baiduCharts) {
      baiduCharts.setOption(baiduVisitChartsOption);
    }
    orderChartsOption.yAxis.splitLine.lineStyle.color = lineColor;
    orderChartsOption.xAxis.splitLine.lineStyle.color = lineColor;
    if (orderCharts) {
      orderCharts.setOption(orderChartsOption);
    }
  }

  function handleTabChange(tabName: string | number) {
    activeTab.value = tabName as string;
    // 切换tab时重新查询数据并调整图表大小
    if (tabName === 'chat') {
      getChatStatisticInfo();
    } else if (tabName === 'visitor') {
      getBaiduVisitInfo();
    } else if (tabName === 'order') {
      getOrderStatisticInfo();
    }
  }

  onMounted(async () => {
    await getBaseInfo();
    await Promise.all([getChatStatisticInfo(), getBaiduVisitInfo(), getOrderStatisticInfo()]);
    changeColorScheme();
    // 添加通知
    // const h = document.createElement.bind(document);
    // ElNotification({
    //   title: '配置迁移提醒',
    //   message:
    //     '除对话页外的其他页面将不再维护。专业绘画、思维导图等页面的配置已移至其他设置中。',
    //   type: 'info',
    //   duration: 15000,
    // });
  });

  onMounted(() => {
    observer = new ResizeObserver(() => {
      if (charCharts) {
        charCharts.resize();
      }
      if (baiduCharts) {
        baiduCharts.resize();
      }
      if (orderCharts) {
        orderCharts.resize();
      }
    });
    const chatElm = document.getElementById('chat');
    if (chatElm) {
      observer?.observe(chatElm);
    }
    const baiduElm = document.getElementById('baidu');
    if (baiduElm) {
      observer?.observe(baiduElm);
    }
    const orderElm = document.getElementById('order');
    if (orderElm) {
      observer?.observe(orderElm);
    }
  });

  onBeforeMount(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<template>
  <div class="p-4 h-[90vh] overflow-hidden">
    <!-- 主要内容区域 -->
    <div class="flex gap-5 h-full">
      <!-- 左侧：更新日志 -->
      <div class="flex-1 flex flex-col gap-4 min-w-0">
        <!-- 更新日志 -->
        <div
          class="flex-[4] bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden"
        >
          <div
            class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
          >
            <span class="text-base font-semibold text-gray-800 dark:text-gray-200">更新日志</span>
            <span
              class="text-xs text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded"
              >{{ pkg.version }}</span
            >
          </div>
          <div
            class="flex-1 p-5 overflow-y-auto overflow-x-hidden markdown-body hide-h1"
            v-html="changelogHtml"
          ></div>
        </div>
      </div>

      <!-- 右侧：统计数据 + 图表 -->
      <div class="flex-[2] flex flex-col gap-4 min-w-0">
        <!-- 统计卡片 -->
        <div class="grid grid-cols-3 grid-rows-2 gap-4 h-55">
          <!-- 第一行：新增用户、订单、对话 -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-indigo-500 to-purple-600"
            >
              <el-icon><User /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日新增用户</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo?.newUserCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.userCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-green-400 to-teal-400"
            >
              <el-icon><ShoppingCart /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日订单</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newOrderCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.orderCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-blue-500 to-indigo-600"
            >
              <el-icon><ChatDotRound /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日对话</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newChatCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.chatCount || 0 }}
              </div>
            </div>
          </div>

          <!-- 第二行：绘画、视频、音乐 -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-blue-400 to-cyan-400"
            >
              <el-icon><Picture /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日绘画</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newDrawCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.drawCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-purple-400 to-pink-500"
            >
              <el-icon><VideoPlay /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日视频</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newVideoCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.videoCount || 0 }}
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-orange-400 to-yellow-500"
            >
              <el-icon><Headset /></el-icon>
            </div>
            <div class="flex-1">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">今日音乐</div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-0.5">
                {{ baseInfo.newMusicCount || 0 }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500">
                总计: {{ baseInfo.musicCount || 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div
          class="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden"
        >
          <div
            class="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
          >
            <el-tabs v-model="activeTab" @tab-change="handleTabChange">
              <el-tab-pane label="对话统计" name="chat">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><ChatDotRound /></el-icon>
                    <span>对话统计</span>
                  </div>
                </template>
              </el-tab-pane>
              <el-tab-pane label="访客统计" name="visitor">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><TrendCharts /></el-icon>
                    <span>访客统计</span>
                  </div>
                </template>
              </el-tab-pane>
              <el-tab-pane label="订单统计" name="order">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><ShoppingCart /></el-icon>
                    <span>订单统计</span>
                  </div>
                </template>
              </el-tab-pane>
            </el-tabs>

            <el-radio-group
              v-if="activeTab === 'chat'"
              v-model="chatDays"
              @change="getChatStatisticInfo"
              size="small"
            >
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>

            <el-radio-group
              v-else-if="activeTab === 'visitor'"
              v-model="baiduDays"
              @change="getBaiduVisitInfo"
              size="small"
            >
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>

            <el-radio-group
              v-else-if="activeTab === 'order'"
              v-model="orderDays"
              @change="getOrderStatisticInfo"
              size="small"
            >
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="flex-1 p-5 relative">
            <div id="chat" class="w-full h-full" v-show="activeTab === 'chat'" />
            <div id="baidu" class="w-full h-full" v-show="activeTab === 'visitor'" />
            <div id="order" class="w-full h-full" v-show="activeTab === 'order'" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* Tab样式优化 - 移除Tab之间的间距 */
  :deep(.el-tabs__nav) {
    gap: 0 !important;
  }

  :deep(.el-tabs__item) {
    margin-right: 0 !important;
    padding: 0 !important;
  }

  /* Markdown样式 */
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
  }

  /* 隐藏顶级标题 */
  .hide-h1 :deep(h1:first-child) {
    display: none;
  }

  .markdown-body :deep(h1) {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 12px;
    margin-top: 16px;
  }

  .markdown-body :deep(h2) {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
    margin-top: 16px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e0e0e0;
  }

  .markdown-body :deep(h3) {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    margin-top: 12px;
  }

  .markdown-body :deep(ul) {
    list-style-type: disc;
    padding-left: 16px;
    margin-bottom: 12px;
  }

  .markdown-body :deep(p) {
    margin-bottom: 12px;
  }

  .markdown-body :deep(code) {
    background: #f5f5f5;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .markdown-body :deep(pre) {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow-x: auto;
  }

  .markdown-body :deep(a) {
    color: #1890ff;
    text-decoration: none;
  }

  .markdown-body :deep(a:hover) {
    text-decoration: underline;
  }

  /* 暗色模式下的markdown样式 */
  :deep(.dark) .markdown-body {
    color: #d1d5db;
  }

  :deep(.dark) .markdown-body :deep(h2) {
    border-bottom-color: #4b5563;
  }

  :deep(.dark) .markdown-body :deep(code),
  :deep(.dark) .markdown-body :deep(pre) {
    background: #374151;
  }
</style>
