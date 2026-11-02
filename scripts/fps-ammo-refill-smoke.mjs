// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/ammo-refill/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
 await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable'); await send('Page.bringToFront');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 // Queue release immediately so slow software rendering cannot turn a tap into a hold.
 async function tap(expression) { const p=await point(expression); const down=send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]}); const up=send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await down; await up; }
 console.log('Checking store');
 await send('Page.navigate',{url:origin+'/store'}); await wait(`!!document.querySelector('#shop-tab-utility')`);
 await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');localStorage.setItem(m.STORAGE_KEY,JSON.stringify(m.createProfile()));location.reload()})()`);
 await wait(`!!document.querySelector('#shop-tab-utility')`); await tap(`document.querySelector('#shop-tab-utility')`);
 await tap(`document.querySelector('[data-item="kit-ammo-refill"]')`); await wait(`document.querySelector('[data-testid="shop-action"]').textContent.includes('Buy')`);
 await tap(`document.querySelector('[data-testid="shop-action"]')`); await wait(`${wallet}.consumables['kit-ammo-refill']===1`);
 assert.equal(await evaluate(`${wallet}.tokens`),250); await screenshot('store-ammo-refill');
 console.log('Store purchase passed; loading real engine');
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html?ammo'}); await wait(`window.hud?.phase==='ready'`,60000);
 console.log('Engine ready; starting touch input');
 await tap(`document.querySelector('#start')`); await wait(`window.hud.phase==='playing'&&window.hud.inputMode==='touch'`);
 console.log('Engine playing; checking wheels');
 for (const [width,height,label] of [[390,844,'portrait'],[844,390,'landscape']]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
   await wait(`!!document.querySelector('.fps-belt.is-docked')===${height<560}`); await delay(300);
   await tap(`document.querySelector('button[aria-label="Choose recovery item"]')`); await wait(`!!window.hud.recoveryPicker`);
   await wait(`[...document.querySelectorAll('.fps-utility-option img')].every(i=>i.naturalWidth>0)`);
   const layout=await wheelLayout();assert(layout.images&&layout.onscreen&&layout.targets&&!layout.overlap,JSON.stringify(layout));
   await screenshot('ammo-wheel-'+label);
   await tap(`document.querySelector('.fps-utility-option[data-item="kit-ammo-refill"]')`);
   await wait(`window.hud.recoveryChoice==='kit-ammo-refill'&&!window.hud.recoveryPicker`);assert(!await evaluate('window.hud.supplyUse'));
 }
 console.log('Wheels passed; checking full-ammo and use');
 const quick=`document.querySelector('.fps-quick-slot[data-group="recovery"]')`;
 await tap(quick); await delay(250); assert(!await evaluate('window.hud.supplyUse||window.hud.recoveryPicker')); assert.equal(await evaluate('window.hud.recoveryItem.count'),2);
 await evaluate(`window.engine.setInput('fire',true)`); await wait('window.hud.magazine===0'); await evaluate(`window.engine.setInput('fire',false)`);
 await evaluate('window.engine.reload()'); await wait('window.hud.magazine>0&&!window.hud.reloading');
 assert.equal(await evaluate('window.hud.spareMagazines'),3);
 await tap(quick); await wait('!!window.hud.supplyUse'); await evaluate('window.engine.pause()'); await wait(`window.hud.phase==='paused'`);
 assert.equal(await evaluate('window.hud.recoveryItem.count'),2); assert.equal(await evaluate('window.consumed.length'),0);
 await evaluate('window.engine.start()'); await wait(`window.hud.phase==='playing'`);
 await tap(quick); await wait('!!window.hud.supplyUse'); await screenshot('ammo-refill-in-use');
 await wait('window.hud.recoveryItem.count===1&&!window.hud.supplyUse');
 assert.equal(await evaluate('window.hud.magazine'),3); assert.equal(await evaluate('window.hud.spareMagazines'),4);
 assert.equal(await evaluate(`window.consumed.filter(id=>id==='kit-ammo-refill').length`),1);
 await tap(quick); await delay(300); assert.equal(await evaluate('window.hud.recoveryItem.count'),1);
 await evaluate(`window.engine.setInput('fire',true)`); await wait('window.hud.magazine===0'); await evaluate(`window.engine.setInput('fire',false)`);
 await tap(quick); await wait('window.hud.recoveryItem.count===0&&!window.hud.supplyUse');
 assert.equal(await evaluate('window.hud.magazine'),3);assert.equal(await evaluate('window.hud.spareMagazines'),4);
 await tap(quick);await delay(300);assert(!await evaluate('window.hud.supplyUse'));assert.equal(await evaluate(`window.consumed.filter(id=>id==='kit-ammo-refill').length`),2);
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 console.log('PASS Ammo Refill: 50-token store purchase, portrait/landscape wheel and images, full-ammo guard, cancel without spending, loaded gun + empty pouch refill, loaded-only refill, one item per use, depleted-item guard; no runtime/shader errors or map requests.');
} catch(error) { console.log(errors,await evaluate(`({hud:window.hud,body:document.body.innerText.slice(0,900)})`).catch(()=>null)); await screenshot('ammo-refill-failure'); throw error; }
finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
