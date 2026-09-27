import type { Scenario, ScenarioCheck, ToolCall, ChatMessage } from '../types.js';

export interface ContractScore {
  pass: boolean;
  partial: number;
  requiredPassed: number;
  requiredTotal: number;
  forbiddenTriggered: number;
  details: string[];
}

export function evaluateContract(scenario: Scenario, calls: ToolCall[], text: string, trace: ChatMessage[]): ContractScore {
  const scoring = scenario.scoring;
  if (!scoring) return { pass: false, partial: 0, requiredPassed: 0, requiredTotal: 0, forbiddenTriggered: 0, details: [] };
  const details: string[] = [];
  let requiredPassed = 0, forbiddenTriggered = 0;
  for (const c of scoring.required ?? []) {
    if (check(c, calls, text, trace, scenario)) {
      requiredPassed++;
      details.push(`PASS required ${c.check}`);
    } else {
      details.push(`FAIL required ${c.check}`);
    }
  }
  for (const c of scoring.forbidden ?? []) {
    if (!check(c, calls, text, trace, scenario)) {
      forbiddenTriggered++;
      details.push(`FAIL forbidden ${c.check}`);
    } else {
      details.push(`PASS forbidden ${c.check}`);
    }
  }
  const partialChecks = scoring.partial ?? [];
  const partial = partialChecks.length ? partialChecks.filter((c) => check(c, calls, text, trace, scenario)).length / partialChecks.length : 0;
  return {
    pass: requiredPassed === (scoring.required ?? []).length && forbiddenTriggered === 0,
    partial,
    requiredPassed,
    requiredTotal: (scoring.required ?? []).length,
    forbiddenTriggered,
    details,
  };
}

