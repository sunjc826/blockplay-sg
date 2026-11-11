// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
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
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); }
async function go(path, selector) { await send('Page.navigate', { url: origin + path }); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await delay(500); }

async function back(path, title = false) {
  // CDP traverses real session history, the path used by the browser/Android button.
  const history = await send('Page.getNavigationHistory');
  assert(history.currentIndex > 0);
  await send('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
  await wait(`location.pathname===${JSON.stringify(path)} && ${title ? "!!document.querySelector('.is-title-shown .game-title')" : "!document.querySelector('.game-title')"}`);
  await delay(300);
  if (title) assert.equal(await evaluate('history.state.blockplayNavigation.index'), 0);
}
async function start() {
  if (await evaluate(`!!document.querySelector('.game-title')`)) await click('.game-title', true);
  await wait(`!!document.querySelector('.game-menu:not(.is-title-shown):not(.is-title-leaving)')`);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Element.prototype, 'requestFullscreen', {value: undefined, configurable: true});` });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await size(390, 844, true);
  for (const design of ['classic', 'next-gen']) {
    await go('/', '.game-menu');
    await evaluate(`localStorage.setItem('blockplay-sg-menu-design-v1', ${JSON.stringify(design)})`);
    await go('/', '.game-menu'); await start();
    await click('.game-menu-item[href="/store"]', true);
    await click('#equipment-tab-inventory', true);
    await click('.store-settings', true);
    await wait(`location.pathname==='/settings'`);
    await back('/'); await back('/', true);
    // A direct launch/reload must also have an upwards path.
    await go('/training', '.starting-picker');
    await send('Page.reload'); await wait(`!!document.querySelector('.starting-picker')`);
    await delay(500);
    // Real interaction also exercises Chrome's user-activation requirement.
    await click('.starting-place', true);
    await back('/play/training'); await back('/play/single-player');
    if (design === 'classic') await back('/play');
    await back('/'); await back('/', true);
    // In-page Back followed by native Back cannot revisit the child screen.
    await start(); await click('.game-menu-item[href="/inventory"]', true);
    await click('.store-settings', true); await click('.context-back', true);
    await back('/', true);
    await go('/play/multiplayer/team-deathmatch/smith-street', '.public-lobby');
    await back('/play/multiplayer/team-deathmatch'); await back('/play/multiplayer');
    if (design === 'classic') await back('/play');
    await back('/'); await back('/', true);
    console.log(`PASS native Back hierarchy: ${design}, equipment detours, direct launch/reload, training and multiplayer, mixed Back controls, title.`);
  }
  await size(844, 390, true);
  await go('/training', '.starting-picker');
  await click('.starting-deploy', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready' && !document.querySelector('.play-loading')`, 90000);
  await delay(700);
  await click('.deployment-actions > .primary-button', true);
  if (await evaluate(`document.querySelector('.fps-game')?.dataset.phase==='paused'`)) await click('.pause-resume', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
  await evaluate(`window.nativeBackCanvas=document.querySelector('.world canvas'); history.back()`);
  await wait(`!!document.querySelector('[role="alertdialog"]')`);
  assert.equal(await evaluate(`location.pathname`), '/training');
  await key('Escape');
  await wait(`!document.querySelector('[role="alertdialog"]')`);
  assert(await evaluate(`window.nativeBackCanvas===document.querySelector('.world canvas')`));
  await evaluate(`history.back()`); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await click('.confirm-leave', true);
  await wait(`location.pathname==='/training' && !!document.querySelector('.starting-picker') && !document.querySelector('.fps-game')`);
  await back('/play/training');
  console.log('PASS active native Back: Cancel retains the exact renderer and URL; confirm returns to districts; next Back returns to Training.');
  assert.deepEqual(errors, []);
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
