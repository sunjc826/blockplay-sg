// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/title-back/', import.meta.url); await fs.mkdir(output, { recursive: true });
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

async function assertTitle() {
  await wait(`location.pathname==='/' && !!document.querySelector('.game-menu.is-title-shown .game-title')`);
  assert.equal(await evaluate(`document.activeElement?.classList.contains('game-title')`), true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.game-menu-main')).visibility`), 'hidden');
}
async function start() {
  if (await evaluate(`!!document.querySelector('.game-title')`)) await click('.game-title');
  await wait(`!!document.querySelector('.game-menu:not(.is-title-shown):not(.is-title-leaving)')`);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', {enabled:true});
  for (const design of ['classic', 'next-gen']) {
    await go('/', '.game-menu');
    await evaluate(`localStorage.setItem('blockplay-sg-menu-design-v1', ${JSON.stringify(design)})`);
    await go('/', '.game-menu');
    await start();
    // The first main-menu visit already has a title step, even without a route detour.
    await evaluate('history.back()'); await assertTitle();
    await evaluate('history.forward()'); await start();
    for (const [width, height, mobile] of [[1440,900,false], [390,844,true]]) {
      await size(width,height,mobile);
      if (design==='classic') { await click('.game-menu-item[href="/play"]'); await click('.activity-card[href="/play/single-player"]'); }
      else await click('.game-menu-item[href="/play/single-player"]');
      await wait(`location.pathname==='/play/single-player'`);
      await click('.activity-navigation .play-nav-back');
      if (design==='classic') { await wait(`location.pathname==='/play'`); await click('.activity-navigation .play-nav-back'); }
      await wait(`location.pathname==='/' && !document.querySelector('.game-title')`);
      // Actual browser/device history Back, not an in-page link.
      await evaluate('history.back()'); await assertTitle();
      await shot(`${design}-${width}-title`);
      await send('Page.reload'); await wait(`!!document.querySelector('.game-title')`);
      await delay(500); await assertTitle();
      await start();
      await key('Escape'); await assertTitle();
      await key('Escape'); await assertTitle();
      await start();
    }
    await go('/settings', '.context-back');
    await click('.context-back'); await wait(`location.pathname==='/'`);
    await evaluate('history.back()'); await assertTitle();
    // Back during the start animation cancels its pending timer.
    await click('.game-title'); await evaluate('history.back()'); await assertTitle();
    await delay(1100); await assertTitle();
  }
  assert.deepEqual(errors, []);
  console.log('PASS title Back: both menu designs, desktop/mobile, first entry, Single Player return, direct links, reload, Forward, Escape, animation interruption and title focus.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
