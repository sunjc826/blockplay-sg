// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/menu-system/', import.meta.url); await fs.mkdir(output, { recursive: true });
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

const assertControls = async (selector, label) => {
  const small = await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.5}).map(e=>({text:e.innerText,height:e.getBoundingClientRect().height}))`);
  assert.deepEqual(small, [], `${label}: 44px controls`);
};
const noOverflow = async () => assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal page overflow');
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Network.enable'); await send('Network.setBypassServiceWorker',{bypass:true});
  for (const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]) {
    await size(width,height,width<900);
    await go('/store','.loadout-store');
    await shot(`home-${width}`); await noOverflow();
    assert(await evaluate(`document.querySelectorAll('.loadout-store .ui-button-primary').length===1 && !!document.querySelector('.loadout-footer [data-loadout-play].ui-button-primary')`), 'Play is the one primary action at home');
    assert(await evaluate(`document.querySelector('.loadout-workspace').firstElementChild.classList.contains('loadout-content')`),'Task precedes the overview in keyboard order');
    if(width<=760) assert(await evaluate(`document.querySelector('.loadout-content').getBoundingClientRect().top < document.querySelector('.loadout-workspace > aside').getBoundingClientRect().top`),'Phone task precedes the equipment overview');
    else assert(await evaluate(`document.querySelector('.loadout-content').getBoundingClientRect().bottom <= document.querySelector('.loadout-workspace > aside').getBoundingClientRect().top + 1`),'Store home shows the slots below the heading');
    await click('[data-browse-store]'); await wait(`!!document.querySelector('.armory-grid')`);
    await shot(`catalog-${width}`); await noOverflow();
    assert(await evaluate(`Array.from(document.querySelectorAll('.equipment-card-kind,.equipment-card-price,.equipment-status')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)`),'Readable catalog metadata');
    assert(await evaluate(`Array.from(document.querySelectorAll('.equipment-card-name')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)`),'Shared item-title scale');
    await assertControls('.ui-tabs [role=tab],[data-owned-filter]','Catalog');
    await evaluate(`document.querySelector('#shop-tab-weapon').focus()`); await key('ArrowRight');
    assert.equal(await evaluate(`document.activeElement.id`),'shop-tab-skin');
    await key('Home');
    await click('.store-settings'); await wait(`!!document.querySelector('.settings-tabs')`);
    await click('#settings-tab-video'); await shot(`settings-${width}`); await noOverflow();
    await assertControls('.settings-tabs button,.graphics-settings select','Settings');
    assert(await evaluate(`document.querySelector('.settings-tabs').scrollWidth <= document.querySelector('.settings-tabs').clientWidth + 1`),'All settings categories fit');
    await evaluate(`document.querySelector('#settings-tab-video').focus()`); await key('ArrowRight');
    assert.equal(await evaluate('document.activeElement.id'),'settings-tab-audio');
    await assertControls('.armory-volume input','Audio');
    await key('ArrowLeft');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab'});
    assert(await evaluate(`getComputedStyle(document.activeElement).outlineColor==='rgb(242, 206, 139)'`),'Shared keyboard-focus color');
    for (const design of ['classic','next-gen']) {
      await click(`[data-menu-design="${design}"]`);
      await go('/','.game-menu');
      if(await evaluate(`!!document.querySelector('.game-title')`)){await click('.game-title');await delay(1100);}
      await shot(`menu-${design}-${width}`); await noOverflow();
      await assertControls('.game-install-hide,.game-install-go,.game-debug-link,.next-gen-settings','Home');
      await go('/settings','.settings-tabs');await click('#settings-tab-video');
    }
    console.log(`PASS ${width}x${height}: hierarchy, type, target sizes, tabs, focus and both layouts`);
  }
  assert.deepEqual(errors,[],'No runtime errors');
} catch(error) {console.error(error);await shot('failure').catch(()=>{});process.exitCode=1;}
finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
