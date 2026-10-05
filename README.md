# Toolery-TS

Deterministic tool-calling benchmark for LLM endpoints, implemented in TypeScript with Ink.

## Installation

### From npm

Install globally to get the `toolery` command on your system:

```bash
npm install -g toolery-ts
```

Or run directly without installing:

```bash
npx toolery-ts run --model qwen2.5:4b --adapter ollama
```

### From source (local clone)

```bash
git clone https://github.com/shubhamtaywade82/toolery-ts.git
cd toolery-ts
npm install
npm run build
npm link             # Symlinks 'toolery' into your global PATH
```

Alternatively, run directly from the repository without `npm link`:

```bash
npm run dev -- tui          # Interactive TUI via tsx
npm start -- run --headless # Build and run headless CLI
# or
node dist/cli.js tui
```

## Upstream compatibility

Toolery-TS targets compatibility with `karolpalys/toolery`. The pinned upstream source defines 143 hand-written scenarios: 40 easy, 45 medium, 34 hard and 24 very-hard, plus a richer scoring contract and multi-axis evaluation model.

The authoritative scenario source is the upstream YAML suite. Import it verbatim with:

```bash
npm install
npm run sync:upstream
```

The importer is pinned to upstream commit `36c8c0c217898aade7500fa13b02fdc4d58899f7`, validates the 143-file count, stores the original YAML and SHA-256 hashes, and produces `vendor/toolery-upstream/manifest.json`.

**Important:** the current Git repository contains the importer and a deterministic synthetic fallback pack; the 143 upstream YAML files are not silently replaced by approximations. Run `npm run sync:upstream` on a networked machine to vendor the authoritative suite, then run with `--source upstream`.

## Engine

- OpenAI-compatible function/tool schemas and genuine multi-turn tool-result loops.
- Deterministic tool-call, argument and response scoring; no model-as-judge.
- Upstream-style `required`, `forbidden`, `partial` and weighted checks for core scoring predicates.
- 18-dimension capability matrix.
- Profiles for coding, reasoning, agentic orchestration, safety/RAG, customer support, data analysis and local coding agents.
- Concurrent execution with resumable JSON snapshots and persistent run history.
- Tier-weighted reporting, stability statistics, 14-day time decay utility and paired McNemar comparison.
- Nine-tab Ink UI: Home, Scenarios, Run, Results, Rankings, Compare, Profiles, History, Settings.
- Endpoint probing, CSV export and optional llama-benchy integration.
- Explicit raw/cloud/mock/Hermes adapter contracts; Hermes remains a separate optional bridge because it depends on the external Hermes CLI/MCP runtime.

## CLI

```bash
# Local Ollama native endpoint (default adapter since 0.4.1; run auto-detects non-interactive stdin)
toolery run --model qwen2.5:1.5b --adapter ollama --base-url http://localhost:11434 --source synthetic --tier all --trials 3

# OpenAI-compatible endpoint (vLLM / llama.cpp / LMStudio / Ollama /v1)
toolery run --model qwen2.5:4b --adapter openai-compatible --base-url http://localhost:11434/v1 --source synthetic --tier all --trials 3
toolery tui  --model qwen2.5:4b --base-url http://localhost:11434/v1

# Exact upstream benchmark after sync
npm run sync:upstream
toolery run --model qwen3.5:4b --source upstream --base-url http://localhost:11434/v1 --tier all --trials 3

toolery scenarios --source upstream --tier very-hard
toolery profiles
toolery probe --base-url http://localhost:11434/v1
toolery export --input results.json --output results.csv
```

### Context window for small models (1b-9b)

When using the `ollama` adapter with small local models (1b-9b parameters), the
default Ollama `num_ctx` (often 2048 from the Modelfile) is too small to hold the
full 18-tool catalog plus system prompt and conversation history. Ollama silently
truncates from the left, dropping the system prompt and causing every scenario to
fail. Toolery now sets `num_ctx: 8192` by default, and exposes `--num-ctx` /
`TOOLERY_NUM_CTX` to override it:

