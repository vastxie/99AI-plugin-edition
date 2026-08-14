// MCP 相关类型定义
export interface McpMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface McpToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
    response?: string;
    error?: string;
  };
}

export interface McpInputs {
  timeout: number;
  usingTool?: boolean;
  onProgress?: (data: McpProgressData) => void;
  onDatabase?: (data: McpDatabaseData) => void;
}

export interface McpProgressData {
  text?: string;
  tool_calls?: string;
}

export interface McpDatabaseData {
  tool_calls_round?: {
    round: number;
    tool_calls: string;
    timestamp: Date;
  };
  tool_call_result?: {
    tool_id: string;
    tool_name: string;
    status: 'success' | 'error';
    result?: any;
    error_message?: string;
    error_detail?: string;
    arguments: any;
    timestamp: Date;
  };
  tool_calls_accumulated?: {
    round: number;
    accumulated_results: string;
    timestamp: Date;
  };
  tool_calls_error?: {
    round: number;
    error: string;
    timestamp: Date;
  };
  mcp_service_error?: {
    error: string;
    timestamp: Date;
  };
  mcpToolResults?: string;
}

export interface McpToolResult {
  tool_calls?: string;
  [key: string]: any;
}

export interface McpClient {
  tools: McpTool[];
  [key: string]: any;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface McpToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}
