import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {BenchmarkService} from '../src/benchmark.js';
import {exportCsv} from '../src/export.js';
import {NEXUM_ROUTING_VERSION} from '../src/runners/nexum-adapter.js';
import {ScenarioRunner} from '../src/runners/runner.js';
import {loadScenarios} from '../src/scenarios.js';
import {parseConfig,CLOUD_CONCURRENCY_CAP} from '../src/utils/config.js';
import {aggregateSummary} from '../src/utils/scoring.js';
import type {BenchmarkConfig,RunResult,TrialResult} from '../src/types.js';

const SCORES=Object.fromEntries(Object.keys(aggregateSummary([],0,'p','v').capabilityScores).map(k=>[k,1]));
const trial=(success:boolean,harnessStatus?:TrialResult['harnessStatus'])=>({success,durationMs:1,scores:SCORES as never,harnessStatus});

test('a refused or unknown turn leaves the pass rate: it is counted apart, never as a failure (T-3)',()=>{
  const summary=aggregateSummary([trial(true),trial(true),trial(false),trial(false,'BUDGET_EXCEEDED'),trial(false,'PROVIDER_TIMEOUT_UNKNOWN')],1,'default','1.0.0');
  assert.equal(summary.trials,3);
  assert.equal(summary.passedTrials,2);
  assert.ok(Math.abs(summary.successRate-2/3)<1e-9);
  assert.equal(summary.harnessExcluded,2);
  assert.deepEqual(summary.harnessByStatus,{BUDGET_EXCEEDED:1,PROVIDER_TIMEOUT_UNKNOWN:1});
});

test('a run whose every turn was refused has no pass rate to report, and does not show zero passes',()=>{
  const summary=aggregateSummary([trial(false,'BUDGET_EXCEEDED')],1,'default','1.0.0');
  assert.equal(summary.trials,0);assert.equal(summary.successRate,0);assert.equal(summary.harnessExcluded,1);
});

test('a budget refusal on the host is excluded from the scenario pass rate of the runner',async()=>{
  const server:Server=createServer((_req:IncomingMessage,res:ServerResponse)=>{res.writeHead(402,{'content-type':'application/json'});res.end(JSON.stringify({status:'BUDGET_EXCEEDED',message:'over cap'}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as {port:number}).port;
  try{
    const config:BenchmarkConfig={model:'',adapter:'nexum',tier:'all',trials:2,baseUrl:`http://127.0.0.1:${port}`,timeoutMs:5000,profile:'default',concurrency:1,benchmarkVersion:'1.0.0',endpointPath:'/v1/inference',source:'synthetic',routingVersion:NEXUM_ROUTING_VERSION};
    const scenario=loadScenarios('easy').find(s=>s.category==='none')!;
    const result=await new ScenarioRunner(config).runScenario(scenario);
    assert.ok(result.trials.every(t=>t.harnessStatus==='BUDGET_EXCEEDED'));
    assert.equal(result.successRate,0);
    assert.equal(result.trials[0]!.inputTokens,undefined);
    assert.equal(result.trials[0]!.costSource,undefined);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('the cloud-routed adapters are capped at three concurrent calls (T-4)',()=>{
  assert.equal(CLOUD_CONCURRENCY_CAP,3);
  assert.throws(()=>parseConfig({adapter:'nexum',concurrency:4}),/capped at 3/);
  assert.throws(()=>parseConfig({adapter:'cloud',apiKey:'k',concurrency:4}),/capped at 3/);
  assert.doesNotThrow(()=>parseConfig({adapter:'ollama',concurrency:8}));
  const cfg=parseConfig({adapter:'nexum',concurrency:3});
  assert.equal(cfg.baseUrl,'http://127.0.0.1:3777');
  assert.equal(cfg.routingVersion,NEXUM_ROUTING_VERSION);
  assert.equal(parseConfig({adapter:'ollama'}).routingVersion,undefined);
});

test('a resume refuses a snapshot taken by another adapter or under another routing version (T-4)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'toolery-resume-'));
  try{
    const resume=join(dir,'resume.json');
    const base={benchmarkVersion:'1.0.0',model:'',tier:'all',profile:'default',source:'synthetic',completedScenarioIds:[],results:[]};
    const cfg:BenchmarkConfig={model:'',adapter:'nexum',tier:'all',trials:1,baseUrl:'http://127.0.0.1:1',timeoutMs:1000,profile:'default',concurrency:1,benchmarkVersion:'1.0.0',endpointPath:'/v1/inference',source:'synthetic',resume,routingVersion:NEXUM_ROUTING_VERSION};
    await writeFile(resume,JSON.stringify({...base,adapter:'ollama'}));
    await assert.rejects(new BenchmarkService(cfg).run([]),/Resume adapter ollama does not match nexum/);
    await writeFile(resume,JSON.stringify({...base,adapter:'nexum',routingVersion:'nexum-inference/v0'}));
    await assert.rejects(new BenchmarkService(cfg).run([]),/routing version/);
    await writeFile(resume,JSON.stringify({...base,adapter:'nexum',routingVersion:NEXUM_ROUTING_VERSION}));
    const ok=await new BenchmarkService(cfg).run([]);
    assert.equal(ok.summary.trials,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('the snapshot records the routing version it was taken under',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'toolery-snapshot-'));
  try{
    const output=join(dir,'out.json');
    const cfg:BenchmarkConfig={model:'',adapter:'nexum',tier:'all',trials:1,baseUrl:'http://127.0.0.1:1',timeoutMs:1000,profile:'default',concurrency:1,benchmarkVersion:'1.0.0',endpointPath:'/v1/inference',source:'synthetic',output,routingVersion:NEXUM_ROUTING_VERSION};
    await new BenchmarkService(cfg).run([]);
    const snapshot=JSON.parse(await readFile(output,'utf8')) as {routingVersion?:string;adapter:string};
    assert.equal(snapshot.routingVersion,NEXUM_ROUTING_VERSION);
    assert.equal(snapshot.adapter,'nexum');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('the CSV export leaves an unreported figure empty, not zero and not the word undefined (T-2)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'toolery-csv-'));
  try{
    const file=join(dir,'out.csv');
    const base={success:false,toolCalls:[],text:'',toolCallScore:{precision:0,recall:0,f1:0,exactMatch:false,missing:[],extra:[],argumentAccuracy:0},textScore:{exactMatch:false,similarity:0},scores:SCORES as never,durationMs:1,trace:[]};
    const result:RunResult={scenarioId:'s',tier:'easy',description:'d',successRate:0,averageDurationMs:1,capabilityScores:SCORES as never,trials:[{trial:1,...base,harnessStatus:'BUDGET_EXCEEDED'} as TrialResult]};
    await exportCsv(file,[result]);
    const [header,row]=(await readFile(file,'utf8')).trim().split('\n');
    const cols=header!.split(',');
    const cells=row!.split(',');
    assert.ok(cols.includes('harnessStatus'));
    assert.equal(cells[cols.indexOf('inputTokens')],'');
    assert.equal(cells[cols.indexOf('costUsd')],'');
    assert.equal(cells[cols.indexOf('harnessStatus')],'"BUDGET_EXCEEDED"');
    assert.ok(!row!.includes('undefined'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
