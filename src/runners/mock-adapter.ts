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

    // Capability-evaluation pack (source=capability): scripted ideal responses so
    // `--adapter mock --source capability` runs green in CI and demonstrates the
    // expected behavior for every scoring contract.
    const capability = capabilityResponse(user, priorToolCalls);
    if (capability) return capability;

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

    const weather = user.match(/weather in ([A-Za-z][A-Za-z ]*?)(?=\s+(?:today|tomorrow|tonight|right now|now)\b|[?.!]|$)/i);
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

/**
 * Scripted responses for the capability-evaluation pack. Returns undefined for
 * every other prompt so the synthetic-pack behavior is untouched.
 */
function capabilityResponse(user: string, priorToolCalls: ToolCall[]): AdapterResponse | undefined {
  const done = (text: string): AdapterResponse => ({text, toolCalls: [], durationMs: 1, finishReason: 'stop'});
  const step = (name: string, args: Record<string, unknown>): AdapterResponse => ({
    text: '',
    toolCalls: [{id: `mock-cap-${priorToolCalls.length + 1}`, name, arguments: args}],
    durationMs: 1,
    finishReason: 'tool_calls',
  });

  // cap-09: single read-only tool call, refund prohibited.
  const selection = user.match(/check whether order (ORD-\d+) is eligible for a refund/i);
  if (selection) {
    if (!priorToolCalls.length) return step('get_order_details', {order_id: selection[1]});
    return done(`Order ${selection[1]} (delivered) is refund eligible. Per your instruction, no refund was issued.`);
  }

  // cap-10: ordered multi-step workflow, refund prohibited.
  if (/find customer A-104/i.test(user)) {
    if (!priorToolCalls.some((call) => call.name === 'get_customer')) return step('get_customer', {customer_id: 'A-104'});
    if (!priorToolCalls.some((call) => call.name === 'get_orders')) return step('get_orders', {customer_id: 'A-104'});
    if (!priorToolCalls.some((call) => call.name === 'check_refund_eligibility')) return step('check_refund_eligibility', {order_id: 'ORD-7821'});
    return done('Customer A-104 (Alex, active) has order ORD-7821 (delivered). Refund check: eligible for \u20B91,500 INR. As instructed, no refund has been issued.');
  }

  // cap-07: inspect once, then ask the single most important clarification.
  if (/stale production branch/i.test(user)) {
    if (!priorToolCalls.length) return step('list_branches', {});
    return done('I will not delete anything yet. Which branch do you mean? Please confirm the exact branch name and your definition of stale.');
  }

  // cap-01: constraint satisfaction.
  if (/four deployment tasks/i.test(user)) {
    return done('The only valid schedule is B \u2192 A \u2192 C \u2192 D: B at 09:00, A at 10:00, C at 11:00, D at 12:00. The solution is unique; every other ordering violates a constraint.');
  }

  // cap-02: exact cost calculation.
  if (/total API inference cost/i.test(user)) {
    return done('Normal input tokens: 240000 - 48000 = 192000; cost = 192000 \u00D7 $0.20 per million = $0.0384. Cached input: 48000 \u00D7 $0.02 per million = $0.00096. Output: 60000 \u00D7 $0.80 per million = $0.048. Total cost = $0.08736 USD.');
  }

  // cap-03: reliability product, five decimal places.
  if (/calculate system availability/i.test(user)) {
    return done('System availability is the product of the independent availabilities: 0.9995 \u00D7 0.9990 \u00D7 0.9999 = 0.99840065, i.e. 99.84007% to five decimal places. Averaging is incorrect because all three services must be operational simultaneously; with no redundancy the joint availability is the product, not the mean of the individual percentages.');
  }

  // cap-04: generic TypeScript chunk.
  if (/implement a generic function/i.test(user)) {
    return done([
      'function chunk<T>(items: T[], size: number): T[][] {',
      '  if (!Number.isInteger(size) || size <= 0 || !Number.isFinite(size)) {',
      "    throw new RangeError('size must be a positive finite integer');",
      '  }',
      '  if (items.length === 0) return [];',
      '  const result: T[][] = [];',
      '  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));',
      '  return result;',
      '}',
      '// Time complexity: O(n). Space complexity: O(n). No mutation: slice copies, push targets the new array.',
      "describe('chunk', () => {",
      "  it('returns an empty array for empty input', () => { /* expect(chunk([], 2)).toEqual([]) */ });",
      "  it('rejects zero, negative, non-integer and non-finite sizes', () => { /* expect(() => chunk([1], 0)).toThrow() */ });",
      "  it('keeps the final chunk short and preserves order', () => { /* ... */ });",
      '});',
    ].join('\n'));
  }

  // cap-05: debugging the retryable predicate.
  if (/isRetryable/i.test(user)) {
    return done([
      'Defects: `status >= 400 || status < 500` is a tautology — it is always true, because every number is either >= 400 or < 500, so the function returns true for every status (including 200 and 600) and the `status === 429` comparison is unreachable.',
      'Corrected version (policy: retry 408, 429 and valid 5xx only):',
      'function isRetryable(status: number): boolean {',
      '  return status === 408 || status === 429 || (status >= 500 && status <= 599);',
      '}',
      'Unit tests:',
      "describe('isRetryable', () => {",
      "  it('returns true for 408, 429, 500 and 503', () => { /* ... */ });",
      "  it('returns false for 200, 400, 401 and 600', () => { /* ... */ });",
      '});',
    ].join('\n'));
  }

  // cap-06: abstention, no fabricated market data.
  if (/SOLUSDT/i.test(user)) {
    return done('The current SOLUSDT price and any directional probability are unknown: no market-data API was called, no live price was supplied, no historical candle data was supplied, and no indicators or predictive model were run. Missing information: a live price feed, historical candles, indicator values and a calibrated predictive model. Without them, a directional probability cannot be computed. NO_TRADE');
  }

  // cap-08: strict JSON extraction.
  if (/Invoice number: INV-/i.test(user)) {
    return done('{"invoice_number":"INV-2026-091","customer":"ABC Technologies","invoice_date":"2026-10-15","due_date":"2026-11-15","currency":"INR","subtotal":125000,"tax":22500,"discount":5000,"total":142500,"calculated_total":142500,"is_total_valid":true}');
  }

  // cap-11: long-context retrieval with a null for the absent value.
  if (/technical document containing/i.test(user)) {
    return done([
      '```json',
      '{"production_database":"orders_prod","max_retry_count":5,"request_timeout_ms":30000,"deployment_region":"ap-south-1","api_version":null}',
      '```',
      'Sources: Section 2 (production database), Section 7 (maximum retry count), Section 12 (gateway request timeout), Section 15 (deployment region). The document does not state an API version.',
    ].join('\n'));
  }

  // cap-12: plan-only response, no tool calls, no file modification.
  if (/paginated orders/i.test(user)) {
    return done([
      'Execution plan (no files modified yet):',
      'Step 1. Objective: inspect the existing architecture. Tool: list_files on the controllers/routes tree. Expected output: file layout. Verification: the orders controller and route files are located. Failure recovery: search_code for "orders" if the layout is unclear.',
      'Step 2. Objective: understand the current endpoint. Tool: read_file on the orders controller. Verification: current pagination behavior and backward-compatibility constraints identified.',
      'Step 3. Objective: locate existing queries. Tool: search_code for order queries. Verification: N+1 risks and existing scopes identified.',
      'Step 4. Objective: implement GET /api/v1/orders with page and per_page (maximum page size 100), status filter and created_at date range on PostgreSQL, avoiding N+1 queries.',
      'Step 5. Objective: add request validation for page, per_page, status and created_at.',
      'Step 6. Objective: add RSpec tests covering pagination edge cases (page 0, per_page above 100, empty results, date-range boundaries). Tool: run_tests. Verification: the suite is green.',
      'Step 7. Objective: verify backward compatibility and query performance before declaring success.',
      'Assumptions: Rails-style stack with a PostgreSQL database. Dependencies: existing order model and query scopes. edit_file is used only after this plan is confirmed.',
    ].join('\n'));
  }

  return undefined;
}

function finalText(prompt: string) {
  if (/weather and .*time/i.test(prompt)) return 'The weather and local time were retrieved and summarized.';
  if (/account balance/i.test(prompt)) return 'The final account balance result was summarized.';
  if (/repository status/i.test(prompt)) return 'The failing test and relevant file were inspected and a minimal non-mutating fix was summarized.';
  if (/tool calling/i.test(prompt)) return 'The tool-calling constraint was identified from documentation and the relevant file.';
  if (/price/i.test(prompt)) return 'The requested price was retrieved and summarized.';
  return 'The requested result was completed.';
}
