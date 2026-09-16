# Toolery-TS

Deterministic tool-calling benchmark for local and remote LLM endpoints.

Toolery-TS measures whether a model selects the right tools, supplies correct arguments, respects constraints, handles multi-step workflows, and produces the required response without relying on a model-as-judge.

## Quick start

```bash
npm install
npm run build
node dist/cli.js run --adapter mock --model demo --tier easy --trials 1
```

For Ollama's OpenAI-compatible endpoint:

```bash
toolery run \
  --adapter openai-compatible \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1 \
  --tier all \
  --trials 3
```

## What it measures

- 143-scenario upstream-compatible benchmark pack
- 18 capability dimensions
- deterministic tool-call and response assertions
- genuine multi-turn tool-result loops
- configurable profiles, concurrency, resume and history
- CSV export and statistical comparison
- endpoint probing and optional throughput measurements
- Ink-based terminal UI

## Design principles

1. Raw trial outcomes are never changed by a reporting profile.
2. Tool execution in the benchmark is synthetic and sandboxed.
3. Model output is scored against explicit scenario contracts.
4. Benchmark provenance is versioned and auditable.
5. Unsupported external runtimes fail explicitly instead of silently falling back.

## Navigation

- [Benchmark methodology](/benchmark)
- [Upstream parity](/parity)
- [CLI reference](/cli)
