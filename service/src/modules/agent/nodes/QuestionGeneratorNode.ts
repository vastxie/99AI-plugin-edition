import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { BaseNode } from '../core/BaseNode';
import { NodeInput, NodeMeta, NodeOutput } from '../core/NodeInterface';

/**
 * 问题推荐节点 - 使用新架构
 * 基于用户问题和AI回答生成相关推荐问题
 */
@Injectable()
export class QuestionGeneratorNode extends BaseNode {
  // 节点元信息
  readonly meta: NodeMeta = {
    id: 'question_generator',
    type: 'question_generator',
    name: '问题推荐节点',
    description: '基于对话上下文生成相关推荐问题',
    version: '2.0.0',
    supportStream: true,
    supportDynamicParams: true,
  };

  constructor(protected readonly globalConfigService: GlobalConfigService) {
    super(globalConfigService);
  }

  /**
   * 核心处理逻辑
   */
  protected async process(input: NodeInput): Promise<NodeOutput> {
    // 获取用户问题和AI回答
    const userQuestion = this.extractUserQuestion(input.messages);
    const aiAnswer = this.extractAIAnswer(input);

    if (!userQuestion || !aiAnswer) {
      Logger.warn('缺少用户问题或AI回答，无法生成推荐问题', 'QuestionGeneratorNode');
      return this.createSkippedResult('no_content');
    }

    // 发送开始状态 - QuestionGeneratorNode 不需要发送操作状态
    // this.sendStream(input, {
    //   type: 'status',
    //   status: 'generating',
    //   content: input.config.progressMessages?.start || '生成相关问题推荐...',
    // });

    try {
      // 发送处理中状态 - QuestionGeneratorNode 不需要发送操作状态
      // this.sendStream(input, {
      //   type: 'status',
      //   status: 'processing',
      //   content: input.config.progressMessages?.processing || '正在生成推荐问题...',
      // });

      // 生成推荐问题
      const questionCount = this.getConfigValue(input, 'questionCount', 3);
      const maxLength = this.getConfigValue(input, 'maxQuestionLength', 30);

      // 截取用户问题和AI回答的前300字符
      const truncatedQuestion =
        userQuestion.length > 300 ? userQuestion.substring(0, 300) : userQuestion;
      const truncatedAnswer = aiAnswer.length > 300 ? aiAnswer.substring(0, 300) : aiAnswer;

      // 构建生成问题的提示词
      const questionPrompt = `Based on the user's question {${truncatedQuestion}} and the AI's answer {${truncatedAnswer}}, generate ${questionCount} follow-up questions to ask the AI. Wrap each question in {}, do not include line breaks, do not include any other content. Each question should not exceed ${maxLength} characters. Use the language of {${truncatedQuestion}}.`;

      // 调用OpenAI生成推荐问题
      const generatedQuestions = await this.callOpenAI(questionPrompt, input);

      let promptReference = '';
      let recommendedQuestions: string[] = [];

      if (generatedQuestions) {
        promptReference = generatedQuestions;

        // 解析生成的问题（提取{}中的内容）
        const questionMatches = generatedQuestions.match(/\{([^}]+)\}/g);
        if (questionMatches) {
          recommendedQuestions = questionMatches
            .map(match => match.replace(/[{}]/g, '').trim())
            .filter(q => q.length > 0);
        }
      }

      // 构建推荐状态
      const questionState = {
        promptReference,
        recommendedQuestions,
        generated: true,
        skipped: false,
        userQuestion,
        aiAnswerLength: aiAnswer.length,
        generateTime: new Date().toISOString(),
      };

      // 发送完成状态 - QuestionGeneratorNode 不需要发送操作状态
      // this.sendStream(input, {
      //   type: 'status',
      //   status: 'completed',
      //   content:
      //     input.config.progressMessages?.end || `生成了 ${recommendedQuestions.length} 个推荐问题`,
      // });

      // 构建agent_content（向后兼容）
      const agentContent = {
        metadata: {
          type: 'streaming',
          workflowId: input.context.workflowId,
          nodeExecutionId: input.context.currentNodeExecutionId,
          nodeExecutionSequence: input.context.nodeExecutionSequence,
          timestamp: new Date().toISOString(),
          nodeType: 'question_generator',
        },
        data: {
          custom: {
            promptReference: promptReference,
            recommendedQuestions: recommendedQuestions,
          },
        },
      };

      // 向后兼容的完成回调 - QuestionGeneratorNode 不需要发送状态
      // input.context.onProgress?.({
      //   nodeType: 'question_generator',
      //   status: 'completed',
      //   statusMessage: `问题推荐生成完成`,
      //   agent_content: JSON.stringify(agentContent),
      //   questionGenerated: true,
      // });

      // 返回成功结果
      return {
        result: {
          success: true,
          data: questionState,
          metadata: {
            questionCount: recommendedQuestions.length,
            userQuestion,
            generateTime: questionState.generateTime,
          },
        },
        stateUpdates: {
          [input.config.outputKey || 'questionResult']: questionState,
        },
        agentDataUpdates: {
          custom: {
            promptReference,
            recommendedQuestions,
          },
        },
      };
    } catch (error) {
      Logger.error(`问题推荐节点执行失败: ${error.message}`, 'QuestionGeneratorNode');

      // 发送错误状态
      this.sendStream(input, {
        type: 'error',
        error: `问题推荐失败: ${error.message}`,
      });

      // 返回错误结果，但保持基本结构
      const errorState = {
        promptReference: '',
        recommendedQuestions: [],
        generated: false,
        error: error.message,
        generateTime: new Date().toISOString(),
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
          [input.config.outputKey || 'questionResult']: errorState,
        },
      };
    }
  }

  /**
   * 直接调用OpenAI API生成问题推荐
   */
  private async callOpenAI(prompt: string, input?: NodeInput): Promise<string> {
    try {
      // 获取配置
      const {
        openaiBaseUrl = '',
        openaiBaseKey = '',
        openaiBaseModel = 'gpt-4o-mini',
      } = await this.globalConfigService.getConfigs([
        'openaiBaseKey',
        'openaiBaseUrl',
        'openaiBaseModel',
      ]);

      if (!openaiBaseKey) {
        throw new Error('缺少OpenAI API密钥配置');
      }

      // 处理API URL
      const apiUrl = await correctApiBaseUrl(openaiBaseUrl || 'https://api.openai.com/v1');

      // 创建OpenAI客户端
      const openai = new OpenAI({
        apiKey: openaiBaseKey,
        baseURL: apiUrl,
      });

      // 调用非流式API
      const completion = await openai.chat.completions.create({
        model: openaiBaseModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
        stream: false, // 非流式调用
      });

      const result = completion.choices[0]?.message?.content || '';

      // 获取实际的token使用量
      const actualUsage = completion.usage;
      if (actualUsage) {
      }

      // 记录 Token 使用情况
      if (input) {
        const inputText = prompt;
        const outputText = result;
        await this.recordTokenUsage(input, inputText, outputText, '问题推荐生成', actualUsage);
      }

      return result;
    } catch (error) {
      Logger.error(`OpenAI API调用失败: ${error.message}`, 'QuestionGeneratorNode');
      throw error;
    }
  }

  /**
   * 从消息历史中提取用户问题
   */
  private extractUserQuestion(messages: any[]): string | null {
    // 从最后一条用户消息中提取内容
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        // 处理字符串内容
        if (typeof message.content === 'string') {
          return message.content.trim();
        }

        // 处理数组内容（多模态消息）
        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'text' && item.text) {
              return item.text.trim();
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 从工作流状态中提取AI回答
   */
  private extractAIAnswer(input: NodeInput): string | null {
    const context = input.context;

    // 优先从过滤结果中获取（如果有敏感词过滤）
    const filterResult = context.state?.filterResult;
    if (filterResult && filterResult.filteredContent) {
      return this.extractTextFromContent(filterResult.filteredContent);
    }

    // 从共享状态中获取
    const sharedState = context.state?.sharedState;
    if (sharedState) {
      // 优先使用full_content，然后是content
      if (sharedState.full_content) {
        return this.extractTextFromContent(sharedState.full_content);
      }
      if (sharedState.content) {
        return this.extractTextFromContent(sharedState.content);
      }
    }

    // 从LLM响应中获取
    const llmResponse = context.state?.llm_response;
    if (llmResponse) {
      if (llmResponse.full_content) {
        return this.extractTextFromContent(llmResponse.full_content);
      }
      if (llmResponse.content) {
        return this.extractTextFromContent(llmResponse.content);
      }
    }

    // 从其他可能的状态键中获取
    const chatResponse = context.state?.chat_response;
    if (chatResponse) {
      if (chatResponse.full_content) {
        return this.extractTextFromContent(chatResponse.full_content);
      }
      if (chatResponse.content) {
        return this.extractTextFromContent(chatResponse.content);
      }
    }

    return null;
  }

  /**
   * 从不同格式的content中提取纯文本
   */
  private extractTextFromContent(content: any): string | null {
    if (!content) {
      return null;
    }

    // 如果已经是字符串，直接返回
    if (typeof content === 'string') {
      return content.trim();
    }

    // 如果是数组格式（多模态消息）
    if (Array.isArray(content)) {
      let text = '';
      for (const item of content) {
        if (item && typeof item === 'object' && item.type === 'text' && item.text) {
          text += item.text;
        }
      }
      return text.trim() || null;
    }

    // 如果是对象但不是数组，尝试获取text字段
    if (typeof content === 'object' && content.text) {
      return typeof content.text === 'string' ? content.text.trim() : null;
    }

    // 尝试转换为字符串
    try {
      const strContent = String(content).trim();
      return strContent || null;
    } catch (error) {
      Logger.warn(`无法提取文本内容: ${error.message}`, 'QuestionGeneratorNode');
      return null;
    }
  }

  /**
   * 创建跳过结果
   */
  private createSkippedResult(reason: string): NodeOutput {
    const emptyState = {
      promptReference: '',
      recommendedQuestions: [],
      generated: false,
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
        questionResult: emptyState,
      },
    };
  }
}
