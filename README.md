# Toolery-TS

Deterministic tool-calling benchmark for LLM endpoints, implemented in TypeScript with an Ink terminal UI.

## What it measures

Toolery-TS evaluates observable model behavior without a model-as-judge. It measures tool-call sequence accuracy, argument accuracy, text similarity, latency, token usage when reported, and capability-oriented scores.

## Included benchmark

Version `1.0.0` ships exactly **143 versioned scenarios**:

| Tier | Scenarios |
|---|---:|
| Easy | 40 |
| Medium | 45 |
| Hard | 34 |
| Very hard | 24 |
| **Total** | **143** |

The scenarios cover single-tool restraint, parameter precision, dependent multi-step sequences, state tracking, recovery patterns, long-horizon constraints, and summarization after tool results. The dataset is stored as code and protected by tests that assert the 143/40/45/34/24 split.

## Requirements

- Node.js 20+
- An OpenAI-compatible `/chat/completions` endpoint for real model runs

The default URL is `http://localhost:11434/v1`, which works with Ollama's OpenAI-compatible API surface.

## Install

```bash
npm install
npm run build
npm link
```

## Usage

```bash
# Run the complete 143-scenario benchmark with a local/mock adapter
TOOLERY_ADAPTER=mock toolery run --tier all --trials 1

# Benchmark an OpenAI-compatible endpoint such as Ollama
TOOLERY_MODEL=qwen3.5:4b toolery run \
  --base-url http://localhost:11434/v1 \
  --tier easy \
  --trials 3

# Probe endpoint reachability and /models
TOOLERY_ADAPTER=openai-compatible toolery probe \
  --base-url http://localhost:11434/v1

# Inspect the benchmark catalog
toolery scenarios --tier very-hard

toolery profiles

# Save an interrupt-resumable JSON result file
toolery run --model qwen3.5:4b --output results.json

# Resume from a previous result file
toolery run --model qwen3.5:4b --resume results.json --output results.json

# Convert a completed JSON result into CSV
toolery export --input results.json --output results.csv
```

Set `TOOLERY_API_KEY` for authenticated endpoints. API keys are intentionally excluded from persisted configuration and benchmark output.

## Architecture

```text
                         ┌─────────────────────┐
                         │      toolery CLI     │
                         └──────────┬──────────┘
                                    │
                              Ink / React TUI
                                    │
                         ┌──────────▼──────────┐
                         │  BenchmarkService    │
                         │ concurrency + resume │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │    ScenarioRunner    │
                         │    multi-turn loop   │
                         └───────┬───────┬──────┘
                                 │       │
                   ┌─────────────┘       └──────────────┐
                   ▼                                     ▼
        OpenAICompatibleAdapter                 ScriptedMockAdapter
                   │
                   ▼
          /chat/completions
                   │
          tool schemas + calls
                   │
                   ▼
          synthetic tool results
                   │
                   ▼
             next model turn
                   │
                   └──────────────┐
                                  ▼
                         deterministic scoring
                         ├─ sequence / exactness
                         ├─ argument accuracy
                         ├─ text similarity
                         ├─ latency / tokens
                         └─ capability matrix
```

The core benchmark engine does not depend on Ink. The TUI is a presentation layer over the same service and result model.

## Tool calling model

Real endpoint runs receive actual tool definitions in OpenAI-compatible format. When the model emits function calls, Toolery appends an assistant tool-call message and deterministic synthetic tool results, then continues the conversation until the model stops or the round limit is reached. This makes recovery and state-tracking scenarios genuinely multi-turn.

Tool execution remains sandboxed: Toolery does not execute arbitrary commands implied by an LLM tool call. Synthetic results are part of the benchmark fixture.

## Scoring

The scoring engine is deterministic:

- **Precision / recall / F1:** compares expected and actual tool-call sequences.
- **Argument accuracy:** fraction of expected argument keys whose values match after stable serialization.
- **Text similarity:** deterministic token Jaccard similarity; exact text is a special case.
- **Capability matrix:** aggregates planning, recovery, parameter precision, state tracking, instruction following, restraint, and calibration.
- **Success:** requires exact tool-call sequence and at least 0.80 text similarity when a final expected text is defined.

Profiles only change reporting weights. They do not change the underlying benchmark pass/fail result.

## Persistence and exports

`--output` writes a resumable JSON snapshot after every completed scenario. Re-running with the same output path skips already-completed scenario IDs. `toolery export` converts benchmark results into a flat CSV suitable for analysis.

## Dataset methodology

The 143 scenarios are a starter benchmark pack, not a claim that these cases are universally representative of all agent workloads. A future benchmark version should preserve old IDs, add independently reviewed cases, and publish a changelog when expected behavior changes.

See `BENCHMARK.md` for the benchmark contract and extension rules.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:check
```
