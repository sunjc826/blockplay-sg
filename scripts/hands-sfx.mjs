// Grenade and armor plate handling sounds, timed to the viewmodel in fps-grenade-motion and supplyMotion.
// Lists the batch by default; --generate spends credits through cached once-only ElevenLabs receipts
// and never retries a paid attempt; --publish prepares completed recordings offline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cache/hands-sfx');
const output=path.join(root,'public/audio/hands'),run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
const hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const dry='Close-up first-person foley, dry, no room reverb, no music, no voice.';
// `max` is the longest the game plays; `level` is the loudest 50 ms in linear RMS, so quiet handling stays under the gunfire.
const sounds=[
 {group:'hands-grenade-draw',takes:1,seconds:.6,max:.5,level:.12,text:'A hand pulls a small steel hand grenade out of a nylon webbing pouch: quick fabric rustle and a light metal tap. One short movement.'},
 {group:'hands-grenade-pin',takes:2,seconds:.6,max:.4,level:.2,text:'A steel safety pin is pulled out of a hand grenade fuse: a sharp thin metallic scrape ending in a small bright ring click. One quick pull.'},
 {group:'hands-grenade-throw',takes:2,seconds:.7,max:.45,level:.16,text:'An arm swings hard overhead to throw an object: one fast short whoosh of air with a snap of jacket sleeve fabric. No impact.'},
 {group:'hands-grenade-spoon',takes:2,seconds:.5,max:.3,level:.14,text:'The spring lever of a hand grenade flips off: one light thin metallic ping and a tiny spring twang, small and bright.'},
 {group:'hands-plate-draw',takes:1,seconds:.8,max:.6,level:.14,text:'A heavy ceramic armor plate in a fabric cover is yanked out of a nylon pouch: fast heavy cloth slide with a dull hollow knock at the end.'},
 {group:'hands-plate-feed',takes:1,seconds:1,max:.55,level:.13,text:'A rigid ceramic armor plate slides down into a tight nylon vest pocket: steady rough cordura friction scrape, one continuous short push.'},
 {group:'hands-plate-seat',takes:2,seconds:.7,max:.5,level:.3,text:'A heavy ceramic armor plate is slammed home into a plate carrier vest: one hard dull thud against the chest with a stiff nylon slap. Heavy, low and punchy.'},
 {group:'hands-plate-pat',takes:1,seconds:.5,max:.2,level:.1,text:'A gloved palm pats a tight nylon vest panel once: one soft dull fabric pat, low and short.'},
];
const take=(s,n,text=s.text)=>({id:`${s.group}-${n}`,sound:s,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:s.seconds,prompt_influence:.65,text:`${text} ${dry}`}});
// Came back near silent (peaks of -49 and -39 dB). Their receipts stay in the cache; each has one reworded replacement below.
const rejected=new Set(['hands-grenade-draw-1','hands-grenade-spoon-2']);
const replacements=[
 take(sounds[0],2,'Loud close nylon webbing pouch flap ripped open and a hand grabs a steel hand grenade: strong cloth rustle and a solid metal clink. One short movement.'),
 take(sounds[3],3,'A small steel grenade lever snaps free: one loud bright metallic tink with a short spring twang. Clear and sharp, immediate attack.'),
];
const requests=[...sounds.flatMap(s=>Array.from({length:s.takes},(_,i)=>take(s,i+1))).filter(r=>!rejected.has(r.id)),...replacements];
const estimate=Math.ceil(requests.reduce((sum,r)=>sum+r.request.duration_seconds*10,0));
if(requests.length!==12||estimate>100||requests.some(r=>r.request.text.length>450))throw Error('Invalid bounded sound batch.');
console.log(JSON.stringify({requests:requests.length,estimatedCredits:estimate}));
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);if(before.limit-before.used<estimate*2)throw Error('Insufficient included credits for the bounded batch.');
 await fs.mkdir(directory,{recursive:true});await writeJson(path.join(directory,'usage-before.json'),before);console.log(JSON.stringify({before}));
 try{for(const item of requests){const receipt=await once({directory,id:item.id,request:item.request,endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true});console.log(JSON.stringify({id:item.id,status:receipt.status}));}}
 finally{const after=await usage(key).catch(()=>null);await writeJson(path.join(directory,'usage-after.json'),after);console.log(JSON.stringify({after,observedCreditChange:after?after.used-before.used:null}));}
}
if(process.argv.includes('--publish')){
 await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});const groups={},receipts=[];
 for(const item of requests){
  const receipt=JSON.parse(await fs.readFile(path.join(directory,item.id+'.json'),'utf8'));if(receipt.status!=='complete')throw Error(item.id+': incomplete paid request; inspect before any retry');
  const source=await fs.readFile(path.join(directory,item.id+'.mp3'));if(hash(source)!==receipt.sha256)throw Error('Source checksum mismatch');
  const {stdout}=await run(ffmpeg,['-v','error','-i',path.join(directory,item.id+'.mp3'),'-ac','1','-ar','44100','-f','f32le','-'],{encoding:'buffer',maxBuffer:1<<26});
  const pcm=new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength));let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));if(peak<.005)throw Error('Silent source: '+item.id);
  // Starts 1 ms before its attack, so a quiet lead-in never makes the sound land after the action it goes with.
  const start=Math.max(0,pcm.findIndex(x=>Math.abs(x)>peak*.16)-44);let end=pcm.length-1;while(end>start&&Math.abs(pcm[end])<peak*.003)end--;
  const clip=pcm.slice(start,Math.min(end+1,start+Math.round(item.sound.max*44100)));let energy=0,rms=0,cp=0,loudestAt=0;
  for(let i=0;i<clip.length;i++){energy+=clip[i]**2-(i>=2205?clip[i-2205]**2:0);const now=Math.sqrt(Math.max(0,energy)/Math.min(i+1,2205));if(now>rms){rms=now;loudestAt=i;}cp=Math.max(cp,Math.abs(clip[i]));}
  const gain=Math.min(item.sound.level/rms,.9/cp);for(let i=0;i<clip.length;i++)clip[i]*=gain*Math.min(1,i/22)*Math.min(1,(clip.length-1-i)/882);
  const raw=path.join(directory,item.id+'.f32'),prepared=path.join(directory,item.id+'-prepared.mp3');await fs.writeFile(raw,Buffer.from(clip.buffer,clip.byteOffset,clip.byteLength));
  await run(ffmpeg,['-v','error','-y','-f','f32le','-ar','44100','-ac','1','-i',raw,'-c:a','libmp3lame','-b:a','96k',prepared]);
  const bytes=await fs.readFile(prepared),sha256=hash(bytes),file=`${item.id}-${sha256.slice(0,10)}.mp3`;await fs.writeFile(path.join(output,file),bytes);
  (groups[item.sound.group]??=[]).push({file,seconds:Number((clip.length/44100).toFixed(3))});
  receipts.push({id:item.id,file,sourceSha256:receipt.sha256,outputSha256:sha256,seconds:Number((clip.length/44100).toFixed(3)),loudestAtMs:Math.round(loudestAt/44.1),gain:Number(gain.toFixed(3)),sourcePeak:Number(peak.toFixed(3))});
 }
 await fs.mkdir(path.join(root,'src/audio/hands'),{recursive:true});
 await writeJson(path.join(root,'src/audio/hands/manifest.json'),{version:1,provider:'ElevenLabs',model:'eleven_text_to_sound_v3',processing:'44100 Hz mono, trimmed to 1 ms before the attack, loudness set per sound, 96 kbps MP3',groups,sources:receipts});
 for(const r of receipts)console.log(`${r.id} ${r.seconds}s loudest@${r.loudestAtMs}ms gain ${r.gain}`);
}
