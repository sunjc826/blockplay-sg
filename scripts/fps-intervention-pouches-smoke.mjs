// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/intervention-pouches/browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/scope-zoom.html?weapon=ff-intervention`)}`, { method: 'PUT' })).json();
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
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}: ${await evaluate('JSON.stringify({phase:window.hud?.phase,weapon:window.hud?.weapon,zoom:window.hud?.scopeZoom,switch:document.querySelector("canvas")?.dataset.weaponSwitch})')}`); }
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const zoom = value => `window.hud?.scopeZoom?.value===${value}`;
const canvas = `document.querySelector('#world canvas')`;
async function settled(value) { await wait(`Math.abs(Number(${canvas}.dataset.scopeMagnification)-${value})<.001`); }
const results=[];
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 for(const [width,height,mobile,label] of [[1280,800,false,'desktop'],[844,390,true,'landscape'],[390,844,true,'portrait']]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?weapon=ff-intervention'});
  await wait("window.hud?.phase==='ready'",60000);
  if(mobile){const start=await point("document.querySelector('#start')");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else await click("document.querySelector('#start')");
  await wait("window.hud?.phase==='playing'");
  assert.equal(await evaluate('window.hud.spareMagazines'),8);assert.equal(await evaluate('window.hud.reserve'),56);assert.equal(await evaluate('window.hud.magazineCapacity'),7);
  await evaluate('window.engine.lookBy(0,650)');await delay(1000);await screenshot(label+'-two-per-pouch');
  const draws=[];
  for(const [n,slot] of [[0,0],[1,9]]) {
   const shots=await evaluate('window.hud.shots');await evaluate("window.engine.setInput('fire',true)");await wait(`window.hud.shots>${shots}`);await evaluate("window.engine.setInput('fire',false);window.engine.reload()");
   await wait(`JSON.parse(${canvas}.dataset.magazineInventory).pending!==null`);
   const snapshot=await evaluate(`JSON.parse(${canvas}.dataset.magazineInventory)`), reach=await evaluate(`JSON.parse(${canvas}.dataset.reloadReach)`);
   assert.equal(snapshot.reloadSlot,slot);assert.equal(snapshot.slots[slot],null);assert.equal(snapshot.pending.capacity,7);
   if(n===0)assert.equal(snapshot.slots[9].family,12);
   draws.push({slot,reach});await screenshot(label+(n===0?'-front-extraction':'-rear-extraction'));
   await wait('window.hud.reloading===0',30000);await delay(400);
   assert.equal(await evaluate('window.hud.spareMagazines'),7-n);assert.equal(await evaluate('window.hud.magazine'),8);
   const body=await evaluate(`JSON.parse(${canvas}.dataset.body)`);assert.equal(body.slots,6);assert.equal(body.magazines,9-n);
   await screenshot(label+(n===0?'-rear-remains':'-empty-pouch'));
  }
  results.push({viewport:label,draws});
 }
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors,mapRequests},null,2));
 console.log('PASS: eight seven-round spares; front/rear extraction, stable six-pouch vest, empty-pouch states and reloads on desktop/landscape/portrait; no runtime/shader errors or map requests.');
} finally {await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
