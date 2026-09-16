import type {Scenario, Tier} from './types.js';

const scenarios: Scenario[] = [
  {
    id: 'easy-001',
    tier: 'easy',
    description: 'Select a single tool and preserve its required arguments.',
    prompt: 'Look up the weather for Bengaluru today.',
    expectedToolCalls: [{name: 'get_weather', arguments: {location: 'Bengaluru', date: 'today'}}],
    expectedText: 'The weather lookup was completed.',
    difficulty: 1,
    capabilities: ['parameterPrecision', 'instructionFollowing', 'restraint'],
  },
  {
    id: 'easy-002',
    tier: 'easy',
    description: 'Respect a no-tool instruction.',
    prompt: 'Say hello. Do not call any tools.',
    expectedToolCalls: [],
    expectedText: 'Hello!',
    difficulty: 1,
    capabilities: ['restraint', 'instructionFollowing'],
  },
  {
    id: 'medium-001',
    tier: 'medium',
    description: 'Execute an ordered multi-step tool sequence.',
    prompt: 'Find the current BTC price and then summarize the price in one sentence.',
    expectedToolCalls: [
      {name: 'get_crypto_price', arguments: {symbol: 'BTCUSDT'}},
      {name: 'summarize', arguments: {format: 'one_sentence'}},
    ],
    expectedText: 'The requested price was retrieved and summarized.',
    difficulty: 2,
    capabilities: ['agenticPlanning', 'stateTracking', 'instructionFollowing'],
  },
  {
    id: 'hard-001',
    tier: 'hard',
    description: 'Recover from a failed first attempt without adding unrelated tools.',
    prompt: 'Retrieve my account balance; retry using the backup account endpoint if the primary account endpoint fails.',
    expectedToolCalls: [
      {name: 'get_account_balance', arguments: {account: 'primary'}},
      {name: 'get_account_balance', arguments: {account: 'backup'}},
    ],
    expectedText: 'The balance retrieval completed using the available account endpoint.',
    difficulty: 3,
    capabilities: ['errorRecovery', 'agenticPlanning', 'restraint'],
  },
  {
    id: 'very-hard-001',
    tier: 'very-hard',
    description: 'Maintain constraints across a long tool sequence.',
    prompt: 'Inspect the repository status, identify the failing test, read only the relevant file, and report the smallest safe fix. Do not modify files.',
    expectedToolCalls: [
      {name: 'git_status', arguments: {}},
      {name: 'run_tests', arguments: {}},
      {name: 'read_file', arguments: {path: 'relevant'}},
    ],
    expectedText: 'The failure was inspected and a minimal non-mutating fix was identified.',
    difficulty: 4,
    capabilities: ['agenticPlanning', 'stateTracking', 'instructionFollowing', 'restraint'],
  },
];

export function loadScenarios(tier?: Tier): Scenario[] {
  return tier ? scenarios.filter(scenario => scenario.tier === tier) : scenarios;
}

export function allScenarios(): Scenario[] {
  return [...scenarios];
}
