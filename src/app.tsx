import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import {
  Page, Tabs, Panel, Columns, KeyValue, Badge, Pill, ProgressBar,
  Spinner, StatusMessage, Alert, Table, SelectableRow, TextInput,
  Select, MultiSelect, UnorderedList, type Column
} from '@kud/ink-ui';
import { BenchmarkService } from './benchmark.js';
import { loadScenarios } from './scenarios.js';
import { PROFILES } from './profiles.js';
import { probeEndpoint } from './probe.js';
import { formatSummary } from './export.js';
import { buildRanking } from './rankings.js';
import { appendHistory, loadHistory, type HistoryRun } from './history.js';
import { runLlamaBenchy } from './perf.js';
import { detectScenarioSource } from './utils/config.js';
import type { BenchmarkConfig, BenchmarkSummary, HealthProbe, RunResult, Scenario, TrialResult, CapabilityName, Tier, AdapterKind, ExpectedToolCall } from './types.js';

type Tab = 'Home' | 'Scenarios' | 'Run' | 'Results' | 'Rankings' | 'Compare' | 'Profiles' | 'History' | 'Settings';
const TABS = ['Home', 'Scenarios', 'Run', 'Results', 'Rankings', 'Compare', 'Profiles', 'History', 'Settings'] as const;
const PRESETS = [
  { id: 'ollama', name: 'Ollama Native (Local)', baseUrl: 'http://localhost:11434', adapter: 'ollama' },
  { id: 'ollama-v1', name: 'Ollama OpenAI /v1 (Local)', baseUrl: 'http://localhost:11434/v1', adapter: 'openai-compatible' },
  { id: 'lmstudio', name: 'LMStudio (Local)', baseUrl: 'http://localhost:1234/v1', adapter: 'openai-compatible' },
  { id: 'vllm', name: 'vLLM (Local)', baseUrl: 'http://localhost:8000/v1', adapter: 'openai-compatible' },
  { id: 'openrouter', name: 'OpenRouter (Cloud)', baseUrl: 'https://openrouter.ai/api/v1', adapter: 'openai-compatible' },
  { id: 'openai', name: 'OpenAI Official', baseUrl: 'https://api.openai.com/v1', adapter: 'openai-compatible' },
  { id: 'groq', name: 'Groq Cloud', baseUrl: 'https://api.groq.com/openai/v1', adapter: 'openai-compatible' },
  { id: 'mock', name: 'Mock Adapter (Testing)', baseUrl: 'http://localhost:11434/v1', adapter: 'mock' },
  { id: 'custom', name: 'Custom Endpoint', baseUrl: '', adapter: 'openai-compatible' },
] as const;
const FIELDS = [
  { id: 'preset', label: 'Preset Provider' }, { id: 'model', label: 'Model(s)' },
  { id: 'adapter', label: 'Adapter' }, { id: 'tier', label: 'Tier' },
  { id: 'baseUrl', label: 'Base URL' }, { id: 'apiKey', label: 'API Key' },
  { id: 'trials', label: 'Trials' }, { id: 'concurrency', label: 'Concurrency' },
  { id: 'timeoutMs', label: 'Timeout' }, { id: 'numCtx', label: 'Context Window' },
  { id: 'withPerf', label: 'Perf Checks' },
] as const;
const ADAPTER_OPTIONS = [
  { label: 'Ollama Native (/api/chat)', value: 'ollama' },
  { label: 'OpenAI-Compatible (/v1)', value: 'openai-compatible' },
  { label: 'Mock Adapter (Testing)', value: 'mock' },
  { label: 'Cloud Provider (Groq/OpenRouter)', value: 'cloud' },
  { label: 'Raw Completion Adapter', value: 'raw' },
  { label: 'Hermes Native Format', value: 'hermes' }
];
const TIER_OPTIONS = [
  { label: 'All Tiers (143 scenarios)', value: 'all' },
  { label: 'Easy (Basic parameter match)', value: 'easy' },
  { label: 'Medium (Multi-turn tracking)', value: 'medium' },
  { label: 'Hard (Adversarial & recovery)', value: 'hard' },
  { label: 'Very Hard (Agentic planning)', value: 'very-hard' }
];
const TRIALS_OPTIONS = [
  { label: '1 trial per scenario', value: '1' },
  { label: '3 trials (Standard)', value: '3' },
  { label: '5 trials (Thorough)', value: '5' },
  { label: '10 trials (Deep check)', value: '10' }
];
const CONCURRENCY_OPTIONS = [
  { label: '1 worker (Sequential)', value: '1' },
  { label: '2 concurrent workers', value: '2' },
  { label: '4 concurrent workers', value: '4' },
  { label: '8 concurrent workers', value: '8' }
];
const TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: '30000' },
  { label: '60 seconds (1m)', value: '60000' },
  { label: '180 seconds (3m - default)', value: '180000' },
  { label: '300 seconds (5m)', value: '300000' }
];
const NUM_CTX_OPTIONS = [
  { label: '4k tokens (4,096)', value: '4096' },
  { label: '8k tokens (8,192 - default)', value: '8192' },
  { label: '16k tokens (16,384)', value: '16384' },
  { label: '32k tokens (32,768)', value: '32768' },
  { label: '64k tokens (65,536)', value: '65536' }
];
const CAPS: CapabilityName[] = ['agenticPlanning', 'parameterPrecision', 'stateTracking', 'instructionFollowing', 'restraint', 'errorRecovery', 'calibration', 'correctness'];

