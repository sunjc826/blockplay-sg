// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/store-tour-browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/store`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { const timer=setTimeout(()=>reject(new Error('Chrome connection timeout')),20000); ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=reject; });
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
const tourStep = id => `document.querySelector('.store-tour')?.dataset.step===${JSON.stringify(id)}`;
const next = () => click(`document.querySelector('.store-tour-next')`);
async function verify(label) {
  await delay(250);
  const layout = await evaluate(`(()=>{
    const p=document.querySelector('.store-tour').getBoundingClientRect(), s=document.querySelector('.store-tour-spotlight').getBoundingClientRect();
    return {inside:p.left>=0&&p.top>=0&&p.right<=innerWidth+1&&p.bottom<=innerHeight+1, clear:p.left>=s.right||p.right<=s.left||p.top>=s.bottom||p.bottom<=s.top, overflow:document.documentElement.scrollWidth>innerWidth+1, panel:[p.x,p.y,p.width,p.height],spot:[s.x,s.y,s.width,s.height]};
  })()`);
  assert(layout.inside, `${label}: coach stays visible ${JSON.stringify(layout)}`);
  assert(layout.clear, `${label}: coach does not cover target ${JSON.stringify(layout)}`);
  assert(!layout.overflow, `${label}: no horizontal overflow`);
  await screenshot(label); console.log(`Verified ${label}`);
}
try {
  console.log('Connected to Chrome');
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  for (const [name, width, height, touch] of [['desktop',1440,1000,false],['mobile',390,844,true],['landscape',844,390,true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
    await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
    console.log(`Loading ${name} store`);
    await send('Page.navigate', {url:`${origin}/store`});
    await wait(`!!document.querySelector('.store-tour-trigger')`,60000);
    const before = await evaluate(`document.querySelector('.armory-navigation').getBoundingClientRect().top+scrollY`);
    await click(`document.querySelector('.store-tour-trigger')`); await wait(tourStep('wallet')); await verify(`${name}-01-wallet`);
    assert.equal(await evaluate(`document.querySelector('.armory-navigation').getBoundingClientRect().top+scrollY`),before,'Tour does not shift the shop layout');
    assert(await evaluate(`document.querySelector('.store-tour').parentElement.parentElement===document.body`),'Overlay is portalled outside the shop');
    // Actual mouse/touch coordinates exercise scrim hit testing.
    if (touch) {
      // Explicit touch on the first Next; the remaining pointer clicks also run
      // with mobile sizing and touch emulation enabled.
      const p=await point(`document.querySelector('.store-tour-next')`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else await next();
    await wait(tourStep('categories')); await verify(`${name}-02-tab`);
    assert(await evaluate(`document.querySelector('.store-tour-next').disabled`));
    await click(`document.querySelector('#shop-tab-weapon')`); // Dimmed tab must be blocked.
    assert(await evaluate(`document.querySelector('.store-tour-next').disabled`));
    await click(`document.querySelector('#shop-tab-armor')`); await wait(`!document.querySelector('.store-tour-next').disabled`);
    await next(); await wait(tourStep('carry')); await verify(`${name}-03-carry`); await next();
    await wait(tourStep('compare')); await click(`document.querySelector('#shop-tab-weapon')`); await verify(`${name}-04-card`);
    assert(await evaluate(`document.querySelector('.store-tour-next').disabled`),'Inspection waits for a real card selection');
    const wallet = await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
    await click(`document.querySelector('.armory-item')`); await wait(`!document.querySelector('.store-tour-next').disabled`); await verify(`${name}-05-dossier`);
    assert.equal(await evaluate(`localStorage.getItem('blockplay.armory.v1')`),wallet,'Preview requires no purchase');
    await next(); await wait(tourStep('supplies')); await verify(`${name}-06-supplies`);
    await click(`document.querySelector('#shop-tab-utility')`); await next();
    await wait(tourStep('deploy')); await verify(`${name}-07-deploy`); await next();
    await wait(`!document.querySelector('.store-tour')`);
    await click(`document.querySelector('.store-tour-trigger')`); await wait(tourStep('wallet'));
    await key('Tab','Tab');
    assert(await evaluate(`!!document.activeElement.closest('.store-tour, .armory-wallet')`),'Tab stays within the active coach and spotlight');
    await key('Escape','Escape'); await wait(`!document.querySelector('.store-tour')`);
    assert(await evaluate(`document.activeElement.matches('.store-tour-trigger')`),'Close restores focus to the tour trigger');
    console.log(`PASS: ${name} tour, geometry, click blocking, preview, completion, replay and keyboard exit.`);
  }
  assert.deepEqual(errors,[]); assert.equal(mapRequests,0);
} catch(error) { console.error(error); await screenshot('failure').catch(()=>{}); process.exitCode=1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
