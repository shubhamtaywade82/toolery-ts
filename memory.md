# Project Memory & Context — Toolery-TS

> Primary reader: AI developer agent. **Update this file after every work session.** Append-only for decisions & learnings; edit the State section in place.

## 1. Current State (last verified 2026-09-26)

- **Version**: package `0.4.2` @ main; benchmark contract `1.0.0`. Tag `v0.4.2` + GitHub Release published.
- **Status**: all 5 publish blockers **resolved** (PRs #1–#5 merged 2026-09-26); release `v0.4.2` tagged. **`npm publish` still pending** — maintainer-run, now guarded by `prepublishOnly`.
- **Verified working** (fresh audit + post-merge CI): typecheck (strict) ✅ · tests 10/10 ✅ · lint 0 errors / 41 `any` warnings ✅ (PR #1 added one; P1-5 tracks the debt) · full benchmark pipeline against a live OpenAI-compatible endpoint ✅ · upstream sync (143 scenarios, SHA-256 manifest, tier split 40/45/34/24) ✅ · fresh-clone build emits `dist/` ✅ (fixed in PR #2) · headless non-TTY run ✅ (PR #4) · Ollama `num_ctx` fix merged ✅ (PR #1) · pack gate now fails on missing `dist/` ✅ (PR #3) · CI on merged main green (`test` / `build` / `deploy`) ✅.
- **Upstream scenarios are NOT in git by design** — `vendor/toolery-upstream/` holds only `NOTICE.md`; `npm run sync:upstream` fetches the 143 YAMLs into it (network required). The npm tarball ships them via `prepublishOnly` (sync runs before pack-check `--require-upstream`).
- **No open fix branches** — `fix/ollama-adapter-context-window` merged as PR #1; P0 fix branches merged as PRs #2–#5 and deleted. Only `main` remains on the remote.

## 2. Key Decisions (append-only — never delete, supersede with a new entry)

- **D-1 (2026-09, audit)** — `tsconfig.tsbuildinfo` was committed to git in commit `b09e044`. With `incremental: true`, fresh clones build nothing. Decision: remove from git, ignore `*.tsbuildinfo`. *Rule for the AI: never commit build caches.*
- **D-2 (2026-09, audit) — RETRACTED, see D-2b** — initially recorded the CI/docs workflow triggers as corrupted (`branches: ain]`). That was a terminal display artifact that ate the `[m` sequence; raw bytes at `origin/main` were always `branches: [main]` (verified via `od -c`). Lesson: always verify suspicious raw bytes with an escape-safe dump (`od -c` / `git show | od`) before reporting.
- **D-2b (2026-09, audit)** — the REAL CI gap: `npm pack --dry-run` exits 0 with a 6-file tarball even when `dist/` doesn't exist, so the CI "Package smoke test" step passes green on broken builds — exactly how D-1 escaped CI. Decision: add `scripts/pack-check.mjs` asserting `dist/cli.js` + `dist/index.js` in the tarball; `prepublishOnly` additionally enforces the synced vendor suite via `--require-upstream`. (Branch `fix/publish-readiness`.)
- **D-3 (2026-09, unmerged branch)** — Ollama silently left-truncates context when the default `num_ctx` (often 2048 in Modelfiles) is smaller than the 18-tool catalog + system prompt, making every scenario fail for 1b–9b models. Decision: adapter sets `num_ctx: 8192` default (overridable `--num-ctx`, min 512), `keep_alive: 30m`, `seed: 0`. Waiting on merge (P0-3).
- **D-4 (2026-09)** — Native Ollama transport uses the author's own `@nemesis-oss/ollama-sdk` (v1.3, 3 versions, zero deps) rather than the official `ollama` package. Rationale: author-controlled, tool-calling focused. Risk: single-maintainer dependency for the flagship adapter. Re-evaluate at P2-2; do not swap without recording the outcome here.
- **D-5 (2026-09, audit)** — `run` and `tui` are currently the same thing: both render the Ink TUI and require a keypress (`r`) to start, crashing without a TTY. Decision: add headless mode (P0-4) — non-TTY detection or `--no-tui`; README examples already read as if headless exists.
- **D-6 (inherited)** — Upstream suite pinned to `karolpalys/toolery@36c8c0c217898aade7500fa13b02fdc4d58899f7`. Importer hard-fails on any count ≠ 143. Upstream YAML `tier` field is authoritative over its directory (upstream did empirical re-tiering, e.g. `easy-03-refuse-trivial-math.yaml` lives in `easy/` but declares `tier: very_hard` — 13.3% pass-rate).
- **D-7 (inherited)** — No model-as-judge, ever. All scoring is deterministic contract evaluation. Profiles weight reporting only; they can never flip a pass/fail.
- **D-8 (inherited)** — Benchmark integrity: the runner never executes model-generated shell/file ops; tool results are synthetic fixtures; terminal scenarios are scored on observable tool-call contracts.
- **D-9 (inherited)** — Hermes adapter is a deliberate stub that throws with setup guidance; no fake Hermes results. Cluster axis (`single|dual|triple|quad|octa`) is metadata only.
- **D-10 (2026-09, audit)** — The 6 AI-context docs (`prd/architecture/rules/design/tasks/memory`) were added at project root, grounded in a full external audit. Docs are source-of-truth for new sessions; code wins on conflict → then fix the docs.
- **D-11 (2026-09-26, release)** — v0.4.2 released via 5 PRs (#1 Ollama num_ctx — author-merged; #2 fresh-clone build + repo hygiene; #3 pack-gate hardening + npm metadata + `prepublishOnly`; #4 headless run mode; #5 upstream-sync error UX), all merged as merge commits, branches deleted after merge. Release flow: docs ticked → version bumped → full `prepublishOnly` gate run locally → tag `v0.4.2` → GitHub Release. `npm publish` itself is maintainer-run (requires their npm credentials/OTP).

## 3. Known Bugs & Issues Register

| ID | Severity | Summary | Status | Fix path |
|---|---|---|---|---|
| B-1 | blocker | Committed `tsconfig.tsbuildinfo` breaks fresh-clone builds | **fixed 2026-09-26** | PR #2 |
| B-2 | ~~blocker~~ **RETRACTED** | "CI triggers corrupted `branches: ain]`" — false positive from terminal display artifact; raw bytes were always `[main]` (od -c verified) | retracted | — |
| B-2b | high | `npm pack --dry-run` exits 0 without `dist/` → CI pack smoke test cannot catch broken builds | **fixed 2026-09-26** | PR #3 (P0-2) |
| B-3 | blocker | Ollama native adapter fails all scenarios for 1b–9b models (num_ctx truncation) | **fixed 2026-09-26** | PR #1 (author-merged) |
| B-4 | blocker | No headless mode; Ink crashes in non-TTY (`Raw mode is not supported`) | **fixed 2026-09-26** | PR #4 (P0-4) |
| B-5 | blocker | package.json missing repository/bugs/homepage; no prepublishOnly guard | **fixed 2026-09-26** | PR #3 (P0-5) |
| B-6 | high | `--source upstream` unsynced → raw `ENOENT manifest.json` instead of friendly guidance (existsSync dir check bypassed by NOTICE.md) | **fixed 2026-09-26** | PR #5 (P1-3) |
| B-7 | medium | `.gitignore` pattern `.toolery/** */` has a space; `.toolery/history.json` committed | **fixed 2026-09-26** | PR #2 (P1-1) |
| B-8 | medium | Test coverage thin (adapters, resume, config, export, McNemar untested) | open | tasks P1-4 |
| B-9 | low | `mcnemar` `2**discordant` overflows → NaN for discordant > 1023 | open | tasks P2-4 |
| B-10 | low | Mock adapter scores 12.5% on easy tier (scripted coverage gaps) — makes smoke-run interpretation confusing | open | — |

## 4. Bugs Fixed

- 2026-09-26 · B-1 fresh-clone build emits no `dist/` · committed `tsconfig.tsbuildinfo` + `incremental: true` made build a no-op · PR #2 (untracked + ignored)
- 2026-09-26 · B-2b pack smoke test toothless (exit 0 on missing `dist/`) · `npm pack --dry-run` never fails on absent files · PR #3 (`scripts/pack-check.mjs` asserts tarball contents)
- 2026-09-26 · B-3 Ollama 1b–9b models fail every scenario · default `num_ctx` 2048 left-truncates system prompt + 18-tool catalog · PR #1 (`num_ctx: 8192` default, `seed: 0`, `keep_alive`)
- 2026-09-26 · B-4 `run` crashes non-TTY · Ink TUI rendered unconditionally, raw mode unsupported without TTY · PR #4 (`src/headless.ts`, stdin.isTTY auto-detect + `--headless`)
- 2026-09-26 · B-5 npm publish metadata incomplete · missing repository/bugs/homepage + no publish guard · PR #3 (metadata + `prepublishOnly` chain)
- 2026-09-26 · B-6 raw `ENOENT manifest.json` on unsynced upstream · dir-level `existsSync` bypassed by NOTICE.md-only dir · PR #5 (check `manifest.json` directly, friendly guidance)
- 2026-09-26 · B-7 `.toolery/` ignore pattern broken · stray space in `.toolery/** */` made it a no-op; 6.9 MB run state committed · PR #2 (pattern fixed, state untracked)

## 5. Key Learnings (append-only)

- **L-1** — `tsc --incremental` + a committed `.tsbuildinfo` = fresh clones that "build" successfully while emitting zero files. Always verify builds from a clean clone (`rm -rf dist *.tsbuildinfo`), and never trust exit codes alone — check `dist/` exists.
- **L-2** — Ink's `useInput` requires raw-mode TTY stdin; any CLI that defaults to launching a TUI must detect `process.stdin.isTTY` before rendering. Batch/CI users pipe stdin constantly.
- **L-3** — Ollama truncates from the left silently when `num_ctx` is exceeded (drops system prompt + tool definitions) rather than erroring. Any Ollama tool-calling harness must set `num_ctx` explicitly, especially for small models whose Modelfiles default to 2048.
- **L-4** — Upstream scenario data can disagree with its own directory layout (empirical re-tiering). Trust the parsed `tier` field, not the path; hard-count guards (143) catch import drift early.
- **L-5** — Terminal-rendered `[` + letter sequences can be silently eaten in tool output (seen twice: `const [history` → `const istory`; `branches: [main]` → `branches: ain]`). Always verify suspicious bytes with `od -c` / `git show | od -c` before declaring a bug. Corollary: a green-but-toothless CI gate (exit 0 on missing artifacts) is as dangerous as no CI — assert concrete artifacts, not exit codes.

## 6. Environment & Verification Facts

- Node >= 20 required (`engines`); dev/CI verified on Node 24. ESM only; relative imports need `.js` extensions.
- Command gate: `npm run typecheck && npm run lint && npm test && npm run build` (+ `npm run pack:check` for release).
- `npm run sync:upstream` needs network to api.github.com / raw.githubusercontent.com; writes 143 YAMLs + `manifest.json` into `vendor/toolery-upstream/` (untracked).
- Env-var config surface: `TOOLERY_SOURCE, TIER, TRIALS, ADAPTER, CONCURRENCY, TIMEOUT_MS, CLUSTER, MODEL, BASE_URL, API_KEY, PROFILE, BENCHMARK_VERSION, OUTPUT, RESUME, UPSTREAM_DIR, NUM_CTX, KEEP_ALIVE` (last two active since PR #1 merged).
- Offline testing pattern: `MockAdapter`/`ScriptedMockAdapter` for scoring paths; a local `node:http` server for adapter HTTP parsing tests — never real endpoints in CI.
- Docs site: `website/` (VitePress, own package.json) — `npm run docs:dev` / `docs:build`; excluded from the npm package.

## 7. Session Log (append one line per work session)

- 2026-09-26 — Full external audit of main `970eb29`: verified pipeline end-to-end, found B-1…B-7, wrote `prd.md`, `architecture.md`, `rules.md`, `design.md`, `tasks.md`, `memory.md`.
- 2026-09-26 (session 2) — Drafted P0 fix branches: `fix/fresh-clone-build` (B-1/B-7, re-clone verified), `fix/publish-readiness` (B-2b + P0-5), `feat/headless-run` (B-4), `fix/upstream-sync-error` (B-6). **Retracted B-2** (CI trigger "corruption") after `od -c` proved it a display artifact; replaced with B-2b (pack gate toothless). Docs corrected accordingly.
- 2026-09-26 (session 3) — Pushed main + branches, opened PRs #2–#5 (all CI-green), discovered author had already merged PR #1; rebased everything onto merged main, merged #2–#5, deleted all fix branches, released **v0.4.2** (docs ticked, version bumped, `prepublishOnly` gate green, tag + GitHub Release). `npm publish` left to maintainer.
