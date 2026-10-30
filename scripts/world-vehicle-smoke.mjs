// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9231.
// Uses Vite’s existing WebSocket dependency; no remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const WebSocket = createRequire(import.meta.resolve('vite'))('ws');
const origin = process.env.EXPEDITION_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.EXPEDITION_CHROME_ORIGIN || 'http://127.0.0.1:9231';
const output = new URL('../.cache/world-vehicle-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Chrome connection timed out')), 10000); ws.onopen = () => { clearTimeout(timer); resolve(); }; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(m.params.request.url)) mapRequests++;
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function tap(expression) { const p = await point(expression); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] }); await delay(40); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
try {
  console.log('Connected to isolated browser');
  await send('Runtime.enable'); await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true }); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait(`location.origin===${JSON.stringify(origin)} && !!document.body`);
  await evaluate(`sessionStorage.setItem('blockplay.fps-debug.v1', JSON.stringify({healthMultiplier:10,regeneration:true,combatEvents:false}));localStorage.setItem('blockplay-sg-environment-v1', JSON.stringify({timeOfDay:'noon',weather:'clear',reducedEffects:true,shadows:false,occlusion:false}));location.href='/world'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(phase('ready'), 60000);
  await wait(`!document.querySelector('.play-loading')`);
  console.log('District ready');
  await evaluate(`document.querySelector('[data-deployment-id="entry"]')?.click()`); await click(button('Enter district')); await wait(phase('playing'));
  const game = `document.querySelector('.expedition-game')`;
  const mounted = kind => `${game}?.dataset.vehicle===${JSON.stringify(kind)}`;
  await wait(`!!document.querySelector('[data-minimap-marker=car]')`);
  await wait(`!!document.querySelector('.fps-interact-prompt')`);
  await delay(250);
  console.log('Boarding vehicle');
  await key('e', 'KeyE'); await wait(mounted('car'));
  assert(await evaluate(`document.querySelector('.fps-vehicle-hud').textContent.includes('Driver')`));
  await key('c', 'KeyC'); await wait(`${game}.dataset.vehicleView==='first-person'`);
  await key('c', 'KeyC'); await wait(`${game}.dataset.vehicleView==='third-person'`);
  await key('v', 'KeyV');
  await wait(`document.querySelector('.fps-vehicle-seats [data-self]')?.textContent.includes('Gunner')`);
  await key('c', 'KeyC'); await wait(`${game}.dataset.vehicleView==='first-person'`);
  await key('v', 'KeyV'); await wait(`${game}.dataset.vehiclePersonalWeapon==='true'`);
  await wait(`document.querySelector('.world canvas')?.dataset.weaponVisible==='true'`);
  const personalAmmo = await evaluate(`Number(document.querySelector('.fps-ammo strong').firstChild.textContent)`);
  const passengerHullAmmo = await evaluate(`Number(${game}.dataset.vehicleAmmo)`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'left', clickCount: 1 });
  await delay(250);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 450, button: 'left', clickCount: 1 });
  await wait(`Number(document.querySelector('.fps-ammo strong').firstChild.textContent)<${personalAmmo}`);
  assert.equal(await evaluate(`Number(${game}.dataset.vehicleAmmo)`), passengerHullAmmo);
  await key('r', 'KeyR'); await wait(`document.querySelector('.fps-weapon-hud')?.dataset.reloading==='true'`);
  await wait(`document.querySelector('.fps-weapon-hud')?.dataset.reloading==='false'`, 10000);
  assert(await evaluate(`(()=>{const a=document.querySelector('.fps-ammo').getBoundingClientRect(),b=document.querySelector('.fps-vehicle-hud').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top})()`), 'Passenger ammo and hull panels do not overlap');
  await key('q', 'KeyQ'); await wait(`document.querySelector('.fps-weapon-hud')?.dataset.aiming==='true'`);
  await screenshot('passenger-first-person');
  await key('q', 'KeyQ');
  for (let n = 0; n < 2; n++) await key('v', 'KeyV');
  await key('c', 'KeyC'); await wait(`${game}.dataset.vehicleView==='third-person'`);
  await wait(`document.querySelector('.fps-vehicle-seats [data-self]')?.textContent.includes('Driver')`);
  const before = await evaluate(`Number(${game}.dataset.playerX)`);
  await key('w', 'KeyW', 1100); await delay(300);
  assert(await evaluate(`Number(${game}.dataset.playerX)`) > before + 1, 'Expedition car moves');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' });
  await key('d', 'KeyD', 650);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' });
  await key(' ', 'Space', 700);
  const rounds = await evaluate(`Number(${game}.dataset.vehicleAmmo)`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'left', clickCount: 1 });
  await delay(220);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 450, button: 'left', clickCount: 1 });
  await wait(`Number(${game}.dataset.vehicleAmmo)<${rounds}`);
  await key('e', 'KeyE'); await wait(mounted('on-foot'));
  assert(await evaluate(`!!document.querySelector('.fps-weapon-slider')`));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.reload'); await wait(phase('ready'), 60000);
  await wait(`!document.querySelector('.play-loading')`);
  await evaluate(`document.querySelector('[data-deployment-id="entry"]')?.click()`); await tap(button('Enter district')); await wait(phase('playing'));
  await wait(`!!document.querySelector('[data-touch-action=vehicle]')`);
  await tap(`document.querySelector('[data-touch-action=vehicle]')`); await wait(mounted('car'));
  assert(await evaluate(`!!document.querySelector('[data-touch-action=seat]')`));
  assert(await evaluate(`!!document.querySelector('[data-touch-action=altitude]')`));
  await tap(`document.querySelector('[data-touch-action=view]')`); await wait(`${game}.dataset.vehicleView==='first-person'`);
  await tap(`document.querySelector('[data-touch-action=view]')`); await wait(`${game}.dataset.vehicleView==='third-person'`);
  await tap(`document.querySelector('[data-touch-action=seat]')`);
  await tap(`document.querySelector('[data-touch-action=seat]')`); await wait(`${game}.dataset.vehiclePersonalWeapon==='true'`);
  assert(await evaluate(`!document.querySelector('[data-touch-action=fire]').disabled`));
  assert(await evaluate(`!!document.querySelector('[data-touch-action=reload]')`));
  assert(await evaluate(`(()=>{const a=document.querySelector('.fps-ammo').getBoundingClientRect(),b=document.querySelector('.fps-vehicle-hud').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top})()`), 'Mobile passenger readouts do not overlap');
  await screenshot('mobile-passenger-controls');
  await tap(`document.querySelector('[data-touch-action=vehicle]')`); await wait(mounted('on-foot'));
  await screenshot('expedition-mobile-controls');
  assert.equal(errors.length, 0, JSON.stringify(errors)); assert.equal(mapRequests, 0);
  console.log(JSON.stringify({ passed: true, checks: ['expedition boarding', 'driving', 'mounted fire', 'passenger firearms and reload', 'first-person view', 'seat switching', 'diagonal parking dismount', 'mobile boarding and brake', 'mobile dismount'], errors, mapRequests }));
} catch (error) {
  console.error('Browser errors:', errors);
  console.error(await evaluate(`({game:{...document.querySelector('.fps-game')?.dataset},prompt:document.querySelector('.fps-interact-prompt')?.textContent,notice:document.querySelector('.fps-vehicle-notice')?.textContent,loot:document.querySelector('.fps-loot-card')?.textContent})`).catch(() => null));
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await evaluate(`document.exitPointerLock?.()`).catch(() => {});
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
}
