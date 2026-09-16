import assert from 'node:assert/strict';
import test from 'node:test';
import {allScenarios} from '../src/scenarios.js';

test('benchmark contains exactly 143 scenarios with required tier split',()=>{
  const scenarios=allScenarios();
  assert.equal(scenarios.length,143);
  assert.equal(scenarios.filter(s=>s.tier==='easy').length,40);
  assert.equal(scenarios.filter(s=>s.tier==='medium').length,45);
  assert.equal(scenarios.filter(s=>s.tier==='hard').length,34);
  assert.equal(scenarios.filter(s=>s.tier==='very-hard').length,24);
  assert.equal(new Set(scenarios.map(s=>s.id)).size,143);
  for(const scenario of scenarios) assert.ok(scenario.tools.length>0);
});
