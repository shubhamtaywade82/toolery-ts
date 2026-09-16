# Upstream parity

Toolery-TS is designed to remain compatible with the public `karolpalys/toolery` benchmark contract.

## Scenario source

The upstream importer is pinned to a known commit and validates the expected 143 scenario files before accepting the source pack. Run:

```bash
npm run sync:upstream
```

The imported YAML and SHA-256 manifest are kept for auditability.

## Implemented parity areas

| Area | Status |
| --- | --- |
| 143 scenario source contract | Implemented via pinned sync |
| YAML loading | Implemented |
| Deterministic checks | Implemented |
| 18 capability dimensions | Implemented |
| Raw/OpenAI-compatible adapter | Implemented |
| Cloud adapter semantics | Implemented |
| Mock adapter | Implemented |
| Cluster metadata | Implemented |
| Profiles | Implemented |
| History/resume | Implemented |
| Statistics | Implemented |
| Throughput seam | Implemented |
| Hermes/MCP runtime | External runtime integration required |

Toolery-TS deliberately does not claim Hermes execution without the Hermes runtime itself.
