// Menu and deployment music in a 2000s action shooter style. Lists the batch by default; --generate spends credits through
// cached once-only ElevenLabs receipts and never retries a paid attempt; --publish prepares the chosen take offline.
// Auditions stay in .cache until one is published.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once,usage} from './encik-batch.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cache/music-menu');
const endpoint='https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128';
const SECONDS=60;
const takes=[
 {id:'big-beat-assault-1',prompt:'Instrumental 2000s action shooter main menu theme, 138 BPM, E minor. Starts immediately with a heavy breakbeat, a punchy distorted electric guitar riff, gritty acid synth bass and stabbing brass samples. Metallic gamelan-style bells double the short, catchy main riff. Energetic, swaggering and fun, with a big hook in the first few bars. Tight, loud early-2000s production, sustained energy with no breakdown or ending, suitable for looping.'},
 {id:'hybrid-ops-1',prompt:'Instrumental 2000s military shooter main menu theme, 128 BPM, D minor. Driving rock drum kit layered with big taiko hits, chugging palm-muted electric guitars, fast staccato strings, bold brass carrying a short heroic theme, pulsing electronic arpeggio, metallic bell accents. Urgent and exciting, with a strong hook right away. Sustained energy, no breakdown or ending, suitable for looping.'},
 {id:'drop-zone-1',prompt:'Instrumental 2000s nu-metal and industrial action game theme, 120 BPM, drop-tuned guitars in D minor. Heavy syncopated guitar chugs, tight hip-hop-influenced drums, turntable scratches, dark electronic bass, metallic percussion, short bell-like riff on top. Aggressive, bouncy and tongue-in-cheek, with an immediate hook. Sustained energy, no breakdown or ending, suitable for looping.'},
 {id:'map-select-1',seconds:60,prompt:'Instrumental 2000s military shooter mission select underscore, 128 BPM, D minor. Tight rock drum groove, low taiko pulse, palm-muted electric guitars on a repeating figure, pulsing electronic arpeggio, soft staccato strings, occasional metallic bell accents. No lead melody and no brass. Focused and purposeful, planning an operation. Moderate constant intensity, no breakdown or ending, suitable for looping.'},
 {id:'map-select-2',seconds:60,prompt:'Instrumental 2000s military shooter mission select underscore, 128 BPM, D minor. Tight rock drum groove, low taiko pulse, palm-muted electric guitars on a repeating figure, pulsing electronic arpeggio, soft staccato strings, occasional metallic bell accents. No lead melody and no brass. Focused and purposeful, planning an operation. Moderate constant intensity, no breakdown or ending, suitable for looping.'},
 {id:'spawn-select-1',seconds:60,prompt:'Instrumental 2000s military shooter deployment theme, 128 BPM, D minor. Urgent string ostinato, driving toms and big taiko hits, chugging palm-muted electric guitars, rhythmic electronic pulse like helicopter rotors, held brass swells that never resolve, metallic bell accents. Tense anticipation just before an insertion. High constant intensity, no breakdown or ending, suitable for looping.'},
 {id:'spawn-select-2',seconds:60,prompt:'Instrumental 2000s military shooter deployment theme, 128 BPM, D minor. Urgent string ostinato, driving toms and big taiko hits, chugging palm-muted electric guitars, rhythmic electronic pulse like helicopter rotors, held brass swells that never resolve, metallic bell accents. Tense anticipation just before an insertion. High constant intensity, no breakdown or ending, suitable for looping.'},
 {id:'descent-1',seconds:15,prompt:'Instrumental 2000s military shooter insertion cue, 128 BPM, D minor. Sparse rotor-like pulse and rising strings build steadily with growing drums and guitars into one massive low impact hit and brass stab at the very end. Cinematic and exciting, a single continuous build.'},
 {id:'descent-2',seconds:15,prompt:'Instrumental 2000s military shooter insertion cue, 128 BPM, D minor. Sparse rotor-like pulse and rising strings build steadily with growing drums and guitars into one massive low impact hit and brass stab at the very end. Cinematic and exciting, a single continuous build.'},
 {id:'match-win-1',seconds:5,prompt:'Instrumental 2000s military shooter victory stinger, 128 BPM, D major. A short triumphant brass and electric guitar fanfare over big drums and taiko, ending on one bold held chord that rings out.'},
 {id:'match-win-2',seconds:5,prompt:'Instrumental 2000s military shooter victory stinger, 128 BPM, D major. A short triumphant brass and electric guitar fanfare over big drums and taiko, ending on one bold held chord that rings out.'},
 {id:'match-lose-1',seconds:5,prompt:'Instrumental 2000s military shooter defeat stinger, 128 BPM, D minor. A short heavy falling brass phrase over low taiko and muted guitars, ending on one dark held chord that rings out.'},
 {id:'match-lose-2',seconds:5,prompt:'Instrumental 2000s military shooter defeat stinger, 128 BPM, D minor. A short heavy falling brass phrase over low taiko and muted guitars, ending on one dark held chord that rings out.'},
];
const requests=takes.map(t=>({id:t.id,request:{model_id:'music_v2_5',prompt:t.prompt,music_length_ms:(t.seconds??SECONDS)*1000,force_instrumental:true}}));
console.log(JSON.stringify({requests:requests.length,minutes:requests.reduce((sum,r)=>sum+r.request.music_length_ms,0)/60000,ids:requests.map(r=>r.id)}));

