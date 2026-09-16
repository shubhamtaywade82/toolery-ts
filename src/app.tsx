import React, {useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import type {BenchmarkConfig, BenchmarkSummary, RunResult} from './types.js';
import {loadScenarios} from './scenarios.js';
import {BenchmarkService} from './benchmark.js';
import {getProfile} from './profiles.js';
import {formatSummary} from './export.js';

export function App({config}: {config: BenchmarkConfig}) {
  const {exit} = useApp();
  const scenarios = useMemo(() => loadScenarios(config.tier === 'all' ? undefined : config.tier), [config.tier]);
  const [results, setResults] = useState<RunResult[]>([]); const [running,setRunning]=useState(false); const [completed,setCompleted]=useState(0); const [error,setError]=useState<string>(); const [summary,setSummary]=useState<BenchmarkSummary>();
  useInput((input,key)=>{ if(input==='q'||key.escape) exit(); if(input==='r'&&!running) void run(); });
  async function run(){
    setRunning(true); setResults([]); setCompleted(0); setError(undefined); setSummary(undefined);
    try { const service=new BenchmarkService(config); const result=await service.run(scenarios,(count,_total,item)=>{setCompleted(count);setResults(prev=>[...prev,item]);}); setResults(result.results); setSummary(result.summary); }
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));} finally{setRunning(false);}
  }
  return <Box flexDirection="column" padding={1} width={108}>
    <Box borderStyle="round" paddingX={2}><Text bold color="cyan">Toolery-TS</Text><Text> · deterministic tool-calling benchmark v{config.benchmarkVersion}</Text></Box>
    <Box marginTop={1} flexDirection="column"><Text>Model: {config.model || '(endpoint default)'}</Text><Text>Endpoint: {config.baseUrl}</Text><Text>Tier: {config.tier} · Trials: {config.trials} · Scenarios: {scenarios.length} · Concurrency: {config.concurrency}</Text><Text>Profile: {getProfile(config.profile).id} · Status: {running ? `running ${completed}/${scenarios.length}` : 'ready'}</Text></Box>
    {error && <Text color="red">Error: {error}</Text>}
    {summary && <Box marginTop={1} flexDirection="column"><Text bold color="green">Benchmark complete</Text>{formatSummary(summary).split('\n').slice(2).map(line=><Text key={line}>{line}</Text>)}</Box>}
    <Box marginTop={1} flexDirection="column"><Text bold>Recent scenarios</Text>{results.slice(-8).map(result=><Text key={result.scenarioId} color={result.successRate===1?'green':'yellow'}>{result.successRate===1?'✓':'·'} {result.scenarioId} {(result.successRate*100).toFixed(0)}% · {result.description}</Text>)}</Box>
    <Box marginTop={1}><Text dimColor>[r] run · [q] quit · profile: {getProfile(config.profile).description}</Text></Box>
  </Box>;
}
