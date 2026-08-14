import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { UploadService } from '../../upload/upload.service';
import { OpenAIChatService } from '../chat/chat.service';

@Injectable()
export class ChatDrawService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly openAIChatService: OpenAIChatService,
  ) {}

  async chatDraw(inputs) {
    const {
      onSuccess,
      onFailure,
      onProgress,
      apiKey,
      model,
      proxyUrl,
      modelName,
      timeout,
      chatId,
      messagesHistory,
      prompt,
      transparent_background,
      referenced_image_ids,
    } = inputs;
    const result = {
      content: '准备绘制',
      model: model,
      modelName: modelName,
      chatId: chatId,
      imageUrl: '',
      status: 2,
      progress: 0,
    };

    // 使用Logger.log记录关键流程信息
    Logger.log(`开始处理绘图请求，提示词长度: ${prompt.length}`, 'ChatDrawService');
    Logger.debug(
      `开始处理绘图请求详情: model=${model}, modelName=${modelName}, chatId=${chatId}`,
      'ChatDrawService',
    );

    let buffer = '';
    let lastUpdateTime = Date.now(); // 添加最后更新时间追踪
    let finalUrl = null; // 提前定义finalUrl变量
    let allExtractedUrls = new Set<string>(); // 用于存储所有提取到的、去重后的原始图片链接
    let uploadedImageUrls = []; // 用于存储上传后的图片链接
    let minProcessingTime = 10000; // 最小处理时间，确保有足够时间收集内容（10秒）
    let processingStartTime = Date.now(); // 开始处理时间

    // 自动增加进度的相关变量
    let lastProgressIncreaseTime = Date.now();
    const PROGRESS_AUTO_INCREMENT_INTERVAL = 5000; // 5秒自动增加一次进度
    const PROGRESS_AUTO_INCREMENT_AMOUNT = 1; // 每次增加1%
    const MAX_AUTO_PROGRESS = 95; // 自动进度最高到95%，留5%给真实进度

    try {
      // 调用onProgress回调，通知准备绘制
      if (onProgress) {
        onProgress({
          ...result,
          content: '准备绘制',
        });
      }

      // 校正API URL
      Logger.debug(`原始API URL: ${proxyUrl}`, 'ChatDrawService');
      const correctedUrl = await correctApiBaseUrl(proxyUrl);

      // 初始化OpenAI SDK
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: correctedUrl,
        timeout: timeout || 300000, // 默认超时5分钟
      });

      // 创建聊天流
      Logger.log(`创建聊天流请求，模型: ${model}`, 'ChatDrawService');

      // 构建请求配置
      const requestConfig: any = {
        model: model,
        messages: messagesHistory,
        stream: true, // Default to stream, can be overridden for non-stream cases like sdxl
      };

      // For sdxl like integration, if it's not supposed to be a stream:
      // We might need a flag from inputs, e.g., inputs.isStreamming === false
      // For now, we assume 'messagesHistory' implies a chat-like interaction which is often streamed.
      // If adapting for pure non-streamed sdxl, the request would be non-stream and response handled differently.
      // Let's assume for now that even sdxl's logic will be wrapped to produce a 'buffer' at the end.

      // 如果有额外参数，添加到请求中
      if (transparent_background !== undefined || referenced_image_ids !== undefined) {
        // 创建额外参数对象
        requestConfig.extra_reply_parameters = {};

        if (transparent_background !== undefined) {
          requestConfig.extra_reply_parameters.transparent_background = transparent_background;
          Logger.debug(`设置透明背景选项: ${transparent_background}`, 'ChatDrawService');
        }

        if (referenced_image_ids !== undefined && Array.isArray(referenced_image_ids)) {
          requestConfig.extra_reply_parameters.referenced_image_ids = referenced_image_ids;
          Logger.debug(
            `设置引用图片IDs: ${JSON.stringify(referenced_image_ids)}`,
            'ChatDrawService',
          );
        }
      }

      const stream = await openai.chat.completions.create(requestConfig, {
        timeout: 300000, // 增加流处理超时时间到5分钟，确保能完整获取流
      });
      Logger.debug('聊天流创建成功，开始接收数据', 'ChatDrawService');

      let chunkCount = 0;
      let lastProgressPercent = 0;
      let hasProgress = false;
      const TIMEOUT_DURATION = 60000; // 1分钟超时（毫秒）

      // --- Start of Streaming Logic ---
      // @ts-ignore - 强制忽略TypeScript错误，因为我们知道stream是可迭代的
      for await (const chunk of stream) {
        // 检查是否超时
        const currentTime = Date.now();
        const elapsedTime = currentTime - processingStartTime;

        // 自动增加进度逻辑
        const timeSinceLastProgressIncrease = currentTime - lastProgressIncreaseTime;
        if (
          timeSinceLastProgressIncrease > PROGRESS_AUTO_INCREMENT_INTERVAL &&
          result.progress < MAX_AUTO_PROGRESS
        ) {
          // 计算新进度，确保不超过MAX_AUTO_PROGRESS
          const newProgress = Math.min(
            result.progress + PROGRESS_AUTO_INCREMENT_AMOUNT,
            MAX_AUTO_PROGRESS,
          );

          // 只有在进度真正增加时才更新
          if (newProgress > result.progress) {
            result.progress = newProgress;
            result.content = `绘制进度 ${newProgress}%`;
            Logger.debug(`自动增加进度到 ${newProgress}%`, 'ChatDrawService');

            // 调用进度回调
            if (onProgress) {
              onProgress({ ...result });
            }
          }

          // 更新最后进度增加时间
          lastProgressIncreaseTime = currentTime;
        }

        // 只有在处理时间超过最小处理时间后才考虑超时
        if (elapsedTime > minProcessingTime && currentTime - lastUpdateTime > TIMEOUT_DURATION) {
          Logger.warn(
            `流处理已超过${TIMEOUT_DURATION / 1000}秒未收到更新，自动断开连接`,
            'ChatDrawService',
          );
          break; // 跳出循环，结束流处理
        }

        chunkCount++;
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        if (content) {
          buffer += content;
          lastUpdateTime = currentTime; // 更新最后更新时间

          Logger.debug(`内容更新，当前完整buffer: ${buffer}`, 'ChatDrawService');

          // Regex to find all types of image links (markdown, direct URLs)
          const combinedRegex =
            /\!?\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s"')<>]+\.(?:png|jpg|jpeg|gif|webp))/gi;
          let match;
          while ((match = combinedRegex.exec(buffer)) !== null) {
            const url = match[1] || match[2]; // match[1] for markdown, match[2] for direct URL
            if (url && !allExtractedUrls.has(url)) {
              allExtractedUrls.add(url);
              Logger.debug(`提取到新图片链接: ${url}`, 'ChatDrawService');
            }
          }

          // 每50个chunk记录一次简要信息
          if (chunkCount % 50 === 0) {
            Logger.debug(
              `已接收${chunkCount}个数据块，当前buffer长度: ${buffer.length}`,
              'ChatDrawService',
            );
          }

          // 提前检查是否有图片链接 - 适配无进度直接返回图片的情况
          const downloadLinkRegex =
            /\[(?:下载[^]]*|点击下载\s*U\d+|[^\]]*)\]\((https?:\/\/[^)\s]+)\)/;
          const downloadLinkMatch = buffer.match(downloadLinkRegex);

          const imageUrlRegex = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/;
          const imageUrlMatch = buffer.match(imageUrlRegex);

          // 额外的URL检测正则，适配更多格式
          const extraImageUrlRegex = /https?:\/\/[^\s"')]+\.(png|jpg|jpeg|gif|webp)/i;
          const extraImageUrlMatch = buffer.match(extraImageUrlRegex);

          // If any URL is found and no progress yet, set to 100% (or some high value)

          // 简化的进度匹配 - 直接匹配数字+%格式，同时支持>进度: 数字%格式
          const simpleProgressRegex = /(?:(\d+)%|>进度:\s*(\d+)%)/g;
          const allProgressMatches = [...buffer.matchAll(simpleProgressRegex)];

          if (allProgressMatches.length > 0) {
            // 使用最后一个匹配的百分比
            const lastMatch = allProgressMatches[allProgressMatches.length - 1];
            // 考虑两种可能的捕获组
            const progressValue = lastMatch[1] || lastMatch[2];

            if (progressValue) {
              const progressPercentage = parseInt(progressValue, 10);

              // 只有在百分比有效(1-100之间)且大于上次进度时才更新
              if (
                progressPercentage >= 1 &&
                progressPercentage <= 100 &&
                progressPercentage > lastProgressPercent
              ) {
                hasProgress = true;
                lastProgressPercent = progressPercentage;
                result.progress = progressPercentage;
                result.content = `绘制进度 ${progressPercentage}%`;
                Logger.log(`绘图进度: ${progressPercentage}%`, 'ChatDrawService');

                // 更新最后进度增加时间，避免自动增加进度与实际进度冲突
                lastProgressIncreaseTime = currentTime;

                // 调用进度回调
                if (onProgress) {
                  onProgress({ ...result });
                }
              }
            }
          }

          // 检测流中的图片URL但此处不上传，仅更新进度
          if (downloadLinkMatch || imageUrlMatch || extraImageUrlMatch) {
            // 确定最终URL的优先级
            const currentFinalUrl = downloadLinkMatch // This logic might need to be removed or adapted since we collect all URLs
              ? downloadLinkMatch[1]
              : imageUrlMatch
              ? imageUrlMatch[1]
              : extraImageUrlMatch
              ? extraImageUrlMatch[0]
              : null;

            if (currentFinalUrl) {
              // If any URL is detected, consider drawing complete for progress purposes
              result.progress = 100;
              result.content = `${prompt} 绘制成功，图片获取中...`;
              Logger.log('检测到图片，绘制完成（流式更新）', 'ChatDrawService');
              // Logger.debug(`检测到图片链接 (流式): ${currentFinalUrl}`, 'ChatDrawService'); // Log individual finds

              if (onProgress) {
                onProgress({ ...result });
              }
            }
          }
        }
      }
      // --- End of Streaming Logic ---

      Logger.log(`流式数据接收完毕，共接收${chunkCount}个数据块`, 'ChatDrawService');
      Logger.debug(
        `流式数据接收完毕，共接收${chunkCount}个数据块, 最终buffer长度: ${buffer.length}`,
        'ChatDrawService',
      );
      Logger.debug(`流式响应总长度: ${buffer.length}`, 'ChatDrawService');

      // After stream (or non-streamed response), extract all URLs from the final buffer
      // This ensures even non-streamed responses (like a direct API call similar to sdxl) are processed
      const finalCombinedRegex =
        /\!?\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s"')<>]+\.(?:png|jpg|jpeg|gif|webp))/gi;
      let finalMatch;
      while ((finalMatch = finalCombinedRegex.exec(buffer)) !== null) {
        const url = finalMatch[1] || finalMatch[2];
        if (url && !allExtractedUrls.has(url)) {
          allExtractedUrls.add(url);
          Logger.debug(`从最终buffer提取到新图片链接: ${url}`, 'ChatDrawService');
        }
      }

      Logger.debug(
        `所有提取到的原始图片链接 (去重后): ${[...allExtractedUrls].join(', ')}`,
        'ChatDrawService',
      );

      // Upload all extracted and unique URLs
      if (allExtractedUrls.size > 0) {
        Logger.log(`共提取到 ${allExtractedUrls.size} 个唯一图片URL准备上传`, 'ChatDrawService');

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}${month}/${day}`;
        const uploadDir = `images/chatDraw/${currentDate}`; // Consistent directory

        for (const originalUrl of allExtractedUrls) {
          try {
            const uploadedUrl = await this.uploadService.uploadFileFromUrl({
              url: originalUrl,
              dir: uploadDir,
            });
            uploadedImageUrls.push(uploadedUrl);
            Logger.log('图片上传成功', 'ChatDrawService');
          } catch (error) {
            Logger.error(`上传图片失败: ${error.message}`, 'ChatDrawService');
            // Optionally, decide if you want to include original URL if upload fails, or skip.
            // For now, we only include successfully uploaded URLs.
          }
        }

        if (uploadedImageUrls.length > 0) {
          result.imageUrl = uploadedImageUrls.join(',');
          Logger.log(`最终上传成功图片数: ${uploadedImageUrls.length}`, 'ChatDrawService');

          result.progress = 100; // Ensure progress is 100
          let revised_prompt_cn;
          try {
            Logger.debug(`buffer: ${buffer}`, 'ChatDrawService');

            // 过滤掉常见的API回复文本
            const filteredBuffer = buffer.replace(
              /Got it!.*|Let me know if.*|anything else.*/g,
              '',
            );

            revised_prompt_cn = await this.openAIChatService.chatFree(
              `我得到了以下AI绘图结果，请模拟AI绘画机器人的语气，用中文回复，告诉用户已经画好了图，不需要附带任何图片链接。用户要求是: ${prompt}\n\nAI绘图返回:\n${filteredBuffer}`,
            );
            Logger.debug('生成回复成功', 'ChatDrawService');
          } catch (error) {
            revised_prompt_cn = `${prompt} 绘制成功`;
            Logger.error('生成回复失败，使用默认回复', 'ChatDrawService');
          }
          result.content = revised_prompt_cn;
        }
      }

      // 完成处理
      if (result.imageUrl) {
        Logger.log('绘图任务完成', 'ChatDrawService');
        Logger.debug('绘制成功，已生成持久化图片 URL', 'ChatDrawService');
        if (onSuccess) {
          onSuccess(result);
        }
      } else {
        Logger.warn(
          '未找到任何可用的图片URL或所有图片上传失败，返回完整的buffer',
          'ChatDrawService',
        );
        if (onFailure) {
          onFailure({
            content: buffer || '绘图未能生成有效结果',
            status: 4,
            model: model,
            modelName: modelName,
          });
        }
      }
    } catch (error) {
      Logger.error(`绘图失败: ${error.message}`, 'ChatDrawService');
      Logger.debug(
        `服务器错误，请求失败: ${error.message}\n错误详情: ${JSON.stringify(error)}`,
        'ChatDrawService',
      );
      if (onFailure) {
        onFailure({
          content: buffer || error.message,
          status: 4,
          model: model,
          modelName: modelName,
        });
      }
    }
  }
}
