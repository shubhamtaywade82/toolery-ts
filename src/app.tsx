import React, {useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import type {BenchmarkConfig, CapabilityScores, RunResult} from './types.js';
import {loadScenarios} from './scenarios.js';
import {ScenarioRunner} from './runners/runner.js';

export function App({config}: {config: BenchmarkConfig}) {
  const {exit} = useApp();
  const scenarios = useMemo(() => loadScenarios(config.tier), [config.tier]);
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit();
    if (input === 'r' && !running) void run();
  });

  async function run() {
    setRunning(true);
    setResults([]);
    setError(undefined);
    const runner = new ScenarioRunner(config);
    const next: RunResult[] = [];
    try {
      for (let i = 0; i < scenarios.length; i += 1) {
        setIndex(i);
        const result = await runner.runScenario(scenarios[i]);
        next.push(result);
        setResults([...next]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  const summary = summarize(results);

  return (
    <Box flexDirection="column" padding={1} width={90}>
      <Box borderStyle="round" paddingX={2}>
        <Text bold color="cyan">Toolery-TS</Text>
        <Text>  deterministic tool-calling benchmark</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>Model: {config.model}</Text>
        <Text>Endpoint: {config.baseUrl}</Text>
        <Text>Tier: {config.tier} · Trials: {config.trials} · Scenarios: {scenarios.length}</Text>
        <Text>Status: {running ? `running ${index + 1}/${scenarios.length}` : 'ready'}</Text>
      </Box>
      {error && <Text color="red">Error: {error}</Text>}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Results</Text>
        <Text>Success rate: {(summary.successRate * 100).toFixed(1)}%</Text>
        <Text>Passed trials: {summary.passedTrials}/{summary.trials}</Text>
        <Text>Average latency: {summary.averageDurationMs.toFixed(0)} ms</Text>
        <Text>Capabilities: {formatCapabilities(summary.capabilityScores)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {results.slice(-6).map(result => (
          <Text key={result.scenarioId} color={result.successRate === 1 ? 'green' : 'yellow'}>
            {result.successRate === 1 ? '✓' : '·'} {result.scenarioId} {(result.successRate * 100).toFixed(0)}% {result.description}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}><Text dimColor>[r] run  [q] quit</Text></Box>
    </Box>
  );
}

function summarize(results: RunResult[]) {
  const trials = results.reduce((sum, result) => sum + result.trials.length, 0);
  const passedTrials = results.reduce((sum, result) => sum + result.trials.filter(trial => trial.success).length, 0);
  const scores = Object.keys(results[0]?.capabilityScores ?? {}).reduce((acc, key) => {
    const values = results.map(result => result.capabilityScores[key as keyof CapabilityScores]);
    acc[key as keyof CapabilityScores] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return acc;
  }, {
    agenticPlanning: 0,
    errorRecovery: 0,
    parameterPrecision: 0,
    stateTracking: 0,
    instructionFollowing: 0,
    restraint: 0,
    calibration: 0,
  } as CapabilityScores);
  return {
    trials,
    passedTrials,
    successRate: trials === 0 ? 0 : passedTrials / trials,
    averageDurationMs: results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.averageDurationMs, 0) / results.length,
    capabilityScores: scores,
  };
}

function formatCapabilities(scores: CapabilityScores) {
  return `planning ${(scores.agenticPlanning * 100).toFixed(0)}% · params ${(scores.parameterPrecision * 100).toFixed(0)}% · state ${(scores.stateTracking * 100).toFixed(0)}% · restraint ${(scores.restraint * 100).toFixed(0)}%`;
}
