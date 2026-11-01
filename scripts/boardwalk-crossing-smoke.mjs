// Vite on 5196 and an isolated headless Chrome/Metal on CDP 9356.
// The copied UI declares an entry pose and exposes observations only. All movement,
// loading, authority, controls and district geometry run through production code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5196';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9356';
const output = new URL('../.cache/boardwalk/', import.meta.url); await fs.mkdir(output, { recursive: true });
let source = await fs.readFile(new URL('../src/components/ExpeditionGame.tsx', import.meta.url), 'utf8');
source = source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, path) => quote + new URL(path, 'file:///src/components/ExpeditionGame.tsx').pathname + quote);
assert(source.includes("({ zone: initialZone, revision: 0 })"));
source = source.replace('({ zone: initialZone, revision: 0 })', '({ zone: initialZone, spawn: window.fixtureEntry.spawn, checkpoint: window.fixtureEntry.checkpoint, revision: 0 })');
source = source.replace('useState(initialFpsHud);', 'useState(initialFpsHud); window.boardwalkHud = hud;');
source = source.replace('onTravel: (transition, checkpoint) => {', 'onTravel: (transition, checkpoint) => { window.crossings.push({transition, checkpoint});');
source = source.replace('    } catch {', '      window.boardwalkEngine = engine.current;\n    } catch {');
await fs.writeFile(new URL('ExpeditionGame.tsx', output), source);
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.fps-game .fps-viewport{height:100vh!important;min-height:0!important}</style></head><body style="margin:0"><div id="root"></div>
<script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import Expedition from './ExpeditionGame.tsx';import {createProfile} from '/src/game/armory-state.ts';
import {DebugMode} from '/src/lib/debug-mode.ts';
import {setEnvironmentSettings} from '/src/game/environment-settings.ts';import '/src/styles.css';
setEnvironmentSettings({weather:'sunny',celebration:'none',timeOfDay:'noon'});
const profile=createProfile(),root=createRoot(document.querySelector('#root'));profile.owned.push('plate-ceramic');profile.plate='plate-ceramic';let revision=0;
const noop=()=>{},vendor=()=>({purchased:false,profile,message:'Fixture vendor'});
window.crossings=[];
window.mountBoardwalk=(zone='harbourfront',entry={})=>{
 window.fixtureEntry={spawn:{x:110.5,z:208.5,yaw:Math.PI,pitch:-.12},checkpoint:{health:64,armor:21,weapon:0,ammunition:[{magazine:7,reserve:40,cooldown:0,reloadRemaining:0},{magazine:11,reserve:60,cooldown:0,reloadRemaining:0}]},...entry};
 root.render(React.createElement(DebugMode.Provider,{value:false},React.createElement(Expedition,{key:++revision,initialZone:zone,profile,onExit:noop,onVendorPurchase:vendor,onConsume:noop})));
};window.unmountBoardwalk=()=>root.unmount();window.mountBoardwalk();
</script></body></html>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/boardwalk/fixture.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let serial = 0; const pending = new Map(), errors = [], evidence = [], blocked = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Fetch.requestPaused') blocked.push(m.params.requestId);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(Error(method)), 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 90000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw Error('Waiting for ' + expression); }
async function key(key, down = true) { await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key, code: key === 'Escape' ? 'Escape' : 'Key' + key.toUpperCase() }); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(r.data, 'base64')); }
async function enter() {
  const p = await evaluate(`(()=>{const r=document.querySelector('.fps-start-card .primary-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
  await wait(`boardwalkHud.phase==='playing' && boardwalkHud.arenaSelf?.alive`);
}
async function blockLoading() { await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Fetch.enable', { patterns: [{ urlPattern: '*models/field-kit/*.glb', requestStage: 'Response' }] }); }
async function releaseLoading() { for (const requestId of blocked.splice(0)) await send('Fetch.continueRequest', { requestId }); await send('Fetch.disable'); }
async function record(label) { evidence.push({ label, ...await evaluate(`({zone:boardwalkHud.expeditionZone,phase:boardwalkHud.phase,x:boardwalkHud.x,z:boardwalkHud.z,yaw:boardwalkHud.yaw,pitch:boardwalkHud.pitch,health:boardwalkHud.health,armor:boardwalkHud.armor,magazine:boardwalkHud.magazine,reserve:boardwalkHud.reserve,input:boardwalkHud.inputMode,locked:!!document.pointerLockElement,canvases:document.querySelectorAll('canvas').length})`) }); }
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait(`window.boardwalkHud?.phase==='ready' && boardwalkHud.arenaSelf`, 180000);
  await enter(); await screenshot('harbourfront-approach');
  await evaluate(`window.originalCanvas=document.querySelector('canvas')`);
  assert.equal(await evaluate('boardwalkHud.magazine'), 7);
  assert.equal(await evaluate('boardwalkHud.health'), 64);
  const initialReserve = await evaluate('boardwalkHud.reserve');
  await key('t'); await key('t', false); await delay(250);
  assert.equal(await evaluate('crossings.length'), 0, 'T cannot shortcut the physical crossing');
  await blockLoading(); await key('w');
  await wait(`document.querySelector('.fps-game').dataset.zone==='sentosa' && boardwalkHud.phase==='loading'`);
  await key('w', false); // Release while actual GLB responses are held back.
  assert(await evaluate(`!!document.querySelector('.fps-district-crossing') && !document.querySelector('.fps-start-card')`));
  assert(await evaluate(`document.pointerLockElement===originalCanvas && document.querySelector('canvas')===originalCanvas`));
  await screenshot('crossing-loading'); await releaseLoading();
  await wait(`boardwalkHud.phase==='playing' && boardwalkHud.expeditionZone==='sentosa'`);
  await delay(350); const arrival = await evaluate('({x:boardwalkHud.x,z:boardwalkHud.z})');
  await delay(700); assert(Math.abs(await evaluate('boardwalkHud.z') - arrival.z) < .08, 'Released movement stays released after loading');
  assert(Math.abs(arrival.x - 109.5) < .05, 'Lateral offset is preserved');
  assert.equal(await evaluate('boardwalkHud.health'), 64); assert.equal(await evaluate('boardwalkHud.armor'), 21);
  assert.equal(await evaluate('boardwalkHud.magazine'), 7); assert.equal(await evaluate('boardwalkHud.reserve'), initialReserve);
  assert(Math.abs(await evaluate('boardwalkHud.pitch') + .12) < .01);
  assert(await evaluate('document.pointerLockElement===originalCanvas'));
  await record('sentosa-arrival'); await screenshot('sentosa-arrival');
  await key('s'); await wait(`crossings.length===2 && boardwalkHud.phase==='playing' && boardwalkHud.expeditionZone==='harbourfront'`); await key('s', false);
  await delay(250); assert.equal(await evaluate('crossings.length'), 2, 'Return does not bounce');
  assert(await evaluate(`document.querySelector('canvas')===originalCanvas && document.pointerLockElement===originalCanvas`));
  await record('harbourfront-return'); await screenshot('harbourfront-return');
  // Escape during an interrupted load must win over automatic resume.
  await blockLoading(); await key('w');
  await wait(`crossings.length===3 && boardwalkHud.phase==='loading'`); await key('w', false); await key('Escape'); await key('Escape', false);
  await releaseLoading(); await wait(`boardwalkHud.phase==='ready' && boardwalkHud.expeditionZone==='sentosa'`);
  assert.equal(await evaluate('!!document.pointerLockElement'), false);
  assert(await evaluate(`!!document.querySelector('.fps-start-card')`));
  await record('escape-cancels-resume'); await enter();
  // Existing explicit checkpoints still require T and a fresh user gesture.
  await evaluate(`mountBoardwalk('harbourfront',{spawn:{x:-230,z:-20,yaw:0,pitch:0}})`);
  await wait(`boardwalkHud.phase==='ready' && boardwalkHud.expeditionZone==='harbourfront'`); await enter();
  await evaluate(`window.legacyCanvas=document.querySelector('canvas')`);
  await key('t'); await key('t', false);
  await wait(`boardwalkHud.phase==='ready' && boardwalkHud.expeditionZone==='queenstown'`);
  assert.equal(await evaluate('!!document.pointerLockElement'), false);
  assert(await evaluate(`document.querySelector('canvas')===legacyCanvas`));
  await record('legacy-checkpoint');
  // The existing local pilot walks through the plane instead of repeatedly using T.
  await evaluate(`mountBoardwalk('harbourfront',{checkpoint:{...fixtureEntry.checkpoint,health:100}})`);
  await wait(`boardwalkHud.phase==='ready' && boardwalkHud.expeditionZone==='harbourfront'`);
  await evaluate(`boardwalkEngine.setPilotDestination('sentosa');boardwalkEngine.startPilot()`);
  await wait(`boardwalkHud.phase==='playing' && boardwalkHud.expeditionZone==='sentosa' && boardwalkHud.pilotEnabled`);
  await record('local-pilot-crossing'); await evaluate(`boardwalkEngine.pause()`);
  // Mobile follows the same physical boundary and resumes without an Enter tap.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await evaluate(`document.exitPointerLock();mountBoardwalk('sentosa',{spawn:{x:109.5,z:-203.5,yaw:0,pitch:-.12}})`);
  await wait(`boardwalkHud.phase==='ready' && boardwalkHud.expeditionZone==='sentosa'`);
  const button = await evaluate(`(()=>{const r=document.querySelector('.fps-start-card .primary-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...button, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(`boardwalkHud.phase==='playing' && boardwalkHud.inputMode==='touch'`);
  const stick = await evaluate(`(()=>{const r=document.querySelector('[data-touch-stick="move"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...stick, id: 2 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x, y: stick.y - 45, id: 2 }] });
  await wait(`boardwalkHud.phase==='playing' && boardwalkHud.expeditionZone==='harbourfront'`);
  const heldArrival = await evaluate('boardwalkHud.z');
  await wait(`boardwalkHud.z < ${heldArrival - .7}`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(350);
  const releasedTouch = await evaluate('boardwalkHud.z'); await delay(450);
  assert(Math.abs(await evaluate('boardwalkHud.z') - releasedTouch) < .08, 'Thumb release after crossing stops movement');
  assert.equal(await evaluate('boardwalkHud.inputMode'), 'touch');
  assert(await evaluate(`!!document.querySelector('[data-touch-stick="move"]')`));
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await record('mobile-arrival'); await screenshot('mobile-arrival');
  await evaluate('unmountBoardwalk()'); assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify({ evidence, errors, ok: true }, null, 2));
  console.log('PASS: actual expedition UI; directional walk/return, retained canvas and pointer capture, view/vitals/ammo, release/Escape during loading, legacy checkpoint, local pilot, held/released mobile thumb, layout and cleanup.');
} catch (error) {
  console.log(await evaluate('({hud:window.boardwalkHud,crossings:window.crossings,errors:document.querySelector("vite-error-overlay")?.shadowRoot?.textContent})').catch(() => null));
  console.log(errors); await screenshot('failure'); throw error;
} finally {
  await releaseLoading().catch(() => {}); await evaluate('window.unmountBoardwalk?.()').catch(() => {});
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
