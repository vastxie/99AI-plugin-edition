/**
 * AI 应用优化工具函数
 * 用于通过AI优化应用的名称、描述、预设和提问模板
 */

// 系统提示词 - 专门用于应用优化
export const APP_OPTIMIZATION_SYSTEM_PROMPT = `你是一个专业的AI应用配置优化专家。你的任务是帮助优化现有的应用配置，使其更加专业、实用和吸引人。

优化原则：
1. **保持原意**：在原有内容基础上进行优化和完善，不要完全改变应用的核心功能
2. **专业表达**：使用专业、简洁、清晰的语言
3. **实用性**：确保预设内容能够真正帮助用户更好地使用AI
4. **完整性**：提供完整的优化方案，包括名称、描述、预设和提问模板

关于提问模板格式：
- 提问模板使用JSON数组格式
- 每个字段支持两种类型：
  - input: 文本输入框，格式为 {"type": "input", "title": "字段名称", "placeholder": "输入提示"}
  - select: 下拉选择框，格式为 {"type": "select", "title": "字段名称", "placeholder": "选择提示", "options": ["选项1", "选项2"]}
- 根据应用特点设计3-5个实用的模板字段
- 字段名称要简洁明了，提示文字要清晰具体

输出要求：
请严格按照以下JSON格式输出，不要添加任何其他内容：

\`\`\`json
{
  "name": "优化后的应用名称（简洁、专业、有吸引力）",
  "description": "优化后的应用描述（50-100字，说明应用用途和特点）",
  "preset": "优化后的预设内容（300-500字，详细的角色设定和任务说明，帮助AI理解如何扮演这个角色）",
  "prompt": [
    {
      "type": "input",
      "title": "字段1名称",
      "placeholder": "输入提示1"
    },
    {
      "type": "select",
      "title": "字段2名称",
      "placeholder": "选择提示",
      "options": ["选项1", "选项2", "选项3"]
    }
  ]
}
\`\`\`

注意：
1. 必须返回完整的JSON对象
2. prompt必须是数组格式
3. 所有字段都必须填写
4. 确保JSON格式正确，可以被解析`;

/**
 * 构建AI优化请求消息
 * @param existingApp 现有的应用数据
 * @returns AI请求的system和messages
 */
export function buildAppOptimizationMessage(existingApp: {
  name?: string;
  des?: string;
  preset?: string;
  prompt?: string;
}): any {
  // 构建用户消息，包含现有的应用信息
  let userMessage = '请优化以下应用配置：\n\n';

  if (existingApp.name) {
    userMessage += `**当前应用名称**：${existingApp.name}\n\n`;
  }

  if (existingApp.des) {
    userMessage += `**当前应用描述**：${existingApp.des}\n\n`;
  }

  if (existingApp.preset) {
    userMessage += `**当前应用预设**：${existingApp.preset}\n\n`;
  }

  if (existingApp.prompt) {
    userMessage += `**当前提问模板**：${existingApp.prompt}\n\n`;
  }

  userMessage += `请基于以上信息，生成优化后的完整应用配置，包括：
1. 优化后的应用名称（更简洁专业）
2. 优化后的应用描述（更吸引人）
3. 优化后的预设内容（更详细专业）
4. 优化后的提问模板（JSON数组格式，包含3-5个实用字段）

请严格按照JSON格式输出结果。`;

  return {
    system: APP_OPTIMIZATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  };
}

/**
 * 解析AI响应并提取优化后的应用配置
 * @param aiResponse AI返回的响应文本
 * @returns 解析后的应用配置对象
 */
export function parseAppOptimizationResponse(aiResponse: string): any {
  try {
    // 提取JSON代码块
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('未找到JSON代码块，请确保AI返回了正确格式的数据');
    }

    // 解析JSON
    const config = JSON.parse(jsonMatch[1]);

    // 验证必需字段
    const requiredFields = ['name', 'description', 'preset', 'prompt'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }

    // 验证prompt字段是数组
    if (!Array.isArray(config.prompt)) {
      throw new Error('prompt字段必须是数组格式');
    }

    // 验证prompt数组中的字段格式
    if (config.prompt.length > 0) {
      for (const field of config.prompt) {
        if (!field.type || !field.title || !field.placeholder) {
          throw new Error('prompt数组中的字段格式不正确，必须包含type、title和placeholder');
        }
        if (field.type !== 'input' && field.type !== 'select') {
          throw new Error('prompt字段的type只能是input或select');
        }
        if (field.type === 'select' && !Array.isArray(field.options)) {
          throw new Error('select类型的字段必须包含options数组');
        }
      }
    }

    return config;
  } catch (error: any) {
    throw new Error('解析AI生成的配置失败: ' + (error?.message || '未知错误'), { cause: error });
  }
}

/**
 * 美化提问模板JSON
 * @param promptArray 提问模板数组
 * @returns 格式化后的JSON字符串
 */
export function beautifyPromptTemplate(promptArray: any[]): string {
  try {
    return JSON.stringify(promptArray, null, 2);
  } catch (error) {
    console.error('美化提问模板失败:', error);
    return JSON.stringify(promptArray);
  }
}
