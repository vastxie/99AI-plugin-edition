import {
  normalizeReasoningContentForModel,
  shouldKeepReasoningContentForModel,
} from './reasoning-content.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('reasoning-content.util', () => {
  it('keeps and patches reasoning_content for MiMo thinking tool history', () => {
    const messages: any[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '{}' } }],
      },
      {
        role: 'assistant',
        content: 'final answer',
        reasoning_content: 'should be stripped on non-tool assistant messages',
      },
    ];

    const result = normalizeReasoningContentForModel(messages, 'mimo-v2.5-pro', {
      extra_body: { thinking: { type: 'enabled' } },
    });

    expect(result.shouldKeepReasoningContent).toBe(true);
    expect(result.patched).toBe(1);
    expect(result.stripped).toBe(1);
    expect(messages[0].reasoning_content).toBe('');
    expect('reasoning_content' in messages[1]).toBe(false);
  });

  it('strips reasoning_content for MiMo when thinking is disabled', () => {
    const messages: any[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '{}' } }],
        reasoning_content: 'temporary reasoning',
      },
    ];

    const result = normalizeReasoningContentForModel(messages, 'mimo-v2.5-pro', {
      extra_body: { thinking: { type: 'disabled' } },
    });

    expect(result.shouldKeepReasoningContent).toBe(false);
    expect(result.stripped).toBe(1);
    expect('reasoning_content' in messages[0]).toBe(false);
  });

  it('keeps DeepSeek thinking compatibility unchanged', () => {
    expect(shouldKeepReasoningContentForModel('deepseek-r1')).toBe(true);
    expect(shouldKeepReasoningContentForModel('deepseek-chat')).toBe(false);
    expect(
      shouldKeepReasoningContentForModel('deepseek-chat', {
        thinking: { type: 'enabled' },
      }),
    ).toBe(true);
  });
});
