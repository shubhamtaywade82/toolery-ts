#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import {App} from './app.js';
import {parseConfig} from './utils/config.js';
import {loadScenarios} from './scenarios.js';

const cli = meow(`
  Usage
    $ toolery run [options]
    $ toolery profiles
    $ toolery scenarios

  Options
    --model       Model name
    --adapter     openai-compatible | mock (default: openai-compatible)
    --tier        easy | medium | hard | very-hard (default: easy)
    --trials      Trials per scenario (default: 3)
    --base-url    OpenAI-compatible /v1 endpoint (default: http://localhost:11434/v1)
    --profile     Display profile (default: default)
    --timeout     Request timeout in milliseconds (default: 30000)

  Environment
    TOOLERY_MODEL, TOOLERY_ADAPTER, TOOLERY_TIER, TOOLERY_TRIALS,
    TOOLERY_BASE_URL, TOOLERY_API_KEY, TOOLERY_PROFILE, TOOLERY_TIMEOUT_MS
`, {
  importMeta: import.meta,
  flags: {
    model: {type: 'string'},
    adapter: {type: 'string', default: 'openai-compatible'},
    tier: {type: 'string', default: 'easy'},
    trials: {type: 'number', default: 3},
    baseUrl: {type: 'string', default: 'http://localhost:11434/v1'},
    profile: {type: 'string', default: 'default'},
    timeout: {type: 'number', default: 30_000},
  },
});

const command = cli.input[0] ?? 'run';

try {
  if (command === 'profiles') {
    console.log('Profiles: default');
    process.exit(0);
  }

  if (command === 'scenarios') {
    for (const scenario of loadScenarios()) {
      console.log(`${scenario.id}\t${scenario.tier}\t${scenario.description}`);
    }
    process.exit(0);
  }

  if (command !== 'run') {
    cli.showHelp(1);
  }

  const config = parseConfig(cli.flags);
  render(<App config={config}/>);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
