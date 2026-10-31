// Rain, splash pools and wet first-person materials in the actual district renderer.
// Software rendering: FPS_DEVICE_SCALE=0.5 FPS_SCREENSHOTS=0 reduces GPU load.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5186';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9236';
const output = new URL('../.cache/rain-effects/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 60000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { if (process.env.FPS_SCREENSHOTS === '0') return; const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); await fs.writeFile(new URL(name + '.jpg', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvasData = name => evaluate(`document.querySelector('.fps-game canvas')?.dataset[${JSON.stringify(name)}] ?? ''`);

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: Number(process.env.FPS_DEVICE_SCALE || 1), mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await wait(`document.querySelectorAll('.location-card').length>0`);
  await evaluate(`import('/src/game/environment-settings.ts').then(m=>m.setEnvironmentSettings({weather:'thunderstorm',timeOfDay:'noon',celebration:'none',reducedEffects:false}))`);
  await click(`[...document.querySelectorAll('.location-card')].find(b=>b.querySelector('strong')?.textContent==='Marina Bay')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000);
  // Exercise the touch entry path: headless Chrome cannot complete native pointer capture.
  await evaluate(`(()=>{window.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch'}));${button('Enter range')}.click()})()`);
  await wait(phase('playing'));
  await wait(`Number(document.querySelector('.fps-game canvas')?.dataset.wetSurfaces)>.6`,30000);
  await wait(`JSON.parse(document.querySelector('.fps-game canvas').dataset.rain).splashes>0`,30000);
  const full=JSON.parse(await canvasData('rain')); assert(full.drops>900); assert(full.splashes>0);
  await screenshot('storm-weapon');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 780, y: 270, id: 12 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 780, y: 510, id: 12 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(800); await screenshot('storm-body-splashes');
  await key('k','KeyK'); await delay(900); await screenshot('storm-inspection');
  await evaluate(`import('/src/game/environment-settings.ts').then(m=>m.setEnvironmentSettings({reducedEffects:true}))`);
  await wait(`JSON.parse(document.querySelector('.fps-game canvas').dataset.rain).drops<=225`,20000);
  const reduced=JSON.parse(await canvasData('rain')); assert(reduced.drops>0); await screenshot('reduced-effects');
  await evaluate(`import('/src/game/environment-settings.ts').then(m=>m.setEnvironmentSettings({weather:'sunny'}))`);
  await wait(`JSON.parse(document.querySelector('.fps-game canvas').dataset.rain).drops===0`,180000);
  await delay(700); assert.equal(JSON.parse(await canvasData('rain')).splashes,0);
  assert(Number(await canvasData('wetSurfaces'))>.1,'wet equipment dries gradually');
  await screenshot('after-rain');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({full,reduced,wetAfterRain:await canvasData('wetSurfaces'),errors}));
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
