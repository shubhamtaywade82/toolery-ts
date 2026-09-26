# Design System & UI Guidelines — Toolery-TS (Terminal UI)

> Primary reader: AI developer agent. Toolery-TS is an **Ink (React) terminal application** — the design system is a TUI design system, not web CSS. All styling must stay terminal-safe.

## 1. Visual Style

Dense, professional **dashboard aesthetic** — think htop / k9s, not a web page. Bordered panels, key/value readouts, progress bars, and tabular data dominate. Text is the primary medium; color is semantic and sparse. The UI must remain fully usable in a monochrome terminal (color is always redundant to text, never the only signal).

## 2. Color Palette (semantic)

Ink components accept color props. Use these semantic roles only — never raw hex names ad hoc:

| Role | Ink color | Usage |
|---|---|---|
| `primary` / default | white (default) | Normal text, panel content |
| `info` | `blue` | Status messages, tier=medium, neutral state |
| `success` | `green` | PASS states, reachable probe, online status, tier=easy |
| `warning` | `yellow` | Partial scores, degraded states, tier=hard |
| `danger` / error | `red` | FAIL states, unreachable probe, errors, tier=very-hard |
| `muted` | `gray` | Hints, footer keymap, secondary metadata |
| `accent` | `magenta` | Active selection cursor, focused row |

Rules:
- Tier tones follow difficulty: easy→success, medium→info, hard→warning, very-hard→danger.
- Progress bars: green when ≥ 80%, yellow 50–79%, red < 50%.
- Never use color alone to convey meaning (colorblind-safe): pair with text labels (`[ONLINE]`, `PASS`, `0%`).
- Backgrounds are never set; only foreground colors (terminal-theme safe).

## 3. Typography

- Single monospace terminal font — no font switching is possible; hierarchy is made with **weight, case, and spacing**.
- **Bold** = panel titles, focused setting, table headers, active tab.
- **Uppercase** (short strings only) = status badges (`ONLINE`, `READY`, `LIVE`).
- Title case = everything else.
- Never rely on width of proportional glyphs — all alignment is column-based via `<Box width={n}>` fixed cells (see rule in §5).

## 4. Spacing & Layout

- App frame: full terminal, single outer border with app title `Toolery-TS` and live status line.
- **Grid**: 2-column main layout on Home (left: configuration/progress panels, right: live run + capability panels). Panels stack vertically in a single column when terminal is narrow.
- Panel padding: 1 space inner padding; 1 blank line between panels.
- Tab bar: single top row, 9 tabs (`Home, Scenarios, Run, Results, Rankings, Compare, Profiles, History, Settings`), active tab highlighted, `────` separator below.
- Footer: one line, muted, always visible keymap hints.
- Long values wrap inside their panel; panels never truncate silently (drop to ellipsis only for raw payloads).

## 5. Component Patterns (`@kud/ink-ui`)

Prefer these existing primitives over hand-rolled markup:

| Component | Use for |
|---|---|
| `Page`, `Tabs`, `Panel` | Page frame, tab bar, bordered sections |
| `Columns` | 2-column dashboard grid |
| `KeyValue` | Config display (Provider, Model, Base URL, Tier…) |
| `Badge`, `Pill` | Status chips (`[ONLINE]`, tier tags) |
| `ProgressBar` | Run progress (`0 / 40 (0%)`) |
| `Spinner` | In-flight states (probe, running) |
| `StatusMessage`, `Alert` | Info/error lines (info=blue, error=red) |
| `Table`, `SelectableRow` | Rankings, scenarios, history lists |
| `TextInput` | Inline settings editing (baseUrl, apiKey, model) |

Rules:
- **Fixed-width cells**: wrap tabular data in `ink` `Box` with explicit `width` so columns don't jitter between renders.
- Numbers are right-aligned; labels left-aligned; scores rendered as `XX.X%`.
- Capability scores render as `<name> ██░░░░ 45.5%` (bar + numeric, always both).
- API keys are always masked via `maskKey()` (shows only last 4 chars).
- Every interactive list uses the same select pattern: `SelectableRow` + accent cursor + `↑/↓` hints.

## 6. Interaction & Keyboard Map (authoritative)

| Key | Context | Action |
|---|---|---|
| `←` / `→` / `Tab` | global | Cycle tabs |
| `s` | global | Open Settings tab |
| `p` | global | Probe current endpoint |
| `m` | global | Cycle model (from probed model list, then `all`) |
| `r` | global | Start / trigger run |
| `?` | global | Help overlay |
| `q` / `Esc` | global | Quit (Esc from Settings returns to Home first) |
| `↑` / `↓` | Settings | Move field focus |
| `Enter` | Settings | Begin editing text field (baseUrl / apiKey / model) |
| `←` / `→` | Settings (non-editing) | Cycle value (preset, adapter, tier, trials, concurrency, timeout…) |
| `Enter` / `Esc` | Settings (editing) | Save / cancel edit |

Constraints for new keys:
- Single-letter global keys must never collide with existing ones (`s p m r q ?` taken).
- Editing mode must swallow all keys except Enter/Esc (existing `useInput` guard: `if (editing) return`).
- Any long-running action triggered by a key must show a Spinner and disable re-trigger while in flight.
- Every new interactive element must add its hint to `getHints()` footer for the current tab.

## 7. Provider Presets (Settings tab order)

The preset carousel is part of the UX contract (order matters, do not reorder silently):

1. `ollama` — Ollama Native (Local) → `http://localhost:11434`, adapter `ollama`
2. `ollama-v1` — Ollama OpenAI /v1 → `http://localhost:11434/v1`, adapter `openai-compatible`
3. `lmstudio` — LMStudio → `http://localhost:1234/v1`
4. `vllm` — vLLM → `http://localhost:8000/v1`
5. `openrouter` — OpenRouter → `https://openrouter.ai/api/v1`
6. `openai` — OpenAI Official → `https://api.openai.com/v1`
7. `groq` — Groq Cloud → `https://api.groq.com/openai/v1`
8. `mock` — Mock Adapter (Testing)
9. `custom` — Custom Endpoint (empty baseUrl)

Settings field order (Settings tab): preset, baseUrl, apiKey, model, adapter, tier, trials, concurrency, timeoutMs, (numCtx once branch `fix/ollama-adapter-context-window` merges), withPerf.

## 8. Non-TTY / Headless Behavior (target state)

The Ink TUI requires a TTY (`useInput` raw mode). In non-interactive contexts (CI, Docker, pipes) the TUI must NOT be launched — currently it crashes with "Raw mode is not supported". Target behavior (see tasks.md P0-4): `run` detects non-TTY stdin and falls back to plain stdout progress (`[12/143] scenario-id PASS 1.00`) + summary + exit code, or offers an explicit `--no-tui` flag. Print-style output follows the same palette roles via plain ANSI codes when supported and degrades to uncolored text when not a TTY.

## 9. Do / Don't Cheat Sheet

- ✅ Fixed-width `Box` cells for tables — ❌ padding-with-spaces hacks that break on resize
- ✅ Spinner + disable while probing/running — ❌ blocking the whole UI thread
- ✅ Masked API keys everywhere — ❌ raw key rendering in any panel or log line
- ✅ Both bar and numeric score — ❌ bar-only or percent-only
- ✅ Muted footer hints per tab — ❌ a single global keymap dump