if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY;if(!key?.trim())throw Error('ELEVENLABS_API_KEY is not configured.');
 const before=await usage(key);await fs.mkdir(directory,{recursive:true});console.log(JSON.stringify({before}));
 try{
  for(const item of requests){
   const receipt=await once({directory,id:item.id,request:item.request,endpoint,key,binary:true});
   console.log(JSON.stringify({id:item.id,status:receipt.status,bytes:receipt.bytes,characterCost:receipt.characterCost}));
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
 finally{
  const after=await usage(key).catch(()=>null);
  await fs.writeFile(path.join(directory,'usage.json'),JSON.stringify({before,after},null,2)+'\n');
  console.log(JSON.stringify({after,observedCreditChange:after?after.used-before.used:null}));
 }
}

if(process.argv.includes('--publish')){
 const run=promisify(execFile),ffmpeg=process.env.FFMPEG??path.join(root,'promo/node_modules/ffmpeg-static/ffmpeg');
 const hash=b=>createHash('sha256').update(b).digest('hex'),RATE=44100,TARGET_LUFS=-20;
 // 128 BPM makes 60 s exactly 32 bars. These takes do not repeat literally, so a long crossfade would smear the drums:
 // a loop is a cut on the bar line, softened by folding the few milliseconds past the bar back over the start.
 const PERIOD=60*RATE,MAX_FOLD=.03*RATE,MARGIN=Math.round(.25*RATE);
 // `from` drops the descent's build-up: its impact at 10.8 s then lands 3 s in, with the camera (DEPLOYMENT_DESCENT).
 const chosen={menu:{take:'hybrid-ops-1',loop:true},map:{take:'map-select-1',loop:true},spawn:{take:'spawn-select-1',loop:true},descent:{take:'descent-2',from:7.8},win:{take:'match-win-2'},lose:{take:'match-lose-1'}};
 const output=path.join(root,'public/audio/music');await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
 const tracks={},report=[];
 for(const [cue,choice] of Object.entries(chosen)){
  const receipt=JSON.parse(await fs.readFile(path.join(directory,choice.take+'.json'),'utf8'));
  if(receipt.status!=='complete')throw Error(choice.take+': incomplete paid request; inspect before any retry');
  const sourceFile=path.join(directory,choice.take+'.mp3'),source=await fs.readFile(sourceFile);
  if(hash(source)!==receipt.sha256)throw Error(choice.take+': source checksum mismatch');
  const {stdout}=await run(ffmpeg,['-v','error',...(choice.from?['-ss',String(choice.from)]:[]),'-i',sourceFile,'-ac','2','-ar',String(RATE),'-f','f32le','-'],{encoding:'buffer',maxBuffer:1<<28});
  const pcm=new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength)),frames=pcm.length/2;
  let laid=pcm,loopPoints={},fold=0;
  if(choice.loop){
   if(frames<PERIOD)throw Error(`${choice.take} is ${frames/RATE}s, shorter than the loop.`);
   fold=Math.floor(Math.min(frames-PERIOD,MAX_FOLD));
   const body=pcm.slice(0,PERIOD*2);
   for(let i=0;i<fold;i++){const t=(i+.5)/fold,fadeIn=Math.sin(t*Math.PI/2),fadeOut=Math.cos(t*Math.PI/2);for(let c=0;c<2;c++)body[i*2+c]=pcm[i*2+c]*fadeIn+pcm[(PERIOD+i)*2+c]*fadeOut;}
   // Margins repeat the loop on both sides, so a decoder's start offset moves both loop points without opening a gap.
   laid=new Float32Array((PERIOD+MARGIN*2)*2);
   laid.set(body.subarray((PERIOD-MARGIN)*2),0);laid.set(body,MARGIN*2);laid.set(body.subarray(0,MARGIN*2),(MARGIN+PERIOD)*2);
   loopPoints={loopStart:MARGIN/RATE,loopEnd:(MARGIN+PERIOD)/RATE};
  }else if(choice.from){
   // A short fade so a cut made mid-note does not click.
   const fade=Math.round(.01*RATE);for(let i=0;i<fade;i++)for(let c=0;c<2;c++)laid[i*2+c]*=i/fade;
  }
  const cache=path.join(directory,cue+'-prepared.f32');await fs.writeFile(cache,Buffer.from(laid.buffer,laid.byteOffset,laid.byteLength));
  const pcmIn=['-f','f32le','-ar',String(RATE),'-ac','2','-i',cache];
  const measured=await run(ffmpeg,['-hide_banner',...pcmIn,'-af','ebur128','-f','null','-'],{maxBuffer:1<<26});
  const lufs=[...measured.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].at(-1)?.[1];if(lufs===undefined)throw Error('Could not measure loudness.');
  const gainDb=Number((TARGET_LUFS-Number(lufs)).toFixed(1));
  const prepared=path.join(directory,cue+'-prepared.mp3');
  await run(ffmpeg,['-v','error','-y',...pcmIn,'-af',`volume=${gainDb}dB`,'-c:a','libmp3lame','-b:a','160k',prepared]);
  const bytes=await fs.readFile(prepared),sha256=hash(bytes),file=`${cue}-${choice.take}-${sha256.slice(0,10)}.mp3`;await fs.writeFile(path.join(output,file),bytes);
  tracks[cue]={file,sha256,source:choice.take,sourceSha256:receipt.sha256,gainDb,...loopPoints,...(choice.from?{from:choice.from}:{})};
  report.push({cue,take:choice.take,kb:Math.round(bytes.length/1024),sourceLufs:Number(lufs),gainDb,...(choice.loop?{foldMs:Math.round(fold/RATE*1000)}:{})});
  if(choice.loop){
   // Ten seconds either side of the seam, cut from the file the game loads, to judge the loop by ear.
   const {loopStart,loopEnd}=loopPoints;
   await run(ffmpeg,['-v','error','-y','-i',path.join(output,file),'-filter_complex',`[0:a]atrim=${loopEnd-10}:${loopEnd},asetpts=N/SR/TB[a];[0:a]atrim=${loopStart}:${loopStart+10},asetpts=N/SR/TB[b];[a][b]concat=n=2:v=0:a=1[out]`,'-map','[out]','-b:a','160k',path.join(directory,`${cue}-loop-seam-preview.mp3`)]);
  }
 }
 await fs.mkdir(path.join(root,'src/audio/music'),{recursive:true});
 await fs.writeFile(path.join(root,'src/audio/music/manifest.json'),JSON.stringify({provider:'ElevenLabs',model:'music_v2_5',processing:`Loops are 32 bars at 128 BPM with a fold at the cut and ${MARGIN/RATE} s repeated margins. All are set to ${TARGET_LUFS} LUFS as 160 kbps stereo MP3`,tracks},null,2)+'\n');
 report.forEach(row=>console.log(JSON.stringify(row)));
}
