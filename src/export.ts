import {writeFile} from 'node:fs/promises';
import type {BenchmarkSummary, RunResult} from './types.js';

export async function exportJson(path:string, payload: unknown): Promise<void> { await writeFile(path, JSON.stringify(payload, null, 2)); }

function csvEscape(value: unknown): string { const text = typeof value === 'string' ? value : JSON.stringify(value); return `"${text.replaceAll('"','""')}"`; }

export async function exportCsv(path:string, results:RunResult[]):Promise<void> {
  const headers=['scenarioId','tier','successRate','averageDurationMs','trial','success','toolPrecision','toolRecall','toolF1','argumentAccuracy','textSimilarity'];
  const rows=[headers.join(',')];
  for(const result of results) for(const trial of result.trials) rows.push([
    result.scenarioId,result.tier,result.successRate,result.averageDurationMs,trial.trial,trial.success,
    trial.toolCallScore.precision,trial.toolCallScore.recall,trial.toolCallScore.f1,trial.toolCallScore.argumentAccuracy,trial.textScore.similarity,
  ].map(csvEscape).join(','));
  await writeFile(path, rows.join('\n')+'\n');
}

export function formatSummary(summary:BenchmarkSummary):string {
  const c=summary.capabilityScores;
  return `Toolery-TS ${summary.benchmarkVersion}\nModel profile: ${summary.profile}\nScenarios: ${summary.scenarios}\nTrials: ${summary.trials}\nSuccess rate: ${(summary.successRate*100).toFixed(1)}%\nAverage latency: ${summary.averageDurationMs.toFixed(0)} ms\nCapabilities: planning ${(c.agenticPlanning*100).toFixed(1)}%, recovery ${(c.errorRecovery*100).toFixed(1)}%, parameters ${(c.parameterPrecision*100).toFixed(1)}%, state ${(c.stateTracking*100).toFixed(1)}%, instruction ${(c.instructionFollowing*100).toFixed(1)}%, restraint ${(c.restraint*100).toFixed(1)}%, calibration ${(c.calibration*100).toFixed(1)}%`;
}
