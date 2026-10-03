// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/mg-review/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Log.entryAdded' && /THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text)) errors.push(m.params.entry.text);
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
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png', clip: await evaluate(`(()=>{const r=document.querySelector('.fps-viewport').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`) }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  for (const [family, variant, capacity] of [[3,'mag-issued',100], [4,'cis50-issued',50]]) {
    await evaluate(`(async()=>{const {createProfile,equip}=await import('/src/game/armory-state.ts');const p=equip(createProfile(), '${variant}', ${family});localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));location.reload()})()`);
    await delay(400);
    await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
    await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
    await wait(phase('ready')); await click(button('Enter range')); await wait(phase('playing'));
    await wait(`${ammo}===${capacity}`);
    await key('w','KeyW',1000); await delay(2500);
    await screenshot(variant+'-hip');
    if(family===4) await key('z','KeyZ');
    await key('q','KeyQ');
    await wait(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)>.99`);
    await screenshot(variant+'-ads');
    assert.equal(await evaluate(`document.querySelector('.fps-viewport canvas').dataset.scopeActive`),'false');
    assert.equal(await evaluate(`!!document.querySelector('.fps-crosshair')`),false);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:850,y:500,button:'left',clickCount:1});
    await delay(220);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:850,y:500,button:'left',clickCount:1});
    await wait(`${ammo}<${capacity}`);
    await key('r','KeyR');
    await wait(`document.querySelector('.fps-viewport canvas').dataset.reloadStage==='MAG OUT'`);
    await screenshot(variant+'-reload');
    await wait(`${ammo}===${capacity}`,15000);
    await wait(`document.querySelector('.fps-viewport canvas').dataset.reloadStage===''`);
    await key('q','KeyQ'); await wait(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)>.99`);
    await screenshot(variant+'-after-reload');
    await key('Escape','Escape'); await wait(phase('paused'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: FN MAG and CIS 50MG hip/ADS, braced heavy-MG firing, hinged-cover reload and restored sights; no shader or runtime errors');
} finally {ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);}
