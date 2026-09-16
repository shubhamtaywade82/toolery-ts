import type {AdapterKind,BenchmarkConfig,Tier,ClusterTopology} from '../types.js';
const tiers:Array<Tier|'all'>=['easy','medium','hard','very-hard','all'];
const adapters:AdapterKind[]=['raw','cloud','hermes','mock','openai-compatible'];
const clusters:ClusterTopology[]=['single','dual','triple','quad','octa'];
export function parseConfig(flags:Record<string,unknown>):BenchmarkConfig{
 const tier=String(flags.tier??process.env.TOOLERY_TIER??'all') as Tier|'all';if(!tiers.includes(tier))throw new Error(`Invalid tier: ${tier}. Expected ${tiers.join(', ')}`);
 const trials=Number(flags.trials??process.env.TOOLERY_TRIALS??3);if(!Number.isInteger(trials)||trials<1||trials>100)throw new Error('Trials must be an integer between 1 and 100.');
 const adapter=String(flags.adapter??process.env.TOOLERY_ADAPTER??'openai-compatible') as AdapterKind;if(!adapters.includes(adapter))throw new Error(`Adapter must be ${adapters.join(', ')}.`);
 const concurrency=Number(flags.concurrency??process.env.TOOLERY_CONCURRENCY??1);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw new Error('Concurrency must be an integer between 1 and 32.');
 const timeoutMs=Number(flags.timeout??process.env.TOOLERY_TIMEOUT_MS??30_000);if(!Number.isFinite(timeoutMs)||timeoutMs<100)throw new Error('Timeout must be at least 100 ms.');
 const cluster=String(flags.cluster??process.env.TOOLERY_CLUSTER??'single') as ClusterTopology;if(!clusters.includes(cluster))throw new Error(`Cluster must be ${clusters.join(', ')}.`);
 return{model:String(flags.model??process.env.TOOLERY_MODEL??(adapter==='mock'?'mock':'')),adapter,tier,trials,baseUrl:String(flags.baseUrl??process.env.TOOLERY_BASE_URL??'http://localhost:11434/v1'),apiKey:process.env.TOOLERY_API_KEY,timeoutMs,concurrency,profile:String(flags.profile??process.env.TOOLERY_PROFILE??'default'),benchmarkVersion:String(process.env.TOOLERY_BENCHMARK_VERSION??'1.0.0'),output:flags.output?String(flags.output):process.env.TOOLERY_OUTPUT,resume:flags.resume?String(flags.resume):process.env.TOOLERY_RESUME,endpointPath:'/chat/completions',cluster,withPerf:Boolean(flags.withPerf??false),category:flags.category?String(flags.category):undefined};}
