import type {AdapterResponse, BenchmarkConfig, RunResult, Scenario, TrialResult} from '../types.js';
import {capabilityScores, scoreText, scoreToolCalls} from '../utils/scoring.js';
import {MockAdapter, OpenAICompatibleAdapter, type LlmAdapter} from './adapters.js';

export class ScenarioRunner {
  private readonly adapter: LlmAdapter;

  constructor(private readonly config: BenchmarkConfig) {
    this.adapter = config.adapter === 'mock'
      ? new MockAdapter()
      : new OpenAICompatibleAdapter(config.baseUrl, config.model, config.apiKey, config.timeoutMs);
  }

  async runScenario(scenario: Scenario): Promise<RunResult> {
    const trials: TrialResult[] = [];

    for (let trial = 1; trial <= this.config.trials; trial += 1) {
      trials.push(await this.runTrial(scenario, trial));
    }

    return {
      scenarioId: scenario.id,
      tier: scenario.tier,
      description: scenario.description,
      successRate: trials.filter(result => result.success).length / trials.length,
      averageDurationMs: trials.reduce((sum, result) => sum + result.durationMs, 0) / trials.length,
      capabilityScores: averageScores(trials),
      trials,
    };
  }

  private async runTrial(scenario: Scenario, trial: number): Promise<TrialResult> {
    try {
      const response = await this.adapter.run(scenario);
      return evaluate(scenario, response, trial);
    } catch (error) {
      return {
        trial,
        success: false,
        toolCalls: [],
        text: '',
        toolCallScore: scoreToolCalls(scenario.expectedToolCalls, []),
        textScore: scoreText(scenario.expectedText, ''),
        scores: zeroScores(),
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function evaluate(scenario: Scenario, response: AdapterResponse, trial: number): TrialResult {
  const toolCallScore = scoreToolCalls(scenario.expectedToolCalls, response.toolCalls);
  const textScore = scoreText(scenario.expectedText, response.text);
  const scores = capabilityScores(scenario, toolCallScore, textScore, response.toolCalls.length);
  const success = toolCallScore.exactMatch && (scenario.expectedText === undefined || textScore.exactMatch);

  return {
    trial,
    success,
    toolCalls: response.toolCalls,
    text: response.text,
    toolCallScore,
    textScore,
    scores,
    durationMs: response.durationMs,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}

function averageScores(trials: TrialResult[]): TrialResult['scores'] {
  const keys = Object.keys(zeroScores()) as Array<keyof TrialResult['scores']>;
  return Object.fromEntries(keys.map(key => [
    key,
    trials.reduce((sum, trial) => sum + trial.scores[key], 0) / trials.length,
  ])) as TrialResult['scores'];
}

function zeroScores(): TrialResult['scores'] {
  return {
    agenticPlanning: 0,
    errorRecovery: 0,
    parameterPrecision: 0,
    stateTracking: 0,
    instructionFollowing: 0,
    restraint: 0,
    calibration: 0,
  };
}
