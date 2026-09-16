import type {
  BenchmarkSummary,
  CapabilityScores,
  ExpectedToolCall,
  Scenario,
  TextScore,
  ToolCall,
  ToolCallScore,
} from '../types.js';

const CAPABILITIES: (keyof CapabilityScores)[] = [
  'agenticPlanning',
  'errorRecovery',
  'parameterPrecision',
  'stateTracking',
  'instructionFollowing',
  'restraint',
  'calibration',
];

function normalize(value: unknown): string {
  return JSON.stringify(value, Object.keys((value ?? {}) as object).sort());
}

function argumentAccuracy(expected: Record<string, unknown>, actual: Record<string, unknown>): number {
  const keys = Object.keys(expected);
  if (keys.length === 0) return 1;
  const matches = keys.filter(key => normalize(expected[key]) === normalize(actual[key]));
  return matches.length / keys.length;
}

export function scoreToolCalls(expected: ExpectedToolCall[], actual: ToolCall[]): ToolCallScore {
  const matchedExpected = new Set<number>();
  let matches = 0;
  let argScore = 0;

  for (const call of actual) {
    const index = expected.findIndex((candidate, i) =>
      !matchedExpected.has(i) && candidate.name === call.name,
    );
    if (index >= 0) {
      matchedExpected.add(index);
      matches += 1;
      argScore += argumentAccuracy(expected[index].arguments, call.arguments);
    }
  }

  const precision = actual.length === 0 ? (expected.length === 0 ? 1 : 0) : matches / actual.length;
  const recall = expected.length === 0 ? (actual.length === 0 ? 1 : 0) : matches / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const missing = expected.filter((_, i) => !matchedExpected.has(i));
  const extra = actual.filter(call => !expected.some(candidate => candidate.name === call.name));
  const exactMatch = expected.length === actual.length && expected.every((candidate, i) => {
    const call = actual[i];
    return call?.name === candidate.name && normalize(call.arguments) === normalize(candidate.arguments);
  });

  return {
    precision,
    recall,
    f1,
    exactMatch,
    missing,
    extra,
    argumentAccuracy: matches === 0 ? 0 : argScore / matches,
  };
}

export function scoreText(expected: string | undefined, actual: string): TextScore {
  if (expected === undefined) return {exactMatch: true, similarity: 1};
  if (expected === actual) return {exactMatch: true, similarity: 1};
  const a = new Set(expected.toLowerCase().split(/\W+/).filter(Boolean));
  const b = new Set(actual.toLowerCase().split(/\W+/).filter(Boolean));
  const union = new Set([...a, ...b]).size;
  const intersection = [...a].filter(token => b.has(token)).length;
  return {exactMatch: false, similarity: union === 0 ? 1 : intersection / union};
}

export function capabilityScores(scenario: Scenario, tool: ToolCallScore, text: TextScore, actualCount: number): CapabilityScores {
  const active = new Set(scenario.capabilities);
  const base = {
    agenticPlanning: tool.f1,
    errorRecovery: tool.recall,
    parameterPrecision: tool.argumentAccuracy,
    stateTracking: tool.f1,
    instructionFollowing: text.similarity,
    restraint: actualCount <= scenario.expectedToolCalls.length ? 1 : Math.max(0, scenario.expectedToolCalls.length / actualCount),
    calibration: text.similarity,
  } satisfies CapabilityScores;

  for (const capability of CAPABILITIES) {
    if (!active.has(capability)) base[capability] = Math.min(base[capability], 1);
  }
  return base;
}

export function aggregateSummary(results: {success: boolean; durationMs: number; scores: CapabilityScores}[], scenarioCount: number): BenchmarkSummary {
  const count = results.length;
  const scores = Object.fromEntries(CAPABILITIES.map(capability => [
    capability,
    count === 0 ? 0 : results.reduce((sum, item) => sum + item.scores[capability], 0) / count,
  ])) as CapabilityScores;

  return {
    scenarios: scenarioCount,
    trials: count,
    passedTrials: results.filter(item => item.success).length,
    successRate: count === 0 ? 0 : results.filter(item => item.success).length / count,
    averageDurationMs: count === 0 ? 0 : results.reduce((sum, item) => sum + item.durationMs, 0) / count,
    capabilityScores: scores,
  };
}
