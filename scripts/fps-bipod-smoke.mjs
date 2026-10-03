// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/bipod-review/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Log.entryAdded' && /THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text)) errors.push(m.params.entry.text);
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
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png', clip: await evaluate(`(()=>{const r=document.querySelector('.fps-viewport').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`) }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
let savedProfile;
const deployment = `Number(document.querySelector('.fps-viewport canvas').dataset.bipodDeployment)`;
async function record(ms) { return evaluate(`new Promise(resolve=>{const samples=[],end=performance.now()+${ms};function step(){samples.push(${deployment});if(performance.now()<end)requestAnimationFrame(step);else resolve(samples)}step()})`); }
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  savedProfile=await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
  for (const [family,variant,capacity] of [[1,'ult-issued',60],[3,'mag-issued',100],[4,'cis50-issued',50]]) {
    await evaluate(`(async()=>{const {createProfile,equip}=await import('/src/game/armory-state.ts');const p=equip(createProfile(), '${variant}', ${family});localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));location.reload()})()`);
    await delay(400);await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
    await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
    await wait(phase('ready'));await click(button('Enter range'));await wait(phase('playing'));await wait(`${ammo}===${capacity}`);
    assert.equal(await evaluate(deployment),0);await screenshot(variant+'-folded');
    await key('z','KeyZ');const unfolding=await record(1400);
    assert(unfolding.some(p=>p>.05&&p<.95),'intermediate hinge poses');assert(unfolding.at(-1)>.99,'fully deployed');
    await screenshot(variant+'-prone');
    if(family!==4){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});await delay(700);assert((await evaluate(deployment))<.01,'crawl retracts');await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});await wait(`${deployment}>.99`);}
    await key('q','KeyQ');await wait(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)>.99`);await screenshot(variant+'-ads');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:850,y:500,button:'left',clickCount:1});await delay(170);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:850,y:500,button:'left',clickCount:1});
    await key('r','KeyR');await wait(`document.querySelector('.fps-viewport canvas').dataset.reloadStage==='MAG OUT'`);assert((await evaluate(deployment))>.99,'reload preserves support');await screenshot(variant+'-reload');
    await wait(`${ammo}===${capacity}`,15000);
    await key('2','Digit2');await delay(250);assert.equal(await evaluate(deployment),0,'sidearm has no bipod');
    await key('1','Digit1');await wait(`${deployment}>.99`);
    await key('z','KeyZ');const folding=await record(600);assert(folding.some(p=>p>0&&p<1));assert.equal(folding.at(-1),0);
    await key('Escape','Escape');await wait(phase('paused'));assert.equal(await evaluate(deployment),0);
  }
  await send('Page.navigate',{url:origin+'/scripts/fixtures/bipod-render.html'});await wait('window.ready===true');
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('model-articulation.png',output),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS: all three MG bipods deploy/retract smoothly, retract for crawling, preserve reload/ADS, reset on swap/pause; model fixture renders without errors.');
} finally {
  if(savedProfile!==undefined)await evaluate(savedProfile===null ? "localStorage.removeItem('blockplay.armory.v1')" : `localStorage.setItem('blockplay.armory.v1',${JSON.stringify(savedProfile)})`).catch(()=>{});
  ws.close();await fetch(`${chrome}/json/close/${tab.id}`);
}
