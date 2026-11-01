// Vite + isolated Chrome with --autoplay-policy=no-user-gesture-required. No paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5193';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9253';
const output = new URL('../.cache/impact-audio/', import.meta.url);
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
  await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html' });
  await wait("window.hud?.phase==='ready'");
  await evaluate('window.engine.startPilot()'); await wait("window.hud?.phase==='playing'");
  await evaluate("window.control='hunt'");
  await wait("window.playedSfx.some(s=>s.url.includes('/impact-metal-'))", 90000);
  const engineHits = await evaluate("({hits:window.hud.hits,impacts:window.playedSfx.filter(s=>s.url.includes('/impact-'))})");
  await evaluate('window.engine.pause()');
  const paused = await evaluate('window.playedSfx.length');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await evaluate('window.playedSfx.length'), paused, 'Pause schedules no further takes');
  const rendered = await evaluate(`(async()=>{
    const {createSfxBank}=await import('/src/game/sfx-bank.ts');
    const {createImpactAudio}=await import('/src/game/impact-audio.ts');
    const {createGunshotAudio,gunshotTone}=await import('/src/game/gunshot-audio.ts');
    const {impactProfile}=await import('/src/game/fps-impact-profile.ts');
    const {combatOutput}=await import('/src/game/combat-output.ts');
    const context=new AudioContext(), bank=createSfxBank();bank.load(context);
    const surfaces=['concrete','metal','wood','glass','foliage','dirt','flesh','water'];
    const until=performance.now()+20000;
    while(!surfaces.every(s=>bank.get('impact-'+s,1))||!['rifle-556','pistol-9','mg-762','hmg-127'].every(s=>bank.get(s,2))){if(performance.now()>until)throw Error('Impact/gunshot samples did not decode');await new Promise(r=>setTimeout(r,40));}
    // Render the actual gunshot bus too: isolated near-field non-silence did
    // not catch impacts disappearing under sustained fire at combat range.
    // Fixed variation makes the overlapping waveforms reproducible.
    const random=Math.random;Math.random=()=>.5;
    const result=[];
    for(const [weapon,calibre,power] of [['rifle',5.56,36],['pistol',9,24],['gpmg',7.62,65],['heavy',12.7,145]]){
    const profile=impactProfile(calibre,power);
    const burstContext=new OfflineAudioContext(2,88200,44100);
    Object.defineProperty(burstContext,'state',{get:()=> 'running'});
    const gunshots=createGunshotAudio(()=>burstContext,()=>false,bank);
    for(const after of [0,.1,.2,.3])gunshots.fire(gunshotTone(calibre,power,0,true),0,after);
    const burst=(await burstContext.startRendering()).getChannelData(0);gunshots.dispose();
    for(const surface of surfaces)for(let take=0;take<2;take++)for(const distance of [3,25,50,80]){
      const offline=new OfflineAudioContext(2,44100,44100);
      Object.defineProperty(offline,'state',{get:()=> 'running'});
      const audio=createImpactAudio(()=>offline,()=>false,{pick:group=>bank.get(group,take)});
      audio.hit(surface,distance,distance===3?-.75:0,1,profile);const buffer=await offline.startRendering();
      const left=buffer.getChannelData(0),right=buffer.getChannelData(1);let energy=0,rightEnergy=0,peak=0,first=-1,attackPeak=0,gunPeak=0,mixedPeak=0;
      const from=Math.floor(distance/343*44100),to=from+2205;
      for(let i=0;i<left.length;i++){
        energy+=left[i]**2;rightEnergy+=right[i]**2;peak=Math.max(peak,Math.abs(left[i]));if(first<0&&Math.abs(left[i])>.001)first=i;
        mixedPeak=Math.max(mixedPeak,Math.abs(left[i]+burst[i]));
        if(i>=from&&i<to){attackPeak=Math.max(attackPeak,Math.abs(left[i]));gunPeak=Math.max(gunPeak,Math.abs(burst[i]));}
      }
      const mixedContext=new OfflineAudioContext(2,44100,44100);Object.defineProperty(mixedContext,'state',{get:()=> 'running'});
      const mixedGuns=createGunshotAudio(()=>mixedContext,()=>false,bank,combatOutput),mixedImpacts=createImpactAudio(()=>mixedContext,()=>false,{pick:group=>bank.get(group,take)},combatOutput);
      for(const after of [0,.1,.2,.3])mixedGuns.fire(gunshotTone(calibre,power,0,true),0,after);
      mixedImpacts.hit(surface,distance,distance===3?-.75:0,1,profile);
      const mixedBuffer=await mixedContext.startRendering();mixedPeak=0;for(let c=0;c<2;c++)for(const v of mixedBuffer.getChannelData(c))mixedPeak=Math.max(mixedPeak,Math.abs(v));mixedGuns.dispose();mixedImpacts.dispose();
      result.push({weapon,surface,take,distance,peak,attackPeak,gunPeak,mixedPeak,attackRelativeDb:20*Math.log10(attackPeak/gunPeak),rms:Math.sqrt(energy/left.length),leftEnergy:energy,rightEnergy,firstMs:first/44.1});audio.dispose();
    }
    }
    Math.random=random;bank.dispose();await context.close();return result;
  })()`);
  await fs.writeFile(new URL('renders.json', output), JSON.stringify(rendered, null, 2));
  for (const take of rendered) {
    assert(take.peak > .003 && take.mixedPeak < .95, `${take.weapon} ${take.surface} at ${take.distance} m: non-silent and mixed burst does not clip`);
    if (take.distance === 3) {
      assert(take.leftEnergy > take.rightEnergy * 4, `${take.surface}: panned from the hit`);
      assert(take.firstMs > 7 && take.firstMs < 25, `${take.surface}: onset follows only the 3 m sound delay`);
    }
    if (take.distance === 25) {
      assert(take.attackPeak > .03, `${take.surface} take ${take.take}: combat-range transient has useful output level`);
    }
    if(take.distance===50){
      const nearer=rendered.find(r=>r.weapon===take.weapon&&r.surface===take.surface&&r.take===take.take&&r.distance===25);
      assert(take.attackPeak<nearer.attackPeak*.65,'Doubling impact distance substantially reduces the transient');
    }
  }
  assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ engineHits, rendered, paidRequests, errors }, null, 2));
  console.log('PASS actual-engine target impacts; all 16 takes at 3/25/50/80 m for pistol/rifle/GPMG/heavy profiles, inverse-distance attenuation and shared combat mix against automatic gunfire, unclipped mixed bursts, panning, onset, pause and zero ElevenLabs requests.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
