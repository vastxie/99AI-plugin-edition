import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { fetchRemoteUrlBuffer } from '@/common/utils/remoteUrlGuard';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import OpenAI, { toFile } from 'openai';
import * as os from 'os';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import { ChatLogService } from '../../chatLog/chatLog.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { UploadService } from '../../upload/upload.service';
// 引入其他需要的模块或服务

const pipeline = promisify(stream.pipeline);

// 以下是Function Calling工具定义（仅用于图像编辑功能）

// 工具1: 蒙版编辑工具 - 用于drawingType=2且有mask的情况
const maskEditTool = {
  type: 'function' as const,
  function: {
    name: 'enhance_mask_edit',
    description: '优化蒙版编辑提示词并生成完成回复',
    parameters: {
      type: 'object',
      properties: {
        enhanced_prompt: {
          type: 'string',
          description: '优化后的蒙版编辑提示词，使其更清晰和有效',
        },
        edit_description: {
          type: 'string',
          description: '对要进行的编辑操作的简短描述',
        },
        recommended_size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
          description: '根据编辑需求推荐的图像尺寸',
        },
        completion_reply: {
          type: 'string',
          description: '生成的回复文本，告知用户蒙版编辑已完成，语气友好自然',
        },
      },
      required: ['enhanced_prompt', 'completion_reply'],
    },
  },
};

// 工具2: 图生图工具 - 用于drawingType=2且有图像但无mask的情况
const imageToImageTool = {
  type: 'function' as const,
  function: {
    name: 'enhance_image_to_image',
    description: '优化图生图提示词并生成完成回复',
    parameters: {
      type: 'object',
      properties: {
        enhanced_prompt: {
          type: 'string',
          description: '优化后的图生图提示词，使其更清晰和有效',
        },
        variation_strength: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: '建议的变化强度，0表示几乎不变，1表示完全重新生成',
        },
        recommended_size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
          description: '根据原图和需求推荐的图像尺寸',
        },
        completion_reply: {
          type: 'string',
          description: '生成的回复文本，告知用户图生图已完成，语气友好自然',
        },
      },
      required: ['enhanced_prompt', 'completion_reply'],
    },
  },
};

// 工具3: 上下文分析工具 - 用于drawingType=2但无直接图像URL的情况
const contextAnalysisTool = {
  type: 'function' as const,
  function: {
    name: 'analyze_image_context',
    description: '分析上下文判断用户意图并提取参考图像',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['create_new', 'edit_existing'],
          description: '用户的意图是创建新图像还是编辑现有图像',
        },
        enhanced_prompt: {
          type: 'string',
          description: '优化后的图像提示词，使其更清晰和有效',
        },
        reference_images: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '参考图像的URL',
              },
              relevance_score: {
                type: 'number',
                description: '图像与当前请求的相关性分数(0-10)',
              },
              message_index: {
                type: 'number',
                description: '图像在历史消息中的索引',
              },
            },
          },
          description: '按相关性排序的参考图像列表，当intent为edit_existing时必须提供',
        },
        recommended_size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
          description: '根据意图和提示词推荐的图像尺寸',
        },
        completion_reply: {
          type: 'string',
          description: '生成的回复文本，告知用户图像处理已完成，语气友好自然',
        },
      },
      required: ['intent', 'enhanced_prompt', 'completion_reply'],
    },
  },
};