```bash
# Increase context for larger tool catalogs or longer multi-turn scenarios
toolery run --model qwen2.5:7b --adapter ollama --num-ctx 16384 --tier all

# Keep the model warm between scenarios (default: 30m)
toolery run --model qwen2.5:7b --adapter ollama --keep-alive 60m --tier all
```

### Headless / CI usage

When stdin is not a TTY (CI runners, Docker, SSH scripts, pipes), `toolery run`
executes non-interactively: one progress line per scenario, a final summary,
exit code 0 on completion and 1 on fatal errors. Force it explicitly with
`--headless`:

```bash
toolery run --adapter ollama --model qwen2.5:4b --tier all --trials 3 --output results.json --headless
toolery export --input results.json --output results.csv
```

`toolery tui` always launches the interactive dashboard and requires a terminal.

## Configuration & Environment Variables

Toolery can be configured via CLI flags or matching environment variables. CLI flags take precedence over environment variables:

| CLI Option | Environment Variable | Default | Description |
|---|---|---|---|
| `--model <name>` | `TOOLERY_MODEL` | `""` (or detected via probe) | Target model name (e.g. `qwen2.5:7b`, `llama3.1:8b`, `gpt-4o`) |
| `--adapter <kind>` | `TOOLERY_ADAPTER` | `ollama` | Provider adapter: `ollama`, `openai-compatible`, `raw`, `cloud`, `hermes`, `mock` |
| `--base-url <url>` | `TOOLERY_BASE_URL` | `http://localhost:11434` (`/v1` for OpenAI) | Endpoint API base URL |
| `--api-key <key>` | `TOOLERY_API_KEY` | `""` | API authentication key for cloud or gated endpoints |
| `--source <source>` | `TOOLERY_SOURCE` | `synthetic` | Scenario pack: `synthetic` or `upstream` |
| `--tier <tier>` | `TOOLERY_TIER` | `all` | Scenario tier: `all`, `easy`, `medium`, `hard`, `very-hard` |
| `--trials <n>` | `TOOLERY_TRIALS` | `3` | Number of trial iterations per scenario (1–100) |
| `--concurrency <n>` | `TOOLERY_CONCURRENCY` | `1` | Concurrent scenario worker threads (1–32) |
| `--timeout <ms>` | `TOOLERY_TIMEOUT_MS` | `180000` | Request timeout in milliseconds (minimum 100ms) |
| `--num-ctx <n>` | `TOOLERY_NUM_CTX` | `8192` | Ollama context window size (minimum 512) |
| `--keep-alive <dur>` | `TOOLERY_KEEP_ALIVE` | `"30m"` | Ollama model keep-alive duration in memory |
| `--profile <id>` | `TOOLERY_PROFILE` | `default` | Benchmark scoring weight profile |
| `--cluster <top>` | `TOOLERY_CLUSTER` | `single` | Cluster topology metadata (`single`, `dual`, `triple`, `quad`, `octa`) |
| `--output <path>` | `TOOLERY_OUTPUT` | `""` | Path to save resumable JSON execution snapshot |
| `--resume <path>` | `TOOLERY_RESUME` | `""` | Path to existing JSON snapshot to resume incomplete runs |
| `--headless` | — | `false` | Run headless without rendering TUI (auto when non-TTY) |

### Built-in Provider Presets

