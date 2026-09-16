# Benchmark methodology

Each scenario is a versioned contract containing a prompt, tool schemas, behavioral checks, optional tool-result fixtures, constraints, budgets and capability dimensions.

A trial uses a fresh conversation. The adapter receives the declared tools, tool calls are recorded, deterministic fixture results are returned, and the model can continue until a final response or the scenario budget is reached.

Scoring is deterministic and can evaluate exact tool sequences, required/forbidden calls, argument constraints, ordering, counts, response assertions, schemas, numbers, hallucinated tools and destructive-command guards. Latency and token usage are recorded separately.

Profiles change reporting weights only. They never modify raw trial outcomes.

For reproducibility, record model, endpoint, adapter, benchmark version, source pack, scenario hashes, trial count, concurrency and timestamp.
