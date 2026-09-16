import assert from 'node:assert/strict';
import test from 'node:test';
import {ScenarioRunner} from '../src/runners/runner.js';
import {loadScenarios} from '../src/scenarios.js';
import type {BenchmarkConfig} from '../src/types.js';

const config:BenchmarkConfig={model:'mock',adapter:'mock',tier:'all',trials:1,baseUrl:'http://localhost:11434/v1',timeoutMs:1000,profile:'default',concurrency:1,benchmarkVersion:'1.0.0',endpointPath:'/chat/completions'};

test('runs an easy no-tool scenario',async()=>{const scenario=loadScenarios('easy').find(s=>s.category==='none')!;const result=await new ScenarioRunner(config).runScenario(scenario);assert.equal(result.successRate,1);assert.equal(result.trials[0].toolCalls.length,0);});
test('runs a multi-step scenario and records tool trace',async()=>{const scenario=loadScenarios('medium')[0];const result=await new ScenarioRunner(config).runScenario(scenario);assert.equal(result.trials[0].toolCalls.length,2);assert.ok(result.trials[0].trace.some(m=>m.role==='tool'));});
