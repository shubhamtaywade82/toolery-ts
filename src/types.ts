export type Tier='easy'|'medium'|'hard'|'very-hard';
export type AdapterKind='raw'|'cloud'|'hermes'|'mock'|'openai-compatible';
export type ScenarioSource='synthetic'|'upstream';
export interface JsonSchema{type:'object';properties?:Record<string,unknown>;required?:string[];additionalProperties?:boolean;[key:string]:unknown}
export interface ToolDefinition{name:string;description:string;parameters:JsonSchema}
export interface ToolCall{id?:string;name:string;arguments:Record<string,unknown>;result?:unknown;resultKind?:'text'|'json'|'error';index?:number;batch?:number;latencyMs?:number}
export interface ExpectedToolCall extends ToolCall{required?:boolean;toolResult?:unknown;errorResult?:string}
export interface ToolResponseRule{match?:unknown;returns?:unknown;error?:string;callIndex?:number|string;ifToolCalled?:string;ifToolNotCalled?:string}
export interface ScenarioCheck{check:string;[key:string]:unknown}
export interface ScenarioScoring{required?:ScenarioCheck[];forbidden?:ScenarioCheck[];partial?:ScenarioCheck[];weights?:Record<string,number>}
export interface Scenario{id:string;version:string;tier:Tier;category:string;title?:string;domain?:'generic'|'quant'|'dev_ops';description:string;prompt:string;systemPrompt?:string;tools:ToolDefinition[];expectedToolCalls:ExpectedToolCall[];expectedText?:string;difficulty:number;capabilities:CapabilityName[];constraints?:string[];tags?:string[];budget?:{maxToolCalls:number;maxTurns:number;timeoutSeconds:number};toolResponses?:Record<string,ToolResponseRule[]>;scoring?:ScenarioScoring;contextPrefillTokens?:number;contextPrefillTemplate?:string;rankingDimensions?:Dimension[]}
export interface ChatMessage{role:'system'|'user'|'assistant'|'tool';content?:string|null;toolCallId?:string;toolCalls?:ToolCall[];name?:string}
export interface AdapterRequest{model:string;messages:ChatMessage[];tools:ToolDefinition[];toolChoice?:'auto'|'none'|'required';temperature?:number;reasoningEffort?:'low'|'medium'|'high';chatTemplateKwargs?:Record<string,unknown>}
export interface AdapterResponse{text:string;toolCalls:ToolCall[];durationMs:number;inputTokens?:number;outputTokens?:number;finishReason?:string;raw?:unknown}
export interface LlmAdapter{readonly kind:AdapterKind;complete(request:AdapterRequest):Promise<AdapterResponse>}
export interface ToolCallScore{precision:number;recall:number;f1:number;exactMatch:boolean;missing:ExpectedToolCall[];extra:ToolCall[];argumentAccuracy:number}
export interface TextScore{exactMatch:boolean;similarity:number}
export interface CapabilityScores{coding:number;debugging:number;agenticPlanning:number;safety:number;adversarialRobustness:number;restraint:number;errorRecovery:number;parameterPrecision:number;stateTracking:number;structuredOutput:number;toolSelection:number;instructionFollowing:number;longContext:number;localization:number;budgetDiscipline:number;terminalHandling:number;calibration:number;correctness:number}
export type CapabilityName=keyof CapabilityScores; export type Dimension=CapabilityName;
export interface TrialResult{trial:number;success:boolean;toolCalls:ToolCall[];text:string;toolCallScore:ToolCallScore;textScore:TextScore;scores:CapabilityScores;durationMs:number;inputTokens?:number;outputTokens?:number;error?:string;trace:ChatMessage[];checks?:ScenarioCheck[]}
export interface RunResult{scenarioId:string;tier:Tier;description:string;category?:string;successRate:number;averageDurationMs:number;capabilityScores:CapabilityScores;trials:TrialResult[];startedAt?:string;adapter?:AdapterKind;cluster?:ClusterTopology;}
export interface BenchmarkSummary{benchmarkVersion:string;scenarios:number;trials:number;passedTrials:number;successRate:number;averageDurationMs:number;capabilityScores:CapabilityScores;profile:string;adapter?:AdapterKind;cluster?:ClusterTopology;source?:ScenarioSource}
export type ClusterTopology='single'|'dual'|'triple'|'quad'|'octa';
export interface BenchmarkConfig{model:string;adapter:AdapterKind;tier:Tier|'all';trials:number;baseUrl:string;apiKey?:string;timeoutMs:number;profile:string;concurrency:number;benchmarkVersion:string;output?:string;resume?:string;endpointPath:string;cluster?:ClusterTopology;withPerf?:boolean;category?:string;source:ScenarioSource;}
export interface Profile{id:string;description:string;weights:Partial<Record<CapabilityName,number>>}
export interface HealthProbe{reachable:boolean;latencyMs:number;status?:number;models?:string[];baseUrl:string;error?:string}
export interface PerfResult{model:string;promptTokens?:number;generationTokens?:number;promptTokensPerSecond?:number;generationTokensPerSecond?:number;contextDepth?:number;durationMs:number}