function maskKey(key?: string): string {
  if (!key) return '(none)';
  return key.length <= 8 ? '••••••••' : `••••••••${key.slice(-4)}`;
}
function tierTone(tier?: string): 'info' | 'success' | 'warning' | 'error' {
  return tier === 'easy' ? 'success' : tier === 'medium' ? 'info' : tier === 'hard' ? 'warning' : 'error';
}
function findPreset(c: BenchmarkConfig): string {
  const clean = (u?: string) => (u || '').replace(/\/$/, '');
  const match = PRESETS.find(p => p.adapter === c.adapter && clean(p.baseUrl) === clean(c.baseUrl));
  return match?.id ?? PRESETS.find(p => p.adapter === c.adapter)?.id ?? 'custom';
}
function sanitizeCfg(c: BenchmarkConfig): BenchmarkConfig {
  const adapter = c?.adapter ?? 'ollama';
  const baseUrl = c?.baseUrl ?? (adapter === 'ollama' ? 'http://localhost:11434' : 'http://localhost:11434/v1');
  return {
    ...c, benchmarkVersion: c?.benchmarkVersion ?? '1.0.0', endpointPath: c?.endpointPath ?? '/chat/completions',
    source: c?.source ?? detectScenarioSource(), withPerf: c?.withPerf ?? false, trials: c?.trials ?? 3,
    concurrency: c?.concurrency ?? 1, timeoutMs: c?.timeoutMs ?? 180_000, numCtx: c?.numCtx ?? 8192,
    keepAlive: c?.keepAlive, baseUrl, adapter
  };
}

function useProbeState(baseUrl: string, apiKey?: string) {
  const [probe, setProbe] = useState<HealthProbe>({ reachable: false, latencyMs: 0, baseUrl, models: [] });
  const [probing, setProbing] = useState(false);
  async function trigger(url = baseUrl, key = apiKey) {
    setProbing(true);
    try {
      const res = await probeEndpoint(url, key);
      setProbe(res); return res;
    } catch {
      setProbe({ reachable: false, latencyMs: 0, baseUrl: url, models: [], error: 'Probe failed' }); return null;
    } finally { setProbing(false); }
  }
  useEffect(() => { void trigger(baseUrl, apiKey); }, []);
  return { probe, probing, trigger };
}

