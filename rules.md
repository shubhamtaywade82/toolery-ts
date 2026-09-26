# Coding Rules & Guidelines — Toolery-TS

> Primary reader: AI developer agent. Follow these rules for ALL generated code and edits.

## 1. Coding Standards

- **TypeScript strict mode** — never disable `strict`, never use `// @ts-ignore` or `as any` to silence real type errors. The existing 40 `no-explicit-any` lint warnings are **legacy debt**: do not add new `any`s. When touching a function that already uses `any`, prefer narrowing it.
- **ESM everywhere** — `"type": "module"`. Relative imports MUST use the `.js` extension (`from './types.js'`), even in `.ts`/`.tsx` files (NodeNext resolution).
- **Write readable code.** The existing codebase is aggressively minified (whole classes on one line). **Do not imitate that style.** All NEW or refactored code must use normal formatting: one statement per line, indented blocks, functions under ~40 lines. Match the readable style of `probe.ts` and `export.ts`, not `runner.ts`.
- **No build artifacts in git.** `dist/`, `*.tsbuildinfo` must never be committed. `tsconfig.json` uses `incremental: true`; the build cache is machine-local.
- **Node builtins** are imported with the `node:` prefix (`node:fs/promises`, `node:path`).
- **No dead code, no commented-out code, no TODO without a linked task in `tasks.md`.**

## 2. Libraries: Use / Avoid

**Use (already in the project — do not add alternatives):**

| Need | Library |
|---|---|
| CLI parsing | `meow` |
| TUI | `ink`, `react`, `@kud/ink-ui` |
| Ollama native transport | `@nemesis-oss/ollama-sdk` *(decision to potentially swap for official `ollama` SDK — see memory.md D-4; do not swap casually)* |
| YAML parsing | `yaml` |
| Testing | `node:test` + `node:assert/strict`, run through `tsx` |

**Avoid / Forbidden:**

- ❌ No new runtime dependencies without recording the decision in `memory.md`. Zero-dep solutions with `node:` builtins are strongly preferred.
- ❌ No LLM-judge libraries, no API calls to other models for scoring. Scoring is deterministic, forever.
- ❌ No `exec`/`execSync`/`child_process` on anything a model generated. Shell/terminal scenarios are evaluated via observable tool-call contracts only.
- ❌ No heavyweight frameworks (express, axios, lodash, moment, jest/vitest) — native `fetch` and `node:test` already cover our needs.
- ❌ No `npm` postinstall scripts.

## 3. Error Handling Approach

1. **Fail fast at the boundary.** `parseConfig` validates every input (tier, trials 1–100, concurrency 1–32, timeout ≥ 100ms, adapter/source/cluster enums) and throws with a message that lists the legal values. New flags MUST follow this pattern.
2. **Never silently substitute or fall back.** If the upstream manifest is missing or has ≠ 143 records, throw with actionable text (`Run npm run sync:upstream.`) — never fall back to synthetic scenarios without the user asking. (Known bug: the ENOENT path bypasses the friendly message — see tasks.md P1-3.)
3. **Per-trial error capture.** Adapter/transport failures inside `runTrial` are caught and recorded as a failed trial with `error` message and partial trace — the benchmark continues; one dead endpoint scenario must not kill a 143-scenario run.
4. **Exit codes are part of the API.** `probe` exits 1 when unreachable; CLI errors exit 1 via `process.exit(1)` after printing the message to stderr.
5. **Adapter timeouts** use `AbortController` + `setTimeout` in a `finally`-cleared pattern (see `OpenAICompatibleAdapter.complete`). New adapters must follow it.
6. **Resume guards are sacred.** `BenchmarkService.readResume` compares `benchmarkVersion`, `model`, `tier`, `source`; on mismatch throw, do not merge.

## 4. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `scenario-loader.ts`, `contract-scoring.ts` |
| Classes / types / interfaces | PascalCase | `BenchmarkService`, `LlmAdapter` |
| Functions / variables | camelCase | `loadScenarios`, `argumentAccuracy` |
| Constants | SCREAMING_SNAKE_CASE | `UPSTREAM_SOURCE`, `CAPABILITY_MAP` |
| Env vars / config flags | `TOOLERY_` prefix, SCREAMING_SNAKE | `TOOLERY_BASE_URL`, `--base-url` |
| CLI flags | kebab-case | `--base-url`, `--with-perf` |
| Scenario IDs | upstream verbatim | `easy-03-refuse-trivial-math` |
| Tiers | `easy \| medium \| hard \| very-hard` (hyphenated; upstream YAML uses `very_hard` — converted in `upstreamTier()`) | |

Every CLI flag needs: meow help entry, `parseConfig` handling with `TOOLERY_*` env fallback, and validation. The pattern is flag-first: `flags.X ?? process.env.TOOLERY_X ?? default`.

## 5. Determinism Constraints (non-negotiable)

- Runner always sends `temperature: 0`. Never raise it.
- Upstream suite is pinned to commit `36c8c0c217898aade7500fa13b02fdc4d58899f7`; the 143-count and SHA-256 checks in the sync script and loader must never be relaxed.
- Scoring must be pure: same inputs ⇒ same scores. No timestamps, randomness, or locale-dependent comparison inside scorers. (`Date.now()` is allowed only for run IDs / history, never scoring.)
- Profiles (profiles.ts) affect **reporting weights only** — they must never change success/pass outcomes.
- Benchmark contract version (`benchmarkVersion`) bumps whenever scenario definitions, checks, or scoring semantics change.

## 6. Security & Benchmark Integrity Constraints

- Tool results are synthetic fixtures (`resolveToolResult`). Never wire tools to real external services (no live HTTP for "get_weather").
- API keys: read from flags or env only; mask in TUI display (`maskKey`); never log full keys, never write them into snapshots or history.
- `raw:payload` in results may contain endpoint responses — CSV export must only expose scores, never raw payloads or keys.
- Vendored upstream YAML retains upstream MIT license notice (`vendor/toolery-upstream/NOTICE.md`). Any redistribution keeps it.

## 7. Testing Rules

- Every new module gets a `tests/<module>.test.ts` using `node:test`. Current coverage is thin (adapters, resume, export, McNemar, config are untested — see tasks.md P1-4).
- Adapter tests must use `MockAdapter` / `ScriptedMockAdapter` or a local `http` server — never a real endpoint, never the network in CI.
- Run before declaring done: `npm run typecheck && npm run lint && npm test && npm run build`. All four must pass with zero errors.

## 8. Definition of Done (for any change)

1. Typecheck, lint (no NEW warnings), tests pass.
2. Fresh-clone build still works: `rm -rf dist tsconfig.tsbuildinfo && npm run build` produces `dist/`.
3. New flags follow the flag→env→default chain and are documented in the meow help block in `cli.tsx`.
4. If behavior/scoring changed: bump `benchmarkVersion`, update `BENCHMARK.md`, add a decision entry in `memory.md`.
5. No new committed artifacts (`git status` clean of build output).
