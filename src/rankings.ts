import type {CapabilityName,RunResult} from './types.js';
import {DIMENSIONS,Dimension} from './dimensions.js';
import {weightedScore} from './statistics.js';

export interface RankingRow {model:string;adapter:string;cluster:string;score:number;dimensions:Partial<Record<Dimension,number>>;runs:number;}
export interface RankingOptions {decayHalfLifeDays?:number;cluster?:string;mode?:'best'|'adapter'|'raw';}
const mapCapability:Partial<Record<Dimension,CapabilityName>>={agenticPlanning:'agenticPlanning',stateTracking:'stateTracking',parameterPrecision:'parameterPrecision',restraint:'restraint',errorRecovery:'errorRecovery',instructionFollowing:'instructionFollowing',calibration:'calibration',correctness:'correctness'};
export function buildRanking(model:string,adapter:string,cluster:string,results:RunResult[],options:RankingOptions={}):RankingRow{const dimensions={} as Partial<Record<Dimension,number>>;for(const d of DIMENSIONS){const cap=mapCapability[d];dimensions[d]=cap?mean(results.map(r=>r.capabilityScores[cap])):weightedScore(results);}return{model,adapter,cluster,score:weightedScore(results),dimensions,runs:results.length};}
export function sortRankings(rows:RankingRow[],dimension:'score'|Dimension='score'):RankingRow[]{return [...rows].sort((a,b)=>(b[dimension==='score'?'score':'dimensions'] as any)?.[dimension==='score'?'':''] ?? b.score - ((a[dimension==='score'?'score':'dimensions'] as any)?.[dimension==='score'?'':''] ?? a.score));}
function mean(v:number[]):number{return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
