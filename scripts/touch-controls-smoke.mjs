// On-screen thumb controls, driven by real touch events in an emulated phone.
// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency, no remote map requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.TOUCH_APP_ORIGIN || process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.TOUCH_CHROME_ORIGIN || process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
// Software renderers draw a few frames a second; scale every hold so the same
// assertions still observe real movement.
const pace = Math.max(1, Number(process.env.TOUCH_SMOKE_PACE) || 1);
const output = new URL('../.cache/touch-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms * pace));
async function wait(expression, timeout = 25000 * pace) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`); }
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, index) => ({ ...p, id: index + 1 })) });
async function tap(expression) { const p = await point(expression); await touch('touchStart', [p]); await delay(40); await touch('touchEnd', []); await delay(80); }
/** Plant a thumb, slide it by (dx, dy), hold, then lift. */
async function push(expression, dx, dy, hold) {
  const p = await point(expression);
  await touch('touchStart', [p]);
  await touch('touchMove', [{ x: p.x + dx, y: p.y + dy }]);
  await delay(hold);
  await touch('touchEnd', []);
  await delay(120);
  return p;
}
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const where = `(()=>{const g=document.querySelector('.fps-game');return {x:Number(g.dataset.playerX),z:Number(g.dataset.playerZ),yaw:Number(document.querySelector('[data-minimap-player]')?.dataset.yaw)}})()`;
const travelled = (from, to) => Math.hypot(to.x - from.x, to.z - from.z);
const stick = kind => `document.querySelector('[data-touch-stick=${kind}]')`;
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  // A phone held in landscape, with a real touchscreen: this is what decides
  // that `(pointer: coarse)` matches and the thumb layer is drawn at all.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.reload'); await delay(600);
  assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`), true, 'Emulated phone reports a coarse pointer');

  await wait(`document.querySelectorAll('.mode-card').length>2`);
  await tap(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready'));
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.touch`), 'on', 'The range offers touch controls on a phone');
  // Entering by touch must not ask for pointer capture; there is no mouse to capture.
  await evaluate(`window.captureRequests=0;const original=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=function(...args){window.captureRequests++;return original.apply(this,args)}`);
  await tap(button('Enter range'));
  await wait(phase('playing'));
  assert.equal(await evaluate('window.captureRequests'), 0, 'Touch play never requests pointer capture');
  assert.equal(await evaluate(`document.querySelectorAll('.touch-layer').length`), 1, 'The thumb layer is drawn over the scene');
  assert.equal(await evaluate(`document.querySelectorAll('[data-touch-stick]').length`), 2, 'Both sticks are present');
  await screenshot('range-touch-layer');

  // Moving: a pushed stick walks, and letting go stops.
  const spawn = await evaluate(where);
  await push(stick('move'), 0, -60, 700);
  const walked = await evaluate(where);
  assert(travelled(spawn, walked) > 1, `The move stick walks (${JSON.stringify({ spawn, walked })})`);
  await delay(300);
  assert(travelled(walked, await evaluate(where)) < 0.05, 'Lifting the thumb stops the player');

  // Analog: the same hold at half deflection covers meaningfully less ground.
  const beforeHalf = await evaluate(where);
  await push(stick('move'), 0, -18, 700);
  const half = travelled(beforeHalf, await evaluate(where));
  const beforeFull = await evaluate(where);
  await push(stick('move'), 0, -60, 700);
  const full = travelled(beforeFull, await evaluate(where));
  assert(half > 0.2 && half < full * 0.75, `A half-pushed stick walks slower than a full one (${JSON.stringify({ half, full })})`);

  // Looking: the right stick turns the camera, and the minimap heading follows.
  const beforeLook = await evaluate(where);
  await push(stick('look'), 60, 0, 500);
  const afterLook = await evaluate(where);
  assert(afterLook.yaw < beforeLook.yaw - 0.15, `The look stick turns right (${JSON.stringify({ beforeLook, afterLook })})`);
  await delay(300);
  assert(Math.abs((await evaluate(where)).yaw - afterLook.yaw) < 0.01, 'Lifting the thumb stops the turn');

  // The trigger fires, and the same thumb can still correct the aim mid-burst.
  const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
  const loaded = await evaluate(ammo), aimed = await evaluate(where);
  await push(`document.querySelector('[data-touch-action=fire]')`, 40, 0, 500);
  assert(await evaluate(ammo) < loaded, 'The FIRE button fires');
  assert(Math.abs((await evaluate(where)).yaw - aimed.yaw) > 0.05, 'Holding FIRE and sliding still aims');

  // Crouch latches rather than needing a held finger, and the menu is reachable.
  await tap(`document.querySelector('[data-touch-action=crouch]')`);
  assert.equal(await evaluate(`document.querySelector('[data-touch-action=crouch]').getAttribute('aria-pressed')`), 'true', 'Crouch latches on a tap');
  await tap(`document.querySelector('[data-touch-action=menu]')`);
  await wait(phase('paused'));
  assert.equal(await evaluate(`document.querySelectorAll('.touch-layer').length`), 0, 'The layer gives the viewport back to the pause card');
  await screenshot('range-paused');

  // The walk/drive districts carry the same sticks.
  await tap(`[...document.querySelectorAll('.mode-card')].find(b=>b.textContent.includes('Marina 3D'))`);
  await wait(`!!document.querySelector('.marina-game[data-touch=on]')`);
  await wait(`!!document.querySelector('[data-touch-stick=move]')`);
  const explored = `Number(document.querySelector('.session-strip strong').firstChild.textContent)`;
  await push(stick('move'), 0, -60, 900);
  assert(await evaluate(explored) > 0, 'The district stick walks the player');
  await tap(button('Drive'));
  await wait(`!!document.querySelector('[data-touch-action=brake]')`);
  await evaluate(`document.querySelector('.marina-viewport').scrollIntoView({block:'center'})`); await delay(150);
  await screenshot('district-touch-layer');

  assert.deepEqual(errors, [], 'No uncaught page errors');
  assert.equal(mapRequests, 0, 'Touch play makes no Google requests');
  console.log('touch-controls smoke passed');
} finally {
  ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
}
