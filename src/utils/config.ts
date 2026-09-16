import type {BenchmarkConfig, Tier} from '../types.js';

const tiers: Tier[] = ['easy', 'medium', 'hard', 'very-hard'];

export function parseConfig(flags: Record<string, unknown>): BenchmarkConfig {
  const tier = String(flags.tier ?? process.env.TOOLERY_TIER ?? 'easy') as Tier;
  if (!tiers.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}. Expected ${tiers.join(', ')}`);
  }

  const trials = Number(flags.trials ?? process.env.TOOLERY_TRIALS ?? 3);
  if (!Number.isInteger(trials) || trials < 1 || trials > 100) {
    throw new Error('Trials must be an integer between 1 and 100.');
  }

  const adapterValue = String(flags.adapter ?? process.env.TOOLERY_ADAPTER ?? 'openai-compatible');
  if (adapterValue !== 'openai-compatible' && adapterValue !== 'mock') {
    throw new Error('Adapter must be openai-compatible or mock.');
  }

  return {
    model: String(flags.model ?? process.env.TOOLERY_MODEL ?? 'mock'),
    adapter: adapterValue,
    tier,
    trials,
    baseUrl: String(flags.baseUrl ?? process.env.TOOLERY_BASE_URL ?? 'http://localhost:11434/v1'),
    apiKey: process.env.TOOLERY_API_KEY,
    timeoutMs: Number(flags.timeout ?? process.env.TOOLERY_TIMEOUT_MS ?? 30_000),
    profile: String(flags.profile ?? process.env.TOOLERY_PROFILE ?? 'default'),
  };
}
