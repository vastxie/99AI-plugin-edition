/**
 * 视频生成服务预设配置
 * 用于快速导入不同服务商的配置
 */

export interface VideoPreset {
  name: string;
  provider: string;
  description: string;
  config: {
    type: 'video';
    tools: Record<string, any>;
    customOptions?: Array<{
      name: string;
      paramName: string;
      options: Array<{ label: string; value: string }>;
      default?: string;
    }>;
  };
}

export const videoPresets: VideoPreset[] = [
  {
    name: 'OpenAI Sora',
    provider: 'OpenAI',
    description: 'OpenAI Sora 视频生成服务（兼容格式）',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/v1/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
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
            id: 'task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/v1/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: false,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '参考图片URL',
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
            id: 'task_id',
          },
        },
        video2video: {
          name: '视频Remix',
          description: '基于已有视频生成新视频（Remix功能）',
          enabled: true,
          endpoint: '/v1/videos/{id}/remix',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '重新混合的提示文本',
              required: true,
              source: 'prompt',
            },
          ],
          responsePaths: {
            id: 'id',
            remixedFromId: 'remixed_from_video_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/v1/videos/generations/{id}',
          method: 'GET',
          responsePaths: {
            id: 'task_id',
            status: 'status',
            url: 'data.output',
            failReason: 'fail_reason',
            progress: 'progress',
          },
          statusMapping: {
            pending: 'processing',
            processing: 'processing',
            completed: 'success',
            failed: 'failed',
          },
        },
      },
    },
  },
  {
    name: 'Kling 可灵',
    provider: '快手',
    description: 'Kling 可灵视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/kling/v1/videos/text2video',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'model_name',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'aspect_ratio',
              type: 'string',
              description: '视频比例',
              required: false,
              source: 'custom',
              default: '16:9',
            },
            {
              name: 'duration',
              type: 'string',
              description: '视频时长',
              required: false,
              source: 'custom',
              default: '5',
            },
          ],
          responsePaths: {
            id: 'data.task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/kling/v1/videos/image2video',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'string',
              description: '参考图片URL',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model_name',
              type: 'string',
              description: '模型名称',
              required: true,
              source: 'model',
            },
            {
              name: 'duration',
              type: 'string',
              description: '视频时长',
              required: false,
              source: 'custom',
              default: '5',
            },
          ],
          responsePaths: {
            id: 'data.task_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/kling/v1/videos/text2video/{id}',
          method: 'GET',
          responsePaths: {
            id: 'data.task_id',
            status: 'data.task_status',
            url: 'data.task_result.videos.0.url',
            failReason: 'message',
          },
          statusMapping: {
            submitted: 'processing',
            processing: 'processing',
            succeed: 'success',
            failed: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '视频比例',
          paramName: 'aspect_ratio',
          options: [
            { label: '16:9 横屏', value: '16:9' },
            { label: '9:16 竖屏', value: '9:16' },
            { label: '1:1 正方形', value: '1:1' },
          ],
          default: '16:9',
        },
        {
          name: '视频时长',
          paramName: 'duration',
          options: [
            { label: '5秒', value: '5' },
            { label: '10秒', value: '10' },
          ],
          default: '5',
        },
      ],
    },
  },
  {
    name: 'Minimax',
    provider: 'Minimax',
    description: 'Minimax 海螺视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/vmodel/generate',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
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
            id: 'task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/vmodel/generate',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: false,
              source: 'prompt',
            },
            {
              name: 'first_frame_image',
              type: 'string',
              description: '首帧图片URL',
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
            id: 'task_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/vmodel/feed/{id}',
          method: 'GET',
          responsePaths: {
            id: 'task_id',
            status: 'status',
            url: 'file_id',
            failReason: 'message',
          },
          statusMapping: {
            Queueing: 'processing',
            Processing: 'processing',
            Success: 'success',
            Failed: 'failed',
          },
        },
      },
    },
  },
  {
    name: 'CogVideo',
    provider: '智谱AI',
    description: '智谱 CogVideo 视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/cogvideox/v4/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
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
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/cogvideox/v4/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image_url',
              type: 'string',
              description: '参考图片URL',
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
          endpoint: '/cogvideox/v4/async-result/{id}',
          method: 'GET',
          responsePaths: {
            id: 'request_id',
            status: 'task_status',
            url: 'video_result.0.url',
            failReason: 'message',
          },
          statusMapping: {
            SUCCESS: 'success',
            PROCESSING: 'processing',
            FAILED: 'failed',
          },
        },
      },
    },
  },
  {
    name: '即梦视频',
    provider: '即梦AI',
    description: '即梦3.0 视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/jimeng/submit/videos',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'duration',
              type: 'integer',
              description: '视频时长（秒）',
              required: false,
              source: 'custom',
              default: 5,
            },
            {
              name: 'aspect_ratio',
              type: 'string',
              description: '视频宽高比',
              required: false,
              source: 'custom',
              default: '16:9',
            },
            {
              name: 'cfg_scale',
              type: 'number',
              description: 'CFG scale参数',
              required: false,
              source: 'custom',
              default: 0.5,
            },
          ],
          responsePaths: {
            id: 'data',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/jimeng/submit/videos',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image_url',
              type: 'string',
              description: '参考图片URL',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'duration',
              type: 'integer',
              description: '视频时长（秒）',
              required: false,
              source: 'custom',
              default: 5,
            },
            {
              name: 'aspect_ratio',
              type: 'string',
              description: '视频宽高比',
              required: false,
              source: 'custom',
              default: '16:9',
            },
            {
              name: 'cfg_scale',
              type: 'number',
              description: 'CFG scale参数',
              required: false,
              source: 'custom',
              default: 0.5,
            },
          ],
          responsePaths: {
            id: 'data',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/jimeng/fetch/{id}',
          method: 'GET',
          responsePaths: {
            id: 'data.task_id',
            status: 'data.status',
            url: 'data.data.video',
            failReason: 'data.fail_reason',
            progress: 'data.progress',
          },
          statusMapping: {
            SUBMITTED: 'processing',
            QUEUED: 'processing',
            IN_PROGRESS: 'processing',
            NOT_START: 'processing',
            SUCCESS: 'success',
            FAILURE: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '视频时长',
          paramName: 'duration',
          options: [
            { label: '5秒', value: '5' },
            { label: '10秒', value: '10' },
          ],
          default: '5',
        },
        {
          name: '视频比例',
          paramName: 'aspect_ratio',
          options: [
            { label: '1:1 正方形', value: '1:1' },
            { label: '21:9 超宽屏', value: '21:9' },
            { label: '16:9 横屏', value: '16:9' },
            { label: '9:16 竖屏', value: '9:16' },
            { label: '4:3 标准', value: '4:3' },
            { label: '3:4 竖屏标准', value: '3:4' },
          ],
          default: '16:9',
        },
        {
          name: 'CFG Scale',
          paramName: 'cfg_scale',
          options: [
            { label: '0.3 (低)', value: '0.3' },
            { label: '0.5 (推荐)', value: '0.5' },
            { label: '0.7 (高)', value: '0.7' },
            { label: '1.0 (最高)', value: '1.0' },
          ],
          default: '0.5',
        },
      ],
    },
  },
  {
    name: 'Luma Dream Machine',
    provider: 'Luma AI',
    description: 'Luma Dream Machine 视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/luma/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'user_prompt',
              type: 'string',
              description: '视频描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'resolution',
              type: 'string',
              description: '视频分辨率',
              required: false,
              source: 'custom',
              default: '720p',
            },
            {
              name: 'duration',
              type: 'string',
              description: '视频时长',
              required: false,
              source: 'custom',
              default: '5s',
            },
            {
              name: 'model_name',
              type: 'string',
              description: '模型版本',
              required: false,
              source: 'custom',
              default: 'ray-v2',
            },
            {
              name: 'loop',
              type: 'boolean',
              description: '首尾呼应循环',
              required: false,
              source: 'custom',
              default: false,
            },
            {
              name: 'expand_prompt',
              type: 'boolean',
              description: '自动优化提示词',
              required: false,
              source: 'custom',
              default: true,
            },
          ],
          responsePaths: {
            id: 'id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/luma/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'user_prompt',
              type: 'string',
              description: '动画描述',
              required: false,
              source: 'prompt',
            },
            {
              name: 'image_url',
              type: 'string',
              description: '参考图片URL',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'resolution',
              type: 'string',
              description: '视频分辨率',
              required: false,
              source: 'custom',
              default: '720p',
            },
            {
              name: 'duration',
              type: 'string',
              description: '视频时长',
              required: false,
              source: 'custom',
              default: '5s',
            },
            {
              name: 'model_name',
              type: 'string',
              description: '模型版本',
              required: false,
              source: 'custom',
              default: 'ray-v2',
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
          endpoint: '/luma/generations/{id}',
          method: 'GET',
          responsePaths: {
            id: 'id',
            status: 'state',
            url: 'video.url',
            failReason: 'failure_reason',
            progress: 'progress',
          },
          statusMapping: {
            processing: 'processing',
            completed: 'success',
            failed: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '视频分辨率',
          paramName: 'resolution',
          options: [
            { label: '720p 标准', value: '720p' },
            { label: '1080p 高清', value: '1080p' },
          ],
          default: '720p',
        },
        {
          name: '视频时长',
          paramName: 'duration',
          options: [
            { label: '5秒', value: '5s' },
            { label: '10秒', value: '10s' },
          ],
          default: '5s',
        },
        {
          name: '模型版本',
          paramName: 'model_name',
          options: [
            { label: 'Ray v1 (经典)', value: 'ray-v1' },
            { label: 'Ray v2 (推荐)', value: 'ray-v2' },
          ],
          default: 'ray-v2',
        },
        {
          name: '循环模式',
          paramName: 'loop',
          options: [
            { label: '关闭', value: 'false' },
            { label: '开启', value: 'true' },
          ],
          default: 'false',
        },
      ],
    },
  },
  {
    name: 'Google Veo',
    provider: 'Google',
    description: 'Google Veo 视频生成服务',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/google/v1/models/veo/videos',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型版本',
              required: true,
              source: 'custom',
              default: 'veo3',
            },
            {
              name: 'enhance_prompt',
              type: 'boolean',
              description: '自动优化提示词',
              required: false,
              source: 'custom',
              default: true,
            },
          ],
          responsePaths: {
            id: 'task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/google/v1/models/veo/videos',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'images',
              type: 'array',
              description: '参考图片URL数组',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型版本（图生视频固定使用veo3-pro-frames）',
              required: true,
              source: 'custom',
              default: 'veo3-pro-frames',
            },
            {
              name: 'enhance_prompt',
              type: 'boolean',
              description: '自动优化提示词',
              required: false,
              source: 'custom',
              default: true,
            },
          ],
          responsePaths: {
            id: 'task_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/google/v1/tasks/{id}',
          method: 'GET',
          responsePaths: {
            id: 'task_id',
            status: 'status',
            url: 'video_url',
            failReason: 'error.message',
          },
          statusMapping: {
            pending: 'processing',
            processing: 'processing',
            completed: 'success',
            failed: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '模型版本',
          paramName: 'model',
          options: [
            { label: 'Veo 3 (基础)', value: 'veo3' },
            { label: 'Veo 3 Pro Fast (快速)', value: 'veo3-pro-fast' },
            { label: 'Veo 3 Pro (高质量)', value: 'veo3-pro' },
            { label: 'Veo 3 Pro Frames (帧控制)', value: 'veo3-pro-frames' },
          ],
          default: 'veo3',
        },
        {
          name: '提示词优化',
          paramName: 'enhance_prompt',
          options: [
            { label: '关闭', value: 'false' },
            { label: '开启', value: 'true' },
          ],
          default: 'true',
        },
      ],
    },
  },
  {
    name: 'Higgsfield',
    provider: 'Higgsfield AI',
    description: 'Higgsfield 图生视频服务（基础模式）',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: false,
          endpoint: '/higgsfield/generate',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型类型',
              required: false,
              source: 'custom',
              default: 'standard',
            },
            {
              name: 'enhance_prompt',
              type: 'boolean',
              description: '提示词增强',
              required: false,
              source: 'custom',
              default: true,
            },
            {
              name: 'motion_id',
              type: 'string',
              description: '动作模板ID',
              required: false,
              source: 'custom',
              default: 'cd5bfd11-5a1a-46e0-9294-b22b0b733b1e',
            },
          ],
          responsePaths: {
            id: 'task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/higgsfield/generate',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: true,
              source: 'prompt',
            },
            {
              name: 'image',
              type: 'array',
              description: '参考图片URL数组',
              required: true,
              source: 'imageUrl',
            },
            {
              name: 'model',
              type: 'string',
              description: '模型类型',
              required: false,
              source: 'custom',
              default: 'standard',
            },
            {
              name: 'enhance_prompt',
              type: 'boolean',
              description: '提示词增强',
              required: false,
              source: 'custom',
              default: true,
            },
            {
              name: 'motion_id',
              type: 'string',
              description: '动作模板ID',
              required: false,
              source: 'custom',
              default: 'cd5bfd11-5a1a-46e0-9294-b22b0b733b1e',
            },
          ],
          responsePaths: {
            id: 'task_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/higgsfield/tasks/{id}',
          method: 'GET',
          responsePaths: {
            id: 'task_id',
            status: 'status',
            url: 'video_url',
            failReason: 'error',
          },
          statusMapping: {
            pending: 'processing',
            processing: 'processing',
            completed: 'success',
            failed: 'failed',
          },
        },
      },
      customOptions: [
        {
          name: '模型类型',
          paramName: 'model',
          options: [
            { label: 'Standard (高质量)', value: 'standard' },
            { label: 'Lite (快速)', value: 'lite' },
            { label: 'Turbo (最快)', value: 'turbo' },
          ],
          default: 'standard',
        },
        {
          name: '提示词增强',
          paramName: 'enhance_prompt',
          options: [
            { label: '关闭', value: 'false' },
            { label: '开启', value: 'true' },
          ],
          default: 'true',
        },
      ],
    },
  },
  {
    name: '通用视频服务',
    provider: '通用',
    description: '通用视频生成服务（适用于大多数兼容OpenAI格式的服务）',
    config: {
      type: 'video',
      tools: {
        text2video: {
          name: '文本生成视频',
          description: '根据文本描述生成视频',
          enabled: true,
          endpoint: '/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '视频描述',
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
            id: 'task_id',
          },
        },
        image2video: {
          name: '图片生成视频',
          description: '基于图片生成动态视频',
          enabled: true,
          endpoint: '/videos/generations',
          method: 'POST',
          requestParams: [
            {
              name: 'prompt',
              type: 'string',
              description: '动画描述',
              required: false,
              source: 'prompt',
            },
            {
              name: 'images',
              type: 'array',
              description: '参考图片URL数组',
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
            id: 'task_id',
          },
        },
        query: {
          name: '查询任务',
          description: '查询任务状态和结果',
          enabled: true,
          endpoint: '/videos/generations/{id}',
          method: 'GET',
          responsePaths: {
            id: 'task_id',
            status: 'status',
            url: 'output.0.url',
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
