/**
 * 统一的工作流状态管理系统
 * 用于所有类型的工作流（搜索、PPT、文件分析等）的状态同步
 */

/**
 * 工作流类型枚举
 */
export enum WorkflowType {
  SEARCH = 'search', // 网络搜索工作流
  PPT = 'ppt', // PPT生成工作流
  FILE_ANALYSIS = 'file', // 文件分析工作流
  IMAGE_ANALYSIS = 'image', // 图像分析工作流
  MCP_TOOL = 'mcp', // MCP工具调用工作流
  REASONING = 'reasoning', // 推理工作流
  CUSTOM = 'custom', // 自定义工作流
}

/**
 * 节点状态枚举
 */
export enum NodeStatus {
  // 准备阶段
  PENDING = 'pending', // 等待执行
  INITIALIZING = 'initializing', // 初始化中

  // 执行阶段
  PLANNING = 'planning', // 规划中
  ANALYZING = 'analyzing', // 分析中
  SEARCHING = 'searching', // 搜索中
  GENERATING = 'generating', // 生成中
  PROCESSING = 'processing', // 处理中
  ITERATING = 'iterating', // 迭代中

  // 决策阶段
  DECIDING = 'deciding', // 决策中
  DECIDED = 'decided', // 已决策

  // 结果收集
  COLLECTING = 'collecting', // 收集结果中
  FORMATTING = 'formatting', // 格式化中

  // 完成状态
  COMPLETED = 'completed', // 完成
  SKIPPED = 'skipped', // 跳过
  FAILED = 'failed', // 失败
  ABORTED = 'aborted', // 中止
}

/**
 * 工作流状态更新接口
 */
export interface WorkflowStatusUpdate {
  // 基础信息
  workflowType: WorkflowType | string; // 工作流类型
  nodeId: string; // 节点ID
  nodeType: string; // 节点类型
  nodeStatus: NodeStatus | string; // 节点状态
  nodeMessage: string; // 状态消息（用户可见）

  // 可选：节点特定数据
  nodeData?: Record<string, any>; // 节点特定的数据

  // 可选：进度信息
  progress?: number; // 进度百分比 (0-100)
  timestamp?: string; // 时间戳
}

/**
 * 搜索工作流特定数据
 */
export interface SearchNodeData {
  // 规划阶段
  searchDecision?: boolean; // 是否需要搜索
  searchPlan?: {
    // 搜索计划
    strategy: 'single' | 'multiple' | 'iterative';
    queries: Array<{
      query: string;
      purpose?: string;
      confidence?: number;
    }>;
    reason: string;
  };

  // 执行阶段
  searchStrategy?: string; // 搜索策略
  currentQuery?: string; // 当前搜索查询
  queries?: string[]; // 查询列表

  // 迭代阶段
  iteration?: number; // 当前迭代次数
  maxIterations?: number; // 最大迭代次数

  // 结果阶段
  searchQuery?: string; // 已完成的查询
  resultCount?: number; // 结果数量
  imageCount?: number; // 图片数量
}

/**
 * PPT工作流特定数据
 */
export interface PPTNodeData {
  // 主题阶段
  theme?: any; // PPT主题

  // 大纲阶段
  outline?: any; // PPT大纲
  outlineProgress?: number; // 大纲生成进度

  // 研究阶段
  researchResults?: any[]; // 研究结果

  // 内容生成阶段
  slideCount?: number; // 幻灯片数量
  currentSlide?: number; // 当前处理的幻灯片

  // 格式化阶段
  template?: string; // 使用的模板
  exportFormat?: string; // 导出格式
}

/**
 * 文件分析工作流特定数据
 */
export interface FileAnalysisNodeData {
  fileName?: string; // 文件名
  fileType?: string; // 文件类型
  fileSize?: number; // 文件大小
  analysisType?: string; // 分析类型
  extractedText?: string; // 提取的文本
  summary?: string; // 摘要
}

/**
 * 工作流状态辅助类
 */
export class WorkflowStatusHelper {
  /**
   * 创建标准的工作流状态更新
   */
  static createStatusUpdate(
    workflowType: WorkflowType | string,
    nodeId: string,
    nodeType: string,
    nodeStatus: NodeStatus | string,
    nodeMessage: string,
    nodeData?: Record<string, any>,
  ): WorkflowStatusUpdate {
    return {
      workflowType,
      nodeId,
      nodeType,
      nodeStatus,
      nodeMessage,
      nodeData,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 创建搜索工作流状态更新
   */
  static createSearchStatus(
    nodeId: string,
    nodeStatus: NodeStatus | string,
    nodeMessage: string,
    searchData?: SearchNodeData,
  ): WorkflowStatusUpdate {
    return this.createStatusUpdate(
      WorkflowType.SEARCH,
      nodeId,
      'search',
      nodeStatus,
      nodeMessage,
      searchData,
    );
  }

  /**
   * 创建PPT工作流状态更新
   */
  static createPPTStatus(
    nodeId: string,
    nodeStatus: NodeStatus | string,
    nodeMessage: string,
    pptData?: PPTNodeData,
  ): WorkflowStatusUpdate {
    return this.createStatusUpdate(
      WorkflowType.PPT,
      nodeId,
      'ppt',
      nodeStatus,
      nodeMessage,
      pptData,
    );
  }

  /**
   * 获取状态的显示文本
   */
  static getStatusDisplayText(status: NodeStatus | string): string {
    const statusTexts: Record<string, string> = {
      [NodeStatus.PENDING]: '等待中',
      [NodeStatus.INITIALIZING]: '初始化中',
      [NodeStatus.PLANNING]: '规划中',
      [NodeStatus.ANALYZING]: '分析中',
      [NodeStatus.SEARCHING]: '搜索中',
      [NodeStatus.GENERATING]: '生成中',
      [NodeStatus.PROCESSING]: '处理中',
      [NodeStatus.ITERATING]: '迭代中',
      [NodeStatus.DECIDING]: '决策中',
      [NodeStatus.DECIDED]: '已决策',
      [NodeStatus.COLLECTING]: '收集结果中',
      [NodeStatus.FORMATTING]: '格式化中',
      [NodeStatus.COMPLETED]: '已完成',
      [NodeStatus.SKIPPED]: '已跳过',
      [NodeStatus.FAILED]: '失败',
      [NodeStatus.ABORTED]: '已中止',
    };

    return statusTexts[status] || status;
  }

  /**
   * 判断是否为终止状态
   */
  static isTerminalStatus(status: NodeStatus | string): boolean {
    return [
      NodeStatus.COMPLETED,
      NodeStatus.SKIPPED,
      NodeStatus.FAILED,
      NodeStatus.ABORTED,
    ].includes(status as NodeStatus);
  }

  /**
   * 判断是否为进行中状态
   */
  static isProcessingStatus(status: NodeStatus | string): boolean {
    return ![
      NodeStatus.PENDING,
      NodeStatus.COMPLETED,
      NodeStatus.SKIPPED,
      NodeStatus.FAILED,
      NodeStatus.ABORTED,
    ].includes(status as NodeStatus);
  }
}
