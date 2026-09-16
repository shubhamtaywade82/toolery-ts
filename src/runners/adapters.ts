import type {AdapterRequest, AdapterResponse, LlmAdapter, ToolCall} from '../types.js';

export interface AdapterOptions { baseUrl: string; apiKey?: string; timeoutMs: number; }

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

export class OpenAICompatibleAdapter implements LlmAdapter {
  readonly kind = 'openai-compatible' as const;
  constructor(private readonly options: AdapterOptions) {}

  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: {'content-type': 'application/json', ...(this.options.apiKey ? {authorization: `Bearer ${this.options.apiKey}`} : {})},
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: request.tools.map(tool => ({type: 'function', function: {name: tool.name, description: tool.description, parameters: tool.parameters}})),
          tool_choice: request.toolChoice ?? 'auto',
          temperature: request.temperature ?? 0,
        }),
      });
      const payload = await response.json() as any;
      if (!response.ok) throw new Error(`LLM endpoint returned ${response.status}: ${payload?.error?.message ?? response.statusText}`);
      const message = payload?.choices?.[0]?.message ?? {};
      const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call: any) => ({id: call.id, name: call.function?.name ?? '', arguments: safeJsonObject(call.function?.arguments)})).filter((call: ToolCall) => call.name);
      return {
        text: typeof message.content === 'string' ? message.content : '', toolCalls,
        durationMs: performance.now() - started, inputTokens: payload?.usage?.prompt_tokens,
        outputTokens: payload?.usage?.completion_tokens, finishReason: payload?.choices?.[0]?.finish_reason, raw: payload,
      };
    } finally { clearTimeout(timeout); }
  }
}

export class MockAdapter implements LlmAdapter {
  readonly kind = 'mock' as const;
  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const userText = [...request.messages].reverse().find(message => message.role === 'user')?.content ?? '';
    const calls: ToolCall[] = [];
    const add = (name: string, args: Record<string, unknown>) => calls.push({id: `mock-${calls.length + 1}`, name, arguments: args});
    if (/do not call any tools/i.test(userText)) return {text: 'Hello!', toolCalls: [], durationMs: 1, finishReason: 'stop'};
    const weather = userText.match(/weather in ([A-Za-z ]+)/i); if (weather) add('get_weather', {location: weather[1].trim(), date: 'today'});
    const crypto = userText.match(/price of ([A-Z0-9]+)/); if (crypto) add('get_crypto_price', {symbol: crypto[1]});
    const quote = userText.match(/stock quote for ([A-Z]+)/i); if (quote) add('get_stock_quote', {symbol: quote[1]});
    const tz = userText.match(/time (?:is it )?in ([A-Za-z_]+\/[A-Za-z_]+)/i); if (tz) add('get_current_time', {timezone: tz[1]});
    const calc = userText.match(/Calculate ([0-9+*/ -]+)/i); if (calc) add('calculate', {expression: calc[1].trim()});
    const user = userText.match(/look up user ([A-Za-z0-9_]+)/i); if (user) add('lookup_user', {username: user[1]});
    const docs = userText.match(/docs for ([^.]+)/i); if (docs) add('search_docs', {query: docs[1].trim()});
    if (/repository status/i.test(userText)) { add('git_status', {}); add('run_tests', {}); add('read_file', {path: 'relevant'}); }
    if (/account balance/i.test(userText)) { add('get_account_balance', {account: 'primary'}); if (/backup/i.test(userText)) add('get_account_balance', {account: 'backup'}); }
    return {text: /summarize|summary/i.test(userText) ? 'The requested result was summarized.' : '', toolCalls: calls, durationMs: 1, finishReason: 'tool_calls'};
  }
}
