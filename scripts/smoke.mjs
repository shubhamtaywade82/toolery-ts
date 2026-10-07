// scripts/smoke.mjs — complete offline end-to-end smoke test.
//
// Runs the full quality gate (typecheck, lint, test, build, pack:check), then exercises the
// BUILT CLI against local-only fakes: the scripted mock adapter and an in-process `node:http`
// Ollama stand-in. Never touches a real endpoint (rules.md §7) — safe for CI and laptops.
//
// Usage: npm run smoke — exit 0 only when every stage passes; on failure the temp dir is kept and its path printed.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const TMP = await mkdtemp(path.join(existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'toolery-smoke-'));
const tmp = (name) => path.join(TMP, name);
const skipped = [];

function check(condition, message) { if (!condition) throw new Error(message); }

const tail = (text = '', max = 1500) => (text.length > max ? `…${text.slice(-max)}` : text);

// Strip ambient TOOLERY_* overrides so every stage gets deterministic config;
// redirect run history into the temp dir so smoke runs never touch the repo.
function childEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('TOOLERY_')) delete env[key];
  env.TOOLERY_HISTORY_FILE = tmp('history.json');
  return env;
}

function run(file, args, { cwd = ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, env: childEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
const node = (args, opts) => run(process.execPath, args, opts);
const npmRun = (script) => run('npm', ['run', script]);

function expectExit(res, code, label) {
  if (res.code !== code) throw new Error(`${label}: expected exit ${code}, got ${res.code}\nstdout: ${tail(res.stdout)}\nstderr: ${tail(res.stderr)}`);
}
const expectOk = (res, label) => expectExit(res, 0, label);
function expectContains(res, needle, label) {
  check((res.stdout + res.stderr).includes(needle), `${label}: output must contain ${JSON.stringify(needle)}\nstdout: ${tail(res.stdout)}\nstderr: ${tail(res.stderr)}`);
}

// Local Ollama stand-in: answers /api/tags (probe) and /api/chat (adapter wire).
// The first tool-capable request gets ONE tool call so the CLI run exercises the
// full multi-turn loop (tool result → second wire request); every later request
// answers with plain text so trials terminate after a single round.
function startMockOllama() {
  const requests = [];
  let toolCallEmitted = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'smoke-model' }] }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push({ url: req.url, body });
      const messages = body.messages ?? [];
      const hasToolResult = messages.some((m) => m.role === 'tool');
      const tools = body.tools ?? [];
      const emitToolCall = !hasToolResult && tools.length > 0 && !toolCallEmitted;
      if (emitToolCall) toolCallEmitted = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: body.model ?? 'smoke-model',
        created_at: new Date().toISOString(),
        message: emitToolCall
          ? { role: 'assistant', content: '', tool_calls: [{ function: { name: tools[0].function.name, arguments: {} } }] }
          : { role: 'assistant', content: hasToolResult ? 'The weather is sunny.' : 'ok' },
        done: true,
        done_reason: emitToolCall ? 'tool_calls' : 'stop',
        total_duration: 1_500_000_000,
        prompt_eval_count: 42,
        eval_count: 7,
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, requests, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function closedPort() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const mock = await startMockOllama();
const hasUpstream = existsSync(path.join(ROOT, 'vendor', 'toolery-upstream', 'manifest.json'));
let syntheticEasy;
let upstreamEasy;

async function scenarioCount(source, tier) {
  const res = await node([CLI, 'scenarios', '--source', source, '--tier', tier]);
  expectOk(res, `scenarios --source ${source} --tier ${tier}`);
  return res.stdout.trim().split('\n').filter(Boolean).length;
}
const readSnapshot = async (file) => JSON.parse(await readFile(file, 'utf8'));

