// Vite + isolated Chrome with --autoplay-policy=no-user-gesture-required. No paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5193';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9253';
const output = new URL('../.cache/flyby-weight/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0, paidRequests = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /elevenlabs\.io/.test(m.params.request.url)) paidRequests++;
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 45000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.playedSfx=[]; window.sfxLabels=new WeakMap();
    const fetchOriginal=window.fetch; window.fetch=async (...args)=>{
      const response=await fetchOriginal(...args), url=String(args[0]);
      if(url.includes('/audio/sfx/')){const original=response.arrayBuffer.bind(response);response.arrayBuffer=async()=>{const data=await original();window.sfxLabels.set(data,url);return data;};}return response;
    };
    const decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=async function(data){const buffer=await decode.call(this,data);const url=window.sfxLabels.get(data);if(url)window.sfxLabels.set(buffer,url);return buffer;};
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){const url=window.sfxLabels.get(this.buffer);if(url)window.playedSfx.push({url,at:args[0]||this.context.currentTime});return start.apply(this,args);};
  ` });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html?combat=1' });
  await wait("window.hud?.phase==='ready'");
  await evaluate('window.engine.startPilot()');
  await wait("window.hud?.phase==='playing'");
  await wait("window.playedSfx.some(s=>s.url.includes('/bullet-pass-'))", 90000);
  const enginePasses=await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-'))");
  await evaluate('window.engine.pause()');
  const paused=await evaluate('window.playedSfx.length');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await evaluate('window.playedSfx.length'),paused);
  const rendered=await evaluate(`(async()=>{
    const {createSfxBank}=await import('/src/game/sfx-bank.ts');
    const {createBulletFlybyAudio}=await import('/src/game/bullet-flyby-audio.ts');
    const {impactProfile}=await import('/src/game/fps-impact-profile.ts');
    const {createGunshotAudio,gunshotTone}=await import('/src/game/gunshot-audio.ts');
    const context=new AudioContext(),bank=createSfxBank();bank.load(context);
    const until=performance.now()+20000;
    while(!bank.get('bullet-pass',1)||!bank.get('bullet-air')||!bank.get('rifle-556',2)){if(performance.now()>until)throw Error('Pass samples did not decode');await new Promise(r=>setTimeout(r,40));}
    const burstContext=new OfflineAudioContext(2,44100,44100);
    Object.defineProperty(burstContext,'state',{get:()=> 'running'});
    const gunshots=createGunshotAudio(()=>burstContext,()=>false,bank);
    for(const after of [0,.1,.2,.3])gunshots.fire(gunshotTone(5.56,36,0,true),0,after);
    const burst=(await burstContext.startRendering()).getChannelData(0);gunshots.dispose();
    const results=[];window.crackPreviews=[];
    for(const [weapon,calibre,power] of [['pistol',9,24],['rifle',5.56,36],['gpmg',7.62,65],['heavy',12.7,145]])
    for(let take=0;take<2;take++)for(const distance of [.5,3,8,15,18]){
      const offline=new OfflineAudioContext(2,44100,44100);
      Object.defineProperty(offline,'state',{get:()=> 'running'});
      const audio=createBulletFlybyAudio(()=>offline,()=>false,{pick:group=>bank.get(group,take)});
      const round={},from={x:distance,y:1.75,z:-10},to={x:distance,y:1.75,z:10},ear={x:0,y:1.75,z:0};
      const profile=impactProfile(calibre,power);
      audio.pass(round,from,to,ear,495,()=>-.75,0,profile);audio.pass(round,from,to,ear,495,()=>-.75,0,profile);
      const rendered=await offline.startRendering();let peak=0,mixedPeak=0,leftEnergy=0,rightEnergy=0,first=-1;
      const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
      for(let i=0;i<left.length;i++){peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));mixedPeak=Math.max(mixedPeak,Math.abs(left[i]+burst[i]),Math.abs(right[i]+burst[i]));leftEnergy+=left[i]**2;rightEnergy+=right[i]**2;if(first<0&&Math.abs(left[i])>.001)first=i;}
      if(weapon==='rifle'&&distance===.5){const frames=Math.round(44100*.35),bytes=new Uint8Array(frames*4),view=new DataView(bytes.buffer);for(let i=0;i<frames;i++)for(let c=0;c<2;c++){const j=i-Math.round(44100*.1),v=j>=0?(c?right[j]:left[j]):0;view.setInt16(i*4+c*2,Math.round(Math.max(-1,Math.min(1,v||0))*32767),true);}let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));window.crackPreviews.push(btoa(binary));}
      results.push({weapon,take,distance,peak,mixedPeak,leftEnergy,rightEnergy,firstMs:first/44.1});audio.dispose();
    }
    bank.dispose();await context.close();return results;
  })()`);
  for(const weapon of ['pistol','rifle','gpmg','heavy'])for(let take=0;take<2;take++){
    const rows=rendered.filter(r=>r.weapon===weapon&&r.take===take);
    assert(rows[0].peak>.1&&rows[0].peak<.9,'Close crack is clear and unclipped');
    for(let i=0;i<rows.length-1;i++){
      assert(rows[i].mixedPeak<.95,'Pass plus automatic gunfire retains headroom');
      assert(rows[i].peak>rows[i+1].peak,'Pass attenuates with lateral proximity');
      assert(rows[i].leftEnergy>rows[i].rightEnergy*4,'Pass is spatially panned');
      assert(rows[i].firstMs>rows[i].distance/343*1000,'Onset follows path sound travel');
      assert(rows[i].firstMs<rows[i].distance/343*1000+15,'Crack has prompt attack');
    }
    assert.equal(rows.at(-1).peak,0,'No pass at range boundary');
  }
  for(let take=0;take<2;take++){
    const peak=weapon=>rendered.find(r=>r.weapon===weapon&&r.take===take&&r.distance===3).peak;
    assert(peak('heavy')>peak('rifle')*1.7,'Heavy crack is stronger than rifle at identical proximity');
    assert(peak('gpmg')>peak('rifle'),'GPMG crack scales up');
    assert(peak('pistol')<peak('rifle'),'Pistol crack scales down');
  }
  const previews=await evaluate('window.crackPreviews');const pcm=Buffer.concat(previews.map(p=>Buffer.from(p,'base64'))),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(44100,24);header.writeUInt32LE(176400,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);await fs.writeFile(new URL('pass-by-replacement.wav',output),Buffer.concat([header,pcm]));
  assert.deepEqual(errors,[]);assert.equal(paidRequests,0);
  await fs.writeFile(new URL('flyby-browser-results.json',output),JSON.stringify({enginePasses,rendered,errors,paidRequests},null,2));
  console.log('PASS actual-engine counter-fire crack/echo, pause, both recorded takes and four weapon profiles at .5/3/8/15/18 m, calibre/power scaling and gunfire headroom, proximity attenuation, sharp attack, spatial panning, no clipping, errors or paid playback requests.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
