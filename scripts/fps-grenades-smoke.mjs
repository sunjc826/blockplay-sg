// Run Vite with HMR off and Chrome on the ports below.
// Exercises the real grenade picker, cook/throw, holster and inventory paths.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5183';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9339';
const output = new URL('../.cache/fps-grenades/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }

async function key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvas = `document.querySelector('.fps-game canvas')`;
const grenade = `${canvas}?.dataset.grenade`;
const count = `Number(document.querySelector('.fps-belt-slot[data-kind="grenade"] b')?.textContent)`;
async function fire(hold) { await send('Input.dispatchMouseEvent', { type: hold ? 'mousePressed' : 'mouseReleased', x: 640, y: 430, button: 'left', clickCount: 1 }); }
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(`document.querySelectorAll('.location-card').length>0`);
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'grenade-frag':2,'grenade-smoke':1,'grenade-stun':1,'grenade-durian':1};localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.reload'); await delay(1500);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000); await click(button('Enter range')); await wait(phase('playing'));
  assert.equal(await evaluate(count), 5); assert.equal(await evaluate(`document.querySelectorAll('.fps-belt-slot').length`), 6);
  await key('9', 'Digit9'); await wait(`(${grenade}||'').includes('grenade-frag:ready')`);
  await key('1', 'Digit1'); await wait(`!(${grenade})`);
  assert.equal(await evaluate(count), 5, 'putting away before pulling the pin spends nothing');
  console.log('PASS: sixth slot, key 9, draw and holster without spending.');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 450 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '9', code: 'Digit9' });
  await wait(`!!document.querySelector('.fps-grenade-picker')`);
  assert.equal(await evaluate(`document.querySelectorAll('.fps-grenade-picker .fps-food-option').length`), 5);
  // Smoke is the third of five at about five o'clock.
  for (let i = 1; i <= 5; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640 + i * 12, y: 450 + i * 16 });
  await wait(`document.querySelectorAll('.fps-grenade-picker .fps-food-option')[2]?.hasAttribute('data-selected')`);
  await screenshot('picker'); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '9', code: 'Digit9' });
  await wait(`!document.querySelector('.fps-grenade-picker')`);
  await key('9', 'Digit9'); await wait(`(${grenade}||'').includes('grenade-smoke:ready')`); await delay(500);
  await fire(true); await wait(`(${grenade}||'').includes(':cooking:')`);
  await key('1', 'Digit1'); assert((await evaluate(grenade)).includes('smoke:cooking'), 'a live pin cannot be holstered');
  await screenshot('cooking'); await fire(false);
  await wait(`Number(${canvas}?.dataset.grenades)>0`); assert.equal(await evaluate(count), 4);
  await wait(`Number(${canvas}?.dataset.grenadeEvents)>0`, 6000); await screenshot('smoke');
  console.log('PASS: hold picker, pinned smoke, cook ring, live pin prevents holster, release throws and consumes once.');
  await key('g', 'KeyG'); await wait(`(${grenade}||'').includes('grenade-frag:ready')`); await delay(450);
  await fire(true); await wait(`(${grenade}||'').includes(':cooking:')`);
  await delay(4000); await fire(false);
  await wait(`!(${grenade})`);
  assert.equal(await evaluate(count), 3, 'a cooked frag spends exactly one');
  const hp = await evaluate(`document.querySelector('.fps-vitals')?.textContent || document.querySelector('.fps-game')?.textContent`);
  console.log('PASS: G readies the next grenade; cooking past the fuse detonates in hand.', hp.slice(0, 120));
  await screenshot('in-hand');

  // A phone uses the same slot as its hold/release trigger once the prop is ready.
  await key('Escape', 'Escape');
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'grenade-smoke':1,'grenade-durian':1};localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.navigate', { url: `${origin}/debug` });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const touch = async (expression, hold = 80) => { const p = await point(expression); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] }); await delay(hold); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await touch(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000); await touch(button('Enter range')); await wait(phase('playing'));
  await wait(`document.querySelector('.fps-game')?.dataset.touch==='on'`);
  await delay(600); // Let touch entry finish its immersive resize before sampling button coordinates.
  const slot = `document.querySelector('.fps-belt-slot[data-kind="grenade"]')`;
  await touch(slot); await wait(`(${grenade}||'').includes('smoke:ready')`); await delay(500);
  await touch(`document.querySelector('[data-touch-action="aim"]')`);
  await wait(`document.querySelector('[data-touch-action="aim"]')?.getAttribute('aria-pressed')==='true'`);
  await touch(slot, 350); await wait(`Number(${canvas}?.dataset.grenades)>0`);
  assert.equal(await evaluate(count), 1);
  await screenshot('touch-portrait');
  console.log('PASS: phone slot readies, cooks and throws with touch hold/release.');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await delay(600); await screenshot('touch-landscape');
  await touch(`document.querySelector('button[aria-label="Choose grenade"]')`);
  await wait(`!!document.querySelector('.fps-grenade-picker')`);
  await touch(`document.querySelectorAll('.fps-grenade-picker .fps-food-option')[1]`);
  assert.equal(await evaluate(`${slot}?.hasAttribute('data-chosen')`), true);
  console.log('PASS: touch chooser pins a grenade in landscape.');

  // Solo arena uses the authority timer and the same snapshot-driven visuals.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'grenade-smoke':1};p.quickItem='grenade-smoke';localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.navigate', { url: `${origin}/debug` });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Solo vs bots'))`);
  await evaluate(`(()=>{const range=document.querySelector('#lan-bot-count');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range,'0');range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click(button('Deploy against bots')); await wait(phase('ready'), 60000);
  await click(button('Start match')); await wait(phase('playing'));
  await key('9', 'Digit9'); await wait(`(${grenade}||'').includes('smoke:ready')`); await delay(450);
  await fire(true); await delay(200); await fire(false);
  await wait(`Number(${canvas}?.dataset.grenades)>0`); assert.equal(await evaluate(count), 0);
  await wait(`Number(${canvas}?.dataset.grenadeEvents)>0`, 6000); await screenshot('arena-smoke');
  console.log('PASS: solo arena host accepts the throw, spends once and publishes the smoke.');
  assert.deepEqual(errors, []);
} catch (error) {
  console.log(errors, await evaluate(`({phase:document.querySelector('.fps-game')?.dataset.phase,grenade:${grenade},count:${count},message:document.querySelector('.fps-message')?.textContent})`).catch(()=>null));
  await screenshot('failure'); throw error;
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
