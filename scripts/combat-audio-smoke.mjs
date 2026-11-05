// A real 32-bot expedition with the pilot playing: how often enemy footsteps are heard, and which combat sounds reach the
// speakers. Needs Vite (FPS_APP_ORIGIN) and Chrome with remote debugging and --autoplay-policy=no-user-gesture-required
// (FPS_CHROME_ORIGIN). No paid requests. Measures signal: nobody hears it here. HMR is stubbed, so on a cold Vite cache
// open any page once first. COMBAT_AUDIO_ZONES and COMBAT_AUDIO_SECONDS pick the districts and the length of each.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5298', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9471';
const zones = (process.env.COMBAT_AUDIO_ZONES || 'queenstown,marina-bay').split(',').filter(zone => zone !== 'none'), seconds = Number(process.env.COMBAT_AUDIO_SECONDS || 60);
const output = new URL('../.cache/combat-audio/', import.meta.url); await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><style>body{margin:0}#world{width:100vw;height:100vh}</style><div id="world"></div><script type="module">
const {createFpsEngine}=await import('/src/game/fps-engine.ts');const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {createExpeditionLoot}=await import('/src/game/expedition-loot.ts');
window.load=async zone=>{window.engine?.dispose();document.querySelector('#world').replaceChildren();window.hud=null;const profile=createProfile();
 window.engine=createFpsEngine(document.querySelector('#world'),next=>{window.hud=next},{playerPilot:window.seek?{reset(){},decide(o){const self=hud?.arenaSelf,foes=(hud?.arena?.actors??[]).filter(a=>a.alive&&a.bot&&!a.vehicle&&a.faction!==self?.faction).map(a=>({a,d:Math.hypot(a.x-o.position.x,a.z-o.position.z)})).sort((p,q)=>p.d-q.d);const near=foes[0];if(!near)return{goal:'engage',status:'Seeking',action:{}};const yaw=Math.atan2(-(near.a.x-o.position.x),-(near.a.z-o.position.z)),ex=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw));return{goal:'engage',status:'Seeking',action:{lookX:-ex/.0023*.5,forward:near.d>9,backward:near.d<6,sprint:near.d>30}};}}:undefined,loadout:resolveLoadout(profile),expedition:{zone,battlefieldSize:32,profile,loot:createExpeditionLoot('combat-audio'),autoRespawn:true,onTravel(){},onEquipment(){},onVendorPurchase(){}}});
 const start=performance.now();while(hud?.phase!=='ready'){if(hud?.phase==='error'||performance.now()-start>90000)throw Error('Engine failed to load');await new Promise(r=>setTimeout(r,100));}
 document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));engine.chooseDeployment('entry');engine.start();};
