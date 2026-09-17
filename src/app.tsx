import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import {
  Page, Tabs, Panel, Columns, KeyValue, Badge, Pill, ProgressBar,
  Spinner, StatusMessage, Alert, Table, SelectableRow, TextInput,
  UnorderedList, type Column
} from '@kud/ink-ui';
import { BenchmarkService } from './benchmark.js';
import { loadScenarios } from './scenarios.js';
import { PROFILES } from './profiles.js';
import { probeEndpoint } from './probe.js';
import { formatSummary } from './export.js';
import { buildRanking } from './rankings.js';
import { appendHistory, loadHistory } from './history.js';
import type { BenchmarkConfig, BenchmarkSummary, HealthProbe, RunResult, Scenario, TrialResult, CapabilityName } from './types.js';

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
  { id: 'preset', label: 'Preset Provider', type: 'select' }, { id: 'baseUrl', label: 'Base URL', type: 'text' }, { id: 'apiKey', label: 'API Key', type: 'text' },
  { id: 'model', label: 'Model', type: 'text' }, { id: 'adapter', label: 'Adapter', type: 'cycle' }, { id: 'tier', label: 'Tier', type: 'cycle' },
  { id: 'trials', label: 'Trials', type: 'number' }, { id: 'concurrency', label: 'Concurrency', type: 'number' }, { id: 'timeoutMs', label: 'Timeout (s)', type: 'number' }, { id: 'withPerf', label: 'Perf Checks', type: 'toggle' },
] as const;
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
    source: c?.source ?? 'synthetic', withPerf: c?.withPerf ?? false, trials: c?.trials ?? 3,
    concurrency: c?.concurrency ?? 1, timeoutMs: c?.timeoutMs ?? 180_000, baseUrl,
    adapter
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

function useRunner(cfg: BenchmarkConfig, scenarios: Scenario[]) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [current, setCurrent] = useState<RunResult | undefined>();
  const [summary, setSummary] = useState<BenchmarkSummary | undefined>();
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => { void loadHistory().then(setHistory); }, []);

  async function execute(modelsToRun: string[]) {
    setRunning(true); setResults([]); setCurrent(undefined); setSummary(undefined); setError(undefined);
    try {
      for (const targetModel of modelsToRun) {
        const mCfg = { ...cfg, model: targetModel };
        const service = new BenchmarkService(mCfg);
        const result = await service.run(scenarios, (_c, _t, item) => { setCurrent(item); setResults(prev => [...prev, item]); });
        setResults(result.results); setSummary(result.summary);
        await appendHistory({
          runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: new Date().toISOString(),
          model: mCfg.model, adapter: mCfg.adapter, source: mCfg.source, tier: mCfg.tier, profile: mCfg.profile,
          cluster: mCfg.cluster, summary: result.summary, results: result.results
        });
        setHistory(await loadHistory());
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setRunning(false); }
  }
  return { running, results, current, summary, history, error, execute };
}

function useAppNav({ tab, setTab, editing, onRun, onProbe, onCycleModel }: any) {
  const { exit } = useApp();
  useInput((input, key) => {
    if (editing) return;
    if (key.escape) return tab === 'Settings' ? setTab('Home') : exit();
    if (input === 'q') return exit();
    if (input === 'r') return onRun();
    if (input === 's') return setTab('Settings');
    if (input === 'p') return onProbe();
    if (input === 'm') return onCycleModel();
    if (key.tab || key.rightArrow) { const i = TABS.indexOf(tab); if (i >= 0) setTab(TABS[(i + 1) % TABS.length]); }
    if (key.leftArrow) { const i = TABS.indexOf(tab); if (i >= 0) setTab(TABS[(i - 1 + TABS.length) % TABS.length]); }
  });
}

function getHints(tab: Tab, editing: boolean): [string, string][] {
  if (editing) return [['Enter', 'Save'], ['Esc', 'Cancel']];
  if (tab === 'Settings') return [['↑/↓', 'Select'], ['Enter', 'Edit'], ['←/→', 'Cycle'], ['p', 'Probe'], ['r', 'Run']];
  return [['←/→', 'Tabs'], ['s', 'Settings'], ['p', 'Probe'], ['m', 'Model'], ['r', 'Run']];
}

