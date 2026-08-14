<route lang="yaml">
meta:
  title: 模型列表
</route>

<script lang="ts" setup>
  import ApiModels from '@/api/modules/models';
  import uploadApi from '@/api/modules/upload';
  import { sanitizeSvgContent } from '@/utils/sanitizeMarkdown';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import {
    ArrowDown,
    ArrowUp,
    Close,
    Document,
    DocumentCopy,
    Download,
    Picture,
    Plus,
    QuestionFilled,
    Refresh,
    Top,
    Upload,
    VideoCamera,
  } from '@element-plus/icons-vue';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';

  import {
    DEDUCTTYPELIST,
    MODEL_LIST,
    MODELSMAPLIST,
    MODELTYPELIST,
    MODELTYPEMAP,
    QUESTION_STATUS_OPTIONS,
  } from '@/constants/index';
  import axios from 'axios';

  const formRef = ref<FormInstance>();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);
  const modelLoading = ref(false);
  const showAddToolDialog = ref(false);
  const newToolKey = ref('');


  const formInline = reactive({
    keyType: '',
    model: '',
    page: 1,
    size: 10,
    status: null,
  });

  const status = computed({
    get: () => formInline.status ?? undefined,
    set: (val) => {
      formInline.status = val ?? null;
    },
  });

  const formPackageRef = ref<FormInstance>();
  const activeModelKeyId = ref(0);

  // 移除创意模型类型选择器，直接使用 keyType

  const formPackage = reactive({
    keyType: 1,
    modelName: '',
    key: '',
    modelAvatar: '',
    status: true,
    model: '',
    isTokenBased: false,
    tokenFeeRatio: 1000,
    modelOrder: 0,
    maxModelTokens: 64000,
    max_tokens: 4096,
    proxyUrl: '',
    deduct: 1,
    deductType: 1,
    maxRounds: 12,
    isFileUpload: 0,
    isImageUpload: 0,
    modelLimits: 50,
    modelDescription: '',
    isToolSupported: 0,
    deepThinkingType: 0,
    systemPrompt: '',
    systemPromptType: 0,
    additionalParams: '',
    customConfig: '',
  });

  /**
   * 规范化API基础URL
   * @param baseUrl - 需要规范化的API基础URL
   * @returns 规范化后的URL字符串
   */
  const correctApiBaseUrl = (baseUrl: string): string => {
    if (!baseUrl) return '';

    // 去除两端空格
    let url = baseUrl.trim();

    // 如果URL以斜杠'/'结尾，则移除这个斜杠
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // 检查URL是否已包含任何版本标记，包括常见的模式如/v1, /v1beta, /v1alpha等
    if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
      // 如果不包含任何版本号，添加 /v1
      return `${url}/v1`;
    }

    return url;
  };

  // Computed property for actual proxy URL
  const actualProxyUrl = computed(() => correctApiBaseUrl(formPackage.proxyUrl));

  // JSON验证和格式化函数
  const validateJSON = (value: string) => {
    if (!value || value.trim() === '') {
      return true; // 允许空值
    }
    try {
      JSON.parse(value);
      return true;
    } catch (error) {
      return false;
    }
  };

  const formatJSON = (value: string) => {
    if (!value || value.trim() === '') {
      return '';
    }
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      throw new Error('无效的JSON格式', { cause: error });
    }
  };

  // 格式化附加参数的函数
  const handleFormatAdditionalParams = () => {
    try {
      if (formPackage.additionalParams && formPackage.additionalParams.trim()) {
        formPackage.additionalParams = formatJSON(formPackage.additionalParams);
        ElMessage.success('JSON格式化成功');
      } else {
        ElMessage.info('请先输入JSON内容');
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : 'JSON格式化失败');
    }
  };

  // 自定义配置相关
  const customConfigVisible = ref(false);
  const customConfigDescription = ref('');
  const migrationNotice = ref(''); // 迁移提示信息
  const formatLoading = ref(false);
  const showJsonEditor = ref(false);
  const activeToolTab = ref('customOptions');

  // 所有工具都可见（不再根据执行模式过滤）
  const visibleTools = computed(() => {
    return configForm.tools;
  });

  // 受保护的工具列表（不可删除）
  const protectedTools = [
    'text2video',
    'image2video',
    'video2video',
    'text2image',
    'image2image',
    // unified 模式也包含以上所有工具
  ];

  // 参数类型选项
  interface RequestParam {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer';
    description: string;
    required: boolean;
    source?: string; // 参数来源：prompt/model/imageUrl/custom 等
    default?: any; // 默认值
    isFile?: boolean; // 是否为文件字段（用于 multipart/form-data）
  }

  interface Tool {
    name: string;
    description: string;
    enabled: boolean;
    endpoint: string;
    method: 'POST' | 'GET';
    contentType?: 'application/json' | 'multipart/form-data'; // 请求内容类型
    fileTransferFormat?: 'url' | 'base64'; // 文件传递格式（工具级别）
    requestParams?: RequestParam[];
    responsePaths: Record<string, string>;
    statusMapping?: Record<string, string | string[]>;
    queryTool?: string; // 使用的查询工具: 'imageQuery' 或 'videoQuery'
    overrideUrl?: string; // 覆盖默认的 API 地址
    overrideKey?: string; // 覆盖默认的 API Key
  }

  // 查询工具接口
  interface QueryTool {
    name: string;
    description: string;
    enabled: boolean;
    executionMode: 'sync' | 'async'; // 执行模式: 同步或异步
    // 同步模式配置 (任务提交后直接在响应中返回结果)
    syncConfig?: {
      timeout: number; // 超时时间(秒),默认60秒
      resultPath: string; // 结果URL在响应中的路径,如 'data.url' 或 'output'
    };
    // 异步模式配置 (需要轮询查询)
    asyncConfig?: {
      endpoint: string; // 异步查询端点,支持 {id} 占位符
      method: 'GET' | 'POST';
      interval: number; // 轮询间隔(秒)
      maxAttempts: number; // 最大轮询次数
    };
    responsePaths?: Record<string, string>; // 响应字段映射 (仅异步模式需要)
    statusMapping?: Record<string, string | string[]>; // 状态映射 (仅异步模式需要)
  }

  // 自定义选项配置
  interface CustomOption {
    name: string; // 显示名称，如 "画质选择"
    paramName: string; // 参数名称，如 "quality"
    options: Array<{
      label: string; // 选项显示文本，如 "高清"
      value: string; // 选项值，如 "hd"
    }>;
    default?: string; // 默认值
  }

  // 配置表单数据 - 新结构
  const configForm = reactive<{
    type: string;
    customOptions?: CustomOption[];
    queryTools: Record<string, QueryTool>; // 查询工具配置
    tools: Record<string, Tool>;
  }>({
    type: 'video',
    customOptions: [],
    queryTools: {
      imageQuery: {
        name: '图片任务查询',
        description: '查询图片生成任务的状态和结果',
        enabled: true,
        executionMode: 'async',
        syncConfig: {
          timeout: 60,
          resultPath: 'data.url',
        },
        asyncConfig: {
          endpoint: '/v1/images/{id}',
          method: 'GET',
          interval: 5,
          maxAttempts: 60,
        },
        responsePaths: {
          id: 'id',
          status: 'status',
          imageUrl: 'data.url',
          failReason: 'error.message',
        },
        statusMapping: {
          pending: 'processing',
          processing: 'processing',
          completed: 'success',
          succeeded: 'success',
          failed: 'failed',
          error: 'failed',
        },
      },
      videoQuery: {
        name: '视频任务查询',
        description: '查询视频生成任务的状态和结果',
        enabled: true,
        executionMode: 'async',
        syncConfig: {
          timeout: 60,
          resultPath: 'data.output',
        },
        asyncConfig: {
          endpoint: '/v1/videos/{id}',
          method: 'GET',
          interval: 5,
          maxAttempts: 60,
        },
        responsePaths: {
          id: 'task_id',
          status: 'status',
          videoUrl: 'data.output',
          failReason: 'fail_reason',
          progress: 'progress',
        },
        statusMapping: {
          pending: 'processing',
          processing: 'processing',
          completed: 'success',
          succeeded: 'success',
          failed: 'failed',
          error: 'failed',
        },
      },
    },
    tools: {
      text2video: {
        name: '文本生成视频',
        description: '根据文本描述生成视频',
        enabled: true,
        endpoint: '/v1/videos/generations',
        method: 'POST',
        queryTool: 'videoQuery',
        requestParams: [
          {
            name: 'billing_coefficient',
            type: 'number',
            description:
              '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
            required: true,
          },
          {
            name: 'prompt',
            type: 'string',
            description: '视频描述文本',
            required: true,
          },
          {
            name: 'model',
            type: 'string',
            description: '模型名称',
            required: true,
          },
        ],
        responsePaths: {
          id: 'task_id',
        },
        overrideUrl: '',
        overrideKey: '',
      },
      image2video: {
        name: '图片生成视频',
        description: '基于图片生成动态视频',
        enabled: true,
        endpoint: '/v1/videos/generations',
        method: 'POST',
        queryTool: 'videoQuery',
        requestParams: [
          {
            name: 'billing_coefficient',
            type: 'number',
            description:
              '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
            required: true,
          },
          {
            name: 'prompt',
            type: 'string',
            description: '动画描述',
            required: false,
          },
          {
            name: 'model',
            type: 'string',
            description: '模型名称',
            required: true,
          },
        ],
        responsePaths: {
          id: 'task_id',
        },
        overrideUrl: '',
        overrideKey: '',
      },
      video2video: {
        name: '视频Remix',
        description: '基于已有视频生成新视频（Remix功能）',
        enabled: false,
        endpoint: '/v1/videos/{id}/remix',
        method: 'POST',
        queryTool: 'videoQuery',
        requestParams: [
          {
            name: 'billing_coefficient',
            type: 'number',
            description:
              '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
            required: true,
          },
          {
            name: 'prompt',
            type: 'string',
            description: '重新混合的提示文本',
            required: true,
          },
          {
            name: 'video_id',
            type: 'string',
            description: '要混合的原视频ID',
            required: true,
          },
        ],
        responsePaths: {
          id: 'id',
          remixedFromId: 'remixed_from_video_id',
        },
        overrideUrl: '',
        overrideKey: '',
      },
    },
  });

  // 获取默认查询工具配置
  const getDefaultQueryTools = (): Record<string, QueryTool> => {
    return {
      imageQuery: {
        name: '图片任务查询',
        description: '查询图片生成任务的状态和结果',
        enabled: true,
        executionMode: 'async' as const,
        syncConfig: {
          timeout: 60,
          resultPath: 'data.0.url',
        },
        asyncConfig: {
          endpoint: '/v1/images/{id}',
          method: 'GET' as const,
          interval: 5,
          maxAttempts: 60,
        },
        responsePaths: {
          id: 'task_id',
          status: 'status',
          imageUrl: 'data.0.url',
          failReason: 'error.message',
        },
        statusMapping: {
          pending: 'processing',
          processing: 'processing',
          completed: 'success',
          succeeded: 'success',
          failed: 'failed',
          error: 'failed',
        },
      },
      videoQuery: {
        name: '视频任务查询',
        description: '查询视频生成任务的状态和结果',
        enabled: true,
        executionMode: 'async' as const,
        syncConfig: {
          timeout: 60,
          resultPath: 'data.output',
        },
        asyncConfig: {
          endpoint: '/v1/videos/{id}',
          method: 'GET' as const,
          interval: 5,
          maxAttempts: 60,
        },
        responsePaths: {
          id: 'task_id',
          status: 'status',
          videoUrl: 'data.output',
          failReason: 'fail_reason',
          progress: 'progress',
        },
        statusMapping: {
          pending: 'processing',
          processing: 'processing',
          completed: 'success',
          succeeded: 'success',
          failed: 'failed',
          error: 'failed',
        },
      },
    };
  };

  // 获取默认工具配置（提供所有工具的基础结构）
  const getDefaultTools = (type: string): Record<string, Tool> => {
    // 返回所有工具的基础结构（未启用状态）
    return {
      text2image: {
        name: '文生图',
        description: '根据文本描述生成图片',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'imageQuery',
        requestParams: [],
        responsePaths: { id: 'id' },
        overrideUrl: '',
        overrideKey: '',
      },
      image2image: {
        name: '图生图',
        description: '基于图片生成新图片',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'imageQuery',
        requestParams: [],
        responsePaths: { id: 'id' },
        overrideUrl: '',
        overrideKey: '',
      },
      inpainting: {
        name: '图片修补',
        description: '对图片进行局部修改和修补',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'imageQuery',
        requestParams: [],
        responsePaths: { id: 'id' },
        overrideUrl: '',
        overrideKey: '',
      },
      text2video: {
        name: '文本生成视频',
        description: '根据文本描述生成视频',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'videoQuery',
        requestParams: [],
        responsePaths: { id: 'task_id' },
        overrideUrl: '',
        overrideKey: '',
      },
      image2video: {
        name: '图片生成视频',
        description: '基于图片生成动态视频',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'videoQuery',
        requestParams: [],
        responsePaths: { id: 'task_id' },
        overrideUrl: '',
        overrideKey: '',
      },
      video2video: {
        name: '视频Remix',
        description: '基于已有视频生成新视频（Remix功能）',
        enabled: false,
        endpoint: '',
        method: 'POST',
        contentType: 'application/json',
        fileTransferFormat: 'url',
        queryTool: 'videoQuery',
        requestParams: [],
        responsePaths: { id: 'id' },
        overrideUrl: '',
        overrideKey: '',
      },
    };
  };

  // 确保所有固定工具都存在（用于旧配置迁移）
  const ensureProtectedTools = () => {
    // 对于 unified 类型，需要合并 image 和 video 的所有工具
    let requiredTools: string[] = [];

    if (configForm.type === 'unified') {
      // unified 模式需要所有图片和视频工具
      const imageTools = getDefaultTools('image');
      const videoTools = getDefaultTools('video');
      requiredTools = [...Object.keys(imageTools), ...Object.keys(videoTools)];
    } else {
      // 其他模式使用默认工具
      const defaultTools = getDefaultTools(configForm.type);
      requiredTools = Object.keys(defaultTools);
    }

    // 为每个缺失的工具添加默认配置（未启用状态）
    for (const toolKey of requiredTools) {
      if (!configForm.tools[toolKey]) {
        // 获取对应类型的默认工具配置
        let defaultTool;
        if (['text2image', 'image2image'].includes(toolKey)) {
          const imageTools = getDefaultTools('image');
          defaultTool = imageTools[toolKey];
        } else if (['text2video', 'image2video', 'video2video'].includes(toolKey)) {
          const videoTools = getDefaultTools('video');
          defaultTool = videoTools[toolKey];
        }

        if (defaultTool) {
          // 复制默认配置，但设置为未启用状态
          configForm.tools[toolKey] = {
            ...defaultTool,
            enabled: false, // 默认不启用，方便用户迁移
          };
        }
      }
    }
  };

  // 确保响应字段存在
  const ensureResponsePaths = () => {
    for (const [toolKey, tool] of Object.entries(configForm.tools)) {
      if (!tool.responsePaths) {
        tool.responsePaths = {};
      }

      // 所有工具都需要 id
      if (!tool.responsePaths.id) {
        tool.responsePaths.id = 'task_id';
      }
    }
  };

  // 确保所有工具都有计费系数参数
  const ensureBillingCoefficient = () => {
    for (const [toolKey, tool] of Object.entries(configForm.tools)) {
      // 确保有 requestParams 数组
      if (!tool.requestParams) {
        tool.requestParams = [];
      }

      // 检查是否已经有 billing_coefficient 参数
      const hasBillingCoefficient = tool.requestParams.some(
        (param) => param.name === 'billing_coefficient',
      );

      // 如果没有，添加到第一个位置
      if (!hasBillingCoefficient) {
        tool.requestParams.unshift({
          name: 'billing_coefficient',
          type: 'number',
          description:
            '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
          required: true,
        });
      } else {
        // 如果有，确保它在第一个位置
        const index = tool.requestParams.findIndex((param) => param.name === 'billing_coefficient');
        if (index > 0) {
          const billingParam = tool.requestParams.splice(index, 1)[0];
          tool.requestParams.unshift(billingParam);
        }
      }
    }
  };

  const openCustomConfigDialog = async () => {
    // 静默迁移：如果是旧模型类型（2或3），自动迁移到 keyType=6
    const isOldModelType = [2, 3].includes(Number(formPackage.keyType));

    if (isOldModelType) {
      // 静默迁移，不需要用户确认
      await performMigrationToUnified();
    }

    // 打开配置编辑器
    openConfigEditor();
  };

  // 执行迁移到 unified 模式
  const performMigrationToUnified = async () => {
    // 修改模型类型
    const oldKeyType = formPackage.keyType;
    formPackage.keyType = 6;

    // 如果有旧配置，需要迁移格式
    if (formPackage.customConfig) {
      try {
        const config = JSON.parse(formPackage.customConfig);

        // 检测并迁移旧配置格式
        const { isOld } = detectOldFormat(config);
        let finalConfig = config;

        if (isOld) {
          // 迁移配置格式
          finalConfig = migrateOldQueryToNew(config);
        }

        // 修改 type 为 unified
        finalConfig.type = 'unified';

        // 补充缺失的工具
        const tempConfigForm = {
          type: finalConfig.type,
          tools: finalConfig.tools,
          queryTools: finalConfig.queryTools,
          customOptions: finalConfig.customOptions || [],
        };

        // 临时设置 configForm 以使用 ensureProtectedTools
        const originalTools = configForm.tools;
        const originalQueryTools = configForm.queryTools;

        configForm.tools = tempConfigForm.tools;
        configForm.queryTools = tempConfigForm.queryTools;

        // 补充缺失的工具
        ensureProtectedTools();

        // 恢复并更新
        finalConfig.tools = configForm.tools;
        finalConfig.queryTools = configForm.queryTools;

        configForm.tools = originalTools;
        configForm.queryTools = originalQueryTools;

        // 保存迁移后的配置
        formPackage.customConfig = JSON.stringify(finalConfig, null, 2);
      } catch (error) {
        console.error('迁移配置失败', error);
        ElMessage.error('迁移配置失败，请手动检查');
        return;
      }
    }

    // 提示迁移成功
    ElMessage.success(
      `已成功迁移到通用创意模式！\n\n模型类型已从 ${oldKeyType} 改为 6\n配置格式已升级为新格式`,
    );

    // 打开配置编辑器（使用迁移后的配置）
    openConfigEditor();
  };

  // 打开配置编辑器（提取的公共逻辑）
  const openConfigEditor = () => {
    customConfigVisible.value = true;
    customConfigDescription.value = '';
    migrationNotice.value = ''; // 清空迁移提示
    showJsonEditor.value = false;
    activeToolTab.value = 'customOptions';

    // 根据当前模型类型自动确定配置类型
    let defaultType = 'unified'; // 默认为通用创意模式
    if (Number(formPackage.keyType) === 4) {
      defaultType = 'music';
    } else if (Number(formPackage.keyType) === 6) {
      defaultType = 'unified';
    } else if (Number(formPackage.keyType) === 1) {
      defaultType = 'chat';
    }

    // 如果有现有配置，解析并填充表单
    if (formPackage.customConfig) {
      try {
        const config = JSON.parse(formPackage.customConfig);
        if (config.tools) {
          configForm.type = config.type || defaultType;
          configForm.tools = config.tools;
          configForm.customOptions = config.customOptions || [];
          // 兼容旧配置: 如果没有 queryTools, 使用默认配置
          if (!config.queryTools) {
            configForm.queryTools = getDefaultQueryTools();
          } else {
            configForm.queryTools = config.queryTools;
          }

          // ✅ 为所有工具设置默认的 fileTransferFormat（如果不存在）
          Object.keys(configForm.tools).forEach((toolKey) => {
            if (!configForm.tools[toolKey].fileTransferFormat) {
              configForm.tools[toolKey].fileTransferFormat = 'url';
            }
          });

          // 确保所有固定工具都存在（自动补充缺失的工具）
          ensureProtectedTools();

          // 确保所有工具都有必需的响应字段
          ensureResponsePaths();
          // 确保所有工具都有计费系数参数
          ensureBillingCoefficient();
        } else {
          // 配置不完整，使用默认配置
          configForm.type = defaultType;
          configForm.customOptions = [];
          configForm.tools = getDefaultTools(defaultType);
          configForm.queryTools = getDefaultQueryTools();
          // 确保所有工具都有计费系数参数
          ensureBillingCoefficient();
        }
      } catch (e) {
        console.error('解析配置失败', e);
        // 解析失败，使用默认配置
        configForm.type = defaultType;
        configForm.customOptions = [];
        configForm.tools = getDefaultTools(defaultType);
        configForm.queryTools = getDefaultQueryTools();
        // 确保所有工具都有计费系数参数
        ensureBillingCoefficient();
      }
    } else {
      // 没有现有配置时，根据类型初始化默认工具
      configForm.type = defaultType;
      configForm.customOptions = [];
      configForm.tools = getDefaultTools(defaultType);
      configForm.queryTools = getDefaultQueryTools();
      // 确保所有工具都有计费系数参数
      ensureBillingCoefficient();
    }
  };

  // AI 智能格式化配置
  const handleAIFormat = async () => {
    if (!customConfigDescription.value || customConfigDescription.value.trim() === '') {
      ElMessage.warning('请输入配置描述');
      return;
    }

    try {
      formatLoading.value = true;
      const res = await ApiModels.formatCustomConfig({
        description: customConfigDescription.value,
      });

      if (res.data && res.data.config) {
        // 解析 AI 生成的配置并填充表单
        const config = JSON.parse(res.data.config);
        if (config.tools) {
          configForm.type = config.type || configForm.type;
          configForm.tools = config.tools;
          configForm.customOptions = config.customOptions || [];
          // 确保所有工具都有计费系数参数
          ensureBillingCoefficient();
          ElMessage.success('AI 格式化成功，已填充所有工具配置');
        }
      }
    } catch (error: any) {
      ElMessage.error(error.message || 'AI 格式化失败');
    } finally {
      formatLoading.value = false;
    }
  };

  // 添加请求参数
  const addRequestParam = (toolKey: string) => {
    const tool = configForm.tools[toolKey];
    if (!tool.requestParams) {
      tool.requestParams = [];
    }
    tool.requestParams.push({
      name: '',
      type: 'string',
      description: '',
      required: false,
    });
  };

  // 删除请求参数
  const removeRequestParam = (toolKey: string, index: number) => {
    const tool = configForm.tools[toolKey];
    if (tool.requestParams) {
      const param = tool.requestParams[index];
      // 防止删除计费系数参数
      if (param.name === 'billing_coefficient') {
        ElMessage.warning('计费系数参数不能删除');
        return;
      }
      tool.requestParams.splice(index, 1);
    }
  };

  // 添加自定义工具
  const addCustomTool = () => {
    ElMessageBox.prompt('请输入工具标识（英文，如 video_extend）', '添加自定义工具', {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputPattern: /^[a-z_][a-z0-9_]*$/,
      inputErrorMessage: '只能包含小写字母、数字和下划线，且必须以字母或下划线开头',
    })
      .then(({ value }: { value: string }) => {
        if (configForm.tools[value]) {
          ElMessage.warning('该工具已存在');
          return;
        }
        const newTool: Tool = {
          name: value,
          description: '',
          enabled: true,
          endpoint: '/v1/videos/generations',
          method: 'POST',
          queryTool: 'videoQuery',
          requestParams: [
            {
              name: 'billing_coefficient',
              type: 'number' as const,
              description:
                '计费系数，默认为1。当出现不同模型或者不同清晰度，计费不同的时候，会在此说明。例如：标准模型为1，高清模型为2，超清模型为3',
              required: true,
            },
            {
              name: 'prompt',
              type: 'string' as const,
              description: '提示词',
              required: true,
            },
            {
              name: 'model',
              type: 'string' as const,
              description: '模型名称',
              required: true,
            },
          ],
          responsePaths: {
            id: 'task_id',
          },
        };

        configForm.tools[value] = newTool;
        activeToolTab.value = value;
        ElMessage.success(`成功添加工具: ${value}`);
      })
      .catch(() => {
        // 取消操作
      });
  };

  // 删除工具
  const removeTool = (toolKey: string) => {
    // 保护基础工具不可删除
    if (protectedTools.includes(toolKey)) {
      ElMessage.warning('基础工具不能删除');
      return;
    }

    ElMessageBox.confirm(`确定删除工具 "${toolKey}" 吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(() => {
        delete configForm.tools[toolKey];
        if (activeToolTab.value === toolKey) {
          activeToolTab.value = 'customOptions';
        }
        ElMessage.success('删除成功');
      })
      .catch(() => {
        // 取消操作
      });
  };

  // 新增工具 - 打开对话框
  const addNewTool = () => {
    newToolKey.value = '';
    showAddToolDialog.value = true;
  };

  // 确认新增工具
  const confirmAddTool = () => {
    const toolKey = newToolKey.value.trim().toLowerCase();

    // 验证输入
    if (!toolKey) {
      ElMessage.warning('请输入工具键名');
      return;
    }

    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(toolKey)) {
      ElMessage.warning('请输入有效的工具键名（以字母开头，只能包含字母和数字）');
      return;
    }

    // 检查是否已存在
    if (configForm.tools[toolKey]) {
      ElMessage.warning(`工具 "${toolKey}" 已存在`);
      return;
    }

    // 检查是否是保护工具
    if (protectedTools.includes(toolKey)) {
      ElMessage.warning(`"${toolKey}" 是基础工具，请勿重复创建`);
      return;
    }

    // 创建新工具的默认配置
    configForm.tools[toolKey] = {
      name: '',
      description: '',
      enabled: true,
      endpoint: '',
      method: 'POST',
      contentType: 'application/json',
      requestParams: [],
      responsePaths: {},
    };

    // 关闭对话框并切换到新工具的标签页
    showAddToolDialog.value = false;
    activeToolTab.value = toolKey;
    ElMessage.success(`工具 "${toolKey}" 创建成功`);
  };

  // 添加自定义选项
  const addCustomOption = () => {
    if (!configForm.customOptions) {
      configForm.customOptions = [];
    }
    configForm.customOptions.push({
      name: '新选项',
      paramName: 'custom_param',
      options: [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ],
      default: 'option1',
    });
  };

  // 删除自定义选项
  const removeCustomOption = (index: number) => {
    ElMessageBox.confirm('确定删除此选项吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(() => {
        configForm.customOptions?.splice(index, 1);
        ElMessage.success('删除成功');
      })
      .catch(() => {
        // 取消操作
      });
  };

  // 添加选项值
  const addOptionValue = (customOptionIndex: number) => {
    configForm.customOptions![customOptionIndex].options.push({
      label: '新选项',
      value: 'new_value',
    });
  };

  // 删除选项值
  const removeOptionValue = (customOptionIndex: number, optionIndex: number) => {
    if (configForm.customOptions![customOptionIndex].options.length <= 1) {
      ElMessage.warning('至少保留一个选项');
      return;
    }
    configForm.customOptions![customOptionIndex].options.splice(optionIndex, 1);
  };

  // 上移选项值
  const moveOptionUp = (customOptionIndex: number, optionIndex: number) => {
    if (optionIndex === 0) {
      ElMessage.warning('已经是第一个选项了');
      return;
    }
    const options = configForm.customOptions![customOptionIndex].options;
    const temp = options[optionIndex];
    options[optionIndex] = options[optionIndex - 1];
    options[optionIndex - 1] = temp;
  };

  // 下移选项值
  const moveOptionDown = (customOptionIndex: number, optionIndex: number) => {
    const options = configForm.customOptions![customOptionIndex].options;
    if (optionIndex === options.length - 1) {
      ElMessage.warning('已经是最后一个选项了');
      return;
    }
    const temp = options[optionIndex];
    options[optionIndex] = options[optionIndex + 1];
    options[optionIndex + 1] = temp;
  };

  // 上移自定义选项
  const moveCustomOptionUp = (index: number) => {
    if (index === 0) {
      ElMessage.warning('已经是第一个选项了');
      return;
    }
    const options = configForm.customOptions!;
    const temp = options[index];
    options[index] = options[index - 1];
    options[index - 1] = temp;
  };

  // 下移自定义选项
  const moveCustomOptionDown = (index: number) => {
    const options = configForm.customOptions!;
    if (index === options.length - 1) {
      ElMessage.warning('已经是最后一个选项了');
      return;
    }
    const temp = options[index];
    options[index] = options[index + 1];
    options[index + 1] = temp;
  };

  // JSON 导入导出
  const showImportExport = ref(false);
  const exportedJson = ref('');
  const importJson = ref('');
  const importExportVisible = ref(false);
  const importExportJson = ref('');

  // 生成导出JSON（和保存逻辑完全一致）
  const generateExportJson = () => {
    try {
      // 完全按照保存时的逻辑，直接导出完整的配置
      const config = {
        type: configForm.type,
        tools: configForm.tools,
        queryTools: configForm.queryTools,
        customOptions: configForm.customOptions,
      };

      // 添加API地址和前端选项配置
      const exportData = {
        ...config,
        proxyUrl: formPackage.proxyUrl,
        modelName: formPackage.modelName,
        key: formPackage.key,
        status: formPackage.status,
        deduct: formPackage.deduct,
        deductType: formPackage.deductType,
        modelOrder: formPackage.modelOrder,
      };

      importExportJson.value = JSON.stringify(exportData, null, 2);
      importExportVisible.value = true;
      ElMessage.success('配置已生成');
    } catch (error) {
      console.error(error);
      ElMessage.error('生成配置失败');
    }
  };

  // 复制导出的JSON
  const copyExportedJson = async () => {
    try {
      await navigator.clipboard.writeText(exportedJson.value);
      ElMessage.success('配置已复制到剪贴板');
    } catch (error) {
      ElMessage.error('复制失败，请手动复制');
    }
  };

  // 检测是否为旧格式配置
  const detectOldFormat = (config: any): { isOld: boolean; migrationSuggestion?: string } => {
    // 检查是否有旧的 query 配置（直接在工具上的 endpoint 和 statusMapping）
    const hasOldQueryStructure = Object.values(config.tools || {}).some(
      (tool: any) =>
        tool && tool.endpoint && (tool.statusMapping || tool.responsePaths) && !tool.queryTool,
    );

    // 检查是否缺少 queryTools
    const hasNoQueryTools = !config.queryTools || Object.keys(config.queryTools).length === 0;

    if (hasOldQueryStructure || hasNoQueryTools) {
      return {
        isOld: true,
        migrationSuggestion: `检测到旧格式配置（${config.type}），建议迁移到通用创意模式（支持图片+视频）`,
      };
    }

    // 检查是否为 image 或 video 类型
    if (config.type === 'image' || config.type === 'video') {
      return {
        isOld: true,
        migrationSuggestion: `检测到 ${config.type === 'image' ? '图片' : '视频'} 配置，建议迁移到通用创意模式以支持更多功能`,
      };
    }

    return { isOld: false };
  };

  // 从旧配置映射到新查询工具
  const migrateOldQueryToNew = (config: any) => {
    if (!config.queryTools) {
      // 提取旧配置中的查询端点信息
      let oldQueryEndpoint = '';
      let oldQueryMethod = 'GET';
      let oldResponsePaths: Record<string, any> = {};
      let oldStatusMapping: Record<string, any> = {};

      // 从第一个有查询配置的工具中提取
      for (const tool of Object.values(config.tools || {})) {
        const t = tool as any;
        if (t.statusMapping || t.responsePaths) {
          oldQueryEndpoint = t.queryEndpoint || '';
          oldQueryMethod = t.queryMethod || 'GET';
          oldResponsePaths = t.responsePaths || {};
          oldStatusMapping = t.statusMapping || {};
          break;
        }
      }

      // 创建新格式的 queryTools
      config.queryTools = {
        imageQuery: {
          name: '图片任务查询',
          description: '查询图片生成任务的状态和结果',
          enabled: true,
          executionMode: 'async',
          syncConfig: {
            timeout: 60,
            resultPath: 'data.url',
          },
          asyncConfig: {
            endpoint: oldQueryEndpoint || '/v1/images/{id}',
            method: oldQueryMethod as 'GET' | 'POST',
            interval: 5,
            maxAttempts: 60,
          },
          responsePaths: (oldResponsePaths as any).id
            ? oldResponsePaths
            : {
                id: 'id',
                status: 'status',
                imageUrl: 'data.url',
                failReason: 'error.message',
              },
          statusMapping: (oldStatusMapping as any).pending
            ? oldStatusMapping
            : {
                pending: 'processing',
                processing: 'processing',
                completed: 'success',
                succeeded: 'success',
                failed: 'failed',
                error: 'failed',
              },
        },
        videoQuery: {
          name: '视频任务查询',
          description: '查询视频生成任务的状态和结果',
          enabled: true,
          executionMode: 'async',
          syncConfig: {
            timeout: 60,
            resultPath: 'data.output',
          },
          asyncConfig: {
            endpoint: oldQueryEndpoint || '/v1/videos/{id}',
            method: oldQueryMethod as 'GET' | 'POST',
            interval: 5,
            maxAttempts: 60,
          },
          responsePaths: (oldResponsePaths as any).id
            ? oldResponsePaths
            : {
                id: 'task_id',
                status: 'status',
                videoUrl: 'data.output',
                failReason: 'fail_reason',
                progress: 'progress',
              },
          statusMapping: (oldStatusMapping as any).pending
            ? oldStatusMapping
            : {
                pending: 'processing',
                processing: 'processing',
                completed: 'success',
                succeeded: 'success',
                failed: 'failed',
                error: 'failed',
              },
        },
      };
    }

    // 为工具添加 queryTool 引用，并删除旧的查询字段
    for (const [key, tool] of Object.entries(config.tools || {})) {
      const t = tool as any;

      // 设置 queryTool 引用
      if (!t.queryTool) {
        if (['text2image', 'image2image'].includes(key)) {
          t.queryTool = 'imageQuery';
        } else if (['text2video', 'image2video', 'video2video'].includes(key)) {
          t.queryTool = 'videoQuery';
        }
      }

      // 删除工具上的旧查询字段（已迁移到 queryTools）
      delete t.queryEndpoint;
      delete t.queryMethod;
      delete t.statusMapping;
      delete t.responsePaths;
    }

    return config;
  };

  // 导入JSON配置
  const handleImportJson = async () => {
    if (!importJson.value || importJson.value.trim() === '') {
      ElMessage.warning('请粘贴配置JSON');
      return;
    }

    try {
      const config = JSON.parse(importJson.value);

      // 验证配置格式
      if (!config.type || !config.tools) {
        ElMessage.error('配置格式不正确，必须包含 type 和 tools 字段');
        return;
      }

      // 检测是否为旧格式
      const { isOld, migrationSuggestion } = detectOldFormat(config);

      if (isOld) {
        // 提示用户是否迁移
        try {
          await ElMessageBox.confirm(
            `${migrationSuggestion}\n\n迁移将：\n1. 补充完整的图片和视频工具配置\n2. 自动映射旧查询配置到新查询工具\n3. 建议将模型类型改为"通用创意"\n\n是否立即迁移？`,
            '检测到旧格式配置',
            {
              confirmButtonText: '立即迁移',
              cancelButtonText: '直接导入（不迁移）',
              type: 'warning',
            },
          );

          // 用户选择迁移
          const migratedConfig = migrateOldQueryToNew(config);

          // 如果是 image 或 video 类型，建议改为 unified
          if (migratedConfig.type === 'image' || migratedConfig.type === 'video') {
            try {
              await ElMessageBox.confirm(
                `是否将模型类型从"${migratedConfig.type}"改为"unified"（通用创意）？\n\n通用创意模式同时支持图片和视频生成，功能更强大。`,
                '建议修改模型类型',
                {
                  confirmButtonText: '修改为 unified',
                  cancelButtonText: '保持原类型',
                  type: 'info',
                },
              );

              // 用户选择修改
              migratedConfig.type = 'unified';
              // 同时修改表单的 keyType 为 6
              formPackage.keyType = 6;
            } catch {
              // 用户选择保持原类型，不做修改
            }
          }

          // 应用迁移后的配置
          configForm.type = migratedConfig.type;
          configForm.tools = migratedConfig.tools;
          configForm.queryTools = migratedConfig.queryTools;
          configForm.customOptions = migratedConfig.customOptions || [];

          // 确保所有工具都存在（自动补充缺失的工具）
          ensureProtectedTools();
          ensureResponsePaths();
          ensureBillingCoefficient();

          ElMessage.success('配置迁移并导入成功！已自动补充完整工具配置');
          showImportExport.value = false;
          importJson.value = '';
          return;
        } catch (action) {
          if (action === 'cancel') {
            // 用户选择直接导入（不迁移）
            // 清理旧的查询结构
            const cleanedConfig = { ...config };
            if (!cleanedConfig.queryTools) {
              // 不迁移，但需要补充基本的 queryTools 结构
              cleanedConfig.queryTools = {
                imageQuery: {
                  name: '图片任务查询',
                  description: '查询图片生成任务的状态和结果',
                  enabled: true,
                  executionMode: 'async',
                  syncConfig: { timeout: 60, resultPath: 'data.url' },
                  asyncConfig: {
                    endpoint: '/v1/images/{id}',
                    method: 'GET',
                    interval: 5,
                    maxAttempts: 60,
                  },
                  responsePaths: {
                    id: 'id',
                    status: 'status',
                    imageUrl: 'data.url',
                    failReason: 'error.message',
                  },
                  statusMapping: {
                    pending: 'processing',
                    processing: 'processing',
                    completed: 'success',
                    succeeded: 'success',
                    failed: 'failed',
                    error: 'failed',
                  },
                },
                videoQuery: {
                  name: '视频任务查询',
                  description: '查询视频生成任务的状态和结果',
                  enabled: true,
                  executionMode: 'async',
                  syncConfig: { timeout: 60, resultPath: 'data.output' },
                  asyncConfig: {
                    endpoint: '/v1/videos/{id}',
                    method: 'GET',
                    interval: 5,
                    maxAttempts: 60,
                  },
                  responsePaths: {
                    id: 'task_id',
                    status: 'status',
                    videoUrl: 'data.output',
                    failReason: 'fail_reason',
                    progress: 'progress',
                  },
                  statusMapping: {
                    pending: 'processing',
                    processing: 'processing',
                    completed: 'success',
                    succeeded: 'success',
                    failed: 'failed',
                    error: 'failed',
                  },
                },
              };
            }

            configForm.type = cleanedConfig.type;
            configForm.tools = cleanedConfig.tools;
            configForm.queryTools = cleanedConfig.queryTools;
            configForm.customOptions = cleanedConfig.customOptions || [];

            ElMessage.success('配置导入成功（未迁移）');
            showImportExport.value = false;
            importJson.value = '';
            return;
          }
          // 用户点击了关闭按钮，不做任何操作
          return;
        }
      }

      // 新格式，直接导入
      configForm.type = config.type;
      configForm.tools = config.tools;
      configForm.queryTools = config.queryTools || configForm.queryTools;
      configForm.customOptions = config.customOptions || [];

      ElMessage.success('配置导入成功');
      showImportExport.value = false;
      importJson.value = '';
    } catch (error) {
      console.error(error);
      ElMessage.error('JSON 格式错误，请检查后重试');
    }
  };

  // 导入导出弹窗 - 生成导出JSON
  const handleGenerateExportJson = () => {
    try {
      const config = {
        type: configForm.type,
        tools: configForm.tools,
        queryTools: configForm.queryTools,
        customOptions: configForm.customOptions,
      };
      importExportJson.value = JSON.stringify(config, null, 2);
      ElMessage.success('配置已生成');
    } catch (error) {
      console.error(error);
      ElMessage.error('生成配置失败');
    }
  };

  // 导入导出弹窗 - 复制JSON
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(importExportJson.value);
      ElMessage.success('配置已复制到剪贴板');
    } catch (error) {
      ElMessage.error('复制失败，请手动复制');
    }
  };

  // 导入导出弹窗 - 导入JSON配置（使用相同的逻辑）
  const handleImportJsonFromDialog = async () => {
    // 默认行为：导入全部配置（向后兼容）
    await handleImportByMode('all');
  };

  // 根据模式导入配置（和读取逻辑完全一致）
  const handleImportByMode = async (mode: 'image' | 'video' | 'all') => {
    if (!importExportJson.value || importExportJson.value.trim() === '') {
      ElMessage.warning('请粘贴配置JSON');
      return;
    }

    try {
      const config = JSON.parse(importExportJson.value);

      // 验证配置格式
      if (!config.type || !config.tools) {
        ElMessage.error('配置格式不正确，必须包含 type 和 tools 字段');
        return;
      }

      // 图片工具列表
      const imageTools = ['text2image', 'image2image', 'inpainting'];
      // 视频工具列表
      const videoTools = ['text2video', 'image2video', 'video2video'];

      if (mode === 'image') {
        // 仅导入图片配置
        ElMessage.info('正在导入图片配置...');

        // 直接赋值图片工具（和读取逻辑一样）
        for (const toolKey of imageTools) {
          if (config.tools[toolKey]) {
            configForm.tools[toolKey] = config.tools[toolKey];
          }
        }

        // 直接赋值图片查询工具
        if (config.queryTools && config.queryTools.imageQuery) {
          configForm.queryTools.imageQuery = config.queryTools.imageQuery;
        }

        // 导入前端选项配置
        if (config.customOptions) {
          configForm.customOptions = config.customOptions;
        }

        ElMessage.success('图片配置导入成功！');
      } else if (mode === 'video') {
        // 仅导入视频配置
        ElMessage.info('正在导入视频配置...');

        // 直接赋值视频工具（和读取逻辑一样）
        for (const toolKey of videoTools) {
          if (config.tools[toolKey]) {
            configForm.tools[toolKey] = config.tools[toolKey];
          }
        }

        // 直接赋值视频查询工具
        if (config.queryTools && config.queryTools.videoQuery) {
          configForm.queryTools.videoQuery = config.queryTools.videoQuery;
        }

        // 导入前端选项配置
        if (config.customOptions) {
          configForm.customOptions = config.customOptions;
        }

        ElMessage.success('视频配置导入成功！');
      } else {
        // 导入全部配置（完全和读取逻辑一样）
        ElMessage.info('正在导入全部配置...');

        // 直接赋值，和读取配置时完全一样
        configForm.type = config.type;
        configForm.tools = config.tools;
        configForm.queryTools = config.queryTools;
        configForm.customOptions = config.customOptions || [];

        // 导入API地址和前端选项配置
        if (config.proxyUrl !== undefined) formPackage.proxyUrl = config.proxyUrl;
        if (config.modelName !== undefined) formPackage.modelName = config.modelName;
        if (config.key !== undefined) formPackage.key = config.key;
        if (config.status !== undefined) formPackage.status = config.status;
        if (config.deduct !== undefined) formPackage.deduct = config.deduct;
        if (config.deductType !== undefined) formPackage.deductType = config.deductType;
        if (config.modelOrder !== undefined) formPackage.modelOrder = config.modelOrder;

        ElMessage.success('全部配置导入成功！');
      }

      // 关闭弹窗
      importExportVisible.value = false;
      importExportJson.value = '';
    } catch (error) {
      console.error('导入配置失败', error);
      ElMessage.error('导入配置失败，请检查JSON格式是否正确');
    }
  };

  // 保存自定义配置
  const saveCustomConfig = async () => {
    try {
      // 检查至少有一个启用的工具
      const hasEnabledTool = Object.values(configForm.tools).some(
        (tool) => tool.enabled && tool.endpoint,
      );
      if (!hasEnabledTool) {
        ElMessage.error('至少需要启用一个工具');
        return;
      }

      // 直接保存配置
      const config = {
        type: configForm.type,
        tools: configForm.tools,
        queryTools: configForm.queryTools,
        customOptions: configForm.customOptions,
      };

      formPackage.customConfig = JSON.stringify(config, null, 2);
      customConfigVisible.value = false;

      // 直接调用保存模型配置
      await handlerSubmit(formPackageRef.value);
    } catch (error) {
      console.error(error);
      ElMessage.error('保存配置失败，请检查输入');
    }
  };

  const rules = reactive<FormRules>({
    keyType: [{ required: true, message: '请选择调用模型类型', trigger: 'blur' }],
    modelName: [{ required: true, message: '请填写您的模型名称', trigger: 'blur' }],
    key: [{ required: false, message: '请填写您的调用模型key', trigger: 'blur' }],
    // secret: [
    //   { required: true, message: '请填写您的调用模型的secret', trigger: 'blur' },
    // ],
    status: [{ required: true, message: '请选择key的显示状态', trigger: 'change' }],
    // isDraw: [
    //   {
    //     required: true,
    //     message: '请选择当前key是否作为基础绘画key',
    //     trigger: 'change',
    //   },
    // ],
    isFileUpload: [
      {
        required: false,
        message: '请选择当前模型是否开启文件解析及支持种类',
        trigger: 'change',
      },
    ],
    isImageUpload: [
      {
        required: false,
        message: '请选择当前模型是否开启图片解析及支持种类',
        trigger: 'change',
      },
    ],
    isTokenBased: [
      {
        required: true,
        message: '请选择当前key是否基于token计费',
        trigger: 'change',
      },
    ],
    tokenFeeRatio: [{ required: false, message: 'token计费比例', trigger: 'change' }],
    model: [
      {
        required: true,
        message: '请选择当前key需要绑定的模型',
        trigger: 'change',
      },
    ],
    modelOrder: [{ required: true, message: '请填写当前模型排序', trigger: 'blur' }],

    // keyWeight: [
    //   { required: true, message: '请填写key的权重值', trigger: 'blur' },
    // ],
    maxModelTokens: [{ required: true, message: '请填写模型最大token数', trigger: 'blur' }],
    max_tokens: [{ required: true, message: '请填写模型最大回复token数', trigger: 'blur' }],
    proxyUrl: [{ required: false, message: '请填写模型地址', trigger: 'blur' }],
    modelAvatar: [
      {
        required: false,
        message: '请填写AI模型使用的头像, 不填写使用系统默认',
        trigger: 'blur',
      },
    ],
    deductType: [{ required: true, message: '请选择当前模型扣费类型', trigger: 'change' }],
    deduct: [
      {
        required: true,
        message: '请填写当前模型扣费金额（需要是正整数）',
        trigger: 'blur',
      },
    ],
    maxRounds: [
      {
        required: true,
        message: '请填写允许用户选择的最大上下文轮次',
        trigger: 'blur',
      },
    ],
    modelLimits: [
      {
        required: true,
        message: '请填写模型调用频率限制',
        trigger: 'blur',
      },
    ],
    modelDescription: [
      {
        required: false,
        message: '请填写模型描述',
        trigger: 'blur',
      },
    ],
    isNetworkSearch: [
      {
        required: false,
        message: '请填写是否开启网络搜索',
        trigger: 'change',
      },
    ],
    deepThinkingType: [
      {
        required: false,
        message: '请选择深度思考模式',
        trigger: 'change',
      },
    ],
    additionalParams: [
      {
        required: false,
        validator: (rule, value, callback) => {
          if (!value || value.trim() === '') {
            callback();
            return;
          }
          if (!validateJSON(value)) {
            callback(new Error('请输入有效的JSON格式'));
            return;
          }
          callback();
        },
        trigger: ['blur', 'change'],
      },
    ],
  });

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeModelKeyId.value = 0;
    formEl?.resetFields();
  }

  const modelList = computed(
    () => MODELSMAPLIST[formPackage.keyType as keyof typeof MODELSMAPLIST],
  );

  const dialogTitle = computed(() => {
    return activeModelKeyId.value ? '修改模型' : '新增模型';
  });

  // const labelKeyName = computed(() => ModelTypeLabelMap[formPackage.keyType]);

  const dialogButton = computed(() => {
    return activeModelKeyId.value ? '确认更新' : '确认新增';
  });

  const tableData = ref([]);

  async function queryModelsList() {
    try {
      loading.value = true;
      const res = await ApiModels.queryModels({
        ...formInline,
        status: status.value,
      });
      loading.value = false;
      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } catch (error) {
      loading.value = false;
    }
  }

  async function handleDeleteKey(row: any) {
    const { id } = row;
    await ApiModels.delModels({ id });
    ElMessage({ type: 'success', message: '操作完成！' });
    queryModelsList();
  }

  function handleEditKey(row: any) {
    activeModelKeyId.value = row.id;
    const {
      keyType,
      modelName,
      key,
      status,
      model,
      modelOrder,
      maxModelTokens,
      max_tokens,
      proxyUrl,
      deductType,
      deduct,
      maxRounds,
      modelAvatar,
      isTokenBased,
      tokenFeeRatio,
      isFileUpload,
      isImageUpload,
      modelLimits,
      modelDescription,
      isToolSupported,
      deepThinkingType,
      systemPrompt,
      systemPromptType,
      additionalParams,
      customConfig,
    } = row;
    nextTick(() => {
      Object.assign(formPackage, {
        keyType,
        modelName,
        key,
        status: Boolean(status),
        model,
        modelOrder,
        maxModelTokens,
        max_tokens,
        proxyUrl,
        deductType,
        deduct,
        maxRounds,
        modelAvatar,
        isTokenBased: Boolean(isTokenBased),
        tokenFeeRatio,
        isFileUpload,
        isImageUpload,
        modelLimits,
        modelDescription,
        isToolSupported: Number(isToolSupported) || 0,
        deepThinkingType: Number(deepThinkingType) || 0,
        systemPrompt,
        systemPromptType,
        additionalParams,
        customConfig: customConfig || '',
      });
    });
    visible.value = true;
  }

  function handleCopyKey(row: any) {
    // 重置表单为初始状态，确保不会保留之前的ID
    activeModelKeyId.value = 0;
    const {
      keyType,
      modelName,
      key,
      status,
      model,
      modelOrder,
      maxModelTokens,
      max_tokens,
      proxyUrl,
      deductType,
      deduct,
      maxRounds,
      modelAvatar,
      isTokenBased,
      tokenFeeRatio,
      isFileUpload,
      isImageUpload,
      modelLimits,
      modelDescription,
      isToolSupported,
      deepThinkingType,
      systemPrompt,
      systemPromptType,
      additionalParams,
      customConfig,
    } = row;

    // 生成新的模型名称，添加"副本"后缀
    const copiedModelName = `${modelName} - 副本`;

    nextTick(() => {
      Object.assign(formPackage, {
        keyType,
        modelName: copiedModelName,
        key: '', // 复制配置时不复制密钥，留空则继承全局 Key
        status: Boolean(status),
        model,
        modelOrder,
        maxModelTokens,
        max_tokens,
        proxyUrl,
        deductType,
        deduct,
        maxRounds,
        modelAvatar,
        isTokenBased: Boolean(isTokenBased),
        tokenFeeRatio,
        isFileUpload,
        isImageUpload,
        modelLimits,
        modelDescription,
        isToolSupported: Number(isToolSupported) || 0,
        deepThinkingType: Number(deepThinkingType) || 0,
        systemPrompt,
        systemPromptType,
        additionalParams,
        customConfig: customConfig || '',
      });
    });

    // 打开弹窗
    visible.value = true;

    // 提示用户
    ElMessage.info('已复制模型配置');
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryModelsList();
  }

  // 添加模型时的处理函数
  function handleAddModel() {
    // 重置表单
    activeModelKeyId.value = 0;
    nextTick(() => {
      Object.assign(formPackage, {
        keyType: 1, // 默认设置为普通对话类型
        modelName: '',
        key: '',
        status: true,
        model: '',
        isTokenBased: false,
        tokenFeeRatio: 1000,
        modelOrder: 0,
        maxModelTokens: 64000,
        max_tokens: 4096,
        proxyUrl: '',
        deduct: 1,
        deductType: 1,
        maxRounds: 12,
        isFileUpload: 0,
        isImageUpload: 0,
        modelLimits: 50,
        modelDescription: '',
        isToolSupported: 0,
        deepThinkingType: 0,
        systemPrompt: '',
        systemPromptType: 0,
        additionalParams: '',
        customConfig: '', // 初始为空
      });

      // 为通用创意模型设置默认配置
      const defaultUnifiedConfig = {
        type: 'unified',
        tools: {
          text2image: {
            name: '文生图',
            description: '根据文本描述生成图片',
            enabled: true,
            endpoint: '/v1/images/generations',
            method: 'POST',
            requestParams: [
              {
                name: 'billing_coefficient',
                type: 'number',
                description: '计费系数,默认为1',
                required: true,
              },
              {
                name: 'prompt',
                type: 'string',
                description: '图片描述',
                required: true,
                source: 'prompt',
              },
              {
                name: 'model',
                type: 'string',
                description: '模型名称,固定值 nano-banana',
                required: true,
                source: 'model',
              },
              {
                name: 'aspect_ratio',
                type: 'string',
                description: '图片尺寸 枚举值: 4:3 3:4 16:9 9:16 2:3 3:2 1:1 1:2',
                required: true,
              },
              {
                name: 'response_format',
                type: 'string',
                description: '固定使用url',
                required: false,
              },
            ],
            contentType: 'application/json',
            queryTool: 'imageQuery',
            responsePaths: {
              id: 'task_id',
            },
          },
          text2video: {
            name: '文本生成视频',
            description: '根据文本描述生成视频',
            enabled: true,
            endpoint: '/v2/videos/generations',
            method: 'POST',
            queryTool: 'videoQuery',
            requestParams: [
              {
                name: 'billing_coefficient',
                type: 'number',
                description: '计费系数,使用veo3.1模型的时候为5',
                required: true,
              },
              {
                name: 'prompt',
                type: 'string',
                description: '视频描述文本,只支持英文提示词',
                required: true,
                source: 'prompt',
              },
              {
                name: 'model',
                type: 'string',
                description: '模型名称固定为veo3.1',
                required: true,
                source: 'model',
              },
              {
                name: 'aspect_ratio',
                type: 'string',
                description: '输出比例 枚举值: 16:9 横屏 9:16 竖屏',
                required: false,
              },
            ],
            responsePaths: {
              id: 'task_id',
            },
            overrideUrl: '',
            overrideKey: '',
            contentType: 'application/json',
          },
        },
        queryTools: {
          imageQuery: {
            name: '图片任务查询',
            description: '查询图片生成任务的状态和结果',
            enabled: true,
            executionMode: 'sync',
            syncConfig: {
              timeout: 60,
              resultPath: 'data.0.url',
            },
            asyncConfig: {
              endpoint: '/v1/images/{id}',
              method: 'GET',
              interval: 5,
              maxAttempts: 60,
            },
            responsePaths: {
              id: 'id',
              imageUrl: 'data.0.url',
            },
            statusMapping: {
              pending: 'processing',
              processing: 'processing',
              completed: 'success',
              succeeded: 'success',
              failed: 'failed',
              error: 'failed',
            },
          },
          videoQuery: {
            name: '视频任务查询',
            description: '查询视频生成任务的状态和结果',
            enabled: true,
            executionMode: 'async',
            syncConfig: {
              timeout: 60,
              resultPath: 'data.output',
            },
            asyncConfig: {
              endpoint: '/v2/videos/generations/{id}',
              method: 'GET',
              interval: 5,
              maxAttempts: 60,
            },
            responsePaths: {
              id: 'task_id',
              imageUrl: 'data.0.url',
              videoUrl: 'data.output',
              progress: 'progress',
              status: 'status',
              failReason: 'fail_reason',
            },
            statusMapping: {
              pending: 'processing',
              processing: 'processing',
              completed: 'success',
              succeeded: 'success',
              failed: 'failed',
              error: 'failed',
              success: 'success',
            },
          },
        },
        customOptions: [
          {
            name: '尺寸',
            paramName: 'aspect_ratio',
            options: [
              {
                label: '默认(1:1)',
                value: '1:1',
              },
              {
                label: '横屏配图(4:3)',
                value: '4:3',
              },
              {
                label: '横屏壁纸(16:9)',
                value: '16:9',
              },
              {
                label: '竖屏媒体(3:4)',
                value: '3:4',
              },
              {
                label: '竖屏海报(9:16)',
                value: '9:16',
              },
            ],
            default: '1:1',
          },
        ],
      };

      // 设置默认配置
      formPackage.customConfig = JSON.stringify(defaultUnifiedConfig, null, 2);

      // 打开对话框
      visible.value = true;
    });
  }

  // SVG 源码检测和处理
  const isSvgCode = (content: string): boolean => {
    if (!content) return false;
    const trimmed = content.trim();
    return trimmed.startsWith('<svg') && trimmed.includes('</svg>');
  };

  const isSvgUrl = (url: string): boolean => {
    if (!url) return false;
    const urlWithoutQuery = url.split('?')[0].toLowerCase();
    return urlWithoutQuery.endsWith('.svg');
  };

  const sanitizeSvg = (svgText: string): string => {
    return sanitizeSvgContent(svgText);
  };

  const modelAvatarPreview = computed(() => {
    if (!formPackage.modelAvatar) return '';
    if (isSvgCode(formPackage.modelAvatar)) {
      return sanitizeSvg(formPackage.modelAvatar);
    }
    return formPackage.modelAvatar;
  });

  const shouldRenderSvg = computed(() => {
    return isSvgCode(formPackage.modelAvatar);
  });

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    if (response && response.data) {
      formPackage.modelAvatar = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  async function reuploadModelAvatar() {
    if (formPackage.modelAvatar) {
      try {
        ElMessage.info('正在重新上传模型头像...');
        const originalValue = formPackage.modelAvatar; // 保存原始值
        const file = await downloadFile(formPackage.modelAvatar);
        uploadFile(file, handleAvatarSuccess, originalValue);
      } catch (error) {
        console.error('下载模型头像文件失败', error);
        ElMessage.error('重新上传模型头像失败，请检查链接是否有效');
      }
    }
  }

  function uploadFile(file: any, successHandler: any, originalValue?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/models')
      .then((response) => {
        // 创建模拟的响应对象，与el-upload期望的结构一致
        successHandler({
          data: response.data,
        });

        // 如果是重新上传场景（有原始值），显示成功消息
        if (originalValue) {
          ElMessage.success('重新上传模型头像成功');
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue && successHandler === handleAvatarSuccess) {
          formPackage.modelAvatar = originalValue;
        }
      });
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    const form = new FormData();
    form.append('file', file);

    return uploadApi
      .uploadFile(form, 'system/models')
      .then((response) => {
        if (onSuccess) {
          // 对于普通上传（而非重新上传）显示上传成功的消息
          ElMessage.success('上传成功');
          onSuccess(response);
        }
        return response;
      })
      .catch((error) => {
        if (onError) {
          onError(error);
        }
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        return Promise.reject(error);
      });
  };

  async function downloadFile(url: string) {
    const response = await axios.get(url, { responseType: 'blob' });
    let fileName = 'downloaded_file';

    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename="([^"]+)"/.exec(contentDisposition);
      if (matches != null && matches[1]) {
        fileName = matches[1];
      }
    } else {
      fileName = getFileNameFromUrl(url);
    }

    return new File([response.data], fileName, { type: response.data.type });
  }

  function getFileNameFromUrl(url: string | URL) {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  }

  async function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        // 在保存前格式化JSON附加参数
        try {
          if (formPackage.additionalParams && formPackage.additionalParams.trim()) {
            formPackage.additionalParams = formatJSON(formPackage.additionalParams);
          }
        } catch (error) {
          ElMessage.error('附加参数JSON格式错误，请检查后重试');
          return;
        }

        const params: any = JSON.parse(JSON.stringify(formPackage));
        delete params.id;
        activeModelKeyId.value && (params.id = activeModelKeyId.value);

        await ApiModels.setModels(params);
        ElMessage({ type: 'success', message: '操作成功！' });
        activeModelKeyId.value = 0;
        visible.value = false;
        queryModelsList();
      }
    });
  }

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/svg+xml',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP、ICO 和 SVG 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  onMounted(() => {
    queryModelsList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          模型设置
        </div>
      </template>
      <HButton outline type="success" @click="handleAddModel">
        <SvgIcon name="i-ri:file-text-line" />
        添加模型
      </HButton>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="模型类型" prop="model">
          <el-select
            v-model="formInline.keyType"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="使用模型" prop="model">
          <el-select
            v-model="formInline.model"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option v-for="item in MODEL_LIST" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示状态" prop="status">
          <el-select
            v-model="status"
            placeholder="请选择模型的显示状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in QUESTION_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryModelsList"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>
    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column prop="keyType" label="模型类型" width="120">
          <template #default="scope">
            <el-tag type="success">
              {{ MODELTYPEMAP[scope.row.keyType as keyof typeof MODELTYPEMAP] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="modelOrder" label="模型排序" width="90" align="center" />
        <el-table-column prop="modelLimits" label="频率限制" width="90" align="center" />
        <el-table-column prop="modelName" label="模型名称" width="180" />
        <el-table-column prop="status" align="center" label="显示状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status ? 'success' : 'danger'">
              {{ scope.row.status ? '显示' : '隐藏' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="key" label="模型KEY" width="460">
          <template #default="scope">
            <div class="w-full overflow-y-scroll whitespace-nowrap">
              {{ scope.row.key }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="model" align="center" label="绑定模型" width="180">
          <template #default="scope">
            <el-tag :type="scope.row.model.includes('gpt-4') ? 'success' : 'info'">
              {{ scope.row.model }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isTokenBased" align="center" label="Token计费" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.isTokenBased ? 'success' : 'danger'">
              {{ scope.row.isTokenBased ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deductType" align="center" label="扣费类型" width="90">
          <template #default="scope">
            <el-tag
              :type="
                scope.row.deductType === 1
                  ? 'success'
                  : scope.row.deductType === 2
                    ? 'warning'
                    : 'info'
              "
            >
              {{
                scope.row.deductType === 1
                  ? '普通积分'
                  : scope.row.deductType === 2
                    ? '高级积分'
                    : '绘画积分'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deduct" align="center" label="单次扣除" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.deductType === 1 ? 'success' : 'warning'">
              {{ `${scope.row.deduct} 积分` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="useCount" align="center" label="调用次数" width="90" />
        <el-table-column prop="useToken" align="center" label="已使用Token" width="120" />
        <el-table-column prop="maxModelTokens" align="center" label="模型最大上下文" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.maxModelTokens || '-' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="max_tokens" align="center" label="模型最大回复" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.max_tokens || '-' }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column prop="proxyUrl" align="center" label="绑定的代理地址" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.proxyUrl || '-' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" align="center" label="添加时间" width="120">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="250">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleEditKey(scope.row)">
              变更
            </el-button>
            <el-button link type="success" size="small" @click="handleCopyKey(scope.row)">
              复制
            </el-button>
            <el-popconfirm
              title="确认删除此模型么?"
              width="180"
              icon-color="red"
              @confirm="handleDeleteKey(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除模型 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryModelsList"
          @current-change="queryModelsList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="770"
      class="max-h-[90vh] overflow-y-auto rounded-md p-4"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        v-loading="modelLoading"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
      >
        <el-form-item label="模型类型" prop="keyType">
          <el-select v-model="formPackage.keyType" placeholder="请选择模型类型" style="width: 100%">
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-if="[6].includes(Number(formPackage.keyType))"
          label="自定义配置"
          prop="customConfig"
        >
          <div class="flex items-center gap-2">
            <el-button type="primary" size="small" @click="openCustomConfigDialog">
              {{ formPackage.customConfig ? '编辑配置' : '添加配置' }}
            </el-button>
            <span v-if="formPackage.customConfig" class="text-sm text-green-600"> 已配置 </span>
            <span v-else class="text-sm text-gray-400"> 未配置 </span>
          </div>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="用户端显示"
          prop="status"
        >
          <el-switch v-model="formPackage.status" />
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="控制该模型是否在用户端显示"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="模型显示名称" prop="modelName">
          <el-input
            v-model="formPackage.modelName"
            placeholder="请填写模型显示名称（用户端看到的）"
          />
        </el-form-item>
        <el-form-item v-if="[1].includes(Number(formPackage.keyType))" label="模型简介" prop="key">
          <el-input
            v-model="formPackage.modelDescription"
            type="text"
            placeholder="请填写模型简介"
          />
        </el-form-item>
        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="模型图标"
          prop="modelAvatar"
        >
          <el-input
            v-model="formPackage.modelAvatar"
            placeholder="请填写或上传网站模型图标"
            clearable
          >
            <template #append>
              <el-upload
                class="avatar-uploader"
                :http-request="customUpload"
                :show-file-list="false"
                :on-success="handleAvatarSuccess"
                :before-upload="beforeAvatarUpload"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.svg"
                style="display: flex; align-items: center; justify-content: center"
              >
                <!-- SVG 源码渲染 -->
                <div
                  v-if="formPackage.modelAvatar && shouldRenderSvg"
                  v-html="modelAvatarPreview"
                  style="
                    max-width: 1.5rem;
                    max-height: 1.5rem;
                    margin: 5px 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                />
                <!-- 普通图片 URL 渲染 -->
                <img
                  v-else-if="formPackage.modelAvatar && !shouldRenderSvg"
                  :src="formPackage.modelAvatar"
                  style="max-width: 1.5rem; max-height: 1.5rem; margin: 5px 0; object-fit: contain"
                />
                <!-- 默认上传图标 -->
                <el-icon v-else style="width: 1rem">
                  <Plus />
                </el-icon>
              </el-upload>
              <el-icon
                v-if="formPackage.modelAvatar"
                @click="reuploadModelAvatar"
                style="margin-left: 35px; width: 1rem"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="模型排序" prop="modelOrder">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelOrder"
              :max="999"
              :min="0"
              :step="10"
              class="input-number"
              style="margin-right: 10px"
            />
            <el-tooltip
              class="box-item"
              effect="dark"
              placement="right"
              content="数值越大,模型在列表中显示越靠前"
            >
              <el-icon class="ml-3 cursor-pointer">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </el-form-item>

        <el-form-item label="模型调用频率" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelLimits"
              :max="999"
              :min="0"
              :step="5"
              class="input-number"
              style="margin-right: 10px"
            />
            <span class="unit-text">次/小时</span>
          </div>
        </el-form-item>

        <el-form-item label="模型地址" prop="proxyUrl">
          <el-input
            v-model="formPackage.proxyUrl"
            placeholder="例如 https://your-proxy.com，未指定 /v1 等版本时将自动添加 /v1"
          />
          <div v-if="actualProxyUrl" class="text-xs text-gray-400 mt-1">
            实际调用地址：{{ actualProxyUrl }}
          </div>
        </el-form-item>
        <el-form-item label="模型Key" prop="key">
          <el-input
            v-model="formPackage.key"
            type="password"
            show-password
            placeholder="留空继承全局 Key；已配置时显示占位符"
          />
        </el-form-item>

        <el-form-item label="模型参数" prop="model">
          <el-select
            v-model="formPackage.model"
            filterable
            clearable
            placeholder="请选用或填写绑定的模型"
            allow-create
          >
            <el-option v-for="item in modelList" :key="item" :label="item" :value="item" />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>
        <el-form-item label="模型扣费类型" prop="deductType">
          <el-select
            v-model="formPackage.deductType"
            filterable
            allow-create
            clearable
            placeholder="请选用模型扣费类型"
          >
            <el-option
              v-for="item in DEDUCTTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>

        <el-form-item label="单次扣除金额" prop="deduct">
          <el-input
            v-model.number="formPackage.deduct"
            style="width: 400px"
            placeholder="请填写单次调用此key的扣费金额！"
          />
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="深度思考"
          prop="deepThinkingType"
        >
          <el-radio-group v-model="formPackage.deepThinkingType">
            <el-radio :label="0">不开启</el-radio>
            <el-radio :label="1">全局思考</el-radio>
            <el-radio :label="2">自带思考</el-radio>
            <el-radio :label="3">全局思考（多模态）</el-radio>
            <el-radio :label="4">自带思考（多模态）</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="工具支持类型"
          prop="isToolSupported"
        >
          <el-radio-group v-model="formPackage.isToolSupported">
            <el-radio :label="0">不开启</el-radio>
            <el-radio :label="1">前端显示开关</el-radio>
            <el-radio :label="2">自动调用</el-radio>
          </el-radio-group>
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="控制该模型是否支持联网、绘图等工具调用功能"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="上下文限制"
          prop="maxRounds"
        >
          <el-input
            v-model.number="formPackage.maxRounds"
            placeholder="请填写允许用户选择的最高上下文条数！"
          />
        </el-form-item>
        <el-form-item
          v-if="[1 || 3].includes(Number(formPackage.keyType))"
          label="上下文Tokens"
          prop="maxModelTokens"
        >
          <el-input
            v-model.number="formPackage.maxModelTokens"
            placeholder="请填写模型最大Token、不填写默认使用默认！"
          />
        </el-form-item>

        <el-form-item
          v-if="[1 || 3].includes(Number(formPackage.keyType))"
          label="回复Tokens"
          prop="max_tokens"
        >
          <el-input
            v-model.number="formPackage.max_tokens"
            placeholder="请填写模型最大回复、不填写默认使用默认！"
          />
        </el-form-item>

        <el-form-item label="多媒体解析" prop="isImageUpload">
          <el-radio-group v-model="formPackage.isImageUpload">
            <el-radio :label="0"> 不使用 </el-radio>
            <el-radio :label="1"> 逆向格式 </el-radio>
            <el-radio :label="2"> GPT Vision </el-radio>
            <el-radio :label="3"> 全局解析 </el-radio>
          </el-radio-group>
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="控制该模型是否支持图片识别功能"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>
        <el-form-item label="文件解析" prop="isFileUpload">
          <el-radio-group v-model="formPackage.isFileUpload">
            <el-radio :label="0"> 不使用 </el-radio>
            <el-radio :label="1"> 逆向格式 </el-radio>
            <el-radio :label="2"> 向量解析 </el-radio>
          </el-radio-group>
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="控制该模型是否支持文件上传解析功能"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token 关联计费"
          prop="isTokenBased"
        >
          <el-switch v-model="formPackage.isTokenBased" />
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="开启后,模型扣费将基于实际使用的 token 数量计算"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token计费比例"
          prop="tokenFeeRatio"
        >
          <el-input
            v-model.number="formPackage.tokenFeeRatio"
            placeholder="请填写token计费比例"
            style="width: 80%"
          />
        </el-form-item>

        <el-form-item label="预设类型" prop="systemPromptType">
          <el-radio-group v-model="formPackage.systemPromptType">
            <el-radio :label="0">关闭预设</el-radio>
            <el-radio :label="1">附加模式</el-radio>
            <el-radio :label="2">覆盖模式</el-radio>
          </el-radio-group>
          <el-tooltip
            class="box-item"
            effect="dark"
            placement="right"
            content="控制系统预设提示词的应用模式"
          >
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="模型预设" prop="systemPrompt">
          <el-input
            v-model="formPackage.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="请输入模型模型预设内容"
          />
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="附加参数"
          prop="additionalParams"
        >
          <div class="w-full">
            <el-input
              v-model="formPackage.additionalParams"
              type="textarea"
              :rows="5"
              placeholder='请输入JSON格式的附加参数，例如：{"temperature": 0.7, "top_p": 1}'
            />
            <div class="flex justify-between items-center mt-2">
              <div class="text-xs text-gray-400">
                支持JSON格式的模型参数配置，将在模型调用时自动合并
              </div>
              <el-button
                type="primary"
                size="small"
                plain
                @click="handleFormatAdditionalParams"
                :disabled="!formPackage.additionalParams || !formPackage.additionalParams.trim()"
              >
                格式化JSON
              </el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="mr-5 flex justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 自定义配置弹窗 -->
    <el-dialog
      v-model="customConfigVisible"
      title="自定义工具配置"
      fullscreen
      :close-on-click-modal="false"
    >
      <!-- 迁移提示信息 -->
      <el-alert v-if="migrationNotice" type="warning" :closable="false" class="mb-4" show-icon>
        <template #title>
          <span class="whitespace-pre-line">{{ migrationNotice }}</span>
        </template>
      </el-alert>

      <div class="max-w-[1400px] mx-auto px-6 pb-6 h-[calc(100vh-140px)] overflow-y-auto">
        <!-- 工具配置 Tabs -->
        <el-tabs v-model="activeToolTab" type="border-card" class="tool-config-tabs">
          <!-- 自定义选项配置 -->
          <el-tab-pane name="customOptions" label="前端选项配置">
            <div class="mb-4 flex items-center justify-between">
              <div class="text-sm text-gray-600">
                配置前端用户可选择的参数选项，这些选项将在聊天界面以下拉菜单形式展示
              </div>
              <el-button type="primary" size="small" @click="addCustomOption">
                <el-icon><Plus /></el-icon>
                添加选项
              </el-button>
            </div>

            <div
              v-if="!configForm.customOptions || configForm.customOptions.length === 0"
              class="text-center text-gray-400 py-8"
            >
              暂无自定义选项，点击"添加选项"开始配置
            </div>

            <div
              v-for="(customOption, optIndex) in configForm.customOptions"
              :key="optIndex"
              class="mb-4 p-4 border rounded bg-gray-50"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="font-medium">选项 {{ optIndex + 1 }}</span>
                <div class="flex gap-2">
                  <!-- 上移按钮 -->
                  <el-button
                    type="primary"
                    size="small"
                    text
                    :disabled="optIndex === 0"
                    @click="moveCustomOptionUp(optIndex)"
                    title="上移此选项"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <!-- 下移按钮 -->
                  <el-button
                    type="primary"
                    size="small"
                    text
                    :disabled="optIndex === configForm.customOptions!.length - 1"
                    @click="moveCustomOptionDown(optIndex)"
                    title="下移此选项"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <!-- 删除按钮 -->
                  <el-button
                    type="danger"
                    size="small"
                    text
                    @click="removeCustomOption(optIndex)"
                    title="删除此选项"
                  >
                    <el-icon><Close /></el-icon>
                    删除
                  </el-button>
                </div>
              </div>

              <el-row :gutter="16">
                <el-col :span="8">
                  <el-form-item label="显示名称" size="small">
                    <el-input v-model="customOption.name" placeholder="如：画质选择" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="参数名称" size="small">
                    <el-input v-model="customOption.paramName" placeholder="如：quality" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="默认值" size="small">
                    <el-select v-model="customOption.default" placeholder="选择默认值">
                      <el-option
                        v-for="opt in customOption.options"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>

              <div class="mt-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-700">选项值列表</span>
                  <el-button type="primary" size="small" text @click="addOptionValue(optIndex)">
                    <el-icon><Plus /></el-icon>
                    添加选项值
                  </el-button>
                </div>

                <div v-for="(opt, valIndex) in customOption.options" :key="valIndex" class="mb-2">
                  <el-row :gutter="16">
                    <el-col :span="11">
                      <el-form-item label="显示文本" label-width="80px" size="small">
                        <el-input v-model="opt.label" placeholder="如：高清" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="11">
                      <el-form-item label="参数值" label-width="80px" size="small">
                        <el-input v-model="opt.value" placeholder="如：hd" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="2">
                      <el-form-item label-width="0" size="small">
                        <div class="flex gap-1">
                          <!-- 上移按钮 -->
                          <el-button
                            type="primary"
                            size="small"
                            text
                            circle
                            :disabled="valIndex === 0"
                            @click="moveOptionUp(optIndex, valIndex)"
                            title="上移"
                          >
                            <el-icon><ArrowUp /></el-icon>
                          </el-button>
                          <!-- 下移按钮 -->
                          <el-button
                            type="primary"
                            size="small"
                            text
                            circle
                            :disabled="valIndex === customOption.options.length - 1"
                            @click="moveOptionDown(optIndex, valIndex)"
                            title="下移"
                          >
                            <el-icon><ArrowDown /></el-icon>
                          </el-button>
                          <!-- 删除按钮 -->
                          <el-button
                            type="danger"
                            size="small"
                            text
                            circle
                            @click="removeOptionValue(optIndex, valIndex)"
                            title="删除"
                          >
                            <el-icon><Close /></el-icon>
                          </el-button>
                        </div>
                      </el-form-item>
                    </el-col>
                  </el-row>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 查询工具配置 -->
          <el-tab-pane name="queryTools" label="查询工具">
            <div class="mb-4">
              <div class="text-sm text-gray-600">
                配置图片和视频任务查询工具,用于轮询异步任务状态和获取结果
              </div>
            </div>

            <el-tabs type="card" class="query-tools-inner-tabs">
              <!-- 图片查询工具 -->
              <el-tab-pane name="imageQueryConfig" label="图片查询">
                <el-form
                  :model="configForm.queryTools.imageQuery"
                  label-width="120px"
                  size="default"
                >
                  <el-row :gutter="16">
                    <el-col :span="16">
                      <el-form-item label="工具名称">
                        <el-input v-model="configForm.queryTools.imageQuery.name" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="启用">
                        <el-switch v-model="configForm.queryTools.imageQuery.enabled" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item label="工具描述">
                    <el-input v-model="configForm.queryTools.imageQuery.description" />
                  </el-form-item>

                  <el-form-item label="执行模式">
                    <el-radio-group v-model="configForm.queryTools.imageQuery.executionMode">
                      <el-radio value="async">异步轮询</el-radio>
                      <el-radio value="sync">同步等待</el-radio>
                    </el-radio-group>
                    <div class="text-xs text-gray-500 mt-1">
                      {{
                        configForm.queryTools.imageQuery.executionMode === 'sync'
                          ? '任务提交后直接在响应中返回结果,只需配置结果URL的提取路径'
                          : '任务提交后返回taskId,需要轮询查询任务状态'
                      }}
                    </div>
                  </el-form-item>

                  <!-- 异步模式配置 -->
                  <template v-if="configForm.queryTools.imageQuery.executionMode === 'async'">
                    <el-form-item label="API 端点" required>
                      <el-input
                        v-model="configForm.queryTools.imageQuery.asyncConfig!.endpoint"
                        placeholder="/v1/images/{id}"
                      />
                    </el-form-item>
                    <el-form-item label="请求方法">
                      <el-select v-model="configForm.queryTools.imageQuery.asyncConfig!.method">
                        <el-option label="GET" value="GET" />
                        <el-option label="POST" value="POST" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="轮询间隔">
                      <el-input-number
                        v-model="configForm.queryTools.imageQuery.asyncConfig!.interval"
                        :min="1"
                        :max="60"
                      />
                      <span class="ml-2 text-sm text-gray-500">秒</span>
                    </el-form-item>
                    <el-form-item label="最大轮询次数">
                      <el-input-number
                        v-model="configForm.queryTools.imageQuery.asyncConfig!.maxAttempts"
                        :min="10"
                        :max="600"
                      />
                    </el-form-item>
                  </template>

                  <!-- 同步模式配置 -->
                  <template v-if="configForm.queryTools.imageQuery.executionMode === 'sync'">
                    <el-form-item label="超时时间">
                      <el-input-number
                        v-model="configForm.queryTools.imageQuery.syncConfig!.timeout"
                        :min="1"
                        :max="600"
                      />
                      <span class="ml-2 text-sm text-gray-500">秒</span>
                    </el-form-item>
                    <el-form-item label="结果路径" required>
                      <el-input
                        v-model="configForm.queryTools.imageQuery.syncConfig!.resultPath"
                        placeholder="如: data.url 或 data.0.url"
                      />
                      <div class="text-xs text-gray-500 mt-1">
                        响应中结果URL的路径，支持数组索引和通配符。如：data.url、data.0.url、data.*.url、output
                      </div>
                    </el-form-item>
                  </template>

                  <div
                    v-if="configForm.queryTools.imageQuery.executionMode === 'async'"
                    class="text-sm font-medium mb-3 mt-4 text-gray-700"
                  >
                    响应字段映射
                  </div>
                  <template v-if="configForm.queryTools.imageQuery.executionMode === 'async'">
                    <el-form-item label="任务ID" label-width="120px" size="small">
                      <el-input v-model="configForm.queryTools.imageQuery.responsePaths!.id" />
                    </el-form-item>
                    <el-form-item label="任务状态" label-width="120px" size="small">
                      <el-input v-model="configForm.queryTools.imageQuery.responsePaths!.status" />
                    </el-form-item>
                    <el-form-item label="图片URL" label-width="120px" size="small">
                      <el-input
                        v-model="configForm.queryTools.imageQuery.responsePaths!.imageUrl"
                      />
                    </el-form-item>
                    <el-form-item label="失败原因" label-width="120px" size="small">
                      <el-input
                        v-model="configForm.queryTools.imageQuery.responsePaths!.failReason"
                      />
                    </el-form-item>

                    <div class="text-sm font-medium mb-2 mt-3 text-gray-700">状态映射</div>
                    <el-row :gutter="8">
                      <el-col :span="8">
                        <el-form-item label="成功状态" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(configForm.queryTools.imageQuery.statusMapping?.success)
                                ? configForm.queryTools.imageQuery.statusMapping.success.join(',')
                                : configForm.queryTools.imageQuery.statusMapping?.success || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.imageQuery.statusMapping)
                                  configForm.queryTools.imageQuery.statusMapping = {};
                                configForm.queryTools.imageQuery.statusMapping.success = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="失败状态" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(configForm.queryTools.imageQuery.statusMapping?.failed)
                                ? configForm.queryTools.imageQuery.statusMapping.failed.join(',')
                                : configForm.queryTools.imageQuery.statusMapping?.failed || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.imageQuery.statusMapping)
                                  configForm.queryTools.imageQuery.statusMapping = {};
                                configForm.queryTools.imageQuery.statusMapping.failed = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="进行中" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(
                                configForm.queryTools.imageQuery.statusMapping?.processing,
                              )
                                ? configForm.queryTools.imageQuery.statusMapping.processing.join(
                                    ',',
                                  )
                                : configForm.queryTools.imageQuery.statusMapping?.processing || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.imageQuery.statusMapping)
                                  configForm.queryTools.imageQuery.statusMapping = {};
                                configForm.queryTools.imageQuery.statusMapping.processing = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </template>
                </el-form>
              </el-tab-pane>

              <!-- 视频查询工具 -->
              <el-tab-pane name="videoQueryConfig" label="视频查询">
                <el-form
                  :model="configForm.queryTools.videoQuery"
                  label-width="120px"
                  size="default"
                >
                  <el-row :gutter="16">
                    <el-col :span="16">
                      <el-form-item label="工具名称">
                        <el-input v-model="configForm.queryTools.videoQuery.name" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="启用">
                        <el-switch v-model="configForm.queryTools.videoQuery.enabled" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item label="工具描述">
                    <el-input v-model="configForm.queryTools.videoQuery.description" />
                  </el-form-item>

                  <el-form-item label="执行模式">
                    <el-radio-group v-model="configForm.queryTools.videoQuery.executionMode">
                      <el-radio value="async">异步轮询</el-radio>
                      <el-radio value="sync">同步等待</el-radio>
                    </el-radio-group>
                    <div class="text-xs text-gray-500 mt-1">
                      {{
                        configForm.queryTools.videoQuery.executionMode === 'sync'
                          ? '任务提交后直接在响应中返回结果,只需配置结果URL的提取路径'
                          : '任务提交后返回taskId,需要轮询查询任务状态'
                      }}
                    </div>
                  </el-form-item>

                  <!-- 异步模式配置 -->
                  <template v-if="configForm.queryTools.videoQuery.executionMode === 'async'">
                    <el-form-item label="API 端点" required>
                      <el-input
                        v-model="configForm.queryTools.videoQuery.asyncConfig!.endpoint"
                        placeholder="/v1/videos/{id}"
                      />
                    </el-form-item>
                    <el-form-item label="请求方法">
                      <el-select v-model="configForm.queryTools.videoQuery.asyncConfig!.method">
                        <el-option label="GET" value="GET" />
                        <el-option label="POST" value="POST" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="轮询间隔">
                      <el-input-number
                        v-model="configForm.queryTools.videoQuery.asyncConfig!.interval"
                        :min="1"
                        :max="60"
                      />
                      <span class="ml-2 text-sm text-gray-500">秒</span>
                    </el-form-item>
                    <el-form-item label="最大轮询次数">
                      <el-input-number
                        v-model="configForm.queryTools.videoQuery.asyncConfig!.maxAttempts"
                        :min="10"
                        :max="600"
                      />
                    </el-form-item>
                  </template>

                  <!-- 同步模式配置 -->
                  <template v-if="configForm.queryTools.videoQuery.executionMode === 'sync'">
                    <el-form-item label="超时时间">
                      <el-input-number
                        v-model="configForm.queryTools.videoQuery.syncConfig!.timeout"
                        :min="1"
                        :max="600"
                      />
                      <span class="ml-2 text-sm text-gray-500">秒</span>
                    </el-form-item>
                    <el-form-item label="结果路径" required>
                      <el-input
                        v-model="configForm.queryTools.videoQuery.syncConfig!.resultPath"
                        placeholder="如: data.output 或 data.0.output"
                      />
                      <div class="text-xs text-gray-500 mt-1">
                        响应中结果URL的路径，支持数组索引和通配符。如：data.output、data.0.url、data.*.output、output
                      </div>
                    </el-form-item>
                  </template>

                  <div
                    v-if="configForm.queryTools.videoQuery.executionMode === 'async'"
                    class="text-sm font-medium mb-3 mt-4 text-gray-700"
                  >
                    响应字段映射
                  </div>
                  <template v-if="configForm.queryTools.videoQuery.executionMode === 'async'">
                    <el-form-item label="任务ID" label-width="120px" size="small">
                      <el-input v-model="configForm.queryTools.videoQuery.responsePaths!.id" />
                    </el-form-item>
                    <el-form-item label="任务状态" label-width="120px" size="small">
                      <el-input v-model="configForm.queryTools.videoQuery.responsePaths!.status" />
                    </el-form-item>
                    <el-form-item label="视频URL" label-width="120px" size="small">
                      <el-input
                        v-model="configForm.queryTools.videoQuery.responsePaths!.videoUrl"
                      />
                    </el-form-item>
                    <el-form-item label="进度" label-width="120px" size="small">
                      <el-input
                        v-model="configForm.queryTools.videoQuery.responsePaths!.progress"
                      />
                    </el-form-item>
                    <el-form-item label="失败原因" label-width="120px" size="small">
                      <el-input
                        v-model="configForm.queryTools.videoQuery.responsePaths!.failReason"
                      />
                    </el-form-item>

                    <div class="text-sm font-medium mb-2 mt-3 text-gray-700">状态映射</div>
                    <el-row :gutter="8">
                      <el-col :span="8">
                        <el-form-item label="成功状态" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(configForm.queryTools.videoQuery.statusMapping?.success)
                                ? configForm.queryTools.videoQuery.statusMapping.success.join(',')
                                : configForm.queryTools.videoQuery.statusMapping?.success || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.videoQuery.statusMapping)
                                  configForm.queryTools.videoQuery.statusMapping = {};
                                configForm.queryTools.videoQuery.statusMapping.success = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="失败状态" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(configForm.queryTools.videoQuery.statusMapping?.failed)
                                ? configForm.queryTools.videoQuery.statusMapping.failed.join(',')
                                : configForm.queryTools.videoQuery.statusMapping?.failed || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.videoQuery.statusMapping)
                                  configForm.queryTools.videoQuery.statusMapping = {};
                                configForm.queryTools.videoQuery.statusMapping.failed = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="进行中" label-width="90px" size="small">
                          <el-input
                            :model-value="
                              Array.isArray(
                                configForm.queryTools.videoQuery.statusMapping?.processing,
                              )
                                ? configForm.queryTools.videoQuery.statusMapping.processing.join(
                                    ',',
                                  )
                                : configForm.queryTools.videoQuery.statusMapping?.processing || ''
                            "
                            @update:model-value="
                              (val: string) => {
                                if (!configForm.queryTools.videoQuery.statusMapping)
                                  configForm.queryTools.videoQuery.statusMapping = {};
                                configForm.queryTools.videoQuery.statusMapping.processing = val;
                              }
                            "
                          />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </template>
                </el-form>
              </el-tab-pane>
            </el-tabs>
          </el-tab-pane>

          <!-- 动态渲染所有工具 -->
          <el-tab-pane
            v-for="(tool, toolKey) in visibleTools"
            :key="toolKey"
            :name="toolKey as string"
          >
            <!-- Tab 标签 -->
            <template #label>
              <div class="flex items-center gap-2">
                <span>{{ tool.name || toolKey }}</span>
                <el-button
                  v-if="!protectedTools.includes(toolKey as string)"
                  type="danger"
                  size="small"
                  text
                  circle
                  @click.stop="removeTool(toolKey as string)"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
            </template>

            <!-- 通用工具配置表单 -->
            <el-form :model="tool" label-width="120px" size="default">
              <!-- 基本信息 -->
              <el-row :gutter="16">
                <el-col :span="16">
                  <el-form-item label="工具名称">
                    <el-input v-model="tool.name" :placeholder="String(toolKey)" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="启用">
                    <el-switch v-model="tool.enabled" />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="工具描述">
                <el-input v-model="tool.description" placeholder="描述该工具的功能" />
              </el-form-item>
              <el-form-item label="API 端点" required>
                <el-input v-model="tool.endpoint" placeholder="/v1/videos/generations" />
              </el-form-item>
              <el-form-item label="请求方法">
                <el-select v-model="tool.method">
                  <el-option label="POST" value="POST" />
                  <el-option label="GET" value="GET" />
                </el-select>
              </el-form-item>
              <el-form-item label="请求格式" v-if="tool.method === 'POST'">
                <el-select v-model="tool.contentType" placeholder="选择请求内容类型">
                  <el-option label="JSON (默认)" value="application/json" />
                  <el-option label="表单数据 (multipart/form-data)" value="multipart/form-data" />
                </el-select>
                <div class="text-xs text-gray-500 mt-1">
                  选择 multipart/form-data
                  格式，可同时传递文件和参数。请在下方勾选"文件"标记哪些字段为文件类型
                </div>
              </el-form-item>

              <!-- 文件传递格式 -->
              <el-form-item label="文件传递格式" v-if="tool.method === 'POST'">
                <el-radio-group v-model="tool.fileTransferFormat">
                  <el-radio label="url">URL 链接</el-radio>
                  <el-radio label="base64">Base64 编码</el-radio>
                </el-radio-group>
                <div class="text-xs text-gray-500 mt-1">
                  选择文件传递方式。URL 链接：直接传递 URL；Base64 编码：将文件转换为 base64
                  编码（仅 JSON 模式有效）
                </div>
              </el-form-item>

              <!-- 添加查询工具选择 -->
              <el-form-item label="查询工具" v-if="tool.method === 'POST'">
                <el-select v-model="tool.queryTool" placeholder="选择查询工具">
                  <el-option label="图片查询 (imageQuery)" value="imageQuery" />
                  <el-option label="视频查询 (videoQuery)" value="videoQuery" />
                </el-select>
                <div class="text-xs text-gray-500 mt-1">用于查询异步任务状态和结果的工具</div>
              </el-form-item>

              <!-- 覆盖配置 -->
              <el-form-item label="覆盖 API 地址">
                <el-input
                  v-model="tool.overrideUrl"
                  placeholder="留空使用模型配置的代理地址，或输入完整URL覆盖"
                />
                <div class="text-xs text-gray-500 mt-1">可选，留空则使用模型的统一代理地址</div>
              </el-form-item>
              <el-form-item label="覆盖 API Key">
                <el-input
                  v-model="tool.overrideKey"
                  placeholder="留空使用模型的 API Key，或输入覆盖的密钥"
                />
                <div class="text-xs text-gray-500 mt-1">可选，留空则使用模型的统一 API Key</div>
              </el-form-item>

              <!-- 请求参数 -->
              <div
                class="text-sm font-medium mb-3 mt-4 text-gray-700 flex items-center justify-between"
              >
                <span>请求参数</span>
                <el-button
                  size="small"
                  type="primary"
                  text
                  @click="addRequestParam(toolKey as string)"
                >
                  + 添加参数
                </el-button>
              </div>
              <div
                v-for="(param, index) in tool.requestParams"
                :key="index"
                class="mb-3 p-3 border rounded"
              >
                <el-row :gutter="16">
                  <el-col :span="10">
                    <el-form-item label="参数名" label-width="80px" size="small">
                      <el-input
                        v-model="param.name"
                        placeholder="prompt"
                        :disabled="param.name === 'billing_coefficient'"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="类型" label-width="60px" size="small">
                      <el-select
                        v-model="param.type"
                        :disabled="param.name === 'billing_coefficient'"
                      >
                        <el-option label="string" value="string" />
                        <el-option label="number" value="number" />
                        <el-option label="boolean" value="boolean" />
                        <el-option label="array" value="array" />
                        <el-option label="object" value="object" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label-width="0" size="small">
                      <el-checkbox
                        v-model="param.required"
                        :disabled="param.name === 'billing_coefficient'"
                      >
                        必填
                      </el-checkbox>
                      <el-checkbox
                        v-if="
                          tool.contentType === 'multipart/form-data' ||
                          tool.fileTransferFormat === 'base64'
                        "
                        v-model="param.isFile"
                        :disabled="param.name === 'billing_coefficient'"
                      >
                        文件
                      </el-checkbox>
                      <el-button
                        type="danger"
                        size="small"
                        text
                        @click="removeRequestParam(toolKey as string, index)"
                        :disabled="param.name === 'billing_coefficient'"
                      >
                        删除
                      </el-button>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="描述" label-width="80px" size="small">
                  <el-input v-model="param.description" placeholder="参数说明" />
                </el-form-item>
              </div>

              <!-- 响应字段映射 -->
              <div class="text-sm font-medium mb-3 mt-4 text-gray-700 flex items-center gap-2">
                <span>响应字段映射</span>
                <el-tooltip
                  content="配置如何从 API 响应中提取数据，使用 JSONPath 语法（如 data.output 或 task_id）"
                  placement="top"
                >
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </div>

              <el-form-item label="任务ID" label-width="120px" size="small">
                <el-input v-model="tool.responsePaths.id" placeholder="如: task_id 或 data.id" />
                <div class="text-xs text-gray-500 mt-1">提交任务后返回的任务ID，用于后续查询</div>
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>

        <!-- 新增工具对话框 -->
        <el-dialog v-model="showAddToolDialog" title="新增自定义工具" width="500px">
          <el-form label-width="80px">
            <el-form-item label="工具键名">
              <el-input
                v-model="newToolKey"
                placeholder="例如: text2image, image2video"
                @input="newToolKey = newToolKey.toLowerCase()"
              />
              <div class="text-xs text-gray-500 mt-2">
                <p>• 建议使用 <code>XXX2image</code> 格式（图像工具）</p>
                <p>• 建议使用 <code>XXX2video</code> 格式（视频工具）</p>
                <p class="text-amber-600 mt-1">⚠️ 系统通过键名自动识别媒体类型</p>
              </div>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showAddToolDialog = false">取消</el-button>
            <el-button type="primary" @click="confirmAddTool">创建</el-button>
          </template>
        </el-dialog>
      </div>

      <template #footer>
        <div class="flex justify-between items-center w-full">
          <div class="flex gap-2 items-center">
            <el-button plain @click="importExportVisible = true">
              <el-icon class="mr-1"><DocumentCopy /></el-icon>
              配置导入导出
            </el-button>
            <el-button type="primary" @click="addNewTool">
              <el-icon class="mr-1"><Plus /></el-icon>
              新增工具
            </el-button>
          </div>
          <div class="flex gap-2 items-center">
            <el-button @click="customConfigVisible = false"> 取消 </el-button>
            <el-button type="primary" @click="saveCustomConfig"> 保存配置 </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 配置导入导出小弹窗 -->
    <el-dialog
      v-model="importExportVisible"
      title="配置导入导出"
      width="700px"
      :close-on-click-modal="false"
    >
      <div class="px-2">
        <div class="text-xs text-gray-500 mb-3">
          导出：点击导出按钮生成配置 | 导入：粘贴配置JSON并选择导入模式
        </div>

        <el-input
          v-model="importExportJson"
          type="textarea"
          :rows="12"
          placeholder='粘贴或查看配置JSON，格式如：{"type":"unified","tools":{...},"proxyUrl":"...","modelName":"..."}'
        />

        <!-- 导出按钮 -->
        <div class="mt-4 flex justify-between items-center">
          <div class="flex gap-2">
            <el-button size="default" @click="handleGenerateExportJson">
              <el-icon class="mr-1"><Download /></el-icon>
              导出配置
            </el-button>
            <el-button
              size="default"
              type="success"
              :disabled="!importExportJson"
              @click="handleCopyJson"
            >
              <el-icon class="mr-1"><DocumentCopy /></el-icon>
              复制到剪贴板
            </el-button>
          </div>

          <!-- 导入按钮组 -->
          <div class="flex gap-2">
            <el-dropdown trigger="click" @command="handleImportByMode">
              <el-button size="default" type="primary" :disabled="!importExportJson">
                <el-icon class="mr-1"><Upload /></el-icon>
                导入配置
                <el-icon class="ml-1"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="image">
                    <el-icon class="mr-1"><Picture /></el-icon>
                    导入图片配置
                  </el-dropdown-item>
                  <el-dropdown-item command="video">
                    <el-icon class="mr-1"><VideoCamera /></el-icon>
                    导入视频配置
                  </el-dropdown-item>
                  <el-dropdown-item command="all" divided>
                    <el-icon class="mr-1"><Document /></el-icon>
                    导入全部配置
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
  /* 工具配置标签页 */
  .tool-config-tabs {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  /* 调整对话框 footer 高度 */
  :deep(.el-dialog__footer) {
    padding: 16px 20px;
  }
</style>
