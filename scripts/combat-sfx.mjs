// Combat feedback, pickups, water and footstep surfaces. Lists the batch by default; --generate spends credits through
// cached once-only ElevenLabs receipts and never retries a paid attempt; --publish prepares completed recordings offline.
// node --experimental-strip-types --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/combat-sfx.mjs --generate
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cache/combat-sfx');
const output=path.join(root,'public/audio/combat'),run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
const RATE=44100,hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const dry='Close-up, dry, immediate onset, no room reverb, no gunshot, no music, no voice.';
// `max` is the longest the game plays; `level` is the loudest 50 ms in linear RMS. `slice` cuts a sequence into footfalls.
const sounds=[
 {group:'combat-hit',takes:3,seconds:.5,max:.09,level:.2,text:'One tiny crisp tick: a fingernail flicking a hard plastic helmet shell, dry and bright. Extremely short, under 60 ms then silence.'},
 {group:'combat-headshot',takes:2,seconds:.5,max:.22,level:.24,onset:.6,text:'One sharp bright metallic ting: a small steel plate struck once by a light hammer, with a very short ring. Under 150 ms then silence.'},
 {group:'combat-kill',takes:2,seconds:.5,max:.28,level:.26,text:'One deep satisfying thunk with a small bright click on top: a heavy hardened steel latch snapping shut. Under 200 ms then silence.'},
 {group:'combat-hurt-armor',takes:2,seconds:.5,max:.3,level:.26,text:'A rifle round slams into a ceramic armor plate worn on the chest, heard from inside the vest: one hard dull crack and thud against nylon. Under 250 ms then silence.'},
 {group:'combat-hurt-break',takes:2,seconds:.8,max:.5,level:.3,text:'A ceramic armor plate shatters inside its fabric cover: one hard loud crack followed by a short crumble of broken ceramic fragments.'},
 {group:'combat-hurt-body',takes:3,seconds:.5,max:.26,level:.22,text:'A heavy blow to a body heard from inside it: one dull deep punch thump with a muted snap of jacket fabric. Non-graphic. Under 200 ms then silence.'},
 {group:'combat-hurt-heavy',takes:2,seconds:.6,max:.4,level:.3,text:'A very heavy blow to a body heard from inside it, muffled as if underwater: one deep low concussive thump with a pressure swell. Non-graphic.'},
 {group:'combat-hurt-deflect',takes:2,seconds:.5,max:.3,level:.24,text:'A rifle round glances off a hard armor plate: one sharp crack and a short thin metallic ricochet whine. Under 250 ms then silence.'},
 {group:'combat-heartbeat',takes:1,seconds:1.5,max:.7,level:.2,text:'One single human heartbeat heard from inside the chest: a low soft double thump, lub-dub, in deep bass. Only one beat, then silence.'},
 {group:'combat-breath',takes:2,seconds:2,max:1.6,level:.1,text:'One ragged exhausted human breath, in and out, close to the ear, strained and wounded. Only breath, no words, no groaning.',vocal:true},
 {group:'combat-grenade-bounce',takes:3,seconds:.5,max:.2,level:.18,text:'A small steel hand grenade lands on concrete and bounces once: one bright hard metallic clink and a small rattle. Under 150 ms then silence.'},
 {group:'combat-smoke-hiss',takes:1,seconds:3,max:3,level:.1,text:'A smoke grenade igniting: one small sharp fuse pop, then a steady pressurised gas hiss that keeps going without changing.'},
 {group:'combat-pickup-ammo',takes:2,seconds:.6,max:.45,level:.14,text:'Loaded metal rifle magazines pushed into a nylon pouch on a vest: one metal clack and a short snap of the pouch flap.'},
 {group:'combat-pickup-item',takes:2,seconds:.6,max:.4,level:.12,text:'A small item tucked into a nylon belt pouch: a quick short zip and a soft tap. One quick movement.'},
 {group:'combat-pickup-armor',takes:1,seconds:.8,max:.6,level:.14,text:'A plate carrier vest strapped on tight: one rip and press of hook-and-loop fastener and a firm plastic buckle click.'},
 {group:'combat-pickup-weapon',takes:1,seconds:.8,max:.6,level:.14,text:'A rifle lifted from the ground and slung: a nylon sling slide, a small buckle clink and a firm palm on a polymer handguard.'},
 {group:'combat-pickup-food',takes:1,seconds:.6,max:.4,level:.12,text:'A paper takeaway bag picked up and stuffed in a pouch: one short crisp paper rustle and a soft tap of a plastic container.'},
 {group:'combat-pickup-crate',takes:1,seconds:1.2,max:1,level:.16,text:'A steel military supply crate opened: two steel latches snap one after the other, then a short heavy lid creak and a dull bump.'},
 {group:'combat-pickup-buy',takes:1,seconds:.6,max:.4,level:.12,text:'A few coins put down on a wooden hawker counter: one short small clatter of metal coins. Under 300 ms then silence.'},
 {group:'combat-denied',takes:1,seconds:.5,max:.15,level:.12,text:'One soft dull knock of a fingertip on a closed plastic case. Quiet and short, under 100 ms then silence.'},
 {group:'combat-step-metal',takes:1,seconds:6,slice:true,level:.2,text:'Footsteps of one soldier in rubber-soled combat boots walking at a steady pace on a steel deck plate: hollow metallic clanks, each step clearly separated with silence between.'},
 {group:'combat-step-wood',takes:1,seconds:6,slice:true,level:.2,text:'Footsteps of one soldier in rubber-soled combat boots walking at a steady pace on old wooden boards: hollow woody knocks with a slight creak, each step clearly separated with silence between.'},
 {group:'combat-step-dirt',takes:1,seconds:6,slice:true,level:.2,text:'Footsteps of one soldier in rubber-soled combat boots walking at a steady pace on grass and packed earth: soft crunchy thuds with a little grit, each step clearly separated with silence between.'},
 {group:'combat-swim-stroke',takes:2,seconds:2,max:1.1,level:.1,text:'One swimming stroke in calm water heard at the surface: an arm pulls through with a soft gurgling swish and a few small drips. One stroke only.'},
 {group:'combat-water-enter',takes:2,seconds:1,max:.8,level:.2,text:'A person in full kit drops into deep water from a low height: one heavy splash and a short gurgle. One splash only.'},
 {group:'combat-water-exit',takes:1,seconds:1,max:.7,level:.14,text:'A person climbs out of water onto a concrete quay: a rush of water draining off wet clothes and a few heavy drips.'},
];
const take=(s,n,text=s.text)=>({id:`${s.group}-${n}`,sound:s,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:s.seconds,prompt_influence:.65,text:s.vocal?`${text} Close-up, dry, no room reverb, no music.`:`${text} ${dry}`}});
// Unusable takes go here with one reworded replacement each. Their receipts stay in the cache.
// Peaks of .004 to .025 came back on the headshot, kill, armor and bounce prompts; the second kill take was only a 50 ms spike.
// Armor keeps its one good take, as its reworded replacement came back near silent too.
const rejected=new Set(['combat-headshot-1','combat-headshot-2','combat-kill-1','combat-kill-2','combat-hurt-armor-1','combat-grenade-bounce-1','combat-grenade-bounce-3','combat-hurt-armor-3']);
const named=group=>sounds.find(s=>s.group===group);
const replacements=[
 take(named('combat-headshot'),3,'Loud close: a steel helmet struck once by a small hammer. One hard bright metallic TING with a short ring. Clear and loud, under 150 ms then silence.'),
 take(named('combat-headshot'),4,'Loud close: a small steel gong plate hit hard once with a steel rod. One sharp piercing metallic clang, very short ring. Clear and loud, under 150 ms then silence.'),
 take(named('combat-kill'),3,'Loud close: a heavy steel vault latch slammed shut. One deep hard metallic THUNK with a bright click on top and a low resonance. Clear and loud, 150 ms then silence.'),
 take(named('combat-kill'),4,'Loud close: a heavy steel door bolt thrown home. One solid deep metal CLUNK with weight behind it. Clear and loud, 200 ms then silence.'),
 take(named('combat-grenade-bounce'),4,'Loud close: a small steel ball dropped on a concrete floor. One hard bright metallic clink and a small rattle. Clear and loud, under 150 ms then silence.'),
];
const requests=[...sounds.flatMap(s=>Array.from({length:s.takes},(_,i)=>take(s,i+1))).filter(r=>!rejected.has(r.id)),...replacements];
const estimate=Math.ceil(requests.reduce((sum,r)=>sum+r.request.duration_seconds*10,0));
const tooLong=requests.find(r=>r.request.text.length>450);if(tooLong)throw Error('Sound prompt exceeds 450 characters: '+tooLong.id);
if(estimate>700)throw Error('Invalid bounded sound batch.');
console.log(JSON.stringify({requests:requests.length,estimatedCredits:estimate}));
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);if(before.limit-before.used<estimate*2)throw Error('Insufficient included credits for the bounded batch.');
 await fs.mkdir(directory,{recursive:true});console.log(JSON.stringify({used:before.used,limit:before.limit}));
 try{for(const item of requests){const receipt=await once({directory,id:item.id,request:item.request,endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true});if(receipt.status!=='complete')console.log(JSON.stringify({id:item.id,status:receipt.status}));}}
 finally{const after=await usage(key).catch(()=>null);console.log(JSON.stringify({used:after?.used,observedCreditChange:after?after.used-before.used:null}));}
}
async function decode(file){const {stdout}=await run(ffmpeg,['-v','error','-i',file,'-ac','1','-ar',String(RATE),'-f','f32le','-'],{encoding:'buffer',maxBuffer:1<<26});return new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength));}
/** Single footfalls: an onset is the envelope jumping above a quarter of the loudest step after a quiet stretch. */
function footfalls(pcm){
 const window=Math.round(RATE*.005),out=[];for(let w=0;w*window<pcm.length;w++){let e=0;for(let i=0;i<window;i++)e=Math.max(e,Math.abs(pcm[w*window+i]??0));out.push(e);}
 const loudest=Math.max(...out),onsets=[];let quiet=16;for(let w=0;w<out.length;w++){if(out[w]>loudest*.25&&quiet>=16){onsets.push(w);quiet=0;}else if(out[w]<loudest*.08)quiet++;}
 return onsets.map((w,i)=>{const from=Math.max(0,w*window-Math.round(RATE*.002)),to=Math.min(pcm.length,from+Math.round(RATE*.3),onsets[i+1]!==undefined?onsets[i+1]*window-Math.round(RATE*.004):Infinity);return pcm.slice(from,to);}).filter(c=>c.length>RATE*.05);
}
function trimmed(pcm,peak,max,onset=.16){const start=Math.max(0,pcm.findIndex(x=>Math.abs(x)>peak*onset)-44);let end=pcm.length-1;while(end>start&&Math.abs(pcm[end])<peak*.003)end--;return pcm.slice(start,Math.min(end+1,start+Math.round(max*RATE)));}
async function prepare(clip,level,id,receipt,peak,groups,receipts,group){
 let energy=0,rms=0,cp=0,loudestAt=0;
 for(let i=0;i<clip.length;i++){energy+=clip[i]**2-(i>=2205?clip[i-2205]**2:0);const now=Math.sqrt(Math.max(0,energy)/Math.min(i+1,2205));if(now>rms){rms=now;loudestAt=i;}cp=Math.max(cp,Math.abs(clip[i]));}
 const gain=Math.min(level/rms,.9/cp);for(let i=0;i<clip.length;i++)clip[i]*=gain*Math.min(1,i/22)*Math.min(1,(clip.length-1-i)/441);
 const raw=path.join(directory,id+'.f32'),prepared=path.join(directory,id+'-prepared.mp3');await fs.writeFile(raw,Buffer.from(clip.buffer,clip.byteOffset,clip.byteLength));
 await run(ffmpeg,['-v','error','-y','-f','f32le','-ar',String(RATE),'-ac','1','-i',raw,'-c:a','libmp3lame','-b:a','96k',prepared]);
 const bytes=await fs.readFile(prepared),sha256=hash(bytes),file=`${id}-${sha256.slice(0,10)}.mp3`;await fs.writeFile(path.join(output,file),bytes);
 const seconds=Number((clip.length/RATE).toFixed(3));(groups[group]??=[]).push({file,seconds});
 receipts.push({id,file,sourceSha256:receipt.sha256,outputSha256:sha256,seconds,loudestAtMs:Math.round(loudestAt/44.1),gain:Number(gain.toFixed(3)),sourcePeak:Number(peak.toFixed(3))});
}
if(process.argv.includes('--publish')){
 await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});const groups={},receipts=[];
 for(const item of requests){
  const receipt=JSON.parse(await fs.readFile(path.join(directory,item.id+'.json'),'utf8'));if(receipt.status!=='complete')throw Error(item.id+': incomplete paid request; inspect before any retry');
  const source=path.join(directory,item.id+'.mp3');if(hash(await fs.readFile(source))!==receipt.sha256)throw Error('Source checksum mismatch');
  const pcm=await decode(source);let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));if(peak<.005)throw Error('Silent source: '+item.id);
  if(item.sound.slice){const steps=footfalls(pcm);for(const [i,step] of steps.slice(0,8).entries())await prepare(step,item.sound.level,`${item.id}-${i+1}`,receipt,peak,groups,receipts,item.sound.group);}
  else await prepare(trimmed(pcm,peak,item.sound.max,item.sound.onset),item.sound.level,item.id,receipt,peak,groups,receipts,item.sound.group);
 }
 await fs.mkdir(path.join(root,'src/audio/combat'),{recursive:true});
 await writeJson(path.join(root,'src/audio/combat/manifest.json'),{version:1,provider:'ElevenLabs',model:'eleven_text_to_sound_v3',processing:'44100 Hz mono, trimmed to 1 ms before the attack, footsteps sliced, loudness set per sound, 96 kbps MP3',groups,sources:receipts});
 for(const r of receipts)console.log(`${r.id.padEnd(30)} ${String(r.seconds).padEnd(6)} loudest@${String(r.loudestAtMs).padEnd(5)} gain ${String(r.gain).padEnd(7)} srcPeak ${r.sourcePeak}`);
}
