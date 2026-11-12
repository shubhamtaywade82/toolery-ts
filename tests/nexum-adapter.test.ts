import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import test from 'node:test';
import {NEXUM_MAX_OUTPUT_TOKENS,NEXUM_ROUTING_VERSION,NexumHarnessError,NexumInferenceAdapter,harnessStatusFor} from '../src/runners/nexum-adapter.js';
import {deriveRunId,ScenarioRunner,TASK_CLASS_FOR_TIER} from '../src/runners/runner.js';
import type {AdapterRequest,BenchmarkConfig} from '../src/types.js';

interface Reply {status:number;body:string}
async function withServer(reply:(body:Record<string,unknown>,req:IncomingMessage)=>Reply,fn:(url:string,seen:Array<{body:Record<string,unknown>;auth?:string}>)=>Promise<void>):Promise<void>{
  const seen:Array<{body:Record<string,unknown>;auth?:string}>=[];
  const server:Server=createServer((req:IncomingMessage,res:ServerResponse)=>{
    let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
      const body=JSON.parse(raw) as Record<string,unknown>;seen.push({body,auth:req.headers.authorization});
      const r=reply(body,req);res.writeHead(r.status,{'content-type':'application/json'});res.end(r.body);
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const address=server.address();const port=typeof address==='object'&&address?address.port:0;
  try{await fn(`http://127.0.0.1:${port}`,seen);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

const REQUEST:AdapterRequest={
  model:'ignored-by-nexum',
  messages:[{role:'system',content:'sys'},{role:'user',content:'do it'},{role:'assistant',content:'',toolCalls:[{id:'c1',name:'read',arguments:{path:'a'}}]},{role:'tool',toolCallId:'c1',name:'read',content:'data'}],
  tools:[{name:'read',description:'read a file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}}],
  temperature:0,
  intent:{taskId:'s1:1',idempotencyKey:'run0000000000000:s1:1:0',taskClass:'complex'},
};

test('sends the intent, the output cap and the wire shape, and does not send a model name',async()=>{
  await withServer(()=>({status:200,body:JSON.stringify({status:'OK',message:{content:'ok'},model:'gpt-oss:120b-cloud',usage:{promptTokens:1,completionTokens:1,cachedPromptTokens:0},cost:{microUsd:2,basis:'EXACT'}})}),async(url,seen)=>{
    await new NexumInferenceAdapter({baseUrl:url,apiKey:'tok',timeoutMs:5000}).complete(REQUEST);
    const body=seen[0]!.body;
    assert.equal(body.taskId,'s1:1');
    assert.equal(body.idempotencyKey,'run0000000000000:s1:1:0');
    assert.equal(body.taskClass,'complex');
    assert.equal(body.maxOutputTokens,NEXUM_MAX_OUTPUT_TOKENS);
    assert.equal('model' in body,false);
    assert.equal(seen[0]!.auth,'Bearer tok');
    const wire=body.messages as Array<Record<string,unknown>>;
    assert.deepEqual(wire[2],{role:'assistant',content:'',tool_calls:[{id:'c1',type:'function',function:{name:'read',arguments:{path:'a'}}}]});
    assert.deepEqual(wire[3],{role:'tool',content:'data',tool_call_id:'c1',name:'read'});
  });
});

test('maps a successful answer: tool calls, usage and an exact cost; missing usage stays undefined, never zero',async()=>{
  await withServer(()=>({status:200,body:JSON.stringify({status:'OK',model:'gpt-oss:120b-cloud',message:{content:'',tool_calls:[{id:'t1',function:{name:'read',arguments:'{"path":"a"}'}}]},usage:{promptTokens:500,cachedPromptTokens:500,completionTokens:100},cost:{microUsd:142,basis:'EXACT'}})}),async(url)=>{
    const out=await new NexumInferenceAdapter({baseUrl:url,timeoutMs:5000}).complete(REQUEST);
    assert.deepEqual(out.toolCalls,[{id:'t1',name:'read',arguments:{path:'a'}}]);
    assert.equal(out.inputTokens,500);assert.equal(out.cachedInputTokens,500);assert.equal(out.outputTokens,100);
    assert.equal(out.costUsd,0.000142);assert.equal(out.costSource,'PROVIDER');assert.equal(out.routedModel,'gpt-oss:120b-cloud');
  });
  await withServer(()=>({status:200,body:JSON.stringify({status:'OK',message:{content:'hi'},usage:{promptTokens:null,cachedPromptTokens:null,completionTokens:null},cost:null})}),async(url)=>{
    const out=await new NexumInferenceAdapter({baseUrl:url,timeoutMs:5000}).complete(REQUEST);
    assert.equal(out.inputTokens,undefined);assert.equal(out.outputTokens,undefined);assert.equal(out.cachedInputTokens,undefined);
    assert.equal(out.costUsd,undefined);assert.equal(out.costSource,'NONE');
  });
});

test('classifies refusals and unknown outcomes into harness statuses',async()=>{
  const cases:Array<[number,string,string]>=[
    [409,'ALREADY_COMPLETED','DUPLICATE_KEY'],
    [409,'IN_FLIGHT','DUPLICATE_KEY'],
    [422,'IDEMPOTENCY_PAYLOAD_MISMATCH','DUPLICATE_KEY'],
    [402,'BUDGET_EXCEEDED','BUDGET_EXCEEDED'],
    [504,'PROVIDER_TIMEOUT_UNKNOWN','PROVIDER_TIMEOUT_UNKNOWN'],
    [503,'CLOUD_NOT_CONFIGURED','PROVIDER_ERROR'],
  ];
  for(const [status,name,expected] of cases){
    await withServer(()=>({status,body:JSON.stringify({status:name,message:'refused'})}),async(url)=>{
      await assert.rejects(new NexumInferenceAdapter({baseUrl:url,timeoutMs:5000}).complete(REQUEST),(err:unknown)=>err instanceof NexumHarnessError&&err.harnessStatus===expected);
    });
  }
  assert.equal(harnessStatusFor(500,undefined),'PROVIDER_ERROR');
});

test('a non-JSON gateway page is classified by its HTTP status',async()=>{
  await withServer(()=>({status:504,body:'<html>gateway timeout</html>'}),async(url)=>{
    await assert.rejects(new NexumInferenceAdapter({baseUrl:url,timeoutMs:5000}).complete(REQUEST),(err:unknown)=>err instanceof NexumHarnessError&&err.harnessStatus==='PROVIDER_ERROR');
  });
});

test('refuses to run without an intent: a turn with no idempotency key is never sent',async()=>{
  await withServer(()=>({status:200,body:'{}'}),async(url,seen)=>{
    await assert.rejects(new NexumInferenceAdapter({baseUrl:url,timeoutMs:5000}).complete({...REQUEST,intent:undefined}),/intent/);
    assert.equal(seen.length,0);
  });
});

const CONFIG:BenchmarkConfig={model:'',adapter:'nexum',tier:'all',trials:2,baseUrl:'http://127.0.0.1:1',timeoutMs:1000,profile:'default',concurrency:1,benchmarkVersion:'1.0.0',endpointPath:'/v1/inference',source:'synthetic',routingVersion:NEXUM_ROUTING_VERSION};

test('the run identity is stable for one configuration and changes with what makes trials incomparable',()=>{
  assert.equal(deriveRunId(CONFIG),deriveRunId({...CONFIG,trials:9,concurrency:2,output:'x.json'}));
  assert.notEqual(deriveRunId(CONFIG),deriveRunId({...CONFIG,profile:'other'}));
  assert.notEqual(deriveRunId(CONFIG),deriveRunId({...CONFIG,tier:'easy'}));
});

test('each turn of each trial has its own key, and the keys repeat exactly when the run is resumed',async()=>{
  const seenKeys:string[]=[];
  await withServer((body)=>{seenKeys.push(String(body.idempotencyKey));return{status:200,body:JSON.stringify({status:'OK',message:{content:'done',tool_calls:[]}})};},async(url)=>{
    const config={...CONFIG,baseUrl:url};
    const {loadScenarios}=await import('../src/scenarios.js');
    const scenario=loadScenarios('easy').find(s=>s.category==='none')!;
    await new ScenarioRunner(config).runScenario(scenario);
    const first=[...seenKeys];seenKeys.length=0;
    await new ScenarioRunner(config).runScenario(scenario);
    assert.deepEqual(seenKeys,first);
    assert.equal(new Set(first).size,first.length);
    assert.ok(first.every(k=>k.startsWith(deriveRunId(config)+':'+scenario.id+':')));
  });
});

test('the task class follows the scenario tier',()=>{
  assert.deepEqual(TASK_CLASS_FOR_TIER,{easy:'routine',medium:'complex',hard:'debugging','very-hard':'architecture'});
});
