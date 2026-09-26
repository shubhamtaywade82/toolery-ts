# PRD — Toolery-TS

> Product Requirements Document · Version 0.4.1 · Primary reader: AI developer agent
> Status: MVP shipped, pre-npm-publish. See `tasks.md` for the current blocker list.

## 1. Project Overview

Toolery-TS is a **deterministic tool-calling benchmark for LLM endpoints**, implemented in TypeScript with an Ink-based TUI. It measures how reliably a model selects the right tools, passes the right arguments, chains multi-turn tool calls, and follows instructions — without any model-as-judge.

It is a TypeScript port targeting compatibility with the upstream Python benchmark `karolpalys/toolery` (pinned to commit `36c8c0c217898aade7500fa13b02fdc4d58899f7`, 143 hand-written scenarios: 40 easy, 45 medium, 34 hard, 24 very-hard).

- **Package**: `toolery-ts` (npm), CLI binary `toolery`
- **Runtime**: Node.js >= 20, ESM only
- **Versioning**: package `0.4.1`, benchmark contract `1.0.0` (independent)

## 2. Problem Statement

1. **Tool-calling evaluation is non-deterministic and expensive.** Most LLM benchmarks use an LLM judge, which is costly, unstable across runs, and unusable offline.
2. **Local-model developers have no fast feedback loop.** Engineers running Ollama / vLLM / LMStudio / llama.cpp need a local, offline benchmark to answer "which small model actually calls tools correctly on my hardware?"
3. **Scores are not comparable across runs.** Without pinned scenarios, fixed temperature, and contract-based scoring, results cannot be compared between models or over time.

Toolery-TS solves this with versioned scenarios, fixed `temperature: 0`, deterministic contract scoring (required/forbidden/partial checks, exact tool-call and argument matching), and paired statistical comparison (McNemar).

## 3. Target Users

| User | Need |
|---|---|
| AI engineers building agents | Compare models on agentic tool use before committing to one |
| Local-model developers (Ollama, LMStudio, vLLM, llama.cpp) | Offline benchmarking of small models (1b–70b) on their own hardware |
| Model evaluators / QA | Reproducible runs, resumable snapshots, CSV export, run history |
| DevOps / CI pipelines | Headless execution with exit codes and JSON output *(gap — see non-goals + tasks.md)* |

## 4. Core MVP Features (shipped)

1. **Six adapters**: `ollama` (native API), `openai-compatible` (works with Ollama `/v1`, vLLM, LMStudio, llama.cpp, OpenAI, Groq, OpenRouter), `raw`, `cloud` (requires API key), `mock` (deterministic, offline), `hermes` (stub).
2. **143-scenario upstream suite** imported verbatim via `npm run sync:upstream` (SHA-256 manifest, hard 143-count guard) + synthetic fallback pack.
3. **Deterministic contract scoring**: required / forbidden / partial / weighted checks, tool-call exactness, argument accuracy, response predicates. No model-as-judge, ever.
4. **18 capability dimensions** (coding, debugging, agenticPlanning, safety, adversarialRobustness, restraint, errorRecovery, parameterPrecision, stateTracking, structuredOutput, toolSelection, instructionFollowing, longContext, localization, budgetDiscipline, terminalHandling, calibration, correctness).
5. **8 reporting profiles** (default, coding-assistant, reasoning, agentic-orchestrator, safety-rag, customer-support, data-analyst, local-coding-agent) — weighting only, never affects scoring.
6. **Runner service**: concurrency 1–32, resumable JSON snapshots with version/model/tier/source guards, local run history.
7. **Statistics**: tier-weighted scores, mean/stdev/worst, 14-day half-life time decay, exact two-sided McNemar comparison.
8. **Nine-tab Ink TUI** (Home, Scenarios, Run, Results, Rankings, Compare, Profiles, History, Settings) with provider presets and live endpoint probing.
9. **CLI subcommands**: `run`, `tui`, `scenarios`, `profiles`, `probe` (exit 1 on unreachable), `export` (JSON → CSV).

## 5. Non-Goals (explicit)

- **No model-as-judge scoring.** All scoring is deterministic contract evaluation.
- **No execution of model-generated code.** Terminal/shell scenarios are evaluated via observable tool-call contracts only. The runner never runs `exec`/shell on model output.
- **No Hermes/MCP bridge yet.** `HermesAdapter` deliberately throws a clear error rather than faking results.
- **Not an agent framework.** Tool results are synthetic fixtures, not real API calls to actual services.
- **No empirical re-tiering / golden probe** (upstream parity gaps tracked in `PARITY.md`).
- **No training, fine-tuning, or dataset generation.**
- **Cluster topology (`--cluster single|dual|triple|quad|octa`) is metadata only** — no automatic DGX topology discovery.

## 6. Success Criteria

- `npm install && npm run build` produces a working `dist/` on a fresh clone *(currently broken — see tasks.md P0-1)*.
- A first-time user can benchmark a local Ollama model in under 5 minutes.
- Same model + same scenarios + same seed ⇒ identical scores across runs.
- `npm publish` ships a package that works install-to-result without a repo clone.
