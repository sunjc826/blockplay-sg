// Vite (5183) and an isolated Chrome CDP session (9237), or override origins.
// Runs against the actual design-gallery route; no paid API requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.PROXY_APP_ORIGIN || 'http://127.0.0.1:5183';
const chrome = process.env.PROXY_CHROME_ORIGIN || 'http://127.0.0.1:9237';
const out = new URL('../.cache/proxy-factions/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/faction-designs')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [], results = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  for (let i = 0; i < 150; i++) {
    if (await evaluate('document.querySelector(".fd-canvas")?.dataset.ready === "true"')) return;
    await pause(100);
  }
  throw Error('Gallery did not render');
}
async function click(label) {
  assert(await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});button?.click();return !!button;})()`), label);
  await pause(250); await ready();
}
async function capture(name) {
  const state = await evaluate(`({names:[...document.querySelectorAll('.fd-model-labels strong')].map(n=>n.textContent),draws:Number(document.querySelector('.fd-canvas').dataset.draws),finite:document.querySelector('.fd-canvas').dataset.finite,yaw:Number(document.querySelector('.fd-canvas').dataset.yaw),overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('canvas').length})`);
  assert.equal(state.names.length, 4); assert.equal(state.canvases, 1); assert.equal(state.finite, 'true'); assert(state.draws > 0 && state.draws <= 80); assert.equal(state.overflow, false, name);
  results.push({ name, ...state });
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(new URL(name + '.png', out), Buffer.from(shot.data, 'base64'));
  return state;
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await ready(); await pause(350);
  assert.deepEqual((await capture('desktop-front')).names, ['Lancer', 'Wayfinder', 'Bastion', 'Conductor']);
  await click('Rear'); assert(Math.abs((await capture('desktop-rear')).yaw - Math.PI) < .01);
  await click('Side'); assert(Math.abs((await capture('desktop-side')).yaw - Math.PI / 2) < .01);
  await click('Front'); await click('Grayscale');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('canvas')).filter"), 'grayscale(1)');
  await capture('desktop-grayscale');
  await click('Compare factions');
  assert.deepEqual((await capture('four-factions-grayscale')).names, ['Armed Forces', 'Black Kite', 'Freedom Force', 'Collective Corps']);
  await click('Four specialists'); await click('Grayscale');
  for (const pose of ['walking', 'crouched']) {
    await evaluate(`(()=>{const select=document.querySelector('select');select.value=${JSON.stringify(pose)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await pause(650); await ready(); assert.equal(await evaluate("document.querySelector('select').value"), pose); await capture('desktop-' + pose);
  }
  await evaluate("(()=>{const select=document.querySelector('select');select.value='standing';select.dispatchEvent(new Event('change',{bubbles:true}));})()"); await pause(250); await ready();
  const box = await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await click('Front');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 80, y: box.y, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 80, y: box.y, button: 'left', clickCount: 1 });
  await pause(200); assert(Math.abs(await evaluate("Number(document.querySelector('.fd-canvas').dataset.yaw)")) > .3, 'drag rotates models');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await click('Front'); await capture('mobile-front'); await click('Rear'); await capture('mobile-rear');
  const mobileBox = await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+80,y:r.y+80};})()");
  await click('Front');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mobileBox] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mobileBox.x + 65, y: mobileBox.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(150); assert(Math.abs(await evaluate("Number(document.querySelector('.fd-canvas').dataset.yaw)")) > .3, 'touch drag rotates models');
  await evaluate("document.querySelector('.fd-top a').click()"); await pause(250);
  assert.equal(await evaluate('location.pathname'), '/'); assert.equal(await evaluate("document.querySelectorAll('.fd-canvas canvas').length"), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', out), JSON.stringify({ results, errors, drag: true, touchDrag: true, navigationCleanup: true }, null, 2));
  console.log(`PASS: ${results.length} gallery views, all four specialists/current-faction comparison, mouse/touch rotation, poses, grayscale, mobile layout and navigation cleanup; no browser exceptions.`);
} finally {
  ws.close(); for (const entry of pending.values()) clearTimeout(entry.timer);
  await fetch(`${chrome}/json/close/${tab.id}`);
}
