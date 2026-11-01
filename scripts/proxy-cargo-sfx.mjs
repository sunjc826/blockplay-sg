// Bounded new-weapon batch; --generate uses cached once-only ElevenLabs receipts.
// Without --generate, prepares completed recordings only. Never retries a paid attempt.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)), directory=path.join(root,'.cache/freedom-cargo-v2/audio');
const output=path.join(root,'public/audio/proxy'),run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
const hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const descriptions={oicw:'XM29-inspired bulky polymer and steel assault rifle, forward box rifle magazine',intervention:'CheyTac M200-inspired heavy precision bolt-action rifle with a large steel manual bolt and detachable box magazine','oicw-launcher':'XM29-inspired upper grenade launcher with a rear rectangular grenade magazine and heavy steel charging assembly'};
const actions={out:'Magazine release clicks and the box magazine slides free; short dry latch click and scraping slide',in:'Loaded box magazine slides into its well, short friction then a firm clack',seat:'Palm taps the magazine floorplate, one blunt seating slap and locking click',back:'Charging handle pulls back, short steel slide to a rear stop',release:'Action moves forward to chamber, one short mechanical steel clack'};
const requests=[];
for(const [family,description] of Object.entries(descriptions)){
 for(const [event,action] of Object.entries(actions)){
  const special=family==='intervention'?(event==='back'?'The manual bolt handle lifts to unlock then pulls back, a close steel cam click and sliding scrape':event==='release'?'Manual bolt pushes forward and rotates down into lock, a short sliding scrape ending in two tight steel clicks':action):action;
  requests.push({id:`reload-${family}-${event}`,max:.4,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:.5,prompt_influence:.65,text:`${description}. ${special}. One dry close mechanical action, immediate onset, under 350 ms then silence. No gunshot, full reload, music, voice or ambience.`}});
 }
 requests.push({id:`empty-fire-${family}`,max:.2,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:.5,prompt_influence:.65,text:`${description}. One dry trigger click on an empty chamber, compact mechanical click, immediate onset then silence. No gunshot, reload, music, voice or ambience.`}});
}
requests.push({id:'proxy-intervention-shot',max:1.5,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:1.5,prompt_influence:.65,text:'One isolated powerful .408 large precision bolt-action rifle shot outdoors. Immediate sharp report and deep short low body with a natural open-air tail. No bolt cycling, reload, speech, music or second shot.'}});
requests.push({id:'proxy-launcher-shot',max:1.1,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:1.5,prompt_influence:.65,text:'One isolated 20mm shoulder-fired grenade launcher discharge. Immediate short low hollow thump with a compact mechanical clack and brief outdoor tail. No impact explosion, second shot, voice, music or reload.'}});
if(requests.length!==20||requests.some(r=>r.request.text.length>450))throw Error('Invalid bounded sound batch.');
await fs.mkdir(directory,{recursive:true});
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);if(before.limit-before.used<2000)throw Error('Insufficient included credits for the bounded batch.');
 await writeJson(path.join(directory,'usage-before.json'),before);console.log(JSON.stringify({requests:requests.length,before}));
 try{for(const item of requests){const r=await once({directory,id:item.id,request:item.request,endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true});console.log(JSON.stringify({id:item.id,bytes:r.bytes,credits:r.characterCost}));}}
 finally{const after=await usage(key).catch(()=>null);await writeJson(path.join(directory,'usage-after.json'),after);console.log(JSON.stringify({after,observedCreditChange:after?after.used-before.used:null}));}
}
await fs.mkdir(output,{recursive:true});const groups={},receipts=[];
for(const item of requests){
 const receipt=JSON.parse(await fs.readFile(path.join(directory,item.id+'.json'),'utf8'));if(receipt.status!=='complete')throw Error(item.id+': incomplete paid request; inspect before any retry');
 const source=await fs.readFile(path.join(directory,item.id+'.mp3'));if(hash(source)!==receipt.sha256)throw Error('Source checksum mismatch');
 const {stdout}=await run(ffmpeg,['-v','error','-i',path.join(directory,item.id+'.mp3'),'-ac','1','-ar','44100','-f','f32le','-'],{encoding:'buffer'});
 const pcm=new Float32Array(stdout.buffer,stdout.byteOffset,stdout.byteLength/4);let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));if(peak<.005)throw Error('Silent source: '+item.id);
 const start=Math.max(0,pcm.findIndex(x=>Math.abs(x)>peak*.16)-44);let end=pcm.length-1;while(end>start&&Math.abs(pcm[end])<peak*.003)end--;
 const clip=pcm.slice(start,Math.min(end+1,start+Math.round(item.max*44100)));let energy=0,rms=0,cp=0;
 for(let i=0;i<clip.length;i++){energy+=clip[i]**2-(i>=2205?clip[i-2205]**2:0);rms=Math.max(rms,Math.sqrt(Math.max(0,energy)/Math.min(i+1,2205)));cp=Math.max(cp,Math.abs(clip[i]));}
 const gain=Math.min(.23/rms,.9/cp);for(let i=0;i<clip.length;i++)clip[i]*=gain*Math.min(1,i/22)*Math.min(1,(clip.length-1-i)/882);
 const raw=path.join(directory,item.id+'.f32'),prepared=path.join(directory,item.id+'-prepared.mp3');await fs.writeFile(raw,Buffer.from(clip.buffer,clip.byteOffset,clip.byteLength));
 await run(ffmpeg,['-v','error','-y','-f','f32le','-ar','44100','-ac','1','-i',raw,'-c:a','libmp3lame','-b:a','96k',prepared]);
 const bytes=await fs.readFile(prepared),sha256=hash(bytes),file=`${item.id}-${sha256.slice(0,10)}.mp3`;await fs.writeFile(path.join(output,file),bytes);groups[item.id]=[{file,seconds:clip.length/44100}];receipts.push({id:item.id,request:item.request,sourceSha256:receipt.sha256,sha256,requestId:receipt.requestId,credits:Number(receipt.characterCost),sourceStartSeconds:start/44100});
}
await fs.mkdir(path.join(root,'src/audio/proxy'),{recursive:true});await writeJson(path.join(root,'src/audio/proxy/manifest.json'),{version:1,provider:'ElevenLabs',model:'eleven_text_to_sound_v3',processing:'44100 Hz mono; silence trimmed, peak <= .9, loudest 50 ms RMS <= .23; 20 ms tail fade; original speed and pitch',groups,receipts});console.log('Prepared 20 weapon-specific clips.');
