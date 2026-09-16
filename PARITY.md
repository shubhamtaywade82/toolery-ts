# Toolery upstream parity

Reference upstream: `karolpalys/toolery@36c8c0c217898aade7500fa13b02fdc4d58899f7`.

| Area | Status | Notes |
|---|---|---|
| 143 scenario suite | Import-ready | Exact upstream YAML is fetched verbatim by `npm run sync:upstream`; importer refuses any count other than 143. |
| Scenario tiers | Implemented | easy / medium / hard / very-hard. |
| YAML scenario model | Implemented | System prompt, tools, budget, tags, ranking dimensions, tool-response fixtures, scoring blocks and context metadata are supported. |
| Tool schemas | Implemented | Supplied to OpenAI-compatible endpoints. Unknown upstream fixture tools receive safe generic schemas until richer registry definitions are added. |
| Multi-turn runner | Implemented | Assistant tool calls, synthetic tool results and subsequent turns are retained in trace. |
| Required/forbidden/partial checks | Implemented core DSL | Tool presence, absence, args, counts, order, parallel batches, regex args, types, response contents/regex/schema/numbers, destructive-command guards and hallucinated-tool checks. |
| 18 capability dimensions | Implemented | Raw scenario scores expose all dimensions. |
| Profiles | Implemented | Multiple use-case weighting profiles. |
| Raw adapter | Implemented | OpenAI-compatible HTTP transport without requiring a key. |
| Cloud adapter | Implemented | Same transport with required API key semantics. |
| Mock adapter | Implemented | Deterministic scripted behavior for smoke/regression runs. |
| Hermes adapter | External integration pending | Deliberately fails clearly until the Hermes CLI + MCP bridge is configured. No fake Hermes results. |
| Cluster axis | Implemented as metadata | single / dual / triple / quad / octa can be recorded and ranked. Automatic DGX topology discovery is not yet implemented. |
| Throughput | Optional integration | `llama-benchy` wrapper exists, but its CLI invocation is not validated in this environment. |
| Resume | Implemented | Version/model/tier/source guards protect against incompatible resumes. |
| History | Implemented | Local JSON history with bounded retention. |
| CSV export | Implemented | Exports scenario-level results. |
| Rankings | Implemented | Tier-weighted score and per-dimension rows. |
| Stability | Implemented | Mean, standard deviation and worst observed value helpers. |
| McNemar comparison | Implemented | Paired binary trial comparison. |
| Time decay | Implemented | 14-day half-life helper. |
| Six-tab TUI | Implemented baseline | Home / Rankings / Compare / Scenarios / History / Profiles with keyboard navigation. |
| Live refresh / rich frozen tables | Partial | Baseline dashboard exists; upstream-grade scrolling/frozen-column polish is not fully reproduced yet. |
| Empirical re-tiering | Pending | Requires a stored multi-model evaluation corpus and a deterministic re-tiering job. |
| Golden probe | Pending | Guardrail concept is not yet ported. |
| Full terminal/mock runtime registry | Partial | Benchmark runner is intentionally non-executing; richer fixture semantics can be added without granting shell access. |

The goal is functional and methodological compatibility without copying opaque implementation details or silently changing benchmark semantics.
