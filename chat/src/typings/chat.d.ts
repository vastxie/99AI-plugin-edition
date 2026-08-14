declare namespace Chat {
  interface Chat {
    chatId?: number
    content: string
    canvasText?: string
    modelType?: number
    status?: number
    model?: string
    modelName?: string
    role?: string
    ttsUrl?: string
    imageUrl?: string
    fileUrl?: string
    videoUrl?: string
    audioUrl?: string
    action?: string
    drawId?: string
    customId?: string
    usage?: object
    error?: boolean
    loading?: boolean
    usingPlugin?: string
    taskId?: string
    taskData?: any
    conversationOptions?: ConversationRequest | null
    pluginParam?: string
    promptReference?: string
    networkSearchResult?: string
    fileVectorResult?: string
    usingTool?: boolean
    usingDeepThinking?: boolean
    mcpToolUse?: string
    reasoningText?: string
    reasoning_content?: string
    tool_calls?: string
    progress?: string
    useFileSearch?: boolean
    agent_content?: string
    pptTheme?: string
    pptOutline?: string
    appId?: number
  }

  interface History {
    title: string
    isEdit: boolean
    uuid: number
    isSticky: boolean
    config: string
  }

  interface Plugin {
    pluginId: number
    pluginName: string
    description: string
    pluginImg: string
    parameters: string
    deductType?: number
    drawingType?: number
    modelType?: number
    uploadTypes?: string | null
    customOptions?: any[]
    keyType?: number
  }

  interface ChatState {
    active: number
    usingContext: boolean
    usingTool: boolean
    usingDeepThinking: boolean
    reasoningText: string
    history?: History[]
    baseConfig: any
    chat?: { uuid: number; data: Chat[] }[]
    groupList: {
      uuid: number
      title: string
      appId: number
      pluginId?: number
      isEdit: boolean
      isSticky: boolean
      config: string
      createdAt: Date
      updatedAt: Date
      appLogo?: string
      fileUrl?: string
    }[]
    chatList: Chat[]
    groupKeyWord?: string
    activeConfig?: any
    activeModel?: string
    activeModelName?: string
    activeGroupFileUrl?: string
    activeModelType?: number
    activeModelFileUpload?: number
    activeModelDeductType?: number
    activeModelPrice?: number
    activeGroupAppId?: number
    isStreamIn?: boolean
    pluginList: Plugin[]
    modelList: []
    modelsLoaded: boolean
    prompt?: string
    currentPlugin?: Plugin | null
    // 全局的@应用选择状态
    selectedApp: any
    isSelectedApp: boolean
  }

  interface ConversationRequest {
    conversationId?: string
    parentMessageId?: string
    temperature?: number
    model?: number
    modelType?: number
    groupId?: number
  }

  interface ConversationParams {
    msg: string
    action?: string
    drawId?: string
    customId?: string
    model?: string
    modelName?: string
    modelType?: number
    usingPlugin?: any
    pluginParam?: string
    appId?: number
    extraParam?: any
    fileUrl?: string
    chatId?: number
    taskId?: string
    imageUrl?: string
    videoUrl?: string
  }

  interface SearchAppsResponse {}

  interface ConversationResponse {
    conversationId: string
    detail: {
      choices: {
        finish_reason: string
        index: number
        logprobs: any
        text: string
      }[]
      created: number
      id: string
      model: string
      object: string
      usage: {
        completion_tokens: number
        prompt_tokens: number
        total_tokens: number
      }
    }
    id: string
    parentMessageId: string
    role: string
    text: string
  }
}
