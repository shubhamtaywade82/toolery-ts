import {readFile,writeFile} from 'node:fs/promises';
import type {BenchmarkConfig,BenchmarkSummary,RunResult,Scenario} from './types.js';
import {ScenarioRunner} from './runners/runner.js';
import {aggregateSummary} from './utils/scoring.js';
export interface BenchmarkSnapshot{benchmarkVersion:string;model:string;adapter:string;tier:string;profile:string;completedScenarioIds:string[];results:RunResult[];summary?:BenchmarkSummary;}
export class BenchmarkService{
 constructor(private readonly config:BenchmarkConfig){}
 async run(scenarios:Scenario[],onProgress?:(completed:number,total:number,result:RunResult)=>void):Promise<{summary:BenchmarkSummary;results:RunResult[]}>{
  const existing=await this.readResume();const results=existing?.results?[...existing.results]:[];const done=new Set(results.map(r=>r.scenarioId));const queue=scenarios.filter(s=>!done.has(s.id));let cursor=0;const workers=Math.min(this.config.concurrency,Math.max(1,queue.length));const runner=new ScenarioRunner(this.config);
  const worker=async()=>{while(true){const index=cursor++;if(index>=queue.length)return;const result=await runner.runScenario(queue[index]);results.push(result);await this.persist(results);onProgress?.(results.length,scenarios.length,result);}};
  await Promise.all(Array.from({length:workers},worker));const trials=results.flatMap(r=>r.trials.map(t=>({success:t.success,durationMs:t.durationMs,scores:t.scores})));const summary=aggregateSummary(trials,scenarios.length,this.config.profile,this.config.benchmarkVersion);await this.persist(results,summary);return{summary,results};
 }
 private async persist(results:RunResult[],summary?:BenchmarkSummary){if(!this.config.output)return;const snapshot:BenchmarkSnapshot={benchmarkVersion:this.config.benchmarkVersion,model:this.config.model,adapter:this.config.adapter,tier:this.config.tier,profile:this.config.profile,completedScenarioIds:results.map(r=>r.scenarioId),results,...(summary?{summary}:{})};await writeFile(this.config.output,JSON.stringify(snapshot,null,2));}
 private async readResume():Promise<BenchmarkSnapshot|undefined>{if(!this.config.resume)return undefined;try{const snapshot=JSON.parse(await readFile(this.config.resume,'utf8')) as BenchmarkSnapshot;if(snapshot.benchmarkVersion!==this.config.benchmarkVersion)throw new Error(`Resume benchmark version ${snapshot.benchmarkVersion} does not match ${this.config.benchmarkVersion}.`);if(snapshot.model&&this.config.model&&snapshot.model!==this.config.model)throw new Error(`Resume model ${snapshot.model} does not match ${this.config.model}.`);if(snapshot.tier!==this.config.tier)throw new Error(`Resume tier ${snapshot.tier} does not match ${this.config.tier}.`);return snapshot;}catch(error){if(error instanceof SyntaxError)return undefined;throw error;}}
}
