/**
 * 图片生成服务预设配置
 * 用于快速导入不同服务商的配置
 */

export interface ImagePreset {
  name: string;
  provider: string;
  description: string;
  config: {
    type: 'image';
    executionMode: 'sync' | 'async';
    tools: Record<string, any>;
    customOptions?: Array<{
      name: string;
      paramName: string;
      options: Array<{ label: string; value: string }>;
      default?: string;
    }>;
  };
}

export const imagePresets: ImagePreset[] = [
  {
    name: 'OpenAI DALL-E',
    provider: 'OpenAI',
    description: 'OpenAI DALL-E 图片生成服务（同步模式）',
    config: {
      type: 'image',
      executionMode: 'sync',
      tools: {
        text2image: {
          name: '文生图',
          description: '根据文本描述生成图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
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
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'size',
              type: 'string',
              description: '图片尺寸',
              required: false,
              source: 'custom',
              default: '1024x1024',
            },
            {
              name: 'quality',
              type: 'string',
              description: '图片质量',
              required: false,
              source: 'custom',
              default: 'standard',
            },
          ],
          responsePaths: {
            imageUrl: 'data.0.url',
          },
        },
        image2image: {
          name: '图生图',
          description: '基于图片生成新图片（编辑/变体）',
          enabled: true,
          endpoint: '/v1/images/edits',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '编辑描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '输入图片URL',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'size',
              type: 'string',
              description: '输出尺寸',
              required: false,
              source: 'custom',
              default: '1024x1024',
            },
          ],
          responsePaths: {
            imageUrl: 'data.0.url',
          },
        },
      },
      customOptions: [
        {
          name: '图片尺寸',
          paramName: 'size',
          options: [
            { label: '1024x1024 正方形', value: '1024x1024' },
            { label: '1792x1024 横屏', value: '1792x1024' },
            { label: '1024x1792 竖屏', value: '1024x1792' },
          ],
          default: '1024x1024',
        },
        {
          name: '图片质量',
          paramName: 'quality',
          options: [
            { label: '标准', value: 'standard' },
            { label: '高清', value: 'hd' },
          ],
          default: 'standard',
        },
      ],
    },
  },
  {
    name: 'Flux Pro (异步)',
    provider: 'Black Forest Labs',
    description: 'Flux Pro 图片生成服务（异步轮询模式）',
    config: {
      type: 'image',
      executionMode: 'async',
      tools: {
        text2image: {
          name: '文生图',
          description: '根据文本描述生成图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
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
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'width',
              type: 'integer',
              description: '图片宽度',
              required: false,
              source: 'custom',
              default: 1024,
            },
            {
              name: 'height',
              type: 'integer',
              description: '图片高度',
              required: false,
              source: 'custom',
              default: 1024,
            },
            {
              name: 'steps',
              type: 'integer',
              description: '采样步数',
              required: false,
              source: 'custom',
              default: 50,
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        image2image: {
          name: '图生图',
          description: '基于图片生成新图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '图片描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '输入图片URL',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'strength',
              type: 'number',
              description: '变化强度',
              required: false,
              source: 'custom',
              default: 0.75,
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/v1/images/generations/{id}',
          method: 'GET',
          responsePaths: {
            id: 'id',
            status: 'status',
            imageUrl: 'result.sample',
            failReason: 'error',
          },
          statusMapping: {
            pending: 'processing',
            'Request Moderated': 'processing',
            'Content Moderated': 'failed',
            processing: 'processing',
            ready: 'success',
            error: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '图片尺寸',
          paramName: 'size',
          options: [
            { label: '1024x1024 正方形', value: '1024x1024' },
            { label: '1024x768 横屏', value: '1024x768' },
            { label: '768x1024 竖屏', value: '768x1024' },
            { label: '1920x1080 宽屏', value: '1920x1080' },
          ],
          default: '1024x1024',
        },
        {
          name: '采样步数',
          paramName: 'steps',
          options: [
            { label: '25步 (快速)', value: '25' },
            { label: '50步 (推荐)', value: '50' },
            { label: '100步 (高质量)', value: '100' },
          ],
          default: '50',
        },
      ],
    },
  },
  {
    name: 'Stability AI',
    provider: 'Stability AI',
    description: 'Stable Diffusion 图片生成服务（异步模式）',
    config: {
      type: 'image',
      executionMode: 'async',
      tools: {
        text2image: {
          name: '文生图',
          description: '根据文本描述生成图片',
          enabled: true,
          endpoint: '/v2beta/stable-image/generate/sd3',
          method: 'POST',
          requestParams: [
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
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'aspect_ratio',
              type: 'string',
              description: '宽高比',
              required: false,
              source: 'custom',
              default: '1:1',
            },
            {
              name: 'output_format',
              type: 'string',
              description: '输出格式',
              required: false,
              source: 'custom',
              default: 'png',
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        image2image: {
          name: '图生图',
          description: '基于图片生成新图片',
          enabled: true,
          endpoint: '/v2beta/stable-image/generate/sd3',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '图片描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '输入图片',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'strength',
              type: 'number',
              description: '变化强度',
              required: false,
              source: 'custom',
              default: 0.7,
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/v2beta/stable-image/result/{id}',
          method: 'GET',
          responsePaths: {
            id: 'id',
            status: 'status',
            imageUrl: 'image',
            failReason: 'errors.0',
          },
          statusMapping: {
            in_progress: 'processing',
            complete: 'success',
            failed: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '宽高比',
          paramName: 'aspect_ratio',
          options: [
            { label: '1:1 正方形', value: '1:1' },
            { label: '16:9 横屏', value: '16:9' },
            { label: '21:9 超宽屏', value: '21:9' },
            { label: '9:16 竖屏', value: '9:16' },
            { label: '4:3 标准', value: '4:3' },
          ],
          default: '1:1',
        },
        {
          name: '输出格式',
          paramName: 'output_format',
          options: [
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
            { label: 'WebP', value: 'webp' },
          ],
          default: 'png',
        },
      ],
    },
  },
  {
    name: '通用图片服务 (同步)',
    provider: '通用',
    description: '通用图片生成服务（适用于兼容OpenAI格式的同步服务）',
    config: {
      type: 'image',
      executionMode: 'sync',
      tools: {
        text2image: {
          name: '文生图',
          description: '根据文本描述生成图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
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
              description: '模型名称',
              required: true,
              source: 'model',
            },
          ],
          responsePaths: {
            imageUrl: 'data.0.url',
          },
        },
        image2image: {
          name: '图生图',
          description: '基于图片生成新图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '图片描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '输入图片',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
          ],
          responsePaths: {
            imageUrl: 'data.0.url',
          },
        },
      },
    },
  },
  {
    name: '通用图片服务 (异步)',
    provider: '通用',
    description: '通用图片生成服务（适用于异步轮询格式的服务）',
    config: {
      type: 'image',
      executionMode: 'async',
      tools: {
        text2image: {
          name: '文生图',
          description: '根据文本描述生成图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
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
              description: '模型名称',
              required: true,
              source: 'model',
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        image2image: {
          name: '图生图',
          description: '基于图片生成新图片',
          enabled: true,
          endpoint: '/v1/images/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '图片描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '输入图片',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/v1/images/generations/{id}',
          method: 'GET',
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
      },
    },
  },
];
