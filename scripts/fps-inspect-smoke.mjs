// Weapon inspection through the real engine and shared HUD. Requires Vite
// and isolated Chrome with remote debugging, matching the other FPS smokes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-inspect/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const fixture = new URL('fixture.html', output);
await fs.writeFile(fixture, `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#17231e;color:white;font:16px sans-serif}.fps-game{position:relative;margin:0;padding:0;max-width:none;width:100vw;height:calc(100dvh - 45px)}#world{height:100%;width:100%}button{padding:12px}</style>
<button id="enter">Enter range</button><div class="fps-game"><div id="world"></div><div id="hud"></div></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const {createRoot}=ReactDOM;
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:FpsWeaponHud}=await import('/src/components/FpsWeaponHud.tsx');
import '/src/styles.css';
import {createFpsEngine} from '/src/game/fps-engine.ts';
import {createProfile,resolveLoadout,selectCarryWeapon} from '/src/game/armory-state.ts';
import {EXTRA_SLOT_ID} from '/src/game/armory-slots.ts';
const base=createProfile();base.owned.push(EXTRA_SLOT_ID);base.consumables={'kit-ammo':1};
const profile=selectCarryWeapon(base,'extra',1),equipment=resolveLoadout(profile),root=createRoot(document.querySelector('#hud'));
window.consumed=[];
window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;root.render(React.createElement(FpsWeaponHud,{hud,weapon:equipment.weapons[hud.weapon],canFight:hud.phase==='playing',onInspect:()=>engine.inspectWeapon(),touch:window.touchMode}));},{loadout:equipment,onConsume:id=>window.consumed.push(id)});
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
const progress = `Number(document.querySelector('canvas').dataset.inspectProgress)`;
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', {format:'png'});
  await fs.writeFile(new URL(name+'.png', output), Buffer.from(shot.data,'base64'));
}
async function inspect() { await evaluate('engine.inspectWeapon()'); await wait('hud.inspecting'); }
async function stopped() { await wait(`!hud.inspecting && document.querySelector('canvas').dataset.inspectProgress===''`); }
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', {enabled:true});
  await send('Emulation.setDeviceMetricsOverride', {width:1200,height:800,deviceScaleFactor:1,mobile:false});
  await wait(`window.hud?.phase==='ready'`,60000);
  // Touch entry avoids relying on headless pointer-lock support.
  await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true})); document.querySelector('#enter').click()`);
  await wait(`hud.phase==='playing'`);
  const initial=await evaluate('({magazine:hud.magazine,reserve:hud.reserve,shots:hud.shots})');
  // Keyboard control, including repeat suppression.
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK'});
  await wait('hud.inspecting'); await wait(`${progress}>.23 && ${progress}<.43`);
  await screenshot('rifle-first-side');
  await evaluate(`document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'k',repeat:true,bubbles:true}))`);
  assert.equal(await evaluate('hud.inspecting'),true);
  await wait(`${progress}>.65 && ${progress}<.78`); await screenshot('rifle-second-side');
  await stopped();
  assert.deepEqual(await evaluate('({magazine:hud.magazine,reserve:hud.reserve,shots:hud.shots})'),initial);
  // Desktop uses the keyboard hint, without a HUD button taking space.
  assert.equal(await evaluate(`document.querySelector('.fps-inspect-button') === null`),true);
  assert.match(await evaluate(`document.querySelector('.fps-ammo-detail').textContent`),/K INSPECT/);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK'}); await wait('hud.inspecting');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK'}); await stopped();
  await inspect(); await evaluate(`engine.setInput('fire',true)`); await stopped();
  await wait('hud.shots>0'); await evaluate(`engine.setInput('fire',false)`);
  await inspect(); await evaluate('engine.toggleAim()'); await stopped(); await wait('hud.aiming');
  await evaluate('engine.inspectWeapon()'); assert.equal(await evaluate('hud.inspecting'),false);
  await evaluate('engine.toggleAim()'); await wait('!hud.aiming');
  await inspect(); await evaluate('engine.reload()'); await stopped(); await wait('hud.reloading>0');
  await evaluate('engine.inspectWeapon()'); assert.equal(await evaluate('hud.inspecting'),false);
  await wait('hud.reloading===0');
  await inspect(); await evaluate(`engine.setInput('w',true);engine.setInput('shift',true)`); await stopped();
  await evaluate(`engine.setInput('w',false);engine.setInput('shift',false)`); await delay(400);
  await inspect(); await evaluate('engine.switchWeapon(1)'); await stopped();
  await inspect(); await wait(`${progress}>.25 && ${progress}<.42`); await screenshot('support-inspect');
  await evaluate('engine.switchWeapon(2)'); await stopped();
  await inspect(); await wait(`${progress}>.25 && ${progress}<.42`); await screenshot('pistol-inspect');
  await evaluate('engine.pause()'); await stopped();
  await evaluate('engine.inspectWeapon()'); assert.equal(await evaluate('hud.inspecting'),false);
  await evaluate('engine.start()'); await wait(`hud.phase==='playing'`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await inspect(); await stopped();
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`window.touchMode=true;document.querySelector('.fps-game').dataset.touch='on'`); await delay(300);
  const bounds=await evaluate(`(()=>{const r=document.querySelector('.fps-inspect-button').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
  assert(bounds.x>=0 && bounds.x+bounds.w<=390 && bounds.y>=0 && bounds.y+bounds.h<=844 && bounds.w>=36 && bounds.h>=36,JSON.stringify(bounds));
  await evaluate(`document.querySelector('.fps-inspect-button').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}))`);
  await wait('hud.inspecting'); await screenshot('touch-inspect');
  await evaluate(`document.querySelector('.fps-inspect-button').click()`); assert.equal(await evaluate('hud.inspecting'),true,'Synthetic touch click is deduplicated');
  await evaluate('engine.reset()'); await stopped();
  assert.deepEqual(errors,[]);
  console.log('PASS: K, repeat suppression, desktop hint/touch button, both sides and automatic return, ammo unchanged, fire/aim/reload/sprint/switch/pause/reset interruptions, reduced motion, mobile button bounds.');
} catch(error) {
  console.log(errors); await screenshot('failure').catch(()=>{}); throw error;
} finally {
  await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`);await fs.rm(fixture,{force:true});
}
