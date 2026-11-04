import type {CapabilityName, Profile, RunResult} from './types.js';

export const PROFILES: Profile[] = [
  {id:'default', description:'Balanced dimensions.', weights:{}},
  {id:'coding-assistant', description:'Coding, debugging and terminal-heavy.', weights:{coding:2,debugging:2,terminalHandling:1.5,parameterPrecision:1.25}},
  {id:'reasoning', description:'Planning, state, long-context and correctness.', weights:{agenticPlanning:2,stateTracking:1.75,longContext:1.5,correctness:2}},
  {id:'agentic-orchestrator', description:'Planning, tool selection, recovery and budget discipline.', weights:{agenticPlanning:2,toolSelection:1.75,errorRecovery:1.75,budgetDiscipline:1.5,stateTracking:1.5}},
  {id:'safety-rag', description:'Safety, adversarial robustness, restraint and calibration.', weights:{safety:2,adversarialRobustness:2,restraint:1.75,calibration:1.75}},
  {id:'customer-support', description:'Instruction following, localization, restraint and calibration.', weights:{instructionFollowing:2,localization:1.5,restraint:1.5,calibration:1.5}},
  {id:'data-analyst', description:'Parameter precision, structured output and correctness.', weights:{parameterPrecision:2,structuredOutput:2,correctness:1.75,longContext:1.5}},
  {id:'local-coding-agent', description:'Coding plus terminal and recovery behavior.', weights:{coding:2,debugging:2,terminalHandling:2,errorRecovery:1.5,budgetDiscipline:1.25}},
  // Maps the 100-point capability-evaluation rubric onto the 18-dimension matrix:
  // reasoning/problem solving 15 -> correctness 1.75 (incl. mathematical accuracy 10)
  // code generation and debugging 15 -> coding/debugging 1.5
  // tool selection 15 -> toolSelection 1.75; argument accuracy 10 -> parameterPrecision 1.25
  // multi-step execution 10 -> agenticPlanning 1.5 + stateTracking 1.25
  // instruction following 10 -> instructionFollowing 1.25
  // structured output 5, hallucination resistance 5, latency/efficiency 5 -> 0.75 each
  {id:'capability-evaluation', description:'LLM capability suite: reasoning, instruction following, math, coding, tool selection, multi-step execution, structured output, hallucination resistance.', weights:{correctness:1.75,agenticPlanning:1.5,instructionFollowing:1.25,coding:1.5,debugging:1.5,toolSelection:1.75,parameterPrecision:1.25,stateTracking:1.25,structuredOutput:0.75,calibration:0.75,restraint:0.75,budgetDiscipline:0.75}},
];
const caps: CapabilityName[] = ['coding','debugging','agenticPlanning','safety','adversarialRobustness','restraint','errorRecovery','parameterPrecision','stateTracking','structuredOutput','toolSelection','instructionFollowing','longContext','localization','budgetDiscipline','terminalHandling','calibration','correctness'];
export function getProfile(id: string): Profile { return PROFILES.find(p=>p.id===id) ?? PROFILES[0]; }
export function weightedSummary(results: RunResult[], profileId: string): Record<CapabilityName, number> {
  const profile=getProfile(profileId); const out={} as Record<CapabilityName,number>;
  for(const cap of caps){const avg=results.length?results.reduce((s,r)=>s+(r.capabilityScores[cap]??0),0)/results.length:0;out[cap]=Math.min(1,avg*(profile.weights[cap]??1));} return out;
}
