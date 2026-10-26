// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// Seeds a profile carrying the Two Eyes Open SAR 21 and the Blur Like Sotong P30,
// then drives the offset dot (X) and the laser-light (B) through the real engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-accessories/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Log.entryAdded' && /THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text)) errors.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvas = name => `document.querySelector('.fps-viewport canvas').dataset.${name}`;
const hint = `document.querySelector('[data-accessories]')?.textContent ?? ''`;
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const marina = `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`;
  await wait(`!!${marina}`);
  // Start from the default profile, then own and carry the two variants under test.
  await evaluate(`import('/src/game/armory-state.ts').then(m=>{const p=m.createProfile();p.owned=[...p.owned,'sar-twoeyes','p30-sotong'];p.guns[0].variant='sar-twoeyes';p.guns[2].variant='p30-sotong';localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));location.reload()})`);
  await delay(1000); await wait(`!!${marina}`);
  await click(marina); await wait(phase('ready')); await click(button('Enter range')); await wait(phase('playing'));
  assert.match(await evaluate(hint), /X OFFSET DOT/, 'the prism rifle offers its offset dot');
  assert.equal(await evaluate(canvas('rail')), '', 'the prism rifle carries no rail device');

  // Aimed through the 4x prism, then canted onto the dot and back.
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'right', clickCount: 1 });
  await wait(`Number(${canvas('aimProgress')})>.99`); await wait(`${canvas('scopeActive')}==='true'`);
  await delay(400); await screenshot('prism-ads');
  assert.equal(await evaluate(`document.querySelector('.fps-weapon-hud').dataset.sight`), 'scope');
  await key('x', 'KeyX');
  await wait(`Number(${canvas('cant')})>.99`); await wait(`${canvas('scopeActive')}==='false'`);
  await wait(`${canvas('reflexPowered')}==='true'`);
  assert.equal(await evaluate(`document.querySelector('.fps-weapon-hud').dataset.sight`), 'reflex', 'canted, the HUD treats it as a 1x sight');
  assert.match(await evaluate(hint), /X BACK TO SCOPE/);
  await delay(300); await screenshot('offset-dot');
  await key('x', 'KeyX'); await wait(`Number(${canvas('cant')})<.01`); await wait(`${canvas('scopeActive')}==='true'`);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'right', clickCount: 1 });

  // The sidearm's laser-light: on by default, B switches it.
  await key('2', 'Digit2'); await wait(`${canvas('rail')}==='laser-light:on'`);
  assert.match(await evaluate(hint), /B LASER-LIGHT ON/);
  await delay(400); await screenshot('laser-hip');
  await key('b', 'KeyB'); await wait(`${canvas('rail')}==='laser-light:off'`);
  assert.match(await evaluate(hint), /B LASER-LIGHT OFF/);
  await key('b', 'KeyB'); await wait(`${canvas('rail')}==='laser-light:on'`);
  // A shot still leaves the muzzle with the module fitted.
  const shots = await evaluate(`Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'left', clickCount: 1 });
  await wait(`Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)<${shots}`);
  assert.deepEqual(errors, []);
  console.log('fps accessories smoke passed');
} finally { ws.close(); }
