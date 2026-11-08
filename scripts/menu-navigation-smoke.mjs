// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/menu-navigation-browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
async function openPlay() {
  await go('/', '.game-menu');
  if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.game-menu-list a')].map(a=>a.getAttribute('href'))`), ['/play', '/inventory', '/store', '/settings']);
  await click('.game-menu-item[href="/play"]');
  await wait(`!!document.querySelector('.activity-grid')`);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled:true}); await size(1440, 900);
  await go('/store', '.armory');
  await click('#shop-tab-food');
  await click('.store-nav a[href="/inventory"]'); await wait(`!!document.querySelector('.inventory')`);
  assert.match(await evaluate(`document.querySelector('.context-back').textContent`), /Back to Store/);
  await click('.context-back'); await wait(`!!document.querySelector('#shop-tab-food')`);
  assert.equal(await evaluate(`document.querySelector('#shop-tab-food').getAttribute('aria-selected')`), 'true');
  assert.equal(await evaluate(`document.activeElement?.getAttribute('href')`), '/inventory');
  await click('.store-settings'); await wait(`!!document.querySelector('.armory-settings')`);
  assert.match(await evaluate(`document.querySelector('.context-back').textContent`), /Back to Store/);
  await click('.context-back'); await wait(`!!document.querySelector('#shop-tab-food')`);
  await evaluate(`document.querySelector('#shop-tab-food').focus()`); await key('ArrowRight');
  assert.equal(await evaluate(`document.activeElement.id`), 'shop-tab-utility');
  assert.equal(await evaluate(`document.querySelectorAll('.armory-navigation [tabindex="0"]').length`), 1);
  await click('.store-nav a[href="/inventory"]'); await wait(`!!document.querySelector('.inventory')`);
  await evaluate(`document.querySelector('#inventory-tab-weapon').focus()`); await key('End');
  assert.equal(await evaluate(`document.activeElement.id`), 'inventory-tab-supply');
  await click('.context-back'); await wait(`!!document.querySelector('.shop')`);
  await openPlay();
  await click('.activity-card[href="/play/training"]');
  await click('.activity-card[href="/training"]'); await wait(`!!document.querySelector('.starting-picker')`);
  await click('.starting-deploy'); await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`, 60000);
  await wait(`!document.querySelector('.play-loading')`);
  // Settings traps focus in both directions and restores the opener.
  await click('.fps-settings-button'); await key('Tab', 8);
  assert(await evaluate(`!!document.activeElement.closest('.settings-overlay')`));
  for (let i = 0; i < 14; i++) await key('Tab');
  assert(await evaluate(`!!document.activeElement.closest('.settings-overlay')`));
  assert(await evaluate(`document.querySelector('#root').inert`));
  await key('Escape'); await wait(`!document.querySelector('.settings-overlay')`);
  assert(await evaluate(`document.activeElement.matches('.fps-settings-button')`));
  assert.equal(await evaluate(`document.querySelector('#root').inert`), false);
  await size(844, 390, true); await delay(500);
  await click('.fps-start-card > .primary-button:not([hidden])', true);
  if (await evaluate(`document.querySelector('.fps-game')?.dataset.phase==='paused'`)) await click('.pause-resume', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true); await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
  await evaluate(`document.exitFullscreen?.().catch(()=>{})`);
  await evaluate(`window.navigationTestCanvas=document.querySelector('.world canvas')`);
  // Destructive store detour: cancel retains the exact mounted renderer.
  await click('.fps-shop-link'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /End this exercise/);
  await key('Tab', 8); assert(await evaluate(`!!document.activeElement.closest('[role="alertdialog"]')`));
  await key('Escape'); await wait(`!document.querySelector('[role="alertdialog"]')`);
  assert(await evaluate(`window.navigationTestCanvas===document.querySelector('.world canvas')`));
  assert.equal(await evaluate(`location.pathname`), '/training');
  // Browser Back uses the same guard without corrupting its history entry.
  await evaluate(`history.back()`); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  assert.equal(await evaluate(`location.pathname`), '/training');
  await key('Escape'); await wait(`!document.querySelector('[role="alertdialog"]')`);
  assert(await evaluate(`window.navigationTestCanvas===document.querySelector('.world canvas')`));
  await shot('training-pause');
  await evaluate(`history.back()`); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await click('.confirm-leave'); await wait(`location.pathname==='/play/training' && !!document.querySelector('.activity-grid')`);
  assert.equal(await evaluate(`!!document.querySelector('.fps-game')`), false);
  await evaluate(`history.forward()`); await wait(`!!document.querySelector('.starting-picker')`);
  assert.equal(await evaluate(`!!document.querySelector('.fps-game')`), false);
  // Tutorial cancellation and restart keep the course and profile semantics explicit.
  await size(844, 390, true); await go('/tutorial', '.tutorial-card');
  await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='ready'`, 60000);
  await click('.tutorial-card > .primary-button', true);
  if (await evaluate(`document.querySelector('.tutorial-game')?.dataset.phase==='paused'`)) await click('.tutorial-card > .primary-button', true);
  await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='playing'`);
  await click('.tutorial-menu', true); await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='paused'`);
  await click('.tutorial-back', true); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await key('Escape'); assert.equal(await evaluate(`location.pathname`), '/tutorial');
  await click('.tutorial-card > button.tutorial-secondary:last-of-type', true); await wait(`!!document.querySelector('[role="alertdialog"]')`);
  assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /Restart the course/);
  await click('.confirm-leave', true); await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='ready'`);
  assert.equal(await evaluate(`!!document.querySelector('[role="alertdialog"]')`), false);
  await click('.tutorial-back', true); await wait(`location.pathname==='/play/training'`);
  // Named list selection, game setup, and the return from landing zones.
  await size(390, 844, true); await go('/world', '.starting-picker');
  assert(await evaluate(`!!document.querySelector('.starting-list')`));
  await evaluate(`const input=document.querySelector('.starting-list input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Queenstown');input.dispatchEvent(new Event('input',{bubbles:true}))`);
  await wait(`document.querySelectorAll('.starting-list-items>button').length===1`);
  await click('.starting-list-items>button'); assert.match(await evaluate(`document.querySelector('.starting-place h2').textContent`), /Queenstown/);
  await shot('district-list');
  await click('.starting-deploy'); await wait(`!!document.querySelector('.deployment-leave')`, 60000); await wait(`!document.querySelector('.play-loading')`);
  await click('.deployment-leave'); await wait(`!!document.querySelector('.starting-picker')`);
  assert.match(await evaluate(`document.querySelector('.starting-place h2').textContent`), /Queenstown/);
  assert.equal(await evaluate(`!!document.querySelector('[role="alertdialog"]')`), false);
  for (const [width,height,mobile] of [[1440,900,false],[320,568,true],[844,390,true]]) {
    await size(width,height,mobile); await go('/play', '.activity-grid');
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll('.activity-grid a[href="/multiplayer"]').length===1`));
    await click('.activity-card[href="/play/team-deathmatch"]', mobile);
    await wait(`document.querySelector('.starting-picker')?.dataset.mode==='team-deathmatch'`);
    await click('.starting-view button:last-child', mobile);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.starting-list-items button')].map(e=>e.textContent)`), ['ChinatownSmith Street','Toa PayohDragon courtyard']);
    await click('.starting-list-items button:first-child', mobile);
    await click('.starting-deploy', mobile);
    await wait(`document.querySelector('.match-summary')?.textContent.includes('Smith Street')`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.lan-mode-picker button')].map(e=>e.textContent)`), ['Solo vs bots','Host room']);
    assert(await evaluate(`!document.querySelector('.lan-code-input') && !document.querySelector('.starting-picker')`));
    await click('.lobby-navigation button', mobile);
    await wait(`document.querySelector('.starting-place h2')?.textContent==='Smith Street'`);
    await shot(`arena-picker-${width}`);
  }
  await size(1440,900);
  for (const [mode, venue] of [['hardpoint','Smith Street'], ['free-for-all','Marina Bay']]) {
    await go('/play', '.activity-grid');
    await click(`.activity-card[href="/play/${mode}"]`);
    await wait(`document.querySelector('.match-summary')?.textContent.includes(${JSON.stringify(venue)})`);
    assert(await evaluate(`!document.querySelector('.starting-picker') && !document.querySelector('.lan-code-input')`));
  }
  await go('/play', '.activity-grid');
  await click('.activity-card[href="/multiplayer"]');
  await wait(`document.querySelector('.public-lobby h1')?.textContent==='Find a Room'`);
  assert(await evaluate(`!!document.querySelector('.lan-code-input') && !document.querySelector('.lan-mode-picker')`));
  await go('/multiplayer?room=ABC123', '.lan-code-input');
  assert.equal(await evaluate(`document.querySelector('.lan-code-input').value`), 'ABC123');
  if (process.env.MENU_TEST_ROOMS === '1') {
    await go('/play', '.activity-grid');
    await click('.activity-card[href="/play/hardpoint"]'); await wait(`!!document.querySelector('.public-lobby')`);
    await click('.lan-mode-picker button:nth-child(2)'); await click('.lan-deploy');
    await wait(`!!document.querySelector('.public-lobby.has-room')`);
    await click('.public-actions .lan-cancel'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /You are hosting/);
    await key('Escape'); assert(await evaluate(`!!document.querySelector('.public-lobby.has-room')`));
    await click('.lobby-navigation button'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    await key('Escape'); assert.equal(await evaluate(`location.pathname`), '/play/hardpoint');
    await click('.public-actions .lan-deploy'); await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`,60000);
    await click('.arena-start-card > .fps-shop-link'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /closes the match for everyone/);
    await key('Escape'); assert(await evaluate(`!!document.querySelector('.arena-start-card')`));
    await click('.arena-start-card > .fps-shop-link'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    await click('.confirm-leave'); await wait(`!!document.querySelector('.public-lobby')`);
    assert.equal(await evaluate(`!!document.querySelector('.public-lobby.has-room')`),false);
    console.log('PASS local multiplayer: room exit cancellation, Main menu guard, match exit warning, confirmed disconnect to lobby.');
  }
  // Store geometry and sticky navigation across device sizes.
  for (const [name, width, height, mobile] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',844,390,true]]) {
    await size(width,height,mobile); await go('/store','.shop');
    await click('#shop-tab-weapon');
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `${name}: no horizontal overflow`);
    const geometry = await evaluate(`(()=>{const nav=document.querySelector('.store-nav').getBoundingClientRect(),wallet=document.querySelector('.armory-wallet').getBoundingClientRect();return {nav:[nav.x,nav.y,nav.width,nav.height],wallet:[wallet.x,wallet.y,wallet.width,wallet.height],clear:nav.right<=wallet.left||wallet.right<=nav.left||nav.bottom<=wallet.top||wallet.bottom<=nav.top}})()`);
    assert(geometry.clear, `${name}: header groups do not overlap ${JSON.stringify(geometry)}`);
    await shot(`${name}-store`);
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`); await delay(250);
    assert(await evaluate(`document.querySelector('.context-back').getBoundingClientRect().top>=0`), `${name}: return stays visible`);
    await click('.armory-item[data-item="sar-ranger"]'); await wait(`document.querySelector('.shop').classList.contains('is-inspecting')`);
    await shot(`${name}-inspection`);
    await click('.armory-inspect-back'); assert.equal(await evaluate(`document.querySelector('.shop').classList.contains('is-inspecting')`), false);
  }
  for (const [name,width,height,mobile] of [['desktop',1440,900,false],['small-phone',320,568,true],['portrait',390,844,true],['landscape',844,390,true]]) {
    await size(width,height,mobile); await go('/', '.game-menu');
    if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
    const controls = await evaluate(`[...document.querySelectorAll('.game-menu-item,.game-menu-welcome a,.game-install-go')].map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),inside:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1}})`);
    assert(controls.every(control=>control.inside), `${name}: menu controls fit ${JSON.stringify(controls)}`);
    await shot(`${name}-menu`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS menu navigation: contextual returns/state/focus, tabs, dialog containment, active-run exit cancellation, Back/Forward, named districts, landing-zone return, responsive store and inspection.');
} catch (error) { console.error(error); await shot('failure').catch(()=>{}); process.exitCode = 1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
