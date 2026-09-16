# Toolery-TS

Deterministic tool-calling benchmark for LLM endpoints, implemented in TypeScript with Ink.

## Upstream compatibility

Toolery-TS is being kept compatible with the public `karolpalys/toolery` benchmark. The upstream project currently defines **143 hand-written scenarios** across four empirical tiers: 40 easy, 45 medium, 34 hard and 24 very-hard. It also treats adapter, cluster topology, throughput, statistical stability and capability dimensions as first-class benchmark axes. citeturn821916search0

Run the exact upstream scenario importer with:

```bash
npm install
npm run sync:upstream
```

The importer is pinned to upstream commit `36c8c0c217898aade7500fa13b02fdc4d58899f7`, validates the 143-file count, stores the original YAML plus SHA-256 hashes, and produces `vendor/toolery-upstream/manifest.json`. This keeps the source pack auditable instead of silently replacing it with approximations.

## Current engine

- OpenAI-compatible tool schemas and genuine multi-turn tool-result loops.
- Deterministic tool-call, argument and text scoring; no model-as-judge.
- 18-dimension capability matrix aligned to Toolery's current categories.
- Use-case profiles: Coding Assistant, Reasoning, Agentic Orchestrator, Safety/RAG, Customer Support, Data Analyst and Local Coding Agent.
- Concurrent execution with resumable JSON snapshots.
- Weighted tier scoring, run stability metrics, time-decay utilities and paired McNemar comparison.
- CSV export and endpoint `/models` probing.
- Optional llama-benchy throughput integration.
- Exact upstream scenario synchronization rather than invented scenario equivalence.

## CLI

```bash
toolery run --model qwen3.5:4b --base-url http://localhost:11434/v1 --tier all --trials 3
toolery scenarios --tier very-hard
toolery profiles
toolery probe --base-url http://localhost:11434/v1
toolery export --input results.json --output results.csv
npm run sync:upstream
```

## Benchmark integrity

The benchmark is deterministic by construction: scenario prompts, tool schemas, mocked results and scoring rules are versioned. Profiles affect reporting only and never alter raw trial outcomes. The runner never executes arbitrary model-generated shell/file operations.

## Architecture

```text
CLI / Ink
   └── BenchmarkService
        ├── concurrency + resume
        ├── scenario catalog
        └── ScenarioRunner
             ├── raw OpenAI-compatible transport
             ├── synthetic tool runtime
             └── deterministic scorer
                   ├── exact sequence
                   ├── argument precision
                   ├── response assertions
                   ├── capability dimensions
                   └── statistics
```

## Upstream feature parity targets

The upstream Toolery README documents three execution adapters (`raw`, `cloud`, `hermes`), DGX Spark topology tracking (`single` through `octa`), optional llama-benchy throughput, six TUI workflow tabs, empirical re-tiering, a broad 18-dimension capability matrix, and statistical comparison tooling. citeturn821916search0

The TypeScript engine now contains the reusable primitives and configuration seams for these axes. `raw`/OpenAI-compatible execution, mock execution, cluster metadata, 18 dimensions, profiles, persistence, throughput integration, and statistics are implemented. The Hermes-specific MCP bridge remains intentionally isolated because it requires the external Hermes CLI and MCP runtime; it should be added as a separate optional adapter rather than a fake implementation.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:check
```
