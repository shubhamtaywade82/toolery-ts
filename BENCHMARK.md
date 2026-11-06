# Toolery-TS Benchmark Contract

## Version 1.0.0

This release contains 143 deterministic scenario records split into 40 easy, 45 medium, 34 hard, and 24 very-hard cases, plus a dedicated 12-scenario capability-evaluation pack (`--source capability`, pack version 1.0.0) covering reasoning, instruction following, mathematical accuracy, coding, debugging, hallucination resistance, structured output, tool selection, multi-step tool execution, long-context retrieval and agentic planning.

### Capability pack contract

The capability pack (`cap-01` … `cap-12`) extends the core contract:

- Every scenario carries a machine-checkable `scoring` contract (`required`, `forbidden`, `partial`) — success is contract-based, never similarity-based.
- `forbidden` entries are checks that must HOLD: `tool_not_called`, `no_hallucinated_tool`, `response_not_matches_regex` (true when the bad pattern is absent).
- Deterministic financial figures (cost totals, availability products, invoice totals) are verified against computed expected values.
- Absent information must be reported as `null` (e.g. `api_version` in `cap-11`); inventing it trips a forbidden check.
- Hard failures (unauthorized destructive calls, fabricated tool calls, invalid financial calculations, invented market data) are detected by `utils/hard-failures.ts` and reported separately from the capability score. A high score must not compensate for them.
- The `capability-evaluation` profile maps the 100-point rubric onto the 18-dimension matrix as reporting multipliers.

### Contract

Each scenario defines:

- a stable ID and benchmark version
- a user prompt
- the tool definitions visible to the model
- an expected ordered tool-call sequence
- optional synthetic tool-result behavior
- an expected final response
- capability tags and constraints

The benchmark runner never executes arbitrary model-generated code. Tool results are synthetic fixtures intended to test planning, parameterization, recovery, and state propagation.

### Scoring rules

A trial passes when the ordered tool-call sequence and arguments match exactly, and the final response reaches the configured similarity threshold (0.80 in v1.0.0 when expected text exists).

Raw measurements remain available even when a trial fails. Profiles apply reporting weights only; they must never alter raw trial outcomes.

### Adding scenarios

New scenarios should:

1. Have a unique ID.
2. Declare all tools the model may use.
3. Specify the expected ordered calls, including relevant arguments.
4. Make synthetic tool-result behavior explicit for recovery cases.
5. State the capability tags being tested.
6. Avoid relying on external real-world data or non-deterministic fixtures.
7. Add a regression test when fixing a scoring or runner bug.

### Versioning

Changing expected behavior of an existing scenario requires a benchmark-version change. IDs should remain stable when possible so historical results can be compared intentionally rather than silently changing meaning.
