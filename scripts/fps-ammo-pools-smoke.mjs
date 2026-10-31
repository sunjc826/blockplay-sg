// Physical magazine inventories through the real engine and weapon HUD. Requires Vite
// and isolated Chrome with remote debugging, matching the other FPS smokes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-magazines/', import.meta.url);
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
import {createProfile,resolveLoadout,selectCarryWeapon} from '/src/game/armory-state.ts';
import {EXTRA_SLOT_ID} from '/src/game/armory-slots.ts';
const base=createProfile();base.owned.push(EXTRA_SLOT_ID);base.consumables={'kit-ammo':1};
const profile=selectCarryWeapon(base,'extra',1),equipment=resolveLoadout(profile),root=createRoot(document.querySelector('#hud'));
window.consumed=[];
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
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Timed out waiting for ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait(`window.hud?.phase==='ready'`,180000);
  assert.equal(await evaluate('hud.reserve'),60);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:40,y:20,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:40,y:20,button:'left',clickCount:1});
  await wait(`hud.phase==='playing'`);
  assert.equal(await evaluate('hud.magazine'),31);
  assert.equal(await evaluate('hud.spareMagazines'),2);
  await evaluate(`engine.lookBy(0,650);engine.setInput('fire',true)`);
  await wait('hud.magazine<31'); await evaluate(`engine.setInput('fire',false)`);
  await evaluate('engine.reload()'); await wait('hud.reloading>0');
  await wait(`JSON.parse(document.querySelector('canvas').dataset.magazineInventory).pending!==null`);
  const grabbed = await evaluate(`JSON.parse(document.querySelector('canvas').dataset.magazineInventory)`);
  assert.equal(grabbed.reloadSlot,0); assert.equal(grabbed.slots[0],null); assert.equal(grabbed.slots[2].family,0);
  await fs.writeFile(new URL('reload.png',output),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await wait('hud.reloading===0');
  assert.equal(await evaluate('hud.reserve'),30); assert.equal(await evaluate('hud.magazine'),31);
  assert.equal(await evaluate('hud.spareMagazines'),1);
  await evaluate('engine.switchWeapon(1)'); await wait('hud.weapon===1');
  assert.equal(await evaluate('hud.reserve'),120); assert.equal(await evaluate('hud.magazine'),60);
  await evaluate(`engine.setInput('fire',true)`); await wait('hud.magazine<60'); await evaluate(`engine.setInput('fire',false)`);
  await evaluate('engine.reload()'); await wait('hud.reloading>0'); await wait('hud.reloading===0');
  assert.equal(await evaluate('hud.reserve'),60); assert.equal(await evaluate('hud.spareMagazines'),1);
  await evaluate('engine.useUtility("ammo")'); await wait('hud.supplyUse!==null');
  await wait('hud.belt.find(slot=>slot.kind==="ammo").count===0 && !hud.supplyUse');
  assert.equal(await evaluate('hud.reserve'),180); assert.deepEqual(await evaluate('consumed'),['kit-ammo']);
  assert.equal(await evaluate('hud.spareMagazines'),3);
  await evaluate('engine.switchWeapon(0)'); await wait('hud.weapon===0');
  assert.equal(await evaluate('hud.magazine'),31); assert.equal(await evaluate('hud.reserve'),30);
  await wait(`document.querySelector('.fps-ammo strong small')?.title==='5.56 mm compatible spare magazines'`);
  assert.equal(await evaluate(`document.querySelector('.fps-ammo strong small').textContent.trim()`),'· 1 MAGS');
  await fs.writeFile(new URL('after-reload.png',output),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate('engine.reset()'); await wait(`hud.phase==='ready'`);
  assert.equal(await evaluate('hud.reserve'),60); assert.equal(await evaluate('hud.magazine'),31);
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('evidence.json',output),JSON.stringify({grabbed,errors,passed:true},null,2));
  console.log('PASS: upper pouches empty first, rifle/drum spares stay separate, early reload discards rounds, ammo pouch fills two real positions, HUD and reset agree.');
} catch(error) {
  console.log(errors,await evaluate('window.hud && ({phase:hud.phase,weapon:hud.weapon,magazine:hud.magazine,reserve:hud.reserve,message:hud.message})').catch(()=>null));
  throw error;
} finally {
  await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`);await fs.rm(fixture,{force:true});
}
