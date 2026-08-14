import { Injectable, Logger, Optional } from '@nestjs/common';
import { EndNode } from '../nodes/EndNode';
import { FileVectorSearchNode } from '../nodes/FileVectorSearchNode';
import { FlowithNode } from '../nodes/FlowithNode';
import { ImageAnalysisNode } from '../nodes/ImageAnalysisNode';
import { LLMNode } from '../nodes/LLMNode';
import { UnifiedToolNode } from '../nodes/UnifiedToolNode';
import { UnifiedPPTNode } from '../nodes/UnifiedPPTNode';
import { QuestionGeneratorNode } from '../nodes/QuestionGeneratorNode';
import { SensitiveFilterNode } from '../nodes/SensitiveFilterNode';
import { ThinkingNode } from '../nodes/ThinkingNode';
import { DocumentEditNode } from '../nodes/DocumentEditNode';
import { ExecutionContext, NodeResult, NodeType, WorkflowNodeConfig } from './types';

/**
 * 节点执行器服务
 * 负责根据节点类型分发执行任务
 */
@Injectable()
export class NodeExecutor {
  constructor(
    private readonly llmNode: LLMNode,
    private readonly thinkingNode: ThinkingNode,
    private readonly sensitiveFilterNode: SensitiveFilterNode,
    private readonly questionGeneratorNode: QuestionGeneratorNode,
    private readonly fileVectorSearchNode: FileVectorSearchNode,
    private readonly imageAnalysisNode: ImageAnalysisNode,
    private readonly toolNode: UnifiedToolNode,
    private readonly endNode: EndNode,
    private readonly flowithNode: FlowithNode,
    private readonly documentEditNode: DocumentEditNode,
    @Optional() private readonly unifiedPPTNode?: UnifiedPPTNode,
  ) {}

  /**
   * 执行单个节点（兼容WorkflowEngine）
   */
  async execute(nodeConfig: WorkflowNodeConfig, context: ExecutionContext): Promise<NodeResult> {
    return this.executeNode(nodeConfig.id, nodeConfig.type, nodeConfig.config, context);
  }

  /**
   * 执行指定类型的节点
   */
  async executeNode(
    nodeId: string,
    nodeType: NodeType | string,
    config: any,
    context: ExecutionContext,
  ): Promise<NodeResult> {
    // 在 context 中保存当前节点 ID
    context.currentNodeId = nodeId;

    try {
      let result: NodeResult;

      switch (nodeType) {
        case NodeType.LLM:
          result = await this.llmNode.execute(config, context);
          break;

        case NodeType.THINKING:
          result = await this.thinkingNode.execute(config, context);
          break;

        case NodeType.SEARCH:
          // 使用 ToolNode 处理搜索
          result = await this.toolNode.execute(config, context);
          break;

        case NodeType.SENSITIVE_FILTER:
          result = await this.sensitiveFilterNode.execute(config, context);
          break;

        case NodeType.QUESTION_GENERATOR:
          result = await this.questionGeneratorNode.execute(config, context);
          break;

        case NodeType.FILE_VECTOR_SEARCH:
          result = await this.fileVectorSearchNode.execute(config, context);
          break;

        case NodeType.IMAGE_ANALYSIS:
          result = await this.imageAnalysisNode.execute(config, context);
          break;

        case NodeType.MCP_TOOL:
          // 使用 ToolNode 处理 MCP 工具
          result = await this.toolNode.execute(config, context);
          break;

        case NodeType.TOOL:
          result = await this.toolNode.execute(config, context);
          break;

        case NodeType.UNIFIED_PPT:
          if (!this.unifiedPPTNode) {
            throw new Error('统一PPT节点未初始化');
          }
          result = await this.unifiedPPTNode.execute(config, context);
          break;

        case NodeType.DOCUMENT_EDIT:
          result = await this.documentEditNode.execute(config, context);
          break;

        case 'unified_tool':
          // 使用 ToolNode 处理统一工具
          result = await this.toolNode.execute(config, context);
          break;

        case NodeType.END:
          result = await this.endNode.execute(config, context);
          break;

        case 'flowith':
          result = await this.flowithNode.execute(config, context);
          break;

        default:
          throw new Error(`不支持的节点类型: ${nodeType}`);
      }

      // 只在失败时记录日志
      if (!result.success) {
        Logger.error(`节点执行失败: ${nodeId} - ${result.error}`, 'NodeExecutor');
      }

      return result;
    } catch (error) {
      Logger.error(`节点执行异常: ${nodeId} - ${error.message}`, 'NodeExecutor');
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
