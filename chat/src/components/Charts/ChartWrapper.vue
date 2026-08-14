<template>
  <div class="chart-wrapper h-full w-full">
    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  LineController,
  BarController,
  PieController,
  DoughnutController,
  type ChartConfiguration,
} from 'chart.js'

// 注册所有需要的组件和控制器
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  LineController,
  BarController,
  PieController,
  DoughnutController
)

interface Props {
  type: 'line' | 'bar' | 'pie' | 'doughnut'
  data: any
  options?: any
}

const props = defineProps<Props>()
const chartCanvas = ref<HTMLCanvasElement>()
let chartInstance: ChartJS | null = null

const createChart = () => {
  if (!chartCanvas.value) return

  // 销毁旧实例
  if (chartInstance) {
    chartInstance.destroy()
  }

  const config: ChartConfiguration = {
    type: props.type as any,
    data: props.data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...props.options,
    },
  }

  chartInstance = new ChartJS(chartCanvas.value, config)
}

onMounted(() => {
  createChart()
})

watch(
  () => [props.type, props.data],
  () => {
    createChart()
  }
)

// 清理
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<style scoped>
.chart-wrapper {
  position: relative;
}
</style>
