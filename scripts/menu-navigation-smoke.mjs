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
async function assertLoader(heading, district) {
  await wait(`!document.querySelector('.play-loading')`);
  const samples = await evaluate('window.loadingSamples');
  assert(samples.length > 0 && samples.every(sample => sample.heading === heading && sample.district === district), JSON.stringify(samples));
  assert.equal(samples[0].stage, 'district');
  assert(samples.some(sample => sample.stage === 'shaders'));
  assert.equal(samples.at(-1).percent, 100);
  assert(samples.every((sample, i) => i === 0 || sample.percent >= samples[i - 1].percent));
}
async function assertSessionMenu(label, resume) {
  const panel = await evaluate(`(() => {
    const panel = document.querySelector('.play-panel.is-paused-menu');
    if (!panel) return null;
    const action = panel.firstElementChild;
    const tools = panel.querySelector('.fps-player-tools');
    const rect = panel.getBoundingClientRect();
    return { label: panel.getAttribute('aria-label'), resume: action.textContent.trim(), firstAction: action.matches('.pause-resume'),
      firstTool: tools?.firstElementChild.textContent.trim(), inside: rect.top >= 0 && rect.bottom <= innerHeight + 1 };
  })()`);
  assert.deepEqual(panel, { label, resume, firstAction: true, firstTool: 'Settings', inside: true });
}
async function openPlay() {
  await go('/', '.game-menu');
  if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.game-menu-list a')].map(a=>a.getAttribute('href'))`), ['/play', '/inventory', '/store', '/settings']);
  await click('.game-menu-item[href="/play"]');
  await wait(`!!document.querySelector('.activity-grid')`);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled:true}); await size(1440, 900);
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `(() => {
    // Compare the menus with touch input independent of native fullscreen prompts.
    Object.defineProperty(Element.prototype, 'requestFullscreen', {value: undefined, configurable: true});
    localStorage.setItem('blockplay-sg-menu-design-v1', 'classic');
    window.loadingSamples = [];
    const observer = new MutationObserver(() => {
      const loader = document.querySelector('.play-loading');
      if (!loader) return;
      const sample = {heading: loader.querySelector('.play-loading-kicker').textContent, district: loader.querySelector('h1').textContent,
        stage: loader.querySelector('.play-loading-stage').dataset.stage, percent: Number(loader.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'))};
      if (JSON.stringify(sample) !== JSON.stringify(window.loadingSamples.at(-1))) window.loadingSamples.push(sample);
      if (sample.percent === 100) observer.disconnect();
    });
    observer.observe(document, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-valuenow','data-stage']});
  })()`});
  await go('/store', '.loadout-store');
  await click('[data-browse-store]'); await wait(`!!document.querySelector('.catalog-only')`);
  await click('#shop-tab-food');
  await click('#equipment-tab-inventory'); await wait(`!!document.querySelector('[data-equipment-mode=inventory]')`);
  assert.equal(await evaluate(`document.querySelector('.loadout-field select').value`), 'food');
  await click('#equipment-tab-store'); await wait(`!!document.querySelector('#shop-tab-food')`);
  assert.equal(await evaluate(`document.querySelector('#shop-tab-food').getAttribute('aria-selected')`), 'true');
  assert.equal(await evaluate(`document.activeElement?.id`), 'equipment-tab-store');
  await click('.store-settings'); await wait(`!!document.querySelector('.armory-settings')`);
  assert.match(await evaluate(`document.querySelector('.context-back').textContent`), /Main menu/);
  await click('.context-back'); await wait(`location.pathname==='/'`);
  await go('/store', '.loadout-store');
  await click('[data-browse-store]'); await wait(`!!document.querySelector('.catalog-only')`);
  await click('#shop-tab-food');
  await evaluate(`document.querySelector('#shop-tab-food').focus()`); await key('ArrowRight');
  assert.equal(await evaluate(`document.activeElement.id`), 'shop-tab-utility');
  assert.equal(await evaluate(`document.querySelectorAll('.armory-navigation [tabindex="0"]').length`), 1);
  await click('#equipment-tab-inventory'); await wait(`!!document.querySelector('[data-equipment-mode=inventory]')`);
  await evaluate(`document.querySelector('#equipment-tab-inventory').focus()`); await key('Home');
  await wait(`!!document.querySelector('.catalog-only')`);
  assert.equal(await evaluate(`document.activeElement.id`), 'equipment-tab-store');
  await openPlay();
  await click('.activity-card[href="/play/single-player"]');
  await click('.activity-card[href="/play/training"]');
  await click('.activity-card[href="/training"]'); await wait(`!!document.querySelector('.starting-picker')`);
  const rangeDistrict = await evaluate(`document.querySelector('.starting-place h2').textContent`);
  await click('.starting-deploy'); await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`, 60000);
  await assertLoader('TRAINING · LIVE-FIRE RANGE', rangeDistrict);
  // Settings traps focus in both directions and restores the opener.
  await click('.deployment-settings > summary');
  await click('.fps-settings-button'); await key('Tab', 8);
  assert(await evaluate(`!!document.activeElement.closest('.settings-overlay')`));
  for (let i = 0; i < 14; i++) await key('Tab');
  assert(await evaluate(`!!document.activeElement.closest('.settings-overlay')`));
  assert(await evaluate(`document.querySelector('#root').inert`));
  await key('Escape'); await wait(`!document.querySelector('.settings-overlay')`);
  assert(await evaluate(`document.activeElement.matches('.fps-settings-button')`));
  assert.equal(await evaluate(`document.querySelector('#root').inert`), false);
  await click('.deployment-settings > summary');
  await size(844, 390, true); await delay(500);
  await click('.deployment-actions > .primary-button', true);
  if (await evaluate(`document.querySelector('.fps-game')?.dataset.phase==='paused'`)) await click('.pause-resume', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true); await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
  await assertSessionMenu('Training menu', 'Resume exercise');
  await evaluate(`document.exitFullscreen?.().catch(()=>{})`);
  await evaluate(`void(window.navigationTestCanvas=document.querySelector('.world canvas'))`);
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
  await click('.confirm-leave'); await wait(`location.pathname==='/training' && !!document.querySelector('.starting-picker')`);
  assert.equal(await evaluate(`!!document.querySelector('.fps-game')`), false);
  await evaluate(`history.back()`); await wait(`location.pathname==='/play/training' && !!document.querySelector('.activity-grid')`);
  assert.equal(await evaluate(`!!document.querySelector('.fps-game')`), false);
  // Tutorial cancellation and restart keep the course and profile semantics explicit.
  await size(844, 390, true); await go('/tutorial', '.tutorial-card');
  await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='ready'`, 60000);
  await assertLoader('TRAINING · TUTORIAL', 'Field School');
  await click('.tutorial-card > .primary-button', true);
  if (await evaluate(`document.querySelector('.tutorial-game')?.dataset.phase==='paused'`)) await click('.tutorial-card > .primary-button', true);
  await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='playing'`);
  assert.equal(await evaluate(`document.querySelectorAll('button[aria-label="Menu"]').length`), 1);
  await click('[data-touch-action="menu"]', true); await wait(`document.querySelector('.tutorial-game')?.dataset.phase==='paused'`);
  await assertSessionMenu('Tutorial menu', 'Resume course');
  await shot('tutorial-pause');
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
  await click('.starting-deploy'); await wait(`!!document.querySelector('.deployment-leave')`, 60000);
  await assertLoader('OPEN WORLD · DEPLOYMENT', 'Queenstown');
  await click('.deployment-actions .primary-button', true);
  await wait(`['deploying','playing'].includes(document.querySelector('.expedition-game')?.dataset.phase)`);
  if (await evaluate(`!!document.querySelector('.expedition-intro-actions button:last-child')`)) await click('.expedition-intro-actions button:last-child', true);
  await wait(`document.querySelector('.expedition-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true);
  await wait(`document.querySelector('.expedition-game')?.dataset.phase==='paused'`);
  await assertSessionMenu('Open World menu', 'Resume expedition');
  await shot('world-pause');
  await click('.play-nav-district', true);
  await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await click('.confirm-leave', true);
  await wait(`!!document.querySelector('.starting-picker')`);
  assert.match(await evaluate(`document.querySelector('.starting-place h2').textContent`), /Queenstown/);
  // Landing-zone Back is also available before entering a district.
  await click('.starting-deploy', true);
  await wait(`!!document.querySelector('.deployment-leave') && !document.querySelector('.play-loading')`,60000);
  await click('.deployment-leave'); await wait(`!!document.querySelector('.starting-picker')`);
  assert.match(await evaluate(`document.querySelector('.starting-place h2').textContent`), /Queenstown/);
  assert.equal(await evaluate(`!!document.querySelector('[role="alertdialog"]')`), false);
  const roomRequests = [];
  ws.addEventListener('message', event => {
    const request = JSON.parse(event.data);
    if (request.method === 'Network.requestWillBeSent' && new URL(request.params.request.url).pathname.startsWith('/api/rooms')) roomRequests.push(request.params.request.url);
  });
  await send('Network.enable');
  for (const [width,height,mobile] of [[1440,900,false],[320,568,true],[844,390,true]]) {
    await size(width,height,mobile); await go('/play', '.activity-grid');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/play/single-player','/play/multiplayer']);
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
    await shot(`play-branches-${width}`);
    await click('.activity-card[href="/play/single-player"]', mobile);
    assert(await evaluate(`!document.querySelector('.activity-card[href="/multiplayer"]')`));
    await click('.activity-card[href="/play/team-deathmatch"]', mobile);
    await wait(`document.querySelector('.starting-picker')?.dataset.mode==='team-deathmatch'`);
    assert(await evaluate(`!document.querySelector('.starting-view,.starting-list')`), 'Arena selection is map-only');
    assert.equal(await evaluate(`document.querySelectorAll('[data-start-region]').length`), 23);
    assert.equal(await evaluate(`document.querySelectorAll('[data-start-region][aria-disabled="true"]').length`), 21);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-start-region]:not([aria-disabled])')].map(e=>e.dataset.startRegion)`), ['chinatown','toa-payoh']);
    await evaluate(`document.querySelector('[data-start-region="chinatown"]').focus()`);
    await key('Enter');
    await click('[aria-label="Next arena"]', mobile);
    assert.equal(await evaluate(`document.querySelector('.starting-place h2').textContent`), 'Dragon courtyard');
    await click('[aria-label="Previous arena"]', mobile);
    assert.equal(await evaluate(`document.querySelector('.starting-place h2').textContent`), 'Smith Street');
    await click('.starting-deploy', mobile);
    await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`);
    assert(await evaluate(`!document.querySelector('.solo-setup input, .public-lobby, .starting-picker')`));
    await shot(`solo-setup-${width}`);
    await wait(`!document.querySelector('.play-loading')`);
    await click('.arena-leave', mobile);
    await wait(`document.querySelector('.starting-place h2')?.textContent==='Smith Street'`);
  }
  await size(1440,900);
  for (const [mode, venue] of [['hardpoint','Smith Street'], ['free-for-all','Marina Bay']]) {
    await go('/play/single-player', '.activity-grid');
    await click(`.activity-card[href="/play/${mode}"]`);
    await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`);
    assert(await evaluate(`!document.querySelector('.starting-picker, .solo-setup input[autocomplete="nickname"], .public-lobby')`));
  }
  await wait(`!document.querySelector('.play-loading')`);
  await click('.deployment-settings > summary');
  await click('.public-options summary');
  assert(await evaluate(`document.querySelector('.match-deployment input[type="range"]').value==='3'`));
  await evaluate(`(() => {
    const input = document.querySelector('.match-deployment input[type="range"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  assert(await evaluate(`document.querySelector('.match-deployment .public-options summary').textContent.includes('0 bots')`));
  await click('.deployment-settings > summary');
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`,60000);
  await assertLoader('SINGLE PLAYER · FREE FOR ALL', 'Marina Bay');
  assert(await evaluate(`document.querySelector('.fps-game').dataset.matchMode==='free-for-all'`));
  await size(390,844,true);
  await click('.deployment-actions > .primary-button', true);
  if (await evaluate(`document.querySelector('.fps-game')?.dataset.phase==='paused'`)) await click('.pause-resume', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
  await assertSessionMenu('Match menu', 'Resume match');
  assert(await evaluate(`document.querySelector('.arena-menu-section') && !document.querySelector('.arena-menu-section').open`));
  await shot('arena-pause');
  await click('.pause-resume', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  await click('[data-touch-action="menu"]', true);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
  await click('.arena-leave');
  await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await click('.confirm-leave');
  await wait(`!document.querySelector('.fps-game') && document.querySelector('.activity-grid')`);
  assert.deepEqual(roomRequests, [], 'Single-player flows never contact the rooms API');
  await go('/play', '.activity-grid');
  await click('.activity-card[href="/play/multiplayer"]');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/multiplayer','/play/multiplayer/team-deathmatch','/play/multiplayer/hardpoint','/play/multiplayer/free-for-all']);
  await click('.activity-card[href="/play/multiplayer/team-deathmatch"]');
  await wait(`document.querySelector('.starting-picker')?.dataset.mode==='team-deathmatch'`);
  await click('.starting-deploy');
  await wait(`location.pathname==='/play/multiplayer/team-deathmatch/smith-street' && !!document.querySelector('.public-lobby input[autocomplete="nickname"]')`);
  assert(await evaluate(`!document.querySelector('.solo-setup, .lan-mode-picker, .lan-code-input')`));
  await click('.lobby-navigation button');
  await wait(`document.querySelector('.starting-place h2')?.textContent==='Smith Street'`);
  await click('.starting-header a');
  await wait(`location.pathname==='/play/multiplayer'`);
  await click('.activity-card[href="/multiplayer"]');
  await wait(`document.querySelector('.public-lobby h1')?.textContent==='Find a Room'`);
  assert(await evaluate(`!!document.querySelector('.lan-code-input') && !document.querySelector('.lan-mode-picker')`));
  await go('/multiplayer?room=ABC123', '.lan-code-input');
  assert.equal(await evaluate(`document.querySelector('.lan-code-input').value`), 'ABC123');
  if (process.env.MENU_TEST_ROOMS === '1') {
    await go('/play/multiplayer', '.activity-grid');
    await click('.activity-card[href="/play/multiplayer/hardpoint"]'); await wait(`!!document.querySelector('.public-lobby')`);
    await click('.lan-deploy');
    await wait(`!!document.querySelector('.public-lobby.has-room')`);
    await click('.public-actions .lan-cancel'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /You are hosting/);
    await key('Escape'); assert(await evaluate(`!!document.querySelector('.public-lobby.has-room')`));
    await click('.lobby-navigation button'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    await key('Escape'); assert.equal(await evaluate(`location.pathname`), '/play/multiplayer/hardpoint');
    await click('.public-actions .lan-deploy'); await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`,60000);
    await assertLoader('MULTIPLAYER · HARDPOINT', 'Chinatown · Smith Street');
    await click('.arena-leave'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    assert.match(await evaluate(`document.querySelector('[role="alertdialog"]').textContent`), /closes the match for everyone/);
    await key('Escape'); assert(await evaluate(`!!document.querySelector('.arena-start-card')`));
    await click('.arena-leave'); await wait(`!!document.querySelector('[role="alertdialog"]')`);
    await click('.confirm-leave'); await wait(`!!document.querySelector('.public-lobby')`);
    assert.equal(await evaluate(`!!document.querySelector('.public-lobby.has-room')`),false);
    console.log('PASS local multiplayer: room exit cancellation, Main menu guard, match exit warning, confirmed disconnect to lobby.');
  }
  // Store geometry and sticky navigation across device sizes.
  for (const [name, width, height, mobile] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',844,390,true]]) {
    await size(width,height,mobile); await go('/store','.loadout-store');
    await click('[data-browse-store]'); await wait(`!!document.querySelector('.catalog-only')`);
    await click('#shop-tab-weapon');
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `${name}: no horizontal overflow`);
    const geometry = await evaluate(`(()=>{const nav=document.querySelector('.store-nav').getBoundingClientRect(),wallet=document.querySelector('.profile-banner').getBoundingClientRect();return {nav:[nav.x,nav.y,nav.width,nav.height],wallet:[wallet.x,wallet.y,wallet.width,wallet.height],clear:nav.right<=wallet.left||wallet.right<=nav.left||nav.bottom<=wallet.top||wallet.bottom<=nav.top}})()`);
    assert(geometry.clear, `${name}: header groups do not overlap ${JSON.stringify(geometry)}`);
    await shot(`${name}-store`);
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`); await delay(250);
    assert(await evaluate(`document.querySelector('.context-back').getBoundingClientRect().top>=0`), `${name}: return stays visible`);
    await click('.armory-item[data-item="sar-ranger"]'); await wait(`document.querySelector('.loadout-store')?.dataset.loadoutView==='detail'`);
    await shot(`${name}-inspection`);
    await click('[data-loadout-back]'); assert(await evaluate(`!!document.querySelector('.catalog-only')`));
  }
  for (const [name,width,height,mobile] of [['desktop',1440,900,false],['small-phone',320,568,true],['portrait',390,844,true],['landscape',844,390,true]]) {
    await size(width,height,mobile); await go('/', '.game-menu');
    if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
    const controls = await evaluate(`[...document.querySelectorAll('.game-menu-item,.game-menu-welcome a,.game-install-go')].map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),inside:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1}})`);
    assert(controls.every(control=>control.inside), `${name}: menu controls fit ${JSON.stringify(controls)}`);
    await shot(`${name}-menu`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS menu navigation: contextual returns/state/focus, tabs, dialog containment, active-run exit cancellation, Back/Forward, named districts, landing-zone return, responsive store and inspection, separate single-player and multiplayer menus, solo setup and invite prefill.');
} catch (error) { console.error(error); await shot('failure').catch(()=>{}); process.exitCode = 1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
