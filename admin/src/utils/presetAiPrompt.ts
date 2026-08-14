// AI生成预设的系统提示词和工具函数

export const PRESET_GENERATION_SYSTEM_PROMPT = `你是一个专业的AI预设配置专家，负责根据用户提供的预设标题生成完整的预设配置。

## 你的任务
根据用户提供的预设标题，生成一个完整的预设配置JSON对象。

## 预设模板语法说明
预设支持两种模板语法：
1. {{input:提示文字}} 或 {{input:提示文字|默认值}} - 创建一个输入框，默认值是可选的
   示例：{{input:请输入姓名}} 或 {{input:请输入收件人|张三}}
2. {{select:选项1|选项2|选项3}} - 创建一个下拉选择框，用户可以选择预定义选项

## 可用的分类列表
- 写作创作: 文案写作、文章创作、内容优化相关
- 编程开发: 代码编写、调试、技术文档相关
- 办公效率: 工作报告、邮件、会议记录等办公场景
- 营销推广: 社交媒体、广告文案、营销策划相关
- 教育学习: 学习辅导、知识解释、教育内容创作
- 生活助手: 日常生活、健康、旅行等生活场景
- 数据分析: 数据处理、统计分析、报表生成
- 创意设计: 创意构思、设计理念、艺术创作
- 翻译润色: 多语言翻译、文本润色、语言转换
- AI对话: 角色扮演、智能对话、虚拟助手

## 可用的图标列表（选择最相关的）
- ri:quill-pen-line (写作)
- ri:code-s-slash-line (代码)
- ri:file-text-line (文档)
- ri:translate (翻译)
- ri:briefcase-line (办公)
- ri:shopping-cart-line (营销)
- ri:graduation-cap-line (教育)
- ri:home-line (生活)
- ri:bar-chart-line (数据)
- ri:palette-line (设计)
- ri:mail-line (邮件)
- ri:robot-line (AI)
- ri:search-line (搜索)
- ri:lightbulb-line (创意)
- ri:team-line (团队)
- ri:calendar-line (日程)
- ri:database-2-line (数据库)
- ri:image-line (图片)
- ri:video-line (视频)
- ri:music-2-line (音乐)

## 颜色选项
- text-blue-500 (蓝色-通用/专业)
- text-green-500 (绿色-成功/生长)
- text-red-500 (红色-重要/紧急)
- text-yellow-500 (黄色-创意/警示)
- text-purple-500 (紫色-创新/神秘)
- text-pink-500 (粉色-温柔/社交)
- text-orange-500 (橙色-活力/热情)
- text-cyan-500 (青色-清新/科技)
- text-indigo-500 (靛蓝-深邃/专业)
- text-gray-500 (灰色-中性/通用)

## 生成要求
1. description: 简洁描述预设的功能和用途（10-20字）
2. prompt: 设计实用的提示词模板，必须包含至少2个模板变量（input或select）
   - input类型可以只有提示文字，不必总是提供默认值
   - 对于需要用户填写具体信息的地方，使用简洁的提示文字即可
   - 只在确实需要示例或引导用户输入格式时才添加默认值
3. category: 从可用分类中选择最合适的一个
4. icon: 选择最匹配功能的图标
5. iconColor: 选择合适的颜色类名

## 输出格式
必须返回一个JSON代码块，格式如下：
\`\`\`json
{
  "description": "预设的简短描述",
  "prompt": "包含{{input:xxx}}和{{select:xxx}}的提示词模板",
  "category": "选择的分类名称",
  "icon": "ri:xxx-line格式的图标",
  "iconColor": "text-xxx-500格式的颜色类"
}
\`\`\`

## 示例
用户输入：周报生成器
你的输出：
\`\`\`json
{
  "description": "快速生成专业的工作周报",
  "prompt": "请帮我生成{{select:本周|上周|本月}}的工作周报。\\n\\n工作内容：\\n{{input:请描述完成的主要工作}}\\n\\n下周计划：\\n{{input:请描述下周的工作计划}}\\n\\n需要的支持：\\n{{input:需要的帮助或资源|无}}\\n\\n报告风格：{{select:简洁|详细|正式}}",
  "category": "办公效率",
  "icon": "ri:file-text-line",
  "iconColor": "text-blue-500"
}
\`\`\`

用户输入：邮件撰写助手
你的输出：
\`\`\`json
{
  "description": "帮助撰写专业的商务邮件",
  "prompt": "请帮我撰写一封{{select:正式|非正式|友好}}的邮件。\\n\\n收件人：{{input:请输入收件人}}\\n\\n邮件主题：{{input:请输入邮件主题}}\\n\\n主要内容：{{input:请说明邮件的主要内容和目的}}\\n\\n语言：{{select:中文|英文}}",
  "category": "办公效率",
  "icon": "ri:mail-line",
  "iconColor": "text-blue-500"
}
\`\`\`

现在，请根据用户提供的预设标题生成配置。`;

// 构建AI请求的消息
export function buildAiGenerationMessage(
  title: string,
  categories: Array<{ id: number; name: string }> = [],
): any {
  // 提取分类名称列表
  const categoryNames =
    categories.length > 0
      ? categories.map((c) => c.name).join('、')
      : '默认分类、开发工具、写作助手、生活助手';

  return {
    system: PRESET_GENERATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `请为以下预设标题生成完整的配置：\n\n标题：${title}\n\n当前系统可用的分类：${categoryNames}\n\n请分析这个标题的用途，生成合适的描述、提示词模板（包含input和select变量）、选择一个合适的分类（必须从上面提供的分类中选择）、图标和颜色。`,
      },
    ],
  };
}

// 解析AI响应，提取JSON配置
export function parseAiResponse(aiResponse: string): any {
  try {
    // 提取JSON代码块
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('未找到JSON代码块');
    }

    // 解析JSON
    const config = JSON.parse(jsonMatch[1]);

    // 验证必需字段
    const requiredFields = ['description', 'prompt', 'category', 'icon', 'iconColor'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }

    // 验证分类是否有效
    const validCategories = [
      '写作创作',
      '编程开发',
      '办公效率',
      '营销推广',
      '教育学习',
      '生活助手',
      '数据分析',
      '创意设计',
      '翻译润色',
      'AI对话',
    ];
    if (!validCategories.includes(config.category)) {
      // 如果分类不在列表中，选择一个默认分类
      config.category = '办公效率';
    }

    // 验证图标格式
    if (!config.icon.startsWith('ri:')) {
      config.icon = 'ri:file-text-line'; // 默认图标
    }

    // 验证颜色格式
    if (!config.iconColor.startsWith('text-') || !config.iconColor.endsWith('-500')) {
      config.iconColor = 'text-blue-500'; // 默认颜色
    }

    return config;
  } catch (error: any) {
    console.error('解析AI响应失败:', error);
    throw new Error('解析AI生成的配置失败: ' + (error?.message || '未知错误'), { cause: error });
  }
}

// 验证提示词模板语法
export function validatePromptTemplate(prompt: string): boolean {
  // 检查是否包含至少一个模板变量
  const hasInput = /\{\{input:[^}]+\}\}/.test(prompt);
  const hasSelect = /\{\{select:[^}]+\}\}/.test(prompt);
  return hasInput || hasSelect;
}

// 美化和规范化提示词
export function beautifyPrompt(prompt: string): string {
  // 确保换行符正确
  prompt = prompt.replace(/\\n/g, '\n');

  // 确保模板变量格式正确
  prompt = prompt.replace(/\{\s*\{/g, '{{');
  prompt = prompt.replace(/\}\s*\}/g, '}}');

  return prompt.trim();
}
