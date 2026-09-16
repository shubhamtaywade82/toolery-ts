# Upstream parity

Toolery-TS tracks the public `karolpalys/toolery` scenario and scoring contract.

```bash
npm run sync:upstream
```

The importer is pinned to a known upstream commit and validates the expected 143 scenario files before accepting the pack. Original YAML and SHA-256 hashes are retained for auditability.

| Capability | Status |
| --- | --- |
| Upstream scenario contract | Implemented via pinned sync |
| YAML loader | Implemented |
| Deterministic checks | Implemented |
| 18 dimensions | Implemented |
| OpenAI-compatible/raw execution | Implemented |
| Cloud adapter semantics | Implemented |
| Mock adapter | Implemented |
| Cluster metadata | Implemented |
| Profiles/history/resume | Implemented |
| Statistics | Implemented |
| Throughput seam | Implemented |
| Hermes/MCP runtime | Requires external Hermes runtime |
