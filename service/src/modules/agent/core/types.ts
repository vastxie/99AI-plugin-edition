/**
 * 工作流引擎核心类型定义
 */

// 工作流配置接口
export interface WorkflowConfig {
  workflow: {
    id: string;
    name: string;
    version: string;
    description?: string;
    nodes: WorkflowNodeConfig[];
    flow: FlowConfig[];
    config?: Record<string, any>;
  };
}

// 工作流节点配置接口
export interface WorkflowNodeConfig {
  id: string;
  type: NodeType | string; // 支持枚举或字符串类型
  config?: Record<string, any>;
  condition?: string; // 条件表达式
}

// 流程配置接口
export interface FlowConfig {
  from: string;
  to: string;
  condition?: string; // 路由条件
}

// 节点类型枚举
export enum NodeType {
  LLM = 'llm',
  THINKING = 'thinking',
  SEARCH = 'search',
  SENSITIVE_FILTER = 'sensitive_filter',
  QUESTION_GENERATOR = 'question_generator',
  FILE_VECTOR_SEARCH = 'file_vector_search',
  IMAGE_ANALYSIS = 'image_analysis',
  MCP_TOOL = 'mcp_tool',
  TOOL = 'tool', // 统一工具节点
  UNIFIED_PPT = 'unified_ppt', // 统一PPT节点
  DOCUMENT_EDIT = 'document-edit', // 文档编辑节点
  END = 'end',
}

// 执行上下文接口
export interface ExecutionContext {
  // 工作流ID
  workflowId?: string;

  // 工作流执行实例ID（每次执行唯一）
  workflowExecutionId?: string;

  // 节点执行序号（递增）
  nodeExecutionSequence?: number;

  // 节点执行记录
  nodeExecutions?: Array<{
    nodeExecutionId: string; // 节点执行唯一ID
    nodeId: string; // 节点配置ID
    nodeType: string; // 节点类型
    sequence: number; // 执行顺序
    timestamp: number; // 执行时间戳
    status?: 'executing' | 'completed' | 'failed' | 'skipped';
  }>;

  // 当前正在执行的节点ID（供节点内部使用）
  currentNodeExecutionId?: string;

  // 当前节点的配置ID（用于Token记录等）
  currentNodeId?: string;

  // 消息历史
  messages: any[];

  // 执行选项
  options: ExecutionOptions;

  // 工作流状态
  state: Record<string, any>;

  // 执行计划（动态规划器使用）
  executionPlan?: {
    expectedNodes?: string[]; // 前端期望调用的节点列表
    executedNodes: string[]; // 已执行的节点列表
    currentPhase?: string; // 当前执行阶段
    nextNode?: string; // 下一个要执行的节点
    nextNodeParams?: any; // 下一个节点的参数
    reasoning?: string; // 决策理由
  };

  // 统一的agentContent（与最终保存格式一致）
  agentContent?: any;

  // Token计数器（在整个工作流执行期间累积）
  totalTokens?: number;

  // 详细的 Token 使用记录
  tokenUsage?: {
    totalInputTokens: number; // 总输入 tokens
    totalOutputTokens: number; // 总输出 tokens
    totalTokens: number; // 总 tokens (输入+输出)
    details: Array<{
      // 每个节点的详细记录
      nodeId: string;
      nodeType: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      timestamp: string;
      description?: string; // 描述（如：FC搜索、思考、LLM回复等）
    }>;
  };

  // 进度回调
  onProgress?: (data: ProgressData) => void;

  // 错误回调
  onError?: (error: any) => void;

  // 中断控制器
  abortController?: AbortController;
}

// 执行选项接口
export interface ExecutionOptions {
  // 基础配置
  chatId?: string;
  apiKey?: string;
  model?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  proxyUrl?: string;

  // 扩展配置
  stream?: boolean;
  debug?: boolean;
  additionalParams?: Record<string, any>;

  // 回调函数（只保留工作流执行期间需要的）
  onProgress?: (data: any) => void;
  onError?: (error: any) => void;

