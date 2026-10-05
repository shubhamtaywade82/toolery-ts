// Mock Ollama server to test OllamaAdapter end-to-end wire behavior.
import http from 'node:http';

const seenBodies = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    seenBodies.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    const payload = seenBodies.length;
    // Turn 1: request a tool call. Turn 2: final answer.
    const lastMessages = seenBodies.at(-1).body.messages ?? [];
    const hasToolResult = lastMessages.some((m) => m.role === 'tool');
    const response = {
      model: 'test-model',
      created_at: new Date().toISOString(),
      message: hasToolResult
        ? { role: 'assistant', content: 'The weather in Bengaluru is sunny.' }
        : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_weather', arguments: { location: 'Bengaluru', date: 'today' } } }] },
      done: true,
      done_reason: hasToolResult ? 'stop' : 'tool_calls',
      total_duration: 1234500000,
      prompt_eval_count: 42,
      eval_count: 7,
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });
});

server.listen(11499, async () => {
  try {
    const { OllamaAdapter } = await import('../src/runners/adapters.js');
    const adapter = new OllamaAdapter({
      baseUrl: 'http://localhost:11499',
      timeoutMs: 5000,
      numCtx: 8192,
      keepAlive: '30m',
    });
    const request = {
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are a test.' },
        { role: 'user', content: 'What is the weather in Bengaluru today?' },
      ],
      tools: [{
        name: 'get_weather',
        description: 'Get weather for a location and date.',
        parameters: { type: 'object', properties: { location: { type: 'string' }, date: { type: 'string' } }, required: ['location', 'date'], additionalProperties: false },
      }],
      toolChoice: 'auto',
      temperature: 0,
    };
    const first = await adapter.complete(request);
    console.log('TURN 1 toolCalls:', JSON.stringify(first.toolCalls));
    console.log('TURN 1 durationMs:', first.durationMs, 'inputTokens:', first.inputTokens, 'outputTokens:', first.outputTokens, 'finishReason:', first.finishReason);
    // Build second request as the runner would (assistant tool_call + tool result)
    const secondRequest = {
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: '', toolCalls: first.toolCalls },
        { role: 'tool', toolCallId: first.toolCalls[0]?.id ?? 'call-1', name: 'get_weather', content: '{"temp":25}' },
      ],
    };
    const second = await adapter.complete(secondRequest);
    console.log('TURN 2 text:', JSON.stringify(second.text));
    console.log('TURN 2 toolCalls:', second.toolCalls.length);
    // Print the wire bodies
    for (const [i, b] of seenBodies.entries()) {
      console.log(`\n=== WIRE REQUEST ${i + 1} to ${b.url} ===`);
      console.log('body:', JSON.stringify(b.body, null, 1));
    }
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  }
});
