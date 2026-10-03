// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-stance-recoil/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
const down = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
const up = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
async function fire() {
  await evaluate(`delete document.querySelector('.fps-viewport canvas').dataset.recoilMultiplier`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 480, button: 'left', clickCount: 1 });
  try {
    await wait(`document.querySelector('.fps-viewport canvas').dataset.recoilMultiplier!==undefined`, 3000);
    return await evaluate(`Number(document.querySelector('.fps-viewport canvas').dataset.recoilMultiplier)`);
  } finally { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 480, button: 'left', clickCount: 1 }); }
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready')); await click(button('Enter range')); await wait(phase('playing'));
  // Point above the targets so this check cannot complete the exercise mid-run.
  await evaluate(`document.dispatchEvent(new MouseEvent('mousemove',{movementY:-180}))`);
  const standing = await fire(); assert.equal(standing, 1); await delay(400);
  await down('c','KeyC'); const lowering = await fire(); assert(lowering>.75 && lowering<=1);
  await delay(650); const crouched = await fire(); assert.equal(crouched, .75);
  await screenshot('crouched-fire'); await up('c','KeyC'); await delay(700);
  await key('z','KeyZ'); await delay(1800);
  const expectedProne = await evaluate(`(async()=>{const {restoreProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {BIPOD_PROFILES}=await import('/src/game/weapon-support.ts');const p=restoreProfile(localStorage.getItem('blockplay.armory.v1'));const loadout=resolveLoadout(p);return .5*BIPOD_PROFILES[loadout.weapons[loadout.carriedFamilies[0]].bipod??'none'].recoil})()`);
  const prone = await fire(); assert.equal(prone, expectedProne);
  await screenshot('prone-fire'); await key('z','KeyZ'); const rising = await fire(); assert.equal(rising,1);
  await delay(1100); await key(' ','Space'); await delay(60); await down('c','KeyC');
  assert.equal(await evaluate(`JSON.parse(document.querySelector('.fps-viewport canvas').dataset.movement).grounded`),false);
  const airborne = await fire(); assert.equal(airborne,1); await up('c','KeyC');
  await key('Escape','Escape'); await wait(phase('paused'));
  assert.deepEqual(errors, []);
  console.log('PASS: actual shot multipliers', { standing, lowering, crouched, prone, rising, airborne });
} catch(e) {console.log(errors);await screenshot('failure').catch(()=>{});throw e;}
finally {ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);}
