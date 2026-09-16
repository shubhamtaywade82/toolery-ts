#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import {readFile} from 'node:fs/promises';
import {App} from './app.js';
import {parseConfig} from './utils/config.js';
import {loadScenarios} from './scenarios.js';
import {PROFILES} from './profiles.js';
import {probeEndpoint} from './probe.js';
import {exportCsv} from './export.js';
import type {RunResult} from './types.js';

const cli=meow(`
  Usage
    $ toolery run [options]
    $ toolery tui [options]
    $ toolery profiles
    $ toolery scenarios [--tier <tier>]
    $ toolery probe --base-url <url>
    $ toolery export --input <result.json> --output <result.csv>

  Options
    --model          Model name
    --adapter        openai-compatible | mock
    --tier           all | easy | medium | hard | very-hard
    --trials         Trials per scenario (1-100)
    --base-url       OpenAI-compatible /v1 endpoint
    --profile        default | agentic-coding | structured-output | chatbot
    --timeout        Request timeout in milliseconds
    --concurrency    Concurrent scenarios (1-32)
    --output         Resumable JSON output path
    --resume         Existing JSON result path to resume
    --input          JSON benchmark result to export
`,{importMeta:import.meta,flags:{model:{type:'string'},adapter:{type:'string',default:'openai-compatible'},tier:{type:'string',default:'all'},trials:{type:'number',default:3},baseUrl:{type:'string',default:'http://localhost:11434/v1'},profile:{type:'string',default:'default'},timeout:{type:'number',default:30_000},concurrency:{type:'number',default:1},output:{type:'string'},resume:{type:'string'},input:{type:'string'}}});
const command=cli.input[0]??'run';
try{
 if(command==='profiles'){for(const p of PROFILES)console.log(`${p.id}\t${p.description}`);process.exit(0);}
 if(command==='scenarios'){const tier=cli.flags.tier==='all'?undefined:cli.flags.tier as any;for(const s of loadScenarios(tier))console.log(`${s.id}\t${s.tier}\t${s.category}\t${s.description}`);process.exit(0);}
 if(command==='probe'){const result=await probeEndpoint(String(cli.flags.baseUrl));console.log(JSON.stringify(result,null,2));process.exit(result.reachable?0:1);}
 if(command==='export'){if(!cli.flags.input||!cli.flags.output)throw new Error('export requires --input and --output');const snapshot=JSON.parse(await readFile(cli.flags.input,'utf8')) as {results:RunResult[]};await exportCsv(cli.flags.output,snapshot.results);console.log(`Wrote ${cli.flags.output}`);process.exit(0);}
 if(command!=='run'&&command!=='tui')cli.showHelp(1);
 render(<App config={parseConfig(cli.flags)}/>);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exit(1);}
