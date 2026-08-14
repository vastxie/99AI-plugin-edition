<template>
  <div class="chart-container">
    <Pie :data="chartData" :options="chartOptions" :style="{ height: height + 'px' }" />
  </div>
</template>

<script setup lang="ts">
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { computed } from 'vue'
import { Pie } from 'vue-chartjs'

ChartJS.register(Title, Tooltip, Legend, ArcElement)

interface Props {
  data: Array<{ label: string; value: number }>
  title?: string
  height?: number
  colors?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
  colors: () => ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'],
})

const chartData = computed<ChartData<'pie'>>(() => ({
  labels: props.data.map(item => item.label),
  datasets: [
    {
      data: props.data.map(item => item.value),
      backgroundColor: props.colors,
      borderColor: '#ffffff',
      borderWidth: 2,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'pie'>>(() => ({
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
      display: true,
      position: 'bottom',
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
