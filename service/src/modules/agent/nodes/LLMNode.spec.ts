import { LLMNode } from './LLMNode';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createAsyncStream(chunks: any[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function createInput() {
  return {
    messages: [{ role: 'user', content: '北京天气怎么样？' }],
    config: {},
    context: {
      workflowId: 'workflow-test',
      currentNodeId: 'llm',
      options: {},
      abortController: new AbortController(),
      onProgress: jest.fn(),
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        details: [],
      },
      agentContent: {
        metadata: {
          version: '1.0.0',
          type: 'llm',
          workflowId: 'workflow-test',
          timestamp: new Date().toISOString(),
          status: 'processing',
        },
        data: {
          toolExecutions: [],
          fileAnalysis: {},
          custom: {},
          ppt: null,
        },
        execution: {},
      },
    },
    globalConfig: {},
    dynamicParams: {},
  } as any;
}

describe('LLMNode native tool loop', () => {
  it('keeps reasoning_content on assistant tool-call history for MiMo thinking models', async () => {
    const netSearchService = {
      webSearchPro: jest.fn().mockResolvedValue({
        searchResults: [
          {
            title: '北京天气',
            content: '晴，25度',
            link: 'https://example.com/weather',
          },
        ],
      }),
    };
    const node = new LLMNode({} as any, {} as any, netSearchService as any);
    const input = createInput();
    const messages = [{ role: 'user', content: '北京天气怎么样？' }];
    const create = jest
      .fn()
      .mockResolvedValueOnce(
        createAsyncStream([
          {
            choices: [
              {
                delta: {
                  reasoning_content: '需要查询实时天气。',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_weather',
                      function: {
                        name: 'web_search',
                        arguments: '{"query":"',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: '北京天气"}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          },
        ]),
      )
      .mockResolvedValueOnce(
        createAsyncStream([
          {
            choices: [
              {
                delta: {
                  content: '北京今天晴，约25度。',
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
          },
        ]),
      );

    const result = await (node as any).handleOpenAIStream(
      { chat: { completions: { create } } },
      {
        model: 'mimo-v2.5-pro',
        messages,
        stream: true,
        extra_body: { thinking: { type: 'enabled' } },
      },
      input,
      {
        enabled: true,
        tools: [],
        clientToolsMap: {},
        maxRounds: 3,
      },
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(netSearchService.webSearchPro).toHaveBeenCalledWith('北京天气');
    expect(result.full_content).toBe('北京今天晴，约25度。');

    const secondRequestMessages = create.mock.calls[1][0].messages;
    const assistantMessage = secondRequestMessages.find((msg: any) => msg.role === 'assistant');
    expect(assistantMessage.tool_calls[0].function.name).toBe('web_search');
    expect(assistantMessage.reasoning_content).toBe('需要查询实时天气。');

    const toolMessage = secondRequestMessages.find((msg: any) => msg.role === 'tool');
    expect(toolMessage.tool_call_id).toBe('call_weather');
    expect(toolMessage.content).toContain('北京天气');
  });

  it('preserves chunk-by-chunk streaming when native tools are disabled', async () => {
    const node = new LLMNode({} as any, {} as any);
    const input = createInput();
    const create = jest.fn().mockResolvedValueOnce(
      createAsyncStream([
        {
          choices: [
            {
              delta: {
                content: '第一段',
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: '第二段',
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
        },
      ]),
    );

    const result = await (node as any).handleOpenAIStream(
      { chat: { completions: { create } } },
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: '你好' }],
        stream: true,
      },
      input,
      { enabled: false, tools: [], clientToolsMap: {}, maxRounds: 0 },
    );

    const textUpdates = input.context.onProgress.mock.calls
      .map((call: any[]) => call[0]?.content?.[0]?.text)
      .filter(Boolean);

    expect(create).toHaveBeenCalledTimes(1);
    expect(textUpdates).toEqual(['第一段', '第二段']);
    expect(result.full_content).toBe('第一段第二段');
  });
});
