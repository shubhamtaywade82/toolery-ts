import type {CapabilityName, Profile, RunResult} from './types.js';

export const PROFILES: Profile[] = [
  {id:'default', description:'Balanced benchmark weighting.', weights:{}},
  {id:'agentic-coding', description:'Emphasize planning, recovery, state, and precision.', weights:{agenticPlanning:2,errorRecovery:1.5,stateTracking:1.5,parameterPrecision:1.5}},
  {id:'structured-output', description:'Emphasize parameter and instruction precision.', weights:{parameterPrecision:2,instructionFollowing:2}},
  {id:'chatbot', description:'Emphasize restraint, instruction following, and calibration.', weights:{instructionFollowing:1.5,restraint:1.5,calibration:1.5}},
];

const caps: CapabilityName[] = ['agenticPlanning','errorRecovery','parameterPrecision','stateTracking','instructionFollowing','restraint','calibration'];
export function getProfile(id: string): Profile { return PROFILES.find(profile => profile.id === id) ?? PROFILES[0]; }
export function weightedSummary(results: RunResult[], profileId: string): Record<CapabilityName, number> {
  const profile = getProfile(profileId);
  const out = {} as Record<CapabilityName, number>;
  for (const cap of caps) {
    const average = results.length ? results.reduce((sum, result) => sum + result.capabilityScores[cap], 0) / results.length : 0;
    out[cap] = average * (profile.weights[cap] ?? 1);
  }
  return out;
}
