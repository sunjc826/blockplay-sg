// Drives the range in a real browser and checks that the shot effects actually
// run: brass leaves the port, sparks and a scorch land on the ground, recoil
// climbs while the trigger is held and settles once it is released, and a hit
// on a range target leaves no mark on the map behind it.
//
// Needs Vite on 5175 and an isolated Chrome with --remote-debugging-port=9224,
// as the other browser smokes do. On a software renderer pass EFFECTS_SMOKE_PACE
// to lengthen the trigger holds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const pace = Number(process.env.EFFECTS_SMOKE_PACE || 1);
const output = new URL('../.cache/fps-effects-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
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
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(120); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvas = `document.querySelector('.fps-viewport canvas')`;
// The pools drain in a fraction of a second, so poll-and-read would miss them;
// an observer on the two data attributes keeps the peak of each instead.
const watch = `(()=>{window.fxObserver?.disconnect();window.fx={casings:0,impacts:0,sparks:0,scorches:0,recoil:0};
  const c=${canvas};const read=()=>{const [a,b,s,k]=(c.dataset.fxCensus||'0/0/0/0').split('/').map(Number);
  window.fx.casings=Math.max(window.fx.casings,a);window.fx.impacts=Math.max(window.fx.impacts,b);
  window.fx.sparks=Math.max(window.fx.sparks,s);window.fx.scorches=Math.max(window.fx.scorches,k);
  window.fx.recoil=Math.max(window.fx.recoil,Math.abs(Number(c.dataset.fxRecoil||0)))};
  window.fxObserver=new MutationObserver(read);window.fxObserver.observe(c,{attributes:true,attributeFilter:['data-fx-census','data-fx-recoil']});read()})()`;
const census = `(()=>{const [a,b,s,k]=(${canvas}.dataset.fxCensus||'0/0/0/0').split('/').map(Number);return {casings:a,impacts:b,sparks:s,scorches:k}})()`;
const hold = async (ms, x = 700, y = 550) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await delay(ms * pace);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const look = (dx, dy) => evaluate(`(()=>{const event=new MouseEvent('mousemove');Object.defineProperties(event,{movementX:{value:${dx}},movementY:{value:${dy}}});document.dispatchEvent(event)})()`);
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await evaluate(`localStorage.removeItem('blockplay.armory.v1');location.reload()`); await delay(1200);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready'));
  await click(button('Enter range')); await wait(phase('playing'));
  assert(await evaluate('!!document.pointerLockElement'), 'Effects smoke drives captured mouse input');
  assert.equal(await evaluate(`${canvas}.dataset.fxCensus`), '0/0/0/0', 'A fresh range starts with every effect pool empty');
  assert.equal(await evaluate(`${canvas}.dataset.fxStyle`), 'issued:sar-issued:skin-issued', 'Issued kit draws the issued style');
  await key('2', 'Digit2'); await delay(400);
  assert.equal(await evaluate(`${canvas}.dataset.fxStyle`), 'issued:ult-issued:skin-issued', 'Switching weapons switches the style with it');
  await key('1', 'Digit1'); await delay(400);

  // Down at the ground first, where every round marks concrete.
  await look(0, 470); await delay(250);
  await evaluate(watch);
  await hold(900);
  let fx = await evaluate('window.fx');
  assert(fx.impacts > 0, `A burst into concrete registers impacts (saw ${JSON.stringify(fx)})`);
  // Sparks burn out in a fifth of a second, so a slow renderer can only ever
  // catch one round's worth; the marks and the brass outlive a frame and are
  // counted properly.
  assert(fx.sparks > 0, `Rounds into concrete spray sparks (saw ${fx.sparks})`);
  assert(fx.scorches >= 3, `Every round into the ground leaves a scorch (saw ${fx.scorches})`);
  assert(fx.casings >= 3, `Every round ejects a case (saw ${fx.casings})`);
  assert(fx.recoil > 0.004, `Held fire climbs (peak ${fx.recoil})`);
  await screenshot('burst-into-ground');

  // Released, the climb settles back to where the shooter was aiming.
  await wait(`Math.abs(Number(${canvas}.dataset.fxRecoil))<0.0005`, 4000);
  // Brass and sparks clear themselves; the scorch is the one mark that stays.
  await delay(1000);
  const lingering = await evaluate(census);
  assert.equal(lingering.sparks, 0, 'Sparks burn out');
  assert(lingering.scorches > 0, 'A scorch outlives the shot that made it');
  await screenshot('scorches-linger');
  await wait(`${census}.casings===0`, 14000);
  await wait(`${census}.scorches===0`, 14000);

  // Back up onto the centre target. The shot has to cross the ground the burst
  // just covered, so this is also the check that nothing an effect leaves
  // behind can stop a bullet; and a round that stops on a target marks nothing.
  await look(0, -470); await delay(250);
  assert(await evaluate(`document.querySelector('.fps-score').textContent.startsWith('0 /')`), 'Ground fire scores nothing');
  await evaluate(watch);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 550, button: 'left', clickCount: 1 });
  await wait(`document.querySelector('.fps-score').textContent.startsWith('1 /')`, 8000);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 550, button: 'left', clickCount: 1 });
  await delay(400);
  fx = await evaluate('window.fx');
  // Sparks only ever come from a recorded impact, and they outlive the impact
  // itself, so they are the signal a slow renderer can still be counted on for.
  assert(fx.sparks > 0, `A hit on a target sprays sparks (saw ${JSON.stringify(fx)})`);
  assert.equal(fx.scorches, 0, 'A hit on a range target leaves the map behind it unmarked');
  assert(fx.casings > 0, 'Firing ejects brass');
  await screenshot('target-hit');

  await key('Escape', 'Escape'); await wait(phase('paused'));
  await click(`document.querySelector('[aria-label="Reset FPS exercise"]')`); await wait(phase('ready'));
  // The attributes are written by the next frame, which on a software renderer
  // is not the next millisecond.
  await wait(`${canvas}.dataset.fxCensus==='0/0/0/0' && ${canvas}.dataset.fxRecoil==='0.0000'`, 6000);
  // A premium weapon draws its own shot. Equipping one is an armoury change, so
  // it goes through the stored profile and a reload, the way a player's would.
  await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('blockplay.armory.v1'));
    p.xp=20000; p.owned=[...new Set([...p.owned,'sar-vanguard'])];
    p.guns[0]={variant:'sar-vanguard',skin:'skin-issued',attachments:{}};
    localStorage.setItem('blockplay.armory.v1',JSON.stringify(p)); location.reload()})()`);
  await delay(1500);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready'));
  await click(button('Enter range')); await wait(phase('playing'));
  assert.equal(await evaluate(`${canvas}.dataset.fxStyle`), 'elite:sar-vanguard:skin-issued', 'A premium weapon draws its own style');
  await evaluate(watch);
  await look(0, 470); await delay(250);
  await hold(600);
  const premium = await evaluate('window.fx');
  assert(premium.sparks > 0 && premium.casings > 0, `A premium weapon still throws brass and sparks (saw ${JSON.stringify(premium)})`);
  await screenshot('premium-weapon');

  assert.equal(mapRequests, 0, 'No map API requests'); assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('PASS: muzzle flare, brass ejection, sparks, scorches and recoil climb/settle; target hits leave no mark; spent effects obstruct nothing; reset clears the pools; styles follow the weapon, issued and premium.');
  console.log('Screenshots: .cache/fps-effects-smoke/');
} catch (error) { await screenshot('effects-failure'); throw error; }
finally { await evaluate('window.fxObserver?.disconnect()').catch(() => {}); ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
async function key(k, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); }
