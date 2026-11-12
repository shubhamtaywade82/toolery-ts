import { createHash } from 'node:crypto';
import type {
  AdapterRequest,
  AdapterResponse,
  BenchmarkConfig,
  CapabilityScores,
  ChatMessage,
  CostSource,
  LlmAdapter,
  RequestIntent,
  RunResult,
  Scenario,
  Tier,
  ToolCall,
  ToolResponseRule,
  TrialResult,
} from '../types.js';
import { capabilityScores, scoreText, scoreToolCalls } from '../utils/scoring.js';
import { evaluateContract } from '../utils/contract-scoring.js';
import { CloudAdapter, HermesAdapter, OllamaAdapter, OpenAICompatibleAdapter, RawAdapter } from './adapters.js';
import { NexumHarnessError, NexumInferenceAdapter } from './nexum-adapter.js';
import { ScriptedMockAdapter } from './mock-adapter.js';

/** A scenario tier's task class for the Nexum host (N-12): harder scenarios use the stronger lane. */
export const TASK_CLASS_FOR_TIER: Readonly<Record<Tier, RequestIntent['taskClass']>> = {
  easy: 'routine',
  medium: 'complex',
  hard: 'debugging',
  'very-hard': 'architecture',
};

/**
 * A run's identity, derived from what makes its trials comparable. The same configuration gives the same identity, so
 * a resumed run repeats the same idempotency keys, and the host refuses any turn it already ran. Trial count,
 * concurrency and output paths are not part of it: changing them keeps the identity.
 */
export function deriveRunId(config: BenchmarkConfig): string {
  const identity = {
    benchmarkVersion: config.benchmarkVersion,
    adapter: config.adapter,
    model: config.model,
    tier: config.tier,
    profile: config.profile,
    source: config.source,
    cluster: config.cluster ?? 'single',
    numCtx: config.numCtx ?? null,
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}

function adapterFor(config: BenchmarkConfig): LlmAdapter {
  if (config.adapter === 'mock') return new ScriptedMockAdapter();
  if (config.adapter === 'cloud') return new CloudAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs });
  if (config.adapter === 'raw') return new RawAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs });
  if (config.adapter === 'hermes') return new HermesAdapter();
  if (config.adapter === 'ollama') {
    return new OllamaAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs, numCtx: config.numCtx, keepAlive: config.keepAlive });
  }
  if (config.adapter === 'nexum') return new NexumInferenceAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs });
  return new OpenAICompatibleAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs });
}

/**
 * A running total over a trial's turns. It stays undefined unless every turn reported the figure: a total with a missing
 * turn would undercount, and an undercount is a claim the provider did not make.
 */
class Sum {
  private total = 0;
  private complete = true;
  private seen = false;
  add(value: number | undefined): void {
    this.seen = true;
    if (value === undefined) this.complete = false;
    else this.total += value;
  }
  value(): number | undefined {
    return this.seen && this.complete ? this.total : undefined;
  }
  /** Whether any turn was recorded at all, whether or not it carried the figure. */
  wasRecorded(): boolean {
    return this.seen;
  }
}

class UsageTotals {
  private readonly input = new Sum();
  private readonly output = new Sum();
  private readonly cached = new Sum();
  private readonly cost = new Sum();
  private routedModel: string | undefined;
  private providerCost = false;

  add(response: AdapterResponse): void {
    this.input.add(response.inputTokens);
    this.output.add(response.outputTokens);
    this.cached.add(response.cachedInputTokens);
    this.cost.add(response.costUsd);
    if (response.costSource === 'PROVIDER') this.providerCost = true;
    this.routedModel = response.routedModel ?? this.routedModel;
  }

  toTrial(): Pick<TrialResult, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'costUsd' | 'costSource' | 'routedModel'> {
    const costUsd = this.cost.value();
    const costSource: CostSource | undefined = this.cost.wasRecorded() ? (costUsd !== undefined ? 'PROVIDER' : 'NONE') : undefined;
    return {
      inputTokens: this.input.value(),
      outputTokens: this.output.value(),
      cachedInputTokens: this.cached.value(),
      costUsd: this.providerCost ? costUsd : undefined,
      costSource,
      routedModel: this.routedModel,
    };
  }
}

export class ScenarioRunner {
  private readonly adapter: LlmAdapter;
  private readonly runId: string;

  constructor(private readonly config: BenchmarkConfig) {
    this.adapter = adapterFor(config);
    this.runId = deriveRunId(config);
  }

  async runScenario(scenario: Scenario): Promise<RunResult> {
    const trials: TrialResult[] = [];
    for (let trial = 1; trial <= this.config.trials; trial++) trials.push(await this.runTrial(scenario, trial));
    // A trial the host refused or could not settle is not the model's behaviour: it leaves the pass rate (T-3).
    const scored = trials.filter((t) => t.harnessStatus === undefined);
    return {
      scenarioId: scenario.id,
      tier: scenario.tier,
      description: scenario.description,
      category: scenario.category,
      adapter: this.config.adapter,
      cluster: this.config.cluster,
      successRate: scored.length ? scored.filter((t) => t.success).length / scored.length : 0,
      averageDurationMs: trials.reduce((s, t) => s + t.durationMs, 0) / trials.length,
      capabilityScores: averageScores(scored),
      trials,
    };
  }

