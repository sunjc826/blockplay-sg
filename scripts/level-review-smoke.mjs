// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/level-review/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
async function shot(name) { await evaluate(`document.querySelector('.level-review').scrollIntoView({block:'start',behavior:'instant'})`); await delay(200); const r = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function upload(data) {
  const path = new URL('import.json', output); await fs.writeFile(path, JSON.stringify(data));
  const { root } = await cdp('DOM.getDocument'); const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '.level-review input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.pathname] }); await delay(200);
}
try {
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.bringToFront');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/debug?review=marina-bay` });
  await wait(`document.querySelectorAll('[data-review-pin]').length===2`);
  assert.equal(await evaluate(`document.querySelectorAll('.experience canvas').length`), 0, 'Review does not mount a game engine');
  await shot('desktop');
  // Get exact revision of the displayed schematic for the checked-in seed notes.
  const revision = await evaluate(`document.querySelector('.level-review').dataset.mapRevision`);
  console.log('Marina schematic revision:', revision);
  await clickText('＋ Pin a comment');
  const point = await evaluate(`(()=>{const svg=document.querySelector('.lr-map svg');svg.scrollIntoView({block:'center',behavior:'instant'});const p=new DOMPoint(svg.viewBox.baseVal.width/2,svg.viewBox.baseVal.height/2).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y}})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await wait(`!!document.querySelector('.lr-compose')`);
  await input('.lr-compose input[maxlength="160"]', 'Review the crossing');
  await input('.lr-compose textarea', 'Could we add a safer route here?');
  await clickText('Post comment');
  await wait(`document.querySelectorAll('[data-review-pin]').length===3`);
  const stored = await evaluate(`JSON.parse(localStorage.getItem('blockplay.level-review.v1'))`);
  const thread = stored.threads.find(t => t.title === 'Review the crossing');
  assert(thread); const expected = await evaluate(`(()=>{const r=document.querySelector('[data-review-bounds]');return {x:Number(r.getAttribute('x'))+Number(r.getAttribute('width'))/2,z:Number(r.getAttribute('y'))+Number(r.getAttribute('height'))/2}})()`); assert(Math.abs(thread.anchor.x-expected.x)<1, 'Pointer X matches world coordinates within pixel rounding'); assert(Math.abs(thread.anchor.z-expected.z)<1, 'Pointer Z matches world coordinates within pixel rounding');
  await input('.lr-thread textarea', 'Tested the approach; this works.'); await clickText('Reply & resolve');
  assert(await evaluate(`document.querySelector('.lr-thread-meta').textContent.includes('RESOLVED')`));
  await cdp('Page.reload'); await wait(`document.querySelectorAll('[data-review-pin]').length===3`);
  await click(`[data-review-pin="${thread.id}"]`);
  assert(await evaluate(`document.querySelector('.lr-thread-meta').textContent.includes('RESOLVED')`));
  await input('.lr-thread textarea', 'The other direction still needs a playtest.'); await clickText('Reply & reopen');
  const response = structuredClone(stored);
  response.threads.find(t => t.id === thread.id).events.push({ id: 'smoke-ai-reply', author: 'ai', at: new Date(Date.now()+1000).toISOString(), body: 'Tradeoff: cover breaks a long sightline. Test both directions.' });
  await upload(response); await upload(response);
  const merged = await evaluate(`JSON.parse(localStorage.getItem('blockplay.level-review.v1')).threads.find(t=>t.id===${JSON.stringify(thread.id)})`);
  assert.equal(merged.events.length, 4, 'Imports preserve newer local resolution/reopen and dedupe AI reply');
  assert.equal(await evaluate(`document.querySelectorAll('.lr-messages li').length`), 4);
  await shot('thread');
  response.threads.find(t => t.id === thread.id).anchor.x += 10;
  await upload(response);
  assert.match(await evaluate(`document.querySelector('.lr-feedback').textContent`), /conflicting locations/);
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('blockplay.level-review.v1')).threads.find(t=>t.id===${JSON.stringify(thread.id)})`), merged);
  await cdp('Page.navigate', { url: `${origin}/debug?review=queenstown` });
  await wait(`document.querySelector('.lr-empty')?.textContent.includes('Start with a place')`);
  // Keyboard pin placement and persistence across district switches.
  await clickText('＋ Pin a comment'); await evaluate(`document.querySelector('.lr-map svg').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' }); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
  await wait(`!!document.querySelector('.lr-compose')`); await clickText('Cancel');
  await cdp('Page.navigate', { url: `${origin}/debug?review=marina-bay&thread=${thread.id}` });
  await wait(`document.querySelector('.lr-thread h3')?.textContent==='Review the crossing'`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await delay(250);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Mobile has no horizontal overflow');
  await shot('mobile');
  await clickText('← All threads'); await clickText('＋ Pin a comment');
  const tap = await evaluate(`(()=>{const svg=document.querySelector('.lr-map svg');svg.scrollIntoView({block:'center',behavior:'instant'});const p=new DOMPoint(svg.viewBox.baseVal.width*.62,svg.viewBox.baseVal.height*.57).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y}})()`);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...tap, id: 1 }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(`!!document.querySelector('.lr-compose')`);
  await shot('mobile-compose');
  // Corrupt saved data is recoverable and cannot be silently replaced by a new post.
  await evaluate(`localStorage.setItem('blockplay.level-review.v1','broken-json')`);
  await cdp('Page.reload'); await wait(`document.querySelector('.lr-feedback')?.textContent.includes('writing is blocked')`);
  assert.equal(await evaluate(`localStorage.getItem('blockplay.level-review.v1')`), 'broken-json');
  assert.deepEqual(errors, []);
  console.log('Level review smoke passed: mouse/touch/keyboard pins, reload, district isolation, deep link, replies, resolve/reopen, import merge/dedupe/conflict, corrupt-storage protection, mobile layout.');
} catch (error) { console.error('Browser errors:', errors); console.error(await evaluate(`document.body.innerText.slice(0,2000)`)); throw error; } finally { await send('Target.disposeBrowserContext', { browserContextId }); ws.close(); }
