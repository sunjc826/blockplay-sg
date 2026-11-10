// Explicit, bounded generation. Uses the repository's once-only paid request ledger.
import { once, usage } from './elevenlabs-once.mjs';
import { scenes } from '../public/story.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'.cache/audio-v1');
const output=path.join(root,'public/audio');
// This host's native fetch proxy stalls on ElevenLabs. Use the OS proxy via
// urllib; credentials travel only in the child process stdin, never argv/files.
async function proxyFetch(url,options={}) {
  const script = `import sys,json,base64\nfrom urllib.request import Request,urlopen\nfrom urllib.error import HTTPError\nd=json.load(sys.stdin)\nr=Request(d['url'],data=d.get('body',None).encode() if d.get('body') is not None else None,headers=d.get('headers',{}),method=d.get('method','GET'))\ntry:\n response=urlopen(r,timeout=180)\nexcept HTTPError as e:\n response=e\nprint(json.dumps({'status':response.status,'headers':dict(response.headers),'body':base64.b64encode(response.read()).decode()}))`;
  const data=await new Promise((resolve,reject)=>{
    const child=spawn('python3',['-c',script],{stdio:['pipe','pipe','pipe']});
    const chunks=[]; let errors='';
    child.stdout.on('data',c=>chunks.push(c)); child.stderr.on('data',c=>errors+=c.toString());
    child.on('error',reject); child.on('close',code=>code===0?resolve(Buffer.concat(chunks).toString()):reject(new Error('Proxy request failed; inspect the attempt ledger.')));
    child.stdin.end(JSON.stringify({url,method:options.method||'GET',headers:options.headers||{},body:options.body}));
  });
  const response=JSON.parse(data);
  return new Response(Buffer.from(response.body,'base64'),{status:response.status,headers:response.headers});
}
globalThis.fetch=proxyFetch;
const voice='JBFqnCBsd6RMkjVDRZzb'; // George, ElevenLabs premade narrator (official API example).
const lines=Object.entries(scenes).map(([id,scene])=>({id,text:scene.text}));
if(!process.argv.includes('--generate')) { console.log(JSON.stringify({mode:'dry-run',clips:lines.length,characters:lines.reduce((n,l)=>n+l.text.length,0),soundSeconds:8})); process.exit(0); }
// A fresh clone already contains the completed pack. Never spend to recreate it.
try {
  const manifest=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
  const checksum=async id=>createHash('sha256').update(await fs.readFile(path.join(output,id+'.mp3'))).digest('hex');
  let complete=manifest.provider==='ElevenLabs' && manifest.model==='eleven_multilingual_v2' && manifest.voiceId===voice;
  for(const line of lines) {
    const clip=manifest.clips.find(item=>item.id===line.id);
    if(!clip || clip.text!==line.text || await checksum(line.id)!==clip.sha256) complete=false;
  }
  if(complete && await checksum('atmosphere')===manifest.atmosphere.sha256) {
    console.log('Complete published audio pack verified and reused. No API requests or credits spent.');
    process.exit(0);
  }
} catch(error) {
  if(error.code!=='ENOENT') throw error;
}
const key=process.env.ELEVENLABS_API_KEY;
if(!key) throw new Error('ELEVENLABS_API_KEY required');
await fs.mkdir(directory,{recursive:true}); await fs.mkdir(output,{recursive:true});
const before=await usage(key);
const reserve=lines.reduce((n,l)=>n+l.text.length,0)*2+1000;
if(before.limit-before.used<reserve) throw new Error('Insufficient included credits for bounded batch.');
await fs.writeFile(path.join(directory,'usage-before.json'),JSON.stringify(before,null,2),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({before,reservedUpperBudget:reserve,clips:lines.length}));
const clips=[];
try {
  for(const line of lines) {
    const result=await once({directory,id:line.id,request:{text:line.text,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.5,similarity_boost:0.75,style:0.25,use_speaker_boost:true}},endpoint:`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,key,binary:true,fetcher:proxyFetch});
    await fs.copyFile(path.join(directory,line.id+'.mp3'),path.join(output,line.id+'.mp3'));
    clips.push({...line,sha256:result.sha256,bytes:result.bytes});
    console.log(`${clips.length}/${lines.length}: ${line.id} cached and published`);
  }
  const result=await once({directory,id:'atmosphere',request:{text:'Quiet empty underground train station after midnight, distant low ventilation hum, soft rain above the entrance, subtle electric rail resonance. Seamless atmospheric ambience, no voices, no speech, no music, no sudden loud sounds.',duration_seconds:8,prompt_influence:0.4,model_id:'eleven_text_to_sound_v2'},endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true,fetcher:proxyFetch});
  await fs.copyFile(path.join(directory,'atmosphere.mp3'),path.join(output,'atmosphere.mp3'));
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({provider:'ElevenLabs',model:'eleven_multilingual_v2',voice:'George',voiceId:voice,clips,atmosphere:{sha256:result.sha256,bytes:result.bytes,model:'eleven_text_to_sound_v2'}},null,2)+'\n');
} finally {
  const after=await usage(key).catch(()=>null);
  await fs.writeFile(path.join(directory,'usage-after.json'),JSON.stringify(after,null,2));
  console.log(JSON.stringify({after,observedCreditChange:after?after.used-before.used:null}));
}
