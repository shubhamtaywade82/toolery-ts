# Toolery-TS

Deterministic tool-calling benchmark for LLM endpoints.

## Quick start

```bash
npm install
npm run build
node dist/cli.js run --adapter mock --model demo --tier easy --trials 1
```

### Ollama

```bash
toolery run \
  --adapter openai-compatible \
  --model qwen3.5:4b \
  --base-url http://localhost:11434/v1 \
  --tier all \
  --trials 3
```

## Features

- 143-scenario upstream-compatible benchmark contract
- 18 capability dimensions
- deterministic tool-call and response assertions
- genuine multi-turn tool-result execution
- concurrency, resume and history
- profiles, statistics and CSV export
- endpoint probing and optional throughput measurements
- Ink terminal UI

## Design principles

Toolery-TS keeps raw trial outcomes independent from reporting profiles, executes only synthetic benchmark tools, versions scenario provenance, and fails explicitly when an external runtime is unavailable.

- [Benchmark methodology](/benchmark)
- [Upstream parity](/parity)
- [CLI reference](/cli)
