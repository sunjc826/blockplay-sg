// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5211';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9371';
const output = new URL('../.cache/bot-difficulty/browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/settings`)}`, { method: 'PUT' })).json();
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
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const selection = id => `document.querySelector('[data-difficulty="${id}"]')`;
const selected = id => `${selection(id)}?.getAttribute('aria-pressed')==='true'`;
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await wait(`!!${selection('normal')}`);
  await evaluate(`localStorage.removeItem('blockplay-sg-bot-difficulty-v1')`);
  await send('Page.reload'); await wait(selected('normal'));
  for (const id of ['easy','hard','normal']) {
    await click(selection(id)); await wait(selected(id));
    assert.equal(await evaluate(`localStorage.getItem('blockplay-sg-bot-difficulty-v1')`),id);
    await send('Page.reload'); await wait(selected(id));
  }
  await screenshot('desktop-normal');
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click(selection('hard')); await wait(selected('hard'));
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Mobile settings must not overflow');
  await screenshot('portrait-hard');
  await click(selection('normal')); await wait(selected('normal'));
  assert.deepEqual(errors,[]); assert.equal(mapRequests,0);
  await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,presets:['easy','normal','hard'],persistence:true,desktop:true,portrait:true,errors,mapRequests},null,2));
  console.log('PASS settings: Normal default, all presets selectable and persistent, desktop/portrait layout, no runtime errors or map requests.');
} catch(error) {await screenshot('failure');throw error;}
finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
