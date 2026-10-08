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
const SCENARIO_PREVIEW_ROWS = 15;

function maskKey(key?: string): string {
  if (!key) return '(none)';
  return key.length <= 8 ? '••••••••' : `••••••••${key.slice(-4)}`;
}
function tierTone(tier?: string): 'info' | 'success' | 'warning' | 'error' {
  if (tier === 'easy') return 'success';
  if (tier === 'hard') return 'warning';
  if (tier === 'very-hard') return 'error';
  return 'info';
}
function scoreTone(pct: number): 'success' | 'warning' | 'error' {
  return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error';
}
const TONE_COLOR: Record<'success' | 'warning' | 'error', string> = { success: 'green', warning: 'yellow', error: 'red' };
function titleCase(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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

const NARROW_COLUMNS = 110;
/** Frame bands around the body: 2 borders, title, tabs (margin + 2 rows), body margin, counter, hints. */
const PAGE_BANDS = 9;
/** At the 80-column floor the tab bar wraps to a second line, spending one more band. */
const TAB_WRAP_COLUMNS = 80;

function useGrid(leftPct = 42) {
  const { columns } = useWindowSize();
  const termCols = Math.max(columns ?? 80, 80);
  const inner = termCols - 3;
  const left = Math.floor((inner * leftPct) / 100);
  return { narrow: termCols < NARROW_COLUMNS, inner, left, right: inner - left };
}

/** A panel in a fixed-height column: the rows it needs, and how it renders at an allocation. */
interface PanelSpec {
  min: number;
  /** The panel that absorbs the column's leftover rows. */
  grow?: boolean;
  render: (height: number) => React.ReactNode;
}

/**
 * Fills a column to exactly `budget` rows with fixed-height panels. Panels
 * that do not fit are skipped (lowest priority last), and the grow panel
 * absorbs the slack. Explicit heights matter: ink clips with the innermost
 * `overflow: hidden` only, so a Panel's own clip would defeat an outer frame
 * clip, and shrinking children land on fractional rows and vanish. Fitting
 * means nothing ever overflows the page frame — the footer stays readable.
 */
function Fill({ budget, panels }: { budget: number; panels: PanelSpec[] }) {
  const kept: PanelSpec[] = [];
  let used = 0;
  for (const p of panels) {
    const cost = p.min + (kept.length ? 1 : 0);
    if (used + cost > budget) continue;
    used += cost;
    kept.push(p);
  }
  const grow = kept.find(p => p.grow) ?? kept.at(-1);
  const slack = Math.max(0, budget - used);
  return (
    <Box flexDirection="column" gap={kept.length > 1 ? 1 : 0}>
      {kept.map((p, i) => (
        <React.Fragment key={i}>{p.render(p === grow ? p.min + slack : p.min)}</React.Fragment>
      ))}
    </Box>
  );
}

interface SplitProps {
  left: PanelSpec[];
  right: PanelSpec[];
  budget: number;
  leftPct?: number;
}

function Split({ left, right, budget, leftPct = 42 }: SplitProps) {
  const grid = useGrid(leftPct);
  // Stacked: the dynamic panels (right) come first so a short terminal shows
  // live state before configuration detail.
  if (grid.narrow) return <Fill budget={budget} panels={[...right, ...left]} />;
  return (
    <Columns gap={1}>
      <Box width={grid.left} flexDirection="column"><Fill budget={budget} panels={left} /></Box>
      <Box width={grid.right} flexDirection="column"><Fill budget={budget} panels={right} /></Box>
    </Columns>
  );
}

/**
 * A Panel whose content cannot shrink. At a fixed height an overflowing child
 * would compress every sibling into fractional positions (rows silently
 * dropped); non-shrinking content clips cleanly against the panel border
 * instead, and the height budgets passed in keep that case rare.
 */
function Pane({ children, ...props }: React.ComponentProps<typeof Panel>) {
  return (
    <Panel {...props}>
      <Box flexDirection="column" flexGrow={1} flexShrink={0}>{children}</Box>
    </Panel>
  );
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

function ActivityLogPanel({ logs, height }: { logs: string[]; height: number }) {
  const recent = logs.slice(-Math.max(2, height - 3));
  return (
    <Pane title="📜 Activity & Execution Log" height={height}>
      <Box flexDirection="column">
        {recent.map((line, i) => {
          const sep = line.indexOf('] ');
          const stamp = sep > 0 ? line.slice(0, sep + 1) : '';
          const body = sep > 0 ? line.slice(sep + 2) : line;
          const tone = body.includes('FAIL') || body.startsWith('Error') ? 'red'
            : body.includes('PASS') || body.includes('ONLINE') ? 'green'
            : undefined;
          return (
            <Text key={i} dimColor={i < recent.length - 3} wrap="truncate-end">
              {stamp ? <Text dimColor>{stamp} </Text> : null}
              <Text color={tone}>{body}</Text>
            </Text>
          );
        })}
      </Box>
    </Pane>
  );
}

function TranscriptStreamPanel({ trial, height }: { trial?: TrialResult; height: number }) {
  if (!trial?.trace?.length) return null;
  return (
    <Pane title={`💬 Turn-by-Turn Conversation Transcript (${trial.trace.length} turns)`} height={height}>
      <Box flexDirection="column">
        {trial.trace.slice(-2).map((msg, i) => {
          const roleColor = msg.role === 'user' ? 'yellow' : msg.role === 'assistant' ? 'blue' : msg.role === 'tool' ? 'magenta' : 'gray';
          const content = msg.content ? truncate(msg.content, 120) : '';
          const calls = msg.toolCalls ?? [];
          return (
            <Box key={i} flexDirection="column">
              <Text bold color={roleColor}>[{msg.role.toUpperCase()}]{msg.name ? ` (${msg.name})` : ''}:</Text>
              {content ? <Text wrap="wrap">{"  "}{content}</Text> : null}
              {calls.length ? (
                <Text color="green">
                  {"  "}↳ {calls.map(tc => tc.name).join(', ')}{calls.length > 1 ? ` (+${calls.length - 1})` : ''}
                </Text>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Pane>
  );
}

interface LiveTranscriptPanelProps {
  scenario?: Scenario;
  trial?: TrialResult;
  running?: boolean;
}

function LiveTranscriptPanel({ scenario, trial, running }: LiveTranscriptPanelProps) {
  if (!trial) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" marginTop={1}>
        <Box flexDirection="column">
          <Text bold color="blue">Next scenario</Text>
          {scenario ? (
            <>
              <Box gap={1} marginTop={1}>
                <Text bold>{scenario.id}</Text>
                <Pill tone="soft" variant={tierTone(scenario.tier)}>{scenario.tier}</Pill>
                <Text dimColor>{scenario.category}</Text>
              </Box>
              <Box marginTop={1}>
                <Text dimColor wrap="wrap">{`"${truncate(scenario.prompt, 240)}"`}</Text>
              </Box>
            </>
          ) : (
            <Box marginTop={1}><Text dimColor>No scenario is loaded for this tier.</Text></Box>
          )}
          <Box marginTop={1}>
            {running
              ? <Text dimColor>Waiting for the first trial to complete…</Text>
              : <Text dimColor>Press <Text bold>r</Text> to start the benchmark.</Text>}
          </Box>
        </Box>
      </Box>
    );
  }
  const promptText = scenario?.prompt || trial.trace.find(m => m.role === 'user')?.content || '(no prompt)';
  const modelText = trial.text || trial.trace.find(m => m.role === 'assistant')?.content || '';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="blue">User Prompt:</Text>
        <Text wrap="wrap">{`"${truncate(promptText, 120)}"`}</Text>
      </Box>
      {modelText ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="blue">Model Response / Thought:</Text>
          <Text wrap="wrap">{truncate(modelText, 120)}</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="blue">Tool Invocations ({trial.toolCalls.length} observed):</Text>
        {trial.toolCalls.length ? (
          trial.toolCalls.slice(-2).map((call, idx) => (
            <Text key={idx} color="green">
              {"  "}→ {call.name}({formatArgs(call.arguments)}){call.latencyMs !== undefined ? ` [${call.latencyMs}ms]` : ''}
            </Text>
          ))
        ) : (
          <Text dimColor>  (No tool calls observed)</Text>
        )}
      </Box>
      <Box flexDirection="column">
        <KeyValue label="Outcome" value={<Badge variant={trial.success ? 'success' : 'error'}>{trial.success ? 'PASS' : 'FAIL'}</Badge>} labelWidth={14} />
        <KeyValue label="Arg Accuracy" value={`${(trial.toolCallScore.argumentAccuracy * 100).toFixed(0)}%`} labelWidth={14} />
        <KeyValue label="Tokens" value={`${trial.inputTokens ?? '—'} prompt / ${trial.outputTokens ?? '—'} completion`} labelWidth={14} />
        {!trial.success && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="red">Diagnostics & Contract Violations:</Text>
            {trial.toolCallScore.missing.length > 0 && (
              <Text color="red" wrap="truncate-end">{"  "}✕ Missing expected ({trial.toolCallScore.missing.length}): {trial.toolCallScore.missing.map(formatExpectedCall).join('; ')}</Text>
            )}
            {trial.toolCallScore.argumentAccuracy < 1 && trial.toolCallScore.missing.length === 0 && (
              <Text color="yellow" wrap="truncate-end">{"  "}⚠ Argument mismatch (accuracy: {(trial.toolCallScore.argumentAccuracy * 100).toFixed(0)}%)</Text>
            )}
            {trial.toolCallScore.extra.length > 0 && (
              <Text color="red" wrap="truncate-end">{"  "}✕ Extra / unexpected ({trial.toolCallScore.extra.length}): {trial.toolCallScore.extra.map(c => c.name).join(', ')}</Text>
            )}
            {trial.error && <Text color="red" wrap="truncate-end">{"  "}✕ Error: {trial.error}</Text>}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function renderSelectDialog({ title, description, options, defaultValue, onSubmit, onClose, height }: {
  title: string; description: string; options: Array<{ label: string; value: string }>;
  defaultValue: string; onSubmit: (val: string) => void; onClose: () => void; height: number;
}) {
  const visible = Math.max(3, Math.min(8, height - 7));
  return (
    <Pane title={title} focused height={height}>
      <Text dimColor>{description}</Text>
      <Box marginTop={1} flexDirection="column">
        <Select options={options} defaultValue={defaultValue} onSubmit={onSubmit} visibleOptionCount={visible} />
      </Box>
      <Box marginTop={1}><Text dimColor>[↑/↓] Navigate  [Enter] Select  [Esc] Cancel</Text></Box>
    </Pane>
  );
}

function renderModelDialog({ probe, currentModel, onSubmit, height }: {
  probe: HealthProbe; currentModel: string; onSubmit: (val: string) => void; height: number;
}) {
  const options = [
    { label: `★ all (${probe.models?.length ?? 0} discovered models)`, value: 'all' },
    ...(probe.models ?? []).map(m => ({ label: `● ${m}`, value: m })),
    { label: 'mock (offline mock adapter)', value: 'mock' }
  ];
  const defaults = currentModel === 'all' ? ['all'] : currentModel.split(',').map(s => s.trim()).filter(Boolean);
  const visible = Math.max(3, Math.min(8, height - 7));
  return (
    <Pane title="📦 Select Benchmark Model(s)" focused height={height}>
      <Text dimColor>Discovered from endpoint. [Space] to toggle, [Enter] to confirm, [Esc] to cancel.</Text>
      <Box marginTop={1} flexDirection="column">
        <MultiSelect options={options} defaultValue={defaults} visibleOptionCount={visible} onSubmit={(vals) => {
          const chosen = vals.includes('all') ? 'all' : vals.join(', ') || 'mock';
          onSubmit(chosen);
        }} />
      </Box>
      <Box marginTop={1}><Text dimColor>[Space] Toggle selection  [Enter] Confirm  [Esc] Cancel</Text></Box>
    </Pane>
  );
}

function renderTextDialog({ title, description, defaultValue, onSubmit, onClose, height }: {
  title: string; description: string; defaultValue: string; onSubmit: (val: string) => void; onClose: () => void; height: number;
}) {
  return (
    <Pane title={title} focused height={height}>
      <Text dimColor>{description}</Text>
      <Box marginTop={1}>
        <TextInput defaultValue={defaultValue} onSubmit={onSubmit} onCancel={onClose} />
      </Box>
      <Box marginTop={1}><Text dimColor>[Enter] Save  [Esc] Cancel</Text></Box>
    </Pane>
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
  height: number;
}

function SettingsDialog({ fieldId, cfg, setCfg, presetId, setPresetId, probe, trigger, onClose, height }: SettingsDialogProps) {
  useInput((_input, key) => { if (key.escape) onClose(); });

  if (fieldId === 'model') {
    return renderModelDialog({ probe, currentModel: cfg.model, height, onSubmit: (m) => { setCfg(c => ({ ...c, model: m })); onClose(); } });
  }
  if (fieldId === 'preset') {
    return renderSelectDialog({
      title: '🔌 Select Preset Provider', description: 'Choose pre-configured endpoint preset.', height,
      options: PRESETS.map(p => ({ label: `${p.name} (${p.adapter})`, value: p.id })), defaultValue: presetId,
      onSubmit: (val) => {
        setPresetId(val);
        const p = PRESETS.find(x => x.id === val);
        if (p && p.id !== 'custom') { setCfg(c => ({ ...c, baseUrl: p.baseUrl, adapter: p.adapter })); void trigger(p.baseUrl, cfg.apiKey); }
        onClose();
      }, onClose
    });
  }
  if (fieldId === 'adapter') return renderSelectDialog({ title: '⚙ Select Protocol Adapter', description: 'Wire protocol for inference.', options: ADAPTER_OPTIONS, defaultValue: cfg.adapter, height, onSubmit: (val) => { setCfg(c => ({ ...c, adapter: val as AdapterKind })); onClose(); }, onClose });
  if (fieldId === 'tier') return renderSelectDialog({ title: '🎯 Select Benchmark Tier', description: 'Filter difficulty tier.', options: TIER_OPTIONS, defaultValue: cfg.tier, height, onSubmit: (val) => { setCfg(c => ({ ...c, tier: val as Tier | 'all' })); onClose(); }, onClose });
  if (fieldId === 'trials') return renderSelectDialog({ title: '🔄 Select Trials per Scenario', description: 'Number of repetitions.', options: TRIALS_OPTIONS, defaultValue: String(cfg.trials), height, onSubmit: (val) => { setCfg(c => ({ ...c, trials: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'concurrency') return renderSelectDialog({ title: '⚡ Select Concurrency Level', description: 'Simultaneous workers.', options: CONCURRENCY_OPTIONS, defaultValue: String(cfg.concurrency), height, onSubmit: (val) => { setCfg(c => ({ ...c, concurrency: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'timeoutMs') return renderSelectDialog({ title: '⏱ Select Request Timeout', description: 'Per-request timeout limit.', options: TIMEOUT_OPTIONS, defaultValue: String(cfg.timeoutMs), height, onSubmit: (val) => { setCfg(c => ({ ...c, timeoutMs: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'numCtx') return renderSelectDialog({ title: '🧠 Select Context Window', description: 'Ollama context length.', options: NUM_CTX_OPTIONS, defaultValue: String(cfg.numCtx ?? 8192), height, onSubmit: (val) => { setCfg(c => ({ ...c, numCtx: Number(val) })); onClose(); }, onClose });
  if (fieldId === 'baseUrl') return renderTextDialog({ title: '✏ Edit Base URL', description: 'Endpoint URL for inference.', defaultValue: cfg.baseUrl, height, onSubmit: (v) => { setCfg(c => ({ ...c, baseUrl: v })); void trigger(v, cfg.apiKey); onClose(); }, onClose });
  if (fieldId === 'apiKey') return renderTextDialog({ title: '🔑 Edit API Key', description: 'API bearer token (in-memory only).', defaultValue: cfg.apiKey ?? '', height, onSubmit: (v) => { setCfg(c => ({ ...c, apiKey: v || undefined })); void trigger(cfg.baseUrl, v || undefined); onClose(); }, onClose });
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
  const termCols = Math.max(columns || 80, 80);
  const bodyRows = Math.max(rows || 24, 24) - PAGE_BANDS - (termCols <= TAB_WRAP_COLUMNS ? 1 : 0);
  const fillBudget = bodyRows - (runner.error ? 5 : 0);
  // A narrow title row can't hold the full status/scope text without wrapping
  // to a second row, which would shift the whole frame by one band.
  const narrowHeader = termCols < NARROW_COLUMNS;
  const statusObj = exitPending
    ? { text: narrowHeader ? 'Ctrl+C to exit' : 'Press Ctrl+C again (or q) to exit', tone: 'news' as const }
    : {
        text: probing ? 'Probing…'
          : probe.reachable
            ? (narrowHeader ? `ONLINE ${probe.latencyMs}ms` : `ONLINE (${probe.latencyMs}ms · ${probe.models?.length ?? 0} models)`)
            : (narrowHeader ? 'OFFLINE · press p' : 'OFFLINE — press p to probe'),
        tone: (probing ? 'busy' : 'news') as 'news' | 'busy' | 'quiet'
      };
  // Live pass rate from completed trials: `summary` only exists after the run
  // finishes, so gating the counter on it showed 0% for the entire run.
  const doneTrials = runner.results.flatMap(r => r.trials);
  const passRate = doneTrials.length ? Math.round((doneTrials.filter(t => t.success).length / doneTrials.length) * 100) : 0;
  const counter = `${runner.results.length} of ${scenarios.length} · ${passRate}% pass`;

  return (
    <Page width={termCols} height={Math.max(rows || 24, 24)} title="Toolery-TS" icon="🔧"
      scope={narrowHeader ? cfg.adapter : `v${cfg.benchmarkVersion} · ${cfg.adapter}`} count={scenarios.length} noun="scenario"
      status={statusObj}
      counter={counter}
      page={exitPending || editing ? undefined : 'root'}
      help={!exitPending && !editing}
      tabs={<Tabs active={tab} items={TABS.map(t => ({ value: t, label: t }))} />} hints={getHints(tab, editing, exitPending)}>
      {/* Fixed body budget: panels are fitted to it exactly, so nothing can
          reach the page frame's counter/hint rows below. */}
      <Box flexDirection="column" height={bodyRows} overflow="hidden">
        {runner.error && <Box flexShrink={0}><Alert variant="error" title="Execution Error"><Text wrap="truncate-end">{runner.error}</Text></Alert></Box>}
        {renderTab({ tab, cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger, runner, scenarios, logs, budget: fillBudget })}
      </Box>
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
  budget: number;
}

function renderTab(p: RenderTabProps) {
  const { tab, cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger, runner, scenarios, logs, budget } = p;
  if (tab === 'Home') return <HomeView budget={budget} cfg={cfg} probe={probe} results={runner.results} total={scenarios.length} running={runner.running} current={runner.current} summary={runner.summary} presetId={presetId} scenarios={scenarios} logs={logs} />;
  if (tab === 'Scenarios') return <ScenariosView budget={budget} scenarios={scenarios} results={runner.results} />;
  if (tab === 'Run') return <RunView budget={budget} cfg={cfg} current={runner.current} running={runner.running} completed={runner.results.length} total={scenarios.length} scenarios={scenarios} logs={logs} />;
  if (tab === 'Results') return <ResultsView budget={budget} results={runner.results} summary={runner.summary} scenarios={scenarios} />;
  if (tab === 'Rankings') return <RankingsView budget={budget} cfg={cfg} results={runner.results} />;
  if (tab === 'Compare') return <CompareView budget={budget} count={runner.results.length} />;
  if (tab === 'Profiles') return <ProfilesView budget={budget} />;
  if (tab === 'History') return <HistoryView budget={budget} history={runner.history} />;
  return <SettingsView budget={budget} cfg={cfg} setCfg={setCfg} sfocus={sfocus} setSfocus={setSfocus} setEditing={setEditing} presetId={presetId} setPresetId={setPresetId} probe={probe} probing={probing} trigger={trigger} />;
}

interface HomeViewProps {
  budget: number;
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
  id: string; calls: string; status: string; acc: string; duration: string;
}

function HomeView({ budget, cfg, probe, results, total, running, current, summary, presetId, scenarios, logs }: HomeViewProps) {
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const curTrial = current?.trials.at(-1) ?? results.at(-1)?.trials.at(-1);
  const curScenario = scenarios.find(s => s.id === (current?.scenarioId ?? results.at(-1)?.scenarioId));
  const nextScenario = scenarios.find(s => !results.some(r => r.scenarioId === s.id));
  const shownScenario = curScenario ?? nextScenario;
  const pct = Math.round((results.length / (total || 1)) * 100);
  const passPct = summary ? Math.round(summary.successRate * 100) : 0;
  const grid = useGrid();
  const paneW = grid.narrow ? grid.inner : grid.left;
  const valMax = paneW - 16;
  const recentData = results.slice(-3).reverse().map((r: RunResult) => {
    const last = r.trials.at(-1);
    return {
      id: r.scenarioId, calls: `${last?.toolCalls.length ?? 0}`,
      status: last?.success ? 'PASS' : 'FAIL',
      acc: `${((last?.toolCallScore.argumentAccuracy ?? 0) * 100).toFixed(0)}%`,
      duration: `${((last?.durationMs ?? 0) / 1000).toFixed(1)}s`
    };
  });
  const recentCols: Column<RecentRow>[] = [
    // Content-sized so long scenario IDs are not truncated while the pane
    // has room; fixed columns below hold their alignment.
    { key: 'id', header: 'Scenario ID' },
    { key: 'calls', header: 'Calls', width: 6, align: 'right' },
    { key: 'status', header: 'Status', width: 7 },
    { key: 'acc', header: 'Accuracy', width: 9, align: 'right' },
    { key: 'duration', header: 'Duration', width: 9, align: 'right' }
  ];
  // Worst-case panel heights for the live transcript at this state: the
  // FAIL path shows diagnostics, so it needs the most rows.
  const liveMin = curTrial ? (curTrial.success ? 21 : 28) : (running ? 13 : 12);
  // Title IDs are bounded by the pane they sit in (prefix "◉ Live Scenario · "),
  // so a long ID never wraps the title row and pushes the panel past its budget.
  const liveIdMax = Math.max(8, (grid.narrow ? grid.inner : grid.right) - 21);

  const left: PanelSpec[] = [
    { min: 9, render: h => (
      <Pane title="⚙ Configuration" height={h}>
        <KeyValue label="Provider" value={truncate(pName, valMax)} labelWidth={14} />
        <KeyValue label="Model" value={truncate(cfg.model || '(auto)', valMax)} labelWidth={14} />
        <KeyValue label="Base URL" value={truncate(cfg.baseUrl, valMax)} labelWidth={14} />
        <KeyValue label="API Key" value={maskKey(cfg.apiKey)} labelWidth={14} />
        <KeyValue label="Tier" value={<Pill tone="soft" variant={tierTone(cfg.tier)}>{cfg.tier}</Pill>} labelWidth={14} />
        <KeyValue label="Status" value={<Badge variant={probe.reachable ? 'success' : 'error'}>{probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>} labelWidth={14} />
      </Pane>
    ) },
    { min: 6, render: h => (
      <Pane title="▶ Benchmark Progress" height={h}>
        <ProgressBar value={pct} width={30} color={TONE_COLOR[scoreTone(pct)]} />
        <KeyValue label="Progress" value={`${results.length} / ${total} (${pct}%)`} labelWidth={14} />
        <KeyValue label="Pass Rate" value={summary ? `${passPct}% (${summary.passedTrials}/${summary.trials} trials)` : '—'} labelWidth={14} />
      </Pane>
    ) },
    { min: 11, render: h => (
      <Pane title="▥ Core Capabilities" height={h}>
        {CAPS.map(cap => {
          const score = Number(summary?.capabilityScores?.[cap] ?? 0) * 100;
          return (
            <Box key={cap}>
              <Box width={22} flexShrink={0}><Text dimColor={!summary}>{titleCase(cap)}</Text></Box>
              <ProgressBar value={Math.round(score)} width={10} color={TONE_COLOR[scoreTone(score)]} />
              <Box width={7} flexShrink={0} justifyContent="flex-end"><Text>{score.toFixed(1)}%</Text></Box>
            </Box>
          );
        })}
      </Pane>
    ) },
    { min: 6, grow: true, render: h => <ActivityLogPanel logs={logs} height={h} /> }
  ];

  const right: PanelSpec[] = [
    { min: liveMin, grow: true, render: h => (
      <Pane title={`◉ Live Scenario · ${truncate(shownScenario?.id ?? 'Ready', liveIdMax)}`} height={h}>
        {running
          ? <Spinner label="Executing scenario…" />
          : curTrial
            ? <StatusMessage variant={curTrial.success ? 'success' : 'error'}>{`Scenario ${curScenario?.id ?? 'run'} ${curTrial.success ? 'passed' : 'failed'}`}</StatusMessage>
            : null}
        <LiveTranscriptPanel scenario={shownScenario} trial={curTrial} running={running} />
      </Pane>
    ) },
    { min: recentData.length ? 7 : 4, render: h => (
      <Pane title="▤ Recent Results" height={h}>
        {recentData.length
          ? <Table data={recentData} columns={recentCols} gap={1} maxWidth={(grid.narrow ? grid.inner : grid.right) - 2} />
          : <StatusMessage variant="info">No results yet — press [r] to run.</StatusMessage>}
      </Pane>
    ) }
  ];

  return <Split budget={budget} left={left} right={right} />;
}

interface SettingsViewProps {
  budget: number;
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

function SettingsView({ budget, cfg, setCfg, sfocus, setSfocus, setEditing, presetId, setPresetId, probe, probing, trigger }: SettingsViewProps) {
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const curField = FIELDS[sfocus];
  const grid = useGrid(48);
  const paneW = grid.narrow ? grid.inner : grid.left;

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

  const left: PanelSpec[] = [
    { min: 14, grow: true, render: h => (
      <Pane title="⚙ Control Panel · Configuration" focused={activeDialog === null} height={h}>
        {FIELDS.map((f, i) => {
          const raw = f.id === 'preset' ? pName : f.id === 'apiKey' ? maskKey(cfg.apiKey) : f.id === 'timeoutMs' ? `${Math.round(cfg.timeoutMs / 1000)}s` : f.id === 'numCtx' ? `${cfg.numCtx ?? 8192}` : f.id === 'withPerf' ? (cfg.withPerf ? 'enabled' : 'disabled') : f.id === 'baseUrl' ? cfg.baseUrl : f.id === 'model' ? (cfg.model || '(auto)') : f.id === 'adapter' ? cfg.adapter : f.id === 'tier' ? cfg.tier : f.id === 'trials' ? `${cfg.trials}` : `${cfg.concurrency}`;
          const displayVal = truncate(raw, paneW - 24);
          return (
            <SelectableRow key={f.id} active={i === sfocus} marker=">">
              <Box width={18}><Text bold={i === sfocus} color={i === sfocus ? 'cyan' : 'gray'}>{f.label}</Text></Box>
              <Text bold={i === sfocus}>{displayVal}</Text>
            </SelectableRow>
          );
        })}
      </Pane>
    ) }
  ];

  const right: PanelSpec[] = activeDialog !== null
    ? [{ min: 10, grow: true, render: h => (
        <SettingsDialog fieldId={curField.id} cfg={cfg} setCfg={setCfg} presetId={presetId} setPresetId={setPresetId} probe={probe} trigger={trigger} onClose={handleClose} height={h} />
      ) }]
    : [{ min: 4, grow: true, render: h => <EndpointPanel budget={h} paneW={grid.narrow ? grid.inner : grid.right} cfg={cfg} probe={probe} probing={probing} /> }];

  return <Split budget={budget} leftPct={48} left={left} right={right} />;
}

/** Endpoint panel sized to its budget: the pill cloud is capped so the model
 * list wraps inside the panel instead of pushing past it. */
function EndpointPanel({ budget, paneW, cfg, probe, probing }: { budget: number; paneW: number; cfg: BenchmarkConfig; probe: HealthProbe; probing: boolean }) {
  const models = probe.models ?? [];
  const perRow = Math.max(2, Math.floor((paneW - 6) / 16));
  const pillRows = Math.max(1, budget - 10);
  const fitsAll = models.length <= pillRows * perRow;
  const shown = fitsAll ? models : models.slice(0, Math.max(0, pillRows - 1) * perRow);
  return (
    <Pane title="📡 Endpoint Status & Discovered Models" height={budget}>
      <Badge variant={probe.reachable ? 'success' : 'error'}>{probing ? 'PROBING' : probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>
      <KeyValue label="Base URL" value={truncate(cfg.baseUrl, paneW - 18)} labelWidth={14} /><KeyValue label="Latency" value={probe.reachable ? `${probe.latencyMs}ms` : '—'} labelWidth={14} />
      <StatusMessage variant={probe.reachable ? 'success' : 'warning'}>{probe.reachable ? `${models.length} models detected` : (probe.error ?? 'Unreachable')}</StatusMessage>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">Discovered Models ({models.length}):</Text>
        <Box flexWrap="wrap" marginTop={1}>
          {models.length
            ? <>
                {shown.map(m => <Box key={m} marginRight={1} marginBottom={1}><Pill tone="soft" variant={m === cfg.model || cfg.model.includes(m) ? 'success' : 'muted'}>{m}</Pill></Box>)}
                {!fitsAll && <Text dimColor>+{models.length - shown.length} more…</Text>}
              </>
            : <Text dimColor>(No models discovered. Press [p] to probe.)</Text>}
        </Box>
      </Box>
    </Pane>
  );
}

interface RunViewProps {
  budget: number;
  cfg: BenchmarkConfig;
  current?: RunResult;
  running: boolean;
  completed: number;
  total: number;
  scenarios: Scenario[];
  logs: string[];
}
function RunView({ budget, cfg, current, running, completed, total, scenarios, logs }: RunViewProps) {
  const curScenario = scenarios.find(s => s.id === current?.scenarioId);
  const shownScenario = curScenario ?? scenarios[completed];
  const pct = Math.round((completed / (total || 1)) * 100);
  const trial = current?.trials.at(-1);
  const liveMin = trial ? (trial.success ? 21 : 28) : (running ? 13 : 12);
  const grid = useGrid();
  const liveIdMax = Math.max(8, (grid.narrow ? grid.inner : grid.right) - 21);
  const left: PanelSpec[] = [
    { min: 7, render: h => (
      <Pane title="▶ Execution Monitor" height={h}>
        <KeyValue label="Model" value={truncate(cfg.model || '(auto)', 40)} labelWidth={14} />
        <KeyValue label="Status" value={running ? <Spinner label="Running…" /> : <Badge variant="info">READY</Badge>} labelWidth={14} />
        <ProgressBar value={pct} width={30} color={TONE_COLOR[scoreTone(pct)]} />
        <KeyValue label="Progress" value={`${completed} / ${total} (${pct}%)`} labelWidth={14} />
      </Pane>
    ) },
    { min: 6, grow: true, render: h => <ActivityLogPanel logs={logs} height={h} /> }
  ];
  const right: PanelSpec[] = [
    { min: liveMin, grow: true, render: h => (
      <Pane title={`◉ Live Scenario · ${truncate(shownScenario?.id ?? 'Ready', liveIdMax)}`} height={h}>
        <LiveTranscriptPanel scenario={shownScenario} trial={trial} running={running} />
      </Pane>
    ) },
    ...(trial?.trace?.length ? [{ min: 13, render: (h: number) => <TranscriptStreamPanel trial={trial} height={h} /> }] : [])
  ];
  return <Split budget={budget} left={left} right={right} />;
}

interface ScenariosViewProps {
  budget: number;
  scenarios: Scenario[];
  results: RunResult[];
}
function ScenariosView({ budget, scenarios, results }: ScenariosViewProps) {
  const { inner } = useGrid(100);
  // Table rows are fitted to the budget so the panel never overflows the frame.
  const rowCount = Math.max(1, Math.min(SCENARIO_PREVIEW_ROWS, budget - 6));
  const tableData = scenarios.slice(0, rowCount).map((s: Scenario) => ({ id: s.id, tier: s.tier, cat: s.category, status: results.find((r: RunResult) => r.scenarioId === s.id)?.trials.at(-1)?.success ? 'PASS' : 'PENDING' }));
  return (
    <Fill budget={budget} panels={[{ min: 6, grow: true, render: h => (
      <Pane title={`Scenarios (${scenarios.length})`} height={h}>
        {/* The ID column is content-sized: a fixed width would truncate IDs
            even when the pane has room, and it is the column shrinkToFit
            narrows first when the pane really is too small. */}
        <Table data={tableData} columns={[{ key: 'id', header: 'ID' }, { key: 'tier', header: 'Tier', width: 12 }, { key: 'cat', header: 'Category', width: 22 }, { key: 'status', header: 'Status', width: 11 }]} maxWidth={inner - 2} />
        <Box marginTop={1}>
          <Text dimColor>{`Showing first ${tableData.length} of ${scenarios.length} scenarios in this tier.`}</Text>
        </Box>
      </Pane>
    ) }]} />
  );
}

interface ResultsViewProps {
  budget: number;
  results: RunResult[];
  summary?: BenchmarkSummary;
  scenarios: Scenario[];
}
function ResultsView({ budget, results, summary, scenarios }: ResultsViewProps) {
  const latest = results.at(-1);
  const curScenario = scenarios.find(s => s.id === latest?.scenarioId)
    ?? scenarios.find(s => !results.some(r => r.scenarioId === s.id));
  const grid = useGrid(50);
  const latestTrial = latest?.trials.at(-1);
  const liveMin = latestTrial ? (latestTrial.success ? 21 : 28) : 12;
  const latestIdMax = Math.max(8, (grid.narrow ? grid.inner : grid.right) - 21);
  // Summary block (4 rows + gaps) + margin + table header leave budget-12 rows for data rows.
  const rowCount = Math.max(1, Math.min(8, budget - 12));
  const left: PanelSpec[] = [{ min: 4, grow: true, render: h => (
    <Pane title="Benchmark Summary" height={h}>
      {summary ? (
        <Box flexDirection="column" gap={1}>
          <StatusMessage variant={scoreTone(summary.successRate * 100)}>
            {`Run complete — ${summary.passedTrials}/${summary.trials} trials passed (${(summary.successRate * 100).toFixed(1)}%)`}
          </StatusMessage>
          <KeyValue label="Profile" value={summary.profile} labelWidth={14} />
          <KeyValue label="Scenarios" value={`${summary.scenarios}`} labelWidth={14} />
          <KeyValue label="Avg latency" value={`${summary.averageDurationMs.toFixed(0)} ms`} labelWidth={14} />
        </Box>
      ) : (
        <StatusMessage variant="info">No completed run yet — press [r] to start.</StatusMessage>
      )}
      {results.length > 0 && (
        <Box marginTop={1}>
          <Table
            data={results.slice(-rowCount).reverse().map((r: RunResult) => ({ id: r.scenarioId, tier: r.tier, calls: `${r.trials.at(-1)?.toolCalls.length ?? 0}`, score: r.trials.at(-1)?.success ? 'PASS' : 'FAIL' }))}
            columns={[{ key: 'id', header: 'Scenario ID' }, { key: 'tier', header: 'Tier', width: 9 }, { key: 'calls', header: 'Calls', width: 7, align: 'right' }, { key: 'score', header: 'Score', width: 7 }]}
            maxWidth={grid.left - 2}
          />
        </Box>
      )}
    </Pane>
  ) }];
  const right: PanelSpec[] = [
    { min: liveMin, grow: true, render: h => (
      <Pane title={`◉ Latest Result · ${truncate(latest?.scenarioId ?? 'No runs', latestIdMax)}`} height={h}>
        <LiveTranscriptPanel scenario={curScenario} trial={latestTrial} />
      </Pane>
    ) },
    ...(latestTrial?.trace?.length ? [{ min: 13, render: (hh: number) => <TranscriptStreamPanel trial={latestTrial} height={hh} /> }] : [])
  ];
  return <Split budget={budget} leftPct={50} left={left} right={right} />;
}

interface RankingsViewProps {
  budget: number;
  cfg: BenchmarkConfig;
  results: RunResult[];
}
function RankingsView({ budget, cfg, results }: RankingsViewProps) {
  const { inner } = useGrid(100);
  const ranking = buildRanking(cfg.model || 'unknown', cfg.adapter, cfg.cluster ?? 'single', results);
  const allDims = Object.entries(ranking.dimensions)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(([k, v]) => ({ dimension: titleCase(k), score: `${(Number(v) * 100).toFixed(1)}%` }));
  // Overall row + gap + header leave budget-6 rows for dimension rows.
  const data = allDims.slice(0, Math.max(1, budget - 6));
  const overall = ranking.score * 100;
  return (
    <Fill budget={budget} panels={[{ min: 4, grow: true, render: h => (
      <Pane title="Capability Rankings" height={h}>
        {results.length === 0 ? (
          <StatusMessage variant="info">No results yet — press [r] to run a benchmark.</StatusMessage>
        ) : (
          <Box flexDirection="column" gap={1}>
            <Box gap={1}>
              <Box width={15} flexShrink={0}><Text bold>Overall score</Text></Box>
              <ProgressBar value={Math.round(overall)} width={30} color={TONE_COLOR[scoreTone(overall)]} />
              <Box width={7} flexShrink={0} justifyContent="flex-end"><Text bold>{overall.toFixed(1)}%</Text></Box>
            </Box>
            <Table data={data} columns={[{ key: 'dimension', header: 'Dimension', width: 30 }, { key: 'score', header: 'Score', width: 12, align: 'right' }]} maxWidth={inner - 2} />
          </Box>
        )}
      </Pane>
    ) }]} />
  );
}
function CompareView({ budget, count }: { budget: number; count: number }) {
  return <Fill budget={budget} panels={[{ min: 4, grow: true, render: h => (
    <Pane title="Paired Comparison (McNemar)" height={h}><StatusMessage variant="info">Current run scenarios: {count}</StatusMessage><UnorderedList><UnorderedList.Item><Text>Save two result runs to run exact paired McNemar tests.</Text></UnorderedList.Item><UnorderedList.Item><Text>Run CLI export to generate comparative CSV matrix.</Text></UnorderedList.Item></UnorderedList></Pane>
  ) }]} />;
}
function ProfilesView({ budget }: { budget: number }) {
  const { inner } = useGrid(100);
  const rowCount = Math.max(1, Math.min(PROFILES.length, budget - 4));
  return (
    <Fill budget={budget} panels={[{ min: 4, grow: true, render: h => (
      <Pane title="Benchmark Profiles" height={h}>
        <Table data={PROFILES.slice(0, rowCount).map(p => ({ id: p.id, desc: p.description }))} columns={[{ key: 'id', header: 'Profile ID', width: 22 }, { key: 'desc', header: 'Description', overflow: 'wrap', minWidth: 40 }]} maxWidth={inner - 2} />
      </Pane>
    ) }]} />
  );
}
function HistoryView({ budget, history }: { budget: number; history: HistoryRun[] }) {
  const { inner } = useGrid(100);
  const rowCount = Math.max(1, Math.min(8, budget - 4));
  const data = history.slice(-rowCount).reverse().map(x => ({ date: x.startedAt?.slice(0, 19) ?? '—', model: x.model || '(unknown)', rate: `${(Number(x.summary?.successRate ?? 0) * 100).toFixed(1)}%` }));
  return (
    <Fill budget={budget} panels={[{ min: 4, grow: true, render: h => (
      <Pane title="Run History (Local)" height={h}>
        {data.length
          ? <Table data={data} columns={[{ key: 'date', header: 'Date', width: 24 }, { key: 'model', header: 'Model' }, { key: 'rate', header: 'Success Rate', width: 16, align: 'right' }]} maxWidth={inner - 2} />
          : <StatusMessage variant="warning">No history recorded yet.</StatusMessage>}
      </Pane>
    ) }]} />
  );
}
