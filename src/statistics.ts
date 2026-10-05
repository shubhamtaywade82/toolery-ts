import type {RunResult} from './types.js';

export interface Stability { mean:number; stdev:number; worst:number; runs:number; }
export interface Comparison { aWins:number; bWins:number; ties:number; discordant:number; mcnemarPValue:number|null; }
export function mean(values:number[]):number{return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
export function stdev(values:number[]):number{if(values.length<2)return 0;const m=mean(values);return Math.sqrt(mean(values.map(v=>(v-m)**2)));}
export function stability(runs:number[]):Stability{return{mean:mean(runs),stdev:stdev(runs),worst:runs.length?Math.min(...runs):0,runs:runs.length};}
export function tierWeight(tier:string):number{return tier==='easy'?1:tier==='medium'?1.25:tier==='hard'?1.5:1.75;}
export function weightedScore(results:RunResult[]):number{let n=0,d=0;for(const r of results){const w=tierWeight(r.tier);n+=w*r.successRate;d+=w;}return d?n/d:0;}
// Exact two-sided McNemar p-value using the binomial distribution under H0 p=0.5.
// For discordant counts beyond 1000 the exact `2*sum/2**d` form overflows to
// Infinity (and 0.5**d underflows to 0), which would silently report p=0/NaN;
// the chi-square approximation with continuity correction is used there instead
// (standard practice — the approximation is excellent well below that threshold).
export function mcnemar(a:boolean[],b:boolean[]):Comparison{let aWins=0,bWins=0,ties=0;for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]===b[i])ties++;else if(a[i])aWins++;else bWins++;}const discordant=aWins+bWins;if(!discordant)return{aWins,bWins,ties,discordant,mcnemarPValue:null};if(discordant>1000)return{aWins,bWins,ties,discordant,mcnemarPValue:chiSquareApproximation(aWins,bWins)};const k=Math.min(aWins,bWins);let sum=0;for(let i=0;i<=k;i++)sum+=comb(discordant,i);const p=Math.min(1,2*sum/2**discordant);return{aWins,bWins,ties,discordant,mcnemarPValue:p};}
function chiSquareApproximation(aWins:number,bWins:number):number{const chi2=(Math.abs(aWins-bWins)-1)**2/(aWins+bWins);return Math.min(1,erfc(Math.sqrt(chi2/2)));}
// Complementary error function, Numerical Recipes 6.2-style rational approximation
// ( Abramowitz & Stegun 7.1.26 refinement ); |error| < 1.5e-7 for x >= 0, which is far
// tighter than the p-value precision this comparison needs. JS has no built-in erfc.
function erfc(x:number):number{if(x<0)return 2-erfc(-x);const t=1/(1+0.5*x);const poly=t*(0.17087277+t*(-0.82215223+t*(1.48851587+t*(-1.13520398+t*(0.27886807+t*(-0.18628806+t*(0.09678418+t*(0.37409196+t*1.00002368))))))));return t*Math.exp(-x*x-1.26551223+poly);}
function comb(n:number,k:number):number{if(k<0||k>n)return 0;let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r;}
export function timeDecay(ageDays:number,halfLifeDays=14):number{return Math.pow(0.5,ageDays/halfLifeDays);}
