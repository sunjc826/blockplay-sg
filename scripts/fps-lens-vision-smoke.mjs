// Lens effects and vision-device switching in a real browser: the sun's flare
// on a clear afternoon, dust glinting in haze, rain landing on the lens, and a
// night-vision tube and a thermal core swinging down, lighting, dying and
// swinging back up. Run a local Vite server and an isolated Chrome with remote
// debugging, as the other smokes do; screenshots land in .cache/fps-lens-vision.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-lens-vision/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); await fs.writeFile(new URL(name + '.jpg', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvasData = name => evaluate(`document.querySelector('.fps-game canvas')?.dataset[${JSON.stringify(name)}] ?? ''`);
const lens = async () => { const [flare, dust, drops] = (await canvasData('lens') || '0:0:0').split(':').map(Number); return { flare, dust, drops }; };
const motion = async () => { const [mount, fading] = (await canvasData('visionMotion') || '0:0').split(':').map(Number); return { mount, fading }; };
const look = (x, y = 0) => evaluate(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:${x},movementY:${y}}))`);
const conditions = patch => evaluate(`import('/src/game/environment-settings.ts').then(m=>m.setEnvironmentSettings(${JSON.stringify(patch)}))`);

/** Watches the device through one switch, sampling the canvas's record of it until it settles. */
async function watchSwitch(name, until, timeout = 6000) {
  const seen = [], start = Date.now();
  let shot = 0;
  while (Date.now() - start < timeout) {
    const m = await motion(); seen.push(m);
    // A few frames of the animation itself.
    if (shot < 3 && (m.mount > 0 && m.mount < 1 || m.fading > 0)) await screenshot(`${name}-${++shot}`);
    if (until(m)) return seen;
    await delay(40);
  }
  throw new Error(`${name}: never settled (${JSON.stringify(seen.slice(-3))})`);
}

async function enterRange(vision, environment) {
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.owned.push(${JSON.stringify(vision)});p.vision=${JSON.stringify(vision)};localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));
    localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify(${JSON.stringify({ celebration: 'none', reducedEffects: false, shadows: true, ...environment })}));})()`);
  await send('Page.reload'); await delay(1500); await wait(`document.readyState==='complete' && document.querySelectorAll('.location-card').length>0`);
  await click(`[...document.querySelectorAll('.location-card')].find(b=>b.querySelector('strong')?.textContent==='Marina Bay')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000);
  await click(button('Enter range')); await wait(phase('playing'));
  await delay(800);
}

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false });
  await wait(`document.querySelectorAll('.location-card').length>0`);

  // A clear afternoon: turn until the sun is in view.
  await enterRange('nvg-gen1', { weather: 'sunny', timeOfDay: 'afternoon' });
  let best = { flare: 0, step: -1 };
  for (let step = 0; step < 36; step++) {
    await look(60); await delay(120);
    const { flare } = await lens(); if (flare > best.flare) best = { flare, step };
  }
  if (best.flare === 0) {
    // The sun may be high: look up and sweep again.
    await look(0, -500);
    for (let step = 0; step < 36; step++) { await look(60); await delay(120); const { flare } = await lens(); if (flare > best.flare) best = { flare, step: step + 100 }; }
  }
  assert(best.flare > .3, `the sun came into view somewhere in a full turn (best ${best.flare})`);
  // Back to the best bearing.
  const back = best.step < 100 ? 36 - 1 - best.step : 36 - 1 - (best.step - 100);
  await look(-60 * back); await delay(700);
  console.log(`PASS flare: the sun flares at strength ${(await lens()).flare} once in view.`);
  await screenshot('flare-sunny');

  // Haze: the same view fills with glinting dust.
  await conditions({ weather: 'haze' });
  await wait(`Number((document.querySelector('.fps-game canvas').dataset.lens||'0:0').split(':')[1])>.5`, 15000);
  await delay(600); await screenshot('dust-haze');
  await look(400); await delay(400); await screenshot('dust-haze-away');
  console.log(`PASS dust: haze shows dust at ${(await lens()).dust}.`);

  // Rain: looking up into a storm collects drops on the lens, which then run.
  await conditions({ weather: 'thunderstorm' });
  await look(0, -250);
  await wait(`Number((document.querySelector('.fps-game canvas').dataset.lens||'0:0:0').split(':')[2])>8`, 20000);
  await look(0, 300); await delay(1800);
  await screenshot('rain-drops');
  console.log(`PASS rain: ${(await lens()).drops} drops on the lens.`);
  await conditions({ weather: 'sunny' });
  await wait(`Number((document.querySelector('.fps-game canvas').dataset.lens||'0:0:0').split(':')[2])===0`, 12000);
  console.log('PASS rain: the lens dries once out of the rain.');

  // Night, a first-generation tube: down, lit, then off, dying and back up.
  await conditions({ timeOfDay: 'night' });
  await delay(4000);
  await screenshot('night-naked');
  await key('n', 'KeyN');
  let seen = await watchSwitch('nvg-on', m => m.mount === 1);
  assert(seen.some(m => m.mount > 0 && m.mount < 1), 'the tube swings down rather than appearing');
  await wait(`(document.querySelector('.fps-game canvas').dataset.vision||'').startsWith('nvg')`, 3000);
  await delay(1800); await screenshot('nvg-lit');
  await key('n', 'KeyN');
  seen = await watchSwitch('nvg-off', m => m.mount === 0 && m.fading === 0);
  assert(seen.some(m => m.fading > 0), 'the phosphor fades before the tube swings up');
  assert(seen.some(m => m.fading === 0 && m.mount > 0 && m.mount < 1), 'then the tube swings up');
  console.log('PASS nvg: swings down, lights, fades and swings back up.');

  // A thermal core: the same switch, with its own boot and fold.
  await enterRange('thermal-t2', { weather: 'sunny', timeOfDay: 'noon' });
  await key('n', 'KeyN');
  await watchSwitch('thermal-on', m => m.mount === 1);
  await delay(250); await screenshot('thermal-booting');
  await delay(1200); await screenshot('thermal-lit');
  assert.equal(String(await canvasData('lens')).split(':')[0], '0.00', 'no sun flare in a thermal picture');
  await key('n', 'KeyN');
  seen = await watchSwitch('thermal-off', m => m.mount === 0 && m.fading === 0);
  assert(seen.some(m => m.fading > 0), 'the display folds away before the core swings up');
  console.log('PASS thermal: swings down, boots, folds away and swings back up.');

  assert.deepEqual(errors, [], 'no page exceptions');
  console.log(`Screenshots in ${output.pathname}`);
} finally {
  ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
}
