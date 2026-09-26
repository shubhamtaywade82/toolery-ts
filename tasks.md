# Tasks & Development Plan — Toolery-TS

> Primary reader: AI developer agent. MVP-first ordering. Status: `[TODO]` / `[IN PROGRESS]` / `[DONE]`.
> Source of truth for P0 items: fresh-clone audit of main `970eb29` (v0.4.1) + branch `fix/ollama-adapter-context-window`.
> Update statuses in place as work progresses; append new tasks at the end of their priority group.

## P0 — Publish Blockers (must all be DONE before `npm publish`)

- [x] **P0-1. Fix fresh-clone build** *(DONE 2026-09-26 — PR #2)* — `tsconfig.tsbuildinfo` is committed to git with `incremental: true`; on a clean clone `npm install && npm run build` emits **no `dist/`**. Fix: `git rm --cached tsconfig.tsbuildinfo`, add `*.tsbuildinfo` to `.gitignore`, verify with a clean re-clone. *(Deliverable: fresh clone builds; ~15 min.)*
- [x] **P0-2. Harden the CI pack smoke test** *(DONE 2026-09-26 — PR #3)* — `npm pack --dry-run` exits **0** even when `dist/` is missing (6-file tarball, no bin), so the CI "Package smoke test" step goes green on broken builds — that is how P0-1 escaped notice. Add `scripts/pack-check.mjs` that parses `npm pack --dry-run --json` and fails unless `dist/cli.js` + `dist/index.js` are present; wire it into `pack:check` (CI-safe) and `prepublishOnly` (`--require-upstream` mode also enforces the synced vendor suite). *(Deliverable: CI goes red on a no-dist build; see branch `fix/publish-readiness`.)*
- [x] **P0-3. Merge `fix/ollama-adapter-context-window`** *(DONE 2026-09-26 — merged by author as PR #1; branch deleted)* — critical for the flagship use case: small Ollama models (1b–9b) silently fail **every scenario** on main because default `num_ctx` (2048) left-truncates the 18-tool catalog + system prompt. Branch adds `num_ctx: 8192` default, `--num-ctx` / `TOOLERY_NUM_CTX` (min 512), `--keep-alive` (default 30m), `seed: 0`, plus Settings tab field and README docs. Action: review → merge → delete branch. *(Deliverable: native Ollama adapter usable with qwen 1b–9b.)*
- [x] **P0-4. Add headless / non-TTY run mode** *(DONE 2026-09-26 — PR #4: stdin.isTTY auto-detect + `--headless`, progress lines, snapshot, exit codes)* — `toolery run` currently only opens the TUI (user must press `r`); in CI/Docker/pipes Ink crashes with "Raw mode is not supported". Add: non-TTY detection (`process.stdin.isTTY`) or `--no-tui` flag → plain stdout progress + final summary + `--output` snapshot + meaningful exit code. *(Deliverable: `toolery run ... < /dev/null` completes a full benchmark and writes the JSON snapshot.)*
- [x] **P0-5. Complete npm publish metadata** *(DONE 2026-09-26 — PR #3: repository/bugs/homepage + prepublishOnly guard)* — package.json is missing `repository`, `bugs`, `homepage`; add all three (github.com/shubhamtaywade82/toolery-ts). Add `"prepublishOnly"` (typecheck → lint → test → sync:upstream → build → pack-check --require-upstream) so a broken or un-synced package cannot be published (the tarball must ship the 143-scenario `vendor/toolery-upstream` suite, since `scripts/` is not in `files`). *(Deliverable: `npm publish` works with zero warnings and the installed package runs `--source upstream` out of the box; see branch `fix/publish-readiness`.)*

> Correction 2026-09-26: an earlier revision of this file claimed the workflow triggers were corrupted (`branches: ain]`). That was a **terminal display artifact** — the raw bytes at `origin/main` are `branches: [main]` and always were (verified with `od -c`). The real gate gap is P0-2 above.

## P1 — High Priority (before announcing / blogging)

- [x] **P1-1. Fix `.gitignore` typo + untrack local state** *(DONE 2026-09-26 — PR #2)* — pattern `.toolery/** */` contains a space and never matches; `.toolery/history.json` (real run data) is committed. Fix to `.toolery/`, `git rm -r --cached .toolery`. *(5 min.)*
- [x] **P1-2. README quickstart for npm users** *(DONE 2026-09-26)* — added Installation section (npm global, npx direct execution, source build/link), configuration & environment variables table, preset catalog, and interactive TUI usage/keybindings guide.
- [x] **P1-3. Friendly error for unsynced upstream** *(DONE 2026-09-26 — PR #5)* — `--source upstream` without vendor manifest throws raw `ENOENT: .../manifest.json` (because `vendor/toolery-upstream/` exists with only NOTICE.md, the `existsSync` guard passes). Fix `loadUpstreamScenariosSync` to check for `manifest.json` explicitly and throw the intended `Run npm run sync:upstream.` message.
- [ ] **P1-4. Expand test coverage** (current: 10 tests / 37 LOC). Minimum additions, all offline:
  - `parseConfig` validation table (bad tier/trials/concurrency/timeout, env fallbacks)
  - `BenchmarkService` resume guards (version/model/tier/source mismatch throws) + skip-completed behavior
  - `OllamaAdapter` + `OpenAICompatibleAdapter` parsing against a local `http` mock server (tool_calls with string vs object args)
  - `mcnemar` known-answer tests (incl. discordant=0 → null p) and `exportCsv` output shape
- [x] **P1-5. Lint debt** *(DONE 2026-09-26)* — eliminate `any` warnings across all modules (`adapters.ts`, `scenario-loader.ts`, `probe.ts`, `app.tsx`, `cli.tsx`, `contract-scoring.ts`); achieved 0 errors and 0 warnings.
- [x] **P1-6. Publish v0.4.2** — after P0-1…P0-5 + P1-1: changelog section in README, tag `v0.4.2`, `npm publish` (public access already configured). *(Version bumped, README changelog added, tag `v0.4.2` pushed and GitHub Release created 2026-09-26 — only `npm publish` remains, maintainer-run.)*

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