  // 兼容现有系统
  [key: string]: any;
}

// 进度数据接口
export interface ProgressData {
  nodeId?: string;
  nodeType?: string;
  status?: string;
  statusMessage?: string; // 状态描述信息
  content?: Array<{ type: string; text: string }>;
  reasoning_content?: Array<{ type: string; text: string }>;
  progress?: number;
  [key: string]: any;
}

// 工作流执行结果接口
export interface WorkflowResult {
  chatId: string;
  content: string;
  reasoning_content?: string;
  finishReason: string | null;
  model: string;
  modelName: string;
  errMsg: string;
  workflowId?: string;
  [key: string]: any;
}

// LLM节点配置接口
export interface LLMNodeConfig {
  // 模型配置
  model?: string;
  temperature?: number;
  maxTokens?: number;

  // 提示词配置
  systemPrompt?: string;
  userPromptTemplate?: string;

  // 输出配置
  outputKey?: string; // 将结果存储到状态的哪个键

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

// 思考节点配置接口
export interface ThinkingNodeConfig {
  // 思考模型配置（优先级高于全局配置）
  thinkingModel?: string;
  thinkingUrl?: string;
  thinkingKey?: string;
  thinkingType?: number; // 0:关闭 1:全局思考 2:模型思考

  // 输出配置
  outputKey?: string; // 将思考结果存储到状态的哪个键，默认为'thinkingResult'

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.usingDeepThinking === true'

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

// 节点执行结果接口
export interface NodeResult {
  success: boolean;
  data?: any;
  error?: string;
  stateUpdates?: Record<string, any>;
  agentDataUpdates?: Record<string, any>; // 用于更新agentData的数据
}

// 抽象节点接口
export interface INode {
  execute(config: any, context: ExecutionContext): Promise<NodeResult>;
}

/**
 * 结束节点配置接口
 */
export interface EndNodeConfig {
  // 输出配置
  outputKey?: string; // 将最终结果存储到状态的哪个键

  // 结果格式配置
  resultFormat?: 'full' | 'content_only' | 'thinking_only' | 'custom';
  customFormatter?: string; // 自定义格式化函数名

  // 结果处理配置
  includeMeta?: boolean; // 是否包含元数据（调试信息等）
  validateResult?: boolean; // 是否验证结果完整性

  // 状态收集配置
  collectKeys?: string[]; // 要收集的状态键列表，默认收集所有

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 搜索节点配置接口
 */
export interface SearchNodeConfig {
  // 输出配置
  outputKey?: string; // 将搜索结果存储到状态的哪个键，默认为'searchResult'

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.usingNetwork === true'

  // 搜索配置
  searchQuery?: string; // 动态传入的搜索关键词（由规划节点决定）
  maxResults?: number; // 最大搜索结果数量
  searchDepth?: 'basic' | 'advanced'; // 搜索深度
  includeImages?: boolean; // 是否包含图片搜索

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 敏感词过滤节点配置接口
 */
export interface SensitiveFilterNodeConfig {
  // 输出配置
  outputKey?: string; // 将过滤结果存储到状态的哪个键

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.isSensitiveWordFilter === true'

  // 过滤配置
  inputKey?: string; // 从哪个状态键读取要过滤的内容，默认读取'content'

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 问题推荐节点配置接口
 */
export interface QuestionGeneratorNodeConfig {
  // 输出配置
  outputKey?: string; // 将推荐问题存储到状态的哪个键

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.isGeneratePromptReference === true'

  // 生成配置
  questionCount?: number; // 生成问题数量，默认3个
  maxQuestionLength?: number; // 每个问题最大长度，默认30字符
  contentLength?: number; // 用于分析的内容长度，默认200字符

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 文件向量搜索节点配置接口
 */
export interface FileVectorSearchNodeConfig {
  // 输出配置
  outputKey?: string; // 将搜索结果存储到状态的哪个键

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.isFileUpload === 2'

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 图片分析节点配置接口
 */
export interface ImageAnalysisNodeConfig {
  // 输出配置
  outputKey?: string; // 将分析结果存储到状态的哪个键

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如'options.isImageUpload === 3'

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * MCP工具调用节点配置接口
 */
export interface MCPToolNodeConfig {
  // 输出配置
  outputKey?: string; // 将MCP工具调用结果存储到状态的哪个键

