// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { COURSE_LAYOUT as L } from '../src/game/tutorial-course.ts';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL(process.env.TUTORIAL_OUTPUT || '../.cache/tutorial-browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/tutorial`)}`, { method: 'PUT' })).json();
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
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;

try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(phase('ready'), 60000); await screenshot('01-ready'); console.log('Ready');
  await click(button('Start course')); await wait(phase('playing')); assert(await evaluate('!!document.pointerLockElement'));
  const step = id => `document.querySelector('.tutorial-game')?.dataset.step===${JSON.stringify(id)}`;
  const look = async (yaw, pitch = -.03) => evaluate(`(()=>{const d=document.querySelector('.tutorial-game').dataset;const e=new MouseEvent('mousemove');Object.defineProperties(e,{movementX:{value:-((${yaw})-Number(d.playerYaw))/.0023},movementY:{value:-((${pitch})-Number(d.playerPitch))/.0023}});document.dispatchEvent(e)})()`);
  await look(.4); await wait(step('walk')); await look(0); console.log('Look passed');
  const down = (key, code) => send('Input.dispatchKeyEvent', {type:'keyDown',key,code});
  const up = (key, code) => send('Input.dispatchKeyEvent', {type:'keyUp',key,code});
  const z = () => evaluate("Number(document.querySelector('.tutorial-game').dataset.playerZ)");
  async function forward(target) { await down('w','KeyW'); await wait(`Number(document.querySelector('.tutorial-game').dataset.playerZ)<=${target}`,60000); await up('w','KeyW'); }
  await forward(L.walkZ); await wait(step('sprint')); console.log('Walk passed');
  await down('Shift','ShiftLeft'); await forward(L.sprintZ); await up('Shift','ShiftLeft'); await wait(step('jump')); console.log('Sprint passed');
  await forward(L.hurdleZ + 1.8); await down('w','KeyW'); await key(' ','Space'); await wait(`Number(document.querySelector('.tutorial-game').dataset.playerZ)<=${L.jumpZ}`,60000); await up('w','KeyW'); await wait(step('crouch')); console.log('Jump passed'); await screenshot('02-hurdle');
  await down('Control','ControlLeft'); await forward(L.crouchZ); await up('Control','ControlLeft'); await wait(step('prone')); console.log('Crouch passed');
  await forward(L.crawl.entryZ + 2);
  await down('w','KeyW'); await delay(1200); await up('w','KeyW');
  const standingStop = await z(); assert(standingStop > L.crawl.entryZ, 'standing is physically blocked by mesh');
  await down('Control','ControlLeft'); await down('w','KeyW'); await delay(1200); await up('w','KeyW'); await up('Control','ControlLeft');
  assert(Math.abs(await z() - standingStop) < .2, 'crouching is also physically blocked by mesh');
  await key('z','KeyZ'); await forward((L.crawl.entryZ + L.crawl.exitZ) / 2); await screenshot('03-low-crawl');
  await forward(L.crawl.exitZ - 2); await key('z','KeyZ'); await forward(L.proneZ); await wait(step('aim')); console.log('Prone traversal passed; standing after exit passed');
  await forward(L.bendZ); await look(-Math.PI / 2); await down('w','KeyW'); await wait(`Number(document.querySelector('.tutorial-game').dataset.playerX)>=${L.rangeX}`,60000); await up('w','KeyW');
  await look(0); await forward(L.firingZ); await key('q','KeyQ'); await wait(step('fire')); console.log('Aim passed'); await screenshot('04-range');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:720,y:500,button:'left',clickCount:1});
  await wait(step('reload')); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:720,y:500,button:'left',clickCount:1}); console.log('Hit passed');
  await key('r','KeyR'); await wait(step('switch'),30000); console.log('Reload passed');
  await key('2','Digit2'); await wait(step('map')); console.log('Switch passed'); await key('m','KeyM'); await wait(`!!document.querySelector('.tutorial-course-map')`); await screenshot('05-map'); await key('m','KeyM');
  await wait(step('complete')); await wait(phase('paused')); console.log('Course complete'); await screenshot('06-complete');
  await click(button('Tour the store')); await wait(`!!document.querySelector('.store-tour')`); await screenshot('06-store');
  const tourStep = id => `document.querySelector('.store-tour')?.dataset.step===${JSON.stringify(id)}`;
  const next = () => click(`[...document.querySelectorAll('.store-tour-actions button')].find(b=>b.textContent.includes('Next'))`);
  await next(); await wait(tourStep('categories'));
  assert(await evaluate(`document.querySelectorAll('.store-tour-actions button')[1].disabled`));
  await click(`document.querySelector('#shop-tab-armor')`); await next(); await wait(tourStep('carry')); await next();
  await wait(tourStep('compare')); await click(`document.querySelector('#shop-tab-weapon')`); await click(`document.querySelector('.armory-item')`); await next();
  await wait(tourStep('supplies')); await click(`document.querySelector('#shop-tab-utility')`); await next();
  await wait(tourStep('deploy')); await screenshot('07-deploy'); await click(`[...document.querySelectorAll('.store-tour-actions button')].find(b=>b.textContent.includes('Finish'))`);
  await wait(`!document.querySelector('.store-tour')`); await click(`document.querySelector('.store-tour-trigger')`); await wait(tourStep('wallet')); console.log('Store tour passed, replay passed');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('08-store-mobile');
  await send('Page.navigate', {url: `${origin}/tutorial`});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await wait(phase('ready'),60000); await screenshot('09-touch-ready');
  const touchStart = await point(button('Start course')); await send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{...touchStart,id:1}]}); await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]}); await wait(phase('playing')); await wait(`!!document.querySelector('.touch-layer')`); await screenshot('10-touch-playing');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true }); await screenshot('11-touch-landscape');
  await send('Page.navigate', {url: `${origin}/tutorial`}); await wait(phase('ready'),60000);
  await click(button('Start course')); await wait(phase('playing'));
  for (let n = 0; n < 6; n++) {
    await send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{...await point(`document.querySelector('.touch-chip[data-touch-action="menu"]')`),id:1}]}); await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await wait(phase('paused')); await click(button('Skip this lesson'));
    if (n < 5) { await click(button('Resume course')); await wait(phase('playing')); }
  }
  assert(await evaluate(step('aim'))); assert(Math.abs(await z() - L.proneZ) < .1, 'skip moves past the crawl');
  console.log('Touch lesson skipping reaches the range approach');
  assert.deepEqual(errors,[]); assert.equal(mapRequests,0); console.log('Touch layout passed. No runtime errors or map requests.');
} catch(error) { console.error(error); await screenshot('failure').catch(()=>{}); console.error(await evaluate("({step:document.querySelector('.tutorial-game')?.dataset.step,phase:document.querySelector('.fps-game')?.dataset.phase,z:document.querySelector('.tutorial-game')?.dataset.playerZ,text:document.body.innerText.slice(0,1000)})")); process.exitCode=1; }
finally { ws.close(); }
