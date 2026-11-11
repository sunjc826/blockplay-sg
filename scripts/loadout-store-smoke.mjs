// Local Vite + isolated Chrome. Uses actual catalog data and real pointer/touch clicks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5351';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9581';
const output = new URL('../.cache/loadout-store/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0, touch = false; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(method)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Timed out: ${expression}`); }
async function click(selector) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(100); }
async function choose(selector, value) { if (selector === '[aria-label="Weapon platform"]') { await click(`[data-platform="${value}"]`); return; } await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await delay(100); }
const view = name => `document.querySelector('.loadout-store')?.dataset.loadoutView===${JSON.stringify(name)}`;
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
// Selecting the active Store/Inventory tab returns to its home (slots or locker).
async function home() { if (!await evaluate(view('home'))) { await click(`#equipment-tab-${await evaluate(`document.querySelector('.loadout-store').dataset.equipmentMode`)}`); await wait(view('home')); } }
async function slot(name) { await home(); await click(`[data-loadout-slot="${name}"]`); }
async function inspect(name) { await click(`[data-item="${name}"]`); await wait(view('detail')); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function geometry(name) { const result = await evaluate(`(()=>{const root=document.querySelector('.loadout-store');return {page:document.documentElement.scrollWidth<=innerWidth+1,root:root.scrollWidth<=root.clientWidth+1}})()`); assert(result.page && result.root, `${name}: no horizontal overflow ${JSON.stringify(result)}`); }
async function seed(overrides = {}) {
  await evaluate('window.__loadoutSeedMark=true');
  await send('Page.navigate', { url: origin + '/store' }); await wait(`!window.__loadoutSeedMark && !!document.querySelector('.loadout-store')`);
  await evaluate(`(async()=>{const {createProfile,STORAGE_KEY}=await import('/src/game/armory-state.ts');const {xpForLevel}=await import('/src/game/progression.ts');const p={...createProfile(),xp:xpForLevel(50),credits:100000,tokens:10000,...${JSON.stringify(overrides)}};localStorage.setItem(STORAGE_KEY,JSON.stringify(p));})()`);
  await evaluate('window.__loadoutSeedMark=true'); await send('Page.reload', { ignoreCache: true }); await wait(`!window.__loadoutSeedMark && (${view('home')})`);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await seed(); await geometry('home'); await screenshot('desktop-home');
  await slot('main');
  await send('Runtime.evaluate', {expression:`document.querySelector('[data-platform="0"]').focus()`});
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
  assert(await evaluate(`document.querySelector('[data-platform="1"]').getAttribute('aria-selected')==='true'`));
  await choose('[aria-label="Weapon platform"]','0'); await inspect('sar-ranger');
  await wait(`!!document.querySelector('.armory-preview canvas') && !document.querySelector('.armory-preview-status')`);
  assert(await evaluate(`!document.querySelector('.loadout-specifications').closest('details') && document.querySelector('.loadout-comparison').textContent.includes('Recoil recovery')`));
  await screenshot('desktop-comparison');
  console.log('PASS platform keyboard tabs, inline 3D preview and full visible specifications');
  await click('[data-choose-rental]'); await wait(view('rental')); await click('[data-rental-term="2h"]');
  const expected = await evaluate(`(async()=>{const {itemById}=await import('/src/game/armory-catalog.ts');const {weaponTermPrice}=await import('/src/game/weapon-rentals.ts');return weaponTermPrice(itemById('sar-ranger'),'2h')})()`);
  assert(await evaluate(`document.body.textContent.includes(${JSON.stringify((100000 - expected).toLocaleString() + ' credits')})`));
  await click('[data-confirm-rental]'); await wait(`${wallet}.guns[0].variant==='sar-ranger'`); assert.equal(await evaluate(`${wallet}.credits`), 100000 - expected);
  await slot('main'); await inspect('sar-issued'); await click('[data-equip-item]'); await wait(`${wallet}.guns[0].variant==='sar-issued'`);
  await slot('main'); await inspect('sar-ranger'); await click('[data-equip-item]'); assert.equal(await evaluate(`${wallet}.credits`), 100000 - expected);
  console.log('PASS weapon rental, exact cost and no-charge equipment changes');
  await slot('extra'); await click('.loadout-workspace .loadout-primary'); await click('[data-confirm-rental]'); await wait(view('browse'));
  assert.equal(await evaluate(`${wallet}.carry.main`), 0); assert.equal(await evaluate(`${wallet}.carry.extra`), null);
  const extraFamily = await evaluate(`Number(document.querySelector('[aria-label="Weapon platform"] [aria-selected="true"]').dataset.platform)`);
  const extraItem = await evaluate(`${wallet}.guns[${extraFamily}].variant`);
  await inspect(extraItem); await click('[data-equip-item]'); await wait(`${wallet}.carry.extra===${extraFamily}`); assert.equal(await evaluate(`${wallet}.carry.main`), 0);
  await slot('extra'); await choose('[aria-label="Weapon platform"]', '0'); await inspect('sar-ranger'); assert(await evaluate(`document.querySelector('[data-equip-item]').disabled`));
  console.log('PASS explicit extra destination and duplicate-platform rejection');
  // Every gear family and both cosmetic destinations keep the same rental flow.
  for (const [name, item, expression] of [['rig','rig-lbs','rig'],['plate','plate-soft','plate'],['vision','nvg-gen1','vision'],['skin','skin-jungle','guns[0].skin'],['vehicleSkin','paint-jungle','vehicleSkins.car']]) {
    await slot(name); if(name==='skin')await choose('[aria-label="Weapon platform"]','0'); await inspect(item); await click('[data-choose-rental]');
    await click('.loadout-checkbox input'); await click('[data-confirm-rental]'); await wait(view('detail')); assert.notEqual(await evaluate(`${wallet}.${expression}`), item);
    await click('[data-equip-item]'); await wait(`${wallet}.${expression}===${JSON.stringify(item)}`);
    await slot(name); await inspect(item); await click('[data-extend-rental]'); await click('[data-rental-term="4h"]'); await click('[data-confirm-rental]'); await wait(`${wallet}.rentals[${JSON.stringify(item)}]===5*3600000`);
  }
  console.log('PASS gear/skin/vehicle rent-only, equip and renew');
  await slot('supplies'); await inspect('kit-bandage'); await choose('[aria-label="Supply quantity"]','2'); await click('[data-buy-supply]'); await wait(`${wallet}.consumables['kit-bandage']===2`);
  await click('[data-pack-supply]'); assert(await evaluate(`${wallet}.stowedSupplies.includes('kit-bandage')`));
  await click('[data-buy-supply]'); await wait(`${wallet}.consumables['kit-bandage']===3`); assert(!await evaluate(`${wallet}.stowedSupplies.includes('kit-bandage')`));
  await click('#equipment-tab-inventory'); await wait(`document.querySelector('.loadout-store')?.dataset.equipmentMode==='inventory'`); assert(await evaluate(`document.querySelector('.loadout-content').textContent.includes('3 in stock') && !!document.querySelector('[data-pack-supply]')`));
  await click('#equipment-tab-store'); await wait(`!!document.querySelector('.loadout-store')`); await home();
  await click('[data-browse-store]'); await wait(`!!document.querySelector('.catalog-only')`); await click('#shop-tab-weapon'); await inspect('sar-ranger');
  assert(await evaluate(`!!document.querySelector('[data-extend-rental]')`)); await click('[data-loadout-back]'); await wait(`!!document.querySelector('.catalog-only')`); await inspect('sar-ranger'); await home();
  console.log('PASS stock/packs shared with Inventory and traditional catalog returns to shared details');
  await screenshot('desktop-footer'); await click('[data-loadout-play]'); await wait(`location.pathname==='/play'`);
  await send('Page.navigate', { url: origin + '/store' }); await wait(`!!document.querySelector('.loadout-store')`);
  console.log('PASS footer Play opens the Play menu');
  await seed({ xp: 0, credits: 0, tokens: 0 }); await slot('main'); await inspect('sar-ranger'); assert(!await evaluate(`!!document.querySelector('[data-choose-rental]')`));
  await slot('plate'); await inspect('plate-soft'); await click('[data-choose-rental]'); assert(await evaluate(`document.querySelector('[data-confirm-rental]').disabled`));
  const before=await evaluate(`${wallet}.credits`); await click('[data-loadout-back]'); assert.equal(await evaluate(`${wallet}.credits`),before);
  console.log('PASS level locks, insufficient balance and cancellation');
  for (const [name,width,height,mobile] of [['small',320,568,true],['phone',390,844,true],['landscape',844,390,true]]) {
    touch=mobile; await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile}); await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5}); await seed();
    await geometry(name+' home'); await screenshot(name+'-home');
    await slot('main'); await geometry(name+' list'); await choose('[aria-label="Weapon platform"]','1'); await choose('[aria-label="Weapon platform"]','0'); await inspect('sar-ranger'); await geometry(name+' detail');
    await wait(`!!document.querySelector('.armory-preview canvas') && !document.querySelector('.armory-preview-status')`);
    await screenshot(name+'-inline-preview');
    await evaluate(`document.querySelector('.loadout-comparison').scrollIntoView({block:'start'})`); await screenshot(name+'-full-comparison');
    assert(await evaluate(`document.querySelector('.loadout-comparison').textContent.includes('Combined movement') && !document.querySelector('.loadout-specifications').closest('details')`));
    await click('[data-choose-rental]'); await geometry(name+' rental'); await screenshot(name+'-rental'); await click('[data-confirm-rental]'); await wait(view('home'));
    assert(await evaluate(`document.querySelector('.loadout-feedback').textContent.includes('rented and equipped')`));
    await geometry(name+' footer'); assert(await evaluate(`!!document.querySelector('.loadout-footer [data-loadout-play]')`)); await screenshot(name+'-footer');
    await home(); await click('.store-tour-trigger'); await wait(`!!document.querySelector('.loadout-guide')`);
    for(let step=0;step<4;step++)await click('.loadout-guide .loadout-primary');await wait(`!document.querySelector('.loadout-guide')`);
    console.log(`PASS ${name}: touch purchase, visible feedback, layout and tour`);
  }
  assert.deepEqual(errors, []); console.log('PASS loadout-first store');
} catch(error) { console.error(error); await screenshot('failure').catch(()=>{}); process.exitCode=1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
