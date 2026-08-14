import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { EditDocumentResult, ChangeType, DocumentChange } from './dto/editDocument.dto';

@Injectable()
export class EditDecisionService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * FC 工具定义：文档编辑
   */
  private getEditDocumentTool() {
    return {
      type: 'function',
      function: {
        name: 'edit_document',
        description:
          '分析用户意图，判断是否需要编辑文档。如需编辑则直接返回修改指令，否则返回 needEdit: false',
        parameters: {
          type: 'object',
          properties: {
            needEdit: {
              type: 'boolean',
              description: '是否需要编辑文档',
            },
            changes: {
              type: 'array',
              description: '需要编辑时的修改列表，needEdit 为 false 时可为空',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['replace', 'insert', 'delete'],
                    description: '操作类型：replace-替换, insert-插入, delete-删除',
                  },
                  startLine: {
                    type: 'integer',
                    description: '起始行号（从1开始）',
                  },
                  endLine: {
                    type: 'integer',
                    description: '结束行号（replace/delete 时需要）',
                  },
                  oldText: {
                    type: 'string',
                    description: '要替换/删除的原文本，必须与文档内容完全匹配（包括空格、换行）',
                  },
                  newText: {
                    type: 'string',
                    description: '新文本内容（replace/insert 时需要）',
                  },
                  reason: {
                    type: 'string',
                    description: '修改原因的简短说明',
                  },
                },
                required: ['type', 'startLine'],
              },
            },
            summary: {
              type: 'string',
              description:
                '用自然口语完整总结这次编辑，40字以内。可以概括文档结构的变化。例如："好的，已经加入了第四部分，现在文档有四个主题了"、"完成了，把三段内容整合成了两个更清晰的部分"、"搞定，添加了你要的两个冷笑话到结尾部分"。要求：1)使用与用户相同的语言 2)句子要完整自然 3)可以描述文档结构的变化（如章节数量、内容分布等）',
            },
          },
          required: ['needEdit'],
        },
      },
    };
  }

  /**
   * 生成编辑决策 System Prompt
   */
  private generateEditSystemPrompt(documentContent: string): string {
    // 给每行添加行号，方便AI精确定位
    const lines = documentContent.split('\n');
    const numberedContent = lines.map((line, index) => `[${index + 1}] ${line}`).join('\n');

    return `你是一个文档编辑助手。当前用户正在编辑模式下与你对话。

# 当前文档内容（每行开头的[数字]是行号）
\`\`\`markdown
${numberedContent}
\`\`\`

# 任务
1. 判断用户是否需要修改文档
   - 仅咨询、提问、讨论 → needEdit: false
   - 明确要求修改、调整、增删内容 → needEdit: true

2. 如果需要编辑（needEdit: true）：
   - 使用文档中的[数字]行号标记来精确定位要修改的位置
   - 生成结构化的 changes 数组，表示一系列有顺序的编辑步骤
   - 每个 change 是一个独立的编辑动作，前端会逐个播放动画
   - 想象你在使用文本编辑器，一步一步地修改文档
   - 重要：oldText 和 newText 字段应该只包含实际内容，不要包含[数字]行号标记

3. 如果不需要编辑（needEdit: false）：
   - 直接返回 {"needEdit": false}
   - 后续会由主 LLM 正常回答用户问题

# 注意事项
- 文档每行开头的[数字]是行号标记，用于精确定位
- oldText 和 newText 中不要包含[数字]行号标记，只包含实际内容
- oldText 必须与文档中的实际内容完全匹配（不包含行号标记）
- 一次可以返回多个 changes，它们会按顺序逐个应用
- type 为 "insert" 时，在 startLine 之后插入 newText
- type 为 "delete" 时，删除从 startLine 到 endLine 的内容
- type 为 "replace" 时，将 startLine 到 endLine 的内容替换为 newText
- 如果用户只是询问如何修改，而不是要求立即修改，则返回 needEdit: false

# 重要：生成顺序化的修改过程
- changes 数组的顺序非常重要，前端会按照这个顺序逐步展示修改动画
- 应该像人类编辑文档一样，一步一步地修改，而不是同时修改多处
- 每个 change 都是一个独立的编辑动作，会有独立的动画效果
- 优先处理文档前面的修改，再处理后面的修改（从上到下）

# 特别注意：序号和编号的连续性
- 当删除中间的内容时，如果涉及到序号（如1、2、3、4或第一、第二、第三）
- 必须同时修改后续内容的序号，保持连续性
- 例如：删除第2项后，原来的第3、4项要改为第2、3项
- 这些序号调整也要作为独立的 change 操作返回

示例场景1：简单替换
文档内容：
[1] # 水果列表
[2] 我最喜欢的水果是苹果
[3] 今天买了一些水果
[4] 包括葡萄和香蕉
[5] 还有新鲜的橘子

用户说："把第2行的苹果改成香蕉，第5行的橘子改成西瓜"

正确的 changes 数组：
[
  { type: "replace", startLine: 2, oldText: "我最喜欢的水果是苹果", newText: "我最喜欢的水果是香蕉" },
  { type: "replace", startLine: 5, oldText: "还有新鲜的橘子", newText: "还有新鲜的西瓜" }
]

示例场景2：删除中间项并更新序号
文档内容：
[1] # 任务列表
[2] 1. 完成报告
[3] 2. 参加会议
[4] 3. 回复邮件
[5] 4. 更新文档

用户说："删除第二个任务"

正确的 changes 数组：
[
  { type: "delete", startLine: 3, endLine: 3, oldText: "2. 参加会议", reason: "删除第二个任务" },
  { type: "replace", startLine: 4, oldText: "3. 回复邮件", newText: "2. 回复邮件", reason: "更新序号" },
  { type: "replace", startLine: 5, oldText: "4. 更新文档", newText: "3. 更新文档", reason: "更新序号" }
]
注意：删除后需要更新后续所有项的序号以保持连续性

- 如果多个修改相互依赖，要确保顺序正确（比如先删除旧内容，再插入新内容）
- 把复杂的修改拆分成多个简单的步骤，让用户能够清楚地看到每一步的变化

请调用 edit_document 工具返回你的决策。

特别注意summary字段的要求：
- 写一个完整、自然的句子，就像是你完成编辑后对用户的回复
- 可以概括文档结构的变化，让用户了解文档现在的整体状态
- 好的例子：
  * "好的，已经加入了第四部分'自由讨论'，现在PPT完整包含了四个部分"
  * "完成了，把原来的三个章节重新整理成了五个更清晰的部分"
  * "搞定，在第二章后面添加了新的案例分析，文档结构更完整了"
  * "已经帮你删除了重复的段落，现在文档更精简了"
- 不好的例子："修正错别字"、"添加内容"（太简单）
- 语气要自然友好，像朋友帮忙后的回复`;
  }

  /**
   * 调用 FC 模型进行编辑决策
   */
  async makeEditDecision(
    messages: any[],
    documentContent: string,
    currentModel?: string,
  ): Promise<EditDocumentResult> {
    try {
      // 1. 选择合适的 FC 模型
      const { model, apiKey, baseUrl } = await this.selectFCModel(currentModel);

      Logger.log(`使用模型 ${model} 进行编辑决策`, 'EditDecisionService');

      // 2. 构建消息：添加编辑助手的 system prompt，然后是完整的对话历史
      const systemPrompt = this.generateEditSystemPrompt(documentContent);

      // 复制消息历史并添加或替换 system message
      const fcMessages = [...messages];

      // 查找是否已有 system message
      const systemIndex = fcMessages.findIndex(msg => msg.role === 'system');
      if (systemIndex >= 0) {
        // 如果有，追加编辑相关的内容
        fcMessages[systemIndex].content = systemPrompt + '\n\n' + fcMessages[systemIndex].content;
      } else {
        // 如果没有，在开头添加
        fcMessages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }

      // 3. 调用 OpenAI API
      const client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
      });

      const response = await client.chat.completions.create({
        model,
        messages: fcMessages as any,
        tools: [this.getEditDocumentTool() as any],
        tool_choice: { type: 'function', function: { name: 'edit_document' } },
      });

      // 记录 token 使用量（返回给调用者）
      const tokenUsage = response.usage;

      // 4. 解析工具调用结果
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.function.name !== 'edit_document') {
        Logger.warn('模型未返回有效的 tool_call', 'EditDecisionService');
        return { needEdit: false, tokenUsage };
      }

      // 尝试解析 JSON，处理可能的格式问题
      let result: EditDocumentResult;
      try {
        result = JSON.parse(toolCall.function.arguments) as EditDocumentResult;
      } catch (parseError) {
        // 记录原始内容以便调试
        Logger.warn(
          `JSON 解析失败，原始内容长度: ${toolCall.function.arguments?.length || 0}`,
          'EditDecisionService',
        );

        // 尝试修复常见问题
        let fixedJson = toolCall.function.arguments;

        // 1. 移除可能的尾部垃圾字符
        const lastBrace = fixedJson.lastIndexOf('}');
        if (lastBrace !== -1 && lastBrace < fixedJson.length - 1) {
          fixedJson = fixedJson.substring(0, lastBrace + 1);
        }

        // 2. 尝试再次解析
        try {
          result = JSON.parse(fixedJson) as EditDocumentResult;
          Logger.warn('JSON 修复成功', 'EditDecisionService');
        } catch (secondError) {
          // 如果还是失败，返回不编辑
          Logger.error(`JSON 解析彻底失败: ${secondError.message}`, 'EditDecisionService');
          return { needEdit: false, tokenUsage };
        }
      }

      Logger.log(
        `编辑决策结果: needEdit=${result.needEdit}, changes=${result.changes?.length || 0}`,
        'EditDecisionService',
      );

      return { ...result, tokenUsage };
    } catch (error) {
      Logger.error(`编辑决策失败: ${error.message}`, error.stack, 'EditDecisionService');
      // 失败时返回不编辑，让正常流程继续
      return { needEdit: false, tokenUsage: undefined };
    }
  }

  /**
   * 选择 FC 模型
   * 优先使用当前模型（如果支持 FC），否则使用全局 FC 模型
   */
  private async selectFCModel(currentModel?: string): Promise<{
    model: string;
    apiKey: string;
    baseUrl: string;
  }> {
    // 获取全局配置的 FC 模型
    const { openaiBaseUrl, openaiBaseKey, openaiBaseModel } =
      await this.globalConfigService.getConfigs([
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiBaseModel',
      ]);

    // 如果指定了当前模型，检查是否支持 FC
    if (currentModel) {
      const modelInfo = await this.modelsService.getCurrentModelKeyInfo(currentModel);
      if (modelInfo) {
        Logger.log(`使用当前模型 ${currentModel} 进行 FC 调用`, 'EditDecisionService');
        return {
          model: modelInfo.model,
          apiKey: modelInfo.key || openaiBaseKey,
          baseUrl: modelInfo.proxyUrl || openaiBaseUrl || 'https://api.openai.com/v1',
        };
      }
    }

    // 回退到全局 FC 模型
    Logger.log('使用全局 FC 模型', 'EditDecisionService');
    return {
      model: openaiBaseModel || 'gpt-4o-mini',
      apiKey: openaiBaseKey,
      baseUrl: openaiBaseUrl || 'https://api.openai.com/v1',
    };
  }

  /**
   * 生成编辑后的总结 System Prompt
   * @param editResult 包含原文、修改内容和diff信息
   * @param originalContent 编辑前的原始文档
   * @param modifiedContent 编辑后的文档
   */
  generateSummaryPrompt(
    editResult: EditDocumentResult,
    originalContent: string,
    modifiedContent: string,
  ): string {
    // 构建diff摘要
    const changesSummary =
      editResult.changes
        ?.map(change => {
          let action = '';
          switch (change.type) {
            case 'replace':
              action = '替换';
              break;
            case 'insert':
              action = '插入';
              break;
            case 'delete':
              action = '删除';
              break;
            default:
              action = '修改';
          }
          return `- ${action}第${change.startLine}${
            change.endLine ? `-${change.endLine}` : ''
          }行：${change.reason || ''}`;
        })
        .join('\n') || '';

    return `你刚刚协助用户完成了文档编辑。请基于以下信息，用自然的语言总结这次编辑。

# 编辑摘要
${editResult.summary}

# 具体修改
${changesSummary}

# 原始内容（节选）
\`\`\`
${this.extractRelevantContent(originalContent, editResult.changes)}
\`\`\`

# 修改后内容（节选）
\`\`\`
${this.extractRelevantContent(modifiedContent, editResult.changes)}
\`\`\`

请用2-3句话总结：
1. 确认修改已完成
2. 简要说明主要改动（不要逐条列举）
3. 使用与用户相同的语言

示例回复：
"修改完成了。已经把故事中的主角从数学书和语文书改成了英语书和物理书，同时调整了对话内容以符合新角色的特点。"`;
  }

  /**
   * 提取修改相关的内容片段
   */
  private extractRelevantContent(content: string, changes?: DocumentChange[]): string {
    if (!changes || changes.length === 0) return content;

    const lines = content.split('\n');
    const relevantLines = new Set<number>();

    // 收集所有相关行号（包括前后各1行的上下文）
    changes.forEach(change => {
      const start = Math.max(0, change.startLine - 2);
      const end = Math.min(lines.length - 1, (change.endLine || change.startLine) + 1);
      for (let i = start; i <= end; i++) {
        relevantLines.add(i);
      }
    });

    // 构建带省略号的内容
    let result = '';
    let lastLine = -1;
    Array.from(relevantLines)
      .sort((a, b) => a - b)
      .forEach(lineNum => {
        if (lastLine >= 0 && lineNum - lastLine > 1) {
          result += '...\n';
        }
        result += lines[lineNum] + '\n';
        lastLine = lineNum;
      });

    return result.trim();
  }
}
