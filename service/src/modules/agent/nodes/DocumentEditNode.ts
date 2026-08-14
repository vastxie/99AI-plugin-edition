import { Injectable, Logger } from '@nestjs/common';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { ModelsService } from '../../models/models.service';
import { EditDecisionService } from '../../chat/editDecision.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';
import { EditDocumentResult } from '../../chat/dto/editDocument.dto';

/**
 * 文档编辑节点
 * 当用户处于编辑模式时，判断是否需要编辑文档
 * 如需编辑则生成 diff 并通知前端，同时调整后续节点的 system prompt
 */
@Injectable()
export class DocumentEditNode extends BaseNode {
  readonly meta: NodeMeta = {
    id: 'document-edit',
    type: 'document-edit',
    name: '文档编辑节点',
    description: '判断用户意图，决定是否编辑文档并生成结构化 diff',
    version: '1.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    protected readonly modelsService: ModelsService,
    private readonly editDecisionService: EditDecisionService,
  ) {
    super(globalConfigService, modelsService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    const editorContent = (input.context.options as any)?.editorContent;

    // 如果没有编辑器内容，直接跳过
    if (!editorContent?.markdown) {
      Logger.log('未检测到编辑器内容，跳过文档编辑节点', 'DocumentEditNode');
      return {
        result: {
          success: true,
          data: { skipped: true, reason: 'no_editor_content' },
        },
        stateUpdates: {
          editResult: { needEdit: false, skipped: true },
        },
      };
    }

    Logger.log('检测到编辑器内容，开始文档编辑决策', 'DocumentEditNode');

    // 发送开始状态
    this.sendStream(input, {
      type: 'status',
      status: 'analyzing',
      content: '正在分析是否需要编辑文档...',
    });

    try {
      // 获取完整的消息历史
      const messages = (input.context.messages as any[]) || [];
      const model = input.config.model || (input.context.options as any)?.model;

      // 调用编辑决策服务，传递完整的对话历史
      const editResult: EditDocumentResult = await this.editDecisionService.makeEditDecision(
        messages,
        editorContent.markdown,
        model,
      );

      // 记录 token 使用量
      if (editResult.tokenUsage) {
        await this.recordTokenUsage(
          input,
          JSON.stringify(messages),
          JSON.stringify(editResult.changes) + editResult.summary,
          '文档编辑决策',
          editResult.tokenUsage,
        );
      }

      if (editResult.needEdit) {
        Logger.log(
          `需要编辑文档，修改数量: ${editResult.changes?.length || 0}`,
          'DocumentEditNode',
        );

        // 发送编辑 diff 给前端
        this.sendStream(input, {
          type: 'data',
          data: {
            edit_diff: editResult,
          },
        } as any);

        // 直接生成完整的编辑总结内容
        const editSummaryContent = this.generateEditSummaryContent(editResult);

        // 返回结果，修改后续节点的 system message
        return {
          result: {
            success: true,
            data: {
              needEdit: true,
              editResult,
              summaryContent: editSummaryContent,
            },
          },
          stateUpdates: {
            editResult: {
              needEdit: true,
              changes: editResult.changes,
              summary: editResult.summary,
            },
            // 传递预生成的总结内容给LLM节点
            editSummaryContent: editSummaryContent,
            // 同时设置工作流引擎需要的字段，保证内容能被提取和保存
            // 模拟 LLMNode 的输出格式
            content: editSummaryContent,
            tempFullContent: editSummaryContent,
            full_content: editSummaryContent,
            llm_response: {
              full_content: editSummaryContent,
              content: [{ type: 'text', text: editSummaryContent }],
              finishReason: 'stop',
            },
          },
          agentDataUpdates: {
            documentEdit: {
              title: '文档编辑',
              content: editResult.summary || '文档已更新',
              status: 'completed',
            },
          },
        };
      } else {
        Logger.log('不需要编辑文档，继续正常对话', 'DocumentEditNode');

        return {
          result: {
            success: true,
            data: { needEdit: false },
          },
          stateUpdates: {
            editResult: { needEdit: false },
          },
        };
      }
    } catch (error) {
      Logger.error(`文档编辑决策失败: ${error.message}`, error.stack, 'DocumentEditNode');

      // 失败时继续正常流程，不阻塞对话
      return {
        result: {
          success: true,
          data: {
            needEdit: false,
            skipped: true,
            error: error.message,
          },
        },
        stateUpdates: {
          editResult: { needEdit: false, error: error.message },
        },
      };
    }
  }

  /**
   * 从消息历史中获取用户的最新消息
   */
  private getUserMessage(input: NodeInput): string {
    const messages = (input.context.messages as any[]) || [];

    // 倒序查找最后一条用户消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        // 处理不同格式的 content
        if (typeof msg.content === 'string') {
          return msg.content;
        } else if (Array.isArray(msg.content)) {
          // GPT Vision 格式，提取 text 类型的内容
          const textItems = msg.content.filter((item: any) => item.type === 'text' || item.text);
          return textItems.map((item: any) => item.text || item).join(' ');
        }
      }
    }

    return '';
  }

  /**
   * 生成编辑总结内容
   * 直接使用AI返回的完整句子，或生成备用总结
   */
  private generateEditSummaryContent(editResult: EditDocumentResult): string {
    // 如果有AI生成的完整总结，直接使用
    if (editResult.summary) {
      let summary = editResult.summary.trim();

      // 确保句子有合适的结尾
      if (
        !summary.endsWith('。') &&
        !summary.endsWith('！') &&
        !summary.endsWith('~') &&
        !summary.endsWith('了')
      ) {
        summary += '。';
      }

      return summary;
    }

    // 备用方案：如果AI没有返回summary（不应该发生）
    const changesCount = editResult.changes?.length || 0;

    if (changesCount === 0) {
      return '好的，已经帮你更新了文档。';
    }

    // 根据操作类型生成自然语言
    const changeTypes = new Set(editResult.changes?.map(c => c.type));

    if (changeTypes.size === 1) {
      const type = Array.from(changeTypes)[0];
      switch (type) {
        case 'replace':
          return changesCount === 1
            ? '好的，已经帮你替换了内容。'
            : `好的，已经替换了${changesCount}处内容。`;
        case 'insert':
          return changesCount === 1
            ? '新内容已经添加好了。'
            : `已经添加了${changesCount}处新内容。`;
        case 'delete':
          return changesCount === 1
            ? '已经删除了那部分内容。'
            : `删除完成，共清理了${changesCount}处内容。`;
      }
    }

    // 混合操作
    return `文档更新完成，共进行了${changesCount}处修改。`;
  }
}
