import { Logger } from '@nestjs/common';

type ChatMessage = Record<string, any>;

function getThinkingType(additionalParams?: Record<string, any>): string | undefined {
  const type =
    additionalParams?.extra_body?.thinking?.type ||
    additionalParams?.extraBody?.thinking?.type ||
    additionalParams?.thinking?.type;
  return typeof type === 'string' ? type.toLowerCase() : undefined;
}

export function shouldKeepReasoningContentForModel(
  model?: string,
  additionalParams?: Record<string, any>,
): boolean {
  const normalized = String(model || '').toLowerCase();
  const isDeepSeekModel = normalized.includes('deepseek');
  const isMimoModel = normalized.includes('mimo') || normalized.includes('xiaomi');
  if (!isDeepSeekModel && !isMimoModel) return false;

  const thinkingType = getThinkingType(additionalParams);
  if (thinkingType === 'disabled') return false;
  if (thinkingType === 'enabled') return true;

  if (isDeepSeekModel) return /(reason|r1|thinking|v4|pro)/i.test(normalized);

  return /v2(?:\.5)?(?:-|$)|pro|omni|flash|thinking/i.test(normalized);
}

/**
 * DeepSeek / MiMo thinking models require assistant tool-call history to carry
 * reasoning_content. Non-thinking models often reject this extension field.
 */
export function normalizeReasoningContentForModel(
  messages: ChatMessage[] | any[],
  model?: string,
  additionalParams?: Record<string, any>,
  loggerContext?: string,
): { patched: number; stripped: number; shouldKeepReasoningContent: boolean } {
  const shouldKeep = shouldKeepReasoningContentForModel(model, additionalParams);

  let patched = 0;
  let stripped = 0;
  for (const msg of messages as ChatMessage[]) {
    if (msg?.role !== 'assistant') continue;

    if (!shouldKeep) {
      if ('reasoning_content' in msg) {
        delete msg.reasoning_content;
        stripped++;
      }
      continue;
    }

    if (!Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
      if ('reasoning_content' in msg) {
        delete msg.reasoning_content;
        stripped++;
      }
      continue;
    }

    if (msg.reasoning_content === undefined || msg.reasoning_content === null) {
      msg.reasoning_content = '';
      patched++;
    }
  }

  if (patched > 0) {
    Logger.warn(
      `thinking 模型兼容：为 ${patched} 条历史工具调用补充 reasoning_content`,
      loggerContext || 'ReasoningContent',
    );
  }

  if (stripped > 0) {
    Logger.debug(
      `非目标模型兼容：移除 ${stripped} 条历史 reasoning_content`,
      loggerContext || 'ReasoningContent',
    );
  }

  return { patched, stripped, shouldKeepReasoningContent: shouldKeep };
}
