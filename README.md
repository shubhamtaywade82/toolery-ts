# Toolery-TS

Deterministic tool-calling benchmark for LLM endpoints, implemented in TypeScript with an Ink terminal UI.

## What it measures

Toolery-TS evaluates observable behavior rather than asking another model to judge the response. It records tool-call exactness, parameter accuracy, text similarity, latency, and capability-oriented scores.

## Requirements

- Node.js 20+
- An OpenAI-compatible `/chat/completions` endpoint for real runs

The default URL is `http://localhost:11434/v1`, which is convenient for Ollama's OpenAI-compatible API.

## Install

```bash
npm install
npm run build
npm link
```

## Usage

```bash
# Validate the installation without a model server
TOOLERY_ADAPTER=mock toolery run --tier easy --trials 2

# Run against an OpenAI-compatible endpoint
toolery run --model qwen3.5:4b --base-url http://localhost:11434/v1 --tier easy --trials 3

# List scenarios
toolery scenarios

# List profiles
toolery profiles
```

For API authentication, set `TOOLERY_API_KEY` in the environment. Secrets are not serialized into benchmark configuration.

## Architecture

```text
CLI
 └── Ink application
      └── ScenarioRunner
           ├── LlmAdapter
           │    ├── OpenAICompatibleAdapter
           │    └── MockAdapter
           └── Deterministic scoring
                ├── tool-call matching
                ├── argument accuracy
                ├── text similarity
                └── capability aggregation
```

The benchmark domain is intentionally separated from the terminal presentation layer so additional adapters, scenario packs, exporters, and persistence can be added without making the benchmark engine depend on Ink.

## Current scope

This repository contains a small, executable **starter** scenario pack. It does **not** claim to contain 143 production-quality benchmark scenarios. The 143-scenario target should be added as a versioned benchmark dataset with independently reviewable expected behavior.

The current adapter sends prompts to an OpenAI-compatible chat endpoint. Full tool-schema/function-calling scenarios are a next architectural step because the benchmark should eventually provide actual tool definitions to the model and then validate multi-turn tool results.

## Development

```bash
npm run typecheck
npm test
npm run build
```

## Roadmap

- Expand the benchmark dataset and scenario metadata.
- Add tool schemas and actual tool definitions to model requests.
- Add true multi-turn/tool-result scenarios for recovery and state tracking.
- Add resumable JSON result files and CSV/JSON export.
- Add endpoint health probing and controlled concurrency.
- Add benchmark versioning and machine-readable result schemas.
- Add additional adapters, including a native Ollama adapter when it provides benchmark-specific value.
