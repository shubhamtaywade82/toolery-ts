import type {HealthProbe} from './types.js';

export async function probeEndpoint(baseUrl: string, timeoutMs = 5_000): Promise<HealthProbe> {
  const started = performance.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {signal:controller.signal});
    const payload = await response.json().catch(() => ({})) as any;
    return {reachable: response.ok, latencyMs: performance.now()-started, status: response.status,
      models: Array.isArray(payload?.data) ? payload.data.map((m:any)=>m.id).filter(Boolean) : [], baseUrl};
  } catch (error) {
    return {reachable:false, latencyMs:performance.now()-started, baseUrl, error:error instanceof Error ? error.message : String(error)};
  } finally { clearTimeout(timer); }
}