The interactive TUI includes pre-configured presets for popular local and cloud inference servers:
- **Ollama Native (Local)**: `http://localhost:11434` (`ollama` adapter)
- **Ollama OpenAI (Local)**: `http://localhost:11434/v1` (`openai-compatible` adapter)
- **LMStudio (Local)**: `http://localhost:1234/v1` (`openai-compatible` adapter)
- **vLLM (Local)**: `http://localhost:8000/v1` (`openai-compatible` adapter)
- **OpenRouter (Cloud)**: `https://openrouter.ai/api/v1` (requires `--api-key`)
- **OpenAI Official**: `https://api.openai.com/v1` (requires `--api-key`)
- **Groq Cloud**: `https://api.groq.com/openai/v1` (requires `--api-key`)
- **Mock Adapter**: In-memory dummy provider for offline verification

## Interactive TUI

Launch the full-screen terminal dashboard:

```bash
toolery tui --model qwen2.5:4b --base-url http://localhost:11434
# Or from a local clone:
npm start -- tui --model qwen2.5:4b
```

*(Note: In an interactive terminal, `toolery run` without `--headless` also opens the TUI).*

### Dashboard Tabs

1. **Home**: Overview of endpoint health, current configuration, benchmark progress bar, live tool-call trace, capability scores, and recent trial outcomes.
2. **Scenarios**: Filterable catalog of scenarios with tier and category tags.
3. **Run**: Real-time per-scenario execution monitor showing current progress and live trial traces.
4. **Results**: Summary of completed scenarios, pass/fail status, and tool call counts.
5. **Rankings**: Capability scores across 18 dimensions (coding, debugging, safety, parameter precision, etc.).
6. **Compare**: McNemar paired statistical testing between runs.
7. **Profiles**: Catalog of weighting profiles for specific domain use cases.
8. **History**: Local benchmark history persisted across sessions in `.toolery/history.json`.
9. **Settings**: Live control panel allowing real-time adjustment of presets, URLs, keys, tiers, context sizes, and model switching without restarting the app.

### Keybindings & Navigation

| Key | Context | Action |
|---|---|---|
| <kbd>Tab</kbd> / <kbd>→</kbd> / <kbd>←</kbd> | Global | Switch between dashboard tabs |
| <kbd>r</kbd> | Global | Start or execute benchmark run |
| <kbd>s</kbd> | Global | Jump directly to Settings tab |
| <kbd>p</kbd> | Global | Trigger endpoint health probe & model detection |
| <kbd>m</kbd> | Global | Cycle through models discovered by the probe |
| <kbd>q</kbd> | Global | Quit Toolery |
| <kbd>Ctrl+C</kbd> × 2 | Global | Quit Toolery (press twice within 2 seconds) |
| <kbd>Enter</kbd> | Settings | Open selection dialog or text input for selected field |
| <kbd>Space</kbd> | Settings Dialog | Toggle selection in multi-select dialogs (e.g. Models) |
| <kbd>Esc</kbd> | Global / Settings | Close active dialog / return to Home tab (does not exit) |

## Benchmark integrity

Scenario definitions, tool schemas, mocked results, checks and benchmark version are versioned. Profiles affect reporting only. The benchmark runner never executes arbitrary shell/file operations generated by a model; terminal scenarios are evaluated through observable tool-call contracts.

## Architecture