const stages = [
  ['gate: typecheck, lint, test, build, pack:check', async () => {
    for (const script of ['typecheck', 'lint', 'test', 'build']) expectOk(await npmRun(script), `npm run ${script}`);
    expectOk(await node([path.join(ROOT, 'scripts', 'pack-check.mjs')]), 'pack:check');
  }],

  ['installed @nemesis-oss/ollama-sdk is on the 1.9.x line', async () => {
    const pkgFile = path.join(ROOT, 'node_modules', '@nemesis-oss', 'ollama-sdk', 'package.json');
    const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
    check(pkg.version.startsWith('1.9.'), `expected @nemesis-oss/ollama-sdk 1.9.x, found ${pkg.version}`);
  }],

  ['cli: profiles + scenario listing', async () => {
    const { PROFILES } = await import(pathToFileURL(path.join(ROOT, 'dist', 'index.js')).href);
    const profiles = await node([CLI, 'profiles']);
    expectOk(profiles, 'profiles');
    const lines = profiles.stdout.trim().split('\n').filter(Boolean);
    check(lines.length > 0 && lines.length === PROFILES.length, `CLI listed ${lines.length} profiles, library exports ${PROFILES.length}`);
    check(lines.every((line) => line.includes('\t')), 'profile lines must be "<id>\\t<description>"');
    const all = await node([CLI, 'scenarios']);
    expectOk(all, 'scenarios');
    check(all.stdout.trim().split('\n').filter(Boolean).length > 0, 'scenario listing is empty');
    syntheticEasy = await scenarioCount('synthetic', 'easy');
    check(syntheticEasy > 0, 'no synthetic easy scenarios');
    if (hasUpstream) {
      upstreamEasy = await scenarioCount('upstream', 'easy');
      check(upstreamEasy > 0, 'no upstream easy scenarios');
    }
  }],

  ['headless mock run — synthetic source', async () => {
    const args = [CLI, 'run', '--headless', '--adapter', 'mock', '--source', 'synthetic', '--tier', 'easy', '--trials', '1', '--output', tmp('mock-synthetic.json')];
    const res = await node(args);
    expectOk(res, 'mock run (synthetic)');
    // Scripted mock covers 39/40 synthetic easy scenarios (B-10 remainder is unscripted by design).
    expectContains(res, 'Success rate: 97.5%', 'mock run (synthetic)');
    const snap = await readSnapshot(tmp('mock-synthetic.json'));
    check(snap.source === 'synthetic', `snapshot source is ${snap.source}`);
    check(snap.results.length === syntheticEasy, `expected ${syntheticEasy} results, got ${snap.results.length}`);
  }],

  ['headless mock run — upstream source', async () => {
    if (!hasUpstream) {
      skipped.push('upstream mock run — vendor pack not synced (run `npm run sync:upstream` once)');
      return;
    }
    const args = [CLI, 'run', '--headless', '--adapter', 'mock', '--source', 'upstream', '--tier', 'easy', '--trials', '1', '--output', tmp('mock-upstream.json')];
    const res = await node(args);
    expectOk(res, 'mock run (upstream)');
    // Upstream contract scoring requires real response text, which the scripted
    // mock never emits — 0.0% is the expected value here, not a regression.
    expectContains(res, 'Success rate: 0.0%', 'mock run (upstream)');
    const snap = await readSnapshot(tmp('mock-upstream.json'));
    check(snap.results.length === upstreamEasy, `expected ${upstreamEasy} results, got ${snap.results.length}`);
  }],

  ['export: snapshot → CSV', async () => {
    const res = await node([CLI, 'export', '--input', tmp('mock-synthetic.json'), '--output', tmp('export.csv')]);
    expectOk(res, 'export');
    const lines = (await readFile(tmp('export.csv'), 'utf8')).trim().split('\n');
    check(lines[0].startsWith('scenarioId,tier,successRate'), `unexpected CSV header: ${lines[0]}`);
    check(lines.length === syntheticEasy + 1, `expected header + ${syntheticEasy} rows, got ${lines.length} lines`);
  }],

  ['resume: full snapshot completes with 0 new runs', async () => {
    const args = [CLI, 'run', '--headless', '--adapter', 'mock', '--source', 'synthetic', '--tier', 'easy', '--trials', '1', '--resume', tmp('mock-synthetic.json'), '--output', tmp('resumed.json')];
    const res = await node(args);
    expectOk(res, 'resume run');
    expectContains(res, `Completed ${syntheticEasy} scenarios`, 'resume run');
    const snap = await readSnapshot(tmp('resumed.json'));
    check(snap.results.length === syntheticEasy, `expected ${syntheticEasy} resumed results, got ${snap.results.length}`);
  }],

  ['probe: live mock server vs closed port', async () => {
    const live = await node([CLI, 'probe', '--base-url', mock.url]);
    expectExit(live, 0, 'probe (live)');
    check(live.stdout.includes('"reachable": true') && live.stdout.includes('smoke-model'), `unexpected probe output: ${tail(live.stdout)}`);
    const dead = await node([CLI, 'probe', '--base-url', `http://127.0.0.1:${await closedPort()}`]);
    expectExit(dead, 1, 'probe (dead port)');
    check(dead.stdout.includes('"reachable": false'), `unexpected probe output: ${tail(dead.stdout)}`);
  }],

  ['wire: built CLI → SDK 1.9 → local Ollama stand-in', async () => {
    mock.requests.length = 0;
    const args = [CLI, 'run', '--headless', '--adapter', 'ollama', '--model', 'smoke-model', '--base-url', mock.url, '--source', 'synthetic', '--tier', 'easy', '--trials', '1', '--output', tmp('wire.json')];
    const res = await node(args);
    expectOk(res, 'wire run');
    check(mock.requests.length >= syntheticEasy, `expected >=${syntheticEasy} /api/chat requests, got ${mock.requests.length}`);
    const first = mock.requests[0].body;
    check(first.model === 'smoke-model', `model on wire: ${first.model}`);
    check(JSON.stringify(first.options) === JSON.stringify({ temperature: 0, num_ctx: 8192, seed: 0 }), `options on wire: ${JSON.stringify(first.options)}`);
    check(first.keep_alive === '30m', `keep_alive on wire: ${first.keep_alive}`);
    check(['system', 'user'].includes(first.messages?.[0]?.role), `first message role: ${first.messages?.[0]?.role}`);
    const toolsWellFormed = Array.isArray(first.tools) && first.tools.length > 0
      && first.tools.every((t) => t.type === 'function' && typeof t.function?.name === 'string');
    check(toolsWellFormed, 'tool catalog not normalized on the wire');
    // The first tool-capable scenario must round-trip a tool-result message.
    const toolMsg = mock.requests.map((r) => (r.body.messages ?? []).find((m) => m.role === 'tool')).find(Boolean);
    check(toolMsg, 'no tool-result message ever reached the wire');
    check(typeof toolMsg.tool_name === 'string' && toolMsg.tool_name.length > 0, 'tool result must carry tool_name');
    check(!('tool_call_id' in toolMsg), 'SDK must strip tool_call_id from the native wire');
    const snap = await readSnapshot(tmp('wire.json'));
    check(snap.results.length === syntheticEasy, `expected ${syntheticEasy} wire results, got ${snap.results.length}`);
  }],

  ['wire: deterministic multi-turn tool round trip (dist OllamaAdapter)', async () => {
    const { OllamaAdapter } = await import(pathToFileURL(path.join(ROOT, 'dist', 'index.js')).href);
    const adapter = new OllamaAdapter({ baseUrl: mock.url, timeoutMs: 5000 }); // defaults: num_ctx 8192, keep_alive 30m
    mock.requests.length = 0;
    const response = await adapter.complete({
      model: 'smoke-model',
      messages: [
        { role: 'user', content: 'Weather in Bengaluru?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { location: 'Bengaluru' } }] },
        { role: 'tool', toolCallId: 'call_1', name: 'get_weather', content: '{"temp":25}' },
      ],
      tools: [{ name: 'get_weather', description: 'Get weather.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } }],
      temperature: 0,
    });
    check(response.text === 'The weather is sunny.', `unexpected response text: ${JSON.stringify(response.text)}`);
    const body = mock.requests.at(-1)?.body;
    check(body, 'adapter request never reached the mock server');
    const toolMsg = body.messages.find((m) => m.role === 'tool');
    check(toolMsg?.tool_name === 'get_weather', `tool_name missing on wire: ${JSON.stringify(toolMsg)}`);
    check(!('tool_call_id' in toolMsg), 'SDK must strip tool_call_id from the native wire');
    check(toolMsg.content === '{"temp":25}', `tool result content mangled on wire: ${JSON.stringify(toolMsg.content)}`);
    check(JSON.stringify(body.options) === JSON.stringify({ temperature: 0, num_ctx: 8192, seed: 0 }), `options on wire: ${JSON.stringify(body.options)}`);
    check(body.keep_alive === '30m', `keep_alive on wire: ${body.keep_alive}`);
  }],

  ['cli: works from a foreign cwd (B-17 regression)', async () => {
    const here = await node([CLI, 'scenarios']);
    expectOk(here, 'scenarios (repo cwd)');
    const there = await node([CLI, 'scenarios'], { cwd: TMP });
    expectOk(there, 'scenarios (foreign cwd)');
    const count = (r) => r.stdout.trim().split('\n').filter(Boolean).length;
    check(count(here) > 0 && count(there) === count(here), `foreign cwd listed ${count(there)} scenarios, repo cwd ${count(here)}`);
  }],

  ['failure paths exit non-zero', async () => {
    const noModel = await node([CLI, 'run', '--headless', '--adapter', 'ollama', '--source', 'synthetic', '--tier', 'easy']);
    expectExit(noModel, 1, 'run without --model');
    expectContains(noModel, 'A --model is required', 'run without --model');

    const args = [CLI, 'run', '--headless', '--adapter', 'mock', '--source', 'synthetic', '--tier', 'medium', '--trials', '1', '--resume', tmp('mock-synthetic.json'), '--output', tmp('should-not-exist.json')];
    const tierMismatch = await node(args);
    expectExit(tierMismatch, 1, 'resume with mismatched tier');
    expectContains(tierMismatch, 'Resume tier', 'resume with mismatched tier');
    check(!existsSync(tmp('should-not-exist.json')), 'failed resume must not write an output snapshot');

    const exportNoInput = await node([CLI, 'export', '--output', tmp('nope.csv')]);
    expectExit(exportNoInput, 1, 'export without --input');
    expectContains(exportNoInput, 'export requires', 'export without --input');
  }],
];

let failure;
for (const [name, stage] of stages) {
  console.log(`== ${name}`);
  try {
    await stage();
    console.log(`   ok — ${name}\n`);
  } catch (error) {
    failure = { name, error };
    break;
  }
}
await new Promise((resolve) => mock.server.close(resolve));

if (failure) {
  console.error(`SMOKE FAILED at stage: ${failure.name}`);
  console.error(failure.error?.stack ?? failure.error);
  console.error(`\nArtifacts kept for inspection: ${TMP}`);
  process.exit(1);
}
for (const reason of skipped) console.warn(`SKIPPED: ${reason}`);
await rm(TMP, { recursive: true, force: true });
console.log(`SMOKE PASSED — ${stages.length} stages${skipped.length ? ` (${skipped.length} skipped)` : ''}`);
