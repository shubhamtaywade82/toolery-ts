import {allScenarios as syntheticAll,loadScenarios as syntheticLoad,SCENARIOS as SYNTHETIC_SCENARIOS,BENCHMARK_VERSION} from './scenario-pack.js';
import {loadUpstreamScenariosSync,loadUpstreamFromManifest,UPSTREAM_SOURCE,convertUpstreamScenario} from './scenario-loader.js';
import type {Scenario,Tier} from './types.js';
export {BENCHMARK_VERSION,UPSTREAM_SOURCE,loadUpstreamScenariosSync,loadUpstreamFromManifest,convertUpstreamScenario};
export const SCENARIOS=SYNTHETIC_SCENARIOS;
export function allScenarios():Scenario[]{return source()==='upstream'?loadUpstreamScenariosSync():syntheticAll();}
export function loadScenarios(tier?:Tier):Scenario[]{const list=allScenarios();return tier?list.filter(s=>s.tier===tier):list;}
function source(){return process.env.TOOLERY_SOURCE==='upstream'?'upstream':'synthetic';}
