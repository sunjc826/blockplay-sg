// Local Vite + isolated Chrome. Uses actual catalog data and real pointer/touch clicks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5351';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9581';
const output = new URL('../.cache/equipment-hub/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0, touch = false; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(method)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Timed out: ${expression}`); }
async function click(selector) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});let r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))){e.scrollIntoView({block:'center'});r=e.getBoundingClientRect();}if(!r.width||!r.height)throw Error('Hidden '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(100); }
async function choose(selector, value) { if (selector === '[aria-label="Weapon platform"]') { await click(`[data-platform="${value}"]`); return; } await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await delay(100); }
const view = name => `document.querySelector('.loadout-store')?.dataset.loadoutView===${JSON.stringify(name)}`;
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
async function home() { if (!await evaluate(view('home'))) { await click('[data-loadout-home]'); await wait(view('home')); } }
async function slot(name) { await home(); await click(`[data-loadout-slot="${name}"]`); }
async function inspect(name) { await click(`[data-item="${name}"]`); await wait(view('detail')); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function geometry(name) { const result = await evaluate(`(()=>{const root=document.querySelector('.loadout-store');return {page:document.documentElement.scrollWidth<=innerWidth+1,root:root.scrollWidth<=root.clientWidth+1}})()`); assert(result.page && result.root, `${name}: no horizontal overflow ${JSON.stringify(result)}`); }
const mode = name => `document.querySelector('.loadout-store')?.dataset.equipmentMode==='${name}'`;
async function changeMode(name) { await click('#equipment-tab-'+name); await wait(mode(name)); await delay(100); }
async function key(key) { await send('Input.dispatchKeyEvent',{type:'keyDown',key});await send('Input.dispatchKeyEvent',{type:'keyUp',key});await delay(150); }
try {
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:origin+'/inventory'});await wait(mode('inventory'),60000);
  await evaluate(`(()=>{const p=${wallet};p.xp=1000000;p.credits=100000;p.tokens=10000;p.rentals={'sar-ranger':3600000,'slot-extra':3600000};p.guns[0].variant='sar-ranger';p.carry={main:0,extra:1};p.consumables={'kit-bandage':2};localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));})()`);
  await send('Page.reload',{ignoreCache:true});await delay(1200);await wait(mode('inventory'));
  const before=await evaluate(wallet);
  for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,568],[844,390]]) {
    if(process.env.EQUIPMENT_SMOKE_WIDTH && width!==Number(process.env.EQUIPMENT_SMOKE_WIDTH))continue;
    touch=width<900;await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
    await slot('main');await click('[data-platform="1"]');
    await evaluate(`window.__shell=document.querySelector('.equipment-shell-nav');window.__slots=document.querySelector('.loadout-slots');window.__shifts=[];window.__observer?.disconnect();window.__observer=new MutationObserver(()=>{if(document.documentElement.dataset.routeShift)window.__shifts.push(document.documentElement.dataset.routeShift)});window.__observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-route-shift']})`);
    await changeMode('store');
    assert(await evaluate(`document.querySelector('[data-platform="1"]').getAttribute('aria-selected')==='true' && window.__shell===document.querySelector('.equipment-shell-nav') && window.__slots===document.querySelector('.loadout-slots')`));
    await click('[data-platform="0"]');await inspect('sar-vanguard');
    await evaluate(`window.scrollTo(0,500)`);await delay(100);const position=await evaluate('scrollY');
    // Sticky tabs remain available on portrait; landscape uses normal page scroll.
    await changeMode('inventory');assert(await evaluate(`document.querySelector('.loadout-content').textContent.includes('You don’t have this item') && !document.querySelector('[data-confirm-rental]')`));
    await screenshot('inventory-unowned-'+width);
    await click('[data-view-in-store]');await wait(mode('store'));await delay(100);
    assert(await evaluate(`!!document.querySelector('[data-choose-rental]') && document.querySelector('.loadout-content h2').textContent.includes('Garang')`));
    if(height>500)assert(Math.abs(await evaluate('scrollY')-position)<2,'Store scroll restored');
    await changeMode('inventory');await key('ArrowLeft');await wait(mode('store'));
    assert.equal(await evaluate('document.activeElement.id'),'equipment-tab-store');
    await evaluate('history.back()');await wait(mode('inventory'));await delay(100);
    await evaluate('history.forward()');await wait(mode('store'));await delay(100);
    assert.deepEqual(await evaluate('window.__shifts'),[],'No whole-screen transition');
    await slot('main');await inspect('sar-ranger');await changeMode('inventory');
    assert(await evaluate(`!!document.querySelector('[data-extend-rental]') && !!document.querySelector('.loadout-comparison') && !!document.querySelector('.loadout-specifications')`));
    await geometry('shared details '+width);
    await slot('main');await geometry('Inventory list '+width);await screenshot('inventory-'+width);
    await changeMode('store');await geometry('Store list '+width);await screenshot('store-'+width);
    await slot('supplies');await choose('.loadout-field select','all');await inspect('kit-bandage');await changeMode('inventory');
    assert(await evaluate(`!!document.querySelector('[data-pack-supply]') && !document.querySelector('[data-buy-supply]')`));
    await click('[data-pack-supply]');const packed=await evaluate(`!${wallet}.stowedSupplies.includes('kit-bandage')`);
    await click('[data-view-in-store]');await wait(mode('store'));assert.equal(await evaluate(`!${wallet}.stowedSupplies.includes('kit-bandage')`),packed);
    assert(await evaluate(`!!document.querySelector('[data-buy-supply]')`));
    await slot('vision');await changeMode('inventory');assert(await evaluate(`!!document.querySelector('[data-item="vision-none"]') && !document.querySelector('[data-item="nvg-gen1"]')`));
    await changeMode('store');await home();await click('[data-browse-store]');await click('#shop-tab-food');await changeMode('inventory');
    assert.equal(await evaluate(`document.querySelector('.loadout-field select').value`),'food');
    await changeMode('store');await wait(`!!document.querySelector('#shop-tab-food')`);
    assert.equal(await evaluate(`document.querySelector('#shop-tab-food').getAttribute('aria-selected')`),'true');await geometry('embedded catalog '+width);await screenshot('catalog-'+width);
    console.log('PASS '+width+'x'+height+': persistent shell, platform/item context, Store scroll, keyboard/history, supplies, full details, catalog and no overflow');
  }
  await click('.store-settings');await wait(`!!document.querySelector('.armory-settings')`);await click('.context-back');await wait(`!!document.querySelector('.catalog-only')`);
  const after=await evaluate(wallet);assert.equal(after.credits,before.credits);assert.equal(after.tokens,before.tokens);assert.deepEqual(after.rentals,before.rentals);assert.deepEqual(after.carry,before.carry);
  // Both menu shortcuts enter the same shell with the matching tab selected.
  for(const name of ['inventory','store']) {
    await click('.store-nav a[href="/"]');await wait(`!!document.querySelector('.game-menu-list')`);
    await click(`.game-menu-list a[href="/${name}"]`);await wait(mode(name));await delay(150);
    if(name==='inventory')assert(!await evaluate(`!!document.querySelector('.catalog-only')`),'Inventory entry must not reopen the full Store catalog');
  }
  assert.deepEqual(errors,[]);console.log('PASS both menu shortcuts and no balance/rental/loadout mutation from navigation');
} catch(error){console.error(error);await screenshot('failure').catch(()=>{});process.exitCode=1;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
