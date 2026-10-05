import assert from 'node:assert/strict';
import test from 'node:test';
import { MockAdapter } from '../src/runners/adapters.js';

const adapter = new MockAdapter();

test('mock adapter extracts the location without trailing date words', async () => {
  const cases: Array<[string, string]> = [
    ['What is the weather in Bengaluru today?', 'Bengaluru'],
    ['What is the weather in New York?', 'New York'],
    ['weather in Paris', 'Paris'],
    ['Tell me the weather in San Francisco tomorrow please.', 'San Francisco'],
  ];
  for (const [prompt, expectedLocation] of cases) {
    const res = await adapter.complete({ model: 'm', messages: [{ role: 'user', content: prompt }], tools: [], temperature: 0 });
    const call = res.toolCalls.find(c => c.name === 'get_weather');
    assert.ok(call, `get_weather should be called for: ${prompt}`);
    assert.deepEqual(call.arguments, { location: expectedLocation, date: 'today' });
  }
});

test('mock adapter keeps timezone and symbol extraction stable', async () => {
  const time = await adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'What time is it in America/New_York?' }], tools: [], temperature: 0 });
  assert.deepEqual(time.toolCalls.find(c => c.name === 'get_current_time')?.arguments, { timezone: 'America/New_York' });

  const crypto = await adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'Get the current price of ETHUSDT.' }], tools: [], temperature: 0 });
  assert.deepEqual(crypto.toolCalls.find(c => c.name === 'get_crypto_price')?.arguments, { symbol: 'ETHUSDT' });
});
