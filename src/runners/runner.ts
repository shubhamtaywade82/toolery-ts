import type {AdapterRequest, BenchmarkConfig, ChatMessage, RunResult, Scenario, ToolCall, TrialResult} from '../types.js';
import {capabilityScores, scoreText, scoreToolCalls} from '../utils/scoring.js';
import {OpenAICompatibleAdapter} from './adapters.js';
import {ScriptedMockAdapter} from './mock-adapter.js';

export class ScenarioRunner {
  private readonly adapter;
  constructor(private readonly config: BenchmarkConfig) { this.adapter = config.adapter === 'mock' ? new ScriptedMockAdapter() : new OpenAICompatibleAdapter({baseUrl:config.baseUrl,apiKey:config.apiKey,timeoutMs:config.timeoutMs}); }
  async runScenario(scenario:Scenario):Promise<RunResult>{const trials:TrialResult[]=[];for(let trial=1;trial<=this.config.trials;trial++)trials.push(await this.runTrial(scenario,trial));return{scenarioId:scenario.id,tier:scenario.tier,description:scenario.description,successRate:trials.filter(t=>t.success).length/trials.length,averageDurationMs:trials.reduce((s,t)=>s+t.durationMs,0)/trials.length,capabilityScores:averageScores(trials),trials};}
  private async runTrial(scenario:Scenario,trial:number):Promise<TrialResult>{
    const trace:ChatMessage[]=[{role:'system',content:'You are being benchmarked for tool use. Follow the user exactly. Use only supplied tools. After tools return their results, continue until the request is complete.'},{role:'user',content:scenario.prompt}];
    const calls:ToolCall[]=[];let text='';let durationMs=0;let inputTokens=0;let outputTokens=0;
    try{const maxRounds=Math.max(2,scenario.expectedToolCalls.length+2);for(let round=0;round<maxRounds;round++){const request:AdapterRequest={model:this.config.model||'mock-model',messages:trace,tools:scenario.tools,toolChoice:'auto',temperature:0};const response=await this.adapter.complete(request);durationMs+=response.durationMs;inputTokens+=response.inputTokens??0;outputTokens+=response.outputTokens??0;if(response.text)text=response.text;if(!response.toolCalls.length)break;trace.push({role:'assistant',content:response.text||null,toolCalls:response.toolCalls});for(const call of response.toolCalls){calls.push(call);const step=calls.length-1;const expected=scenario.expectedToolCalls[step];const shouldError=step===0&&scenario.expectedToolCalls[1]?.name===call.name&&scenario.expectedToolCalls[1]?.arguments?.account==='backup';const content=shouldError?JSON.stringify({error:'Primary account endpoint unavailable.'}):JSON.stringify(expected?.toolResult??{ok:true,tool:call.name,arguments:call.arguments});trace.push({role:'tool',toolCallId:call.id??`call-${step+1}`,name:call.name,content});}}
      const toolCallScore=scoreToolCalls(scenario.expectedToolCalls,calls);const textScore=scoreText(scenario.expectedText,text);const scores=capabilityScores(scenario,toolCallScore,textScore,calls.length);const success=toolCallScore.exactMatch&&(scenario.expectedText===undefined||textScore.similarity>=0.8);return{trial,success,toolCalls:calls,text,toolCallScore,textScore,scores,durationMs,inputTokens,outputTokens,trace};
    }catch(error){return{trial,success:false,toolCalls:calls,text,toolCallScore:scoreToolCalls(scenario.expectedToolCalls,calls),textScore:scoreText(scenario.expectedText,text),scores:zeroScores(),durationMs,inputTokens,outputTokens,error:error instanceof Error?error.message:String(error),trace};}
  }
}
function averageScores(trials:TrialResult[]):TrialResult['scores']{const keys=Object.keys(zeroScores()) as Array<keyof TrialResult['scores']>;return Object.fromEntries(keys.map(key=>[key,trials.reduce((s,t)=>s+t.scores[key],0)/trials.length])) as TrialResult['scores'];}
function zeroScores():TrialResult['scores']{return{agenticPlanning:0,errorRecovery:0,parameterPrecision:0,stateTracking:0,instructionFollowing:0,restraint:0,calibration:0};}