```text
CLI / Ink
   └── BenchmarkService
        ├── concurrency + resume + history
        ├── scenario source
        │    ├── exact upstream YAML
        │    └── synthetic fallback
        └── ScenarioRunner
             ├── adapter transport
             ├── tool-result fixture runtime
             └── deterministic contract scorer
                  ├── required / forbidden / partial
                  ├── tool-call exactness
                  ├── argument accuracy
                  ├── response predicates
                  └── capability dimensions
```

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:check
```

## Changelog

### 0.5.0 (2026-10-05)

- **Upgrade** — `@nemesis-oss/ollama-sdk` `1.3.0` → `1.8.0` (latest). The native Ollama adapter now speaks the SDK's current wire contract: tool-result messages are identified by `tool_name` (Ollama's native `/api/chat` field) instead of `tool_call_id`, which the SDK strips from native requests since 1.4. Without this, every multi-turn tool loop sent anonymous tool results and broke against real Ollama servers.
- **Fixed** — `toolery probe` without `--base-url` probed the literal URL `undefined`; it now defaults to `http://localhost:11434` (or `TOOLERY_BASE_URL`).
- **Fixed** — OpenAI-compatible adapter reported opaque `Unexpected token '<'` SyntaxErrors for HTML error pages (502/504 gateways); it now reports `LLM endpoint returned <status>` with the body snippet.
- **Fixed** — tool-call id mismatches in multi-turn loops against OpenAI-compatible endpoints that omit tool-call ids (vLLM, LMStudio): the runner now assigns stable ids so assistant `tool_calls` and tool-result messages correlate correctly.
- **Fixed** — `mcnemar` produced `NaN`/`0` p-values for discordant counts > 1023 (`2**d` overflows IEEE doubles); large counts now use the chi-square approximation with continuity correction (exact binomial is kept for d ≤ 1000).
- **Fixed** — `npm run clean` left a root-level `tsconfig.tsbuildinfo` behind, making the next incremental build silently emit nothing (empty `dist/` with exit 0). The build info now lives inside `dist/` and `clean` removes it; `tsBuildInfoFile` is pinned.
- **Fixed** — mock adapters extracted `Bengaluru today` as the weather location (greedy regex), halving argument accuracy for weather scenarios; mock easy-tier smoke score rose 85% → 97.5%.
- **Fixed** — upstream source auto-detection only looked at the working directory; the installed npm package now also resolves the vendored suite relative to the package root, so `--source upstream` works from any directory after `npm i -g toolery-ts`.
- **Added** — `--keep-alive` / `TOOLERY_KEEP_ALIVE` now validates the Ollama duration format (`30m`, `5s`, `1h30m`, or seconds) instead of passing garbage to the server.
- **Added** — `--with-perf` actually runs llama-benchy throughput checks after the benchmark (headless + TUI). It was previously accepted and silently ignored. Missing `uvx`/llama-benchy is logged and skipped, never fatal.
- **Tests** — coverage extended from 10 to 23 tests: adapter wire contract (`tool_name`, `num_ctx`/`seed`/`keep_alive`, `/v1` normalization, non-JSON error bodies), McNemar overflow, config validation, mock extraction regressions.

### 0.4.2 (2026-09-26)

- **Fixed** — fresh-clone builds: `tsconfig.tsbuildinfo` is no longer committed; a clean clone now emits `dist/` (PR #2).
- **Fixed** — Ollama adapter context overflow: `num_ctx: 8192` default, `--num-ctx` / `TOOLERY_NUM_CTX`, `--keep-alive`, `seed: 0` — small (1b–9b) models no longer silently fail every scenario (PR #1).
- **Added** — headless non-TTY run mode: auto-activates when stdin is not a TTY, or force with `--headless`; per-scenario progress lines, tier summary, `--output` snapshots, meaningful exit codes — safe for CI, Docker and pipes. Also propagates `--source` and requires `--model` for non-mock adapters (PR #4).
- **Fixed** — pack smoke test hardened: `scripts/pack-check.mjs` fails when the tarball lacks the CLI/entry files; `prepublishOnly` additionally enforces the synced 143-scenario upstream suite (PR #3).
- **Fixed** — npm publish metadata: `repository` / `bugs` / `homepage` added (PR #3).
- **Fixed** — friendly error when the upstream scenario pack is not synced, pointing at `npm run sync:upstream` (PR #5).
- **Repo hygiene** — `.gitignore` typo fixed; 6.9 MB of local run state untracked (PR #2).
- **Docs** — AI-assisted development context files (`prd.md`, `architecture.md`, `rules.md`, `design.md`, `tasks.md`, `memory.md`).

## Provenance

The upstream benchmark is MIT licensed. Vendored upstream scenario data must retain the upstream copyright/license notice; `vendor/toolery-upstream/NOTICE.md` records the provenance.