window.fixtureReady=true;
</script>`);
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const delay = ms => new Promise(r => setTimeout(r, ms));
const wait = async (expression, timeout = 120000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error('Timed out: ' + expression); };
const reports = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol)};Stub.prototype=Real.prototype;Stub.OPEN=Real.OPEN;Stub.CLOSED=Real.CLOSED;window.WebSocket=Stub;}
    window.started=[];window.tapPeak=0;
    const labels=new WeakMap(),realFetch=window.fetch,decode=BaseAudioContext.prototype.decodeAudioData,start=AudioBufferSourceNode.prototype.start,connect=AudioNode.prototype.connect;
    window.fetch=async(...a)=>{const r=await realFetch(...a);if(String(a[0]).includes('/audio/')){const read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();labels.set(b,String(a[0]).split('/').pop());return b}}return r};
    BaseAudioContext.prototype.decodeAudioData=async function(d){const b=await decode.call(this,d);if(labels.has(d))b.clipLabel=labels.get(d);return b};
    AudioBufferSourceNode.prototype.start=function(...a){if(this.buffer?.clipLabel)window.started.push({clip:this.buffer.clipLabel,at:performance.now()});return start.apply(this,a)};
    AudioNode.prototype.connect=function(d,...r){if(d instanceof AudioDestinationNode&&!this.__tapped){this.__tapped=true;const t=this.context.createAnalyser();t.fftSize=2048;connect.call(this,t);const data=new Float32Array(2048);setInterval(()=>{t.getFloatTimeDomainData(data);for(const v of data)window.tapPeak=Math.max(window.tapPeak,Math.abs(v))},10)}return connect.call(this,d,...r)};
  `});
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/.cache/combat-audio/fixture.html' });
  await wait('window.fixtureReady===true');
  if (process.env.COMBAT_AUDIO_SEEK) await evaluate('window.seek=true'); // Walks at the nearest enemy and stays close: the densest case, with health raised to survive it.
  for (const zone of zones) {
    await evaluate(`load(${JSON.stringify(zone)})`); await wait(`hud?.phase==='playing'||hud?.phase==='deploying'`, 20000);
    await evaluate(`engine.skipDeployment();engine.configureDebug({healthMultiplier:window.seek?40:1});engine.startPilot()`);
    await wait(`hud?.phase==='playing'`); await delay(4000);
    await evaluate(`started.length=0;window.steps0=Number(document.querySelector('canvas').dataset.enemySteps||0);window.sample=[];window.sampler=setInterval(()=>{const self=hud.arenaSelf,near=self?hud.arena.actors.filter(a=>a.alive&&a.faction!==self.faction&&!a.vehicle&&Math.hypot(a.x-self.x,a.z-self.z)<25).length:0;sample.push({steps:Number(document.querySelector('canvas').dataset.enemySteps||0),near,alive:!!self?.alive,x:self?.x,z:self?.z})},1000)`);
    await delay(seconds * 1000);
    const data = await evaluate(`(()=>{clearInterval(sampler);const c={};for(const s of started){const k=s.clip.replace(/-[0-9a-f]{10}\\.mp3$/,'').replace(/-\\d+(-\\d+)?$/,'');c[k]=(c[k]||0)+1}return {clips:c,sample,bots:hud.arena.actors.filter(a=>a.bot&&a.squad&&a.alive).length}})()`);
    const counts = data.sample.map(s => s.steps), perSecond = counts.slice(1).map((v, i) => v - counts[i]), total = counts.at(-1) - counts[0];
    const moved = data.sample.reduce((sum, s, i) => i && s.x !== undefined && data.sample[i - 1].x !== undefined ? sum + Math.hypot(s.x - data.sample[i - 1].x, s.z - data.sample[i - 1].z) : sum, 0);
    const sorted = [...perSecond].sort((a, b) => a - b), withHostiles = data.sample.filter(s => s.near > 0).length;
    const report = { zone, seconds, bots: data.bots, playerMovedM: Math.round(moved), secondsWithHostileWithin25m: withHostiles, maxHostilesWithin25m: Math.max(...data.sample.map(s => s.near)), enemySteps: total, perSecondMean: +(total / seconds).toFixed(2), perSecondP50: sorted[sorted.length >> 1], perSecondMax: sorted.at(-1), secondsSilent: perSecond.filter(v => !v).length, clips: data.clips };
    reports.push(report); console.log(JSON.stringify(report));
    assert(report.perSecondMax <= 8, 'enemy steps are spaced');
  }
  // The range: real hits, kills and grenades from the real engine, and a target that shoots back.
  if (process.env.COMBAT_AUDIO_RANGE !== 'no') {
    const counted = group => evaluate(`started.filter(c=>c.clip.startsWith(${JSON.stringify(group)})).length`);
    await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html' });
    await wait(`window.hud?.phase==='ready'`);
    await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));window.engine.startPilot();window.control='hunt';started.length=0`);
    await wait('window.hud.hits>4', 120000);
    const range = {}; for (const group of ['combat-hit', 'combat-headshot', 'combat-kill', 'walk', 'combat-step']) range[group] = await counted(group);
    range.kills = await evaluate('hud.hits'); range.landed = await evaluate('hud.landed');
    assert(range['combat-kill'] >= 3, 'kills are heard: ' + JSON.stringify(range));
    // Range targets die in one round from this gun, so a non-lethal tick is only reached in a real match above.
    await evaluate(`window.control='idle';window.action={};engine.takeControl();started.length=0;tapPeak=0;engine.useSelectedUtility('combat')`); await delay(900); await evaluate(`engine.setInput('fire',true)`); await delay(200); await evaluate(`engine.setInput('fire',false)`); await delay(5000);
    range.grenadeBounce = await counted('combat-grenade-bounce'); range.grenadePeak = await evaluate('tapPeak');
    // Standing still under fire: the plates, then the body, then the heartbeat.
    await evaluate(`window.mount('continuous',true)`); await wait(`window.hud?.phase==='ready'`);
    await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));window.engine.startPilot();window.control='idle';window.action={};engine.configureDebug({regeneration:false});started.length=0`);
    const startedAt = Date.now(); while (Date.now() - startedAt < 180000 && await evaluate(`hud.health>0&&!started.some(c=>c.clip.startsWith('combat-heartbeat'))`)) await delay(500);
    for (const group of ['combat-hurt-armor', 'combat-hurt-break', 'combat-hurt-body', 'combat-hurt-heavy', 'combat-heartbeat', 'combat-breath']) range[group] = await counted(group);
    range.vitals = await evaluate('({health:hud.health,armor:hud.armor,phase:hud.phase})');
    reports.push(range); console.log(JSON.stringify({ range }));
    assert(range['combat-hurt-armor'] + range['combat-hurt-break'] + range['combat-hurt-body'] + range['combat-hurt-heavy'] >= 1, 'being hit is heard: ' + JSON.stringify(range));
  }
  assert.deepEqual(errors.filter(e => !/setPointerCapture/.test(e)).slice(0, 5), []); // The fixture's synthetic touch has no real pointer to capture.
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`, { method: 'PUT' }).catch(() => {}); }
