/**
 * 统一的 Agent Content 数据结构
 * 用于存储所有 Agent 相关的数据
 */
export interface AgentContent {
  // 元数据
  metadata: {
    version: string; // 数据结构版本
    type: string; // agent类型: 'ppt' | 'writing' | 'analysis' | 'chat' 等
    workflowId?: string; // 使用的工作流
    timestamp: string; // 创建时间
    status: 'completed' | 'partial' | 'error';
  };

  // 核心数据
  data: {
    // PPT 相关 - 统一格式
    ppt?: {
      type: 'theme' | 'complete'; // PPT类型：主题选择或完整PPT
      status: 'processing' | 'completed' | 'failed'; // 当前状态
      statusMessage?: string; // 状态描述
      input: {
        title?: string; // PPT标题/主题
        requirements?: string; // 用户要求
        selectedTheme?: any; // 选中的主题（生成完整PPT时）
      };
      output?: {
        // type为theme时，output包含多个主题选项
        themes?: Array<{
          title: string;
          description: string;
          keywords: string[];
          style?: string;
        }>;
        // type为complete时，output包含完整PPT数据
        pptData?: {
          title: string;
          subtitle?: string;
          author?: string;
          date?: string;
          theme?: any;
          slides: any[];
          metadata?: any;
        };
      };
      steps?: Array<{
        id: string;
        name: string;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        description?: string;
        progress?: number;
        startTime?: number;
        endTime?: number;
        error?: string;
      }>; // PPT生成步骤
      error?: string; // 错误信息
      timestamp?: string; // 时间戳
    };

    // 文件分析相关
    fileAnalysis?: {
      fileUrl?: string;
      searchResults?: any; // 文件向量搜索结果
      summary?: string;
    };

    // 工具调用相关
    toolCalls?: any[]; // 工具调用记录（旧格式，保留兼容性）
    toolExecutions?: Array<{
      id: string;
      type: 'search' | 'mcp' | 'file' | 'other';
      name: string;
      status: 'pending' | 'loading' | 'success' | 'error';
      timestamp: number;

      // 搜索相关
      searchQuery?: string;
      searchQueries?: string[];
      searchQueryDetails?: any[];
      searchResults?: any[];
      images?: string[];
      currentQuery?: string;
      queryIndex?: number;
      totalQueries?: number;

      // MCP工具相关
      mcpTool?: string;
      mcpParams?: any;
      mcpResult?: any;

      // 文件搜索相关
      fileQuery?: string;
      fileResults?: any[];

      // 通用
      error?: string;
      details?: any;
    }>; // 统一的工具执行记录

    // 网络搜索相关
    networkSearch?: {
      query?: string;
      results?: any[];
    };

    // 写作相关（未来扩展）
    writing?: {
      type?: string; // 'article' | 'email' | 'report' 等
      outline?: any;
      draft?: string;
      finalContent?: string;
    };

    // 推理内容
    reasoning?: {
      content?: string;
      steps?: any[];
    };

    // 通用扩展字段
    custom?: Record<string, any>;
  };

  // 执行状态
  execution?: {
    mode: string;
    workflowId?: string;
    nodeType?: string;
    executionTime: string;
    success: boolean;
    error?: string;
    aborted?: boolean;
  };

  // UI 提示信息
  display?: {
    pluginParam?: string; // UI组件类型标识
    title?: string; // 显示标题
    description?: string; // 描述信息
    actions?: Array<{
      // 可用操作
      type: string;
      label: string;
      enabled: boolean;
    }>;
  };
}
