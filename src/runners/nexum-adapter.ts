import type {
  AdapterKind,
  AdapterRequest,
  AdapterResponse,
  ChatMessage,
  CostSource,
  HarnessStatus,
  JsonSchema,
  LlmAdapter,
  RequestIntent,
  ToolCall,
  ToolDefinition,
} from '../types.js';

/**
 * The routing contract this adapter speaks to the Nexum host's POST /v1/inference. Recorded in every snapshot, and a
 * resume refuses a snapshot taken under a different version: its trials were routed by different rules.
 */
export const NEXUM_ROUTING_VERSION = 'nexum-inference/v1';

/** The output cap every trial asks for. It sizes the cloud reservation, and it is the same across models. */
export const NEXUM_MAX_OUTPUT_TOKENS = 1024;

/** A non-OK answer from the Nexum host, classified for the harness. Excluded from the pass rate (T-3). */
export class NexumHarnessError extends Error {
  constructor(
    message: string,
    readonly harnessStatus: HarnessStatus,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'NexumHarnessError';
  }
}

/** Maps the host's HTTP status and status name onto a harness status. Anything unrecognised is PROVIDER_ERROR. */
export function harnessStatusFor(httpStatus: number, status: string | undefined): HarnessStatus {
  if (status === 'BUDGET_EXCEEDED') return 'BUDGET_EXCEEDED';
  if (status === 'PROVIDER_TIMEOUT_UNKNOWN') return 'PROVIDER_TIMEOUT_UNKNOWN';
  if (httpStatus === 409 || status === 'IN_FLIGHT' || status === 'ALREADY_COMPLETED' || status === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
    return 'DUPLICATE_KEY';
  }
  return 'PROVIDER_ERROR';
}

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}

interface InferencePayload {
  status?: string;
  /** A reply object on success; a human-readable string on refusal. */
  message?: string | { content?: string | null; tool_calls?: WireToolCall[] };
  model?: string;
  usage?: { promptTokens?: number | null; cachedPromptTokens?: number | null; completionTokens?: number | null };
  cost?: { microUsd: number; basis: string } | null;
  reason?: string;
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', content: message.content ?? '', tool_call_id: message.toolCallId ?? '', name: message.name ?? '' };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id ?? `call_${call.name}`,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content ?? '' };
}

function toWireTool(tool: ToolDefinition): Record<string, unknown> {
  const schema: JsonSchema = tool.parameters;
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { ...schema, type: 'object', properties: schema.properties ?? {} },
    },
  };
}

/**
 * One trial turn through the Nexum host. The host picks the model from the task class, so the request's model is not
 * sent. The idempotency key is the caller's: a repeat of the same turn is refused by the host, never run again.
 */
export class NexumInferenceAdapter implements LlmAdapter {
  readonly kind: AdapterKind = 'nexum';

  constructor(private readonly options: { baseUrl: string; apiKey?: string; timeoutMs: number }) {}

  async complete(request: AdapterRequest): Promise<AdapterResponse> {
    const intent: RequestIntent | undefined = request.intent;
    if (!intent) throw new Error('Nexum adapter needs a request intent: task id, idempotency key and task class.');

    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const body = {
      taskId: intent.taskId,
      idempotencyKey: intent.idempotencyKey,
      taskClass: intent.taskClass,
      maxOutputTokens: NEXUM_MAX_OUTPUT_TOKENS,
      messages: request.messages.map(toWireMessage),
      tools: request.tools.map(toWireTool),
      options: { temperature: request.temperature ?? 0, seed: 0 },
    };
    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/v1/inference`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let payload: InferencePayload = {};
      if (text) {
        try {
          payload = JSON.parse(text) as InferencePayload;
        } catch {
          // A non-JSON body (a gateway page) carries no status; it is classified by HTTP status below.
        }
      }
      if (!response.ok || payload.status !== 'OK') {
        const detail = typeof payload.message === 'string' ? payload.message : (payload.reason ?? text.slice(0, 200));
        throw new NexumHarnessError(
          `Nexum host returned ${response.status}${payload.status ? ` ${payload.status}` : ''}: ${detail || '(no body)'}`,
          harnessStatusFor(response.status, payload.status),
          response.status,
        );
      }
      const message = typeof payload.message === 'object' && payload.message !== null ? payload.message : {};
      const toolCalls: ToolCall[] = (message.tool_calls ?? [])
        .map((call) => ({ id: call.id, name: call.function?.name ?? '', arguments: parseArguments(call.function?.arguments) }))
        .filter((call) => call.name);
      // A missing count stays undefined. It is not reported as zero, which would claim the call was free.
      const usage = payload.usage ?? {};
      const cost = payload.cost;
      const costSource: CostSource = cost ? 'PROVIDER' : 'NONE';
      return {
        text: typeof message.content === 'string' ? message.content : '',
        toolCalls,
        durationMs: performance.now() - started,
        inputTokens: usage.promptTokens ?? undefined,
        cachedInputTokens: usage.cachedPromptTokens ?? undefined,
        outputTokens: usage.completionTokens ?? undefined,
        costUsd: cost ? cost.microUsd / 1_000_000 : undefined,
        costSource,
        routedModel: payload.model,
        finishReason: toolCalls.length ? 'tool_calls' : 'stop',
        raw: payload,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