  // 条件配置
  enableCondition?: string; // 启用条件表达式，如 'options.usingTool === true'

  // 进度消息配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };

  // MCP特定配置
  timeout?: number; // 超时时间，默认使用传入的timeout
}

/**
 * Flowith节点配置
 */
export interface FlowithNodeConfig {
  // 输出配置
  outputKey?: string; // 输出键名，默认为 'flowithResult'

  // 条件配置
  enableCondition?: string; // 启用条件，如 "options.model.includes('flowith')"

  // Flowith特定配置
  flowithId?: string; // 知识库ID，如果不传则从options中获取
  flowithName?: string; // 模型名称，如果不传则从options中获取

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * PPT主题生成节点配置接口
 */
export interface PPTThemeNodeConfig {
  // 输出配置
  outputKey?: string; // 将主题存储到状态的哪个键，默认为'pptTheme'

  // 进度消息配置
  progressMessages?: {
    start?: string;
    end?: string;
  };
}

/**
 * PPT大纲生成节点配置接口
 */
export interface PPTOutlineNodeConfig {
  // 输出配置
  outputKey?: string; // 将大纲存储到状态的哪个键，默认为'pptOutline'

  // 大纲配置
  minSlides?: number; // 最少页数，默认5
  maxSlides?: number; // 最多页数，默认15

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * PPT研究节点配置接口
 */
export interface PPTResearchNodeConfig {
  // 输出配置
  outputKey?: string; // 将研究结果存储到状态的哪个键，默认为'pptResearch'

  // 输入配置
  outlineKey?: string; // 从哪个状态键读取大纲，默认为'pptOutline'

  // 研究配置
  enableSearch?: boolean; // 是否启用网络搜索，默认true
  enableMCP?: boolean; // 是否启用MCP工具，默认true
  searchDepth?: 'basic' | 'advanced'; // 搜索深度

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * PPT内容生成节点配置接口
 */
export interface PPTContentNodeConfig {
  // 输出配置
  outputKey?: string; // 将内容存储到状态的哪个键，默认为'pptContent'

  // 输入配置
  outlineKey?: string; // 从哪个状态键读取大纲
  researchKey?: string; // 从哪个状态键读取研究结果

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * PPT格式化节点配置接口
 */
export interface PPTFormatterNodeConfig {
  // 输出配置
  outputKey?: string; // 将格式化结果存储到状态的哪个键，默认为'pptData'

  // 输入配置
  contentKey?: string; // 从哪个状态键读取内容
  outlineKey?: string; // 从哪个状态键读取大纲

  // 格式配置
  template?: 'grid' | 'template' | 'flexible' | 'dynamic'; // PPT模板类型，默认'grid'

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 规划节点配置接口
 */
export interface PlannerNodeConfig {
  // 输出配置
  outputKey?: string; // 将规划结果存储到状态的哪个键

  // 规划配置
  maxIterations?: number; // 最大规划迭代次数，默认10
  enableDynamicRouting?: boolean; // 是否启用动态路由，默认true

  // 进度配置
  progressMessages?: {
    start?: string;
    processing?: string;
    end?: string;
  };
}

/**
 * 节点配置类型联合
 */
export type NodeConfig =
  | LLMNodeConfig
  | ThinkingNodeConfig
  | SearchNodeConfig
  | SensitiveFilterNodeConfig
  | QuestionGeneratorNodeConfig
  | FileVectorSearchNodeConfig
  | ImageAnalysisNodeConfig
  | MCPToolNodeConfig
  | PPTThemeNodeConfig
  | PPTOutlineNodeConfig
  | PPTResearchNodeConfig
  | PPTContentNodeConfig
  | PPTFormatterNodeConfig
  | PlannerNodeConfig
  | EndNodeConfig
  | FlowithNodeConfig;
