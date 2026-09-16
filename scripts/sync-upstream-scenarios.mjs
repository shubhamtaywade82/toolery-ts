import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';

const owner='karolpalys',repo='toolery',ref='36c8c0c217898aade7500fa13b02fdc4d58899f7';
const outDir=path.resolve('vendor/toolery-upstream');
const api=`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
const tree=await (await fetch(api,{headers:{accept:'application/vnd.github+json'}})).json();
if(!tree.tree) throw new Error('Unable to fetch upstream tree');
const files=tree.tree.filter(x=>x.type==='blob' && /^scenarios\/(easy|medium|hard|very_hard)\/.*\.ya?ml$/.test(x.path));
if(files.length!==143) throw new Error(`Expected 143 upstream scenarios, found ${files.length}`);
await mkdir(outDir,{recursive:true});
const records=[];
for(const file of files){const url=`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file.path}`;const response=await fetch(url);if(!response.ok)throw new Error(`${response.status} ${url}`);const text=await response.text();const data=yaml.parse(text);const digest=crypto.createHash('sha256').update(text).digest('hex');await writeFile(path.join(outDir,path.basename(file.path)),text);records.push({path:file.path,sha256:digest,scenario:data});}
await writeFile(path.join(outDir,'manifest.json'),JSON.stringify({source:`${owner}/${repo}@${ref}`,count:records.length,records},null,2));
console.log(`Imported ${records.length} upstream scenarios into ${outDir}`);
