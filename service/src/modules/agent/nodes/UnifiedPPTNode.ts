import { Injectable, Logger } from '@nestjs/common';
import { ModelsService } from '../../models/models.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';
import { AgentUpdateType } from '../core/AgentContent.types';
import OpenAI from 'openai';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';

/**
 * 统一PPT节点 - 整合主题生成和完整PPT生成功能
 * 作为工具执行的一部分，数据保存到toolExecutions中
 */
@Injectable()
export class UnifiedPPTNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'unified_ppt',
    type: 'unified_ppt',
    name: '统一PPT生成节点',
    description: '整合PPT主题生成和完整PPT生成功能',
    version: '1.0.0',
    supportStream: false,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    protected readonly modelsService: ModelsService,
  ) {
    super(globalConfigService, modelsService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    Logger.log('开始执行统一PPT节点', 'UnifiedPPTNode');

    // 获取PPT生成模式和相关参数
    let mode = input.config.mode;
    // 如果是auto模式或未指定模式，则自动判断
    if (mode === 'auto' || !mode) {
      mode = this.determinePPTMode(input);
    }

    const selectedTheme = input.context.state?.selectedTheme;
    const pptOutline = input.context.state?.pptOutline;
    const userMessage = input.messages[input.messages.length - 1]?.content || '';

    Logger.log(
      `PPT生成模式: ${mode}, 用户输入: ${userMessage.substring(0, 100)}`,
      'UnifiedPPTNode',
    );

    try {
      let result: any;
      let toolExecution: any;

      switch (mode) {
        case 'theme':
          // 生成主题选项
          result = await this.generateThemes(input, userMessage);
          toolExecution = this.createThemeToolExecution(result);
          break;

        case 'outline':
          // 生成大纲
          result = await this.generateOutline(input, selectedTheme, userMessage);
          toolExecution = this.createOutlineToolExecution(result);
          break;

        case 'complete':
          // 生成完整PPT
          result = await this.generateCompletePPT(input, pptOutline || selectedTheme, userMessage);
          toolExecution = this.createCompleteToolExecution(result);
          break;

        default:
          throw new Error(`未知的PPT生成模式: ${mode}`);
      }

      // 发送工具执行更新
      this.sendToolExecutionUpdate(input, toolExecution);

      // 返回成功结果
      return {
        result: {
          success: true,
          data: {
            ...result,
            skipRemainingNodes: true, // 跳过后续节点（思考、LLM等）
          },
        },
        stateUpdates: {
          pptResult: result,
          pptMode: mode,
        },
        // 保存到agentData的toolExecutions中
        agentDataUpdates: {
          toolExecutions: [toolExecution],
        },
      };
    } catch (error) {
      Logger.error(`PPT生成失败: ${error.message}`, 'UnifiedPPTNode');

      const errorToolExecution = {
        id: `ppt-error-${Date.now()}`,
        type: 'ppt',
        name: 'PPT生成',
        status: 'failed' as const,
        error: error.message,
        timestamp: Date.now(),
      };

      // 发送错误状态
      this.sendToolExecutionUpdate(input, errorToolExecution);

      return {
        result: {
          success: false,
          error: error.message,
        },
        agentDataUpdates: {
          toolExecutions: [errorToolExecution],
        },
      };
    }
  }

  /**
   * 判断PPT生成模式
   */
  private determinePPTMode(input: NodeInput): string {
    // 如果已经有大纲，生成完整PPT
    if (input.context.state?.pptOutline) {
      return 'complete';
    }
    // 如果已经选择了主题且action是generate_ppt_from_theme，直接生成完整PPT
    if (
      input.context.state?.selectedTheme &&
      input.context.state?.action === 'generate_ppt_from_theme'
    ) {
      return 'complete'; // 直接生成完整PPT
    }
    // 如果只是选择了主题（其他情况），生成大纲
    if (input.context.state?.selectedTheme) {
      return 'outline';
    }
    // 否则生成主题选项
    return 'theme';
  }

  /**
   * 生成PPT主题选项 - 两步式生成
   */
  private async generateThemes(input: NodeInput, userMessage: string): Promise<any> {
    Logger.log('🎨 开始生成PPT主题选项（两步式）...', 'UnifiedPPTNode');
    const modelConfig = await this.getModelConfig(input.context.options?.model || 'gpt-4o-mini');

    // 发送状态更新 - 第一步
    this.sendStatusUpdate(input.context, {
      type: 'ppt_themes',
      message: '正在快速生成PPT主题标题...',
    });

    // Step 1: 快速生成5个简单的主题标题
    Logger.log('📝 第一步：快速生成主题标题...', 'UnifiedPPTNode');
    const titleSystemPrompt = `你是一个专业的PPT主题策划专家。请根据用户的需求，快速生成5个简洁的PPT主题标题。

要求：
1. 只需要标题，不需要描述
2. 每个标题要有明确的方向和重点
3. 主题之间要有差异性，覆盖不同的角度
4. 标题要吸引人且专业

重要：必须返回严格的JSON格式，确保格式完全正确。

返回格式示例：
{
  "titles": [
    "标题1",
    "标题2",
    "标题3",
    "标题4",
    "标题5"
  ]
}

注意：
- 不要使用markdown代码块包裹JSON
- 确保所有引号都正确配对
- 数组最后一个元素后面不要有逗号
- 直接返回JSON对象，不要有任何额外内容`;

    const titleUserPrompt = `用户需求：${userMessage}\n\n请生成5个PPT主题标题，直接返回JSON格式。`;

    const openai = new OpenAI({
      apiKey: modelConfig.key,
      baseURL: await correctApiBaseUrl(modelConfig.proxyUrl || ''),
      timeout: 120000,
    });

    // 生成标题
    const titleCompletion = await openai.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: titleSystemPrompt },
        { role: 'user', content: titleUserPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500, // 标题很短，不需要太多token
    });

    const titleResponseContent = titleCompletion.choices[0].message.content || '';
    const titleData = this.parseJSONFromMarkdown(titleResponseContent);
    const titles = titleData.titles || [];

    // 记录 token 使用量
    await this.recordTokenUsage(
      input,
      titleSystemPrompt + titleUserPrompt,
      titleResponseContent,
      'PPT主题标题生成',
      titleCompletion.usage,
    );

    Logger.log(`✅ 第一步完成，生成了 ${titles.length} 个主题标题`, 'UnifiedPPTNode');
    titles.forEach((title, index) => {
      Logger.log(`  ${index + 1}. ${title}`, 'UnifiedPPTNode');
    });

    // Step 2: 并发生成每个主题的描述和关键词
    Logger.log('📝 第二步：并发生成主题详情...', 'UnifiedPPTNode');

    // 发送状态更新 - 第二步
    this.sendStatusUpdate(input.context, {
      type: 'ppt_themes',
      message: `正在为 ${titles.length} 个主题生成详细描述...`,
    });

    const detailPromises = titles.map(async (title: string, index: number) => {
      const detailSystemPrompt = `你是一个专业的PPT内容规划专家。为给定的PPT主题标题生成详细描述和关键词。

要求：
1. 描述要简洁明了，说明该主题的核心内容和适用场景（50-100字）
2. 提供3-5个相关关键词
3. 内容要专业、实用

返回JSON格式：
\`\`\`json
{
  "description": "详细描述",
  "keywords": ["关键词1", "关键词2", "关键词3"]
}
\`\`\``;

      const detailUserPrompt = `PPT主题标题：${title}\n用户原始需求：${userMessage}\n\n请为这个主题生成详细描述和关键词。`;

      try {
        const detailCompletion = await openai.chat.completions.create({
          model: modelConfig.model,
          messages: [
            { role: 'system', content: detailSystemPrompt },
            { role: 'user', content: detailUserPrompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });

        const detailContent = detailCompletion.choices[0].message.content || '';
        const detailData = this.parseJSONFromMarkdown(detailContent);

        // 记录 token 使用量
        await this.recordTokenUsage(
          input,
          detailSystemPrompt + detailUserPrompt,
          detailContent,
          'PPT主题详情生成',
          detailCompletion.usage,
        );

        Logger.log(`  ✓ 主题 ${index + 1} 详情生成完成`, 'UnifiedPPTNode');

        return {
          title,
          description: detailData.description || '专业的PPT演示方案',
          keywords: detailData.keywords || [],
        };
      } catch (error) {
        Logger.warn(`  ⚠ 主题 ${index + 1} 详情生成失败，使用默认值`, 'UnifiedPPTNode');
        return {
          title,
          description: '专业的PPT演示方案',
          keywords: [],
        };
      }
    });

    // 等待所有详情生成完成
    const themes = await Promise.all(detailPromises);

    // 组装最终结果
    const result = {
      title: `关于"${userMessage}"的PPT主题选项`,
      subtitle: '请选择一个最适合您需求的主题',
      themes,
    };

    Logger.log(`✅ 主题生成完成，共生成 ${themes.length} 个完整主题`, 'UnifiedPPTNode');
    themes.forEach((theme, index) => {
      Logger.log(`  ${index + 1}. ${theme.title}`, 'UnifiedPPTNode');
      Logger.log(`     描述: ${theme.description.substring(0, 30)}...`, 'UnifiedPPTNode');
      Logger.log(`     关键词: ${theme.keywords.join(', ')}`, 'UnifiedPPTNode');
    });

    return result;
  }

  /**
   * 生成PPT大纲
   */
  private async generateOutline(
    input: NodeInput,
    selectedTheme: any,
    userMessage: string,
  ): Promise<any> {
    Logger.log('📝 开始生成PPT大纲...', 'UnifiedPPTNode');
    Logger.log(`  主题: ${selectedTheme.title || selectedTheme}`, 'UnifiedPPTNode');

    // 发送状态更新
    this.sendStatusUpdate(input.context, {
      type: 'ppt_outline',
      message: '正在根据选定主题生成PPT大纲...',
    });

    const modelConfig = await this.getModelConfig(input.context.options?.model || 'gpt-4o-mini');

    let systemPrompt = `你是一个专业的PPT内容策划专家。请根据选定的主题生成详细的PPT大纲。

重要提醒：
1. 必须生成有效的JSON格式
2. 不要使用省略号(...)来代替内容
3. 所有字符串必须用双引号包围
4. 数组和对象的最后一个元素后面不要加逗号
5. 不要在数组或对象后面加空字符串 "" (如 ],"" 是错误的)
6. 确保所有的括号都正确闭合
7. 不要在JSON中使用注释
8. 每个字符串都必须完整，不要中途截断

要求：
1. 大纲要结构清晰，逻辑流畅
2. 为每页选择最合适的模板类型，并提供该页的详细内容规划
3. 页数控制在8-15页之间
4. 每页的content字段要包含该模板所需的具体内容结构
5. 将生成的JSON放在markdown代码块中

支持的模板类型及其内容结构：

1. cover（封面页）:
   content: { title, subtitle, author, date }

2. chapter（章节页）:
   content: { chapterNumber, chapterTitle }
   
3. contents（目录页）:
   content: { title, items: ["项目1", "项目2"] }
   
4. multi-column（万能多栏页）:
   content: {
     title,
     columns: [
       { title, type: "list", items: ["要点1", "要点2"] },
       { title, type: "text", text: "文本内容" },
       { title, type: "chart", chartType: "bar/pie/line", dataDescription: "数据描述" }
     ]
   }
   
5. timeline-horizontal（时间轴）:
   content: {
     title,
     timeline: [
       { date, title, description, milestone: true/false }
     ]
   }
   
6. quote（引用页）:
   content: { quote, author }
   
7. qa（问答页）:
   content: { title, question, answer, showAnswer: true }
   
8. team（团队介绍）:
   content: {
     title,
     members: [
       { name, role, description }
     ]
   }
   
9. thank-you（致谢页）:
   content: { title, subtitle, contact }

格式要求：
\`\`\`json
{
  "title": "演示文稿标题",
  "subtitle": "副标题",
  "author": "作者",
  "date": "2025-01-20",
  "outline": [
    {
      "slideNumber": 1,
      "id": "slide-1",
      "template": "cover",
      "content": {
        "title": "具体标题",
        "subtitle": "具体副标题",
        "author": "作者名",
        "date": "日期"
      }
    },
    {
      "slideNumber": 2,
      "id": "slide-2", 
      "template": "contents",
      "content": {
        "title": "目录",
        "items": ["第一部分：XXX", "第二部分：YYY", "第三部分：ZZZ"]
      }
    },
    {
      "slideNumber": 3,
      "id": "slide-3",
      "template": "multi-column",
      "content": {
        "title": "主要内容",
        "columns": [
          {
            "title": "核心要点",
            "type": "list",
            "items": ["要点一：具体内容", "要点二：具体内容", "要点三：具体内容"]
          }
        ]
      }
    }
  ]
}
\`\`\`

注意：
1. 每页都要有完整的content结构，包含该模板所需的所有字段
2. 内容要具体、详细，不要使用占位符
3. 第一页必须是cover模板，最后一页应该是thank-you模板
4. 中间根据内容需要选择合适的模板`;

    const userPrompt = `选定的主题：${JSON.stringify(
      selectedTheme,
    )}\n\n请为这个主题生成详细的PPT大纲。`;

    const openai = new OpenAI({
      apiKey: modelConfig.key,
      baseURL: await correctApiBaseUrl(modelConfig.proxyUrl || ''),
      timeout: 120000, // 增加到120秒，适应PPT生成需要,
    });

    // 尝试生成，如果JSON解析失败则重试
    let outline;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const completion = await openai.chat.completions.create({
          model: modelConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: retryCount === 0 ? 0.7 : 0.5, // 重试时降低温度
          max_tokens: 8000, // 充分的token限制，避免截断（大纲通常需要3000-5000 tokens）
        });

        const responseContent = completion.choices[0].message.content || '';
        outline = this.parseJSONFromMarkdown(responseContent);

        // 验证大纲格式
        if (!outline.outline || !Array.isArray(outline.outline)) {
          throw new Error('大纲格式不正确：缺少outline数组');
        }

        // 记录 token 使用量
        await this.recordTokenUsage(
          input,
          systemPrompt + userPrompt,
          responseContent,
          'PPT大纲生成',
          completion.usage,
        );

        break; // 成功，跳出循环
      } catch (error) {
        retryCount++;
        Logger.warn(`大纲生成第${retryCount}次尝试失败: ${error.message}`, 'UnifiedPPTNode');

        if (retryCount > maxRetries) {
          // 最终失败，返回默认大纲
          Logger.error('大纲生成最终失败，使用默认大纲', 'UnifiedPPTNode');
          outline = this.getDefaultOutline(selectedTheme, userMessage);
          break;
        }

        // 修改提示词，强调JSON格式
        if (retryCount === 1) {
          systemPrompt =
            systemPrompt +
            '\n\n重要：请确保生成的JSON格式完全正确，特别注意逗号、引号和括号的配对。';
        }
      }
    }

    // 记录大纲信息
    const outlineCount = outline.outline?.length || 0;
    Logger.log(`✅ 大纲生成完成，共 ${outlineCount} 个章节`, 'UnifiedPPTNode');

    // 记录每个章节
    if (outline.outline && outline.outline.length > 0) {
      Logger.log('📋 大纲结构：', 'UnifiedPPTNode');
      outline.outline.forEach((item, index) => {
        Logger.log(
          `  第${item.slideNumber}页: [${item.template}] ${
            item.content?.title || item.title || ''
          }`,
          'UnifiedPPTNode',
        );
        // 根据模板类型显示关键内容
        if (item.template === 'multi-column' && item.content?.columns) {
          item.content.columns.forEach(col => {
            Logger.log(`     - ${col.title || '栏目'}: ${col.type}`, 'UnifiedPPTNode');
          });
        } else if (item.template === 'contents' && item.content?.items) {
          item.content.items.slice(0, 3).forEach(item => {
            Logger.log(`     • ${item}`, 'UnifiedPPTNode');
          });
        }
      });
    }

    return outline;
  }

  /**
   * 生成完整PPT内容（支持5并发）
   */
  private async generateCompletePPT(
    input: NodeInput,
    outlineOrTheme: any,
    userMessage: string,
  ): Promise<any> {
    const modelConfig = await this.getModelConfig(input.context.options?.model || 'gpt-4o-mini');

    // 如果传入的是主题而不是大纲，先生成大纲
    let outline = outlineOrTheme;
    if (!outlineOrTheme.outline) {
      Logger.log('📋 检测到需要先生成大纲...', 'UnifiedPPTNode');
      outline = await this.generateOutline(input, outlineOrTheme, userMessage);
      const outlineCount = outline.outline?.length || 0;
      Logger.log(`✅ 大纲生成完成，共 ${outlineCount} 个章节`, 'UnifiedPPTNode');
    } else {
      Logger.log('📋 使用已有大纲生成PPT内容...', 'UnifiedPPTNode');
    }

    // 开始生成PPT内容
    const slideCount = outline.outline?.length || 0;
    Logger.log(`🎯 开始并发生成PPT内容，预计 ${slideCount} 页，并发数：5`, 'UnifiedPPTNode');

    // 发送状态更新
    this.sendStatusUpdate(input.context, {
      type: 'ppt_content',
      message: `正在生成 ${slideCount} 页PPT内容...`,
    });

    const openai = new OpenAI({
      apiKey: modelConfig.key,
      baseURL: await correctApiBaseUrl(modelConfig.proxyUrl || ''),
      timeout: 120000,
    });

    // 准备生成每一页的内容
    const slides = new Array(slideCount);
    let completedCount = 0;
    let currentIndex = 0;
    const maxConcurrent = 5; // 5并发

    // 生成单页内容的函数
    const generateSlide = async (slideIndex: number): Promise<void> => {
      const slideOutline = outline.outline[slideIndex];

      try {
        Logger.log(`⚙️ 开始生成第 ${slideIndex + 1} 页：${slideOutline.title}`, 'UnifiedPPTNode');

        // 发送单页状态更新
        const slideTitle =
          slideOutline.content?.title || slideOutline.title || `第${slideIndex + 1}页`;
        this.sendStatusUpdate(input.context, {
          type: 'ppt_content',
          message: `正在生成第 ${slideIndex + 1}/${slideCount} 页: ${slideTitle}`,
        });

        const slideContent = await this.generateSingleSlide(
          slideOutline,
          outline,
          openai,
          modelConfig.model,
          input,
        );

        slides[slideIndex] = slideContent;
        completedCount++;

        Logger.log(
          `✅ 第 ${slideIndex + 1} 页生成完成 (${completedCount}/${slideCount})`,
          'UnifiedPPTNode',
        );

        // 如果还有未处理的页面，继续处理下一个
        if (currentIndex < slideCount) {
          await generateSlide(currentIndex++);
        }
      } catch (error) {
        Logger.error(`❌ 第 ${slideIndex + 1} 页生成失败: ${error.message}`, 'UnifiedPPTNode');
        // 使用默认内容
        slides[slideIndex] = this.getDefaultSlideContent(slideOutline, slideIndex + 1);
        completedCount++;

        // 继续处理下一个
        if (currentIndex < slideCount) {
          await generateSlide(currentIndex++);
        }
      }
    };

    // 启动初始的并发任务
    const initialPromises: Promise<void>[] = [];
    for (let i = 0; i < Math.min(maxConcurrent, slideCount); i++) {
      initialPromises.push(generateSlide(currentIndex++));
    }

    // 等待所有任务完成
    await Promise.all(initialPromises);

    // 组装完整的PPT数据
    const pptData = {
      title: outline.title,
      subtitle: outline.subtitle,
      author: outline.author || '99AI Plugin Edition',
      date: new Date().toLocaleDateString('zh-CN'),
      slides: slides,
      outline: outline.outline, // 直接包含大纲信息
    };

    // 记录生成的页数
    Logger.log(`✅ PPT内容生成完成，实际生成 ${slideCount} 页`, 'UnifiedPPTNode');

    // 记录每页的标题
    Logger.log('📑 PPT页面列表：', 'UnifiedPPTNode');
    slides.forEach((slide, index) => {
      Logger.log(`  第${index + 1}页: ${slide.title || slide.content?.title}`, 'UnifiedPPTNode');
    });

    Logger.log(`🎉 PPT全部内容生成完成！总计 ${slideCount} 页`, 'UnifiedPPTNode');

    return pptData;
  }

  /**
   * 生成单页PPT内容（基于大纲中已有的内容结构）
   */
  private async generateSingleSlide(
    slideOutline: any,
    fullOutline: any,
    openai: any,
    model: string,
    input: NodeInput,
  ): Promise<any> {
    // 如果大纲中已经包含完整的content，可能只需要优化或补充
    if (slideOutline.content && slideOutline.template) {
      // 对于某些模板，可能需要补充数据
      if (slideOutline.template === 'multi-column') {
        return this.enhanceMultiColumnContent(slideOutline, fullOutline, openai, model, input);
      }

      // 其他模板直接返回大纲中的内容
      return {
        id: slideOutline.id || `slide-${slideOutline.slideNumber}`,
        template: slideOutline.template,
        content: slideOutline.content,
      };
    }

    // 如果大纲中没有完整content（向后兼容），则生成
    const template = slideOutline.template || 'multi-column';
    const templateInfo = this.getTemplateInfo(template);

    const systemPrompt = `你是一个专业的PPT内容创作专家。请根据大纲中的内容结构，优化和完善PPT页面内容。

当前页面信息：
- 页码：第 ${slideOutline.slideNumber} 页
- 模板：${template}
- 大纲中的内容：${JSON.stringify(slideOutline.content || {})}

模板说明：
${templateInfo.description}

要求：
1. 基于大纲中已有的内容结构，进行优化和补充
2. 保持与大纲一致，不要改变主要内容方向
3. 所有文本内容使用纯文本，不要使用Markdown格式
4. 如果是chart类型，需要生成具体的数据
5. 将生成的JSON放在markdown代码块中

模板格式：
${templateInfo.example}`;

    const userPrompt = `PPT主题：${fullOutline.title}

当前页大纲内容：
${JSON.stringify(slideOutline, null, 2)}

请优化并完善这一页的内容，保持与大纲一致。`;

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5, // 降低温度，让输出更稳定
      max_tokens: 4000, // 单页PPT内容需要充分的空间
    });

    const responseContent = completion.choices[0].message.content || '';

    // 记录 token 使用量
    await this.recordTokenUsage(
      input,
      systemPrompt + userPrompt,
      responseContent,
      'PPT单页内容生成',
      completion.usage,
    );

    try {
      return this.parseJSONFromMarkdown(responseContent);
    } catch (error) {
      Logger.warn(`第 ${slideOutline.slideNumber} 页JSON解析失败，使用大纲内容`, 'UnifiedPPTNode');
      return {
        id: slideOutline.id || `slide-${slideOutline.slideNumber}`,
        template: slideOutline.template,
        content: slideOutline.content || this.getDefaultContent(slideOutline.template),
      };
    }
  }

  /**
   * 增强多栏内容（主要是生成图表数据）
   */
  private async enhanceMultiColumnContent(
    slideOutline: any,
    fullOutline: any,
    openai: any,
    model: string,
    input: NodeInput,
  ): Promise<any> {
    // 检查是否有图表需要生成数据
    const hasChart = slideOutline.content?.columns?.some(col => col.type === 'chart');

    if (!hasChart) {
      // 没有图表，直接返回
      return {
        id: slideOutline.id || `slide-${slideOutline.slideNumber}`,
        template: slideOutline.template,
        content: slideOutline.content,
      };
    }

    // 有图表，需要生成具体数据
    const systemPrompt = `你是一个数据分析专家。请为PPT中的图表生成合适的数据。

要求：
1. 数据要真实合理，符合主题
2. 使用Chart.js格式
3. 颜色要美观
4. 只修改chart相关的内容，其他内容保持不变

Chart.js数据格式示例：
{
  "type": "bar",
  "chart": {
    "type": "bar",
    "data": {
      "labels": ["Q1", "Q2", "Q3", "Q4"],
      "datasets": [{
        "label": "销售额",
        "data": [120, 190, 170, 250],
        "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]
      }]
    }
  }
}`;

    const userPrompt = `主题：${fullOutline.title}
页面内容：${JSON.stringify(slideOutline.content)}

请为chart类型的栏目生成具体的图表数据。返回完整的页面JSON。`;

    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000, // 单页PPT内容需要充分的空间
      });

      const responseContent = completion.choices[0].message.content || '';

      // 记录 token 使用量
      await this.recordTokenUsage(
        input,
        systemPrompt + userPrompt,
        responseContent,
        'PPT图表数据生成',
        completion.usage,
      );

      return this.parseJSONFromMarkdown(responseContent);
    } catch (error) {
      // 如果生成失败，返回原内容
      return {
        id: slideOutline.id || `slide-${slideOutline.slideNumber}`,
        template: slideOutline.template,
        content: slideOutline.content,
      };
    }
  }

  /**
   * 获取默认大纲（当AI生成失败时使用）
   */
  private getDefaultOutline(selectedTheme: any, userMessage: string): any {
    const title = selectedTheme?.title || userMessage.substring(0, 50) || 'PPT演示文稿';
    const subtitle = selectedTheme?.description || '专业演示文稿';

    return {
      title: title,
      subtitle: subtitle,
      author: '99AI Plugin Edition',
      date: new Date().toLocaleDateString('zh-CN'),
      outline: [
        {
          slideNumber: 1,
          id: 'slide-1',
          template: 'cover',
          content: {
            title: title,
            subtitle: subtitle,
            author: '99AI Plugin Edition',
            date: new Date().toLocaleDateString('zh-CN'),
          },
        },
        {
          slideNumber: 2,
          id: 'slide-2',
          template: 'contents',
          content: {
            title: '目录',
            items: ['背景介绍', '核心内容', '详细分析', '总结展望'],
          },
        },
        {
          slideNumber: 3,
          id: 'slide-3',
          template: 'chapter',
          content: {
            chapterNumber: '第一部分',
            chapterTitle: '背景介绍',
          },
        },
        {
          slideNumber: 4,
          id: 'slide-4',
          template: 'multi-column',
          content: {
            title: '背景概述',
            columns: [
              {
                title: '关键要点',
                type: 'list',
                items: ['当前形势分析', '行业发展趋势', '面临的挑战'],
              },
            ],
          },
        },
        {
          slideNumber: 5,
          id: 'slide-5',
          template: 'chapter',
          content: {
            chapterNumber: '第二部分',
            chapterTitle: '核心内容',
          },
        },
        {
          slideNumber: 6,
          id: 'slide-6',
          template: 'multi-column',
          content: {
            title: '核心分析',
            columns: [
              {
                title: '主要内容',
                type: 'list',
                items: ['核心观点一', '核心观点二', '核心观点三'],
              },
            ],
          },
        },
        {
          slideNumber: 7,
          id: 'slide-7',
          template: 'multi-column',
          content: {
            title: '详细分析',
            columns: [
              {
                title: '深度解析',
                type: 'list',
                items: ['详细说明一', '详细说明二', '详细说明三'],
              },
            ],
          },
        },
        {
          slideNumber: 8,
          id: 'slide-8',
          template: 'thank-you',
          content: {
            title: '谢谢观看',
            subtitle: '感谢您的关注',
            contact: '',
          },
        },
      ],
    };
  }

  /**
   * 获取默认内容结构
   */
  private getDefaultContent(template: string): any {
    const defaults = {
      cover: {
        title: 'PPT标题',
        subtitle: '副标题',
        author: '99AI Plugin Edition',
        date: new Date().toLocaleDateString('zh-CN'),
      },
      contents: {
        title: '目录',
        items: ['第一部分', '第二部分', '第三部分'],
      },
      'multi-column': {
        title: '内容页',
        columns: [
          {
            type: 'list',
            title: '要点',
            items: ['要点1', '要点2', '要点3'],
          },
        ],
      },
      'thank-you': {
        title: '谢谢观看',
        subtitle: '感谢您的关注',
        contact: '',
      },
    };

    return defaults[template] || defaults['multi-column'];
  }

  /**
   * 获取默认页面内容
   */
  private getDefaultSlideContent(slideOutline: any, pageNumber: number): any {
    const template = slideOutline.template || 'multi-column';
    // 优先使用大纲中的content，如果没有则使用默认值
    const content = slideOutline.content || this.getDefaultContent(template);

    return {
      id: slideOutline.id || `slide-${pageNumber}`,
      template: template,
      content: content,
    };
  }

  /**
   * 获取模板信息
   */
  private getTemplateInfo(template: string): {
    description: string;
    example: string;
    guidelines: string;
  } {
    const templates: Record<string, any> = {
      cover: {
        description: '封面模板：用于PPT的开始页面',
        example: `{
  "id": "slide-1",
  "template": "cover",
  "content": {
    "title": "演示文稿主标题",
    "subtitle": "副标题或说明文字",
    "author": "作者姓名",
    "date": "2025-01-20"
  }
}`,
        guidelines: '生成吸引人的标题和副标题，确保与主题相关。',
      },
      chapter: {
        description: '章节模板：用于分隔不同章节',
        example: `{
  "id": "slide-x",
  "template": "chapter", 
  "content": {
    "chapterNumber": "第一章",
    "chapterTitle": "章节标题"
  }
}`,
        guidelines: '章节编号使用中文格式，标题要简洁有力。',
      },
      contents: {
        description: '目录模板：展示PPT整体结构',
        example: `{
  "id": "slide-x",
  "template": "contents",
  "content": {
    "title": "目录",
    "items": ["第一部分", "第二部分", "第三部分"]
  }
}`,
        guidelines: '目录项对应主要章节，每项简洁明了。',
      },
      'multi-column': {
        description: '万能多栏模板：最灵活的布局，支持文本、列表、图表等',
        example: `{
  "id": "slide-x",
  "template": "multi-column",
  "content": {
    "title": "页面标题",
    "columns": [
      {
        "title": "要点概述",
        "type": "list",
        "items": ["要点一", "要点二", "要点三"]
      },
      {
        "title": "数据展示",
        "type": "chart",
        "chart": {
          "type": "bar",
          "data": {
            "labels": ["Q1", "Q2", "Q3", "Q4"],
            "datasets": [{
              "label": "销售额",
              "data": [120, 190, 170, 250],
              "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]
            }]
          }
        }
      }
    ]
  }
}`,
        guidelines: '支持1-3栏布局。type可选: text(纯文本)、list(列表)、image(图片)、chart(图表)。',
      },
      'timeline-horizontal': {
        description: '横向时间轴模板：展示发展历程',
        example: `{
  "id": "slide-x",
  "template": "timeline-horizontal",
  "content": {
    "title": "发展历程",
    "timeline": [
      {
        "date": "2020年",
        "title": "项目启动",
        "description": "完成初步规划",
        "milestone": true
      }
    ]
  }
}`,
        guidelines: '时间节点3-6个为宜，重要节点设置milestone:true。',
      },
      quote: {
        description: '引用模板：突出重要观点',
        example: `{
  "id": "slide-x",
  "template": "quote",
  "content": {
    "quote": "重要的引用文字",
    "author": "——作者"
  }
}`,
        guidelines: '引用要有力量，作者信息可选。',
      },
      qa: {
        description: '问答模板：展示问题和答案',
        example: `{
  "id": "slide-x",
  "template": "qa",
  "content": {
    "title": "关键问题",
    "question": "提出的问题？",
    "answer": "详细的答案",
    "showAnswer": true
  }
}`,
        guidelines: 'showAnswer控制是否显示答案。',
      },
      team: {
        description: '团队介绍模板',
        example: `{
  "id": "slide-x",
  "template": "team",
  "content": {
    "title": "核心团队",
    "members": [
      {
        "name": "张三",
        "role": "技术总监",
        "description": "10年经验"
      }
    ]
  }
}`,
        guidelines: '团队成员3-6人为宜。',
      },
      'thank-you': {
        description: '致谢模板：PPT结尾页',
        example: `{
  "id": "slide-x",
  "template": "thank-you",
  "content": {
    "title": "谢谢观看",
    "subtitle": "感谢您的关注",
    "contact": "contact@example.com"
  }
}`,
        guidelines: '表达感谢，可选联系方式。',
      },
    };

    return templates[template] || templates['multi-column'];
  }

  /**
   * 创建主题工具执行对象
   */
  private createThemeToolExecution(themeData: any): any {
    return {
      id: `ppt_theme_${Date.now()}`,
      name: 'PPT主题生成',
      status: 'success',
      input: '生成PPT主题选项',
      output: themeData,
      time: Date.now(),
    };
  }

  /**
   * 创建大纲工具执行对象
   */
  private createOutlineToolExecution(outlineData: any): any {
    return {
      id: `ppt_outline_${Date.now()}`,
      name: 'PPT大纲生成',
      status: 'success',
      input: '生成PPT大纲',
      output: outlineData,
      time: Date.now(),
    };
  }

  /**
   * 创建完整PPT工具执行对象
   */
  private createCompleteToolExecution(pptData: any): any {
    return {
      id: `ppt_complete_${Date.now()}`,
      name: 'PPT内容生成',
      status: 'success',
      input: `生成${pptData.slides?.length || 0}页PPT`,
      output: pptData,
      time: Date.now(),
    };
  }

  /**
   * 发送工具执行更新
   */
  private sendToolExecutionUpdate(input: NodeInput, toolExecution: any): void {
    // 发送到前端
    input.context.onProgress?.({
      agent_content: JSON.stringify({
        metadata: {
          version: '1.0.0',
          type: 'streaming',
          workflowId: input.context.workflowId,
          timestamp: new Date().toISOString(),
        },
        data: {
          toolExecutions: [toolExecution],
        },
      }),
    });
  }

  /**
   * 从markdown代码块中解析JSON（简化版本 - 依赖AI生成正确格式）
   */
  private parseJSONFromMarkdown(content: string): any {
    try {
      let jsonString = '';

      // 1. 尝试从markdown代码块中提取
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonString = codeBlockMatch[1].trim();
        Logger.debug(`从代码块中提取JSON，长度: ${jsonString.length}`, 'UnifiedPPTNode');
      } else {
        // 2. 尝试直接提取JSON对象
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0].trim();
          Logger.debug(`直接提取JSON对象，长度: ${jsonString.length}`, 'UnifiedPPTNode');
        } else {
          throw new Error('未找到有效的JSON数据');
        }
      }

      // 3. 直接解析JSON
      const result = JSON.parse(jsonString);
      Logger.debug('✅ JSON解析成功', 'UnifiedPPTNode');
      return result;
    } catch (error) {
      // 记录详细错误信息用于调试
      Logger.error(`JSON解析失败: ${error.message}`, 'UnifiedPPTNode');
      Logger.error(`错误位置: ${this.getErrorContext(content, error)}`, 'UnifiedPPTNode');
      Logger.error(`原始内容前500字符: ${content.substring(0, 500)}...`, 'UnifiedPPTNode');
      throw error;
    }
  }

  /**
   * 获取错误位置附近的上下文
   */
  private getErrorContext(jsonString: string, error: any): string {
    try {
      // 尝试从错误消息中提取位置
      const posMatch = error.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const start = Math.max(0, pos - 50);
        const end = Math.min(jsonString.length, pos + 50);
        const context = jsonString.substring(start, end);
        return `...${context}... (位置 ${pos})`;
      }
      return '无法确定错误位置';
    } catch (e) {
      return '无法获取错误上下文';
    }
  }

  /**
   * 获取模型配置
   */
  private async getModelConfig(modelName: string): Promise<any> {
    const modelConfig = await this.modelsService.getCurrentModelKeyInfo(modelName);
    if (!modelConfig) {
      const globalConfig = await this.globalConfigService.getConfigs([
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
      ]);

      return {
        key: globalConfig.openaiBaseKey,
        baseUrl: globalConfig.openaiBaseUrl,
        model: modelConfig?.model || globalConfig.openaiBaseModel || modelName,
        proxyUrl: globalConfig.openaiBaseUrl,
      };
    }
    return modelConfig;
  }

  /**
   * 发送状态更新 - 使用标准的toolExecutions格式
   */
  private sendStatusUpdate(context: any, status: any): void {
    if (!context.options?.onProgress) return;

    // 根据状态类型生成工具名称
    let toolName = 'PPT生成';
    if (status.type === 'ppt_themes') {
      toolName = 'PPT主题生成';
    } else if (status.type === 'ppt_outline') {
      toolName = 'PPT大纲生成';
    } else if (status.type === 'ppt_content') {
      toolName = 'PPT内容生成';
    }

    const statusUpdate = {
      agent_content: JSON.stringify({
        metadata: {
          type: 'incremental',
          workflowId: context.workflowId,
          timestamp: new Date().toISOString(),
        },
        data: {
          toolExecutions: [
            {
              id: `ppt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              name: toolName,
              status: 'loading',
              input: status.message || '处理中...',
              output: status.details || null,
              time: Date.now(),
            },
          ],
        },
      }),
    };

    context.options.onProgress(statusUpdate);
  }
}
