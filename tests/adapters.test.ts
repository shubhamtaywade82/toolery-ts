import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OllamaAdapter, OpenAICompatibleAdapter } from '../src/runners/adapters.js';

// Wire-level adapter tests against a local node:http mock server — never a real
// endpoint (see memory.md L-68 offline testing pattern). These guard the
// ollama-sdk >= 1.8 upgrade: tool-result messages must carry `tool_name`
// (the SDK strips `tool_call_id` from the native wire since 1.4), and options
// must still carry num_ctx/seed/temperature/keep_alive.

interface RecordedRequest { url: string; body: Record<string, unknown>; }

function startOllamaMock(): Promise<{ server: http.Server; requests: RecordedRequest[]; url: string }> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url ?? '', body: JSON.parse(raw || '{}') });
      const messages = (requests.at(-1)!.body.messages ?? []) as Array<{ role: string }>;
      const hasToolResult = messages.some((m) => m.role === 'tool');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: 'test-model',
        created_at: new Date().toISOString(),
        message: hasToolResult
          ? { role: 'assistant', content: 'The weather is sunny.' }
          : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_weather', arguments: { location: 'Bengaluru', date: 'today' } } }] },
        done: true,
        done_reason: hasToolResult ? 'stop' : 'tool_calls',
        total_duration: 1_500_000_000,
        prompt_eval_count: 42,
        eval_count: 7,
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, requests, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('ollama adapter sends tool_name on tool-result messages (sdk >= 1.8 wire contract)', async () => {
  const { server, requests, url } = await startOllamaMock();
  try {
    const adapter = new OllamaAdapter({ baseUrl: url, timeoutMs: 5000, numCtx: 4096, keepAlive: '15m' });
    const request = {
      model: 'test-model',
      messages: [
        { role: 'user' as const, content: 'Weather in Bengaluru?' },
      ],
      tools: [{
        name: 'get_weather', description: 'Get weather.',
        parameters: { type: 'object' as const, properties: { location: { type: 'string' } }, required: ['location'] },
      }],
      temperature: 0,
    };
    const first = await adapter.complete(request);
    assert.equal(first.toolCalls.length, 1);
    assert.equal(first.toolCalls[0]?.name, 'get_weather');
    assert.equal(first.inputTokens, 42);
    assert.equal(first.outputTokens, 7);
    assert.equal(first.finishReason, 'tool_calls');
    assert.ok(Math.abs(first.durationMs - 1500) < 1, `durationMs should map total_duration, got ${first.durationMs}`);

    const second = await adapter.complete({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant' as const, content: '', toolCalls: first.toolCalls },
        { role: 'tool' as const, toolCallId: first.toolCalls[0]?.id, name: 'get_weather', content: '{"temp":25}' },
      ],
    });
    assert.equal(second.text, 'The weather is sunny.');
    assert.equal(second.toolCalls.length, 0);

    // First request: options + keep_alive on the wire.
    const firstBody = requests[0]!.body;
    assert.deepEqual(firstBody.options, { temperature: 0, num_ctx: 4096, seed: 0 });
    assert.equal(firstBody.keep_alive, '15m');

    // Second request: the tool message must identify itself via tool_name
    // (ollama-sdk >= 1.4 strips tool_call_id from the native wire).
    const toolMessages = (requests[1]!.body.messages as Array<Record<string, unknown>>).filter((m) => m.role === 'tool');
    assert.equal(toolMessages.length, 1);
    assert.equal(toolMessages[0]!.tool_name, 'get_weather');
    assert.equal(toolMessages[0]!.tool_call_id, undefined, 'SDK must strip tool_call_id from native wire');
    assert.equal(toolMessages[0]!.content, '{"temp":25}');
  } finally {
    server.close();
  }
});

test('ollama adapter normalizes /v1 base urls to the native endpoint', async () => {
  const { server, requests, url } = await startOllamaMock();
  try {
    const adapter = new OllamaAdapter({ baseUrl: `${url}/v1`, timeoutMs: 5000 });
    await adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [], temperature: 0 });
    assert.ok(requests[0]!.url.startsWith('/api/chat'), `expected native /api/chat, got ${requests[0]!.url}`);
  } finally {
    server.close();
  }
});

test('openai adapter reports http status for non-json error bodies instead of a SyntaxError', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end('<html><body>Bad Gateway</body></html>');
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address() as AddressInfo;
  try {
    const adapter = new OpenAICompatibleAdapter({ baseUrl: `http://127.0.0.1:${port}/v1`, timeoutMs: 5000 });
    await assert.rejects(
      adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [], temperature: 0 }),
      /returned 502/,
      'error should carry the HTTP status, not an opaque JSON parse failure',
    );
  } finally {
    server.close();
  }
});
