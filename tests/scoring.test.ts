import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreText, scoreToolCalls} from '../src/utils/scoring.js';

test('scores an exact tool call match', () => {
  const score = scoreToolCalls(
    [{name: 'get_weather', arguments: {location: 'Bengaluru'}}],
    [{name: 'get_weather', arguments: {location: 'Bengaluru'}}],
  );

  assert.equal(score.exactMatch, true);
  assert.equal(score.precision, 1);
  assert.equal(score.recall, 1);
  assert.equal(score.f1, 1);
  assert.equal(score.argumentAccuracy, 1);
});

test('detects missing, extra, and incorrect arguments', () => {
  const score = scoreToolCalls(
    [{name: 'get_weather', arguments: {location: 'Bengaluru', units: 'metric'}}],
    [{name: 'get_weather', arguments: {location: 'Mumbai'}}],
  );

  assert.equal(score.precision, 1);
  assert.equal(score.recall, 1);
  assert.equal(score.argumentAccuracy, 0.5);
  assert.equal(score.exactMatch, false);
});

test('uses deterministic Jaccard token similarity for text', () => {
  assert.deepEqual(scoreText('hello world', 'hello'), {
    exactMatch: false,
    similarity: 0.5,
  });
});
