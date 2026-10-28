// Armor collection and deliberate swaps through the live expedition engine.
// Requires Vite on 5175 and an isolated Chrome with remote debugging on 9228.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-armor-pickups/run-' + Date.now() + '/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const fixture = new URL('fixture.html', output);
await fs.writeFile(fixture, `<!doctype html><style>body{margin:0;background:#17231e;color:white;font:16px sans-serif}.fps-game{position:relative}#world{height:calc(100vh - 44px);width:100vw}button{padding:12px}</style>
<button id="enter">Enter district</button><div class="fps-game"><div id="world"></div><div id="hud"></div></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:FpsLootCard}=await import('/src/components/FpsLootCard.tsx');
const {default:TouchControls}=await import('/src/components/TouchControls.tsx');
await import('/src/components/expedition.css');
import {createFpsEngine} from '/src/game/fps-engine.ts';
import {createProfile} from '/src/game/armory-state.ts';
import {createExpeditionLoot} from '/src/game/expedition-loot.ts';
const root=ReactDOM.createRoot(document.querySelector('#hud'));
window.touch=false;
window.renderHud=()=>{document.querySelector('.fps-game').dataset.touch=window.touch?'on':'off';root.render(React.createElement(React.Fragment,null,React.createElement(FpsLootCard,{hud:window.hud,touch:window.touch}),window.touch&&React.createElement(TouchControls,{hud:window.hud,engine:window.engine,mode:'expedition',onMenu:()=>{}})));};
window.mountFixture=(worn='plate-elite',armor=20,count=4)=>{
 window.engine?.dispose();window.changes=[];
 const profile=createProfile();profile.plate=worn;profile.owned.push(worn);window.fieldProfile=profile;
 window.original=JSON.stringify(profile);
 const loot=createExpeditionLoot('armor-pickups');
 // Real fallen-kit rolls and real range-checked collection, with only soft plates by the feet.
 let added=0;
 for(let n=0;added<count&&n<1000;n++){
   const soldier={key:'armor-'+n,side:'opposition',rank:2};
   const sample=createExpeditionLoot('armor-pickups').fallen('marina-bay',soldier,{x:0,z:0}).loot;
   if(sample.length!==1||sample[0].catalogId!=='plate-soft')continue;
   loot.fallen('marina-bay',soldier,{x:-103-sample[0].x,z:94-sample[0].z});added++;
 }
 window.ledger=loot;
 window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;window.renderHud();},{expedition:{zone:'marina-bay',spawn:{x:-103,z:95.5,yaw:0,pitch:-Math.PI/4},checkpoint:{health:100,armor,weapon:0,ammunition:[]},profile,loot,onEquipment(next){window.fieldProfile=next;window.changes.push(next);},onTravel(){}}});
 window.engine.configureDebug({combatEvents:false,regeneration:false});
};
window.mountFixture();document.querySelector('#enter').onclick=()=>window.engine.start();
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
async function key(key, code) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
async function enter() {
  await wait(`window.hud?.phase==='ready'`,60000);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:40,y:20,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:40,y:20,button:'left',clickCount:1});
  await wait(`hud.phase==='playing' && hud.lootCard?.kind==='armor'`);
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await enter();
  assert.equal(await evaluate('hud.armor'),20);
  await wait(`document.querySelector('.fps-loot-swap')?.textContent.includes('I')`);
  await screenshot('collect-and-swap');
  for (const armor of [55,90,100]) {
    await key('e','KeyE'); await wait(`hud.armor===${armor} && hud.arenaSelf.armor===${armor}`);
    assert.equal(await evaluate('fieldProfile.plate'),'plate-elite');
  }
  assert.equal(await evaluate('changes.length'),0,'collecting never changes equipment');
  await wait(`hud.lootCard?.blocked==='Armor full' && !!hud.lootCard.swap`);
  const remaining = await evaluate(`ledger.remaining('marina-bay').length`);
  await key('e','KeyE');
  assert.equal(await evaluate(`ledger.remaining('marina-bay').length`),remaining,'full armor leaves the pickup');
  assert.equal(await evaluate('hud.armor'),100);
  await screenshot('full-armor-swap-available');
  await key('i','KeyI'); await wait(`hud.armor===35 && hud.arenaSelf.armor===35 && fieldProfile.plate==='plate-soft'`);
  assert.equal(await evaluate('changes.length'),1,'only deliberate swap updates equipment');
  assert.equal(await evaluate(`ledger.remaining('marina-bay').length`),remaining-1);
  console.log('PASS keyboard: collect adds 35, caps at 100, preserves inserts and full pickups; I deliberately swaps to 35.');

  await evaluate(`touch=true;mountFixture('plate-elite',100,1)`); await enter();
  await wait(`document.querySelector('[data-touch-action="loot"]')?.disabled===true && !!document.querySelector('[data-touch-action="armor-swap"]')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 600, deviceScaleFactor: 1, mobile: false });
  await delay(250);
  assert(await evaluate(`(()=>{const a=document.querySelector('.fps-loot-card').getBoundingClientRect(),b=document.querySelector('[data-touch-action=armor-swap]').getBoundingClientRect();return b.right<=a.left;})()`),'touch swap stays clear of the comparison card');
  await screenshot('touch-swap-available');
  await evaluate(`document.querySelector('[data-touch-action="armor-swap"]').click()`);
  await wait(`hud.armor===35 && fieldProfile.plate==='plate-soft'`);
  console.log('PASS touch: full armor disables collect while the separate swap button works.');

  await evaluate(`touch=false;mountFixture('plate-none',0,1)`); await enter();
  assert.equal(await evaluate('hud.lootCard.action'),'Equip');
  assert.equal(await evaluate('!!hud.lootCard.swap'),false);
  await key('e','KeyE'); await wait(`hud.armor===35 && hud.arenaSelf.armor===35 && fieldProfile.plate==='plate-soft'`);
  assert.deepEqual(errors,[]);
  console.log('PASS empty vest: collecting equips the dropped inserts at full capacity; no runtime errors.');
} catch (error) {
  console.log(await evaluate(`({phase:hud?.phase,armor:hud?.armor,card:hud?.lootCard,x:hud?.x,z:hud?.z,pitch:hud?.pitch,errors:${JSON.stringify(errors)}})`).catch(()=>null));
  await screenshot('failure').catch(()=>{}); throw error;
} finally {
  await evaluate('engine.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`);
}
