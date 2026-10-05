import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {allScenarios} from '../src/scenarios.js';
import {loadUpstreamScenariosSync} from '../src/scenario-loader.js';
import {resolveUpstreamDir,upstreamPackSynced} from '../src/utils/config.js';

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

test('upstream pack resolves from a foreign CWD (installed-package layout)',async()=>{
  if(!upstreamPackSynced())return; // pack not synced in this checkout; CI exercises the synthetic path
  const prev=process.cwd();
  const sandbox=await mkdtemp(path.join(tmpdir(),'toolery-cwd-'));
  process.chdir(sandbox);
  try{
    // No vendor/ exists inside the sandbox: the pack must resolve outside the CWD (package root).
    assert.equal(resolveUpstreamDir().startsWith(sandbox),false);
    const scenarios=loadUpstreamScenariosSync();
    assert.equal(scenarios.length,143);
    assert.equal(new Set(scenarios.map(s=>s.id)).size,143);
  }finally{
    process.chdir(prev);
    await rm(sandbox,{recursive:true,force:true});
  }
});

test('TOOLERY_UPSTREAM_DIR overrides the pack location',()=>{
  const original=process.env.TOOLERY_UPSTREAM_DIR;
  try{
    process.env.TOOLERY_UPSTREAM_DIR=resolveUpstreamDir();
    const scenarios=loadUpstreamScenariosSync();
    assert.equal(scenarios.length,143);
    process.env.TOOLERY_UPSTREAM_DIR='/nonexistent/toolery-upstream';
    assert.throws(()=>loadUpstreamScenariosSync(),/not synced/);
  }finally{
    if(original===undefined)delete process.env.TOOLERY_UPSTREAM_DIR;else process.env.TOOLERY_UPSTREAM_DIR=original;
  }
});
