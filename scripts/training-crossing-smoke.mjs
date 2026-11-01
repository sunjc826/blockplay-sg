// Vite :5197; isolated Chrome/Metal CDP :9357. Uses the actual GameMenu and
// FpsGame, declaring only the initial entry and exposing HUD/engine observations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5197';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9357';
const output = new URL('../.cache/training-crossing/', import.meta.url); await fs.mkdir(output, { recursive: true });
const absoluteImports = source => source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, q, p) => q + new URL(p, 'file:///src/components/source.tsx').pathname + q);
let source = absoluteImports(await fs.readFile(new URL('../src/components/FpsGame.tsx', import.meta.url), 'utf8'));
assert(source.includes('({ region: initialRegion })'));
source = source.replace('({ region: initialRegion })', '({ region: initialRegion, ...window.fixtureEntry })');
source = source.replace('  const region = scene.region;', '  const region = scene.region; useEffect(() => { window.trainingMounts++; }, []);');
source = source.replace('useState(initialFpsHud), [epoch, setEpoch] = useState(0);', 'useState(initialFpsHud), [epoch, setEpoch] = useState(0); window.trainingHud = hud;');
source = source.replace('onTravel: (transition, checkpoint) => {', 'onTravel: (transition, checkpoint) => { window.trainingCrossings.push({transition, checkpoint});');
source = source.replace('encik: () => speaking.current });', 'encik: () => speaking.current }); window.trainingEngine = engine.current;');
await fs.writeFile(new URL('FpsGame.tsx', output), source);
let menu = absoluteImports(await fs.readFile(new URL('../src/components/GameMenu.tsx', import.meta.url), 'utf8'));
assert(menu.includes("from '/src/components/FpsGame'"));
menu = menu.replace("from '/src/components/FpsGame'", "from './FpsGame.tsx'");
await fs.writeFile(new URL('GameMenu.tsx', output), menu);
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div>
<script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import GameMenu from './GameMenu.tsx';
import {createProfile,STORAGE_KEY} from '/src/game/armory-state.ts';import {setEnvironmentSettings} from '/src/game/environment-settings.ts';import '/src/styles.css';
setEnvironmentSettings({weather:'sunny',celebration:'none',timeOfDay:'noon'});
const root=createRoot(document.querySelector('#root'));let revision=0;window.trainingMounts=0;window.trainingCrossings=[];
window.mountTraining=(zone='harbourfront',entry={})=>{
 const p=createProfile();p.owned.push('plate-ceramic');p.plate='plate-ceramic';p.consumables['kit-bandage']=1;
 localStorage.setItem(STORAGE_KEY,JSON.stringify(p));localStorage.setItem('blockplay.menu.training',zone);
 window.fixtureEntry={spawn:{x:110.5,z:208.5,yaw:Math.PI,pitch:-.12},checkpoint:{health:64,armor:21,weapon:0,ammunition:[{magazine:7,reserve:40,cooldown:0,reloadRemaining:0},{magazine:11,reserve:60,cooldown:0,reloadRemaining:0}]},...entry};
 root.render(React.createElement(GameMenu,{key:++revision,screen:'training'}));
};window.unmountTraining=()=>root.unmount();window.mountTraining();
</script></body></html>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/training-crossing/fixture.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let serial = 0; const pending = new Map(), errors = [], blocked = [], evidence = [];
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
async function key(key, down = true) { await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key, code: key === 'Escape' ? 'Escape' : /^\d$/.test(key) ? 'Digit' + key : 'Key' + key.toUpperCase() }); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(r.data, 'base64')); }
async function click(selector, touch = false) {
  const p = await evaluate(`(()=>{const e=${selector};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
}
const button = text => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const zone = value => `document.querySelector('.fps-game')?.dataset.mapZone==='${value}'`;
async function blockLoading() { await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Fetch.enable', { patterns: [{ urlPattern: '*models/field-kit/*.glb', requestStage: 'Response' }] }); }
async function releaseLoading() { for (const requestId of blocked.splice(0)) await send('Fetch.continueRequest', { requestId }); await send('Fetch.disable'); }
async function record(label) { evidence.push({ label, ...await evaluate(`({zone:document.querySelector('.fps-game').dataset.mapZone,phase:trainingHud.phase,x:trainingHud.x,z:trainingHud.z,yaw:trainingHud.yaw,pitch:trainingHud.pitch,health:trainingHud.health,armor:trainingHud.armor,magazine:trainingHud.magazine,reserve:trainingHud.reserve,drill:document.querySelector('.fps-game').dataset.rangeDrill,mounts:trainingMounts,input:trainingHud.inputMode,locked:!!document.pointerLockElement,canvases:document.querySelectorAll('canvas').length})`) }); }
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait(`window.trainingHud?.phase==='ready' && !document.querySelector('.play-loading')`, 180000);
  await click(button('Continuous')); await click(button('Counter-fire'));
  await wait(`trainingHud.phase==='ready'`); await click(`document.querySelector('.fps-start-card .primary-button')`); await wait(`trainingHud.phase==='playing'`);
  await evaluate(`window.firstCanvas=document.querySelector('canvas')`);
  await key('5'); await key('5', false); await wait(`trainingHud.health>64 && !trainingHud.supplyUse`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('blockplay.armory.v1')).consumables['kit-bandage']`), 1, 'Practice does not debit the permanent inventory');
  const initial = await evaluate(`({health:trainingHud.health,armor:trainingHud.armor,magazine:trainingHud.magazine,reserve:trainingHud.reserve,mounts:trainingMounts})`);
  await screenshot('training-approach');
  await blockLoading(); await key('w'); await wait(`${zone('sentosa')} && trainingHud.phase==='loading'`); await key('w', false);
  assert(await evaluate(`document.pointerLockElement===firstCanvas && !!document.querySelector('.fps-district-crossing') && !document.querySelector('.fps-start-card')`));
  await screenshot('training-crossing'); await releaseLoading(); await wait(`${zone('sentosa')} && trainingHud.phase==='playing'`);
  await delay(350); const z = await evaluate('trainingHud.z'); await delay(400); assert(Math.abs(await evaluate('trainingHud.z') - z) < .08);
  assert.deepEqual(await evaluate(`({health:trainingHud.health,armor:trainingHud.armor,magazine:trainingHud.magazine,reserve:trainingHud.reserve,mounts:trainingMounts})`), initial);
  assert.equal(await evaluate(`trainingHud.belt.find(s=>s.kind==='bandage').count`), 0, 'Spent stock is not restored from the starting loadout');
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.rangeDrill`), 'continuous');
  assert.equal(await evaluate('trainingHud.arena'), null, 'Training never becomes expedition combat');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('blockplay.armory.v1')).exercises`), 0, 'Crossing does not award completion');
  assert(Math.abs(await evaluate('trainingHud.pitch') + .12) < .01);
  await record('training-sentosa'); await screenshot('training-sentosa');
  await key('Escape'); await key('Escape', false); await wait(`trainingHud.phase==='paused'`);
  assert.equal(await evaluate(`document.querySelector('select[aria-label="District"]').value`), 'sentosa', 'Actual GameMenu picker follows arrival without remounting');
  assert.match(await evaluate(`document.querySelector('.fps-armor-note').textContent`), /Targets return simulated fire/);
  await click(`document.querySelector('.fps-start-card .primary-button')`); await wait(`trainingHud.phase==='playing'`);
  await key('s'); await wait(`${zone('harbourfront')} && trainingHud.phase==='playing'`); await key('s', false);
  assert.equal(await evaluate('trainingMounts'), initial.mounts); assert(await evaluate(`document.pointerLockElement===firstCanvas`));
  await blockLoading(); await key('w'); await wait(`${zone('sentosa')} && trainingHud.phase==='loading'`); await key('w', false); await key('Escape'); await key('Escape', false);
  await releaseLoading(); await wait(`trainingHud.phase==='ready'`); assert.equal(await evaluate('!!document.pointerLockElement'), false);
  await record('escape-cancels-training-resume');
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="District"]');s.value='orchard';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`${zone('orchard')} && trainingHud.phase==='ready' && !document.querySelector('.play-loading')`);
  assert.equal(await evaluate('trainingMounts'), initial.mounts + 1, 'Manual district selection still starts a fresh training session');
  // Keep a real thumb captured while the training scene changes.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await evaluate(`mountTraining('sentosa',{spawn:{x:109.5,z:-203.5,yaw:0,pitch:-.12}})`);
  await wait(`${zone('sentosa')} && trainingHud.phase==='ready' && !document.querySelector('.play-loading')`);
  await click(button('90-second challenge'), true); await click(`document.querySelector('.fps-start-card .primary-button')`, true);
  await wait(`trainingHud.phase==='playing' && trainingHud.inputMode==='touch'`);
  const stick = await evaluate(`(()=>{const r=document.querySelector('[data-touch-stick="move"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...stick, id: 2 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x, y: stick.y - 45, id: 2 }] });
  await wait(`${zone('harbourfront')} && trainingHud.phase==='playing'`);
  const arrival = await evaluate('trainingHud.z'); await wait(`trainingHud.z < ${arrival - .7}`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(350);
  const released = await evaluate('trainingHud.z'); await delay(400); assert(Math.abs(await evaluate('trainingHud.z') - released) < .08);
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.rangeDrill`), 'timed');
  assert(await evaluate(`trainingHud.elapsed<5 && trainingHud.hits===0`), 'Destination has a fresh exercise');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await record('mobile-training-arrival'); await screenshot('mobile-training-arrival');
  await evaluate('unmountTraining()'); assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify({ evidence, errors, ok: true }, null, 2));
  console.log('PASS actual Training/GameMenu: both directions, no parent remount, picker sync/manual selection, retained canvas/capture/view/vitals/ammo/spent supplies, no completion bonus, counter-fire/drill preservation, release/Escape during loading, held/released mobile thumb and cleanup.');
} catch (error) { console.log(await evaluate('({hud:window.trainingHud,crossings:window.trainingCrossings,mounts:window.trainingMounts})').catch(() => null)); console.log(errors); await screenshot('failure'); throw error; }
finally { await releaseLoading().catch(() => {}); await evaluate('window.unmountTraining?.()').catch(() => {}); ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
