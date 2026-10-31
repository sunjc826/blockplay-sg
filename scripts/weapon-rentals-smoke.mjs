// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/weapon-rentals/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/store`)}`, { method: 'PUT' })).json();
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
const action = `document.querySelector('[data-testid="shop-action"]')`;
const renew = `document.querySelector('[data-testid="shop-renew"]')`;
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
const term = id => `document.querySelector('[data-rental-term="${id}"]')`;
const item = id => `document.querySelector('[data-item="${id}"]')`;
const results = [];
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await wait(`!!${action}`);
  await evaluate(`(()=>{const p=${wallet};p.xp=50000;p.tokens=3000;p.credits=50000;p.rentals={};p.owned=p.owned.filter(id=>!['sar-vanguard','sar-ranger'].includes(id));p.guns[0].variant='sar-issued';localStorage.setItem('blockplay.menu.training','queenstown');localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));location.reload()})()`);
  await wait(`!!${action} && !${action}.disabled`);
  await click(`document.querySelector('[aria-label="+1,000 demo credits"]')`);
  await wait(`${wallet}.credits===51000`);
  results.push('Demo credit button adds 1,000 CR without payment');
  assert.match(await evaluate(`${action}.textContent`), /Rent.*1 day.*24 TK/);
  await click(term('7d')); await wait(`${action}.textContent.includes('72 TK')`);
  await click(action); await wait(`!!${wallet}.rentals['sar-vanguard']`);
  const first = await evaluate(wallet);
  assert.equal(first.tokens, 2928); assert(!first.owned.includes('sar-vanguard'));
  await click(action); await wait(`${wallet}.guns[0].variant==='sar-vanguard'`);
  await click(term('1d')); await click(renew);
  await wait(`${wallet}.tokens===2904`);
  assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`), first.rentals['sar-vanguard'] + 86400000);
  results.push('7-day purchase, equip and 1-day extension charge the displayed prices');
  await screenshot('desktop-rental');
  await send('Page.reload'); await wait(`!!${renew}`);
  assert.equal(await evaluate(`${wallet}.guns[0].variant`), 'sar-vanguard');
  await click(term('permanent')); await click(renew); await wait(`${wallet}.owned.includes('sar-vanguard')`);
  assert.equal(await evaluate(`${wallet}.tokens`), 2664);
  assert.equal(await evaluate(`${wallet}.rentals['sar-vanguard']`), undefined);
  results.push('Reload preserves rental; permanent upgrade clears expiry and charges 240 TK');
  await click(item('sar-ranger')); await click(term('1d')); await wait(`${action}.textContent.includes('90 CR')`);
  await click(action); await wait(`!!${wallet}.rentals['sar-ranger']`); await click(action);
  await wait(`${wallet}.guns[0].variant==='sar-ranger'`);
  assert.equal(await evaluate(`${wallet}.credits`), 50910);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); useTouch = true;
  await evaluate(`document.querySelector('.armory-purchase').scrollIntoView({block:'center'})`); await delay(1200);
  await wait(`!!document.querySelector('.armory-rental-terms')`);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Mobile shop has no horizontal overflow');
  assert(await evaluate(`[...document.querySelectorAll('[data-rental-term]')].every(e=>{const r=e.getBoundingClientRect();return r.width>40&&r.left>=0&&r.right<=innerWidth})`), 'All duration controls fit on mobile');
  await screenshot('mobile-rental');
  results.push('390px mobile duration controls fit without horizontal overflow');
  // Navigate through the same React session, then advance wall time after starting the real engine.
  await evaluate(`history.pushState(null,'','/training');dispatchEvent(new PopStateEvent('popstate'))`);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`, 60000);
  await click(`document.querySelector('.fps-start-card .primary-button')`);
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
  assert(await evaluate(`document.querySelector('.fps-weapon-hud').textContent.includes('Steady Lah')`));
  const beforeExpiry = await evaluate(`${wallet}.credits`);
  await evaluate(`(()=>{const realNow=Date.now;Date.now=()=>realNow()+2*86400000})()`);
  await wait(`${wallet}.guns[0].variant==='sar-issued' && !${wallet}.rentals['sar-ranger']`);
  await wait(`document.querySelector('.fps-weapon-hud').textContent.includes('BMT') && !document.querySelector('.fps-weapon-hud').textContent.includes('Steady Lah')`);
  assert.equal(await evaluate(`${wallet}.credits`), beforeExpiry);
  assert(await evaluate(`${wallet}.owned.includes('sar-vanguard')`));
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.phase`), 'playing');
  await screenshot('running-expiry');
  results.push('Real running engine replaces expired rental with issued gear without restarting or charging');
  assert.equal(mapRequests, 0); assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify({ results, errors, mapRequests }, null, 2));
  console.log('PASS weapon rentals:', results.join('; '));
} catch (error) { console.error('Browser exceptions:', errors); console.error(await evaluate(`JSON.stringify({phase:document.querySelector('.fps-game')?.dataset.phase,text:document.body.innerText.slice(-2500)})`)); await screenshot('browser-failure'); throw error; } finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
