// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5178';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const output = new URL('../.cache/asset-review/', import.meta.url); await fs.mkdir(output, { recursive: true });
const browser = await (await fetch(`${chrome}/json/version`)).json();
const ws = new WebSocket(browser.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); }); }
const { browserContextId } = await send('Target.createBrowserContext');
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { const start = Date.now(); while (Date.now() - start < 30000) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await delay(100); }
async function clickText(text) { const selector = await evaluate(`(()=>{const e=[...document.querySelectorAll('.level-review button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button: '+${JSON.stringify(text)});e.dataset.smokeButton='target';return '[data-smoke-button="target"]'})()`); await click(selector); await evaluate(`document.querySelector('[data-smoke-button]')?.removeAttribute('data-smoke-button')`); }
async function input(selector, value) { await click(selector); await cdp('Input.insertText', { text: value }); }
async function shot(name, selector = '.level-review') { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`); await delay(200); const r = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function upload(data) {
  const path = new URL('import.json', output); await fs.writeFile(path, JSON.stringify(data));
  const { root } = await cdp('DOM.getDocument'); const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '.level-review input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.pathname] }); await delay(200);
}
try {
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.bringToFront');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/debug?asset=prop/vending` });
  await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);
  assert.equal(await evaluate(`document.querySelectorAll('.lr-asset-picker option').length`),37);
  assert.equal(await evaluate(`document.querySelector('.lr-map svg')`),null,'Model reviews do not render a district map');
  await shot('model-desktop');
  await clickText('＋ Pin a comment');
  await click('.lr-model-canvas canvas'); await wait(`!!document.querySelector('.lr-compose')`);
  await input('.lr-compose input[maxlength="160"]','Review this model surface');
  await input('.lr-compose textarea','This front detail needs clearer contrast at gameplay distance.');
  await clickText('Post comment');
  const saved = await evaluate(`JSON.parse(localStorage.getItem('blockplay.asset-review.v1'))`);
  const thread = saved.threads.find(t=>t.title==='Review this model surface'); assert(thread?.anchor.surface); assert.equal(thread.asset,'prop/vending'); assert.equal(thread.district,undefined);
  assert.equal(await evaluate(`localStorage.getItem('blockplay.level-review.v1')`),null,'Asset writes leave legacy map cache untouched');
  await wait(`!!document.querySelector('[data-model-pin="${thread.id}"]:not([hidden])')`);
  await shot('surface-thread');
  await clickText('Rear'); await wait(`document.querySelector('[data-model-pin="${thread.id}"]')?.hidden===true`);
  await clickText('Restore pin view'); await wait(`document.querySelector('[data-model-pin="${thread.id}"]')?.hidden===false`);
  const restored = await evaluate(`JSON.parse(document.querySelector('.lr-model-canvas').dataset.view)`);
  assert(Math.abs(restored.yaw-thread.anchor.surface.view.yaw)<.001); assert.equal(restored.zoom,thread.anchor.surface.view.zoom);
  await input('.lr-thread textarea','Verified from both sides.'); await clickText('Reply & resolve');
  await cdp('Page.reload'); await delay(500); await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true' && !!document.querySelector('[data-model-pin="${thread.id}"]')`);
  await click(`[data-model-pin="${thread.id}"]`); assert(await evaluate(`document.querySelector('.lr-thread-meta').textContent.includes('RESOLVED')`));
      await clickText('＋ Pin a comment'); await evaluate(`document.querySelector('.lr-model-canvas canvas').focus()`);
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter'}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter'});
      await wait(`!!document.querySelector('.lr-compose')`); await clickText('Cancel');
  await clickText('Comment on whole model'); await input('.lr-compose input[maxlength="160"]','Overall proportions'); await input('.lr-compose textarea','Discuss the entire silhouette.'); await clickText('Post comment');
  assert(await evaluate(`document.querySelector('.lr-coordinate').textContent.includes('Whole model')`));
  const ids = await evaluate(`[...document.querySelectorAll('.lr-asset-picker option')].map(e=>e.value)`);
  for(const asset of ids) {
    await evaluate(`(()=>{const e=document.querySelector('.lr-asset-picker select');e.value=${JSON.stringify(asset)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(`document.querySelector('.lr-model-canvas')?.dataset.asset===${JSON.stringify(asset)} && document.querySelector('.lr-model-canvas').dataset.ready==='true'`);
    assert(await evaluate(`document.querySelector('.lr-model-canvas').dataset.revision.startsWith('model-')`));
    if(['weapon/ff-oicw','operator/lancer'].includes(asset)) {
      await shot(asset.replace('/','-'));
    }
  }
  // A changed mesh hierarchy cannot silently attach an old note to a new part.
  const stale = structuredClone(thread); stale.id='stale-'+crypto.randomUUID(); stale.mapRevision='model-old'; stale.events=stale.events.map(e=>({...e,id:crypto.randomUUID()})); stale.anchor.surface.meshPath=[9999];
  await upload({format:'blockplay-asset-review',version:1,threads:[stale]});
  await cdp('Page.navigate',{url:`${origin}/debug?asset=prop/vending&thread=${stale.id}`});
  await wait(`document.querySelector('.lr-warning')?.textContent.includes('model changed')`);
  assert.equal(await evaluate(`document.querySelector('[data-model-pin="${stale.id}"]')?.hidden`),true);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await delay(200); assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
  await clickText('＋ Pin a comment');
  assert(await evaluate(`document.querySelector('.lr-model-stage').classList.contains('is-placing') && document.querySelector('.level-review').dataset.reviewPanel==='canvas'`),'Pin mode exposes canvas');
  const tap=await evaluate(`(()=>{const e=document.querySelector('.lr-model-canvas canvas');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tap,id:1}]}); await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(`!!document.querySelector('.lr-compose') && document.querySelector('.level-review').dataset.reviewPanel==='discussion'`); await shot('model-mobile', '.lr-discussion');
  assert.deepEqual(errors,[]);
  console.log('PASS asset review: all 37 models render, surface raycasting, saved view, hidden-side/stale pins, whole-model threads, replies/resolve/reload, collection isolation, keyboard and touch.');
} catch(error) { await shot('failure', '.lr-model-stage').catch(()=>{}); console.error('Browser errors:',errors, 'Model hint:', await evaluate(`document.querySelector('.lr-map-hint')?.textContent`).catch(()=>'')); throw error; } finally { await send('Target.disposeBrowserContext',{browserContextId}); ws.close(); }
