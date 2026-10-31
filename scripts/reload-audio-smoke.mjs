// Vite + isolated Chrome, --autoplay-policy=no-user-gesture-required. No paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5197';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9267';
const output = new URL('../.cache/reload-audio-work/', import.meta.url);
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
  const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 120000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.playedReloads=[];
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(this.buffer?.reloadLabel)window.playedReloads.push({label:this.buffer.reloadLabel,rate:this.playbackRate.value,at:this.context.currentTime});
      return start.apply(this,args);
    };
    const fetchOriginal=window.fetch, labels=new WeakMap();
    window.fetch=async (...args)=>{const r=await fetchOriginal(...args),url=String(args[0]);if(url.includes('/audio/reload/')){const read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();labels.set(b,url);return b;};}return r;};
    const decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=async function(data){const b=await decode.call(this,data);if(labels.has(data))b.reloadLabel=labels.get(data);return b;};
  ` });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/reload-audio.html' });
  await wait("document.readyState==='complete'");
  const rendered = await evaluate(`(async()=>{
    const {createSfxBank}=await import('/src/game/sfx-bank.ts');
    const {createReloadAudio,reloadSample}=await import('/src/game/reload-audio.ts');
    const {FPS_WEAPONS}=await import('/src/game/fps-rules.ts');
    const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');
    const profile=createProfile();profile.guns[1].variant='ult-kongsi';
    const weapons=[...FPS_WEAPONS,resolveLoadout(profile).weapons[1]],stages=['MAG OUT','MAG IN','SEAT MAG','BOLT BACK','CHAMBER'];
    const bank=createSfxBank(),context=new AudioContext();bank.load(context);
    const until=performance.now()+60000;
    while(!weapons.every(w=>stages.every(s=>bank.pick(reloadSample(w,s))))){if(performance.now()>until)throw Error('Reload recordings did not decode');await new Promise(r=>setTimeout(r,50));}
    window.reloadBank=bank;window.reloadWeapons=weapons;window.reloadStages=stages;
    const result=[];
    for(const [i,w] of weapons.entries())for(const stage of stages){
      const offline=new OfflineAudioContext(1,22050,44100);Object.defineProperty(offline,'state',{get:()=> 'running'});
      const audio=createReloadAudio(()=>offline,()=>false,bank);audio.play(w,stage);const buffer=await offline.startRendering(),pcm=buffer.getChannelData(0);
      let peak=0,energy=0,first=-1,last=-1;
      for(let k=0;k<pcm.length;k++){peak=Math.max(peak,Math.abs(pcm[k]));energy+=pcm[k]**2;if(Math.abs(pcm[k])>.001){if(first<0)first=k;last=k;}}
      result.push({weapon:w.name,stage,sample:reloadSample(w,stage),peak,rms:Math.sqrt(energy/pcm.length),firstMs:first/44.1,lastMs:last/44.1});audio.dispose();
    }
    await context.close();return result;
  })()`);
  for (const clip of rendered) {
    assert(clip.peak > .005 && clip.peak < .95, `${clip.weapon}/${clip.stage}: audible with headroom`);
    assert(clip.firstMs >= 0 && clip.firstMs < 30, `${clip.weapon}/${clip.stage}: prompt onset`);
    assert(clip.lastMs < 460, `${clip.weapon}/${clip.stage}: compact action`);
  }
  // Offline audition uses the same player and normalized stage times as the engine.
  const previews = [];
  for (let index = 0; index < 9; index++) {
    const preview = await evaluate(`(async()=>{
      const {createReloadAudio}=await import('/src/game/reload-audio.ts');
      const w=window.reloadWeapons[${index}],length=w.reload*1.42+.5,offline=new OfflineAudioContext(1,Math.ceil(length*22050),22050);let at=0;
      Object.defineProperty(offline,'state',{get:()=> 'running'});Object.defineProperty(offline,'currentTime',{get:()=>at});
      const audio=createReloadAudio(()=>offline,()=>false,window.reloadBank);
      for(const [i,time] of [.16,.47,.74,.94,1.16].entries()){at=time*w.reload;audio.play(w,window.reloadStages[i]);}
      const buffer=await offline.startRendering(),pcm=buffer.getChannelData(0),bytes=new Uint8Array(44+pcm.length*2),v=new DataView(bytes.buffer);
      const word=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};word(0,'RIFF');v.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,22050,true);v.setUint32(28,44100,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,pcm.length*2,true);
      for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      audio.dispose();return {name:w.name,wav:btoa(binary)};
    })()`);
    const file = `reload-${index}.wav`; await fs.writeFile(new URL(file, output), Buffer.from(preview.wav, 'base64'));
    previews.push({ name: preview.name, file });
  }
  await fs.writeFile(new URL('render-results.json', output), JSON.stringify(rendered, null, 2));
  await fs.writeFile(new URL('audition.html', output), `<!doctype html><meta charset="utf-8"><title>Weapon reloads</title><style>body{background:#17221c;color:#f3ead9;max-width:750px;margin:40px auto;font:16px system-ui}section{padding:12px;border-bottom:1px solid #586456}audio{width:100%}</style><h1>Weapon reloads · ElevenLabs</h1><p>Empty reloads at actual weapon timings. Original action speed.</p>${previews.map(p=>`<section><h2>${p.name}</h2><audio controls src="${p.file}"></audio></section>`).join('')}`);
  console.log('PASS browser rendering of 40 recorded actions plus Kongsi.');
  if (!process.argv.includes('--audio-only')) {
  // Real engine: tactical reload, interruption, empty reload, and sidearm switch.
  await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html' });
  await wait("window.hud?.phase==='ready'");
  await evaluate("window.engine.startPilot();window.action={fire:true}");
  await wait('window.hud.magazine<29');
  await evaluate('window.action={};window.engine.reload()');
  await wait("window.playedReloads.some(s=>s.label.includes('reload-bullpup-seat'))");
  await wait('window.hud.reloading===0');
  await evaluate('window.action={fire:true}'); await wait('window.hud.magazine===0');
  await evaluate('window.action={};window.engine.reload()');
  await wait("window.playedReloads.some(s=>s.label.includes('reload-bullpup-release'))");
  await wait('window.hud.reloading===0');
  await evaluate('window.engine.switchWeapon(2);window.action={fire:true}'); await wait('window.hud.weapon===2 && window.hud.magazine<15');
  await evaluate('window.action={};window.engine.reload()');
  await wait("window.playedReloads.some(s=>s.label.includes('reload-pistol-out'))");
  await evaluate('window.engine.switchWeapon(0);window.engine.pause()');
  const count = await evaluate('window.playedReloads.length');
  await new Promise(r => setTimeout(r, 700));
  assert.equal(await evaluate('window.playedReloads.length'), count, 'No new reload sound after switch/pause');
  const engine = await evaluate('window.playedReloads'); assert(engine.every(s => s.rate === 1));
  assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify({ rendered, engine, paidRequests, errors }, null, 2));
  console.log('PASS 40 ElevenLabs actions plus Kongsi routing: decode/render, headroom, onset, natural speed; real-engine tactical/empty/sidearm reloads and switch/pause; no paid requests.');
  }
  assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
