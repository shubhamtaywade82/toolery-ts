export type Tier = 'easy' | 'medium' | 'hard' | 'very-hard';
export type AdapterKind = 'openai-compatible' | 'mock';

export interface JsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ExpectedToolCall extends ToolCall {
  required?: boolean;
  toolResult?: unknown;
  errorResult?: string;
}

export interface Scenario {
  id: string;
  version: string;
  tier: Tier;
  category: string;
  description: string;
  prompt: string;
  tools: ToolDefinition[];
  expectedToolCalls: ExpectedToolCall[];
  expectedText?: string;
  difficulty: number;
  capabilities: CapabilityName[];
  constraints?: string[];
  tags?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}

export interface AdapterRequest {
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
}

export interface AdapterResponse {
  text: string;
  toolCalls: ToolCall[];
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  raw?: unknown;
}

export interface LlmAdapter {
  readonly kind: AdapterKind;
  complete(request: AdapterRequest): Promise<AdapterResponse>;
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
  trace: ChatMessage[];
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
  benchmarkVersion: string;
  scenarios: number;
  trials: number;
  passedTrials: number;
  successRate: number;
  averageDurationMs: number;
  capabilityScores: CapabilityScores;
  profile: string;
}

export interface BenchmarkConfig {
  model: string;
  adapter: AdapterKind;
  tier: Tier | 'all';
  trials: number;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  profile: string;
  concurrency: number;
  benchmarkVersion: string;
  output?: string;
  resume?: string;
  endpointPath: string;
}

export interface Profile {
  id: string;
  description: string;
  weights: Partial<Record<CapabilityName, number>>;
}

export interface HealthProbe {
  reachable: boolean;
  latencyMs: number;
  status?: number;
  models?: string[];
  baseUrl: string;
  error?: string;
}
