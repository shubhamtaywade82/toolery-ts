export type Tier = 'easy' | 'medium' | 'hard' | 'very-hard';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ExpectedToolCall extends ToolCall {
  required?: boolean;
}

export interface Scenario {
  id: string;
  tier: Tier;
  description: string;
  prompt: string;
  expectedToolCalls: ExpectedToolCall[];
  expectedText?: string;
  difficulty: number;
  capabilities: CapabilityName[];
}

export interface AdapterResponse {
  text: string;
  toolCalls: ToolCall[];
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
}

export interface ToolCallScore {
  precision: number;
  recall: number;
  f1: number;
  exactMatch: boolean;
  missing: ExpectedToolCall[];
  extra: ToolCall[];
  argumentAccuracy: number;
}

export interface TextScore {
  exactMatch: boolean;
  similarity: number;
}

export interface CapabilityScores {
  agenticPlanning: number;
  errorRecovery: number;
  parameterPrecision: number;
  stateTracking: number;
  instructionFollowing: number;
  restraint: number;
  calibration: number;
}

export type CapabilityName = keyof CapabilityScores;

export interface TrialResult {
  trial: number;
  success: boolean;
  toolCalls: ToolCall[];
  text: string;
  toolCallScore: ToolCallScore;
  textScore: TextScore;
  scores: CapabilityScores;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface RunResult {
  scenarioId: string;
  tier: Tier;
  description: string;
  successRate: number;
  averageDurationMs: number;
  capabilityScores: CapabilityScores;
  trials: TrialResult[];
}

export interface BenchmarkSummary {
  scenarios: number;
  trials: number;
  passedTrials: number;
  successRate: number;
  averageDurationMs: number;
  capabilityScores: CapabilityScores;
}

export interface BenchmarkConfig {
  model: string;
  adapter: 'openai-compatible' | 'mock';
  tier: Tier;
  trials: number;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  profile: string;
}