@Injectable()
export class GptImageService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatLogService: ChatLogService,
  ) {}

  // 创建临时文件
  private async createTempFile(buffer: Buffer, extension: string = 'png'): Promise<string> {
    const tempDir = os.tmpdir();
    const fileName = `image-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
    const filePath = path.join(tempDir, fileName);

    // 使用 buffer转stream 方式写入
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    await pipeline(bufferStream, fs.createWriteStream(filePath));
    return filePath;
  }

  // 清理临时文件
  private async cleanupTempFiles(files: string[]) {
    for (const file of files) {
      try {
        await fs.promises.unlink(file);
      } catch (error) {
        Logger.error(`清理临时文件失败: ${error}`, 'DrawService');
      }
    }
  }

  async dalleDraw(inputs, buildMessageFromParentMessageId) {
    Logger.log('==== 开始提交 gpt-image-1 图像生成任务 ====', 'DrawService');

    // 临时文件列表，用于后续清理
    const tempFiles: string[] = [];
    const result: any = { content: '', imageUrl: '', status: 2 };

    try {
      // 解析输入参数
      const parsedData = await this.parseDrawInputs(inputs);

      // 获取历史消息
      const { messagesHistory } = await buildMessageFromParentMessageId(
        {
          groupId: inputs.groupId,
          systemMessage: '',
          maxModelTokens: 8000,
          maxRounds: 5,
          isImageUpload: 2,
          isConvertToBase64: 0,
        },
        this.chatLogService,
      );

      // 分析用户意图和优化提示词（仅支持图像编辑）
      const {
        drawPrompt,
        completionReply,
        currentImageUrl,
        maskUrl,
        hasImageData,
        recommendedSize,
      } = await this.analyzeIntentAndEnhancePrompt(parsedData, messagesHistory, inputs.prompt);

      // 检查用户指定的模型并记录
      Logger.log(`用户指定模型: ${inputs.model}`, 'DrawService');

      // 如果有推荐尺寸，更新extraParam
      if (recommendedSize && !inputs.extraParam?.size) {
        if (!inputs.extraParam) inputs.extraParam = {};
        inputs.extraParam.size = recommendedSize;
        Logger.log(`使用推荐的图像尺寸: ${recommendedSize}`, 'DrawService');
      }

      // gpt-image-1 支持图像编辑和文生图功能
      Logger.log(
        `使用${inputs.model}进行${hasImageData ? '图像编辑' : '文生图'}操作`,
        'DrawService',
      );
      await this.editExistingImage(
        inputs,
        drawPrompt,
        completionReply,
        currentImageUrl,
        maskUrl,
        result,
        tempFiles,
      );

      return result;
    } catch (error) {
      await this.handleDrawError(error, result, tempFiles, inputs.onFailure);
      return result;
    }
  }

  // 解析绘图输入参数
  private async parseDrawInputs(inputs) {
    const {
      apiKey,
      model,
      proxyUrl,
      prompt,
      extraParam,
      imageUrl: originalImageUrl,
      drawingType,
    } = inputs;

    // 🔍 添加详细调试信息
    Logger.debug(`=== parseDrawInputs 调试信息 ===`, 'DrawService');
    Logger.debug(`原始imageUrl类型: ${typeof originalImageUrl}`, 'DrawService');
    Logger.debug(
      `原始imageUrl字符串长度: ${
        typeof originalImageUrl === 'string' ? originalImageUrl.length : 'N/A'
      }`,
      'DrawService',
    );

    // 初始化变量
    let currentImageUrl = originalImageUrl;
    let maskUrl = null;
    let hasImageData = false;
    let parsedImageUrl = null;

    // 解析imageUrl数据(如果存在)
    if (currentImageUrl) {
      try {
        Logger.debug(`开始解析图片URL数据...`, 'DrawService');

        if (
          typeof currentImageUrl === 'string' &&
          (currentImageUrl.startsWith('{') || currentImageUrl.startsWith('['))
        ) {
          Logger.debug(`检测到JSON格式的imageUrl，开始解析...`, 'DrawService');
          parsedImageUrl = JSON.parse(currentImageUrl);
          Logger.debug(`imageUrl JSON解析成功`, 'DrawService');

          if (parsedImageUrl) {
            if (Array.isArray(parsedImageUrl)) {
              Logger.debug(`imageUrl是数组格式，包含${parsedImageUrl.length}个元素`, 'DrawService');
              hasImageData = parsedImageUrl.length > 0;
              // 对于数组，保持原始数组结构用于后续处理
              currentImageUrl = parsedImageUrl;
            } else if (parsedImageUrl.imageUrls && Array.isArray(parsedImageUrl.imageUrls)) {
              Logger.debug(
                `imageUrl包含imageUrls字段，包含${parsedImageUrl.imageUrls.length}个图片`,
                'DrawService',
              );

              // 🔧 改进：处理所有图片，不只是找第一个
              const allImages = parsedImageUrl.imageUrls.filter(
                img => img.type === 'image' || !img.type,
              );
              const masks = parsedImageUrl.imageUrls.filter(img => img.type === 'mask');

              Logger.debug(`找到${allImages.length}张图片，${masks.length}个蒙版`, 'DrawService');

              if (allImages.length > 0) {
                // 如果有多张图片，保存为数组；单张图片直接保存URL
                currentImageUrl = allImages.length === 1 ? allImages[0].url : allImages;
                hasImageData = true;
                Logger.debug(`已设置${allImages.length}张图片数据`, 'DrawService');
              }

              if (masks.length > 0) {
                maskUrl = masks[0].url; // 取第一个蒙版
                Logger.debug(`已设置蒙版数据`, 'DrawService');
              }
            } else if (parsedImageUrl.url) {
              Logger.debug(`imageUrl包含单个url字段`, 'DrawService');
              currentImageUrl = parsedImageUrl.url;
              hasImageData = true;
            }
          }
        } else if (
          typeof currentImageUrl === 'string' &&
          (currentImageUrl.startsWith('http') || currentImageUrl.startsWith('/file/'))
        ) {
          Logger.debug(`检测到直接URL格式的imageUrl`, 'DrawService');
          hasImageData = true;
        } else if (Array.isArray(currentImageUrl)) {
          Logger.debug(
            `imageUrl已经是数组格式，包含${currentImageUrl.length}个元素`,
            'DrawService',
          );
          hasImageData = currentImageUrl.length > 0;
        } else {
          Logger.debug(`imageUrl格式未识别: ${typeof currentImageUrl}`, 'DrawService');
        }

        Logger.debug(
          `解析完成 - hasImageData: ${hasImageData}, currentImageUrl类型: ${typeof currentImageUrl}`,
          'DrawService',
        );
      } catch (error) {
        Logger.error(`解析imageUrl JSON失败: ${error?.message || '未知错误'}`, 'DrawService');
        hasImageData = typeof currentImageUrl === 'string' && currentImageUrl.length > 0;
      }
    }

    // 从extraParam获取mask数据(如果有)
    if (extraParam && extraParam.mask && !maskUrl) {
      maskUrl = extraParam.mask;
      Logger.debug(`从extraParam获取到mask数据`, 'DrawService');
    }

    return {
      apiKey,
      model,
      proxyUrl,
      prompt,
      extraParam,
      currentImageUrl,
      maskUrl,
      hasImageData,
      drawingType,
    };
  }

  // 分析用户意图和优化提示词（支持图像编辑和文生图）
  private async analyzeIntentAndEnhancePrompt(parsedData, messagesHistory, originalPrompt) {
    let { currentImageUrl, maskUrl, hasImageData } = parsedData;
    let drawPrompt = originalPrompt;
    let completionReply = '';
    let recommendedSize = null;

    // 获取Function Calling配置
    const {
      toolCallUrl,
      toolCallKey,
      toolCallModel,
      openaiBaseKey,
      openaiBaseUrl,
      openaiBaseModel,
    } = await this.globalConfigService.getConfigs([
      'toolCallUrl',
      'toolCallKey',
      'toolCallModel',
      'openaiBaseKey',
      'openaiBaseUrl',
      'openaiBaseModel',
    ]);

    // 创建OpenAI客户端
    const openai = new OpenAI({
      apiKey: toolCallKey || openaiBaseKey,
      baseURL: await correctApiBaseUrl(toolCallUrl || openaiBaseUrl),
      timeout: parsedData.timeout,
    });

    const model = toolCallModel || openaiBaseModel;

    Logger.log('处理图像生成请求', 'DrawService');

    try {
      let result;

      // 支持图像编辑和纯文生图模式
      if (hasImageData) {
        if (maskUrl) {
          // 有蒙版 - 使用蒙版编辑工具
          result = await this.processMaskEditWithTool(
            openai,
            model,
            originalPrompt,
            currentImageUrl,
            maskUrl,
            parsedData.extraParam,
          );
        } else {
          // 有图像但无蒙版 - 使用图生图工具
          result = await this.processImageToImageWithTool(
            openai,
            model,
            originalPrompt,
            currentImageUrl,
            parsedData.extraParam,
          );
        }
      } else {
        // 无图像数据 - 使用上下文分析工具
        result = await this.processContextAnalysisWithTool(
          openai,
          model,
          originalPrompt,
          messagesHistory,
          parsedData.extraParam,
        );
        currentImageUrl = result.currentImageUrl;

        // 如果上下文分析找到了参考图像
        if (result.currentImageUrl) {
          hasImageData = true;
        }
      }

      // 更新结果
      if (result) {
        drawPrompt = result.drawPrompt || originalPrompt;
        completionReply = result.completionReply || '';
        recommendedSize = result.recommendedSize || null;
      }
    } catch (error) {
      Logger.error(`提示词优化或意图分析失败: ${error}`, 'DrawService');
    }

    Logger.log(`图像生成请求处理完成`, 'DrawService');

    return {
      drawPrompt,
      completionReply,
      currentImageUrl,
      maskUrl,
      hasImageData,
      recommendedSize,
    };
  }

  // 将宽高比转换为具体像素尺寸（仅支持 gpt-image-1）
  private convertAspectRatioToSize(aspectRatio: string): string {
    if (!aspectRatio) return '1024x1024';

    // 如果已经是像素尺寸格式，直接返回
    if (aspectRatio.includes('x') || aspectRatio === 'auto') {
      return aspectRatio;
    }

    // gpt-image-1支持的尺寸映射
    const aspectRatioMap = {
      auto: 'auto',
      '4:3': '1536x1024', // 横图 4:3
      '3:4': '1024x1536', // 竖图 3:4
      '16:9': '1536x1024', // 横图，使用最接近的支持尺寸
      '9:16': '1024x1536', // 竖图，使用最接近的支持尺寸
    };

    const convertedSize = aspectRatioMap[aspectRatio] || '1024x1024';
    Logger.log(`转换宽高比 ${aspectRatio} -> ${convertedSize} (gpt-image-1)`, 'DrawService');
    return convertedSize;
  }

  // 验证并修正图像尺寸参数（仅支持 gpt-image-1）
  private validateImageSize(size) {
    // 首先尝试转换宽高比格式
    const convertedSize = this.convertAspectRatioToSize(size);

    // gpt-image-1支持的size：1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), auto
    const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
    if (!validSizes.includes(convertedSize)) {
      Logger.warn(`图像编辑不支持size=${convertedSize}，将使用默认值1024x1024`, 'DrawService');
      return '1024x1024';
    }

    return convertedSize;
  }

  // 编辑现有图像
  private async editExistingImage(
    inputs,
    drawPrompt,
    completionReply,
    currentImageUrl,
    maskUrl,
    result,
    tempFiles,
  ) {
    const { apiKey, model, proxyUrl, extraParam, timeout, onSuccess } = inputs;

    Logger.log('执行图像编辑操作', 'DrawService');

    // 准备图像URL列表
    const imageUrls = await this.prepareImageUrlList(currentImageUrl, maskUrl);
    Logger.debug(`处理图像数据: ${imageUrls.length}个图像对象`, 'DrawService');

    // 下载所有图片并创建临时文件
    const imageFiles = await Promise.all(
      imageUrls.map(async imgInfo => {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            if (!imgInfo.url || typeof imgInfo.url !== 'string') {
              Logger.error(`无效的图片URL参数`, 'DrawService');
              throw new Error('无效的图片URL');
            }

            Logger.debug(
              `下载图片 (尝试 ${retryCount + 1}/${maxRetries}): ${imgInfo.type}类型`,
              'DrawService',
            );

            const { buffer } = await fetchRemoteUrlBuffer(imgInfo.url, {
              timeoutMs: 30000,
              maxBytes: 50 * 1024 * 1024,
              maxRedirects: 5,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'image/*,*/*;q=0.8',
              },
            });

            if (!buffer.length) {
              throw new Error('下载的图片数据为空');
            }

            Logger.debug(`图片下载成功，大小: ${buffer.length}字节`, 'DrawService');

            const tempFilePath = await this.createTempFile(buffer, 'png');
            tempFiles.push(tempFilePath);

            return {
              path: tempFilePath,
              type: imgInfo.type || 'image',
              index: imgInfo.index || 0,
            };
          } catch (error) {
            retryCount++;
            const isLastRetry = retryCount >= maxRetries;

            // 记录详细的错误信息
            const errorDetails = {
              attempt: retryCount,
              maxRetries,
              error: error?.message || '未知错误',
              status: error.response?.status,
            };

            Logger.error(
              `下载图片失败 (尝试 ${retryCount}/${maxRetries}): ${JSON.stringify(errorDetails)}`,
              'DrawService',
            );

            if (isLastRetry) {
              // 最后一次重试失败，提供更有用的错误信息
              let errorMessage = `下载图片失败`;

              if (error.code === 'ECONNABORTED') {
                errorMessage = `图片下载超时 (30秒)`;
              } else if (error.code === 'ENOTFOUND') {
                errorMessage = `无法解析图片域名`;
              } else if (error.code === 'ECONNREFUSED') {
                errorMessage = `图片服务器拒绝连接`;
              } else if (error.response?.status === 404) {
                errorMessage = `图片不存在 (404)`;
              } else if (error.response?.status === 403) {
                errorMessage = `图片访问被拒绝 (403)`;
              } else if (error.response?.status === 500) {
                errorMessage = `图片服务器错误 (500)`;
              } else if (error.response?.status >= 400) {
                errorMessage = `图片下载失败 (${error.response.status})`;
              }

              throw new Error(errorMessage);
            }

            // 指数退避策略：等待时间递增
            const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
            Logger.debug(`等待 ${waitTime}ms 后重试...`, 'DrawService');
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }),
    );

    // 处理extraParam参数
    let size = extraParam?.size || '1024x1024';
    const quality = extraParam?.quality || 'high';

    // 验证并修正size参数
    size = this.validateImageSize(size);

    Logger.log(`使用图像尺寸: ${size}`, 'DrawService');

    // 分离参考图和蒙版图
    const referenceImages = imageFiles.filter(img => img.type === 'image');
    const maskImage = imageFiles.find(img => img.type === 'mask');

    let response;
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: await correctApiBaseUrl(proxyUrl),
      timeout: timeout,
    });

    // 处理图像
    if (referenceImages.length > 0) {
      // 有参考图，使用编辑功能
      response = await this.processWithGptImage1(
        openai,
        model,
        drawPrompt,
        referenceImages,
        maskImage,
        size,
        quality,
      );
    } else {
      // 无参考图，使用文本到图像生成
      Logger.log('没有可用的参考图像，使用文本到图像生成', 'DrawService');

      const generateParams: any = {
        model: model,
        prompt: drawPrompt,
      };

      // 添加可选参数
      if (size) generateParams.size = size;
      if (quality) generateParams.quality = quality;

      // 添加透明度支持参数
      generateParams.background = 'auto'; // 自动判断是否需要透明背景
      generateParams.output_format = 'png'; // 使用PNG格式支持透明度

      Logger.log(`最终提示词长度: ${drawPrompt?.length || 0}`, 'DrawService');
      Logger.debug(
        `生成参数: ${JSON.stringify({
          model: model,
          promptLength: drawPrompt?.length || 0,
          size,
          quality,
        })}`,
        'DrawService',
      );

      try {
        response = await openai.images.generate(generateParams);
        Logger.log(`图像生成API调用成功`, 'DrawService');
      } catch (apiError) {
        Logger.error(`调用图像生成API失败: ${apiError?.message || '未知错误'}`, 'DrawService');
        throw apiError;
      }
    }

    // 处理响应并上传图片
    await this.processApiResponseAndUpload(response, result, completionReply, onSuccess, inputs);

    // 清理临时文件
    await this.cleanupTempFiles(tempFiles);
  }

  private async processWithGptImage1(
    openai,
    model,
    drawPrompt,
    referenceImages,
    maskImage,
    size,
    quality,
  ) {
    Logger.log(`使用gpt-image-1处理，共${referenceImages.length}张参考图`, 'DrawService');
    Logger.log(`最终提示词长度: ${drawPrompt?.length || 0}`, 'DrawService');

    const editParams: any = {
      model: model,
      prompt: drawPrompt,
    };

    try {
      // 使用toFile处理参考图像，统一为数组形式
      if (referenceImages.length > 0) {
        Logger.debug(`开始使用toFile处理${referenceImages.length}张参考图`, 'DrawService');

        const imageFiles = await Promise.all(
          referenceImages.map(async (img, index) => {
            try {
              Logger.debug(`处理第${index + 1}张参考图`, 'DrawService');
              return await toFile(fs.createReadStream(img.path), `image_${index}.png`, {
                type: 'image/png',
              });
            } catch (error) {
              Logger.error(`处理参考图${index + 1}失败: ${error.message}`, 'DrawService');
              throw new Error(`处理参考图${index + 1}失败: ${error.message}`);
            }
          }),
        );

        // 统一使用数组形式，无论单张还是多张
        editParams.image = imageFiles.length === 1 ? imageFiles[0] : imageFiles;
        Logger.debug(
          `成功处理${imageFiles.length}张参考图，使用${
            imageFiles.length === 1 ? '单张' : '数组'
          }模式`,
          'DrawService',
        );
      }

      // 如果有蒙版，使用toFile处理
      if (maskImage) {
        try {
          Logger.debug(`开始使用toFile处理蒙版图`, 'DrawService');
          editParams.mask = await toFile(fs.createReadStream(maskImage.path), 'mask.png', {
            type: 'image/png',
          });
          Logger.debug(`成功处理蒙版图`, 'DrawService');
        } catch (error) {
          Logger.error(`处理蒙版图失败: ${error.message}`, 'DrawService');
          throw new Error(`处理蒙版图失败: ${error.message}`);
        }
      }

      // 添加其他参数
      if (size) editParams.size = size;
      if (quality) editParams.quality = quality;

      // 添加透明度支持参数
      editParams.background = 'auto'; // 自动判断是否需要透明背景
      editParams.output_format = 'png'; // 使用PNG格式支持透明度

      Logger.debug(
        `gpt-image-1编辑参数: ${JSON.stringify({
          model,
          promptLength: drawPrompt?.length || 0,
          imageCount: referenceImages.length,
          hasMask: !!maskImage,
          size,
          quality,
          background: 'auto',
          output_format: 'png',
        })}`,
        'DrawService',
      );

      // 🔍 详细记录实际传递给API的参数对象结构
      Logger.debug(`实际API调用参数的键: ${Object.keys(editParams).join(', ')}`, 'DrawService');
      Logger.debug(
        `参数详情: model=${editParams.model}, prompt长度=${editParams.prompt?.length || 0}, ` +
          `image类型=${
            editParams.image
              ? Array.isArray(editParams.image)
                ? `数组(${editParams.image.length}项)`
                : '单个对象'
              : '无'
          }, ` +
          `mask=${editParams.mask ? '已设置' : '未设置'}, size=${editParams.size}, quality=${
            editParams.quality
          }, ` +
          `background=${editParams.background}, output_format=${editParams.output_format}`,
        'DrawService',
      );

      // 调用API
      Logger.log(`开始调用gpt-image-1 API`, 'DrawService');
      const response = await openai.images.edit(editParams);
      Logger.log(`gpt-image-1 API调用成功`, 'DrawService');
      return response;
    } catch (apiError) {
      Logger.error(`调用gpt-image-1 API失败: ${apiError?.message || '未知错误'}`, 'DrawService');

      // 提供更详细的错误信息
      if (apiError.message?.includes('file')) {
        throw new Error(`图片文件处理失败: ${apiError.message}`);
      } else if (apiError.status === 400) {
        throw new Error(`API参数错误: ${apiError.message || '请检查图片格式和大小'}`);
      } else if (apiError.status === 401) {
        throw new Error(`API密钥无效或权限不足`);
      } else if (apiError.status === 429) {
        throw new Error(`请求频率过高，请稍后重试`);
      } else if (apiError.status >= 500) {
        throw new Error(`服务器错误，请稍后重试`);
      } else {
        throw new Error(`gpt-image-1调用失败: ${apiError.message || '未知错误'}`);
      }
    }
  }

  // 准备图像URL列表
  private async prepareImageUrlList(currentImageUrl, maskUrl) {
    let imageUrls = [];

    // 🔍 添加详细调试信息
    Logger.debug(`=== prepareImageUrlList 调试信息 ===`, 'DrawService');
    Logger.debug(`输入currentImageUrl类型: ${typeof currentImageUrl}`, 'DrawService');
    Logger.debug(`是否包含蒙版: ${Boolean(maskUrl)}`, 'DrawService');

    if (typeof currentImageUrl === 'string') {
      Logger.debug(`处理字符串类型的currentImageUrl`, 'DrawService');

      // 检查是否是嵌套的JSON字符串
      if (currentImageUrl.startsWith('[') || currentImageUrl.startsWith('{')) {
        try {
          Logger.debug(`尝试解析JSON字符串...`, 'DrawService');
          const parsedUrl = JSON.parse(currentImageUrl);
          Logger.debug(`图像URL JSON解析成功`, 'DrawService');

          if (Array.isArray(parsedUrl)) {
            Logger.debug(`解析得到数组，包含${parsedUrl.length}个元素`, 'DrawService');
            imageUrls = parsedUrl.map((item, index) => ({
              url: typeof item === 'string' ? item : item.url,
              type: (typeof item === 'object' && item.type) || 'image',
              index: (typeof item === 'object' && item.index) || index,
            }));
          } else if (parsedUrl.url) {
            Logger.debug(`解析得到对象，包含url字段`, 'DrawService');
            imageUrls = [{ url: parsedUrl.url, type: parsedUrl.type || 'image', index: 0 }];
          } else {
            Logger.warn(`图像URL JSON对象不包含url字段`, 'DrawService');
          }
        } catch (e) {
          Logger.error(`JSON解析失败: ${e.message}，将作为普通URL处理`, 'DrawService');
          // 如果解析失败，作为普通URL处理
          imageUrls = [{ url: currentImageUrl, type: 'image', index: 0 }];
        }
      } else {
        Logger.debug(`处理普通URL字符串`, 'DrawService');
        // 普通URL字符串
        imageUrls = [{ url: currentImageUrl, type: 'image', index: 0 }];
      }
    } else if (Array.isArray(currentImageUrl)) {
      Logger.debug(
        `处理数组类型的currentImageUrl，包含${currentImageUrl.length}个元素`,
        'DrawService',
      );
      imageUrls = currentImageUrl.map((item, index) => {
        const imgObj = {
          url: typeof item === 'string' ? item : item.url,
          type: (typeof item === 'object' && item.type) || 'image',
          index: (typeof item === 'object' && item.index) || index,
        };
        Logger.debug(`已解析数组元素${index}`, 'DrawService');
        return imgObj;
      });
    } else if (currentImageUrl && typeof currentImageUrl === 'object') {
      Logger.debug(`处理对象类型的currentImageUrl`, 'DrawService');
      if (currentImageUrl.url) {
        imageUrls = [{ url: currentImageUrl.url, type: currentImageUrl.type || 'image', index: 0 }];
        Logger.debug(`已从对象提取URL`, 'DrawService');
      } else {
        Logger.error('无法解析图像URL对象，缺少url字段', 'DrawService');
        throw new Error('无法解析图像URL对象');
      }
    } else {
      Logger.debug(`currentImageUrl格式未识别或为空: ${typeof currentImageUrl}`, 'DrawService');
    }

    // 如果有蒙版，添加到列表中
    if (maskUrl) {
      Logger.debug(`已添加蒙版URL`, 'DrawService');
      imageUrls.push({ url: maskUrl, type: 'mask', index: 0 });
    }

    Logger.debug(`总共${imageUrls.length}个图像对象`, 'DrawService');

    return imageUrls;
  }

  // 记录API响应
  private logApiResponse(response) {
    Logger.log(`API响应结构: ${JSON.stringify(Object.keys(response || {}))}`, 'DrawService');
    Logger.log(`响应数据项数: ${response?.data?.length || 0}`, 'DrawService');

    try {
      // 检查响应中data字段的结构
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const firstItem = response.data[0];
        Logger.log(`响应data[0]的字段: ${JSON.stringify(Object.keys(firstItem))}`, 'DrawService');

        // 检查图像数据字段
        if (firstItem.b64_json) {
          Logger.log(`b64_json字段存在，长度: ${firstItem.b64_json.length}`, 'DrawService');
        } else if (firstItem.url) {
          Logger.log(`url字段存在`, 'DrawService');
        } else {
          Logger.error(`b64_json和url字段都不存在`, 'DrawService');
        }
      } else {
        Logger.error(`响应中data字段异常`, 'DrawService');
      }

      // 检查usage信息
      if (response.usage) {
        Logger.log(`API响应包含使用量信息`, 'DrawService');
      }
    } catch (dataCheckError) {
      Logger.error(`检查响应数据时出错: ${dataCheckError}`, 'DrawService');
      Logger.error(`检查响应数据失败`, dataCheckError?.stack, 'DrawService');
    }
  }

  // 处理API响应并上传图片
  private async processApiResponseAndUpload(response, result, completionReply, onSuccess, inputs) {
    Logger.log(`处理API响应并上传生成的图片`, 'DrawService');

    // 检查响应，确保在处理前数据正常
    try {
      if (response) {
        Logger.log(`准备处理的响应对象类型: ${typeof response}`, 'DrawService');
        Logger.log(`响应对象字段: ${Object.keys(response).join(', ')}`, 'DrawService');
      } else {
        Logger.error(`响应对象为空或未定义!`, 'DrawService');
      }
    } catch (preProcessError) {
      Logger.error(`处理前检查响应失败: ${preProcessError}`, 'DrawService');
    }

    // 检查响应是否包含有效的数据
    if (
      !response ||
      !response.data ||
      !Array.isArray(response.data) ||
      response.data.length === 0
    ) {
      Logger.error(`无效的API响应`, 'DrawService');
      throw new Error('API响应中没有有效的图像数据');
    }

    Logger.log(`API响应通过有效性检查，包含${response.data.length}项数据`, 'DrawService');

    // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDate = `${year}${month}/${day}`;
    Logger.debug(`图片上传目录日期格式: ${currentDate}`, 'DrawService');

    const firstImage = response.data[0];
    Logger.log(`第一个图像数据类型: ${Object.keys(firstImage || {}).join(', ')}`, 'DrawService');

    // 处理Base64图片数据
    if (firstImage && firstImage.b64_json) {
      const imageData = firstImage.b64_json;
      Logger.debug(`获取到Base64编码图片数据，长度: ${imageData.length}`, 'DrawService');

      // 将 Base64 数据转换为 Buffer
      const buffer = Buffer.from(imageData, 'base64');
      Logger.debug(`转换Buffer成功，大小: ${buffer.length}字节`, 'DrawService');

      // 根据指定格式设置MIME类型
      const file = {
        buffer: buffer,
        mimetype: `image/png`,
      };
      Logger.debug(`准备上传文件，MIME类型: ${file.mimetype}`, 'DrawService');

      try {
        Logger.log(`开始调用uploadService.uploadFile`, 'DrawService');
        result.imageUrl = await this.uploadService.uploadFile(file, `images/dalle/${currentDate}`);
        Logger.log(`图片上传成功`, 'DrawService');
      } catch (uploadError) {
        Logger.error(`上传服务调用失败: ${uploadError}`, 'DrawService');
        throw new Error(`上传图片失败: ${uploadError.message || JSON.stringify(uploadError)}`);
      }
    } else if (firstImage && firstImage.url) {
      // 先保存原始URL作为备份
      const originalUrl = firstImage.url;
      Logger.log(`API响应包含图片URL`, 'DrawService');

      // 使用重试机制下载并保存图片
      let downloadSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!downloadSuccess && retryCount < maxRetries) {
        try {
          Logger.log(
            `尝试下载并保存图片 (${retryCount + 1}/${maxRetries})`,
            'DrawService',
          );

          const downloadConfig = {
            responseType: 'arraybuffer' as const,
            timeout: 30000, // 30秒超时
            maxRedirects: 5,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            validateStatus: status => status < 400,
          };

          const imageResponse = await axios.get(originalUrl, downloadConfig);

          if (!imageResponse.data || imageResponse.data.byteLength === 0) {
            throw new Error('下载的图片数据为空');
          }

          const buffer = Buffer.from(imageResponse.data);
          Logger.debug(`生成图片下载成功，大小: ${buffer.length}字节`, 'DrawService');

          const file = {
            buffer: buffer,
            mimetype: 'image/png',
          };

          // 上传到我们自己的存储
          result.imageUrl = await this.uploadService.uploadFile(
            file,
            `images/dalle/${currentDate}`,
          );
          Logger.log(`图片下载并上传成功`, 'DrawService');
          downloadSuccess = true;
        } catch (downloadError) {
          retryCount++;
          const isLastRetry = retryCount >= maxRetries;

          // 记录详细的错误信息
          const errorDetails = {
            attempt: retryCount,
            maxRetries,
            error: downloadError?.message || '未知错误',
            status: downloadError.response?.status,
          };

          Logger.error(
            `生成图片下载失败 (尝试 ${retryCount}/${maxRetries}): ${JSON.stringify(errorDetails)}`,
            'DrawService',
          );

          if (isLastRetry) {
            Logger.warn(`图片下载重试全部失败，将使用原始URL`, 'DrawService');
            // 最后重试失败时，回退到使用原始URL
            result.imageUrl = originalUrl;
            downloadSuccess = true; // 标记为成功，使用原始URL
          } else {
            // 指数退避策略：等待时间递增
            const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
            Logger.debug(`等待 ${waitTime}ms 后重试下载...`, 'DrawService');
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    } else {
      Logger.error(`图像数据格式无效，既没有b64_json也没有url`, 'DrawService');
      throw new Error('API响应中没有有效的图像数据格式');
    }

    result.content = completionReply || '图片已创建';
    result.status = 3;
    Logger.log(`处理完成，准备调用onSuccess回调，状态: ${result.status}`, 'DrawService');
    onSuccess(result);
    Logger.log(`onSuccess回调执行完成`, 'DrawService');
  }

  // 处理绘图错误
  private async handleDrawError(error, result, tempFiles, onFailure) {
    result.status = 5;
    Logger.error(`处理绘图请求失败，设置状态为: ${result.status}`, 'DrawService');

    try {
      // 尝试清理临时文件
      if (tempFiles && tempFiles.length > 0) {
        Logger.debug(`准备清理${tempFiles.length}个临时文件`, 'DrawService');
        this.cleanupTempFiles(tempFiles).catch(cleanupError => {
          Logger.error(`清理临时文件失败: ${cleanupError}`, 'DrawService');
        });
      }
    } catch (cleanupError) {
      Logger.error(`尝试清理临时文件时出错: ${cleanupError}`, 'DrawService');
    }

    // 提取错误信息
    const status = error?.status || error?.response?.status || 500;
    const message = error?.error?.message || error?.message || '';
    const errorCode = error?.code || error?.error?.code || '';

    // 直接返回API的错误消息
    if (message) {
      // 提取关键错误信息，去除请求ID等技术信息
      let cleanMessage = message;
      const requestIdMatch = message.match(/\(request id: [^\)]+\)/);
      if (requestIdMatch) {
        cleanMessage = message.replace(requestIdMatch[0], '').trim();
      }

      result.content = cleanMessage;
      onFailure(result);
      Logger.log(`onFailure回调执行完成`, 'DrawService');
      return;
    }

    // 根据状态码和错误类型给出更具体的错误信息
    if (status === 429) {
      result.content = '当前请求已过载、请稍等会儿再试试吧！';
    } else if (
      status === 400 &&
      (message.includes('content filters') ||
        errorCode === 'moderation_blocked' ||
        errorCode === 'content_policy_violation' ||
        message.includes('safety system') ||
        message.includes('content policy'))
    ) {
      result.content = '您的请求已被系统拒绝。您的提示或图片可能包含不适当的内容。';
    } else if (status === 400 && message.includes('Billing hard limit has been reached')) {
      result.content = '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！';
    } else if (
      status === 400 &&
      (message.includes('Unknown parameter') || message.includes('Invalid parameter'))
    ) {
      result.content = `API参数错误: ${message}`;
    } else if (status === 400) {
      // 通用400错误
      result.content = `请求错误: ${message || '请检查输入内容'}`;
    } else if (status === 500) {
      result.content = '绘制图片失败，请检查你的提示词是否有非法描述！';
    } else if (status === 401) {
      result.content = '绘制图片失败，此次绘画被拒绝了！';
    } else if (status === 403) {
      result.content = '没有权限执行此操作，请检查API密钥权限或订阅状态。';
    } else {
      // 默认错误信息
      result.content = message || '绘制图片失败，请稍后试试吧！';
    }

    onFailure(result);
    Logger.log(`onFailure回调执行完成`, 'DrawService');
  }

  // 处理蒙版编辑请求的工具方法
  private async processMaskEditWithTool(
    openai,
    model,
    originalPrompt,
    currentImageUrl,
    maskUrl,
    extraParam,
  ) {
    Logger.log('处理蒙版编辑请求，使用蒙版编辑工具', 'DrawService');

    const systemMessage =
      '你是AI图像蒙版编辑助手。用户已提供原始图像和蒙版，你需要：\n' +
      '1. 优化编辑提示词，使其更加清晰和有效\n' +
      '2. 简要描述要执行的编辑操作\n' +
      '3. 推荐合适的图像尺寸\n' +
      '4. 生成友好的回复，告知用户蒙版编辑已完成\n' +
      '使用中文回复，语气友好自然，突出编辑的主要内容';

    const userMessageContent = `
当前请求: "${originalPrompt}"

我已提供原始图像和蒙版，请：
1. 优化我的编辑提示词，使其更加清晰和有效
2. 简要描述要执行的编辑操作
3. 推荐合适的图像尺寸
4. 生成一段简短回复，告诉我蒙版编辑已完成

${extraParam?.size ? `用户指定的尺寸参数: ${extraParam.size}` : '用户未指定尺寸参数'}
`;

    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessageContent },
        ],
        tools: [maskEditTool],
        tool_choice: 'auto',
      });

      const toolCalls = response.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const functionArgs = JSON.parse(toolCalls[0].function.arguments);

        const drawPrompt = functionArgs.enhanced_prompt || originalPrompt;
        const completionReply = functionArgs.completion_reply || '图片编辑已完成';
        const recommendedSize = functionArgs.recommended_size || extraParam?.size || '1024x1024';

        Logger.debug(`优化后的蒙版编辑提示词长度: ${drawPrompt?.length || 0}`, 'DrawService');
        Logger.debug(
          `编辑描述长度: ${functionArgs.edit_description?.length || 0}`,
          'DrawService',
        );
        Logger.debug(`推荐的尺寸: ${recommendedSize}`, 'DrawService');
        Logger.debug(`生成的完成回复长度: ${completionReply?.length || 0}`, 'DrawService');

        return { drawPrompt, completionReply, recommendedSize };
      }
    } catch (error) {
      Logger.error(`蒙版编辑提示词优化失败: ${error}`, 'DrawService');
    }

    // 如果处理失败，返回原始值
    return {
      drawPrompt: originalPrompt,
      completionReply: '图片编辑已完成',
      recommendedSize: extraParam?.size || '1024x1024',
    };
  }

  // 处理图生图请求的工具方法
  private async processImageToImageWithTool(
    openai,
    model,
    originalPrompt,
    currentImageUrl,
    extraParam,
  ) {
    Logger.log('处理图生图请求，使用图生图工具', 'DrawService');

    const systemMessage =
      '你是AI图生图助手。用户已提供参考图像，你需要：\n' +
      '1. 优化图生图提示词，使其更加清晰和有效\n' +
      '2. 建议合适的变化强度\n' +
      '3. 推荐合适的图像尺寸\n' +
      '4. 生成友好的回复，告知用户图生图已完成\n' +
      '使用中文回复，语气友好自然，突出新生成图像的主要内容';

    const userMessageContent = `
当前请求: "${originalPrompt}"

我已提供参考图像，请：
1. 优化我的图生图提示词，使其更加清晰和有效
2. 建议合适的变化强度(0-1)
3. 推荐合适的图像尺寸
4. 生成一段简短回复，告诉我图生图已完成

${extraParam?.size ? `用户指定的尺寸参数: ${extraParam.size}` : '用户未指定尺寸参数'}
`;

    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessageContent },
        ],
        tools: [imageToImageTool],
        tool_choice: 'auto',
      });

      const toolCalls = response.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const functionArgs = JSON.parse(toolCalls[0].function.arguments);

        const drawPrompt = functionArgs.enhanced_prompt || originalPrompt;
        const completionReply = functionArgs.completion_reply || '图片已生成';
        const recommendedSize = functionArgs.recommended_size || extraParam?.size || '1024x1024';

        Logger.debug(`优化后的图生图提示词长度: ${drawPrompt?.length || 0}`, 'DrawService');
        Logger.debug(
          `建议的变化强度: ${functionArgs.variation_strength || '未指定'}`,
          'DrawService',
        );
        Logger.debug(`推荐的尺寸: ${recommendedSize}`, 'DrawService');
        Logger.debug(`生成的完成回复长度: ${completionReply?.length || 0}`, 'DrawService');

        return { drawPrompt, completionReply, recommendedSize };
      }
    } catch (error) {
      Logger.error(`图生图提示词优化失败: ${error}`, 'DrawService');
    }

    // 如果处理失败，返回原始值
    return {
      drawPrompt: originalPrompt,
      completionReply: '图片已生成',
      recommendedSize: extraParam?.size || '1024x1024',
    };
  }

  // 处理上下文分析请求的工具方法
  private async processContextAnalysisWithTool(
    openai,
    model,
    originalPrompt,
    messagesHistory,
    extraParam,
  ) {
    Logger.log('处理上下文分析请求，使用上下文分析工具', 'DrawService');

    const systemMessage =
      '你是AI图像上下文分析助手，能够理解用户意图并从历史消息中提取图像。你需要：\n' +
      '1. 判断用户是想创建新图像还是编辑之前的图像\n' +
      '2. 如果是编辑意图，必须从历史消息中找出相关图像URL\n' +
      '3. 优化用户的提示词，使其更加清晰有效\n' +
      '4. 推荐合适的图像尺寸\n' +
      '5. 生成友好的回复，告知用户图像处理已完成\n' +
      '使用中文回复，语气自然友好，突出绘画/编辑的主要内容\n\n' +
      '重要提示：如果判断为编辑现有图像(edit_existing)，必须提供至少一个参考图像URL，否则无法进行编辑操作';

    const userMessageContent = `
当前请求: "${originalPrompt}"

上下文消息: ${JSON.stringify(messagesHistory)}

请完成以下任务:
1. 判断我的意图(新建或编辑图像)
2. 如果是编辑意图，必须找出相关历史图像URL
3. 优化我的提示词
4. 推荐合适的图像尺寸
5. 生成图像处理完成的回复

${extraParam?.size ? `用户指定的尺寸参数: ${extraParam.size}` : '用户未指定尺寸参数'}
`;

    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessageContent },
        ],
        tools: [contextAnalysisTool],
        tool_choice: 'auto',
      });

      const toolCalls = response.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const functionArgs = JSON.parse(toolCalls[0].function.arguments);

        Logger.debug(
          `上下文分析完成，字段数: ${Object.keys(functionArgs || {}).length}`,
          'DrawService',
        );

        const drawPrompt = functionArgs.enhanced_prompt || originalPrompt;
        const completionReply = functionArgs.completion_reply || '图片处理已完成';
        const intent = functionArgs.intent || 'create_new';
        const isEditOperation = intent === 'edit_existing';
        const recommendedSize = functionArgs.recommended_size || extraParam?.size || '1024x1024';

        // 处理参考图像
        let currentImageUrl = null;
        if (isEditOperation) {
          // 如果是编辑意图，必须有参考图像
          if (!functionArgs.reference_images || functionArgs.reference_images.length === 0) {
            Logger.warn('检测到编辑意图但未找到参考图像，将降级为创建新图像', 'DrawService');
            return {
              drawPrompt,
              completionReply: '未找到可编辑的参考图像，将为您创建新图像',
              isEditOperation: false,
              currentImageUrl: null,
              recommendedSize,
            };
          }

          const sortedImages = functionArgs.reference_images
            // 按相关性分数排序，高分在前
            .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
            // 最多取前3张图片
            .slice(0, 3);

          Logger.debug(
            `提取到${functionArgs.reference_images.length}张参考图像，使用前${sortedImages.length}张`,
            'DrawService',
          );

          // 处理参考图像URL
          const imageArray = sortedImages.map((img, index) => {
            return {
              url: img.url,
              type: 'image',
              index: index, // 保持排序后的顺序
            };
          });

          // 设置图像URL
          if (imageArray.length > 0) {
            currentImageUrl = imageArray; // 整个数组作为参考图列表
            Logger.debug(`设置参考图像列表，共${imageArray.length}张`, 'DrawService');
          } else {
            Logger.warn('参考图像处理后列表为空，将降级为创建新图像', 'DrawService');
            return {
              drawPrompt,
              completionReply: '未能处理参考图像，将为您创建新图像',
              isEditOperation: false,
              currentImageUrl: null,
              recommendedSize,
            };
          }
        } else {
          Logger.log('检测到创建新图像的意图', 'DrawService');
        }

        return {
          drawPrompt,
          completionReply,
          isEditOperation,
          currentImageUrl,
          recommendedSize,
        };
      }
    } catch (error) {
      Logger.error(`上下文分析失败: ${error}`, 'DrawService');
    }

    // 如果处理失败，返回原始值
    return {
      drawPrompt: originalPrompt,
      completionReply: '图片处理已完成',
      isEditOperation: false,
      currentImageUrl: null,
      recommendedSize: extraParam?.size || '1024x1024',
    };
  }
}
