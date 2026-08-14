<template>
  <div class="chart-container">
    <Bar :data="chartData" :options="chartOptions" :style="{ height: height + 'px' }" />
  </div>
</template>

<script setup lang="ts">
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

interface Props {
  data: Array<{ label: string; value: number }>
  title?: string
  height?: number
  colors?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
  colors: () => ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'],
})

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.data.map(item => item.label),
  datasets: [
    {
      label: props.title || '数据',
      data: props.data.map(item => item.value),
      backgroundColor: props.colors,
      borderColor: props.colors,
      borderWidth: 1,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
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
