// A thunderstorm in a real expedition: walks to the car, gets in and drives, then lists which world sounds started.
// Needs Vite (FPS_APP_ORIGIN) and Chrome with remote debugging and --autoplay-policy=no-user-gesture-required (FPS_CHROME_ORIGIN).
// No paid requests. Measures signal: nobody hears it here. HMR is stubbed, so on a cold Vite cache open any page once first.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5298', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9471', zone = process.env.WORLD_AUDIO_ZONE || 'queenstown';
const output = new URL('../.cache/world-audio/', import.meta.url); await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><style>body{margin:0}#world{width:100vw;height:100vh}</style><div id="world"></div><script type="module">
localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({weather:'thunderstorm',celebration:'none',timeOfDay:'afternoon',reducedEffects:true,shadows:false,occlusion:false}));
const {createFpsEngine}=await import('/src/game/fps-engine.ts');const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {createExpeditionLoot}=await import('/src/game/expedition-loot.ts');
const profile=createProfile();window.hud=null;
window.engine=createFpsEngine(document.querySelector('#world'),next=>{window.hud=next},{playerPilot:{reset(){},decide(o){const near=(hud?.mapMarkers??[]).find(m=>m.id==='car'||m.kind==='car'||m.id==='vehicle-car');if(!near)return{goal:'engage',status:'x',action:{}};const yaw=Math.atan2(-(near.x-o.position.x),-(near.z-o.position.z)),ex=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw));return{goal:'engage',status:'Walking to the car',action:{lookX:-ex/.0023*.5,forward:Math.abs(ex)<.5,sprint:true}};}},loadout:resolveLoadout(profile),expedition:{zone:${JSON.stringify(zone)},battlefieldSize:32,profile,loot:createExpeditionLoot('world-audio'),autoRespawn:true,onTravel(){},onEquipment(){},onVendorPurchase(){}}});
const start=performance.now();while(hud?.phase!=='ready'){if(hud?.phase==='error'||performance.now()-start>90000)throw Error('Engine failed to load');await new Promise(r=>setTimeout(r,100));}
document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));engine.chooseDeployment('entry');engine.start();window.fixtureReady=true;
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
const wait = async (expression, timeout = 120000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return true; await delay(100); } return false; };
const key = async (k, code, held = 60) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code }); await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
const clips = () => evaluate(`(()=>{const c={};for(const s of started){const k=s.clip.replace(/-[0-9a-f]{10}\\.mp3$/,'').replace(/-\\d+$/,'');if(/^(world|combat)-|^walk|^run/.test(k))c[k]=(c[k]||0)+1}return c})()`);
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol)};Stub.prototype=Real.prototype;Stub.OPEN=Real.OPEN;Stub.CLOSED=Real.CLOSED;window.WebSocket=Stub;}
    window.started=[];const labels=new WeakMap(),realFetch=window.fetch,decode=BaseAudioContext.prototype.decodeAudioData,start=AudioBufferSourceNode.prototype.start;
    window.fetch=async(...a)=>{const r=await realFetch(...a);if(String(a[0]).includes('/audio/')){const read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();labels.set(b,String(a[0]).split('/').pop());return b}}return r};
    BaseAudioContext.prototype.decodeAudioData=async function(d){const b=await decode.call(this,d);if(labels.has(d))b.clipLabel=labels.get(d);return b};
    AudioBufferSourceNode.prototype.start=function(...a){if(this.buffer?.clipLabel)window.started.push({clip:this.buffer.clipLabel,at:performance.now(),loop:this.loop});return start.apply(this,a)};`});
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/.cache/world-audio/fixture.html' });
  assert(await wait('window.fixtureReady===true'), 'loads');
  await wait(`hud?.phase==='playing'||hud?.phase==='deploying'`, 20000);
  await evaluate(`engine.skipDeployment();engine.configureDebug({healthMultiplier:40});engine.startPilot()`);
  await wait(`hud?.phase==='playing'`, 20000); await delay(10000);
  const onFoot = await clips(); console.log(JSON.stringify({ onFoot, markers: await evaluate(`hud.mapMarkers.filter(m=>/car|vehicle|heli/i.test(m.id+m.kind)).map(m=>m.id+':'+m.kind).slice(0,6)`), carDistance: await evaluate('hud.carDistance') }));
  const reached = await wait('hud.carDistance>0&&hud.carDistance<3', 75000);
  console.log(JSON.stringify({ reached, carDistance: await evaluate('hud.carDistance'), vehicle: await evaluate('hud.vehicle') }));
  await evaluate(`engine.takeControl();document.querySelector('canvas').focus();started.length=0`);
  if (reached) {
    await key('e', 'KeyE'); await wait(`hud.vehicle!=='on-foot'`, 5000); await delay(800);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' }); await delay(9000); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
    console.log(JSON.stringify({ driving: await clips(), vehicle: await evaluate('hud.vehicle'), speed: await evaluate('hud.vehicleSpeed') }));
    await key('e', 'KeyE'); await delay(1500); console.log(JSON.stringify({ afterExit: await clips() }));
  }
  await evaluate(`started.length=0`); await delay(30000); // Long enough for a lightning cycle.
  const storm = await clips(); console.log(JSON.stringify({ storm }));
  await evaluate('engine.toggleSound()'); await delay(800); const muted = await evaluate('started.length'); await delay(1500); assert.equal(await evaluate('started.length'), muted, 'mute starts nothing');
  assert.deepEqual(errors.filter(e => !/setPointerCapture/.test(e)).slice(0, 5), []);
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`, { method: 'PUT' }).catch(() => {}); }
