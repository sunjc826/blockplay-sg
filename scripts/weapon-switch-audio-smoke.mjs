// Real-engine weapon switch sounds: which recordings start, when, how loud at the speakers, and that mute, the effects
// slider and a launcher mode change behave. Needs Vite (FPS_APP_ORIGIN) and Chrome with remote debugging and
// --autoplay-policy=no-user-gesture-required (FPS_CHROME_ORIGIN). No paid requests. Measures signal: nobody hears it here.
// HMR is stubbed so other sessions' saves can't reload the page, so on a cold Vite cache open any page once first, or it never gets the reload after optimizing.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5298', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9471';
const output = new URL('../.cache/weapon-switch-audio/', import.meta.url); await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><style>body{margin:0}#world{width:100vw;height:100vh}</style><div id="world"></div><script type="module">
const {createFpsEngine}=await import('/src/game/fps-engine.ts');const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {recoverProxyWeapon}=await import('/src/game/proxy-equipment.ts');
window.equipment=resolveLoadout(recoverProxyWeapon(createProfile(),'cc-qts11',0));
window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud},{tutorial:true,loadout:equipment});engine.configureDebug({regeneration:false,combatEvents:false});
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
const wait = async (expression, timeout = 120000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(50); } throw new Error('Timed out: ' + expression); };
const SWITCH_CLIPS = /^switch-/;
/** Starts a change and returns the clips that played and the loudest sample at the speakers. */
async function run(expression, ms = 1500) {
  await evaluate(`started.length=0;tapPeak=0;switchAt=performance.now();${expression}`); await delay(ms);
  return evaluate(`({clips:started.filter(c=>${SWITCH_CLIPS}.test(c.clip)).map(c=>({clip:c.clip.replace(/-[0-9a-f]{10}\\.mp3$/,''),ms:Math.round(c.at-switchAt)})),peak:tapPeak,weapon:hud.weapon})`);
}
const results = {};
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol)};Stub.prototype=Real.prototype;Stub.OPEN=Real.OPEN;Stub.CLOSED=Real.CLOSED;window.WebSocket=Stub;}
    window.started=[];window.tapPeak=0;
    const labels=new WeakMap(),realFetch=window.fetch,decode=BaseAudioContext.prototype.decodeAudioData,start=AudioBufferSourceNode.prototype.start,connect=AudioNode.prototype.connect;
    window.fetch=async(...a)=>{const r=await realFetch(...a);if(String(a[0]).includes('/audio/')){const read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();labels.set(b,String(a[0]).split('/').pop());return b}}return r};
    BaseAudioContext.prototype.decodeAudioData=async function(d){const b=await decode.call(this,d);if(labels.has(d))b.clipLabel=labels.get(d);return b};
    AudioBufferSourceNode.prototype.start=function(...a){if(this.buffer?.clipLabel)window.started.push({clip:this.buffer.clipLabel,at:performance.now()});return start.apply(this,a)};
    AudioNode.prototype.connect=function(d,...r){if(d instanceof AudioDestinationNode&&!this.__tapped){this.__tapped=true;const t=this.context.createAnalyser();t.fftSize=2048;connect.call(this,t);const data=new Float32Array(2048);const read=()=>{t.getFloatTimeDomainData(data);for(const v of data)window.tapPeak=Math.max(window.tapPeak,Math.abs(v))};setInterval(read,10)}return connect.call(this,d,...r)};
  `});
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/.cache/weapon-switch-audio/fixture.html' });
  await wait('window.fixtureReady===true'); await wait(`window.hud?.phase==='ready'`);
  await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));engine.start()`);
  await wait(`hud.phase==='playing'`); await delay(1500);
  const carried = await evaluate('hud.carriedWeapons'), first = await evaluate('hud.weapon'), other = carried.find(family => family !== first);
  assert(other !== undefined, 'a second gun to switch to');
  await delay(8000); // The engine decodes every recording in the background.

  const away = await run(`engine.switchWeapon(${other})`);
  results.away = away; assert.equal(away.weapon, other);
  assert.equal(away.clips.length, 3, 'stow, draw, settle: ' + JSON.stringify(away.clips));
  assert(away.clips[0].ms < 120, 'the stow plays at once');
  assert(away.clips[0].ms < away.clips[1].ms && away.clips[1].ms < away.clips[2].ms, 'in order');
  assert.match(away.clips[0].clip, /switch-stow-/); assert.match(away.clips[1].clip, /switch-draw-/); assert.match(away.clips[2].clip, /switch-settle-/);
  assert(away.peak > .02, 'reaches the speakers: ' + away.peak);

  const back = await run(`engine.switchWeapon(${first})`); results.back = back;
  assert.equal(back.clips.length, 3, 'and back: ' + JSON.stringify(back.clips));

  const blocked = await run(`engine.switchWeapon(${other});engine.switchWeapon(${first});engine.switchWeapon(${other})`); results.spam = blocked;
  assert.equal(blocked.clips.length, 3, 'mashing does not stack sounds: ' + JSON.stringify(blocked.clips));
  await run(`engine.switchWeapon(${first})`);

  const same = await run(`engine.switchWeapon(hud.weapon)`, 300); assert.equal(same.clips.length, 0, 'the gun in hand makes no sound');

  await evaluate('engine.toggleSound()'); const muted = await run(`engine.switchWeapon(${other})`); results.muted = muted; await evaluate('engine.toggleSound()');
  assert.equal(muted.clips.length, 0, 'mute');
  await run(`engine.switchWeapon(${first})`);

  await evaluate(`import('/src/lib/effects-volume.ts').then(m=>m.setEffectsVolume(0))`); await delay(200);
  const silent = await run(`engine.switchWeapon(${other})`); results.effectsOff = silent; assert.equal(silent.peak, 0, 'effects slider off is silence');
  await evaluate(`import('/src/lib/effects-volume.ts').then(m=>m.setEffectsVolume(1))`); await delay(200);

  // The mode change has no stow or draw: only the hand on the gun.
  if (await evaluate('hud.weapon') !== 16) await run('engine.switchWeapon(16)');
  const mode = await run('engine.toggleWeaponMode()', 700); results.mode = mode;
  assert.equal(mode.weapon, 17, 'launcher selected'); assert.equal(mode.clips.length, 1, 'one click: ' + JSON.stringify(mode.clips)); assert.match(mode.clips[0].clip, /switch-mode/);
  const rifle = await run('engine.toggleWeaponMode()', 700); results.modeBack = rifle; assert.equal(rifle.clips.length, 1); assert.equal(rifle.weapon, 16);

  // Against gunfire, the loudest thing it sits beside.
  await evaluate(`started.length=0;tapPeak=0;engine.setInput('fire',true)`); await delay(500); await evaluate(`engine.setInput('fire',false)`);
  results.gunfirePeak = await evaluate('tapPeak'); assert(results.gunfirePeak > away.peak, 'quieter than gunfire');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 1));
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`, { method: 'PUT' }).catch(() => {}); }
