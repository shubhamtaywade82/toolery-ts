import type {BenchmarkSummary, CapabilityScores, ExpectedToolCall, Scenario, TextScore, ToolCall, ToolCallScore} from '../types.js';

const CAPS: (keyof CapabilityScores)[] = ['agenticPlanning','errorRecovery','parameterPrecision','stateTracking','instructionFollowing','restraint','calibration'];

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

function argumentAccuracy(expected: Record<string, unknown>, actual: Record<string, unknown>): number {
  const keys = Object.keys(expected);
  if (keys.length === 0) return Object.keys(actual).length === 0 ? 1 : 0;
  return keys.filter(key => stable(expected[key]) === stable(actual[key])).length / keys.length;
}

export function scoreToolCalls(expected: ExpectedToolCall[], actual: ToolCall[]): ToolCallScore {
  const used = new Set<number>(); let matches = 0; let args = 0;
  for (const call of actual) {
    const index = expected.findIndex((candidate, i) => !used.has(i) && candidate.name === call.name);
    if (index >= 0) { used.add(index); matches += 1; args += argumentAccuracy(expected[index].arguments, call.arguments); }
  }
  const precision = actual.length ? matches / actual.length : (expected.length ? 0 : 1);
  const recall = expected.length ? matches / expected.length : (actual.length ? 0 : 1);
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const missing = expected.filter((_, i) => !used.has(i));
  const extra = actual.filter(call => !expected.some(candidate => candidate.name === call.name));
  const exactMatch = expected.length === actual.length && expected.every((item, i) => item.name === actual[i]?.name && stable(item.arguments) === stable(actual[i]?.arguments));
  return {precision, recall, f1, exactMatch, missing, extra, argumentAccuracy: matches ? args / matches : 0};
}

export function scoreText(expected: string | undefined, actual: string): TextScore {
  if (expected === undefined) return {exactMatch: true, similarity: 1};
  if (expected === actual) return {exactMatch: true, similarity: 1};
  const a = new Set(expected.toLowerCase().split(/\W+/).filter(Boolean));
  const b = new Set(actual.toLowerCase().split(/\W+/).filter(Boolean));
  const union = new Set([...a, ...b]).size;
  const intersection = [...a].filter(token => b.has(token)).length;
  return {exactMatch: false, similarity: union ? intersection / union : 1};
}

export function capabilityScores(scenario: Scenario, tool: ToolCallScore, text: TextScore, actualCount: number): CapabilityScores {
  const required = new Set(scenario.capabilities);
  const values: CapabilityScores = {
    agenticPlanning: tool.f1,
    errorRecovery: tool.recall,
    parameterPrecision: tool.argumentAccuracy,
    stateTracking: tool.f1,
    instructionFollowing: text.similarity,
    restraint: actualCount <= scenario.expectedToolCalls.length ? 1 : Math.max(0, scenario.expectedToolCalls.length / actualCount),
    calibration: text.similarity,
  };
  for (const cap of CAPS) if (!required.has(cap)) values[cap] = Math.min(1, values[cap]);
  return values;
}

export function aggregateSummary(results: {success: boolean; durationMs: number; scores: CapabilityScores}[], scenarioCount: number, profile: string, benchmarkVersion: string): BenchmarkSummary {
  const trials = results.length; const passedTrials = results.filter(item => item.success).length;
  return {benchmarkVersion, scenarios: scenarioCount, trials, passedTrials, successRate: trials ? passedTrials / trials : 0,
    averageDurationMs: trials ? results.reduce((sum, item) => sum + item.durationMs, 0) / trials : 0,
    capabilityScores: Object.fromEntries(CAPS.map(cap => [cap, trials ? results.reduce((sum, item) => sum + item.scores[cap], 0) / trials : 0])) as CapabilityScores, profile};
}
