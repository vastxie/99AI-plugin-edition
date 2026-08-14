/**
 * PPT系统介绍演示文档（国际化版本）
 * 详细介绍PPT系统的实现逻辑、支持的模板和使用方法
 */

import type { SlideLayout } from '@/types/ppt-grid'
import i18n from '@/locales'

export function getPPTSystemIntroductionI18n(): SlideLayout[] {
  // 使用 i18n.global.t 来确保获取最新的翻译
  const t = i18n.global.t
  // 获取第27张幻灯片（性能优化对比）
  const performanceSlide: SlideLayout = {
    id: 'slide-27',
    title: '性能优化',
    template: 'multi-column',
    content: {
      title: '性能优化效果对比',
      columns: [
        {
          title: '性能优化效果',
          chart: {
            type: 'bar',
            title: '优化前后性能对比',
            data: {
              labels: [
                t('ppt.optimization.firstLoad'),
                t('ppt.optimization.switchPage'),
                t('ppt.optimization.exportPPT'),
                t('ppt.optimization.imageProcessing'),
              ],
              datasets: [
                {
                  label: `${t('ppt.optimization.before')} (ms)`,
                  data: [3200, 450, 8500, 1200],
                  backgroundColor: '#EF4444',
                },
                {
                  label: `${t('ppt.optimization.after')} (ms)`,
                  data: [1100, 120, 3200, 400],
                  backgroundColor: '#10B981',
                },
              ],
            },
          },
        },
        {
          title: '优化成果',
          text: `通过一系列优化措施，系统性能得到显著提升：
• 首次加载时间减少66%
• 页面切换速度提升73%
• PPT导出速度提升62%
• 图片处理效率提升67%`,
        },
      ],
    },
  }

  // 这里只返回第27张幻灯片作为示例
  // 实际使用时，应该将所有幻灯片都进行国际化处理
  return [performanceSlide]
}

// 导入原始数据
import { getPPTSystemIntroduction } from './ppt-system-introduction'

// 获取完整的PPT数据（包含国际化的第27张幻灯片）
export function getPPTSystemIntroductionWithI18n() {
  const originalData = getPPTSystemIntroduction()

  // 获取国际化的第27张幻灯片
  const i18nSlides = getPPTSystemIntroductionI18n()
  const performanceSlide = i18nSlides[0]

  // 替换原始数据中的第27张幻灯片
  const slides = [...originalData.slides]
  const slideIndex = slides.findIndex(slide => slide.id === 'slide-27')
  if (slideIndex !== -1) {
    slides[slideIndex] = performanceSlide
  }

  return {
    ...originalData,
    slides,
  }
}
