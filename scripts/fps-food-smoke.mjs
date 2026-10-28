// Run a local Vite server and isolated Chrome with --remote-debugging-port=9228.
// Covers the food picker (hold 4, point, release), eating a chosen meal at full
// health, the effect chips it starts, the steadier kick, and the slot falling
// back to Auto when the chosen food runs out.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-food/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
const four = { key: '4', code: 'Digit4' };
async function key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function tap(params) { await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const message = `document.querySelector('.fps-message')?.textContent ?? ''`;
const food = `document.querySelector('.fps-belt-slot[data-kind="food"]')`;
const idle = `!document.querySelector('.fps-game canvas')?.dataset.supplyUse`;
/** Fires until a round goes (the range may not take the first click) and reads the kick multiplier the engine applied to it. */
async function shotRecoil() {
  const kick = `document.querySelector('.fps-game canvas')?.dataset.recoilMultiplier`;
  await evaluate(`delete document.querySelector('.fps-game canvas').dataset.recoilMultiplier`);
  for (let attempt = 0; attempt < 8 && !(await evaluate(kick)); attempt++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'left', clickCount: 1 });
    await delay(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'left', clickCount: 1 });
    await delay(400);
  }
  return Number(await evaluate(kick));
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(`document.querySelectorAll('.location-card').length>0`);
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'food-kaya-toast':2,'food-mala-da-la':1,'food-smoking-corner':1};localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.reload'); await delay(1500);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000);
  await click(button('Enter range')); await wait(phase('playing'));
  assert(await evaluate('!!document.pointerLockElement'), 'mouse is captured');
  const baseline = await shotRecoil();
  assert(baseline > 0, 'a shot reports its kick');

  // Auto at full health has nothing to heal, and says how to pick a food instead.
  await tap(four);
  await wait(`(${message}).includes('Hold 4 to pick a food')`, 3000);
  console.log('PASS: tapping 4 on Auto at full health eats nothing and points to the picker.');

  // Hold 4: the picker opens with Auto and every food carried.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...four });
  await wait(`!!document.querySelector('.fps-food-picker')`, 3000);
  const names = await evaluate(`[...document.querySelectorAll('.fps-food-option')].map(b=>b.querySelector('span').firstChild.textContent)`);
  assert.deepEqual(names, ['Auto', 'Kaya toast set', 'Mala xiang guo · Da La', 'Smoking Corner Special · Cigar and Milo Set']);
  // The fourth of four sits at nine o'clock: point left from the centre, then let go of 4.
  for (let x = 720; x >= 600; x -= 20) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 500 });
  await wait(`document.querySelectorAll('.fps-food-option')[3]?.hasAttribute('data-selected')`, 3000);
  await screenshot('picker');
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...four });
  await wait(`!document.querySelector('.fps-food-picker')`, 3000);
  await wait(`${food}?.hasAttribute('data-chosen')`, 3000);
  assert((await evaluate(message)).includes('Food slot: Smoking Corner Special'), 'the pick is announced');
  assert(await evaluate(idle), 'picking a food does not eat it');
  console.log('PASS: holding 4 opens the picker; pointing and releasing pins the Mythic set.');

  // A chosen meal with effects is eaten at full health, and its effects show over the belt.
  await tap(four);
  await wait(`!(${idle})`, 3000);
  await delay(1600); await screenshot('eating');
  await wait(idle, 9000);
  await wait(`document.querySelectorAll('.fps-food-effects li').length===4`, 3000);
  const chips = await evaluate(`[...document.querySelectorAll('.fps-food-effects li')].map(li=>li.dataset.kind)`);
  assert.deepEqual(chips, ['well-fed', 'energised', 'steady', 'wired']);
  assert((await evaluate(message)).includes('Food slot back on Auto'), 'the last one hands the slot back to Auto');
  assert(!(await evaluate(`${food}?.hasAttribute('data-chosen')`)), 'the food slot is on Auto again');
  await screenshot('effects');
  console.log('PASS: the set is eaten at full health, starts four effects and returns the slot to Auto.');

  const steadied = await shotRecoil();
  assert(Math.abs(steadied / baseline - .75) < .02, `steady aim cuts kick by a quarter (${baseline} → ${steadied})`);
  console.log(`PASS: steady aim cuts each shot's kick from ${baseline} to ${steadied}.`);

  // A solo arena (as every expedition is): the arena host runs the meal and the HUD shows its copy.
  await key('Escape', 'Escape'); await wait(phase('paused'));
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'food-smoking-corner':1};p.quickItem='food-smoking-corner';localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.navigate', { url: `${origin}/debug` }); await delay(1500);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Solo vs bots'))`);
  await evaluate(`(()=>{const range=document.querySelector('#lan-bot-count');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(range,'0');range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click(button('Deploy against bots')); await wait(phase('ready'), 60000);
  await click(button('Start match')); await wait(phase('playing'));
  await wait(`${food}?.hasAttribute('data-chosen')`, 5000);
  await tap(four);
  await wait(`!(${idle})`, 3000); await wait(idle, 9000);
  await wait(`document.querySelectorAll('.fps-food-effects li').length===4`, 4000);
  const timer = `parseInt(document.querySelector('.fps-food-effects li[data-kind="energised"] b').textContent)`;
  const first = await evaluate(timer); await delay(2500); const later = await evaluate(timer);
  assert(first <= 240 && later < first, `the arena runs the meal's timer (${first}s → ${later}s)`);
  await screenshot('arena-fed');
  const arenaKick = await shotRecoil();
  assert(arenaKick > 0 && arenaKick < .8, `steady aim holds in the arena (${arenaKick})`);
  console.log(`PASS: in a solo arena the host runs the meal (${first}s → ${later}s) and steady aim still applies (${arenaKick}).`);
  assert.deepEqual(errors, []);
} catch (error) {
  console.log(errors, await evaluate(`({phase:document.querySelector('.fps-game')?.dataset.phase,message:document.querySelector('.fps-message')?.textContent})`).catch(()=>null));
  await screenshot('failure'); throw error;
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
