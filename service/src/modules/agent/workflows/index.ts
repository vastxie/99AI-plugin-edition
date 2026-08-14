import { NodeType, WorkflowConfig } from '../core/types';

/**
 * Flowith对话工作流
 * 专门处理Flowith模型，直接调用Flowith服务，跳过其他分析步骤
 */
export const flowithChatWorkflow: WorkflowConfig = {
  workflow: {
    id: 'flowith-chat',
    name: 'Flowith对话工作流',
    version: '1.0.0',
    description: '专门处理Flowith模型的简化工作流',
    nodes: [
      {
        id: 'flowith_processor',
        type: 'flowith' as any, // 临时类型转换，因为flowith还没添加到NodeType枚举
        config: {
          enableCondition: 'options.model && options.model.includes("flowith")',
          progressMessages: {
            start: '开始Flowith处理...',
            processing: 'Flowith处理中...',
            end: 'Flowith处理完成',
          },
          outputKey: 'flowithResult',
        },
      },
      {
        id: 'result_formatter',
        type: NodeType.END,
        config: {
          collectKeys: ['flowithResult'],
          resultFormat: 'custom',
          progressMessages: {
            start: '整理最终结果...',
            end: '工作流完成',
          },
        },
      },
    ],
    flow: [
      {
        from: 'START',
        to: 'flowith_processor',
      },
      {
        from: 'flowith_processor',
        to: 'result_formatter',
      },
      {
        from: 'result_formatter',
        to: 'END',
      },
    ],
    config: {
      description: 'Flowith专用工作流，直接调用Flowith服务，包含知识库搜索功能',
      defaultModel: 'flowith',
      defaultTemperature: 1,
      maxTokens: 4000,
      skipStandardAnalysis: true,
      supportedModels: ['flowith'],
      category: 'flowith-chat',
      resultKey: 'flowithResult',
    },
  },
};

/**
 * 智能聊天工作流（统一版本）
 * 根据参数自动决定是否启用深度思考、网络搜索、敏感词过滤、问题推荐，然后进行LLM回复
 */