export function App({ config }: { config: BenchmarkConfig }) {
  const [cfg, setCfg] = useState(() => sanitizeCfg(config));
  const [tab, setTab] = useState<Tab>('Home');
  const [presetId, setPresetId] = useState<string>(() => findPreset(config));
  const [sfocus, setSfocus] = useState(0);
  const [editing, setEditing] = useState(false);
  const scenarios = useMemo(() => loadScenarios(cfg.tier === 'all' ? undefined : cfg.tier), [cfg.tier]);
  const { probe, probing, trigger } = useProbeState(cfg.baseUrl, cfg.apiKey);
  const runner = useRunner(cfg, scenarios);

  useEffect(() => {
    if (!cfg.model && probe.models?.length) setCfg(c => ({ ...c, model: probe.models![0] }));
  }, [probe.models]);

  const cyclePreset = (dir: number) => {
    const ids = PRESETS.map(p => p.id), nextId = ids[(Math.max(0, ids.indexOf(presetId as any)) + dir + ids.length) % ids.length];
    setPresetId(nextId); const p = PRESETS.find(x => x.id === nextId);
    if (p && p.id !== 'custom') { setCfg(c => ({ ...c, baseUrl: p.baseUrl, adapter: p.adapter })); void trigger(p.baseUrl, cfg.apiKey); }
  };
  const cycleModel = () => {
    if (!probe.models?.length) return;
    const pool = ['all', ...probe.models];
    setCfg(c => ({ ...c, model: pool[(Math.max(0, pool.indexOf(cfg.model)) + 1) % pool.length] }));
  };
  const startRun = () => {
    if (runner.running) return;
    void runner.execute(cfg.model === 'all' ? (probe.models?.length ? probe.models : ['mock']) : [cfg.model || 'mock']);
  };

  useAppNav({ tab, setTab, editing, onRun: startRun, onProbe: () => void trigger(cfg.baseUrl, cfg.apiKey), onCycleModel: cycleModel });

  return (
    <Page title="Toolery-TS" icon="🔧" scope={`v${cfg.benchmarkVersion} · ${cfg.adapter}`} count={scenarios.length} noun="scenario"
      status={{ text: probing ? 'Probing...' : probe.reachable ? `ONLINE (${probe.latencyMs}ms · ${probe.models?.length ?? 0} models)` : 'OFFLINE', tone: probing ? 'busy' : probe.reachable ? 'news' : 'quiet' }}
      tabs={<Tabs active={tab} items={TABS.map(t => ({ value: t, label: t }))} />} hints={getHints(tab, editing)}>
      {runner.error && <Alert variant="error" title="Execution Error"><Text>{runner.error}</Text></Alert>}
      {renderTab({ tab, cfg, setCfg, sfocus, setSfocus, editing, setEditing, presetId, setPresetId, cyclePreset, probe, probing, trigger, runner, scenarios })}
    </Page>
  );
}

function renderTab(p: any) {
  const { tab, cfg, setCfg, sfocus, setSfocus, editing, setEditing, presetId, setPresetId, cyclePreset, probe, probing, trigger, runner, scenarios } = p;
  if (tab === 'Home') return <HomeView cfg={cfg} probe={probe} results={runner.results} total={scenarios.length} running={runner.running} current={runner.current} summary={runner.summary} presetId={presetId} />;
  if (tab === 'Scenarios') return <ScenariosView scenarios={scenarios} results={runner.results} />;
  if (tab === 'Run') return <RunView cfg={cfg} current={runner.current} running={runner.running} completed={runner.results.length} total={scenarios.length} />;
  if (tab === 'Results') return <ResultsView results={runner.results} summary={runner.summary} />;
  if (tab === 'Rankings') return <RankingsView cfg={cfg} results={runner.results} />;
  if (tab === 'Compare') return <CompareView count={runner.results.length} />;
  if (tab === 'Profiles') return <ProfilesView />;
  if (tab === 'History') return <HistoryView history={runner.history} />;
  return <SettingsView cfg={cfg} setCfg={setCfg} sfocus={sfocus} setSfocus={setSfocus} editing={editing} setEditing={setEditing} presetId={presetId} setPresetId={setPresetId} cyclePreset={cyclePreset} probe={probe} probing={probing} trigger={trigger} />;
}

