import type {AdapterRequest,AdapterResponse,AdapterKind,LlmAdapter,ToolCall} from '../types.js';
import {OllamaClient} from '@nemesis-oss/ollama-sdk';
export interface AdapterOptions{baseUrl:string;apiKey?:string;timeoutMs:number;}
function safeJsonObject(value:unknown):Record<string,unknown>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value!=='string')return{};try{const parsed:unknown=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return{};}}
function formatOpenAIMessages(messages: any[]) {
  return messages.map(m => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId || '', name: m.name, content: m.content ?? '' };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant', content: m.content ?? '',
        tool_calls: m.toolCalls.map((c: any) => ({ id: c.id || `call_${c.name}`, type: 'function', function: { name: c.name, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {}) } }))
      };
    }
    return { role: m.role, content: m.content ?? '' };
  });
}
export class OpenAICompatibleAdapter implements LlmAdapter{
  readonly kind:AdapterKind='openai-compatible';
  constructor(protected readonly options:AdapterOptions){}
  async complete(request:AdapterRequest):Promise<AdapterResponse>{
    const started=performance.now(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),this.options.timeoutMs);
    try{
      const response=await fetch(`${this.options.baseUrl.replace(/\/$/,'')}/chat/completions`,{
        method:'POST',signal:controller.signal,
        headers:{'content-type':'application/json',...(this.options.apiKey?{authorization:`Bearer ${this.options.apiKey}`}:{})},
        body:JSON.stringify({
          model:request.model,
          messages:formatOpenAIMessages(request.messages),
          tools:request.tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}})),
          tool_choice:request.toolChoice??'auto',
          temperature:request.temperature??0
        })
      });
      const payload=await response.json() as any;
      if(!response.ok)throw new Error(`LLM endpoint returned ${response.status}: ${payload?.error?.message??response.statusText}`);
      const message=payload?.choices?.[0]?.message??{};
      const toolCalls:ToolCall[]=(message.tool_calls??[]).map((call:any)=>({id:call.id,name:call.function?.name??'',arguments:safeJsonObject(call.function?.arguments)})).filter((call:ToolCall)=>call.name);
      return{text:typeof message.content==='string'?message.content:'',toolCalls,durationMs:performance.now()-started,inputTokens:payload?.usage?.prompt_tokens,outputTokens:payload?.usage?.completion_tokens,finishReason:payload?.choices?.[0]?.finish_reason,raw:payload};
    }finally{clearTimeout(timeout);}
  }
}
export class RawAdapter extends OpenAICompatibleAdapter{readonly kind:AdapterKind='raw';}
export class CloudAdapter extends OpenAICompatibleAdapter{readonly kind:AdapterKind='cloud';constructor(options:AdapterOptions){if(!options.apiKey)throw new Error('Cloud adapter requires TOOLERY_API_KEY.');super(options);}}
export class OllamaAdapter implements LlmAdapter{
  readonly kind:AdapterKind='ollama';
  private readonly client:OllamaClient;
  constructor(options:AdapterOptions){
    const baseUrl=options.baseUrl.replace(/\/v1\/?$/,'');
    this.client=new OllamaClient({baseUrl,timeoutMs:options.timeoutMs});
  }
  async complete(request:AdapterRequest):Promise<AdapterResponse>{
    const started=performance.now();
    const messages=request.messages.map(m=>{
      if(m.role==='tool')return{role:'tool' as const,content:m.content??'',tool_call_id:m.toolCallId||''};
      if(m.role==='assistant'&&m.toolCalls?.length)return{role:'assistant' as const,content:m.content??'',tool_calls:m.toolCalls.map(c=>({id:c.id||`call_${c.name}`,function:{name:c.name,arguments:safeJsonObject(c.arguments)}}))};
      return{role:m.role as 'system'|'user'|'assistant',content:m.content??''};
    });
    const tools=request.tools.map(t=>({type:'function' as const,function:{name:t.name,description:t.description,parameters:t.parameters as any}}));
    const res=await this.client.chat({model:request.model,messages,tools:tools.length?tools:undefined,options:{temperature:request.temperature??0}});
    const toolCalls:ToolCall[]=(res.message.tool_calls??[]).map(c=>({id:c.id,name:c.function?.name??'',arguments:safeJsonObject(c.function?.arguments)})).filter(c=>c.name);
    return{text:res.message.content||'',toolCalls,durationMs:res.total_duration?res.total_duration/1e6:performance.now()-started,inputTokens:res.prompt_eval_count,outputTokens:res.eval_count,finishReason:res.done_reason||(toolCalls.length?'tool_calls':'stop'),raw:res};
  }
}
export class HermesAdapter implements LlmAdapter{readonly kind:AdapterKind='hermes';async complete():Promise<AdapterResponse>{throw new Error('Hermes adapter requires the optional Hermes/MCP bridge. Use adapter=hermes only after configuring HERMES_HOME and the bridge runtime.');}}
export class MockAdapter implements LlmAdapter{readonly kind:AdapterKind='mock';async complete(request:AdapterRequest):Promise<AdapterResponse>{const userText=[...request.messages].reverse().find(m=>m.role==='user')?.content??'';const calls:ToolCall[]=[];const add=(name:string,args:Record<string,unknown>)=>calls.push({id:`mock-${calls.length+1}`,name,arguments:args});if(/do not call any tools/i.test(userText))return{text:'Hello!',toolCalls:[],durationMs:1,finishReason:'stop'};const weather=userText.match(/weather in ([A-Za-z ]+)/i);if(weather)add('get_weather',{location:weather[1].trim(),date:'today'});const crypto=userText.match(/price of ([A-Z0-9]+)/i);if(crypto)add('get_crypto_price',{symbol:crypto[1]});const quote=userText.match(/stock quote for ([A-Z]+)/i);if(quote)add('get_stock_quote',{symbol:quote[1]});const tz=userText.match(/time (?:is it )?in ([A-Za-z_]+\/[A-Za-z_]+)/i);if(tz)add('get_current_time',{timezone:tz[1]});const calc=userText.match(/Calculate ([0-9+*/ -]+)/i);if(calc)add('calculate',{expression:calc[1].trim()});const user=userText.match(/look up user ([A-Za-z0-9_]+)/i);if(user)add('lookup_user',{username:user[1]});const docs=userText.match(/docs for ([^.]+)/i);if(docs)add('search_docs',{query:docs[1].trim()});if(/repository status/i.test(userText)){add('git_status',{});add('run_tests',{});add('read_file',{path:'relevant'});}if(/account balance/i.test(userText)){add('get_account_balance',{account:'primary'});if(/backup/i.test(userText))add('get_account_balance',{account:'backup'});}return{text:/summarize|summary/i.test(userText)?'The requested result was summarized.':'',toolCalls:calls,durationMs:1,finishReason:calls.length?'tool_calls':'stop'};}}