export const intelligentChatWorkflow: WorkflowConfig = {
  workflow: {
    id: 'intelligent-chat',
    name: '智能聊天工作流',
    version: '1.0.0',
    description:
      '统一的智能聊天工作流，支持文件分析、图片分析、搜索、MCP工具、思考、回复、过滤、推荐的完整流程',
    nodes: [
      {
        id: 'file_analyzer',
        type: NodeType.FILE_VECTOR_SEARCH,
        config: {
          outputKey: 'fileAnalysisResult',
          enableCondition:
            '(options.fileUrl && options.fileUrl.length > 0) && (options.isFileUpload === 2 || options.useKnowledgeBase === true)',
          progressMessages: {
            start: '开始分析文件内容...',
            processing: '正在进行文件向量搜索...',
            end: '文件分析完成',
          },
        },
      },
      {
        id: 'image_analyzer',
        type: NodeType.IMAGE_ANALYSIS,
        config: {
          outputKey: 'imageAnalysisResult',
          enableCondition:
            'options.imageUrl && options.imageUrl.length > 0 && (options.isImageUpload === 3 || (options.usingDeepThinking === true && options.deepThinkingType !== 3 && options.deepThinkingType !== 4))',
          progressMessages: {
            start: '开始分析图片内容...',
            processing: '正在识别图片内容...',
            end: '图片分析完成',
          },
        },
      },
      {
        id: 'tool_handler',
        type: NodeType.TOOL,
        config: {
          outputKey: 'toolResult',
          enableCondition: 'options.usingTool === true',
          maxResults: 10,
          searchDepth: 'basic',
          includeImages: true,
          timeout: 60000,
          progressMessages: {
            start: '启动工具调用...',
            processing: '处理工具请求中...',
            end: '工具调用完成',
          },
        },
      },
      {
        id: 'unified_ppt',
        type: NodeType.UNIFIED_PPT,
        config: {
          outputKey: 'pptResult',
          enableCondition: 'options.pluginParam === "ppt-generation"',
          mode: 'auto', // auto模式会根据上下文自动决定生成模式
          progressMessages: {
            start: '开始生成PPT...',
            processing: 'PPT生成中...',
            end: 'PPT生成完成',
          },
        },
      },
      {
        id: 'document_editor',
        type: NodeType.DOCUMENT_EDIT,
        config: {
          outputKey: 'editResult',
          enableCondition: 'options.editorContent && options.editorContent.markdown',
          progressMessages: {
            start: '分析文档编辑需求...',
            processing: '生成文档修改方案...',
            end: '文档编辑分析完成',
          },
        },
      },
      {
        id: 'thinking_analyzer',
        type: NodeType.THINKING,
        config: {
          outputKey: 'sharedState', // 存储到共享状态
          enableCondition:
            'options.usingDeepThinking === true && options.pluginParam !== "ppt-generation"',
          progressMessages: {
            start: '启动深度思考引擎...',
            processing: '深度分析中...',
            end: '思考分析完成',
          },
        },
      },
      {
        id: 'ai_responder',
        type: NodeType.LLM,
        config: {
          systemPrompt:
            '你是一个智能AI助手。请根据用户的问题提供准确、有帮助、友好的回答。如果有文件分析、图片分析、搜索结果或工具调用结果，请优先使用这些最新的信息回答问题。',
          outputKey: 'sharedState', // 也存储到共享状态，会合并
          enableCondition: 'options.pluginParam !== "ppt-generation"', // PPT模式下跳过
          progressMessages: {
            start: '生成智能回复...',
            processing: '处理中...',
            end: '回复生成完成',
          },
        },
      },
      {
        id: 'sensitive_filter',
        type: NodeType.SENSITIVE_FILTER,
        config: {
          outputKey: 'filterResult',
          enableCondition:
            'options.isSensitiveWordFilter === true && options.pluginParam !== "ppt-generation"',
          inputKey: 'sharedState',
          progressMessages: {
            start: '检查内容安全性...',
            processing: '过滤敏感词...',
            end: '内容安全检查完成',
          },
        },
      },
      {
        id: 'question_generator',
        type: NodeType.QUESTION_GENERATOR,
        config: {
          outputKey: 'questionResult',
          enableCondition:
            'options.isGeneratePromptReference === true && options.pluginParam !== "ppt-generation"',
          questionCount: 3,
          maxQuestionLength: 30,
          contentLength: 200,
          progressMessages: {
            start: '生成相关问题推荐...',
            processing: '分析用户意图...',
            end: '问题推荐生成完成',
          },
        },
      },
      {
        id: 'result_formatter',
        type: NodeType.END,
        config: {
          outputKey: 'finalResult',
          resultFormat: 'full',
          validateResult: true,
          includeMeta: false,
          collectKeys: [
            'fileAnalysisResult',
            'imageAnalysisResult',
            'toolResult',
            'pptResult',
            'editResult',
            'sharedState',
            'filterResult',
            'questionResult',
          ],
          progressMessages: {
            start: '整理最终结果...',
            processing: '格式化输出...',
            end: '工作流完成',
          },
        },
      },
    ],
    flow: [
      {
        from: 'START',
        to: 'file_analyzer',
      },
      {
        from: 'file_analyzer',
        to: 'image_analyzer',
      },
      {
        from: 'image_analyzer',
        to: 'tool_handler',
      },
      {
        from: 'tool_handler',
        to: 'unified_ppt',
      },
      {
        from: 'unified_ppt',
        to: 'document_editor',
      },
      {
        from: 'document_editor',
        to: 'thinking_analyzer',
      },
      {
        from: 'thinking_analyzer',
        to: 'ai_responder',
      },
      {
        from: 'ai_responder',
        to: 'sensitive_filter',
      },
      {
        from: 'sensitive_filter',
        to: 'question_generator',
      },
      {
        from: 'question_generator',
        to: 'result_formatter',
      },
      {
        from: 'result_formatter',
        to: 'END',
      },
    ],
    config: {
      description:
        '完整的智能聊天工作流：文件分析 → 图片分析 → 网络搜索 → MCP工具 → 思考 → 回复 → 过滤 → 推荐 → 输出',
      defaultModel: 'gpt-4o-mini',
      defaultTemperature: 0.7,
      maxTokens: 4000,
      supportFileAnalysis: true,
      supportImageAnalysis: true,
      supportMCPTools: true,
      supportDeepThinking: true,
      supportNetworkSearch: true,
      supportSensitiveFilter: true,
      supportQuestionGeneration: true,
      supportedModels: ['gpt-4', 'gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini'],
      thinkingModels: ['o1-preview', 'o1-mini', 'gpt-4o', 'deepseek-chat'],
      category: 'intelligent-chat',
      resultKey: 'finalResult', // 指定结果键，供WorkflowEngine使用
    },
  },
};

/**
 * 所有可用的工作流配置
 */
export const allWorkflows: WorkflowConfig[] = [flowithChatWorkflow, intelligentChatWorkflow];

/**
 * 根据ID获取工作流配置
 */
export function getWorkflowById(id: string): WorkflowConfig | undefined {
  return allWorkflows.find(workflow => workflow.workflow.id === id);
}

/**
 * 获取所有工作流ID列表
 */
export function getAllWorkflowIds(): string[] {
  return allWorkflows.map(workflow => workflow.workflow.id);
}
