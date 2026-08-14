<template>
  <div class="chart-container">
    <Line :data="chartData" :options="chartOptions" :style="{ height: height + 'px' }" />
  </div>
</template>

<script setup lang="ts">
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { computed } from 'vue'
import { Line } from 'vue-chartjs'

ChartJS.register(Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement)

interface Props {
  data: Array<{ label: string; value: number }>
  title?: string
  height?: number
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
  color: '#3b82f6',
})

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.data.map(item => item.label),
  datasets: [
    {
      label: props.title || '数据',
      data: props.data.map(item => item.value),
      borderColor: props.color,
      backgroundColor: props.color + '20',
      borderWidth: 3,
      fill: true,
      tension: 0.4,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    title: {
      display: !!props.title,
      text: props.title,
      font: {
        size: 16,
        weight: 'bold',
      },
    },
    legend: {
      display: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
    },
  },
}))
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
