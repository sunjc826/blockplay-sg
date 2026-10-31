// Actual pouch contact and magazine transfer through the rendered FPS engine. Requires Vite
// and isolated Chrome with remote debugging, matching the other FPS smokes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const family = Number(process.env.POUCH_RELOAD_FAMILY ?? 0);
const rig = process.env.POUCH_RELOAD_RIG ?? 'rig-ilbv';
assert(Number.isInteger(family) && family >= 0 && family <= 7);
assert(['rig-ilbv','rig-lbs','rig-sentinel'].includes(rig));
const output = new URL(`../.cache/fps-pouch-reload/${family}-${rig}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const fixture = new URL('fixture.html', output);
await fs.writeFile(fixture, `<!doctype html><style>body{margin:0;background:#17231e;color:white;font:16px sans-serif}.fps-game{position:relative}#world{height:700px;width:100vw}button{padding:12px}</style>
<button id="enter">Enter range</button><div class="fps-game"><div id="world"></div><div id="hud"></div></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const {createRoot}=ReactDOM;
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:FpsWeaponHud}=await import('/src/components/FpsWeaponHud.tsx');
import {createFpsEngine} from '/src/game/fps-engine.ts';
import {createProfile,resolveLoadout} from '/src/game/armory-state.ts';

const profile=createProfile();profile.owned.push(...profile.guns.map(gun=>gun.variant),${JSON.stringify(rig)});profile.rig=${JSON.stringify(rig)};profile.carry={main:${family === 2 ? 0 : family},extra:null};
const equipment=resolveLoadout(profile),root=createRoot(document.querySelector('#hud'));
equipment.weapons.forEach(spec=>spec.reload*=2);window.consumed=[];
window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;root.render(React.createElement(FpsWeaponHud,{hud,weapon:equipment.weapons[hud.weapon],canFight:hud.phase==='playing'}));},{tutorial:true,loadout:equipment,onConsume:id=>window.consumed.push(id)});
window.engine.configureDebug({regeneration:false,combatEvents:false});
document.querySelector('#enter').onclick=()=>engine.start();
</script>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/@fs' + decodeURIComponent(fixture.pathname))}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(12); }
  throw new Error('Timed out waiting for ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait(`window.hud?.phase==='ready'`,180000);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:40,y:20,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:40,y:20,button:'left',clickCount:1});
  await wait(`hud.phase==='playing'`);
  await evaluate(`engine.switchWeapon(${family})`); await wait(`hud.weapon===${family}`);
  const initial=await evaluate('({rounds:hud.magazine,spares:hud.spareMagazines})');
  await evaluate(`engine.lookBy(0,650);engine.setInput('fire',true)`);
  await wait(`hud.magazine<${initial.rounds}`); await evaluate(`engine.setInput('fire',false)`);
  await evaluate('engine.reload()'); await wait('hud.reloading>0');
  const samples=[];
  for(const phase of ['reach','grip','extract','carry','insert']) {
    await wait(`JSON.parse(document.querySelector('canvas').dataset.reloadReach)?.phase==='${phase}'`);
    const sample=await evaluate(`({reach:JSON.parse(document.querySelector('canvas').dataset.reloadReach),inventory:JSON.parse(document.querySelector('canvas').dataset.magazineInventory)})`);
    samples.push(sample);
    await fs.writeFile(new URL(phase+'.png',output),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  assert.equal(samples[1].reach.sourceVisible,true);
  assert.equal(samples[1].inventory.pending,null);
  assert.equal(samples[2].reach.sourceVisible,false);
  const slot=samples[2].inventory.reloadSlot;
  assert.equal(samples[2].inventory.slots[slot],null);
  assert(samples[2].reach.magazine);
  assert(Math.hypot(...samples[1].reach.hand.map((n,i)=>n-samples[1].reach.source[i]))<.12);
  await wait('hud.reloading===0');
  assert.equal(await evaluate('hud.spareMagazines'),initial.spares-1);
  await fs.writeFile(new URL('samples.json',output),JSON.stringify(samples,null,2));
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('evidence.json',output),JSON.stringify({errors,passed:true},null,2));
  console.log(`PASS family ${family} / ${rig}: reach, grip, extraction, carry and insertion rendered; source stays visible until grip; one spare consumed; no browser errors.`);
} catch(error) {
  console.log(errors,await evaluate('window.hud && ({phase:hud.phase,weapon:hud.weapon,magazine:hud.magazine,reserve:hud.reserve,message:hud.message})').catch(()=>null));
  throw error;
} finally {
  await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`);await fs.rm(fixture,{force:true});
}
