import type {AdapterRequest, AdapterResponse, LlmAdapter, ToolCall} from '../types.js';

export class ScriptedMockAdapter implements LlmAdapter {
  readonly kind = 'mock' as const;

  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const user = [...request.messages].find((m) => m.role === 'user')?.content ?? '';
    const priorToolCalls = request.messages.flatMap((m) => m.role === 'assistant' ? (m.toolCalls ?? []) : []);
    const calls: ToolCall[] = [];
    const add = (name: string, arguments_: Record<string, unknown>) =>
      calls.push({id: `mock-${priorToolCalls.length + calls.length + 1}`, name, arguments: arguments_});

    if (/do not call any tools/i.test(user)) {
      return {text: 'Hello!', toolCalls: [], durationMs: 1, finishReason: 'stop'};
    }

    // Continue multi-step scenarios after the first tool result has been returned.
    if (request.messages.some((m) => m.role === 'tool')) {
      if (/price of [A-Z0-9]+.*summarize/i.test(user) && !priorToolCalls.some((call) => call.name === 'summarize')) {
        add('summarize', {format: /one sentence/i.test(user) ? 'one_sentence' : 'bullet_points'});
        return {text: '', toolCalls: calls, durationMs: 1, finishReason: 'tool_calls'};
      }

      if (/docs for [^.]+.*read the relevant file/i.test(user) && !priorToolCalls.some((call) => call.name === 'read_file')) {
        add('read_file', {path: 'relevant'});
        return {text: '', toolCalls: calls, durationMs: 1, finishReason: 'tool_calls'};
      }

      if (/account balance/i.test(user) && /backup/i.test(user) && !priorToolCalls.filter((call) => call.name === 'get_account_balance').some((call) => call.arguments.account === 'backup')) {
        add('get_account_balance', {account: 'backup'});
        return {text: '', toolCalls: calls, durationMs: 1, finishReason: 'tool_calls'};
      }

      return {text: finalText(user), toolCalls: [], durationMs: 1, finishReason: 'stop'};
    }

    const weather = user.match(/weather in ([A-Za-z ]+)/i);
    if (weather) add('get_weather', {location: weather[1].trim(), date: 'today'});

    const crypto = user.match(/price of ([A-Z0-9]+)/);
    if (crypto) add('get_crypto_price', {symbol: crypto[1]});

    const quote = user.match(/stock quote for ([A-Z]+)/i);
    if (quote) add('get_stock_quote', {symbol: quote[1]});

    const time = user.match(/time is it in ([A-Za-z_]+\/[A-Za-z_]+)/i);
    if (time) add('get_current_time', {timezone: time[1]});

    const calc = user.match(/Calculate ([0-9+*/ -]+)/i);
    if (calc) add('calculate', {expression: calc[1].trim()});

    const usr = user.match(/look up user ([A-Za-z0-9_]+)/i);
    if (usr) add('lookup_user', {username: usr[1]});

    if (/repository status/i.test(user)) {
      add('git_status', {});
      add('run_tests', /failing tests/i.test(user) ? {filter: 'failing'} : {});
      add('read_file', {path: 'relevant'});
    }

    const docs = user.match(/docs for ([^.]+)/i);
    if (docs) {
      add('search_docs', {query: docs[1].trim()});
      if (/read the relevant file/i.test(user)) add('read_file', {path: 'relevant'});
      if (/summarize/i.test(user)) add('summarize', {format: /one sentence/i.test(user) ? 'one_sentence' : 'bullet_points'});
    }

    if (/account balance/i.test(user)) {
      add('get_account_balance', {account: 'primary'});
      if (/backup/i.test(user)) add('get_account_balance', {account: 'backup'});
      if (/summarize/i.test(user)) add('summarize', {format: 'one_sentence'});
    }

    if (/weather and .*time/i.test(user)) {
      calls.length = 0;
      add('get_weather', {location: 'Bengaluru', date: 'today'});
      add('get_current_time', {timezone: 'Asia/Kolkata'});
      if (/summarize/i.test(user)) add('summarize', {format: 'one_sentence'});
    }

    return {text: '', toolCalls: calls, durationMs: 1, finishReason: calls.length ? 'tool_calls' : 'stop'};
  }
}

function finalText(prompt: string) {
  if (/weather and .*time/i.test(prompt)) return 'The weather and local time were retrieved and summarized.';
  if (/account balance/i.test(prompt)) return 'The final account balance result was summarized.';
  if (/repository status/i.test(prompt)) return 'The failing test and relevant file were inspected and a minimal non-mutating fix was summarized.';
  if (/tool calling/i.test(prompt)) return 'The tool-calling constraint was identified from documentation and the relevant file.';
  if (/price/i.test(prompt)) return 'The requested price was retrieved and summarized.';
  return 'The requested result was completed.';
}
