import { appendHistory } from './history.js';
import { BenchmarkService } from './benchmark.js';
import { formatSummary } from './export.js';
import { loadScenarios } from './scenarios.js';
import { runLlamaBenchy } from './perf.js';
import type { BenchmarkConfig, RunResult } from './types.js';

/**
 * Non-interactive benchmark execution for CI, Docker, SSH sessions and pipes.
 *
 * The Ink TUI requires a raw-mode TTY on stdin; without one it crashes with
 * "Raw mode is not supported". `runHeadless` is the plain-stdout alternative:
 * it streams one progress line per completed scenario, prints the summary,
 * persists the resumable snapshot (when --output is set) and appends to the
 * local run history exactly like the TUI does.
 *
 * Exit codes: 0 when the benchmark completed, 1 on any fatal error
 * (invalid config, unsynced upstream pack, unreachable flags) — the caller
 * in cli.tsx wraps this in the shared try/catch.
 */
export async function runHeadless(config: BenchmarkConfig): Promise<void> {
  if (config.adapter !== 'mock' && !config.model) {
    throw new Error('A --model is required for non-mock adapters. Example: --model qwen2.5:4b');
  }

  const tier = config.tier === 'all' ? undefined : config.tier;
  let scenarios = loadScenarios(tier);
  if (config.category) scenarios = scenarios.filter((s) => s.category === config.category);
  if (scenarios.length === 0) {
    throw new Error(`No scenarios matched tier=${config.tier}${config.category ? ` category=${config.category}` : ''}.`);
  }

  process.stderr.write(
    `Toolery-TS ${config.benchmarkVersion} · ${scenarios.length} scenarios · ${config.trials} trial(s) · ` +
    `adapter=${config.adapter} model=${config.model || 'mock'} source=${config.source}` +
    `${config.resume ? ` · resuming from ${config.resume}` : ''}\n`
  );

  const started = Date.now();
  const service = new BenchmarkService(config);
  const { summary, results } = await service.run(scenarios, (completed, total, result) => {
    process.stdout.write(`[${completed}/${total}] ${label(result)} ${result.scenarioId.padEnd(48)} ${result.successRate.toFixed(2)} ${Math.round(result.averageDurationMs)}ms\n`);
  });

  process.stdout.write(`\nCompleted ${results.length} scenarios in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  process.stdout.write(`${formatSummary(summary)}\n`);
  if (config.output) process.stdout.write(`Snapshot written to ${config.output}\n`);

  // Optional llama-benchy throughput pass (opt-in via --with-perf). Runs after the
  // benchmark so a missing `uvx`/llama-benchy toolchain never invalidates the run.
  if (config.withPerf && config.adapter !== 'mock' && config.model) {
    process.stdout.write('\nRunning llama-benchy throughput checks...\n');
    try {
      const perf = await runLlamaBenchy(config.model, config.baseUrl);
      for (const p of perf) {
        process.stdout.write(`  depth ${p.contextDepth ?? '—'}: ${p.generationTokensPerSecond !== undefined ? `${p.generationTokensPerSecond.toFixed(1)} tok/s gen` : 'no throughput measured'} (${Math.round(p.durationMs)}ms)\n`);
      }
    } catch (error) {
      process.stdout.write(`  Perf checks skipped: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  await appendHistory({
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    model: config.model,
    adapter: config.adapter,
    source: config.source,
    tier: config.tier,
    profile: config.profile,
    cluster: config.cluster,
    summary,
    results,
  });
}

function label(result: RunResult): string {
  if (result.successRate >= 1) return 'PASS   ';
  if (result.successRate > 0) return 'PARTIAL';
  return 'FAIL   ';
}
