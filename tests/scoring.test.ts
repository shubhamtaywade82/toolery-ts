import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreText, scoreToolCalls} from '../src/utils/scoring.js';

test('scores an exact tool call match',()=>{const s=scoreToolCalls([{name:'get_weather',arguments:{location:'Bengaluru'}}],[{name:'get_weather',arguments:{location:'Bengaluru'}}]);assert.equal(s.exactMatch,true);assert.equal(s.f1,1);assert.equal(s.argumentAccuracy,1);});
test('detects incorrect arguments',()=>{const s=scoreToolCalls([{name:'get_weather',arguments:{location:'Bengaluru',units:'metric'}}],[{name:'get_weather',arguments:{location:'Mumbai',units:'metric'}}]);assert.equal(s.argumentAccuracy,0.5);assert.equal(s.exactMatch,false);});
test('detects missing and extra calls',()=>{const s=scoreToolCalls([{name:'a',arguments:{}},{name:'b',arguments:{}}],[{name:'a',arguments:{}},{name:'x',arguments:{}}]);assert.equal(s.precision,0.5);assert.equal(s.recall,0.5);assert.equal(s.f1,0.5);assert.equal(s.missing[0].name,'b');assert.equal(s.extra[0].name,'x');});
test('scores empty tool sets exactly',()=>{const s=scoreToolCalls([],[]);assert.equal(s.exactMatch,true);assert.equal(s.f1,1);});
test('uses deterministic Jaccard similarity',()=>{assert.deepEqual(scoreText('hello world','hello'),{exactMatch:false,similarity:0.5});});
