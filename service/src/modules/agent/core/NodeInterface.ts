/**
 * 统一的节点接口定义
 * 所有节点都应该遵循这个接口规范
 */

import { ExecutionContext } from './types';

/**
 * 统一的节点输入接口
 */
export interface NodeInput {
  // 基础输入
  messages: any[]; // 消息历史
  config: Record<string, any>; // 节点配置
  context: ExecutionContext; // 执行上下文

  // 全局配置（从context.options提取）
  globalConfig: {
    openaiBaseUrl?: string;
    openaiBaseKey?: string;
    openaiBaseModel?: string;
    // 其他全局配置
    [key: string]: any;
  };

  // 动态参数（由规划节点或外部传入）
  dynamicParams?: {
    searchQuery?: string; // 搜索关键词
    toolName?: string; // 工具名称
    toolParams?: any; // 工具参数
    model?: string; // 动态指定的模型
    temperature?: number; // 动态温度参数
    maxTokens?: number; // 最大token数
    [key: string]: any; // 其他动态参数
  };
}

/**
 * 流式输出类型
 */
export interface StreamOutput {
  type: 'text' | 'status' | 'progress' | 'data' | 'error';
  content?: string; // 文本内容（用于text和status类型）
  status?: string; // 状态标识
  progress?: number; // 进度百分比（0-100）
  data?: any; // 附加数据（用于data类型）
  error?: string; // 错误信息（用于error类型）
  metadata?: Record<string, any>; // 元数据
}

/**
 * 节点执行结果
 */
export interface NodeOutputResult {
  success: boolean; // 是否成功
  content?: string | any[]; // 主要内容
  data?: any; // 附加数据
  error?: string; // 错误信息
  metadata?: {
    // 元数据
    tokenCount?: number; // Token使用量
    executionTime?: number; // 执行时间（毫秒）
    model?: string; // 使用的模型
    [key: string]: any; // 其他元数据
  };
}

/**
 * 统一的节点输出接口
 */
export interface NodeOutput {
  // 最终结果（必需）
  result: NodeOutputResult;

  // 状态更新（可选）
  stateUpdates?: Record<string, any>;

  // Agent数据更新（可选）
  agentDataUpdates?: {
    networkSearch?: {
      queries?: string[];
      results?: any[];
      images?: string[];
      iterations?: number;
      [key: string]: any;
    };
    fileAnalysis?: {
      fileUrl?: string;
      searchResults?: any;
      summary?: string;
      [key: string]: any;
    };
    imageAnalysis?: {
      imageUrl?: string;
      analysis?: string;
      objects?: any[];
      [key: string]: any;
    };
    reasoning?: {
      content?: string;
      steps?: any[];
      [key: string]: any;
    };
    toolCalls?: Array<{
      tool: string;
      params: any;
      result: any;
    }>;
    llm?: {
      model?: string;
      response?: string;
      tokenUsage?: any;
      [key: string]: any;
    };
    planner?: {
      decisions?: any[];
      iterations?: number;
      [key: string]: any;
    };
    [key: string]: any; // 其他agent数据
  };
}

/**
 * 节点元信息接口
 */
export interface NodeMeta {
  id: string; // 节点ID
  type: string; // 节点类型
  name: string; // 节点名称
  description?: string; // 节点描述
  version?: string; // 节点版本
  supportStream?: boolean; // 是否支持流式输出
  supportDynamicParams?: boolean; // 是否支持动态参数
}

/**
 * 节点生命周期钩子
 */
export interface NodeLifecycle {
  onBeforeExecute?: (input: NodeInput) => Promise<void>;
  onAfterExecute?: (output: NodeOutput, input: NodeInput) => Promise<void>;
  onError?: (error: Error, input: NodeInput) => Promise<void>;
  onStream?: (stream: StreamOutput, input: NodeInput) => void;
}

/**
 * 扩展的节点接口
 */
export interface IExtendedNode {
  // 元信息
  meta: NodeMeta;

  // 核心执行方法
  execute(input: NodeInput): Promise<NodeOutput>;

  // 验证输入
  validateInput?(input: NodeInput): Promise<boolean>;

  // 准备输入（预处理）
  prepareInput?(config: any, context: ExecutionContext): Promise<NodeInput>;

  // 处理输出（后处理）
  processOutput?(output: NodeOutput, input: NodeInput): Promise<NodeOutput>;

  // 生命周期钩子
  lifecycle?: NodeLifecycle;
}
