import type {AdapterResponse, Scenario, ToolCall} from '../types.js';

export interface LlmAdapter {
  run(scenario: Scenario): Promise<AdapterResponse>;
}

type OpenAiMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{
    function: {name: string; arguments: string | Record<string, unknown>};
  }>;
};

export class OpenAICompatibleAdapter implements LlmAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async run(scenario: Scenario): Promise<AdapterResponse> {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? {authorization: `Bearer ${this.apiKey}`} : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{role: 'user', content: scenario.prompt}],
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM endpoint returned ${response.status}: ${body.slice(0, 500)}`);
      }

      const payload = await response.json() as {
        choices?: Array<{message?: OpenAiMessage}>;
        usage?: {prompt_tokens?: number; completion_tokens?: number};
      };
      const message = payload.choices?.[0]?.message;
      const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map(call => ({
        name: call.function.name,
        arguments: typeof call.function.arguments === 'string'
          ? safeJsonObject(call.function.arguments)
          : call.function.arguments,
      }));

      return {
        text: message?.content ?? '',
        toolCalls,
        durationMs: Date.now() - started,
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        raw: payload,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MockAdapter implements LlmAdapter {
  async run(scenario: Scenario): Promise<AdapterResponse> {
    return {
      text: scenario.expectedText ?? '',
      toolCalls: scenario.expectedToolCalls.map(({name, arguments: args}) => ({name, arguments: args})),
      durationMs: 1,
    };
  }
}

function safeJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
