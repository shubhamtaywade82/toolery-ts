# Benchmark methodology

Toolery-TS uses explicit scenario contracts. A scenario defines the prompt, available tool schemas, expected calls or behavioral checks, tool-result fixtures, constraints, budgets, and capability dimensions.

## Execution

Each trial starts from a clean conversation. The adapter receives the scenario tools and prompt. Tool calls are recorded, synthetic fixtures are returned, and the model is allowed to continue until a final response or the scenario turn budget is reached.

## Scoring

Scoring is deterministic. It can evaluate:

- exact tool sequence
- required and forbidden tools
- argument containment and regular expressions
- call counts and ordering
- response substring/regex/schema/number assertions
- hallucinated tools
- destructive-command guards
- latency and token metrics

Profiles only change reporting weights. They never modify the raw trial result.

## Reproducibility

Record the model identifier, endpoint, adapter, benchmark version, scenario source, scenario hashes, trial count, concurrency and timestamp with every run. Do not compare results from different scenario packs without recording the pack version.

## Statistical comparison

Use repeated trials rather than a single pass for stochastic models. Toolery-TS exposes paired comparison primitives and stability metrics; these should be interpreted together with sample size and benchmark coverage rather than treated as universal model quality scores.
