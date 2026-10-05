import assert from 'node:assert/strict';
import test from 'node:test';
import { mcnemar, timeDecay, weightedScore } from '../src/statistics.js';
import { parseConfig } from '../src/utils/config.js';

test('mcnemar exact p-value for small discordant counts', () => {
  // 8 discordant pairs (2 aWins, 6 bWins): exact two-sided binomial p = 2*P(X<=2), X~Bin(8,0.5) = 74/256 = 0.2890625
  const a = [true, true, false, false, false, false, false, false, true, true, true, true, true, true];
  const b = [false, false, true, true, true, true, true, true, true, true, true, true, true, true];
  const r = mcnemar(a, b);
  assert.equal(r.discordant, 8);
  assert.equal(r.aWins, 2);
  assert.equal(r.bWins, 6);
  assert.ok(Math.abs((r.mcnemarPValue ?? 0) - 74 / 256) < 1e-9);
});

test('mcnemar returns null p-value when there are no discordant pairs', () => {
  const r = mcnemar([true, false], [true, false]);
  assert.equal(r.mcnemarPValue, null);
  assert.equal(r.discordant, 0);
});

test('mcnemar does not overflow or return NaN for huge discordant counts', () => {
  // 2000 discordant pairs: 2**2000 is Infinity in IEEE doubles; the old exact form
  // silently produced NaN/0. The chi-square approximation must return a finite
  // p-value in [0, 1].
  const n = 2000;
  const a: boolean[] = Array.from({ length: n }, (_, i) => i < 950);
  const b: boolean[] = Array.from({ length: n }, (_, i) => !(i < 950));
  const r = mcnemar(a, b);
  assert.equal(r.discordant, n);
  const p = r.mcnemarPValue;
  assert.ok(p !== null && Number.isFinite(p) && p >= 0 && p <= 1, `p must be finite in [0,1], got ${p}`);
});

test('parseConfig validates keep-alive duration format', () => {
  assert.equal(parseConfig({ keepAlive: '30m' }).keepAlive, '30m');
  assert.equal(parseConfig({ keepAlive: '5s' }).keepAlive, '5s');
  assert.equal(parseConfig({ keepAlive: '1h30m' }).keepAlive, '1h30m');
  assert.equal(parseConfig({ keepAlive: '0' }).keepAlive, '0');
  assert.throws(() => parseConfig({ keepAlive: 'soon' }), /Invalid --keep-alive/);
  assert.throws(() => parseConfig({ keepAlive: '30minutes' }), /Invalid --keep-alive/);
  assert.equal(parseConfig({}).keepAlive, undefined, 'no default at the config layer; the adapter defaults to 30m');
});

test('parseConfig rejects invalid tiers, trials, concurrency and numCtx', () => {
  assert.throws(() => parseConfig({ tier: 'impossible' }), /Invalid tier/);
  assert.throws(() => parseConfig({ trials: 0 }), /Trials/);
  assert.throws(() => parseConfig({ trials: 101 }), /Trials/);
  assert.throws(() => parseConfig({ concurrency: 33 }), /Concurrency/);
  assert.throws(() => parseConfig({ numCtx: 256 }), /numCtx/);
  assert.throws(() => parseConfig({ adapter: 'nonsense' }), /Adapter/);
});

test('parseConfig applies env-var and flag precedence', () => {
  const previous = process.env.TOOLERY_TIER;
  try {
    process.env.TOOLERY_TIER = 'hard';
    assert.equal(parseConfig({}).tier, 'hard');
    assert.equal(parseConfig({ tier: 'easy' }).tier, 'easy');
  } finally {
    if (previous === undefined) delete process.env.TOOLERY_TIER; else process.env.TOOLERY_TIER = previous;
  }
});

test('weightedScore applies tier weights', () => {
  const results = [
    { tier: 'easy' as const, successRate: 1 },
    { tier: 'very-hard' as const, successRate: 0 },
  ];
  // (1*1 + 1.75*0) / (1 + 1.75) = 0.3636...
  assert.ok(Math.abs(weightedScore(results) - 1 / 2.75) < 1e-9);
});

test('timeDecay halves at the half-life', () => {
  assert.ok(Math.abs(timeDecay(14) - 0.5) < 1e-12);
  assert.ok(Math.abs(timeDecay(0) - 1) < 1e-12);
});
