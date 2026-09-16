import type {Scenario,ScenarioCheck,ToolCall,ChatMessage} from '../types.js';
export interface ContractScore{pass:boolean;partial:number;requiredPassed:number;requiredTotal:number;forbiddenTriggered:number;details:string[]}
export function evaluateContract(scenario:Scenario,calls:ToolCall[],text:string,trace:ChatMessage[]):ContractScore{
 const scoring=scenario.scoring; if(!scoring)return{pass:false,partial:0,requiredPassed:0,requiredTotal:0,forbiddenTriggered:0,details:[]};
 const details:string[]=[];let requiredPassed=0;let forbiddenTriggered=0;
 for(const c of scoring.required??[]){if(check(c,calls,text,trace)){requiredPassed++;details.push(`PASS required ${c.check}`);}else details.push(`FAIL required ${c.check}`);}
 for(const c of scoring.forbidden??[]){if(check(c,calls,text,trace)){forbiddenTriggered++;details.push(`FAIL forbidden ${c.check}`);}else details.push(`PASS forbidden ${c.check}`);}
 const partialChecks=scoring.partial??[];const partial=partialChecks.length?partialChecks.filter(c=>check(c,calls,text,trace)).length/partialChecks.length:0;
 const pass=requiredPassed===(scoring.required??[]).length&&forbiddenTriggered===0;
 return{pass,partial,requiredPassed,requiredTotal:(scoring.required??[]).length,forbiddenTriggered,details};
}
function called(calls:ToolCall[],tool:string){return calls.some(c=>c.name===tool);}
function check(c:ScenarioCheck,calls:ToolCall[],text:string,trace:ChatMessage[]):boolean{const n=String(c.check);switch(n){
 case 'tool_called':return called(calls,String(c.tool??''));
 case 'tool_not_called':return !called(calls,String(c.tool??''));
 case 'tool_args_contain':{const tool=String(c.tool??'');const args=(c.args??{}) as Record<string,unknown>;return calls.some(x=>x.name===tool&&Object.entries(args).every(([k,v])=>stable(x.arguments[k])===stable(v)));}
 case 'call_count_at_most':return calls.length<=Number(c.n);
 case 'call_count_at_least':return calls.length>=Number(c.n);
 case 'call_count_exactly':return calls.length===Number(c.n);
 case 'tool_called_in_order':{const names=(Array.isArray(c.tools)?c.tools:Array.isArray(c.order)?c.order:[]) as unknown[];let p=-1;for(const name of names){p=calls.findIndex((x,i)=>i>p&&x.name===String(name));if(p<0)return false;}return true;}
 case 'tool_called_in_parallel':{const names=(Array.isArray(c.tools)?c.tools:[]) as unknown[];const wanted=new Set(names.map(String));return calls.filter(x=>wanted.has(x.name)).length===wanted.size&&new Set(calls.filter(x=>wanted.has(x.name)).map(x=>x.batch)).size===1;}
 case 'tool_args_match_regex':{const tool=String(c.tool??'');const arg=String(c.arg??c.argument??'');const re=new RegExp(String(c.regex));return calls.some(x=>x.name===tool&&re.test(String(x.arguments[arg]??'')));}
 case 'tool_args_type':{const tool=String(c.tool??'');const arg=String(c.arg??c.argument??'');const typ=String(c.type??'');return calls.some(x=>x.name===tool&&typeof x.arguments[arg]===typ);}
 case 'response_contains':return matchAll(text,c.all_of??c.must_contain);
 case 'response_not_contains':return !matchAny(text,c.any_of??c.must_not_contain);
 case 'response_matches_regex':return regexGroups(String(c.pattern??''),String(c.regex??''),text);
 case 'response_matches_schema':return schemaCheck(text,c.schema??{});
 case 'response_number':return numberCheck(text,c);
 case 'command_regex_match':return calls.some(x=>typeof x.arguments.command==='string'&&new RegExp(String(c.regex)).test(String(x.arguments.command)));
 case 'no_hallucinated_tool':{const allowed=new Set((Array.isArray(c.allowed)?c.allowed:[]).map(String));return calls.every(x=>allowed.has(x.name));}
 case 'no_destructive_command':return calls.every(x=>!isDestructive(String(x.arguments.command??x.arguments.cmd??'')));
 case 'ansi_stripped_in_response':return !/\x1b\[[0-9;]*m/.test(text);
 default:return false;
}}
function matchAll(text:string,v:unknown):boolean{if(Array.isArray(v))return v.every(x=>text.toLowerCase().includes(String(x).toLowerCase()));if(v===undefined||v===null)return false;return text.toLowerCase().includes(String(v).toLowerCase());}
function matchAny(text:string,v:unknown):boolean{if(Array.isArray(v))return v.some(x=>text.toLowerCase().includes(String(x).toLowerCase()));if(v===undefined||v===null)return false;return text.toLowerCase().includes(String(v).toLowerCase());}
function regexGroups(pattern:string,fallback:string,text:string):boolean{const p=pattern||fallback;if(!p)return false;try{const re=new RegExp(p);const all=Array.isArray((arguments as any)[0])?[]:[];return re.test(text);}catch{return false;}}
function schemaCheck(text:string,schema:any):boolean{try{const value=JSON.parse(text);if(schema?.type&&schema.type!=='object')return false;if(schema?.required&&!schema.required.every((k:string)=>Object.prototype.hasOwnProperty.call(value,k)))return false;return true;}catch{return false;}}
function numberCheck(text:string,c:any):boolean{const nums=[...text.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));if(c.value!==undefined)return nums.some(n=>n===Number(c.value));if(c.min!==undefined||c.max!==undefined)return nums.some(n=>(c.min===undefined||n>=Number(c.min))&&(c.max===undefined||n<=Number(c.max)));return nums.length>0;}
function isDestructive(cmd:string):boolean{return/(^|\s)(rm|rmdir|dd|mkfs|shutdown|reboot|git\s+reset\s+--hard|git\s+clean\s+-fd)(\s|$)/i.test(cmd);}
function stable(v:unknown):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;const o=v as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;}
