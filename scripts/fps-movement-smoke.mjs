// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-movement/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(m.params.request.url)) mapRequests++;
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
const motion = `JSON.parse(document.querySelector('.fps-viewport canvas').dataset.movement)`;
const down = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
const up = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
async function record(ms) {
  return evaluate(`new Promise(resolve=>{const rows=[],end=performance.now()+${ms};function sample(){rows.push(${motion});if(performance.now()<end)requestAnimationFrame(sample);else resolve(rows)}sample()})`);
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready')); await click(button('Enter range')); await wait(phase('playing'));
  await down('w', 'KeyW'); const start = await record(500); await up('w', 'KeyW'); const stop = await record(400);
  assert(start.some(s=>s.speed>.1&&s.speed<2), 'walk accelerates through intermediate speeds');
  assert(start.at(-1).speed>2, 'walk reaches cruising speed');
  assert(stop.some(s=>s.speed>.1), 'release has braking momentum'); assert(stop.at(-1).speed<.1, 'braking settles promptly');
  await down('c', 'KeyC'); const crouch = await record(650);
  assert(crouch.some(s=>s.eye>1.2&&s.eye<1.7), 'crouch height blends'); assert(Math.abs(crouch.at(-1).eye-1.15)<.01);
  await screenshot('crouch'); await up('c', 'KeyC'); await delay(650);
  await key('z','KeyZ'); const prone = await record(1000);
  assert(prone.some(s=>s.eye>.65&&s.eye<1.6), 'prone height blends'); assert(Math.abs(prone.at(-1).eye-.55)<.01);
  await screenshot('prone'); await key(' ', 'Space'); const noJump = await record(200); assert(noJump.every(s=>s.feet===0), 'prone cannot jump');
  await down('w','KeyW'); const crawl=await record(450); await up('w','KeyW'); assert(crawl.at(-1).speed<1&&crawl.at(-1).speed>.1,'slow crawl');
  await key('z','KeyZ'); await delay(1000); await key(' ','Space'); const jump = await record(1100);
  assert(jump.some(s=>s.feet>.4&&!s.grounded),'jump leaves ground'); assert(jump.at(-1).grounded&&jump.at(-1).feet===0,'jump lands');
  assert(jump.some(s=>s.impact<-.015),'landing compresses'); assert(Math.abs(jump.at(-1).impact)<.005,'landing recovers');
  await screenshot('standing');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await down('c','KeyC'); await delay(650); assert(Math.abs((await evaluate(motion)).eye-1.15)<.01,'reduced motion keeps stance functional');
  await up('c','KeyC'); await key('Escape','Escape'); await wait(phase('paused'));
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('samples.json', output), JSON.stringify({ start, stop, crouch, prone, crawl, jump }, null, 2));
  console.log('PASS: acceleration/braking, crouch/prone transitions, crawl, jump/landing/recovery, reduced-motion stance, no runtime errors.');
} catch(e) {console.log(errors);await screenshot('failure').catch(()=>{});throw e;}
finally {ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);}
