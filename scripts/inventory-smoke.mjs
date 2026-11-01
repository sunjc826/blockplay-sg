// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/hourly-rentals/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/inventory`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { const timer=setTimeout(()=>reject(new Error('Chrome connection timeout')),20000); ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(m.params.request.url)) mapRequests++;
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');let r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth){e.scrollIntoView({block:'center'});r=e.getBoundingClientRect();}return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
let useTouch = false;
async function click(expression) { await wait(`(()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`); const p = await point(expression); if(useTouch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return;} await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
const action = `document.querySelector('[data-testid="shop-action"]')`;
const results=[];
try {
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await wait(`!!document.querySelector('.inventory')`);
 // A legacy save contains a permanent rifle, unrelated owned gear, supplies and an old calendar rental.
 await evaluate(`(()=>{const p=${wallet};delete p.rentalClock;p.xp=50000;p.credits=50000;p.tokens=3000;p.owned=[...new Set([...p.owned,'sar-vanguard','skin-gold','plate-ceramic'])];p.guns[0].variant='sar-vanguard';p.guns[0].skin='skin-gold';p.plate='plate-ceramic';p.consumables={'kit-bandage':2};p.rentals={'sar-ranger':Date.now()+600000};localStorage.setItem('blockplay.menu.training','queenstown');localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));location.reload()})()`);
 await wait(`${wallet}.rentalClock==='playtime' && !!document.querySelector('[data-inventory-item="sar-ranger"]')`);
 const migrated=await evaluate(wallet);
 assert(!migrated.owned.includes('sar-vanguard'));assert.equal(migrated.guns[0].variant,'sar-issued');assert.equal(migrated.guns[0].skin,'skin-gold');
 assert.equal(migrated.credits,50000);assert.equal(migrated.tokens,3000);assert.equal(migrated.plate,'plate-ceramic');
 assert(migrated.rentals['sar-ranger']>590000&&migrated.rentals['sar-ranger']<=600000);
 const held=migrated.rentals['sar-ranger'];await delay(1800);await send('Page.reload');await wait(`!!document.querySelector('.inventory')`);
 assert.equal(await evaluate(`${wallet}.rentals['sar-ranger']`),held);
 results.push('Legacy permanent weapons cleared; active rental migrates once; balances, gear and supplies retained');
 results.push('Inventory and reload time do not spend rentals');
 await click(`document.querySelector('#inventory-tab-gear')`);assert(await evaluate(`!!document.querySelector('[data-inventory-item="skin-gold"]')`));
 await click(`document.querySelector('#inventory-tab-supply')`);assert(await evaluate(`document.querySelector('[data-inventory-item="kit-bandage"]').textContent.includes('2 held')`));
 await click(`document.querySelector('#inventory-tab-weapon')`);await click(`document.querySelector('[data-inventory-item="sar-ranger"] button')`);
 await wait(`${wallet}.guns[0].variant==='sar-ranger'`);await screenshot('inventory-desktop');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});useTouch=true;await delay(500);
 assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));await screenshot('inventory-mobile');
 results.push('Inventory weapons/gear/supplies tabs, equip action and 390px layout pass');
 await click(`document.querySelector('.inventory-header a[href="/store"]')`);await wait(`!!${action}`);
 assert.equal(await evaluate(`!!document.querySelector('[data-rental-term="permanent"]')`),false);
 const term=id=>`document.querySelector('[data-rental-term="${id}"]')`;
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-rental-term]')].map(e=>e.dataset.rentalTerm)`),['1h','2h','4h']);
 assert(await evaluate(`${term('2h')}.textContent.includes('44 TK') && ${term('2h')}.textContent.includes('Save 4 TK')`));
 assert(await evaluate(`${term('4h')}.textContent.includes('77 TK') && ${term('4h')}.textContent.includes('Save 19 TK')`));
 await click(term('2h'));await click(action);await wait(`!!${wallet}.rentals['sar-vanguard']`);
 assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`),2*3600000);assert.equal(await evaluate(`${wallet}.tokens`),2956);
 await click(term('4h'));await click(`document.querySelector('[data-testid="shop-renew"]')`);await wait(`${wallet}.tokens===2879`);
 assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`),6*3600000);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`document.querySelector('.armory-purchase').scrollIntoView({block:'center'})`);await delay(500);await screenshot('bulk-hour-rentals');
 const discard=`document.querySelector('[data-discard-rental]')`,confirm=`document.querySelector('[data-discard-confirm]')`;
 await click(discard);assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`),6*3600000);
 await click(`[...document.querySelectorAll('.rental-discard button')].find(e=>e.textContent==='Cancel')`);
 assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`),6*3600000);
 await click(discard);await click(confirm);await wait(`!${wallet}.rentals['sar-vanguard']`);
 assert.equal(await evaluate(`${wallet}.tokens`),2879);assert.equal(await evaluate(`${wallet}.guns[0].variant`),'sar-ranger');
 await click(term('1h'));await click(action);await wait(`${wallet}.rentals['sar-vanguard']===3600000`);await click(action);await wait(`${wallet}.guns[0].variant==='sar-vanguard'`);
 await click(`document.querySelector('.store-nav a[href="/inventory"]')`);await wait(`!!document.querySelector('[data-inventory-item="sar-vanguard"]')`);
 const card=`document.querySelector('[data-inventory-item="sar-vanguard"]')`;
 await click(`${card}.querySelector('[data-discard-rental]')`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`document.querySelector('[data-inventory-item="sar-vanguard"] .rental-discard').scrollIntoView({block:'center'})`);await delay(500);await screenshot('discard-rental-mobile');
 await click(`${card}.querySelector('[data-discard-confirm]')`);await wait(`!${wallet}.rentals['sar-vanguard']`);
 assert.equal(await evaluate(`${wallet}.tokens`),2855);assert.equal(await evaluate(`${wallet}.guns[0].variant`),'sar-issued');
 assert.equal(await evaluate(`!!document.querySelector('[data-inventory-item="sar-issued"] [data-discard-rental]')`),false);
 results.push('1/2/4-hour terms, exact rounded bulk savings, paid renewals and uncapped six-hour balance pass');
 results.push('Store and Inventory discard, cancellation, no refunds, equipped issued fallback and issued-weapon protection pass');
 // A short remaining balance exercises the real game's clock, pause and expiry without waiting a day.
 await evaluate(`(()=>{const p=${wallet};p.rentals['sar-ranger']=6000;p.guns[0].variant='sar-ranger';localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));location.href='/training'})()`);
 await wait(`!!document.querySelector('.starting-deploy')`);await click(`document.querySelector('.starting-deploy')`);
 await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`,60000);
 assert.equal(await evaluate(`${wallet}.rentals['sar-ranger']`),6000);
 await click(`document.querySelector('.fps-start-card .primary-button')`);await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
 await wait(`${wallet}.rentals['sar-ranger']<4200 && ${wallet}.rentals['sar-ranger']>0`);
 await click(`document.querySelector('[data-touch-action="menu"]')`);await wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);
 const paused=await evaluate(`${wallet}.rentals['sar-ranger']`);await delay(2000);assert.equal(await evaluate(`${wallet}.rentals['sar-ranger']`),paused);
 await click(`document.querySelector('.fps-start-card .primary-button')`);await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
 await wait(`!${wallet}.rentals['sar-ranger']`,15000);await wait(`document.querySelector('.fps-weapon-hud')?.textContent.includes('BMT')`);
 assert.equal(await evaluate(`${wallet}.credits`),50000);assert.equal(await evaluate(`${wallet}.guns[0].variant`),'sar-issued');
 results.push('Actual training load/ready/pause do not spend time; active play spends it and expiry restores issued weapon');
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 await fs.writeFile(new URL('browser-results.json',output),JSON.stringify({results,errors,mapRequests},null,2));console.log('PASS inventory/playtime:',results.join('; '));
} catch(error){console.error('Browser exceptions:',errors);console.error(await evaluate(`document.body.innerText.slice(-1800)`));await screenshot('failure');throw error;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
