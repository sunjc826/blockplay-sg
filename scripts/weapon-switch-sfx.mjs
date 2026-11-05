// Weapon switch sounds, timed to weaponSwitchFrame: stow and draw per carry class, the hand landing per receiver, and a
// launcher mode selector. Lists the batch by default; --generate spends credits through cached once-only ElevenLabs
// receipts and never retries a paid attempt; --publish prepares completed recordings offline.
// node --experimental-strip-types --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/weapon-switch-sfx.mjs --generate
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cache/weapon-switch-sfx');
const output=path.join(root,'public/audio/switch'),run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
const hash=b=>createHash('sha256').update(b).digest('hex');
const writeJson=(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const dry='Close-up first-person foley, dry, immediate onset, no room reverb, no gunshot, no magazine or reload, no music, no voice.';
// `max` is the longest the game plays, shorter than the beat it goes with; `level` is the loudest 50 ms in linear RMS.
const handling=[
 {group:'switch-stow-holster',takes:2,seconds:.5,max:.3,level:.12,text:'A compact polymer pistol pushed down into a rigid kydex belt holster: a short plastic slide ending in one crisp retention click. One quick movement.'},
 {group:'switch-draw-holster',takes:2,seconds:.5,max:.26,level:.12,text:'A compact pistol snapped up out of a rigid kydex belt holster: one crisp retention click release and a quick plastic slide. One quick movement.'},
 {group:'switch-stow-rifle-sling',takes:2,seconds:.6,max:.42,level:.13,text:'An assault rifle swung down to hang on its nylon two-point sling against the body: a quick webbing rustle, a light sling swivel jingle and a soft polymer tap on a vest. One movement.'},
 {group:'switch-draw-rifle-sling',takes:2,seconds:.6,max:.34,level:.13,text:'An assault rifle swung up off its nylon sling into the hands: a fast jacket sleeve rustle, taut webbing snap and a small sling swivel clink. One movement.'},
 {group:'switch-stow-support-sling',takes:2,seconds:.8,max:.56,level:.15,text:'A heavy steel machine gun lowered onto a wide padded sling at the side: slow heavy webbing creak, a dull weighty bump against gear and a short rattle of sling hardware. One movement.'},
 {group:'switch-draw-support-sling',takes:2,seconds:.8,max:.44,level:.15,text:'A heavy steel machine gun heaved up off a wide padded sling: a strong effortful webbing creak, heavy cloth pull and a low clunk of steel hardware. One movement.'},
 {group:'switch-stow-back-sling',takes:2,seconds:.8,max:.54,level:.14,text:'A long precision rifle slung over the shoulder onto the back: a long nylon strap slide over a jacket and a dull knock of the stock against a pack. One movement.'},
 {group:'switch-draw-back-sling',takes:2,seconds:.8,max:.44,level:.14,text:'A long precision rifle pulled from across the back over the shoulder: a long fast strap slide over a jacket and a firm hand catching the stock. One movement.'},
];
const receivers={
 pistol:['HK P30 compact 9mm pistol with a polymer grip and light steel slide',.16,'A second hand closes around the grip: one small dry polymer tap with the faintest steel slide rattle'],
 bullpup:['SAR 21 bullpup rifle with a hollow polymer stock',.2,'A palm slaps onto the handguard as the rifle comes up: one hollow plastic pat and a tiny loose metal tick'],
 carbine:['XM8 lightweight polymer carbine with a compact plastic receiver',.18,'A palm lands on the handguard as the carbine comes up: one light tight plastic pat and a tiny metal tick'],
 rifle:['G36 polymer assault rifle with a steel bolt carrier',.2,'A palm slaps onto the handguard as the rifle comes up: one firm polymer pat and a short small steel rattle inside the receiver'],
 drum:['Ultimax light machine gun with a large hollow ammunition drum',.24,'A hand grips the foregrip as the gun comes up: a firm thud and the loaded drum shifts with a hollow metal cartridge rattle'],
 'light-belt':['MG4 belt-fed 5.56mm light machine gun',.24,'A hand grips the gun as it comes up: a firm steel-and-polymer thud and a short jingle of a hanging ammunition belt'],
 belt:['FN MAG belt-fed 7.62mm machine gun with a substantial steel receiver',.27,'A hand grips the heavy gun as it comes up: a solid steel thud and a dense jingle of a hanging ammunition belt'],
 'heavy-belt':['CIS 50MG belt-fed .50 calibre heavy machine gun with a massive steel receiver',.3,'Hands take the weight of the massive gun: a deep steel clunk and a slow heavy jingle of big ammunition links'],
 oicw:['XM29 OICW-style bulky polymer rifle with an electronic sight housing',.2,'A palm lands on the bulky housing as the rifle comes up: one dense hollow polymer thump and a tiny metal tick'],
 intervention:['M200 Intervention heavy bolt-action sniper rifle with a long steel chassis',.24,'A palm lands on the long steel forend as the rifle comes up: one dense metallic pat and a very faint bolt handle rattle'],
};
const settles=Object.entries(receivers).map(([name,[weapon,level,action]])=>({group:`switch-settle-${name}`,takes:1,seconds:.5,max:.25,level,text:`${weapon}. ${action}. Under 200 ms then silence.`}));
const mode={group:'switch-mode',takes:2,seconds:.5,max:.16,level:.16,text:'A steel fire selector lever on a rifle thumbed over from one detent to the next: one short firm double-detent click. Under 120 ms then silence.'};
const sounds=[...handling,...settles,mode];
const take=(s,n,text=s.text)=>({id:`${s.group}-${n}`,sound:s,request:{model_id:'eleven_text_to_sound_v3',duration_seconds:s.seconds,prompt_influence:.65,text:`${text} ${dry}`}});
// Five came back near silent (peaks of -42 to -31 dB), one was a quiet swell peaking 423 ms in, one a 27 ms blip, and the
// bullpup's first replacement was near silent too. Their receipts stay in the cache; each has one reworded replacement below.
// The launcher's two near-silent takes were dropped altogether: it is the same gun as its rifle, so it shares that sound.
const rejected=new Set(['switch-settle-bullpup-1','switch-settle-bullpup-2','switch-settle-carbine-1','switch-settle-heavy-belt-1','switch-settle-oicw-1','switch-stow-back-sling-2','switch-draw-back-sling-1']);
const named=group=>sounds.find(s=>s.group===group);
const replacements=[
 take(named('switch-settle-bullpup'),3,'A hand grabs a plastic bullpup assault rifle hard. Loud close impact: one solid slap of a palm on a hard polymer rifle body with a firm metallic clack from inside. Loud and punchy, under 200 ms then silence.'),
 take(named('switch-settle-carbine'),2,'XM8 lightweight polymer carbine. A hand slaps hard onto the compact plastic handguard: one loud tight plastic smack and a bright metal tick. Clear and loud, under 200 ms then silence.'),
 take(named('switch-settle-heavy-belt'),2,'Massive .50 calibre steel heavy machine gun. Hands grab the receiver hard: one loud deep steel clunk and a heavy jingle of big ammunition links. Clear and loud, under 300 ms then silence.'),
 take(named('switch-settle-oicw'),2,'Bulky polymer rifle with an electronic sight housing. A hand slaps hard onto the housing: one loud dense hollow polymer smack and a bright metal tick. Clear and loud, under 200 ms then silence.'),
 take(named('switch-stow-back-sling'),3,'Loud close: a long rifle thrown over the shoulder onto the back: a strong fast nylon strap slide over a jacket ending in a solid knock of the stock against a pack. Starts immediately. One movement.'),
 take(named('switch-draw-back-sling'),3,'Loud close: a long rifle hauled off the back over the shoulder: a strong fast nylon strap slide over a jacket, 300 ms long, ending in a firm slap of a hand catching the stock. One movement.'),
];
const requests=[...sounds.flatMap(s=>Array.from({length:s.takes},(_,i)=>take(s,i+1))).filter(r=>!rejected.has(r.id)),...replacements];
const estimate=Math.ceil(requests.reduce((sum,r)=>sum+r.request.duration_seconds*10,0));
const tooLong=requests.find(r=>r.request.text.length>450);if(tooLong)throw Error('Sound prompt exceeds 450 characters: '+tooLong.id);
if(estimate>220)throw Error('Invalid bounded sound batch.');
console.log(JSON.stringify({requests:requests.length,estimatedCredits:estimate}));
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);if(before.limit-before.used<estimate*2)throw Error('Insufficient included credits for the bounded batch.');
 await fs.mkdir(directory,{recursive:true});await writeJson(path.join(directory,`usage-before-${Date.now()}.json`),before);console.log(JSON.stringify({used:before.used,limit:before.limit}));
 try{for(const item of requests){const receipt=await once({directory,id:item.id,request:item.request,endpoint:'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',key,binary:true});console.log(JSON.stringify({id:item.id,status:receipt.status}));}}
 finally{const after=await usage(key).catch(()=>null);await writeJson(path.join(directory,`usage-after-${Date.now()}.json`),after);console.log(JSON.stringify({used:after?.used,observedCreditChange:after?after.used-before.used:null}));}
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
 await fs.mkdir(path.join(root,'src/audio/switch'),{recursive:true});
 await writeJson(path.join(root,'src/audio/switch/manifest.json'),{version:1,provider:'ElevenLabs',model:'eleven_text_to_sound_v3',processing:'44100 Hz mono, trimmed to 1 ms before the attack, loudness set per sound, 96 kbps MP3',groups,sources:receipts});
 for(const r of receipts)console.log(`${r.id} ${r.seconds}s loudest@${r.loudestAtMs}ms gain ${r.gain} sourcePeak ${r.sourcePeak}`);
}
