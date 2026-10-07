# Project Memory & Context — Toolery-TS

> Primary reader: AI developer agent. **Update this file after every work session.** Append-only for decisions & learnings; edit the State section in place.

## 1. Current State (last verified 2026-10-05)

- **Version**: package `0.5.0` @ main (uncommitted local working tree on top of `95aa9c3`); benchmark contract `1.0.0`.
- **Status**: ollama-sdk upgraded `1.3.0 → 1.8.0` (latest) with the native wire contract fixed (`tool_name` on tool results). Full gate green: typecheck (strict) ✅ · tests 26/26 ✅ · lint 0/0 ✅ · build + pack:check ✅ · headless mock run 97.5% easy tier ✅ · adapter wire verified against local node:http mock (tool_name present, tool_call_id stripped by SDK as documented) ✅ · installed-package run from foreign CWD (upstream pack resolves via package root) ✅.
- **Upstream scenarios are NOT in git by design** — `vendor/toolery-upstream/` holds only `NOTICE.md`; `npm run sync:upstream` fetches the 143 YAMLs into it (network required). The npm tarball ships them via `prepublishOnly` (sync runs before pack-check `--require-upstream`).
- **Source auto-detection now checks two locations**: `<cwd>/vendor/toolery-upstream/manifest.json` (repo dev runs) and package-root-relative `vendor/toolery-upstream/manifest.json` (installed npm package) — see D-12.
- **No open fix branches** — this session's work is a local working tree; commit/PR left to the maintainer.

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
- **D-12 (2026-10-05, sdk upgrade)** — Upgraded `@nemesis-oss/ollama-sdk` 1.3.0 → 1.8.0 (P2-2 resolved: keep the nemesis SDK, do NOT swap for the official `ollama` package — 1.8 is actively maintained, has richer error taxonomy/telemetry, and the chat surface is backward compatible). **Breaking wire change found and fixed**: since SDK 1.4, `OllamaClient.chat()` strips `tool_call_id` from `role:'tool'` messages before transmission — native Ollama identifies tool results by `tool_name`. The adapter previously sent tool results with NO identifier at all after the upgrade; multi-turn loops were broken. Fix: map tool messages to `tool_name: m.name` (toolery's ChatMessage already carried `name`). SDK-local `tool_call_id` is still set for correlation but never reaches the wire — by design, not a bug.

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
| B-8 | medium | Test coverage thin (adapters, resume, config, export, McNemar untested) | **mostly fixed 2026-10-05** (adapters wire, mcnemar, config, mock; resume/export still untested) | this session |
| B-9 | low | `mcnemar` `2**discordant` overflows → NaN for discordant > 1023 | **fixed 2026-10-05** | chi-square approx + erfc (d > 1000) |
| B-10 | low | Mock adapter scores 12.5% on easy tier (scripted coverage gaps) — makes smoke-run interpretation confusing | **partially fixed 2026-10-05** (weather regex; easy mock 97.5%; other tiers still unscripted by design) | — |
| B-11 | high | ollama-sdk ≥1.4 strips `tool_call_id` from native wire → tool results anonymous → multi-turn loops broken | **fixed 2026-10-05** | `tool_name` mapping (D-12) |
| B-12 | medium | `npm run clean` leaves root `tsconfig.tsbuildinfo` → next incremental build emits nothing (empty dist, exit 0) | **fixed 2026-10-05** | `tsBuildInfoFile: dist/…`, clean removes `*.tsbuildinfo` |
| B-13 | medium | `toolery probe` without `--base-url` probed literal `undefined` | **fixed 2026-10-05** | default `http://localhost:11434` |
| B-14 | medium | OpenAI adapter threw opaque SyntaxError on HTML 502/504 bodies | **fixed 2026-10-05** | text-first read + status message |
| B-15 | medium | Runner emitted mismatched fallback tool-call ids (assistant vs tool msg) for id-less endpoints | **fixed 2026-10-05** | normalize ids pre-trace |
| B-16 | low | `--with-perf` flag accepted but never executed | **fixed 2026-10-05** | wired in headless + TUI, non-fatal |
| B-17 | high | `loadUpstreamScenarios(Sync)` defaulted to CWD-only path — installed package crashed with "pack not synced" from any foreign directory (detection probed package root, loading did not) | **fixed 2026-10-05** | `resolveUpstreamDir()` shared resolver (env → CWD → package root) used by both loaders + config |

## 4. Bugs Fixed

- 2026-09-26 · B-1 fresh-clone build emits no `dist/` · committed `tsconfig.tsbuildinfo` + `incremental: true` made build a no-op · PR #2 (untracked + ignored)
- 2026-09-26 · B-2b pack smoke test toothless (exit 0 on missing `dist/`) · `npm pack --dry-run` never fails on absent files · PR #3 (`scripts/pack-check.mjs` asserts tarball contents)
- 2026-09-26 · B-3 Ollama 1b–9b models fail every scenario · default `num_ctx` 2048 left-truncates system prompt + 18-tool catalog · PR #1 (`num_ctx: 8192` default, `seed: 0`, `keep_alive`)
- 2026-09-26 · B-4 `run` crashes non-TTY · Ink TUI rendered unconditionally, raw mode unsupported without TTY · PR #4 (`src/headless.ts`, stdin.isTTY auto-detect + `--headless`)
- 2026-09-26 · B-5 npm publish metadata incomplete · missing repository/bugs/homepage + no publish guard · PR #3 (metadata + `prepublishOnly` chain)
- 2026-09-26 · B-6 raw `ENOENT manifest.json` on unsynced upstream · dir-level `existsSync` bypassed by NOTICE.md-only dir · PR #5 (check `manifest.json` directly, friendly guidance)
- 2026-09-26 · B-7 `.toolery/` ignore pattern broken · stray space in `.toolery/** */` made it a no-op; 6.9 MB run state committed · PR #2 (pattern fixed, state untracked)
- 2026-10-05 · B-11 (critical) ollama-sdk 1.4+ strips `tool_call_id` from native `/api/chat` wire · adapter sent anonymous tool results, breaking every multi-turn tool loop on upgrade to 1.8 · `tool_name` mapping in `OllamaAdapter.complete` + wire regression test
- 2026-10-05 · B-12 `npm run clean` → empty `dist/` on next build · root-level `tsconfig.tsbuildinfo` survived `rm -rf dist`, incremental build emitted nothing · `tsBuildInfoFile: dist/tsconfig.tsbuildinfo` + clean removes `*.tsbuildinfo`
- 2026-10-05 · B-13/B-14/B-15 probe default URL `undefined`, opaque 502 SyntaxErrors, tool-call id mismatches · UX/wire fixes across cli.tsx, adapters.ts, runner.ts
- 2026-10-05 · B-9 mcnemar NaN for discordant > 1023 · `2**d` IEEE overflow · chi-square approximation (continuity-corrected, erfc) for d > 1000
- 2026-10-05 · B-10 (partial) mock weather regex captured `"Bengaluru today"` · greedy `[A-Za-z ]+` · lazy match + date-word lookahead; easy-tier mock 85% → 97.5%

## 5. Key Learnings (append-only)

- **L-1** — `tsc --incremental` + a committed `.tsbuildinfo` = fresh clones that "build" successfully while emitting zero files. Always verify builds from a clean clone (`rm -rf dist *.tsbuildinfo`), and never trust exit codes alone — check `dist/` exists.
- **L-2** — Ink's `useInput` requires raw-mode TTY stdin; any CLI that defaults to launching a TUI must detect `process.stdin.isTTY` before rendering. Batch/CI users pipe stdin constantly.
- **L-3** — Ollama truncates from the left silently when `num_ctx` is exceeded (drops system prompt + tool definitions) rather than erroring. Any Ollama tool-calling harness must set `num_ctx` explicitly, especially for small models whose Modelfiles default to 2048.
- **L-4** — Upstream scenario data can disagree with its own directory layout (empirical re-tiering). Trust the parsed `tier` field, not the path; hard-count guards (143) catch import drift early.
- **L-5** — Terminal-rendered `[` + letter sequences can be silently eaten in tool output (seen twice: `const [history` → `const istory`; `branches: [main]` → `branches: ain]`). Always verify suspicious bytes with `od -c` / `git show | od -c` before declaring a bug. Corollary: a green-but-toothless CI gate (exit 0 on missing artifacts) is as dangerous as no CI — assert concrete artifacts, not exit codes.
- **L-6** — When upgrading a transport SDK, don't trust the TypeScript compiler or unit tests alone: run a real wire capture (local `node:http` mock server) for the FULL multi-turn loop. The ollama-sdk 1.3→1.8 upgrade typechecked clean and passed every unit test, yet the SDK silently strips `tool_call_id` from tool-result messages — only a wire-level assertion caught it. SDK minor versions can change wire behavior that types and mocks both hide.
- **L-7** — `incremental: true` without an explicit `tsBuildInfoFile` puts the build state OUTSIDE `outDir` (repo root here), so `rm -rf dist` leaves a stale cache that makes the next incremental build a partial no-op (empty `dist/`, exit 0). Pin `tsBuildInfoFile` inside `outDir` so "clean the output" also cleans the state. (B-12; generalizes L-1.)

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
- 2026-10-05 (session 4) — End-to-end review on top of `95aa9c3`: upgraded `@nemesis-oss/ollama-sdk` 1.3.0→1.8.0 (D-12, resolves P2-2). Wire-capture testing caught the silent `tool_call_id` strip (B-11) that types+tests hid; fixed with `tool_name`. Fixed B-9 (mcnemar overflow), B-12 (tsbuildinfo/clean), B-13 (probe default), B-14 (502 SyntaxError), B-15 (tool-call id mismatches), B-16 (dead --with-perf), partial B-10 (weather regex), extended tests 10→23 (B-8 mostly closed). Bumped to 0.5.0; local working tree, not yet committed/pushed.
- 2026-10-05 (session 5) — Committed/pushed `upgrade/ollama-sdk-1.8`, opened PR #6 (CI green). Full re-verification of the 0.5.0 tree as a *library*: every CLI command, live SDK 1.8 wire round trips (ollama + openai-compat mock servers), programmatic API from built `dist`, and the npm tarball installed into a foreign consumer project. That install test exposed B-17: source detection probed the package root but the scenario loaders still defaulted to CWD → "pack not synced" crash from any foreign directory. Fixed with a shared `resolveUpstreamDir()` (env → CWD → package root) now used by both loaders and config; tests 23→26 (foreign-CWD regression + `TOOLERY_UPSTREAM_DIR` override). Re-verified the re-packed tarball from `/tmp` and `$HOME`: 143 upstream scenarios, full mock run, SDK 1.8 tool-call round trip. Also confirmed the recurring `ain]` display artifact (session 2's retracted B-2) is still a trap — verified `ci.yml` is genuinely `[main]` via byte codes before touching it.
- 2026-10-07 (session 6) — Bumped `@nemesis-oss/ollama-sdk` 1.8.0→1.9.0 (`^1.9.0`, changelog all-additive) with the full gate green and L-6 wire re-verified on the built dist: `tool_name` present, `tool_call_id` stripped, `options {temperature 0, num_ctx 8192, seed 0}` + `keep_alive 30m` intact. Closed the "no complete e2e smoke" gap: new `scripts/smoke.mjs` + `npm run smoke` — 12 offline stages (gate → SDK version pin → profiles/scenarios → mock headless runs synthetic 97.5% / upstream 0.0% → export → resume → probe exit codes → dist-CLI wire capture → in-process multi-turn round trip → foreign-CWD (B-17) → failure exits), negative-tested to confirm it fails loud (exit 1, stage + evidence + kept artifacts). Working tree uncommitted.
