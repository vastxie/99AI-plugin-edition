import { Injectable, Logger } from '@nestjs/common';
import { FileVectorSearchService } from '../../aiTool/search/fileVectorSearch.service';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeOutput, NodeMeta } from '../core/NodeInterface';

/**
 * 图片分析节点 - 使用新架构
 * 处理图片和视频的内容分析
 */
@Injectable()
export class ImageAnalysisNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'image_analysis',
    type: 'image_analysis',
    name: '图片分析节点',
    description: '分析图片和视频内容，提取视觉信息和场景描述',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(
    protected readonly globalConfigService: GlobalConfigService,
    private readonly fileVectorSearchService: FileVectorSearchService,
  ) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    Logger.debug('开始执行图片分析节点');

    // 获取图片URL和视频URL
    const imageUrl = this.extractImageUrl(input);
    const videoUrl = this.extractVideoUrl(input);

    if (!imageUrl && !videoUrl) {
      Logger.debug('缺少图片或视频URL，跳过图片分析');
      return this.createSkippedResult('missing_input');
    }

    // 发送开始状态
    this.sendStream(input, {
      type: 'status',
      status: 'analyzing',
      content: input.config.progressMessages?.start || '启动图片分析...',
    });

    try {
      // 发送处理中状态
      this.sendStream(input, {
        type: 'status',
        status: 'processing',
        content: input.config.progressMessages?.processing || '分析图片内容中...',
      });

      // 创建结果对象用于兼容原有逻辑
      const result: any = {};

      // 调用图片分析服务
      const imageDescription = await this.fileVectorSearchService.processImageDescription(
        imageUrl || '',
        videoUrl || '',
        {
          isImageUpload: input.context.options?.isImageUpload,
          usingDeepThinking: input.context.options?.usingDeepThinking,
          onProgress: (data: any) => {
            // 发送进度数据流
            this.sendStream(input, {
              type: 'data',
              data: {
                nodeType: 'image_analysis',
                status: 'processing',
                ...data,
              },
            });

            // 向后兼容的进度回调
            input.context.onProgress?.({
              nodeType: 'image_analysis',
              status: 'processing',
              statusMessage: '正在分析图片...',
              ...data,
            });
          },
          onDatabase: (data: any) => {
            // 可以在这里处理数据库相关逻辑
            Logger.debug('图片分析数据库回调:', data);
          },
        },
        result,
      );

      // 记录 token 使用量
      if (imageDescription?.tokenUsage) {
        await this.recordTokenUsage(
          input,
          `Image: ${imageUrl}, Video: ${videoUrl}`,
          JSON.stringify(imageDescription),
          '图片/视频分析',
          imageDescription.tokenUsage,
        );
      }

      // 构建分析状态
      const analysisState = {
        imageDescription,
        analysisEnabled: true,
        skipped: false,
        imageUrl,
        videoUrl,
        processTime: new Date().toISOString(),
        // 保留原有结果格式用于兼容
        imageDescriptionResult: result.imageDescription || null,
      };

      // 发送完成状态
      this.sendStream(input, {
        type: 'status',
        status: 'completed',
        content: input.config.progressMessages?.end || '图片分析完成',
      });

      // 向后兼容的完成回调
      input.context.onProgress?.({
        nodeType: 'image_analysis',
        status: 'completed',
        statusMessage: input.config.progressMessages?.end || '图片分析完成',
      });

      Logger.debug(`图片分析完成 - 有结果: ${!!imageDescription}`);

      // 提取实际的描述文本
      const descriptionText =
        typeof imageDescription === 'string'
          ? imageDescription
          : imageDescription?.relevantContent || null;

      // 将图片分析存储到 fileAnalysis 中（兼容旧结构）
      const fileAnalysisUpdate = {
        imageAnalysis: {
          imageUrl,
          videoUrl,
          description: descriptionText,
          processTime: analysisState.processTime,
        },
      };

      // 返回成功结果
      return {
        result: {
          success: true,
          data: analysisState,
          metadata: {
            imageUrl,
            videoUrl,
            hasResults: !!imageDescription,
            processTime: analysisState.processTime,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'imageAnalysisResult']: analysisState,
        },
        agentDataUpdates: {
          fileAnalysis: fileAnalysisUpdate,
          imageAnalysis: {
            imageUrl,
            videoUrl,
            analysis: descriptionText,
            objects: this.extractObjects(descriptionText),
          },
        },
      };
    } catch (error) {
      Logger.error(`图片分析节点执行失败: ${error.message}`);

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `图片分析失败: ${error.message}`,
      });

      // 返回错误结果，但保持基本结构
      const errorState = {
        imageDescription: null,
        analysisEnabled: false,
        error: error.message,
        processTime: new Date().toISOString(),
      };

      return {
        result: {
          success: true, // 即使出错也标记为成功，避免整个工作流失败
          data: errorState,
          metadata: {
            error: error.message,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'imageAnalysisResult']: errorState,
        },
      };
    }
  }

  /**
   * 从上下文中提取图片URL
   */
  private extractImageUrl(input: NodeInput): string | null {
    // 优先从动态参数获取
    if (input.dynamicParams?.imageUrl) {
      return input.dynamicParams.imageUrl;
    }

    // 从配置获取
    if (input.config.imageUrl) {
      return input.config.imageUrl;
    }

    // 从options中获取图片URL
    if (input.context.options?.imageUrl) {
      return input.context.options.imageUrl;
    }

    // 从消息历史中提取图片URL
    for (const message of input.messages) {
      if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'image_url' && item.image_url?.url) {
            return item.image_url.url;
          }
        }
      }
    }

    return null;
  }

  /**
   * 从上下文中提取视频URL
   */
  private extractVideoUrl(input: NodeInput): string | null {
    // 优先从动态参数获取
    if (input.dynamicParams?.videoUrl) {
      return input.dynamicParams.videoUrl;
    }

    // 从配置获取
    if (input.config.videoUrl) {
      return input.config.videoUrl;
    }

    // 从options中获取视频URL
    return input.context.options?.videoUrl || null;
  }

  /**
   * 从描述中提取对象信息
   */
  private extractObjects(description: string | null): any[] {
    if (!description || typeof description !== 'string') {
      return [];
    }

    // 这里可以实现更复杂的对象提取逻辑
    // 例如使用正则表达式或NLP技术提取物体、场景等信息
    const objects = [];

    // 简单的关键词提取示例
    const keywords = ['人', '物体', '场景', '动物', '建筑', '车辆'];
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        objects.push({ type: keyword, confidence: 0.8 });
      }
    }

    return objects;
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(reason: string): NodeOutput {
    const emptyState = {
      imageDescription: null,
      analysisEnabled: false,
      skipped: true,
      skipReason: reason,
    };

    return {
      result: {
        success: true,
        data: emptyState,
        metadata: {
          skipped: true,
          reason,
        },
      },
      stateUpdates: {
        imageAnalysisResult: emptyState,
      },
    };
  }
}
