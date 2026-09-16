import type {CapabilityName,RunResult} from './types.js';
import {DIMENSIONS} from './dimensions.js';
import {weightedScore} from './statistics.js';
export interface RankingRow{model:string;adapter:string;cluster:string;score:number;dimensions:Partial<Record<CapabilityName,number>>;runs:number}
const direct:Partial<Record<CapabilityName,CapabilityName>>={coding:'coding',debugging:'debugging',agenticPlanning:'agenticPlanning',safety:'safety',adversarialRobustness:'adversarialRobustness',restraint:'restraint',errorRecovery:'errorRecovery',parameterPrecision:'parameterPrecision',stateTracking:'stateTracking',structuredOutput:'structuredOutput',toolSelection:'toolSelection',instructionFollowing:'instructionFollowing',longContext:'longContext',localization:'localization',budgetDiscipline:'budgetDiscipline',terminalHandling:'terminalHandling',calibration:'calibration',correctness:'correctness'};
export function buildRanking(model:string,adapter:string,cluster:string,results:RunResult[]):RankingRow{const dimensions={} as Partial<Record<CapabilityName,number>>;for(const d of DIMENSIONS)dimensions[d]=mean(results.map(r=>r.capabilityScores[direct[d] as CapabilityName]??0));return{model,adapter,cluster,score:weightedScore(results),dimensions,runs:results.length};}
export function sortRankings(rows:RankingRow[],dimension:'score'|CapabilityName='score'):RankingRow[]{return[...rows].sort((a,b)=>dimension==='score'?b.score-a.score:(b.dimensions[dimension]??0)-(a.dimensions[dimension]??0));}
function mean(v:number[]):number{return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
