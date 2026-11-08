// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/next-gen-menu/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector, touch = false) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(300); }
async function key(key, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers }); await delay(100); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); }
async function go(path, selector) { await send('Page.navigate', { url: origin + path }); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await delay(500); }
async function selectDesign(design) {
  await go('/settings', '.armory-settings');
  await click('#settings-tab-video');
  await click(`[data-menu-design="${design}"]`);
  assert.equal(await evaluate(`document.querySelector('[data-menu-design="${design}"]').getAttribute('aria-pressed')`), 'true');
}
async function home() {
  await go('/', '.game-menu');
  if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
}
async function fits() {
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'No horizontal overflow');
  const overflow = await evaluate(`[...document.querySelectorAll('.activity-copy,.game-menu-copy')].map(e=>({text:e.textContent,scroll:e.scrollWidth,client:e.clientWidth})).filter(e=>e.scroll>e.client+1)`);
  assert.deepEqual(overflow, [], 'Card text fits (decorative art intentionally bleeds)');
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await size(1440,900);
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled:true});
  await selectDesign('classic'); await home();
  assert(await evaluate(`!document.querySelector('.next-gen-main')`));
  await go('/play', '.activity-grid');
  assert(await evaluate(`!document.querySelector('.next-gen-panel')`));
  await selectDesign('next-gen'); await home();
  assert(await evaluate(`!!document.querySelector('.next-gen-main')`), 'Preference survives navigation/reload');
  await fits(); await shot('desktop-home');
  await click('.game-menu-item[href="/play"]'); await wait(`!!document.querySelector('.next-gen-panels')`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/play/single-player','/play/multiplayer']);
  const first = '.activity-card[href="/play/single-player"]';
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:10,y:10}); await delay(800);
  const before = await evaluate(`document.querySelector('${first}').getBoundingClientRect().width`);
  const point = await evaluate(`(()=>{const r=document.querySelector('${first}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',...point}); await delay(800);
  const after = await evaluate(`document.querySelector('${first}').getBoundingClientRect().width`);
  assert(after > before + 40, `Hover expands a stripe: ${before} → ${after}`);
  await shot('desktop-play-hover');
  await evaluate(`document.querySelector('${first}').focus()`); await key('ArrowRight');
  assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/play/multiplayer');
  await key('Home'); assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/play/single-player');
  await key('Enter'); await wait(`location.pathname==='/play/single-player'`); await delay(600);
  await fits(); await shot('desktop-single-player');
  assert.equal(await evaluate(`document.querySelectorAll('.activity-card').length`), 5);
  await click('.activity-card[href="/play/training"]'); await wait(`location.pathname==='/play/training'`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/training','/tutorial']);
  await click('.activity-navigation a'); await wait(`location.pathname==='/play/single-player'`);
  await click('.activity-card[href="/play/hardpoint"]'); await wait(`!!document.querySelector('.solo-setup')`);
  await go('/play/multiplayer', '.next-gen-panels');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/multiplayer','/play/multiplayer/team-deathmatch','/play/multiplayer/hardpoint','/play/multiplayer/free-for-all']);
  await shot('desktop-multiplayer');
  await click('.activity-card[href="/play/multiplayer/team-deathmatch"]'); await wait(`!!document.querySelector('.starting-picker')`);
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await go('/play', '.next-gen-panel');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.next-gen-image')).transitionDuration`), '0s');
  await send('Emulation.setEmulatedMedia', {features:[]});
  for (const [width,height,mobile] of [[320,568,true],[390,844,true],[844,390,true],[1024,768,false]]) {
    await size(width,height,mobile); await home(); await fits();
    assert(await evaluate(`[...document.querySelectorAll('.game-menu-item')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})`), `${width}: home actions fit viewport`);
    await shot(`home-${width}`);
    await click('.game-menu-item[href="/play"]',mobile); await wait(`!!document.querySelector('.next-gen-panels')`);
    await fits(); await shot(`play-${width}`);
    await click('.activity-card[href="/play/single-player"]',mobile); await wait(`location.pathname==='/play/single-player'`);
    await fits(); await shot(`solo-${width}`);
    await click('.activity-card[href="/play/free-for-all"]',mobile); await wait(`!!document.querySelector('.solo-setup')`);
    await go('/play/multiplayer', '.next-gen-panels'); await fits(); await shot(`multiplayer-${width}`);
  }
  await selectDesign('classic'); await home();
  assert(await evaluate(`!document.querySelector('.next-gen-main')`), 'Classic can be restored');
  await go('/play/single-player', '.activity-grid');
  assert(await evaluate(`!document.querySelector('.next-gen-panel') && document.querySelectorAll('.activity-card').length===5`));
  assert.deepEqual(errors, []);
  console.log('PASS: both designs, persisted switch, hover expansion, keyboard navigation, solo/host routes, reduced motion and responsive touch layouts.');
} catch (error) { console.error(error); await shot('failure').catch(()=>{}); process.exitCode=1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
