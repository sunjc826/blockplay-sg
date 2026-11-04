// Main menu music in a 2000s action shooter style. Lists the batch by default; --generate spends credits through
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
];
const requests=takes.map(t=>({id:t.id,request:{model_id:'music_v2_5',prompt:t.prompt,music_length_ms:SECONDS*1000,force_instrumental:true}}));
console.log(JSON.stringify({requests:requests.length,minutes:requests.length*SECONDS/60,ids:requests.map(r=>r.id)}));

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
 const hash=b=>createHash('sha256').update(b).digest('hex'),RATE=44100;
 // 128 BPM makes 60 s exactly 32 bars. The take does not repeat literally, so a long crossfade would smear the drums:
 // the loop is a cut on the bar line, softened by folding the few milliseconds past the bar back over the start.
 const CHOSEN='hybrid-ops-1',PERIOD=60*RATE,MAX_FOLD=.03*RATE,MARGIN=Math.round(.25*RATE),TARGET_LUFS=-20;
 const receipt=JSON.parse(await fs.readFile(path.join(directory,CHOSEN+'.json'),'utf8'));
 if(receipt.status!=='complete')throw Error(CHOSEN+': incomplete paid request; inspect before any retry');
 const sourceFile=path.join(directory,CHOSEN+'.mp3'),source=await fs.readFile(sourceFile);
 if(hash(source)!==receipt.sha256)throw Error('Source checksum mismatch');
 const {stdout}=await run(ffmpeg,['-v','error','-i',sourceFile,'-ac','2','-ar',String(RATE),'-f','f32le','-'],{encoding:'buffer',maxBuffer:1<<28});
 const pcm=new Float32Array(stdout.buffer.slice(stdout.byteOffset,stdout.byteOffset+stdout.byteLength)),frames=pcm.length/2;
 if(frames<PERIOD)throw Error(`Take is ${frames/RATE}s, shorter than the loop.`);
 const fold=Math.floor(Math.min(frames-PERIOD,MAX_FOLD));
 const body=pcm.slice(0,PERIOD*2);
 for(let i=0;i<fold;i++){const t=(i+.5)/fold,fadeIn=Math.sin(t*Math.PI/2),fadeOut=Math.cos(t*Math.PI/2);for(let c=0;c<2;c++)body[i*2+c]=pcm[i*2+c]*fadeIn+pcm[(PERIOD+i)*2+c]*fadeOut;}
 // Margins repeat the loop on both sides, so a decoder's start offset moves both loop points without opening a gap.
 const laid=new Float32Array((PERIOD+MARGIN*2)*2);
 laid.set(body.subarray((PERIOD-MARGIN)*2),0);laid.set(body,MARGIN*2);laid.set(body.subarray(0,MARGIN*2),(MARGIN+PERIOD)*2);
 const cache=path.join(directory,CHOSEN+'-loop.f32');await fs.writeFile(cache,Buffer.from(laid.buffer));
 const pcmIn=['-f','f32le','-ar',String(RATE),'-ac','2','-i',cache];
 const measured=await run(ffmpeg,['-hide_banner',...pcmIn,'-af','ebur128','-f','null','-'],{maxBuffer:1<<26});
 const lufs=[...measured.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].at(-1)?.[1];if(lufs===undefined)throw Error('Could not measure loudness.');
 const gainDb=Number((TARGET_LUFS-Number(lufs)).toFixed(1));
 const prepared=path.join(directory,CHOSEN+'-prepared.mp3');
 await run(ffmpeg,['-v','error','-y',...pcmIn,'-af',`volume=${gainDb}dB`,'-c:a','libmp3lame','-b:a','160k',prepared]);
 const bytes=await fs.readFile(prepared),sha256=hash(bytes),file=`menu-hybrid-ops-${sha256.slice(0,10)}.mp3`;
 const output=path.join(root,'public/audio/music');await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,file),bytes);
 await fs.mkdir(path.join(root,'src/audio/music'),{recursive:true});
 const manifest={provider:'ElevenLabs',model:'music_v2_5',processing:`32 bars at 128 BPM, ${Math.round(fold/RATE*1000)} ms fold at the loop, ${MARGIN/RATE} s repeated margins, ${gainDb} dB to ${TARGET_LUFS} LUFS, 160 kbps stereo MP3`,tracks:{menu:{file,sha256,source:CHOSEN,sourceSha256:receipt.sha256,loopStart:MARGIN/RATE,loopEnd:(MARGIN+PERIOD)/RATE}}};
 await fs.writeFile(path.join(root,'src/audio/music/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Ten seconds either side of the seam, cut from the file the game loads, to judge the loop by ear.
 const preview=path.join(directory,'menu-loop-seam-preview.mp3');
 await run(ffmpeg,['-v','error','-y','-i',path.join(output,file),'-filter_complex',`[0:a]atrim=${manifest.tracks.menu.loopEnd-10}:${manifest.tracks.menu.loopEnd},asetpts=N/SR/TB[a];[0:a]atrim=${manifest.tracks.menu.loopStart}:${manifest.tracks.menu.loopStart+10},asetpts=N/SR/TB[b];[a][b]concat=n=2:v=0:a=1[out]`,'-map','[out]','-b:a','160k',preview]);
 console.log(JSON.stringify({file,bytes:bytes.length,sourceLufs:Number(lufs),gainDb,foldMs:Math.round(fold/RATE*1000),preview:path.relative(root,preview)}));
}
