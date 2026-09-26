# Tasks & Development Plan — Toolery-TS

> Primary reader: AI developer agent. MVP-first ordering. Status: `[TODO]` / `[IN PROGRESS]` / `[DONE]`.
> Source of truth for P0 items: fresh-clone audit of main `970eb29` (v0.4.1) + branch `fix/ollama-adapter-context-window`.
> Update statuses in place as work progresses; append new tasks at the end of their priority group.

## P0 — Publish Blockers (must all be DONE before `npm publish`)

- [ ] **P0-1. Fix fresh-clone build** — `tsconfig.tsbuildinfo` is committed to git with `incremental: true`; on a clean clone `npm install && npm run build` emits **no `dist/`**. Fix: `git rm --cached tsconfig.tsbuildinfo`, add `*.tsbuildinfo` to `.gitignore`, verify with a clean re-clone. *(Deliverable: fresh clone builds; ~15 min.)*
- [ ] **P0-2. Repair CI + docs workflow triggers** — both `.github/workflows/ci.yml` and `docs.yml` contain `branches: ain]` (corrupted `[main]`), so CI never runs on main pushes. Fix to `branches: [main]`, then confirm a green run. *(Deliverable: green CI on main.)*
- [ ] **P0-3. Merge `fix/ollama-adapter-context-window`** — critical for the flagship use case: small Ollama models (1b–9b) silently fail **every scenario** on main because default `num_ctx` (2048) left-truncates the 18-tool catalog + system prompt. Branch adds `num_ctx: 8192` default, `--num-ctx` / `TOOLERY_NUM_CTX` (min 512), `--keep-alive` (default 30m), `seed: 0`, plus Settings tab field and README docs. Action: review → merge → delete branch. *(Deliverable: native Ollama adapter usable with qwen 1b–9b.)*
- [ ] **P0-4. Add headless / non-TTY run mode** — `toolery run` currently only opens the TUI (user must press `r`); in CI/Docker/pipes Ink crashes with "Raw mode is not supported". Add: non-TTY detection (`process.stdin.isTTY`) or `--no-tui` flag → plain stdout progress + final summary + `--output` snapshot + meaningful exit code. *(Deliverable: `toolery run ... < /dev/null` completes a full benchmark and writes the JSON snapshot.)*
- [ ] **P0-5. Complete npm publish metadata** — package.json is missing `repository`, `bugs`, `homepage`; add all three (github.com/shubhamtaywade82/toolery-ts). Add `"prepublishOnly": "npm run typecheck && npm run lint && npm test && npm run build && npm run sync:upstream && npm run pack:check"` so a broken or un-synced package cannot be published (the tarball must ship the 143-scenario `vendor/toolery-upstream` suite, since `scripts/` is not in `files`). *(Deliverable: `npm publish` works with zero warnings and the installed package runs `--source upstream` out of the box.)*

## P1 — High Priority (before announcing / blogging)

- [ ] **P1-1. Fix `.gitignore` typo + untrack local state** — pattern `.toolery/** */` contains a space and never matches; `.toolery/history.json` (real run data) is committed. Fix to `.toolery/`, `git rm -r --cached .toolery`. *(5 min.)*
- [ ] **P1-2. README quickstart for npm users** — current README assumes a repo clone. Add an "Install & run in 60s" section: `npx toolery-ts@latest run --model <model> --adapter ollama ...`, including that upstream scenarios ship inside the package post-P0-5.
- [ ] **P1-3. Friendly error for unsynced upstream** — `--source upstream` without vendor manifest throws raw `ENOENT: .../manifest.json` (because `vendor/toolery-upstream/` exists with only NOTICE.md, the `existsSync` guard passes). Fix `loadUpstreamScenariosSync` to check for `manifest.json` explicitly and throw the intended `Run npm run sync:upstream.` message.
- [ ] **P1-4. Expand test coverage** (current: 10 tests / 37 LOC). Minimum additions, all offline:
  - `parseConfig` validation table (bad tier/trials/concurrency/timeout, env fallbacks)
  - `BenchmarkService` resume guards (version/model/tier/source mismatch throws) + skip-completed behavior
  - `OllamaAdapter` + `OpenAICompatibleAdapter` parsing against a local `http` mock server (tool_calls with string vs object args)
  - `mcnemar` known-answer tests (incl. discordant=0 → null p) and `exportCsv` output shape
- [ ] **P1-5. Lint debt** — eliminate new-`any` warnings at HTTP boundaries in `adapters.ts` / `scenario-loader.ts` (type the payload shapes); target 0 warnings.
- [ ] **P1-6. Publish v0.4.2** — after P0-1…P0-5 + P1-1: changelog section in README, tag `v0.4.2`, `npm publish` (public access already configured).

## P2 — Quality & Parity (post-announce backlog)

- [ ] **P2-1. Readable-code refactor** — reformat the minified modules (`runner.ts`, `adapters.ts`, `config.ts`, `benchmark.ts`, `scenario-loader.ts`, `app.tsx`) into normal multi-line style. Behavior-preserving; do it module-by-module with tests green between each.
- [ ] **P2-2. Ollama SDK decision** — evaluate swapping `@nemesis-oss/ollama-sdk` (author-owned, 3 versions) for the official `ollama` npm package. Record the decision in memory.md either way (D-4).
- [ ] **P2-3. `exports` map in package.json** — `"./cli"` vs `"."` split so programmatic consumers can't import the TUI accidentally.
- [ ] **P2-4. McNemar overflow guard** — `2**discordant` overflows to `Infinity` for discordant > 1023 → p becomes NaN. Clamp or use log-space when `discordant > 500`.
- [ ] **P2-5. Upstream parity work** (see PARITY.md): golden probe guardrail, empirical re-tiering job, richer frozen-table scrolling polish.
- [ ] **P2-6. `llama-benchy` perf integration** — currently unvalidated; either validate the CLI invocation behind `--with-perf` or hide the flag until it works.
- [ ] **P2-7. History viewer polish** — History tab sorting/filtering; bounded retention UI.

## Done (MVP baseline — do not re-implement)

- [x] Deterministic scoring engine: tool-call precision/recall/F1, argument accuracy, Jaccard text similarity — verified end-to-end against a live OpenAI-compatible endpoint.
- [x] Contract-scoring DSL (required / forbidden / partial / weighted checks).
- [x] 18 capability dimensions + 8 reporting profiles (weights only).
- [x] Six adapters (ollama native, openai-compatible, raw, cloud, hermes-stub, mock) + provider presets (Ollama, Ollama/v1, LMStudio, vLLM, OpenRouter, OpenAI, Groq, custom).
- [x] Upstream importer pinned to `36c8c0c…` with SHA-256 manifest + hard 143-count guard; tier split 40/45/34/24 verified; YAML `tier` field correctly overrides directory (upstream empirical re-tiering).
- [x] BenchmarkService: worker-pool concurrency, crash-safe per-scenario snapshot persistence, guarded resume.
- [x] Statistics: exact two-sided McNemar, tier weights (1 / 1.25 / 1.5 / 1.75), 14-day time decay.
- [x] CLI: `run`, `tui`, `profiles`, `scenarios`, `probe` (exit 1 unreachable), `export` (JSON → CSV, verified).
- [x] Nine-tab Ink TUI with live probing, masked API keys, preset carousel.
- [x] MIT license + upstream NOTICE.md provenance.

## Definition of Done for every task

`npm run typecheck && npm run lint && npm test && npm run build` green (no new warnings) · fresh-clone build still works · relevant docs updated (README / BENCHMARK.md / this file / memory.md) · decision recorded in memory.md if it changes architecture or semantics.
