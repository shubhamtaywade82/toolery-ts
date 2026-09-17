import type {HealthProbe} from './types.js';

export async function probeEndpoint(baseUrl: string, apiKey?: string, timeoutMs = 5_000): Promise<HealthProbe> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cleanUrl = `${baseUrl.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) };
  try {
    const response = await fetch(cleanUrl, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as any;
    const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
    const models = raw.map((m: any) => String(m.id || m.name || '')).filter(Boolean);
    const latencyMs = Math.round(performance.now() - started);
    const error = response.ok ? undefined : `HTTP ${response.status}: ${payload?.error?.message ?? response.statusText}`;
    return { reachable: response.ok, latencyMs, status: response.status, models, baseUrl, error };
  } catch (error) {
    return { reachable: false, latencyMs: Math.round(performance.now() - started), baseUrl, models: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