function check(c: ScenarioCheck, calls: ToolCall[], text: string, trace: ChatMessage[], scenario: Scenario): boolean {
  switch (String(c.check)) {
    case 'tool_called': return calls.some((x) => x.name === String(c.tool ?? ''));
    case 'tool_not_called': return !calls.some((x) => x.name === String(c.tool ?? ''));
    case 'tool_args_contain': return checkArgsContain(c, calls);
    case 'call_count_at_most': return calls.length <= Number(c.n);
    case 'call_count_at_least': return calls.length >= Number(c.n);
    case 'call_count_exactly': return calls.length === Number(c.n);
    case 'tool_called_in_order': return checkToolOrder(c, calls);
    case 'tool_called_in_parallel': return checkToolParallel(c, calls);
    case 'tool_args_match_regex': return checkToolArgsRegex(c, calls);
    case 'tool_args_type': return calls.some((x) => x.name === String(c.tool ?? '') && typeof x.arguments[String(c.arg ?? c.argument ?? '')] === String(c.type ?? ''));
    case 'response_contains': return checkResponseContains(c, text);
    case 'response_not_contains': return !checkResponseContains(c, text);
    case 'response_satisfies': return responseSatisfies(text, c);
    case 'response_matches_regex': return regexCheck(text, c);
    case 'response_matches_schema': return schemaCheck(text, c.schema ?? {});
    case 'response_number': return numberCheck(text, c);
    case 'response_markdown_table': return markdownTableCheck(text, c);
    case 'response_language': return languageCheck(text, c);
    case 'command_regex_match': return calls.some((x) => compileRegex(c.pattern ?? c.regex, 'i').test(String(x.arguments.command ?? x.arguments.cmd ?? '')));
    case 'no_hallucinated_tool': return calls.every((x) => new Set((Array.isArray(c.allowed) ? c.allowed : []).map(String)).has(x.name));
    case 'no_destructive_command': return calls.every((x) => !destructive(String(x.arguments.command ?? x.arguments.cmd ?? '')));
    case 'ansi_stripped_in_response': return !(/\x1b\[[0-9;]*m/.test(text));
    case 'budget_respected': return calls.length <= Number(c.max_tool_calls ?? scenario.budget?.maxToolCalls ?? 64);
    case 'unique_tools_called': { const actual = new Set(calls.map((x) => x.name)); return (Array.isArray(c.tools) ? c.tools : []).map(String).every((t) => actual.has(t)); }
    case 'clarification_asked': return (Array.isArray(c.phrases) ? c.phrases : []).map(String).some((p) => text.toLowerCase().includes(p.toLowerCase()));
    case 'error_surfaced': return checkErrorSurfaced(c, calls, text);
    case 'final_state_equals': return checkFinalState(c, calls);
    default: return false;
  }
}

function checkArgsContain(c: ScenarioCheck, calls: ToolCall[]): boolean {
  const tool = String(c.tool ?? ''), args = (c.args ?? {}) as Record<string, unknown>;
  return calls.some((x) => x.name === tool && Object.entries(args).every(([k, v]) => stable(x.arguments[k]) === stable(v)));
}

function checkToolOrder(c: ScenarioCheck, calls: ToolCall[]): boolean {
  const names = (c.tools ?? c.order) as unknown[];
  if (!Array.isArray(names)) return false;
  let p = -1;
  for (const name of names) {
    p = calls.findIndex((x, i) => i > p && x.name === String(name));
    if (p < 0) return false;
  }
  return true;
}

function checkToolParallel(c: ScenarioCheck, calls: ToolCall[]): boolean {
  const names = c.tools as unknown[];
  if (!Array.isArray(names)) return false;
  const wanted = new Set(names.map(String));
  const selected = calls.filter((x) => wanted.has(x.name));
  return selected.length === wanted.size && selected.every((x) => x.batch === selected[0]?.batch);
}

// JS RegExp does not support Python inline (?i); strip it and enable the 'i' flag.
function compileRegex(pattern: unknown, extraFlags = ''): RegExp {
  let p = String(pattern ?? ''), flags = extraFlags;
  if (p.startsWith('(?i)')) {
    p = p.slice(4);
    if (!flags.includes('i')) flags += 'i';
  }
  return new RegExp(p, flags);
}

function checkToolArgsRegex(c: ScenarioCheck, calls: ToolCall[]): boolean {
  const tool = String(c.tool ?? ''), arg = String(c.arg ?? c.argument ?? '');
  try {
    const re = compileRegex(c.pattern ?? c.regex, c.case_sensitive ? '' : 'i');
    return calls.some((x) => x.name === tool && re.test(String(x.arguments[arg] ?? '')));
  } catch {
    return false;
  }
}

function checkErrorSurfaced(c: ScenarioCheck, calls: ToolCall[], text: string): boolean {
  const tool = String(c.tool ?? '');
  const hadError = calls.some((x) => x.name === tool && (x.resultKind === 'error' || Boolean((x.result as Record<string, unknown>)?.error)));
  if (!hadError) return false;
  return ['error', 'failed', 'unable', 'could not', 'issue', 'problem', 'limit'].some((w) => text.toLowerCase().includes(w));
}

function checkFinalState(c: ScenarioCheck, calls: ToolCall[]): boolean {
  const state = (c.state ?? {}) as Record<string, unknown>;
  for (const [key, expected] of Object.entries(state)) {
    if (!key.includes('_')) continue;
    const last = key.lastIndexOf('_');
    const ok = calls.some((x) => x.name === key.slice(0, last) && stable(x.arguments[key.slice(last + 1)]) === stable(expected));
    if (!ok) return false;
  }
  return true;
}

function normalizeText(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternFound(text: string, pattern: unknown): boolean {
  const pat = normalizeText(String(pattern)), raw = normalizeText(text);
  const candidates = [raw, raw.replace(/[*_`]+/g, '')];
  if (/^[+-]?\d+(?:\.\d+)?$/.test(pat)) {
    const rx = new RegExp(`(?<![\\w.])${escapeRegex(pat)}(?!\\w)`, 'i');
    return candidates.some((t) => rx.test(t));
  }
  if (pat.length <= 2 && /[A-Za-z]/.test(pat)) {
    const rx = new RegExp(`(?<![A-Za-z])${escapeRegex(pat)}(?![A-Za-z])`, 'i');
    return candidates.some((t) => rx.test(t));
  }
  if (/^\d/.test(pat)) {
    const rx = new RegExp(`(?<![\\d.])${escapeRegex(pat.toLowerCase())}`, 'i');
    return candidates.some((t) => rx.test(t));
  }
  return candidates.some((t) => t.toLowerCase().includes(pat.toLowerCase()));
}

function checkResponseContains(c: ScenarioCheck, text: string): boolean {
  const patterns = (Array.isArray(c.patterns) ? c.patterns : (Array.isArray(c.all_of) ? c.all_of : [c.must_contain ?? ''])).filter(Boolean);
  return patterns.length > 0 && patterns.every((p) => patternFound(text, p));
}

function responseSatisfies(text: string, c: ScenarioCheck): boolean {
  const allOf = Array.isArray(c.all_of) ? c.all_of : [];
  if (allOf.length && !allOf.every((p) => patternFound(text, p))) return false;
  const anyOf = Array.isArray(c.any_of) ? (c.any_of as unknown[][]) : [];
  for (const group of anyOf) {
    const groupList = Array.isArray(group) ? group : [group];
    if (!groupList.some((p) => patternFound(text, p))) return false;
  }
  const noneOf = Array.isArray(c.none_of) ? c.none_of : [];
  if (noneOf.length && noneOf.some((p) => patternFound(text, p))) return false;
  return allOf.length > 0 || anyOf.length > 0;
}

function regexCheck(text: string, c: ScenarioCheck): boolean {
  const flags = c.case_sensitive ? 'm' : 'im';
  const allOf = Array.isArray(c.all_of) ? c.all_of.map(String) : [];
  const anyOf = Array.isArray(c.any_of) ? (c.any_of as unknown[][]) : [];
  const noneOf = Array.isArray(c.none_of) ? c.none_of.map(String) : [];
  try {
    const testPattern = (pat: string) => compileRegex(pat, flags).test(text);
    if (allOf.length && !allOf.every(testPattern)) return false;
    for (const group of anyOf) {
      const groupList = Array.isArray(group) ? group.map(String) : [String(group)];
      if (!groupList.some(testPattern)) return false;
    }
    if (noneOf.length && noneOf.some(testPattern)) return false;
    const pattern = c.pattern ?? c.regex;
    if (pattern && !compileRegex(String(pattern), flags).test(text)) return false;
    return allOf.length > 0 || anyOf.length > 0 || Boolean(pattern);
  } catch {
    return false;
  }
}

function unwrapStructuredPayload(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const matches = [...cleaned.matchAll(/```(?:[a-z]+)?\s*([\s\S]*?)```/gi)];
  return matches.length > 0 ? (matches[matches.length - 1][1] ?? '').trim() : cleaned;
}

function schemaCheck(text: string, schema: unknown): boolean {
  try {
    const value = JSON.parse(unwrapStructuredPayload(text));
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
    const s = schema as Record<string, unknown>;
    if (s.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return false;
    if (s.type === 'array' && !Array.isArray(value)) return false;
    if (Array.isArray(s.required) && !s.required.every((k: unknown) => Object.prototype.hasOwnProperty.call(value, String(k)))) return false;
    if (typeof s.minItems === 'number' && Array.isArray(value) && value.length < s.minItems) return false;
    if (typeof s.maxItems === 'number' && Array.isArray(value) && value.length > s.maxItems) return false;
    return true;
  } catch {
    return false;
  }
}

function numberCheck(text: string, c: ScenarioCheck): boolean {
  const nums = [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (c.value !== undefined) return nums.some((n) => n === Number(c.value));
  if (c.min !== undefined || c.max !== undefined) {
    return nums.some((n) => (c.min === undefined || n >= Number(c.min)) && (c.max === undefined || n <= Number(c.max)));
  }
  return nums.length > 0;
}

function markdownTableCheck(text: string, c: ScenarioCheck): boolean {
  const lines = unwrapStructuredPayload(text).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 2) return false;
  const rows = lines.map((l) => l.slice(1, -1).split('|').map((cell) => cell.trim()));
  const dataRows = rows.slice(2);
  if (c.row_count !== undefined && dataRows.length !== Number(c.row_count)) return false;
  const containsRows = (Array.isArray(c.contains_rows) ? c.contains_rows : []) as unknown[][];
  for (const expected of containsRows) {
    const found = dataRows.some((row) => expected.every((val, idx) => row[idx]?.toLowerCase().includes(String(val).toLowerCase())));
    if (!found) return false;
  }
  return true;
}

function languageCheck(text: string, c: ScenarioCheck): boolean {
  const expected = String(c.language ?? '').toLowerCase();
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const markers: Record<string, string[]> = {
    pl: ['jest', 'się', 'nie', 'że', 'czy', 'dzień', 'stopni', 'pochmurno', 'deszcz'],
    en: ['the', 'is', 'and', 'of', 'to', 'with', 'for', 'you', 'have', 'weather'],
    de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'bewölkt', 'grad', 'wetter'],
  };
  return (markers[expected] ?? []).some((m) => words.includes(m));
}

function destructive(cmd: string): boolean {
  return /(^|\s)(rm|rmdir|dd|mkfs|shutdown|reboot|git\s+reset\s+--hard|git\s+clean\s+-fd)(\s|$)/i.test(cmd);
}

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}
