// Vehicles, weather, ambience, set pieces, small handling sounds and milestones. Lists the batch by default; --generate spends
// credits through cached once-only ElevenLabs receipts and never retries a paid attempt; --publish prepares recordings offline.
// node --experimental-strip-types --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/world-sfx.mjs --generate
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cache/world-sfx');
const output=path.join(root,'public/audio/world'),run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
const RATE=44100,hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const dry='Dry, no music, no voice.',steady='A steady continuous sound that does not change, with no start, no end and no events.';
// `max` is the longest the game plays; `level` is the loudest 50 ms in linear RMS. `loop` publishes a seamless loop, padded either side.
const sounds=[
 {group:'world-car-loop',takes:1,seconds:5,loop:true,level:.2,text:`A military light utility truck diesel engine running at a steady cruise, heard from the driver seat, low rumble and light tyre road noise. ${steady}`},
 {group:'world-heli-loop',takes:1,seconds:5,loop:true,level:.22,text:`A military helicopter in steady flight heard from inside the cabin: the rhythmic chop of the main rotor and the whine of a turbine. ${steady}`},
 {group:'world-boat-loop',takes:1,seconds:5,loop:true,level:.2,text:`A small outboard motor boat at steady speed heard from on board: a throaty petrol engine and water rushing past the hull. ${steady}`},
 {group:'world-dragon-drum',takes:2,seconds:.6,max:.4,level:.14,text:'One single stroke on a large Chinese dragon boat drum: a deep booming wooden hide thump. One beat only.'},
 {group:'world-paddle',takes:2,seconds:.8,max:.6,level:.12,text:'One wooden paddle stroke through calm water: a quick plunge and a pull with a swish. One stroke only.'},
 {group:'world-vehicle-crash',takes:2,seconds:.8,max:.6,level:.3,text:'A truck slams into a concrete wall at low speed: one heavy metal crunch and a short rattle of loose parts. One impact only.'},
 {group:'world-vehicle-door',takes:2,seconds:.6,max:.45,level:.16,text:'A heavy steel truck door pulled shut: one solid metal clunk with a small latch click.'},
 {group:'world-seat',takes:1,seconds:.6,max:.4,level:.12,text:'A person shifts across a vinyl vehicle seat in full kit: a short creak of vinyl and a rustle of webbing.'},
 {group:'world-rain-loop',takes:1,seconds:6,loop:true,level:.1,text:`Heavy tropical rain falling on concrete and leaves, close and even, with no thunder. ${steady}`},
 {group:'world-wind-loop',takes:1,seconds:6,loop:true,level:.08,text:`Moderate wind blowing across an open rooftop in the city, soft airy rushing with no gusts or whistles. ${steady}`},
 {group:'world-city-loop',takes:1,seconds:8,loop:true,level:.05,text:`Distant Singapore city ambience from a quiet street: far away traffic hum, faint air conditioners and a few distant birds, no people close by. ${steady}`},
 {group:'world-coast-loop',takes:1,seconds:8,loop:true,level:.06,text:`Calm sea lapping against a concrete quay, gentle small waves and a light breeze. ${steady}`},
 {group:'world-thunder',takes:2,seconds:4,max:4,level:.2,text:'One long roll of thunder from a tropical storm a few kilometres away, a low rumble that builds and fades, no rain sound.'},
 {group:'world-merlion-jet',takes:1,seconds:4,loop:true,level:.18,text:`A powerful fountain jet of water under pressure, heard close: a hard rushing roar of water spraying and splashing. ${steady}`},
 {group:'world-lift-motor',takes:1,seconds:4,loop:true,level:.08,text:`Inside an express elevator travelling at speed: a smooth low electric motor hum with soft air rushing past. ${steady}`},
 {group:'world-lift-ding',takes:1,seconds:1,max:.8,level:.14,text:'A building elevator arrival chime: one soft clear single bell ding, then the short smooth slide of steel doors opening.'},
 {group:'world-chute-open',takes:1,seconds:1.5,max:1.2,level:.26,text:'A military parachute canopy opening above: a rush of fabric and one big deep whump as the nylon fills with air.'},
 {group:'world-chute-wind',takes:1,seconds:4,loop:true,level:.1,text:`Descending under a parachute: wind rushing past the ears and fabric fluttering softly overhead. ${steady}`},
 {group:'world-aim',takes:2,seconds:.5,max:.2,level:.09,text:'A rifle brought up to the shoulder to aim: one very quick soft rustle of a jacket sleeve and a soft tap on the stock. Under 150 ms then silence.'},
 {group:'world-scope-click',takes:2,seconds:.5,max:.1,level:.12,text:'One small crisp click of a metal rifle scope magnification ring moving one detent. Under 60 ms then silence.'},
 {group:'world-switch-click',takes:2,seconds:.5,max:.1,level:.12,text:'One small crisp click of a rubber-covered tactical flashlight tail switch being pressed. Under 60 ms then silence.'},
 {group:'world-cloth-down',takes:2,seconds:.6,max:.4,level:.09,text:'A soldier in full kit crouches down: a quick rustle of webbing and a soft knee pad tap on the ground.'},
 {group:'world-cloth-up',takes:2,seconds:.6,max:.35,level:.08,text:'A soldier in full kit stands up: a quick rustle of webbing and a small shift of gear.'},
 {group:'world-jump',takes:2,seconds:.5,max:.25,level:.08,text:'A soldier in full kit pushes off to jump: a boot scuff and a short rustle and rattle of gear. Under 200 ms then silence.'},
 {group:'world-inspect',takes:1,seconds:1,max:.8,level:.07,text:'A rifle turned over in gloved hands to look at it: a soft polymer tap, a small metal rattle and a hand sliding along the handguard.'},
 {group:'world-brass',takes:3,seconds:.5,max:.25,level:.1,text:'One small empty brass rifle cartridge case bouncing on concrete: a tiny bright metallic tinkle. Under 200 ms then silence.'},
 {group:'world-objective',takes:1,seconds:1.5,max:1.2,level:.16,text:'A short military radio confirmation tone: two clean rising electronic beeps through a small speaker, restrained.'},
 {group:'world-match-start',takes:1,seconds:1,max:.8,level:.16,text:'A single short military whistle blast, clear and firm, heard from a little way off.'},
 {group:'world-streak',takes:1,seconds:.6,max:.4,level:.14,text:'One clean low percussive metal hit with a bright short tail, like a small anvil struck once. Under 300 ms then silence.'},
 {group:'world-rank-up',takes:1,seconds:1.5,max:1.3,level:.15,text:'Three short ascending brass notes, a small restrained military fanfare, dry and short.'},
];
const take=(s,n,text=s.text)=>({id:`${s.group}-${n}`,sound:s,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:s.seconds,prompt_influence:.65,text:`${text} ${dry}`}});
// Unusable takes go here with one reworded replacement each. Their receipts stay in the cache.
// Near silent (peaks of .001 to .041), or the parachute wind, which swelled instead of holding steady.
const rejected=new Set(['world-aim-1','world-aim-2','world-dragon-drum-1','world-dragon-drum-2','world-scope-click-1','world-switch-click-1','world-switch-click-2','world-streak-1','world-inspect-1','world-brass-2','world-chute-wind-1','world-dragon-drum-3','world-switch-click-4']);
const named=group=>sounds.find(s=>s.group===group);
const replacements=[
 take(named('world-aim'),3,'Loud close: a rifle snapped up to the shoulder: one firm jacket sleeve rustle and a solid tap of a polymer stock on a vest. Clear, under 150 ms then silence.'),
 take(named('world-dragon-drum'),3,'Loud close: one hard strike on a large wooden barrel drum with a hide skin: a deep booming THUD with a short wooden resonance. Loud and clear. One beat only.'),
 take(named('world-dragon-drum'),4,'Loud close: a big festival drum hit hard once with a wooden stick: one deep powerful boom. Loud and clear. One beat only.'),
 take(named('world-scope-click'),3,'Loud close: one hard crisp mechanical click of a metal dial turning one notch. Clear and bright, under 60 ms then silence.'),
 take(named('world-switch-click'),3,'Loud close: one hard crisp plastic click of a push button switch. Clear and bright, under 60 ms then silence.'),
 take(named('world-switch-click'),4,'Loud close: one sharp snap of a small toggle switch flicked on. Clear and bright, under 60 ms then silence.'),
 take(named('world-streak'),2,'Loud close: a small steel anvil struck once with a hammer: one clean hard metal hit with a bright short ring. Clear and loud, under 300 ms then silence.'),
 take(named('world-inspect'),2,'Loud close: gloved hands turn a rifle over: a solid polymer tap, a loose metal sling swivel rattle and a palm sliding firmly along the handguard.'),
 take(named('world-chute-wind'),2,`Strong steady wind rushing past the ears during a parachute descent, with nylon fabric fluttering evenly overhead the whole time. ${steady}`),
];
const requests=[...sounds.flatMap(s=>Array.from({length:s.takes},(_,i)=>take(s,i+1))),...replacements].filter(r=>!rejected.has(r.id));
const estimate=Math.ceil(requests.reduce((sum,r)=>sum+r.request.duration_seconds*10,0));
const tooLong=requests.find(r=>r.request.text.length>450);if(tooLong)throw Error('Sound prompt exceeds 450 characters: '+tooLong.id);
if(estimate>950)throw Error('Invalid bounded sound batch.');
console.log(JSON.stringify({requests:requests.length,estimatedCredits:estimate}));
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);if(before.limit-before.used<estimate*2)throw Error('Insufficient included credits for the bounded batch.');
 await fs.mkdir(directory,{recursive:true});console.log(JSON.stringify({used:before.used,limit:before.limit}));
 try{for(const item of requests){const receipt=await once({directory,id:item.id,request:item.request,endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true});if(receipt.status!=='complete')console.log(JSON.stringify({id:item.id,status:receipt.status}));}}
 finally{const after=await usage(key).catch(()=>null);console.log(JSON.stringify({used:after?.used,observedCreditChange:after?after.used-before.used:null}));}
}
async function decode(file){const {stdout}=await run(ffmpeg,['-v','error','-i',file,'-ac','1','-ar',String(RATE),'-f','f32le','-'],{encoding:'buffer',maxBuffer:1<<26});return new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength));}
function trimmed(pcm,peak,max){const start=Math.max(0,pcm.findIndex(x=>Math.abs(x)>peak*.16)-44);let end=pcm.length-1;while(end>start&&Math.abs(pcm[end])<peak*.003)end--;return pcm.slice(start,Math.min(end+1,start+Math.round(max*RATE)));}
export const LOOP_PAD=.12;
/** Folds the tail over the head so the loop has no seam, then repeats a little either side, because an MP3 decoder's start offset would otherwise open a gap. */
function looped(pcm){
 const skip=Math.round(.15*RATE),body=pcm.slice(skip,pcm.length-skip),fade=Math.round(.5*RATE),n=body.length-fade,pad=Math.round(LOOP_PAD*RATE),loop=new Float32Array(n);
 for(let i=0;i<n;i++){if(i<fade){const t=i/fade;loop[i]=body[i]*Math.sqrt(t)+body[n+i]*Math.sqrt(1-t);}else loop[i]=body[i];}
 const out=new Float32Array(n+pad*2);out.set(loop.slice(n-pad),0);out.set(loop,pad);out.set(loop.slice(0,pad),n+pad);return out;
}
async function prepare(clip,level,id,receipt,peak,groups,receipts,group,isLoop){
 let energy=0,rms=0,cp=0,loudestAt=0;
 for(let i=0;i<clip.length;i++){energy+=clip[i]**2-(i>=2205?clip[i-2205]**2:0);const now=Math.sqrt(Math.max(0,energy)/Math.min(i+1,2205));if(now>rms){rms=now;loudestAt=i;}cp=Math.max(cp,Math.abs(clip[i]));}
 const gain=Math.min(level/rms,.9/cp);for(let i=0;i<clip.length;i++)clip[i]*=gain*(isLoop?1:Math.min(1,i/22)*Math.min(1,(clip.length-1-i)/441));
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
  const pcm=await decode(source);let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));if(peak<.005){console.log('SILENT',item.id);continue;}
  await prepare(item.sound.loop?looped(pcm):trimmed(pcm,peak,item.sound.max),item.sound.level,item.id,receipt,peak,groups,receipts,item.sound.group,!!item.sound.loop);
 }
 await fs.mkdir(path.join(root,'src/audio/world'),{recursive:true});
 await writeJson(path.join(root,'src/audio/world/manifest.json'),{version:1,provider:'ElevenLabs',model:'eleven_text_to_sound_v3',processing:'44100 Hz mono, trimmed to 1 ms before the attack or folded into a padded seamless loop, loudness set per sound, 96 kbps MP3',loopPadSeconds:LOOP_PAD,groups,sources:receipts});
 for(const r of receipts)console.log(`${r.id.padEnd(26)} ${String(r.seconds).padEnd(6)} @${String(r.loudestAtMs).padEnd(5)} gain ${String(r.gain).padEnd(7)} srcPeak ${r.sourcePeak}`);
}
