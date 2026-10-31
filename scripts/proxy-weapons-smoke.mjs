// Vite (5183) and an isolated Chrome CDP session (9237), or override origins.
// Runs against the actual design-gallery route; no paid API requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.PROXY_WEAPONS_APP_ORIGIN || 'http://127.0.0.1:5183';
const chrome = process.env.PROXY_WEAPONS_CHROME_ORIGIN || 'http://127.0.0.1:9237';
const out = new URL('../.cache/proxy-weapons/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/faction-designs?study=weapons')}`, { method: 'PUT' })).json();
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
  const state = await evaluate(`({model:document.querySelector('.fd-canvas').dataset.model,draws:Number(document.querySelector('.fd-canvas').dataset.draws),triangles:Number(document.querySelector('.fd-canvas').dataset.triangles),yaw:Number(document.querySelector('.fd-canvas').dataset.yaw),overflow:document.documentElement.scrollWidth>innerWidth,canvases:document.querySelectorAll('canvas').length})`);
  assert.equal(state.canvases, 1); assert(state.draws > 0 && state.draws <= 6); assert(state.triangles > 0 && state.triangles < 6500); assert.equal(state.overflow, false, name);
  results.push({ name, ...state });
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(new URL(name + '.png', out), Buffer.from(shot.data, 'base64'));
  return state;
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await ready(); await pause(350);
  const ids=['ff-strider','ff-longwatch','cc-gatekeeper','cc-network'];
  for(const [index,id] of ids.entries()) {
    await evaluate(`document.querySelectorAll('.fd-weapon-picker button')[${index}].click()`);await pause(200);await ready();
    for(const angle of ['Profile','Other side','Oblique','Front']) {
      await click(angle);assert.equal((await capture(id+'-'+angle.toLowerCase().replaceAll(' ','-'))).model,id);
    }
    await click('Profile');await click('Grayscale');await capture(id+'-grayscale');await click('Grayscale');
  }
  const box = await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await click('Profile');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 80, y: box.y, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 80, y: box.y, button: 'left', clickCount: 1 });
  await pause(150);assert(Math.abs(await evaluate("Number(document.querySelector('.fd-canvas').dataset.yaw)"))>.3);
  await click('Profile');assert.equal(await evaluate("Number(document.querySelector('.fd-canvas').dataset.yaw)"),0,'active preset resets a dragged view');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for(const [index,id]of ids.entries()) {await evaluate(`document.querySelectorAll('.fd-weapon-picker button')[${index}].click()`);await pause(200);await ready();await capture('mobile-'+id);}
  const mobileBox=await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+80,y:r.y+80};})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mobileBox]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mobileBox.x+65,y:mobileBox.y}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(150);
  assert(Math.abs(await evaluate("Number(document.querySelector('.fd-canvas').dataset.yaw)"))>.3);
  await evaluate("document.querySelector('.fd-study-links a').click()");await pause(350);await ready();
  assert.equal(await evaluate('location.search'),'');assert.equal(await evaluate("document.querySelectorAll('.fd-weapon-picker').length"),0);
  assert.equal(await evaluate("document.querySelectorAll('canvas').length"),1);
  assert.equal(await evaluate("document.body.textContent.includes('Collective Corps')"),true);
  await evaluate("document.querySelector('.fd-top a').click()");await pause(200);assert.equal(await evaluate('location.pathname'),'/');
  assert.equal(await evaluate("document.querySelectorAll('.fd-canvas canvas').length"),0);
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', out), JSON.stringify({ results, errors, drag: true, touchDrag: true, navigationCleanup: true }, null, 2));
  console.log(`PASS: ${results.length} weapon views, four exterior models at four angles, grayscale, mouse/touch rotation, preset reset, mobile layout and operator navigation; no browser exceptions.`);
} finally {
  ws.close(); for (const entry of pending.values()) clearTimeout(entry.timer);
  await fetch(`${chrome}/json/close/${tab.id}`);
}
