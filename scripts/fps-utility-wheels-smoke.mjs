// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/utility-wheels/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/inventory`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Log.entryAdded' && /THREE.WebGLProgram|Shader Error/.test(m.params.entry.text)) errors.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(m.params.request.url)) mapRequests++;
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
const canvas = `document.querySelector('#world canvas')`;
async function pointItem(group, id) {
  await evaluate(`(()=>{const p=window.hud.${group==='recovery'?'recoveryPicker':'grenadePicker'};const i=p.options.findIndex(o=>o.id===${JSON.stringify(id)});if(i<0)throw Error('Missing item');const a=i/p.options.length*Math.PI*2;document.dispatchEvent(new MouseEvent('mousemove',{movementX:Math.sin(a)*110,movementY:-Math.cos(a)*110}));})()`);
}
async function open(group) {
  const k=group==='recovery'?'f':'g';await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:`Key${k.toUpperCase()}`});
  await wait(`!!window.hud.${group==='recovery'?'recoveryPicker':'grenadePicker'}`);
}
async function release(group) {const k=group==='recovery'?'f':'g';await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:`Key${k.toUpperCase()}`});}
async function wheelLayout() {
  return evaluate(`(()=>{const buttons=[...document.querySelectorAll('.fps-utility-option')];const r=buttons.map(b=>b.getBoundingClientRect());return {images:buttons.every(b=>b.querySelector('img').naturalWidth>0),onscreen:r.every(b=>b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight),targets:r.every(b=>b.width>=43.9&&b.height>=43.9),overlap:r.some((a,i)=>r.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)),count:buttons.length}})()`);
}
try {
 await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Page.enable');await send('Page.bringToFront');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await wait(`!!document.querySelector('.inventory')`);
 await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.xp=50000;p.consumables={'kit-bandage':2,'grenade-smoke':2};localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));location.reload()})()`);
 await wait(`!!document.querySelector('#inventory-tab-supply')`);await click(`document.querySelector('#inventory-tab-supply')`);
 const supplyButton=`document.querySelector('[data-inventory-item="kit-bandage"] button')`;
 await click(supplyButton);await wait(`${wallet}.stowedSupplies.includes('kit-bandage')`);assert.equal(await evaluate(`${wallet}.consumables['kit-bandage']`),2);
 await send('Page.reload');await wait(`!!document.querySelector('#inventory-tab-supply')`);await click(`document.querySelector('#inventory-tab-supply')`);
 assert(await evaluate(`${supplyButton}.textContent.includes('In locker')`));await screenshot('inventory-stowed');
 await click(supplyButton);await wait(`!${wallet}.stowedSupplies.includes('kit-bandage')`);
 await send('Page.navigate',{url:origin+'/store'});await wait(`!!document.querySelector('#shop-tab-utility')`);await click(`document.querySelector('#shop-tab-utility')`);
 await click(`document.querySelector('[data-item="grenade-smoke"]')`);await click(`document.querySelector('[data-testid="shop-select"]')`);await wait(`${wallet}.stowedSupplies.includes('grenade-smoke')`);
 assert.equal(await evaluate(`${wallet}.consumables['grenade-smoke']`),2);await screenshot('store-stowed');
 console.log('PASS inventory and store: unequip/re-equip, retained counts, saved across reload');
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html'});await wait(`window.hud?.phase==='ready'`,60000);await click(`document.querySelector('#start')`);await wait(`window.hud.phase==='playing'`);
 assert(await evaluate('!!document.pointerLockElement'));
 const startCount=await evaluate(`window.hud.recoveryItem.count`);
 await open('recovery');await wait(`[...document.querySelectorAll('.fps-utility-option img')].every(i=>i.naturalWidth>0)`);
 const ids=await evaluate(`window.hud.recoveryPicker.options.map(i=>i.id)`);
 assert(ids.includes('kit-bandage')&&ids.includes('kit-first-aid')&&ids.includes('kit-plates')&&ids.includes('food-kaya-toast'));
 assert(!ids.includes('kit-ammo')&&!ids.includes('food-smoking-corner'));
 assert.equal(await evaluate('window.hud.recoveryItem.count'),startCount);
 await pointItem('recovery','food-kaya-toast');await screenshot('recovery-desktop');
 assert.deepEqual(await wheelLayout(),{images:true,onscreen:true,targets:true,overlap:false,count:ids.length});
 await release('recovery');await wait(`window.hud.recoveryChoice==='food-kaya-toast'&&!window.hud.recoveryPicker`);assert(!await evaluate('window.hud.supplyUse'));
 await key('f','KeyF');await wait(`!!window.hud.supplyUse`);await wait(`window.hud.recoveryItem.count===1`,10000);await wait('!window.hud.supplyUse');
 const recovery=await evaluate('window.hud.recoveryChoice');
 await open('combat');await pointItem('combat','grenade-smoke');await screenshot('combat-desktop');const combatCount=await evaluate('window.hud.grenadePicker.options.length');
 assert.deepEqual(await wheelLayout(),{images:true,onscreen:true,targets:true,overlap:false,count:combatCount});
 await release('combat');assert.equal(await evaluate('window.hud.recoveryChoice'),recovery);assert(!await evaluate('window.hud.grenadeHeld'));
 await key('g','KeyG');await wait(`window.hud.grenadeHeld?.id==='grenade-smoke'`);await delay(500);
 await evaluate(`window.engine.setInput('fire',true)`);await delay(180);await evaluate(`window.engine.setInput('fire',false)`);await wait(`window.hud.combatItem.count===0`);
 await delay(1100);await key('g','KeyG');assert.equal(await evaluate('window.hud.grenadeChoice'),'grenade-smoke');assert(!await evaluate('window.hud.grenadeHeld'));
 // A cancelled hold, Escape, obsolete number keys and repeat events never use anything.
 await open('recovery');await send('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:500,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:700,y:500,button:'right',clickCount:1});await release('recovery');assert(!await evaluate('window.hud.supplyUse'));
 await open('recovery');await key('Escape','Escape');await release('recovery');await wait(`window.hud.phase==='paused'`);assert(!await evaluate('window.hud.supplyUse||window.hud.recoveryPicker||window.hud.grenadePicker'));
 await evaluate(`window.engine.start()`);await wait(`window.hud.phase==='playing'`);
 for(const n of ['4','5','6','7','8','9'])await key(n,'Digit'+n);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',autoRepeat:true});await release('recovery');assert(!await evaluate('window.hud.supplyUse'));
 console.log('PASS F/G: hold-select, tap-use, independent choices, no use on select/cancel/pause/repeat, depleted smoke never becomes frag');
 // Touch portrait and landscape: same components, image targets, no synthetic-click double use.
 await evaluate('window.engine.pause()');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html?full'});await wait(`window.hud?.phase==='ready'`,60000);
 const p=await point(`document.querySelector('#start')`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(`window.hud.phase==='playing'&&window.hud.inputMode==='touch'`);
 for(const [width,height,label]of [[390,844,'portrait'],[844,390,'landscape']]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
   await wait(`!!document.querySelector('.fps-belt.is-docked')===${height<560}`);await delay(250);
   for(const group of ['recovery','combat']){
     const p=await point(`document.querySelector('button[aria-label="Choose ${group} item"]')`);
     await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:2}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await wait(`!!document.querySelector('.fps-utility-picker[data-group="${group}"]')`);await wait(`[...document.querySelectorAll('.fps-utility-option img')].every(i=>i.naturalWidth>0)`);
     const layout=await wheelLayout();assert(layout.images&&layout.onscreen&&layout.targets&&!layout.overlap,JSON.stringify({label,group,...layout}));await screenshot(group+'-'+label);
     const pick=await point(`document.querySelector('.fps-utility-option[data-item="${group==='recovery'?'food-kaya-toast':'grenade-smoke'}"]')`);
     await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pick,id:2}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(`!document.querySelector('.fps-utility-picker')`);assert(!await evaluate('window.hud.supplyUse||window.hud.grenadeHeld'));
   }
 }
 const heldButton=await point(`document.querySelector('.fps-quick-slot[data-group="recovery"]')`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...heldButton,id:3}]});await wait('!!window.hud.recoveryPicker');
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(!await evaluate('window.hud.supplyUse'));
 const close=await point(`document.querySelector('button[aria-label="Close utility picker"]')`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...close,id:3}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait('!window.hud.recoveryPicker');
 const tap=await point(`document.querySelector('.fps-quick-slot[data-group="recovery"]')`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tap,id:3}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait('!!window.hud.supplyUse');await wait('window.hud.recoveryItem.count===1',10000);await wait('!window.hud.supplyUse');await delay(500);assert.equal(await evaluate('window.hud.recoveryItem.count'),1);
 console.log('PASS portrait/landscape: every carried image loads, 44px+ targets, no overlap/clipping, touch selection does not activate, one tap spends one item');
 // Existing purchased ammo stays usable through ordinary reloads, without a wheel entry.
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html?ammo'});await wait(`window.hud?.phase==='ready'`,60000);await click(`document.querySelector('#start')`);await wait(`window.hud.phase==='playing'`);
 for(let magazine=0;magazine<5;magazine++){
   await evaluate(`window.engine.setInput('fire',true)`);await wait('window.hud.magazine===0',10000);await evaluate(`window.engine.setInput('fire',false)`);
   await key('r','KeyR');await wait('window.hud.magazine>0&&!window.hud.reloading',10000);
 }
 assert.equal(await evaluate(`window.hud.belt.find(s=>s.kind==='ammo').count`),1);
 assert.equal(await evaluate(`window.consumed.filter(id=>id==='kit-ammo').length`),1);
 assert(!await evaluate('window.hud.supplyUse'));assert.equal(await evaluate('window.hud.spareMagazines'),1);
 console.log('PASS automatic ammo: exhausting four spare magazines then pressing R consumes one pouch, supplies two magazines, and completes the reload');
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);console.log('PASS no runtime/shader errors or map requests');
} catch(error) {console.log(errors,await evaluate(`({hud:window.hud?.phase,body:document.body.innerText.slice(0,900)})`).catch(()=>null));await screenshot('failure');throw error;}
finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