function useRunner(cfg: BenchmarkConfig, scenarios: Scenario[], onLog?: (msg: string) => void) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [current, setCurrent] = useState<RunResult | undefined>();
  const [summary, setSummary] = useState<BenchmarkSummary | undefined>();
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => { void loadHistory().then(setHistory); }, []);

  async function execute(modelsToRun: string[]) {
    setRunning(true); setResults([]); setCurrent(undefined); setSummary(undefined); setError(undefined);
    try {
      for (const targetModel of modelsToRun) {
        onLog?.(`[${new Date().toLocaleTimeString()}] Benchmarking: ${targetModel} (${scenarios.length} scenarios)`);
        const mCfg = { ...cfg, model: targetModel };
        const service = new BenchmarkService(mCfg);
        const result = await service.run(scenarios, (_c, _t, item) => {
          setCurrent(item);
          setResults(prev => [...prev, item]);
          const last = item.trials.at(-1);
          const dur = ((last?.durationMs ?? 0) / 1000).toFixed(1);
          onLog?.(`[${new Date().toLocaleTimeString()}] [${last?.success ? 'PASS' : 'FAIL'}] ${item.scenarioId} (${item.tier}) · ${last?.toolCalls.length ?? 0} calls · ${dur}s`);
        });
        setResults(result.results); setSummary(result.summary);
        onLog?.(`[${new Date().toLocaleTimeString()}] Done: ${result.summary.passedTrials}/${result.summary.trials} passed (${(result.summary.successRate * 100).toFixed(0)}%)`);
        // Optional llama-benchy throughput pass (opt-in via Settings "Perf Checks").
        // Failures (missing uvx/llama-benchy) are logged, never fatal to the benchmark.
        if (mCfg.withPerf && mCfg.adapter !== 'mock' && targetModel !== 'mock') {
          onLog?.(`[${new Date().toLocaleTimeString()}] Running llama-benchy throughput checks for ${targetModel}...`);
          try {
            const perf = await runLlamaBenchy(targetModel, mCfg.baseUrl);
            for (const p of perf) onLog?.(`[perf] ${targetModel} depth=${p.contextDepth ?? '—'} gen=${p.generationTokensPerSecond !== undefined ? `${p.generationTokensPerSecond.toFixed(1)} tok/s` : 'n/a'}`);
          } catch (err) {
            onLog?.(`[perf] skipped: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        await appendHistory({
          runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: new Date().toISOString(),
          model: mCfg.model, adapter: mCfg.adapter, source: mCfg.source, tier: mCfg.tier, profile: mCfg.profile,
          cluster: mCfg.cluster, summary: result.summary, results: result.results
        });
        setHistory(await loadHistory());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onLog?.(`[${new Date().toLocaleTimeString()}] Error: ${msg}`);
    } finally { setRunning(false); }
  }
  return { running, results, current, summary, history, error, execute };
}

interface AppNavProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  editing: boolean;
  exitPending: boolean;
  setExitPending: React.Dispatch<React.SetStateAction<boolean>>;
  onRun: () => void;
  onProbe: () => void;
  onCycleModel: () => void;
}
function useAppNav({ tab, setTab, editing, exitPending, setExitPending, onRun, onProbe, onCycleModel }: AppNavProps) {
  const { exit } = useApp();
  useInput((input, key) => {
    // Require double Ctrl+C or 'c' to exit, preventing accidental termination
    if (key.ctrl && input === 'c') return exitPending ? exit() : setExitPending(true);
    if (exitPending) {
      if (input === 'c' || input === 'q') return exit();
      setExitPending(false);
      if (key.escape) return;
    }
    if (editing) return;
    // Esc navigates back to Home rather than terminating the application
    if (key.escape) { if (tab !== 'Home') setTab('Home'); return; }
    if (input === 'q') return exit();
    if (input === 'r') return onRun();
    if (input === 's') return setTab('Settings');
    if (input === 'p') return onProbe();
    if (input === 'm') return onCycleModel();
    if (key.tab || key.rightArrow) { const i = TABS.indexOf(tab); if (i >= 0) setTab(TABS[(i + 1) % TABS.length]); }
    if (key.leftArrow) { const i = TABS.indexOf(tab); if (i >= 0) setTab(TABS[(i - 1 + TABS.length) % TABS.length]); }
  });
}

function getHints(tab: Tab, editing: boolean, exitPending = false): [string, string][] {
  if (exitPending) return [['Ctrl+C / c', 'Confirm Exit'], ['Esc', 'Cancel']];
  if (editing) return [['Enter', 'Confirm/Save'], ['Space', 'Toggle'], ['Esc', 'Cancel']];
  if (tab === 'Settings') return [['↑/↓', 'Select'], ['Enter', 'Open Dialog'], ['p', 'Probe'], ['r', 'Run']];
  return [['←/→', 'Tabs'], ['s', 'Settings'], ['p', 'Probe'], ['m', 'Model'], ['r', 'Run']];
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ').slice(0, 70);
}

function formatExpectedCall(call: ExpectedToolCall): string {
  const args = Object.entries(call.arguments || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  return `${call.name}(${args.slice(0, 60)})`;
}

function ActivityLogPanel({ logs }: { logs: string[] }) {
  return (
    <Panel title="📜 Activity & Execution Log">
      <Box flexDirection="column">
        {logs.slice(-12).map((log, i) => (
          <Text key={i} dimColor={i < logs.length - 3} color={log.includes('FAIL') ? 'red' : log.includes('PASS') ? 'green' : log.includes('ONLINE') ? 'cyan' : undefined}>
            {log}
          </Text>
        ))}
      </Box>
    </Panel>
  );
}

function TranscriptStreamPanel({ trial }: { trial?: TrialResult }) {
  if (!trial?.trace?.length) return null;
  return (
    <Panel title={`💬 Turn-by-Turn Conversation Transcript (${trial.trace.length} turns)`}>
      <Box flexDirection="column">
        {trial.trace.slice(-5).map((msg, i) => {
          const roleColor = msg.role === 'user' ? 'yellow' : msg.role === 'assistant' ? 'blue' : msg.role === 'tool' ? 'magenta' : 'gray';
          const content = msg.content ? (msg.content.length > 180 ? `${msg.content.slice(0, 180)}…` : msg.content) : '';
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text bold color={roleColor}>[{msg.role.toUpperCase()}]{msg.name ? ` (${msg.name})` : ''}:</Text>
              {content ? <Text wrap="wrap">{"  "}{content}</Text> : null}
              {msg.toolCalls?.map((tc, j) => (
                <Text key={j} color="green">
                  {"  "}↳ call: {tc.name}({formatArgs(tc.arguments)})
                </Text>
              ))}
            </Box>
          );
        })}
      </Box>
    </Panel>
  );
}

interface LiveTranscriptPanelProps {
  scenario?: Scenario;
  trial?: TrialResult;
  running?: boolean;
}

function LiveTranscriptPanel({ scenario, trial, running }: LiveTranscriptPanelProps) {
  if (!trial && !running) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>No tool trace yet. Press [r] to start benchmark execution.</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">Capabilities & Live Diagnostics:</Text>
          <Text dimColor>• Real-time model reasoning, prompt playback, and multi-turn traces</Text>
          <Text dimColor>• Strict tool contract validation with JSON argument matching</Text>
          <Text dimColor>• Detailed failure diagnosis showing missing, extra, or mismatched calls</Text>
        </Box>
      </Box>
    );
  }
  const promptText = scenario?.prompt || trial?.trace?.find(m => m.role === 'user')?.content || '(no prompt)';
  const modelText = trial?.text || trial?.trace?.find(m => m.role === 'assistant')?.content || '';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">User Prompt:</Text>
        <Text wrap="wrap">"{promptText.length > 220 ? `${promptText.slice(0, 220)}…` : promptText}"</Text>
      </Box>
      {modelText ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="blue">Model Response / Thought:</Text>
          <Text wrap="wrap">{modelText.length > 220 ? `${modelText.slice(0, 220)}…` : modelText}</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Tool Invocations ({trial?.toolCalls.length ?? 0} observed):</Text>
        {trial?.toolCalls.length ? (
          trial.toolCalls.slice(-4).map((call, idx) => (
            <Text key={idx} color="green">
              {"  "}→ {call.name}({formatArgs(call.arguments)}){call.latencyMs !== undefined ? ` [${call.latencyMs}ms]` : ''}
            </Text>
          ))
        ) : (
          <Text dimColor>  (No tool calls observed)</Text>
        )}
      </Box>
      {trial && (
        <Box flexDirection="column">
          <KeyValue label="Outcome" value={<Badge variant={trial.success ? 'success' : 'error'}>{trial.success ? 'PASS' : 'FAIL'}</Badge>} labelWidth={14} />
          <KeyValue label="Arg Accuracy" value={`${(trial.toolCallScore.argumentAccuracy * 100).toFixed(0)}%`} labelWidth={14} />
          <KeyValue label="Tokens" value={`${trial.inputTokens ?? '—'} prompt / ${trial.outputTokens ?? '—'} completion`} labelWidth={14} />
          {!trial.success && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="red">Diagnostics & Contract Violations:</Text>
              {trial.toolCallScore.missing.length > 0 && (
                <Text color="red">{"  "}✕ Missing expected: {trial.toolCallScore.missing.map(formatExpectedCall).join('; ')}</Text>
              )}
              {trial.toolCallScore.argumentAccuracy < 1 && trial.toolCallScore.missing.length === 0 && (
                <Text color="yellow">{"  "}⚠ Argument mismatch (accuracy: {(trial.toolCallScore.argumentAccuracy * 100).toFixed(0)}%)</Text>
              )}
              {trial.toolCallScore.extra.length > 0 && (
                <Text color="red">{"  "}✕ Extra / unexpected calls: {trial.toolCallScore.extra.map(c => c.name).join(', ')}</Text>
              )}
              {trial.error && <Text color="red">{"  "}✕ Error: {trial.error}</Text>}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function renderSelectDialog({ title, description, options, defaultValue, onSubmit, onClose }: {
  title: string; description: string; options: Array<{ label: string; value: string }>;
  defaultValue: string; onSubmit: (val: string) => void; onClose: () => void;
}) {
  return (
    <Panel title={title} focused>
      <Text dimColor>{description}</Text>
      <Box marginTop={1} flexDirection="column">
        <Select options={options} defaultValue={defaultValue} onSubmit={onSubmit} visibleOptionCount={8} />
      </Box>
      <Box marginTop={1}><Text dimColor>[↑/↓] Navigate  [Enter] Select  [Esc] Cancel</Text></Box>
    </Panel>
  );
}

function renderModelDialog({ probe, currentModel, onSubmit }: {
  probe: HealthProbe; currentModel: string; onSubmit: (val: string) => void;
}) {
  const options = [
    { label: `★ all (${probe.models?.length ?? 0} discovered models)`, value: 'all' },
    ...(probe.models ?? []).map(m => ({ label: `● ${m}`, value: m })),
    { label: 'mock (offline mock adapter)', value: 'mock' }
  ];
  const defaults = currentModel === 'all' ? ['all'] : currentModel.split(',').map(s => s.trim()).filter(Boolean);
  return (
    <Panel title="📦 Select Benchmark Model(s)" focused>
      <Text dimColor>Discovered from endpoint. [Space] to toggle, [Enter] to confirm, [Esc] to cancel.</Text>
      <Box marginTop={1} flexDirection="column">
        <MultiSelect options={options} defaultValue={defaults} visibleOptionCount={8} onSubmit={(vals) => {
          const chosen = vals.includes('all') ? 'all' : vals.join(', ') || 'mock';
          onSubmit(chosen);
        }} />
      </Box>
      <Box marginTop={1}><Text dimColor>[Space] Toggle selection  [Enter] Confirm  [Esc] Cancel</Text></Box>
    </Panel>
  );
}

function renderTextDialog({ title, description, defaultValue, onSubmit, onClose }: {
  title: string; description: string; defaultValue: string; onSubmit: (val: string) => void; onClose: () => void;
}) {
  return (
    <Panel title={title} focused>
      <Text dimColor>{description}</Text>
      <Box marginTop={1}>
        <TextInput defaultValue={defaultValue} onSubmit={onSubmit} onCancel={onClose} />
      </Box>
      <Box marginTop={1}><Text dimColor>[Enter] Save  [Esc] Cancel</Text></Box>
    </Panel>
  );
}

interface SettingsDialogProps {
  fieldId: string;
  cfg: BenchmarkConfig;
  setCfg: React.Dispatch<React.SetStateAction<BenchmarkConfig>>;
  presetId: string;
  setPresetId: React.Dispatch<React.SetStateAction<string>>;
  probe: HealthProbe;
  trigger: (url?: string, key?: string) => Promise<HealthProbe | null>;
  onClose: () => void;
}

function SettingsDialog({ fieldId, cfg, setCfg, presetId, setPresetId, probe, trigger, onClose }: SettingsDialogProps) {
  useInput((_input, key) => { if (key.escape) onClose(); });

  if (fieldId === 'model') {
    return renderModelDialog({ probe, currentModel: cfg.model, onSubmit: (m) => { setCfg(c => ({ ...c, model: m })); onClose(); } });
  }
  if (fieldId === 'preset') {
    return renderSelectDialog({
      title: '🔌 Select Preset Provider', description: 'Choose pre-configured endpoint preset.',
      options: PRESETS.map(p => ({ label: `${p.name} (${p.adapter})`, value: p.id })), defaultValue: presetId,
      onSubmit: (val) => {
        setPresetId(val);
        const p = PRESETS.find(x => x.id === val);
        if (p && p.id !== 'custom') { setCfg(c => ({ ...c, baseUrl: p.baseUrl, adapter: p.adapter })); void trigger(p.baseUrl, cfg.apiKey); }
        onClose();
      }, onClose
    });
  }
  if (fieldId === 'adapter') return renderSelectDialog({ title: '⚙ Select Protocol Adapter', description: 'Wire protocol for inference.', options: ADAPTER_OPTIONS, defaultValue: cfg.adapter, onSubmit: (val) => { setCfg(c => ({ ...c, adapter: val as AdapterKind })); onClose(); }, onClose });
  if (fieldId === 'tier') return renderSelectDialog({ title: '🎯 Select Benchmark Tier', description: 'Filter difficulty tier.', options: TIER_OPTIONS, defaultValue: cfg.tier, onSubmit: (val) => { setCfg(c => ({ ...c, tier: val as Tier | 'all' })); onClose(); }, onClose });
  if (fieldId === 'trials') return renderSelectDialog({ title: '🔄 Select Trials per Scenario', description: 'Number of repetitions.', options: TRIALS_OPTIONS, defaultValue: String(cfg.trials), onSubmit: (val) => { setCfg(c => ({ ...c, trials: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'concurrency') return renderSelectDialog({ title: '⚡ Select Concurrency Level', description: 'Simultaneous workers.', options: CONCURRENCY_OPTIONS, defaultValue: String(cfg.concurrency), onSubmit: (val) => { setCfg(c => ({ ...c, concurrency: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'timeoutMs') return renderSelectDialog({ title: '⏱ Select Request Timeout', description: 'Per-request timeout limit.', options: TIMEOUT_OPTIONS, defaultValue: String(cfg.timeoutMs), onSubmit: (val) => { setCfg(c => ({ ...c, timeoutMs: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'numCtx') return renderSelectDialog({ title: '🧠 Select Context Window', description: 'Ollama context length.', options: NUM_CTX_OPTIONS, defaultValue: String(cfg.numCtx ?? 8192), onSubmit: (val) => { setCfg(c => ({ ...c, numCtx: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'baseUrl') return renderTextDialog({ title: '✏ Edit Base URL', description: 'Endpoint URL for inference.', defaultValue: cfg.baseUrl, onSubmit: (v) => { setCfg(c => ({ ...c, baseUrl: v })); void trigger(v, cfg.apiKey); onClose(); }, onClose });
  if (fieldId === 'apiKey') return renderTextDialog({ title: '🔑 Edit API Key', description: 'API bearer token (in-memory only).', defaultValue: cfg.apiKey ?? '', onSubmit: (v) => { setCfg(c => ({ ...c, apiKey: v || undefined })); void trigger(cfg.baseUrl, v || undefined); onClose(); }, onClose });
  return null;
}

export function App({ config }: { config: BenchmarkConfig }) {
  const [cfg, setCfg] = useState(() => sanitizeCfg(config));
  const [tab, setTab] = useState<Tab>('Home');
  const [presetId, setPresetId] = useState<string>(() => findPreset(config));
  const [sfocus, setSfocus] = useState(0);
  const [editing, setEditing] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [logs, setLogs] = useState<string[]>(() => [
    `[${new Date().toLocaleTimeString()}] System ready: Toolery-TS initialized`,
    `[${new Date().toLocaleTimeString()}] Target: ${config.adapter || 'ollama'} at ${config.baseUrl || 'http://localhost:11434'}`
  ]);
  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-30), msg]);

  const scenarios = useMemo(() => loadScenarios(cfg.tier === 'all' ? undefined : cfg.tier), [cfg.tier]);
  const { probe, probing, trigger } = useProbeState(cfg.baseUrl, cfg.apiKey);
  const runner = useRunner(cfg, scenarios, addLog);

  useEffect(() => {
    if (!cfg.model && probe.models?.length) setCfg(c => ({ ...c, model: probe.models![0] }));
    if (probe.reachable) addLog(`[${new Date().toLocaleTimeString()}] Probe: ONLINE (${probe.latencyMs}ms · ${probe.models?.length ?? 0} models)`);
  }, [probe.reachable, probe.models]);

  useEffect(() => {
    if (!exitPending) return;
    const timer = setTimeout(() => setExitPending(false), 2000);
    return () => clearTimeout(timer);
  }, [exitPending]);

  const cycleModel = () => {
    if (!probe.models?.length) return;
    const pool = ['all', ...probe.models];
    const nextModel = pool[(Math.max(0, pool.indexOf(cfg.model)) + 1) % pool.length];
    setCfg(c => ({ ...c, model: nextModel }));
    addLog(`[${new Date().toLocaleTimeString()}] Switched model: ${nextModel}`);
  };
  const startRun = () => {
    if (runner.running) return;
    const models = cfg.model === 'all' ? (probe.models?.length ? probe.models : ['mock']) : cfg.model.split(',').map(m => m.trim()).filter(Boolean);
    void runner.execute(models.length ? models : ['mock']);
  };

  useAppNav({ tab, setTab, editing, exitPending, setExitPending, onRun: startRun, onProbe: () => void trigger(cfg.baseUrl, cfg.apiKey), onCycleModel: cycleModel });

  const { columns, rows } = useWindowSize();
  const statusObj = exitPending
    ? { text: 'Press Ctrl+C again (or q) to exit', tone: 'news' as const }
    : {
        text: probing ? 'Probing...' : probe.reachable ? `ONLINE (${probe.latencyMs}ms · ${probe.models?.length ?? 0} models)` : 'OFFLINE',
        tone: (probing ? 'busy' : probe.reachable ? 'news' : 'quiet') as 'news' | 'busy' | 'quiet'
      };

  return (
    <Page width={Math.max(columns || 80, 80)} height={Math.max(rows || 24, 24)} title="Toolery-TS" icon="🔧" scope={`v${cfg.benchmarkVersion} · ${cfg.adapter}`} count={scenarios.length} noun="scenario"
      status={statusObj}
      page={exitPending || editing ? undefined : 'root'}
      help={!exitPending && !editing}
      tabs={<Tabs active={tab} items={TABS.map(t => ({ value: t, label: t }))} />} hints={getHints(tab, editing, exitPending)}>
      {runner.error && <Alert variant="error" title="Execution Error"><Text>{runner.error}</Text></Alert>}
      {renderTab({ tab, cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger, runner, scenarios, logs })}
    </Page>
  );
}

interface RunnerState {
  running: boolean;
  results: RunResult[];
  current?: RunResult;
  summary?: BenchmarkSummary;
  history: HistoryRun[];
  error?: string;
  execute: (modelsToRun: string[]) => Promise<void>;
}

interface RenderTabProps {
  tab: Tab;
  cfg: BenchmarkConfig;
  setCfg: React.Dispatch<React.SetStateAction<BenchmarkConfig>>;
  sfocus: number;
  setSfocus: React.Dispatch<React.SetStateAction<number>>;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  presetId: string;
  setPresetId: React.Dispatch<React.SetStateAction<string>>;
  probe: HealthProbe;
  probing: boolean;
  trigger: (url?: string, key?: string) => Promise<HealthProbe | null>;
  runner: RunnerState;
  scenarios: Scenario[];
  logs: string[];
}

function renderTab(p: RenderTabProps) {
  const { tab, cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger, runner, scenarios, logs } = p;
  if (tab === 'Home') return <HomeView cfg={cfg} probe={probe} results={runner.results} total={scenarios.length} running={runner.running} current={runner.current} summary={runner.summary} presetId={presetId} scenarios={scenarios} logs={logs} />;
  if (tab === 'Scenarios') return <ScenariosView scenarios={scenarios} results={runner.results} />;
  if (tab === 'Run') return <RunView cfg={cfg} current={runner.current} running={runner.running} completed={runner.results.length} total={scenarios.length} scenarios={scenarios} logs={logs} />;
  if (tab === 'Results') return <ResultsView results={runner.results} summary={runner.summary} scenarios={scenarios} />;
  if (tab === 'Rankings') return <RankingsView cfg={cfg} results={runner.results} />;
  if (tab === 'Compare') return <CompareView count={runner.results.length} />;
  if (tab === 'Profiles') return <ProfilesView />;
  if (tab === 'History') return <HistoryView history={runner.history} />;
  return <SettingsView cfg={cfg} setCfg={setCfg} sfocus={sfocus} setSfocus={setSfocus} setEditing={setEditing} presetId={presetId} setPresetId={setPresetId} probe={probe} probing={probing} trigger={trigger} />;
}

interface HomeViewProps {
  cfg: BenchmarkConfig;
  probe: HealthProbe;
  results: RunResult[];
  total: number;
  running: boolean;
  current?: RunResult;
  summary?: BenchmarkSummary;
  presetId: string;
  scenarios: Scenario[];
  logs: string[];
}

interface RecentRow extends Record<string, unknown> {
  id: string; tier: string; calls: string; status: string; acc: string; duration: string;
}

function HomeView({ cfg, probe, results, total, running, current, summary, presetId, scenarios, logs }: HomeViewProps) {
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const curTrial = current?.trials.at(-1) ?? results.at(-1)?.trials.at(-1);
  const curScenario = scenarios.find(s => s.id === (current?.scenarioId ?? results.at(-1)?.scenarioId));
  const recentData = results.slice(-6).reverse().map((r: RunResult) => {
    const last = r.trials.at(-1);
    return {
      id: r.scenarioId, tier: r.tier, calls: `${last?.toolCalls.length ?? 0}`,
      status: last?.success ? 'PASS' : 'FAIL',
      acc: `${((last?.toolCallScore.argumentAccuracy ?? 0) * 100).toFixed(0)}%`,
      duration: `${((last?.durationMs ?? 0) / 1000).toFixed(1)}s`
    };
  });
  const recentCols: Column<RecentRow>[] = [
    { key: 'id', header: 'Scenario ID', width: 20 }, { key: 'tier', header: 'Tier', width: 8 },
    { key: 'calls', header: 'Calls', width: 7 }, { key: 'status', header: 'Status', width: 8 },
    { key: 'acc', header: 'Accuracy', width: 10 }, { key: 'duration', header: 'Duration', width: 10 }
  ];

  return (
    <Columns gap={1}>
      <Box width="42%" flexDirection="column">
        <Panel title="⚙ Configuration" focused>
          <KeyValue label="Provider" value={pName} labelWidth={14} /><KeyValue label="Model" value={cfg.model || '(auto)'} labelWidth={14} />
          <KeyValue label="Base URL" value={cfg.baseUrl} labelWidth={14} /><KeyValue label="API Key" value={maskKey(cfg.apiKey)} labelWidth={14} />
          <KeyValue label="Tier" value={<Pill tone="soft" variant={tierTone(cfg.tier)}>{cfg.tier}</Pill>} labelWidth={14} />
          <KeyValue label="Status" value={<Badge variant={probe.reachable ? 'success' : 'error'}>{probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>} labelWidth={14} />
        </Panel>
        <Panel title="▶ Benchmark Progress">
          <ProgressBar value={Math.round((results.length / (total || 1)) * 100)} width={24} color="green" />
          <KeyValue label="Progress" value={`${results.length} / ${total} (${Math.round((results.length / (total || 1)) * 100)}%)`} labelWidth={14} />
          <KeyValue label="Pass Rate" value={`${summary ? (summary.successRate * 100).toFixed(0) : 0}% (${summary?.passedTrials ?? 0} passed)`} labelWidth={14} />
        </Panel>
        <Panel title="▥ Core Capabilities">
          {CAPS.slice(0, 8).map(c => <Box key={c}><Text>{c.padEnd(22)}</Text><ProgressBar value={Math.round(Number(summary?.capabilityScores?.[c] ?? 0) * 100)} width={14} /><Text> {(Number(summary?.capabilityScores?.[c] ?? 0) * 100).toFixed(0)}%</Text></Box>)}
        </Panel>
        <ActivityLogPanel logs={logs} />
      </Box>
      <Box width="58%" flexDirection="column">
        <Panel title={`Live Scenario & Diagnostics · ${current?.scenarioId ?? results.at(-1)?.scenarioId ?? 'Ready'}`}>
          {running ? <Spinner label="Executing scenario against model..." /> : <StatusMessage variant={curTrial?.success ? 'success' : curTrial ? 'warning' : 'info'}>{curTrial ? `Scenario ${curScenario?.id ?? 'run'} completed (${curTrial.success ? 'PASS' : 'FAIL'})` : 'Ready to start. Press [r].'}</StatusMessage>}
          <LiveTranscriptPanel scenario={curScenario} trial={curTrial} running={running} />
        </Panel>
        {recentData.length > 0 && <Panel title="▤ Recent Results"><Table data={recentData} columns={recentCols} /></Panel>}
        <TranscriptStreamPanel trial={curTrial} />
      </Box>
    </Columns>
  );
}

interface SettingsViewProps {
  cfg: BenchmarkConfig;
  setCfg: React.Dispatch<React.SetStateAction<BenchmarkConfig>>;
  sfocus: number;
  setSfocus: React.Dispatch<React.SetStateAction<number>>;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  presetId: string;
  setPresetId: React.Dispatch<React.SetStateAction<string>>;
  probe: HealthProbe;
  probing: boolean;
  trigger: (url?: string, key?: string) => Promise<HealthProbe | null>;
}

function SettingsView({ cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger }: SettingsViewProps) {
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const curField = FIELDS[sfocus];

  useInput((_input, key) => {
    if (activeDialog !== null) return;
    if (key.upArrow) setSfocus((s: number) => (s - 1 + FIELDS.length) % FIELDS.length);
    if (key.downArrow) setSfocus((s: number) => (s + 1) % FIELDS.length);
    if (key.return) {
      if (curField.id === 'withPerf') setCfg(c => ({ ...c, withPerf: !c.withPerf }));
      else { setActiveDialog(curField.id); setEditing(true); }
    }
  });

  const handleClose = () => { setActiveDialog(null); setEditing(false); };

  return (
    <Columns gap={1}>
      <Box width="48%" flexDirection="column">
        <Panel title="⚙ Control Panel · Configuration" focused={activeDialog === null}>
          {FIELDS.map((f, i) => {
            const displayVal = f.id === 'preset' ? pName : f.id === 'apiKey' ? maskKey(cfg.apiKey) : f.id === 'timeoutMs' ? `${Math.round(cfg.timeoutMs / 1000)}s` : f.id === 'numCtx' ? `${cfg.numCtx ?? 8192}` : f.id === 'withPerf' ? (cfg.withPerf ? 'enabled' : 'disabled') : f.id === 'baseUrl' ? cfg.baseUrl : f.id === 'model' ? (cfg.model || '(auto)') : f.id === 'adapter' ? cfg.adapter : f.id === 'tier' ? cfg.tier : f.id === 'trials' ? `${cfg.trials}` : `${cfg.concurrency}`;
            return (
              <SelectableRow key={f.id} active={i === sfocus} marker=">">
                <Box width={18}><Text bold={i === sfocus} color={i === sfocus ? 'cyan' : 'gray'}>{f.label}</Text></Box>
                <Text bold={i === sfocus}>{displayVal}</Text>
              </SelectableRow>
            );
          })}
        </Panel>
      </Box>
      <Box width="52%" flexDirection="column">
        {activeDialog !== null ? (
          <SettingsDialog fieldId={curField.id} cfg={cfg} setCfg={setCfg} presetId={presetId} setPresetId={setPresetId} probe={probe} trigger={trigger} onClose={handleClose} />
        ) : (
          <Panel title="📡 Endpoint Status & Discovered Models">
            <Badge variant={probe.reachable ? 'success' : 'error'}>{probing ? 'PROBING' : probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>
            <KeyValue label="Base URL" value={cfg.baseUrl} labelWidth={14} /><KeyValue label="Latency" value={probe.reachable ? `${probe.latencyMs}ms` : '—'} labelWidth={14} />
            <StatusMessage variant={probe.reachable ? 'success' : 'warning'}>{probe.reachable ? `${probe.models?.length ?? 0} models detected` : (probe.error ?? 'Unreachable')}</StatusMessage>
            <Box marginTop={1} flexDirection="column">
              <Text bold color="cyan">Discovered Models ({probe.models?.length ?? 0}):</Text>
              <Box flexWrap="wrap" marginTop={1}>
                {probe.models?.length ? probe.models.map(m => <Box key={m} marginRight={1} marginBottom={1}><Pill tone="soft" variant={m === cfg.model || cfg.model.includes(m) ? 'success' : 'muted'}>{m}</Pill></Box>) : <Text dimColor>(No models discovered. Press [p] to probe.)</Text>}
              </Box>
            </Box>
          </Panel>
        )}
      </Box>
    </Columns>
  );
}

interface RunViewProps {
  cfg: BenchmarkConfig;
  current?: RunResult;
  running: boolean;
  completed: number;
  total: number;
  scenarios: Scenario[];
  logs: string[];
}
function RunView({ cfg, current, running, completed, total, scenarios, logs }: RunViewProps) {
  const curScenario = scenarios.find(s => s.id === current?.scenarioId);
  return (
    <Columns gap={1}>
      <Box width="42%" flexDirection="column">
        <Panel title="▶ Execution Monitor" focused>
          <KeyValue label="Model" value={cfg.model || '(auto)'} labelWidth={14} />
          <KeyValue label="Status" value={running ? <Spinner label="Running scenario..." /> : <Badge variant="info">READY</Badge>} labelWidth={14} />
          <ProgressBar value={Math.round((completed / (total || 1)) * 100)} width={24} color="green" />
          <KeyValue label="Progress" value={`${completed} / ${total} (${Math.round((completed / (total || 1)) * 100)}%)`} labelWidth={14} />
        </Panel>
        <ActivityLogPanel logs={logs} />
      </Box>
      <Box width="58%" flexDirection="column">
        <Panel title={`Live Conversation Trace · ${current?.scenarioId ?? 'Ready'}`}>
          <LiveTranscriptPanel scenario={curScenario} trial={current?.trials.at(-1)} running={running} />
        </Panel>
        <TranscriptStreamPanel trial={current?.trials.at(-1)} />
      </Box>
    </Columns>
  );
}

interface ScenariosViewProps {
  scenarios: Scenario[];
  results: RunResult[];
}
function ScenariosView({ scenarios, results }: ScenariosViewProps) {
  const tableData = scenarios.slice(0, 15).map((s: Scenario) => ({ id: s.id, tier: s.tier, cat: s.category, status: results.find((r: RunResult) => r.scenarioId === s.id)?.trials.at(-1)?.success ? 'PASS' : 'PENDING' }));
  return <Panel title={`Scenarios (${scenarios.length})`}><Table data={tableData} columns={[{ key: 'id', header: 'ID', width: 22 }, { key: 'tier', header: 'Tier', width: 12 }, { key: 'cat', header: 'Category', width: 24 }, { key: 'status', header: 'Status', width: 12 }]} /></Panel>;
}

interface ResultsViewProps {
  results: RunResult[];
  summary?: BenchmarkSummary;
  scenarios: Scenario[];
}
function ResultsView({ results, summary, scenarios }: ResultsViewProps) {
  const latest = results.at(-1);
  const curScenario = scenarios.find(s => s.id === latest?.scenarioId);
  return (
    <Columns gap={1}>
      <Box width="50%" flexDirection="column">
        <Panel title="Benchmark Summary">
          {summary && <Alert variant="success" title="Benchmark Complete"><Text>{formatSummary(summary)}</Text></Alert>}
          <KeyValue label="Completed" value={`${results.length} scenarios`} labelWidth={14} />
          <Table data={results.slice(-8).reverse().map((r: RunResult) => ({ id: r.scenarioId, tier: r.tier, calls: `${r.trials.at(-1)?.toolCalls.length ?? 0}`, score: r.trials.at(-1)?.success ? 'PASS' : 'FAIL' }))} columns={[{ key: 'id', header: 'Scenario ID', width: 22 }, { key: 'tier', header: 'Tier', width: 10 }, { key: 'calls', header: 'Calls', width: 8 }, { key: 'score', header: 'Score', width: 8 }]} />
        </Panel>
      </Box>
      <Box width="50%" flexDirection="column">
        <Panel title={`Latest Result Inspector · ${latest?.scenarioId ?? 'No runs'}`}>
          <LiveTranscriptPanel scenario={curScenario} trial={latest?.trials.at(-1)} />
        </Panel>
        <TranscriptStreamPanel trial={latest?.trials.at(-1)} />
      </Box>
    </Columns>
  );
}

interface RankingsViewProps {
  cfg: BenchmarkConfig;
  results: RunResult[];
}
function RankingsView({ cfg, results }: RankingsViewProps) {
  const ranking = buildRanking(cfg.model || 'unknown', cfg.adapter, cfg.cluster ?? 'single', results);
  const data = Object.entries(ranking.dimensions).map(([k, v]) => ({ dimension: k, score: `${(Number(v) * 100).toFixed(0)}%` }));
  return <Panel title="Capability Rankings"><Alert variant="info" title={`Overall Score: ${(ranking.score * 100).toFixed(1)}%`}><ProgressBar value={Math.round(ranking.score * 100)} width={30} color="green" /></Alert><Table data={data} columns={[{ key: 'dimension', header: 'Dimension', width: 28 }, { key: 'score', header: 'Score', width: 14 }]} /></Panel>;
}
function CompareView({ count }: { count: number }) {
  return <Panel title="Paired Comparison (McNemar)"><StatusMessage variant="info">Current run scenarios: {count}</StatusMessage><UnorderedList><UnorderedList.Item><Text>Save two result runs to run exact paired McNemar tests.</Text></UnorderedList.Item><UnorderedList.Item><Text>Run CLI export to generate comparative CSV matrix.</Text></UnorderedList.Item></UnorderedList></Panel>;
}
function ProfilesView() {
  return <Panel title="Benchmark Profiles"><Table data={PROFILES.map(p => ({ id: p.id, desc: p.description }))} columns={[{ key: 'id', header: 'Profile ID', width: 22 }, { key: 'desc', header: 'Description', width: 60 }]} /></Panel>;
}
function HistoryView({ history }: { history: HistoryRun[] }) {
  const data = history.slice(-8).reverse().map(x => ({ date: x.startedAt?.slice(0, 19) ?? '—', model: x.model || '(unknown)', rate: `${(Number(x.summary?.successRate ?? 0) * 100).toFixed(1)}%` }));
  return <Panel title="Run History (Local)">{data.length ? <Table data={data} columns={[{ key: 'date', header: 'Date', width: 24 }, { key: 'model', header: 'Model', width: 24 }, { key: 'rate', header: 'Success Rate', width: 16 }]} /> : <StatusMessage variant="warning">No history recorded yet.</StatusMessage>}</Panel>;
}
