// 3D layout pins in the level review. Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
// Chrome needs --enable-unsafe-swiftshader --use-angle=swiftshader for WebGL without a GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/district-review/', import.meta.url); await fs.mkdir(output, { recursive: true });
const browser = await (await fetch(`${chrome}/json/version`)).json();
const ws = new WebSocket(browser.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 60000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); }); }
const { browserContextId } = await send('Target.createBrowserContext');
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 90000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function press(point) { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); await delay(150); }
async function click(selector) { await press(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector: '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)); }
async function clickText(text) { await evaluate(`(()=>{const e=[...document.querySelectorAll('.level-review button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button: '+${JSON.stringify(text)});e.dataset.smokeButton='target'})()`); await click('[data-smoke-button="target"]'); await evaluate(`document.querySelector('[data-smoke-button]')?.removeAttribute('data-smoke-button')`); }
async function input(selector, value) { await click(selector); await cdp('Input.insertText', { text: value }); }
async function shot(name) { await delay(300); const r = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function upload(data) {
  const path = new URL('import.json', output); await fs.writeFile(path, JSON.stringify(data));
  const { root } = await cdp('DOM.getDocument'); const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '.level-review input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.pathname] }); await delay(300);
}
const ready = `document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`;
const sceneView = () => evaluate(`JSON.parse(document.querySelector('.lr-model-canvas').dataset.view)`);
// Software rendering can take longer than a poll per frame, so wait for the drawn view to satisfy a condition rather than to stop changing.
const viewWhen = async condition => { await wait(`(v=>${condition})(JSON.parse(document.querySelector('.lr-model-canvas')?.dataset.view||'null')||{})`); return sceneView(); };
const viewIs = expected => viewWhen(`JSON.stringify(v)===${JSON.stringify(JSON.stringify(expected))}`);
const stagePoint = (u, v) => evaluate(`(()=>{const r=document.querySelector('.lr-model-stage').getBoundingClientRect();return {x:r.x+r.width*${u},y:r.y+r.height*${v}}})()`);
// Height-relative offset from the stage centre: stable when the placement toolbar comes and goes, since the vertical field of view is fixed.
const relative = point => evaluate(`(()=>{const r=document.querySelector('.lr-model-stage').getBoundingClientRect();return {x:(${point.x}-r.x-r.width/2)/r.height,y:(${point.y}-r.y-r.height/2)/r.height}})()`);
const pinPoint = async thread => { await wait(`document.querySelector('[data-scene-pin="${thread}"]')?.hidden===false`); return evaluate(`(()=>{const r=document.querySelector('[data-scene-pin="${thread}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); };
const saved = () => evaluate(`JSON.parse(localStorage.getItem('blockplay.level-review.v1'))`);
async function post(title) {
  await wait(`!!document.querySelector('.lr-compose')`);
  await input('.lr-compose input[maxlength="160"]', title); await input('.lr-compose textarea', 'Check the sightline from here.');
  await clickText('Post comment'); await wait(`document.querySelector('.lr-thread h3')?.textContent===${JSON.stringify(title)}`);
  return (await saved()).threads.find(t => t.title === title);
}
try {
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.bringToFront');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/debug?review=marina-bay` });
  await wait(`document.querySelectorAll('[data-review-pin]').length===2`);
  assert.equal(await evaluate(`document.querySelectorAll('.experience canvas').length`), 0, 'The schematic stays the default and builds no district');
  // Mouse parity on the schematic: the wheel zooms about the cursor.
  const mapCentre = await evaluate(`(()=>{const r=document.querySelector('.lr-map-surface').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', ...mapCentre, deltaX: 0, deltaY: -400 }); await delay(200);
  assert(Number(await evaluate(`document.querySelector('.lr-map-surface').dataset.mapZoom`)) > 1.5, 'Wheel zooms the schematic');
  await clickText('3D layout'); await wait(ready);
  assert.match(await evaluate(`location.search`), /view=3d/, 'The 3D layout is addressable');
  assert.equal(await evaluate(`document.querySelectorAll('[data-scene-pin][data-flat=true]').length`), 2, 'Schematic pins appear in 3D, marked as carrying no height');
  await shot('overview');
  // A ground pin: the saved world point projects back to the pixel that was chosen.
  const overview = await sceneView();
  await clickText('＋ Pin a comment');
  const ground = await stagePoint(.42, .7), chosen = await relative(ground); await press(ground); await clickText('Pin here');
  const first = await post('Ground crossing');
  assert(first.anchor.space && Number.isFinite(first.anchor.space.y), 'A 3D pin records its height');
  assert.deepEqual(Object.keys(first.anchor.space.view).sort(), ['distance', 'pitch', 'x', 'y', 'yaw', 'z']);
  assert(Math.abs(first.anchor.space.view.distance - overview.distance) < .02, 'The pin saves the view it was placed from');
  await viewIs(first.anchor.space.view); const drawn = await relative(await pinPoint(first.id));
  assert(Math.hypot(drawn.x - chosen.x, drawn.y - chosen.y) < .01, `Pin is drawn where it was placed (${JSON.stringify([drawn, chosen])})`);
  assert.equal(await evaluate(`document.querySelector('[data-scene-pin="${first.id}"]').dataset.flat`), 'false');
  // Orbit, slide and zoom move the camera; the thread restores its saved view.
  const a = await stagePoint(.12, .2), b = await stagePoint(.24, .12);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...a, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...b, button: 'left', buttons: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...b, button: 'left', clickCount: 1 });
  const orbited = await viewWhen(`Math.abs(v.yaw-(${overview.yaw}))>.3`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', ...a, deltaX: 0, deltaY: -500 }); const zoomed = await viewWhen(`v.distance<${orbited.distance}*.7`);
  await clickText('→'); await viewWhen(`Math.hypot(v.x-(${zoomed.x}),v.z-(${zoomed.z}))>1`);
  await clickText('Restore pin view'); await viewIs(first.anchor.space.view);
  // A raised pin: seen from above, the pixel over the schematic SkyPark pin is the SkyPark roof.
  await clickText('← All threads'); await clickText('Top'); await viewWhen('v.pitch===1.5&&v.yaw===0');
  await delay(1500); const tower = await pinPoint('marina-skypark-arrival');
  await clickText('＋ Pin a comment'); await press(tower); await clickText('Pin here');
  const roof = await post('SkyPark arrival');
  assert(roof.anchor.space.y > 40, `A pin on a roof records the roof height, not the ground (${roof.anchor.space.y})`);
  assert.match(roof.anchor.level, /above ground/, 'The suggested label names the height');
  // Perspective shifts a raised point away from the ground point under the same pixel, so only the neighbourhood is expected to match.
  assert(Math.hypot(roof.anchor.x - 90.6, roof.anchor.z + 36) < 60, `Roof pin is on the SkyPark towers (${roof.anchor.x}, ${roof.anchor.z})`);
  await shot('roof-thread');
  // Reload from a thread link: same thread, same camera.
  await clickText('Copy thread link'); await delay(200);
  await cdp('Page.navigate', { url: `${origin}/debug?review=marina-bay&view=3d&thread=${roof.id}` });
  await wait(`document.querySelector('.lr-thread h3')?.textContent==='SkyPark arrival'`); await wait(ready);
  await viewIs(roof.anchor.space.view);
  assert.match(await evaluate(`document.querySelector('.lr-coordinate').textContent`), /placed in 3D/);
  assert.equal(await evaluate(`!!document.querySelector('[data-pin-detached]')`), false, 'A pin on existing geometry is not reported as detached');
  // A pin whose geometry is gone is kept in place and flagged.
  const response = await saved();
  response.threads.push({ ...structuredClone(roof), id: 'smoke-midair', title: 'Removed walkway', anchor: { ...roof.anchor, space: { ...roof.anchor.space, y: 300 } }, events: [{ id: 'smoke-midair-1', at: new Date().toISOString(), author: 'designer', body: 'This was on a walkway.' }] });
  await upload(response); await clickText('← All threads');
  await evaluate(`[...document.querySelectorAll('.lr-thread-list button')].find(e=>e.textContent.includes('Removed walkway')).click()`);
  await wait(`!!document.querySelector('[data-pin-detached]')`);
  // The schematic lists the same threads and offers the way back to 3D.
  await clickText('Schematic'); await wait(`document.querySelectorAll('[data-review-pin]').length===5`);
  assert.equal(await evaluate(`document.querySelectorAll('.experience canvas').length`), 0, 'Leaving 3D releases the district');
  await clickText('View in 3D'); await wait(ready);
  // Rejected: a 3D position on a model thread, and a malformed view.
  const bad = structuredClone(response); bad.threads.at(-1).anchor.space.view.distance = 0; await upload(bad);
  assert.match(await evaluate(`document.querySelector('.lr-feedback').textContent`), /Invalid 3D district position/);
  // Touch: tap to position, then Pin here; two fingers zoom.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: `${origin}/debug?review=tampines&view=3d` }); await wait(ready);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Mobile has no horizontal overflow');
  const before = await sceneView(), mid = await stagePoint(.5, .5);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid.x - 40, y: mid.y, id: 1 }, { x: mid.x + 40, y: mid.y, id: 2 }] });
  for (const spread of [60, 80, 100]) await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mid.x - spread, y: mid.y, id: 1 }, { x: mid.x + spread, y: mid.y, id: 2 }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await viewWhen(`v.distance<${before.distance}*.6`);
  await delay(700); await clickText('＋ Pin a comment');
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...mid, id: 1 }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(200);
  await clickText('Pin here'); await wait(`!!document.querySelector('.lr-compose')`);
  assert.match(await evaluate(`document.querySelector('.lr-compose .lr-eyebrow').textContent`), /HEIGHT/);
  await shot('mobile-compose');
  assert.deepEqual(errors, []);
  console.log('District review smoke passed: schematic default and wheel zoom, 3D build, ground and roof pins, saved view restore, thread link, detached pin, schematic round trip, invalid import, touch pinch and tap.');
} catch (error) { console.error('Browser errors:', errors); console.error(await evaluate(`document.body.innerText.slice(0,1500)`).catch(() => '')); await shot('failure').catch(() => {}); throw error; } finally { await send('Target.disposeBrowserContext', { browserContextId }); ws.close(); }
