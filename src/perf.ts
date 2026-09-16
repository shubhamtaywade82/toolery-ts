import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {PerfResult} from './types.js';
const exec=promisify(execFile);
export async function runLlamaBenchy(model:string,baseUrl:string,options:{runs?:number;depth?:number[];pp?:number[];tg?:number[]}={}):Promise<PerfResult[]>{
  const args=['llama-benchy','--help'];
  try{await exec('uvx',args,{timeout:30_000});}catch{throw new Error('llama-benchy/uvx unavailable; install uv or run without --with-perf.');}
  const depths=options.depth??[512,2048,4096];const out:PerfResult[]=[];
  for(const contextDepth of depths){const started=performance.now();let raw='';try{const r=await exec('uvx',['llama-benchy','--model',model,'--base-url',baseUrl,'--depth',String(contextDepth),'--runs',String(options.runs??1)],{timeout:300_000});raw=r.stdout;}catch(error){throw new Error(`llama-benchy failed: ${error instanceof Error?error.message:String(error)}`);}const nums=[...raw.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:tok\/s|tokens\/s)/gi)].map(m=>Number(m[1]));out.push({model,contextDepth,generationTokensPerSecond:nums.at(-1),durationMs:performance.now()-started});}
  return out;
}