function HomeView({ cfg, probe, results, total, running, current, summary, presetId }: any) {
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const recentData = results.slice(-4).map((r: RunResult) => ({
    id: r.scenarioId, tier: r.tier, status: r.trials.at(-1)?.success ? 'PASS' : 'FAIL', duration: `${((r.trials.at(-1)?.durationMs ?? 0) / 1000).toFixed(1)}s`
  }));
  const recentCols: Column<any>[] = [
    { key: 'id', header: 'Scenario ID', width: 22 }, { key: 'tier', header: 'Tier', width: 10 }, { key: 'status', header: 'Status', width: 8 }, { key: 'duration', header: 'Duration', width: 10 }
  ];
  return (
    <Columns gap={1}>
      <Box width="46%" flexDirection="column">
        <Panel title="⚙ Configuration" focused>
          <KeyValue label="Provider" value={pName} labelWidth={14} /><KeyValue label="Model" value={cfg.model || '(auto)'} labelWidth={14} />
          <KeyValue label="Base URL" value={cfg.baseUrl} labelWidth={14} /><KeyValue label="API Key" value={maskKey(cfg.apiKey)} labelWidth={14} />
          <KeyValue label="Tier" value={<Pill tone="soft" variant={tierTone(cfg.tier)}>{cfg.tier}</Pill>} labelWidth={14} />
          <KeyValue label="Status" value={<Badge variant={probe.reachable ? 'success' : 'error'}>{probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>} labelWidth={14} />
        </Panel>
        <Panel title="▶ Benchmark Progress">
          <ProgressBar value={Math.round((results.length / (total || 1)) * 100)} width={24} color="green" />
          <KeyValue label="Progress" value={`${results.length} / ${total} (${Math.round((results.length / (total || 1)) * 100)}%)`} labelWidth={14} />
        </Panel>
      </Box>
      <Box width="54%" flexDirection="column">
        <Panel title={`Live Run · ${current?.scenarioId ?? 'Ready'}`}>
          {running ? <Spinner label="Executing scenario..." /> : <StatusMessage variant="info">{current ? 'Scenario completed' : 'Ready to start. Press [r].'}</StatusMessage>}
          <TracePanel trial={current?.trials.at(-1)} />
        </Panel>
        <Panel title="▥ Capability Scores">
          {CAPS.slice(0, 4).map(c => <Box key={c}><Text>{c.padEnd(20)}</Text><ProgressBar value={Math.round(Number(summary?.capabilityScores?.[c] ?? 0) * 100)} width={14} /><Text> {(Number(summary?.capabilityScores?.[c] ?? 0) * 100).toFixed(0)}%</Text></Box>)}
        </Panel>
        {recentData.length > 0 && <Panel title="▤ Recent Results"><Table data={recentData} columns={recentCols} /></Panel>}
      </Box>
    </Columns>
  );
}

function TracePanel({ trial }: { trial?: TrialResult }) {
  if (!trial) return <Text dimColor>No tool trace yet. Press [r] to start a benchmark.</Text>;
  if (trial.error) return <Alert variant="error" title="Trial Error"><Text>{trial.error}</Text></Alert>;
  return (
    <Box flexDirection="column">
      <KeyValue label="Tool Calls" value={`${trial.toolCalls.length} calls observed`} labelWidth={14} />
      <KeyValue label="Result" value={trial.success ? 'PASS' : 'FAIL'} labelWidth={14} /><KeyValue label="Accuracy" value={`${(trial.toolCallScore.argumentAccuracy * 100).toFixed(0)}%`} labelWidth={14} />
    </Box>
  );
}

function SettingsView({ cfg, setCfg, sfocus, setSfocus, editing, setEditing, presetId, setPresetId, cyclePreset, probe, probing, trigger }: any) {
  const pName = PRESETS.find(p => p.id === presetId)?.name ?? 'Custom';
  const curField = FIELDS[sfocus];
  useInput((_input, key) => {
    if (editing) return;
    if (key.upArrow) setSfocus((s: number) => (s - 1 + FIELDS.length) % FIELDS.length);
    if (key.downArrow) setSfocus((s: number) => (s + 1) % FIELDS.length);
    if (key.return && curField.type === 'text') setEditing(true);
    if (key.rightArrow || key.leftArrow) {
      const dir = key.rightArrow ? 1 : -1;
      if (curField.id === 'preset') cyclePreset(dir);
      if (curField.id === 'adapter') { const a = ['ollama', 'openai-compatible', 'mock', 'cloud', 'raw', 'hermes']; const next = a[(a.indexOf(cfg.adapter) + dir + a.length) % a.length]; const p = PRESETS.find(x => x.adapter === next); if (p) setPresetId(p.id); setCfg((c: any) => ({ ...c, adapter: next, baseUrl: p?.baseUrl || c.baseUrl })); }
      if (curField.id === 'tier') { const t = ['all', 'easy', 'medium', 'hard', 'very-hard']; setCfg((c: any) => ({ ...c, tier: t[(t.indexOf(c.tier) + dir + t.length) % t.length] })); }
      if (curField.id === 'trials') setCfg((c: any) => ({ ...c, trials: Math.max(1, Math.min(10, c.trials + dir)) }));
      if (curField.id === 'concurrency') setCfg((c: any) => ({ ...c, concurrency: Math.max(1, Math.min(8, c.concurrency + dir)) }));
      if (curField.id === 'timeoutMs') setCfg((c: any) => ({ ...c, timeoutMs: Math.max(10_000, Math.min(600_000, c.timeoutMs + dir * 30_000)) }));
      if (curField.id === 'withPerf') setCfg((c: any) => ({ ...c, withPerf: !c.withPerf }));
    }
  });

  return (
    <Columns gap={1}>
      <Box width="52%" flexDirection="column">
        <Panel title="⚙ Control Panel · Configuration" focused>
          {FIELDS.map((f, i) => (
            <SelectableRow key={f.id} active={i === sfocus} marker=">">
              <Box width={18}><Text bold={i === sfocus} color={i === sfocus ? 'cyan' : 'gray'}>{f.label}</Text></Box>
              {i === sfocus && editing && (f.id === 'baseUrl' || f.id === 'apiKey' || f.id === 'model') ? (
                <TextInput defaultValue={String((cfg as any)[f.id] ?? '')} onSubmit={(v) => { setCfg((c: any) => ({ ...c, [f.id]: v })); setEditing(false); if (f.id !== 'model') void trigger(f.id === 'baseUrl' ? v : cfg.baseUrl, f.id === 'apiKey' ? v : cfg.apiKey); }} onCancel={() => setEditing(false)} />
              ) : (
                <Text bold={i === sfocus}>{f.id === 'preset' ? pName : f.id === 'apiKey' ? maskKey(cfg.apiKey) : f.id === 'timeoutMs' ? `${Math.round(cfg.timeoutMs / 1000)}s` : f.id === 'withPerf' ? (cfg.withPerf ? 'enabled' : 'disabled') : String((cfg as any)[f.id] ?? '')}</Text>
              )}
            </SelectableRow>
          ))}
        </Panel>
      </Box>
      <Box width="48%" flexDirection="column">
        <Panel title="📡 Endpoint Status & Discovered Models">
          <Badge variant={probe.reachable ? 'success' : 'error'}>{probing ? 'PROBING' : probe.reachable ? 'ONLINE' : 'OFFLINE'}</Badge>
          <KeyValue label="Base URL" value={cfg.baseUrl} labelWidth={12} /><KeyValue label="Latency" value={probe.reachable ? `${probe.latencyMs}ms` : '—'} labelWidth={12} />
          <StatusMessage variant={probe.reachable ? 'success' : 'warning'}>{probe.reachable ? `${probe.models?.length ?? 0} models detected` : (probe.error ?? 'Unreachable')}</StatusMessage>
          <Box marginTop={1}><Text dimColor>Discovered: {probe.models?.slice(0, 5).join(', ') || '(none)'}</Text></Box>
        </Panel>
      </Box>
    </Columns>
  );
}

function RunView({ cfg, current, running, completed, total }: any) {
  return <Panel title="Live Run Detail"><KeyValue label="Model" value={cfg.model || '(endpoint default)'} labelWidth={14} /><KeyValue label="Status" value={running ? <Spinner label="Running scenario..." /> : <Badge variant="info">READY</Badge>} labelWidth={14} /><KeyValue label="Progress" value={`${completed} / ${total}`} labelWidth={14} /><TracePanel trial={current?.trials.at(-1)} /></Panel>;
}
function ScenariosView({ scenarios, results }: any) {
  const tableData = scenarios.slice(0, 15).map((s: Scenario) => ({ id: s.id, tier: s.tier, cat: s.category, status: results.find((r: any) => r.scenarioId === s.id)?.trials.at(-1)?.success ? 'PASS' : 'PENDING' }));
  return <Panel title={`Scenarios (${scenarios.length})`}><Table data={tableData} columns={[{ key: 'id', header: 'ID', width: 22 }, { key: 'tier', header: 'Tier', width: 12 }, { key: 'cat', header: 'Category', width: 24 }, { key: 'status', header: 'Status', width: 12 }]} /></Panel>;
}
function ResultsView({ results, summary }: any) {
  return <Panel title="Benchmark Summary">{summary && <Alert variant="success" title="Benchmark Complete"><Text>{formatSummary(summary)}</Text></Alert>}<KeyValue label="Completed" value={`${results.length} scenarios`} labelWidth={14} /><Table data={results.slice(-8).reverse().map((r: any) => ({ id: r.scenarioId, tier: r.tier, calls: `${r.trials.at(-1)?.toolCalls.length ?? 0}`, score: r.trials.at(-1)?.success ? 'PASS' : 'FAIL' }))} columns={[{ key: 'id', header: 'Scenario ID', width: 24 }, { key: 'tier', header: 'Tier', width: 12 }, { key: 'calls', header: 'Calls', width: 10 }, { key: 'score', header: 'Score', width: 10 }]} /></Panel>;
}
function RankingsView({ cfg, results }: any) {
  const ranking = buildRanking(cfg.model || 'unknown', cfg.adapter, cfg.cluster, results);
  const data = Object.entries(ranking.dimensions).map(([k, v]) => ({ dimension: k, score: `${(Number(v) * 100).toFixed(0)}%` }));
  return <Panel title="Capability Rankings"><Alert variant="info" title={`Overall Score: ${(ranking.score * 100).toFixed(1)}%`}><ProgressBar value={Math.round(ranking.score * 100)} width={30} color="green" /></Alert><Table data={data} columns={[{ key: 'dimension', header: 'Dimension', width: 28 }, { key: 'score', header: 'Score', width: 14 }]} /></Panel>;
}
function CompareView({ count }: { count: number }) {
  return <Panel title="Paired Comparison (McNemar)"><StatusMessage variant="info">Current run scenarios: {count}</StatusMessage><UnorderedList><UnorderedList.Item><Text>Save two result runs to run exact paired McNemar tests.</Text></UnorderedList.Item><UnorderedList.Item><Text>Run CLI export to generate comparative CSV matrix.</Text></UnorderedList.Item></UnorderedList></Panel>;
}
function ProfilesView() {
  return <Panel title="Benchmark Profiles"><Table data={PROFILES.map(p => ({ id: p.id, desc: p.description }))} columns={[{ key: 'id', header: 'Profile ID', width: 22 }, { key: 'desc', header: 'Description', width: 60 }]} /></Panel>;
}
function HistoryView({ history }: { history: any[] }) {
  const data = history.slice(-8).reverse().map(x => ({ date: x.startedAt?.slice(0, 19) ?? '—', model: x.model || '(unknown)', rate: `${(Number(x.summary?.successRate ?? 0) * 100).toFixed(1)}%` }));
  return <Panel title="Run History (Local)">{data.length ? <Table data={data} columns={[{ key: 'date', header: 'Date', width: 24 }, { key: 'model', header: 'Model', width: 24 }, { key: 'rate', header: 'Success Rate', width: 16 }]} /> : <StatusMessage variant="warning">No history recorded yet.</StatusMessage>}</Panel>;
}
