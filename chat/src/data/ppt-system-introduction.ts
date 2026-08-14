/**
 * PPT系统介绍演示文档
 * 详细介绍PPT系统的实现逻辑、支持的模板和使用方法
 */

import type { SlideLayout } from '@/types/ppt-grid'

export const pptSystemIntroductionSlides: SlideLayout[] = [
  // 1. 封面
  {
    id: 'slide-1',
    title: '封面',
    template: 'cover',
    content: {
      title: 'AI智能PPT生成系统',
      subtitle: '基于Vue3 + TypeScript的现代化演示文档解决方案',
      author: '99AI Plugin Edition contributors',
      date: new Date().toLocaleDateString('zh-CN'),
    },
  },

  // 2. 目录
  {
    id: 'slide-2',
    title: '目录',
    template: 'contents',
    content: {
      title: '内容概览',
      items: [
        '系统架构概述',
        '核心技术栈',
        '模板系统设计',
        '布局引擎实现',
        '9大核心模板详解',
        '动态内容生成',
        'PPT导出功能',
        '使用指南与最佳实践',
      ],
    },
  },

  // 3. 系统架构章节页
  {
    id: 'slide-3',
    title: '系统架构',
    template: 'chapter',
    content: {
      chapterNumber: '第一章',
      chapterTitle: '系统架构概述',
    },
  },

  // 4. 系统架构图
  {
    id: 'slide-4',
    title: '系统架构',
    template: 'multi-column',
    content: {
      title: '系统整体架构',
      columns: [
        {
          title: '前端展示层',
          items: ['Vue 3 响应式UI', 'TypeScript 类型安全', 'Tailwind CSS 样式系统', '实时预览组件'],
        },
        {
          title: '核心业务层',
          items: ['模板布局引擎', '动态内容生成器', '栅格系统计算', 'AI内容优化'],
        },
        {
          title: '导出服务层',
          items: ['PptxGenJS 引擎', '字体智能检测', '图表数据转换', '多格式支持'],
        },
      ],
    },
  },

  // 5. 核心技术栈
  {
    id: 'slide-5',
    title: '技术栈',
    template: 'multi-column',
    content: {
      title: '核心技术栈',
      columns: [
        {
          title: '前端框架',
          text: `• Vue 3.4+ Composition API
• TypeScript 5.0+ 严格模式
• Vite 5.0 构建工具
• Pinia 状态管理

使用最新的Vue 3生态系统，确保代码的可维护性和开发效率。`,
        },
        {
          title: '样式方案',
          text: `• Tailwind CSS 3.0
• PostCSS 自动处理
• 响应式设计
• 暗色模式支持

原子化CSS确保样式的一致性和可复用性。`,
        },
        {
          title: '核心依赖',
          text: `• PptxGenJS 3.12
• Chart.js 图表渲染
• Mermaid 流程图
• Markdown 解析

专业的第三方库保证功能的稳定性。`,
        },
      ],
    },
  },

  // 6. 模板系统章节页
  {
    id: 'slide-6',
    title: '模板系统',
    template: 'chapter',
    content: {
      chapterNumber: '第二章',
      chapterTitle: '模板系统设计',
    },
  },

  // 7. 类型定义展示
  {
    id: 'slide-7',
    title: '类型系统',
    template: 'multi-column',
    content: {
      title: '核心类型定义',
      columns: [
        {
          title: 'SlideTemplate 类型',
          text: `\`\`\`typescript
export type SlideTemplate =
  | 'cover'          // 封面
  | 'chapter'        // 章节页
  | 'contents'       // 目录页
  | 'multi-column'   // 多栏页
  | 'timeline-horizontal' // 时间轴
  | 'quote'          // 引言页
  | 'qa'             // 问答页
  | 'team'           // 团队页
  | 'thank-you'      // 致谢页
\`\`\``,
        },
        {
          title: 'ElementType 类型',
          text: `\`\`\`typescript
export type ElementType =
  | 'title'    // 标题
  | 'subtitle' // 副标题
  | 'text'     // 文本
  | 'image'    // 图片
  | 'chart'    // 图表
  | 'list'     // 列表
  | 'timeline' // 时间线
  | 'quote'    // 引言
  | 'qa'       // 问答
  | 'team'     // 团队
\`\`\``,
        },
      ],
    },
  },

  // 8. 布局引擎实现
  {
    id: 'slide-8',
    title: '布局引擎',
    template: 'multi-column',
    content: {
      title: '模板布局引擎核心实现',
      columns: [
        {
          title: '栅格系统',
          text: `基于12列栅格系统：
• 列宽自适应计算
• 行高灵活配置
• 响应式断点支持
• 自动间距处理

\`\`\`typescript
const columnWidth = 
  (contentWidth - gap * (cols - 1)) 
  / columns
\`\`\``,
        },
        {
          title: '位置计算算法',
          text: `精确的像素级定位：
• 元素坐标计算
• 尺寸自动适配
• 内边距处理
• 对齐方式支持

\`\`\`typescript
element.x = padding + 
  col * (columnWidth + gap)
element.y = padding + 
  row * (rowHeight + gap)
\`\`\``,
        },
      ],
    },
  },

  // 9. 布局引擎代码示例
  {
    id: 'slide-9',
    title: '布局引擎代码',
    template: 'multi-column',
    content: {
      title: 'TemplateLayoutEngine 核心代码',
      columns: [
        {
          text: `\`\`\`typescript
export class TemplateLayoutEngine {
  private config = {
    columns: 12,
    rows: 6,
    gap: 16,
    padding: 32,
  }

  layout(slide: SlideLayout): CalculatedLayout {
    const template = slide.template
    const content = slide.content
    
    // 特殊处理multi-column模板
    if (template === 'multi-column') {
      return this.layoutMultiColumn(slide)
    }
    
    const templateConfig = 
      TEMPLATE_LAYOUTS[template]
    
    // 根据模板配置生成元素
    const elements = 
      this.generateElements(templateConfig, content)
    
    // 计算实际像素位置
    return this.calculatePixelPositions(
      elements, templateConfig
    )
  }
}
\`\`\``,
        },
      ],
    },
  },

  // 10. 模板详解章节页
  {
    id: 'slide-10',
    title: '模板详解',
    template: 'chapter',
    content: {
      chapterNumber: '第三章',
      chapterTitle: '9大核心模板详解',
    },
  },

  // 11. 基础模板介绍
  {
    id: 'slide-11',
    title: '基础模板',
    template: 'multi-column',
    content: {
      title: '基础模板类型',
      columns: [
        {
          title: '1. 封面模板 (cover)',
          text: `用于演示文稿的开始页面
• 大标题展示
• 副标题说明
• 作者和日期信息
• 居中对齐布局

适用场景：
演示开始、项目介绍`,
        },
        {
          title: '2. 章节页 (chapter)',
          text: `用于内容分隔和导航
• 章节编号
• 章节标题
• 简洁明了
• 视觉过渡

适用场景：
内容分组、主题切换`,
        },
        {
          title: '3. 目录页 (contents)',
          text: `展示内容结构
• 标题展示
• 编号列表
• 可选配图
• 清晰导航

适用场景：
内容概览、议程安排`,
        },
      ],
    },
  },

  // 12. 万能多栏模板
  {
    id: 'slide-12',
    title: '多栏模板',
    template: 'multi-column',
    content: {
      title: '万能多栏模板 (multi-column)',
      columns: [
        {
          title: '设计理念',
          text: `融合8种布局需求：
• title-content
• two-column
• three-column
• comparison
• image-right
• image-left
• data-chart
• multi-chart

一个模板满足所有排版需求！`,
        },
        {
          title: '使用示例',
          text: `\`\`\`typescript
{
  template: 'multi-column',
  content: {
    title: '页面标题',
    columns: [
      {
        title: '栏标题',
        text: '文本内容',
        // 或
        items: ['项目1', '项目2'],
        // 或
        image: { src: '...', alt: '...' },
        // 或
        chart: { type: 'bar', data: {...} }
      }
    ]
  }
}
\`\`\``,
        },
      ],
    },
  },

  // 13. 特殊模板介绍
  {
    id: 'slide-13',
    title: '特殊模板',
    template: 'timeline-horizontal',
    content: {
      title: '时间轴模板示例',
      timeline: [
        {
          date: '2024.01',
          title: '项目启动',
          description: '完成需求分析和技术选型',
        },
        {
          date: '2024.03',
          title: '原型开发',
          description: '实现核心功能模块',
        },
        {
          date: '2024.06',
          title: '系统优化',
          description: '性能优化和用户体验提升',
          milestone: true,
        },
        {
          date: '2024.09',
          title: '正式发布',
          description: '产品上线和推广',
          milestone: true,
        },
      ],
    },
  },

  // 14. 引言模板示例
  {
    id: 'slide-14',
    title: '引言模板',
    template: 'quote',
    content: {
      quote: '优秀的设计不是让事物看起来更美，而是让它们工作得更好。',
      author: 'Steve Jobs',
    },
  },

  // 15. 问答模板示例
  {
    id: 'slide-15',
    title: '问答模板',
    template: 'qa',
    content: {
      title: '问答模板示例',
      question: '为什么选择这个PPT系统？',
      answer: `1. 智能化：AI辅助内容生成，提高效率
2. 专业化：9大精心设计的模板，满足各种场景
3. 现代化：基于最新技术栈，性能优异
4. 易用性：简单的API，清晰的文档
5. 可扩展：模块化设计，易于定制`,
      showAnswer: true,
    },
  },

  // 16. 团队模板示例
  {
    id: 'slide-16',
    title: '团队模板',
    template: 'team',
    content: {
      title: '核心开发团队',
      members: [
        {
          name: '张三',
          role: '技术负责人',
          description: '10年前端开发经验',
        },
        {
          name: '李四',
          role: 'UI/UX设计师',
          description: '专注用户体验设计',
        },
        {
          name: '王五',
          role: '全栈工程师',
          description: 'Vue生态专家',
        },
      ],
    },
  },

  // 17. 动态内容生成章节页
  {
    id: 'slide-17',
    title: '动态内容',
    template: 'chapter',
    content: {
      chapterNumber: '第四章',
      chapterTitle: '动态内容生成',
    },
  },

  // 18. AI内容生成
  {
    id: 'slide-18',
    title: 'AI内容生成',
    template: 'multi-column',
    content: {
      title: 'AI驱动的内容生成',
      columns: [
        {
          title: '智能填充',
          text: `系统可以根据用户输入的主题，自动生成：
• 大纲结构
• 详细内容
• 配图建议
• 数据图表

让PPT制作更加高效！`,
        },
        {
          title: '内容优化',
          text: `AI辅助优化：
• 文字精炼
• 排版美化
• 配色方案
• 动画建议

确保演示效果专业！`,
        },
        {
          title: '多语言支持',
          text: `国际化能力：
• 中英文切换
• 自动翻译
• 本地化适配
• 文化差异处理

满足全球化需求！`,
        },
      ],
    },
  },

  // 19. PPT导出章节页
  {
    id: 'slide-19',
    title: 'PPT导出',
    template: 'chapter',
    content: {
      chapterNumber: '第五章',
      chapterTitle: 'PPT导出功能',
    },
  },

  // 20. 导出功能介绍
  {
    id: 'slide-20',
    title: '导出功能',
    template: 'multi-column',
    content: {
      title: 'PPT导出核心功能',
      columns: [
        {
          title: '智能字体检测',
          text: `\`\`\`typescript
private detectBestFont(): string {
  const platform = 
    navigator.platform.toLowerCase()
    
  if (platform.includes('mac')) {
    return 'PingFang SC'
  }
  
  if (platform.includes('win')) {
    return 'Microsoft YaHei'
  }
  
  return 'Arial'
}
\`\`\`

自动选择最佳系统字体！`,
        },
        {
          title: '图表转换',
          text: `Chart.js → PptxGenJS：
• 数据格式转换
• 样式映射
• 图例处理
• 降级方案

\`\`\`typescript
const chartData = [{
  name: dataset.label,
  labels: labels,
  values: values
}]

slide.addChart(type, chartData, {
  showLegend: true,
  showTitle: true
})
\`\`\``,
        },
      ],
    },
  },

  // 21. 导出流程
  {
    id: 'slide-21',
    title: '导出流程',
    template: 'multi-column',
    content: {
      title: 'PPT导出完整流程',
      columns: [
        {
          title: '1. 数据准备',
          items: ['收集所有幻灯片数据', '验证内容完整性', '处理特殊字符', '优化图片资源'],
        },
        {
          title: '2. 样式转换',
          items: ['CSS样式映射', '字体大小适配', '颜色值转换', '布局重新计算'],
        },
        {
          title: '3. 生成输出',
          items: ['创建PPTX文件', '添加元数据', '压缩优化', '触发下载'],
        },
      ],
    },
  },

  // 22. 使用指南章节页
  {
    id: 'slide-22',
    title: '使用指南',
    template: 'chapter',
    content: {
      chapterNumber: '第六章',
      chapterTitle: '使用指南与最佳实践',
    },
  },

  // 23. 基础使用
  {
    id: 'slide-23',
    title: '基础使用',
    template: 'multi-column',
    content: {
      title: '快速上手指南',
      columns: [
        {
          title: '1. 创建幻灯片数据',
          text: `\`\`\`typescript
const slides: SlideLayout[] = [
  {
    id: 'slide-1',
    template: 'cover',
    content: {
      title: '我的演示',
      subtitle: '副标题',
      author: '作者名',
      date: '2024-01-20'
    }
  }
]
\`\`\``,
        },
        {
          title: '2. 预览和编辑',
          text: `\`\`\`vue
<template>
  <PptGridPreviewer
    :ppt-data="{
      id: 'my-ppt',
      title: '演示标题',
      slides: slides
    }"
    editable
    @update="handleUpdate"
  />
</template>
\`\`\``,
        },
        {
          title: '3. 导出PPT',
          text: `\`\`\`typescript
import { exportToPptx } from '@/utils/ppt-export'

// 导出为PPTX文件
await exportToPptx(
  slides, 
  '演示标题',
  'PingFang SC' // 可选字体
)

// 文件将自动下载
\`\`\``,
        },
      ],
    },
  },

  // 24. 高级功能
  {
    id: 'slide-24',
    title: '高级功能',
    template: 'multi-column',
    content: {
      title: '高级功能与技巧',
      columns: [
        {
          title: '动态数据绑定',
          text: `支持响应式数据：
\`\`\`typescript
const slideData = reactive({
  title: computed(() => 
    store.presentationTitle
  ),
  content: computed(() => 
    generateContent(topic)
  )
})
\`\`\`

实时更新预览！`,
        },
        {
          title: '自定义模板',
          text: `扩展模板系统：
\`\`\`typescript
// 1. 定义布局配置
TEMPLATE_LAYOUTS['custom'] = {
  elements: [...]
}

// 2. 实现渲染逻辑
createCustomSlide(slide, content)

// 3. 注册到系统
registerTemplate('custom', config)
\`\`\``,
        },
        {
          title: '批量操作',
          text: `高效的批量处理：
\`\`\`typescript
// 批量更新样式
slides.forEach(slide => {
  updateSlideTheme(slide, 'dark')
})

// 批量导出
const promises = batches.map(
  batch => exportToPptx(batch)
)
await Promise.all(promises)
\`\`\``,
        },
      ],
    },
  },

  // 25. 最佳实践
  {
    id: 'slide-25',
    title: '最佳实践',
    template: 'multi-column',
    content: {
      title: '最佳实践建议',
      columns: [
        {
          title: '内容组织',
          items: [
            '保持简洁：每页7±2个要点',
            '层次分明：使用章节分隔',
            '逻辑清晰：遵循金字塔原理',
            '视觉平衡：图文合理搭配',
          ],
        },
        {
          title: '性能优化',
          items: [
            '图片优化：使用WebP格式',
            '懒加载：按需加载资源',
            '缓存策略：复用计算结果',
            '批量处理：减少重复渲染',
          ],
        },
        {
          title: '用户体验',
          items: [
            '即时预览：所见即所得',
            '快捷操作：键盘快捷键',
            '撤销重做：操作可逆',
            '自动保存：防止数据丢失',
          ],
        },
      ],
    },
  },

  // 26. 常见问题
  {
    id: 'slide-26',
    title: '常见问题',
    template: 'qa',
    content: {
      title: '常见问题',
      question: '如何处理大量图片的PPT？',
      answer: `1. 图片压缩：导出前自动压缩图片到合适大小
2. 懒加载：预览时只加载可见区域的图片
3. CDN加速：使用CDN存储和分发图片资源
4. 格式优化：自动转换为WebP等现代格式
5. 缓存策略：浏览器缓存 + 服务端缓存

系统会自动处理这些优化，用户无需担心性能问题。`,
      showAnswer: true,
    },
  },

  // 27. 性能优化
  {
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
              labels: ['首次加载', '切换页面', '导出PPT', '图片处理'],
              datasets: [
                {
                  label: '优化前 (ms)',
                  data: [3200, 450, 8500, 1200],
                  backgroundColor: '#EF4444',
                },
                {
                  label: '优化后 (ms)',
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
  },

  // 28. 未来规划
  {
    id: 'slide-28',
    title: '未来规划',
    template: 'timeline-horizontal',
    content: {
      title: '产品发展路线图',
      timeline: [
        {
          date: '2024 Q1',
          title: '基础功能完善',
          description: '核心模板、导出功能',
        },
        {
          date: '2024 Q2',
          title: 'AI能力增强',
          description: '智能内容生成、优化建议',
          milestone: true,
        },
        {
          date: '2024 Q3',
          title: '协作功能',
          description: '多人编辑、评论系统',
        },
        {
          date: '2024 Q4',
          title: '生态建设',
          description: '插件系统、模板市场',
          milestone: true,
        },
      ],
    },
  },

  // 29. 技术总结
  {
    id: 'slide-29',
    title: '技术总结',
    template: 'multi-column',
    content: {
      title: '技术实现总结',
      columns: [
        {
          title: '架构设计',
          text: `• 模块化：功能解耦，易于维护
• 组件化：复用性高，开发效率高
• 类型安全：TypeScript全覆盖
• 响应式：Vue 3 Composition API

清晰的架构是项目成功的基础。`,
        },
        {
          title: '核心创新',
          text: `• 统一模板系统：9大模板覆盖全场景
• 智能布局引擎：自动计算最优排版
• 字体自适应：跨平台最佳体验
• AI集成：内容生成与优化

技术创新带来更好的用户体验。`,
        },
        {
          title: '工程实践',
          text: `• 自动化测试：单元测试 + E2E测试
• CI/CD：自动构建和部署
• 代码规范：ESLint + Prettier
• 文档完善：注释 + 使用文档

良好的工程实践确保项目质量。`,
        },
      ],
    },
  },

  // 30. 致谢页
  {
    id: 'slide-30',
    title: '致谢',
    template: 'thank-you',
    content: {
      title: '谢谢观看！',
      contact: '感谢使用 99AI Plugin Edition',
    },
  },
]

// 导出函数
export function getPPTSystemIntroduction() {
  return {
    id: 'ppt-system-intro',
    title: 'AI智能PPT生成系统介绍',
    description: '详细介绍PPT系统的实现逻辑、支持的模板和使用方法',
    author: '99AI Plugin Edition contributors',
    slides: pptSystemIntroductionSlides,
    createdAt: new Date().toISOString(),
  }
}
