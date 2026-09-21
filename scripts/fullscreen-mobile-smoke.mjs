// Immersive play on a phone, in both orientations, driven by real touch events.
// `pnpm test:fullscreen` covers the desktop path; this one covers what a phone
// actually shows: the scene has to own the whole screen, and nothing you read
// or press may sit under a notch, a status bar or the home indicator.
// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const pace = Math.max(1, Number(process.env.TOUCH_SMOKE_PACE) || 1);
const output = new URL('../.cache/fullscreen-mobile-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, index) => ({ ...p, id: index + 1 })) });
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control: '+${JSON.stringify(expression)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`); }
async function tap(expression) { const p = await point(expression); await touch('touchStart', [p]); await delay(50); await touch('touchEnd', []); await delay(150); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const startCardButton = `[...document.querySelectorAll('.fps-start-card button')].find(b=>/Enter range|Resume exercise/.test(b.textContent))`;
/** Every box this smoke reasons about, in one round trip. */
const LAYOUT = `(()=>{const game=document.querySelector('.fps-game');
  const box=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();
    return {top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),left:Math.round(r.left)};};
  return {
    flow:[...game.children].filter(child=>getComputedStyle(child).display!=='none'&&getComputedStyle(child).position==='static').map(child=>child.className.toString()),
    canvas:box('.fps-viewport canvas'), badges:box('.fps-top'), toolbar:box('.fps-toolbar'),
    commsShown:(()=>{const log=document.querySelector('.fps-comms');return !!log&&getComputedStyle(log).display!=='none';})(),
    stick:box('[data-touch-stick=move]'), card:box('.fps-start-card'),
    pilotInCard:!!document.querySelector('.fps-start-card .fps-pilot-panel')};})()`;
const layout = () => evaluate(LAYOUT);
/** Stand in for env(safe-area-inset-*), which CDP cannot emulate. */
const notch = insets => evaluate(`(()=>{const g=document.querySelector('.fps-game');${Object.entries(insets).map(([side, px]) => `g.style.setProperty('--safe-${side}','${px}px');`).join('')}})()`);

async function orientation(label, width, height, insets) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Page.reload'); await delay(900);
  await wait(`document.querySelectorAll('.mode-card').length>2`);
  await tap(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready'));
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.touch`), 'on', `${label}: the range offers touch controls`);
  await tap(`document.querySelector('[aria-label="Fullscreen range"]')`); await delay(600);
  assert(await evaluate(`document.querySelector('.fps-game').classList.contains('is-immersive')`), `${label}: fullscreen enters immersive play`);

  // Immersive play is all scene: no bar of page furniture may keep a strip of it.
  const menu = await layout();
  assert.deepEqual(menu.flow, [], `${label}: nothing but the scene is left in flow (${JSON.stringify(menu.flow)})`);
  assert(menu.pilotInCard, `${label}: the AI pilot controls stay on the start card`);
  assert(!menu.commsShown, `${label}: the comms log does not cover the start card`);
  assert.deepEqual(menu.canvas, { top: 0, right: width, bottom: height, left: 0 }, `${label}: the scene fills the screen (${JSON.stringify(menu.canvas)})`);

  // A cutout moves the scene and the HUD in together; nothing is left under it.
  await notch(insets); await delay(400);
  const inset = await layout();
  const safe = { top: insets.top, right: width - insets.right, bottom: height - insets.bottom, left: insets.left };
  assert.deepEqual(inset.canvas, safe, `${label}: the scene clears the cutout (${JSON.stringify(inset.canvas)})`);
  for (const [name, edge] of [['badges', inset.badges], ['toolbar', inset.toolbar], ['card', inset.card]]) {
    assert(edge.top >= safe.top && edge.bottom <= safe.bottom && edge.left >= safe.left && edge.right <= safe.right,
      `${label}: the ${name} sit inside the safe area (${JSON.stringify(edge)} in ${JSON.stringify(safe)})`);
  }
  await screenshot(`${label}-menu`);

  await tap(startCardButton); await wait(phase('playing')); await delay(1000);
  const playing = await layout();
  assert.deepEqual(playing.flow, [], `${label}: play leaves nothing in flow either`);
  assert.deepEqual(playing.canvas, safe, `${label}: the scene still clears the cutout while playing`);
  assert(playing.commsShown, `${label}: the comms log returns once the menu closes`);
  // The thumb layer insets itself; inside the padded shell that would double up.
  assert(playing.stick.left >= safe.left && playing.stick.bottom <= safe.bottom,
    `${label}: the move stick is inside the safe area (${JSON.stringify(playing.stick)})`);
  assert(playing.stick.left < safe.left + 40 && playing.stick.bottom > safe.bottom - 40,
    `${label}: the move stick is not inset twice (${JSON.stringify(playing.stick)})`);
  await screenshot(`${label}-playing`);
}

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // A notched phone upright, then the same phone turned: the cutout moves to
  // the sides and the home indicator shrinks.
  await orientation('portrait', 390, 844, { top: 47, right: 0, bottom: 34, left: 0 });
  await orientation('landscape', 844, 390, { top: 0, right: 47, bottom: 21, left: 47 });
  assert.equal(mapRequests, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: immersive phone play — the scene owns the screen, no flow bar survives fullscreen, the comms log yields to the menu, and the HUD, toolbar and thumb sticks stay inside the safe area in both orientations.');
} catch (error) { await screenshot('fullscreen-mobile-failure'); throw error; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
