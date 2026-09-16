import {mkdir,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import type {BenchmarkSummary,RunResult} from './types.js';
export interface HistoryRun{runId:string;startedAt:string;model:string;adapter:string;source:string;tier:string;profile:string;cluster?:string;summary:BenchmarkSummary;results:RunResult[];}
function defaultPath(){return process.env.TOOLERY_HISTORY_FILE??path.resolve('.toolery','history.json');}
export async function loadHistory(file=defaultPath()):Promise<HistoryRun[]>{try{return JSON.parse(await readFile(file,'utf8')) as HistoryRun[];}catch{return[];}}
export async function appendHistory(run:HistoryRun,file=defaultPath()){await mkdir(path.dirname(file),{recursive:true});const history=await loadHistory(file);history.push(run);await writeFile(file,JSON.stringify(history.slice(-100),null,2));}
export async function latestHistory(file=defaultPath()){const h=await loadHistory(file);return h.at(-1);}