  private async runTrial(scenario: Scenario, trial: number): Promise<TrialResult> {
    const trace: ChatMessage[] = [
      {
        role: 'system',
        content: scenario.systemPrompt ?? 'You are being benchmarked for deterministic tool use. Follow the user exactly. Use only supplied tools. Never invent tool results.',
      },
      { role: 'user', content: scenario.prompt },
    ];
    const calls: ToolCall[] = [];
    let text = '';
    let durationMs = 0;
    const usage = new UsageTotals();
    const maxRounds = scenario.budget?.maxTurns ?? Math.max(2, scenario.expectedToolCalls.length + 2);
    const started = performance.now();
    try {
      for (let round = 0; round < maxRounds; round++) {
        const req: AdapterRequest = {
          model: this.config.model || 'mock-model',
          messages: trace,
          tools: scenario.tools,
          toolChoice: 'auto',
          temperature: 0,
          intent: {
            taskId: `${scenario.id}:${trial}`,
            idempotencyKey: `${this.runId}:${scenario.id}:${trial}:${round}`,
            taskClass: TASK_CLASS_FOR_TIER[scenario.tier],
          },
        };
        const response = await this.adapter.complete(req);
        durationMs += response.durationMs;
        usage.add(response);
        if (response.text) text = response.text;
        if (!response.toolCalls.length) break;
        // Normalize ids up front so assistant tool_calls and tool-result messages reference the SAME id: OpenAI-compatible
        // servers correlate results by tool_call_id and reject the loop when an endpoint returns tool calls without ids.
        const responded: ToolCall[] = response.toolCalls.map((raw, i) => ({ ...raw, id: raw.id ?? `call-${round}-${i}` }));
        trace.push({ role: 'assistant', content: response.text || '', toolCalls: responded });
        for (const raw of responded) {
          const call: ToolCall = { ...raw, batch: round, index: calls.length };
          const result = resolveToolResult(scenario, call, calls.length);
          call.result = result;
          call.resultKind = typeof result === 'object' && result !== null && 'error' in result ? 'error' : typeof result === 'string' ? 'text' : 'json';
          calls.push(call);
          trace.push({
            role: 'tool',
            toolCallId: call.id ?? `call-${calls.length}`,
            name: call.name,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
      }
      const toolCallScore = scoreToolCalls(scenario.expectedToolCalls, calls);
      const textScore = scoreText(scenario.expectedText, text);
      const contract = evaluateContract(scenario, calls, text, trace);
      const scores = capabilityScores(scenario, toolCallScore, textScore, calls.length);
      if (scenario.scoring) {
        scores.correctness = contract.pass ? 1 : contract.partial;
        scores.instructionFollowing = Math.max(scores.instructionFollowing, contract.pass ? 1 : contract.partial);
        scores.restraint = Math.max(scores.restraint, contract.pass ? 1 : contract.partial);
      }
      const success = scenario.scoring
        ? contract.pass
        : toolCallScore.exactMatch && (scenario.expectedText === undefined || scenario.expectedToolCalls.length > 0 || textScore.similarity >= 0.8);
      return {
        trial,
        success,
        toolCalls: calls,
        text,
        toolCallScore,
        textScore,
        scores,
        durationMs: durationMs || performance.now() - started,
        ...usage.toTrial(),
        trace,
        checks: contract.details.map((check) => ({ check })),
      };
    } catch (error) {
      return {
        trial,
        success: false,
        toolCalls: calls,
        text,
        toolCallScore: scoreToolCalls(scenario.expectedToolCalls, calls),
        textScore: scoreText(scenario.expectedText, text),
        scores: zeroScores(),
        durationMs: durationMs || performance.now() - started,
        ...usage.toTrial(),
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof NexumHarnessError ? { harnessStatus: error.harnessStatus } : {}),
        trace,
      };
    }
  }
}

function resolveToolResult(scenario: Scenario, call: ToolCall, index: number): unknown {
  const rules: ToolResponseRule[] = scenario.toolResponses?.[call.name] ?? [];
  const matches = (r: ToolResponseRule) =>
    r.match === undefined ||
    r.match === 'any' ||
    (r.match && typeof r.match === 'object' &&
      Object.entries(r.match as Record<string, unknown>).every(([k, v]) => {
        if (k.endsWith('_regex')) {
          const param = k.slice(0, -6);
          return new RegExp(String(v), 'i').test(String(call.arguments[param] ?? ''));
        }
        return JSON.stringify(call.arguments[k]) === JSON.stringify(v);
      }));
  const exact = rules.find((r) => r.callIndex === index && matches(r));
  const rule = exact ?? rules.find((r) => matches(r));
  if (!rule) {
    return scenario.expectedToolCalls[index]?.errorResult ?? scenario.expectedToolCalls[index]?.toolResult ?? { ok: true, tool: call.name, arguments: call.arguments, status: 'completed' };
  }
  return rule.error ?? rule.returns ?? (rule as { returns_with_injection?: unknown }).returns_with_injection ?? { ok: true };
}

/** Averages over the trials given. Callers pass only scored trials, so an excluded trial never dilutes a score. */
function averageScores(trials: TrialResult[]): CapabilityScores {
  const keys = Object.keys(zeroScores()) as Array<keyof CapabilityScores>;
  return Object.fromEntries(keys.map((k) => [k, trials.reduce((s, t) => s + t.scores[k], 0) / Math.max(1, trials.length)])) as unknown as CapabilityScores;
}

function zeroScores(): CapabilityScores {
  return {
    coding: 0, debugging: 0, agenticPlanning: 0, safety: 0, adversarialRobustness: 0, restraint: 0, errorRecovery: 0,
    parameterPrecision: 0, stateTracking: 0, structuredOutput: 0, toolSelection: 0, instructionFollowing: 0, longContext: 0,
    localization: 0, budgetDiscipline: 0, terminalHandling: 0, calibration: 0, correctness: 0,
  };
}
