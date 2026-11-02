// Verify explosion layers in WebGL and throw a real frag without an arena snapshot.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5230';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9390';
const output = new URL('../.cache/throwable-audit/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/grenade-explosions.html`)}`, { method: 'PUT' })).json();
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
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await wait('!!window.show');
 const frames=[];
 for(const [id,age,air,burst] of [
  ['frag',.2,false,true],['chilli',.2,false,true],['durian',.2,false,true],
  ['smoke',2,false,false],['fogging',2,false,false],['sambal',2,false,false],
  ['red-smoke',2,false,false],['red-smoke',8.2,false,true],
  ['oranges',1.2,true,true],['firecrackers',1.2,false,true],
  ['chope',2,false,false],['finale',2,false,false],['oicw',.2,false,true],
 ]) {
  const result=await evaluate(`window.show(${age},false,false,${air},'grenade-${id}')`);
  assert.equal(result.glError,0);
  if(burst)assert(result.counts.fire>0,`${id}: fire particles`);
  if(!burst)assert(result.draws>5,`${id}: effect geometry is submitted`);
  frames.push({id,age,...result});await screenshot(`${id}-${age}`);
 }
 // Stun and whistle are dispatched by the engine's one-shot cue path, not grenadePops.
 const cues=[];
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(const id of (process.env.THROWABLE_CUE?[process.env.THROWABLE_CUE]:['stun','whistle'])) {
  await send('Page.navigate',{url:origin+`/scripts/fixtures/grenade-explosions.html?engine&item=grenade-${id}`});
  await wait("window.hud?.phase==='ready'",60000);
  const start=await point(`document.querySelector('#start')`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait("window.hud?.phase==='playing'");
  assert.equal(await evaluate('window.hud.arena'),null);
  await evaluate(`(()=>{window.engine.toggleSound();const c=document.querySelector('#world canvas');window.peak=Array(12).fill(0);new MutationObserver(()=>{const n=(c.dataset.combatEvents||'').split('/').map(Number);n.forEach((v,i)=>window.peak[i]=Math.max(window.peak[i],v));}).observe(c,{attributes:true,attributeFilter:['data-combat-events']});window.engine.useUtility('grenade');})()`);
  await wait('!!window.hud.grenadeHeld');await delay(500);
  await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.grenadeHeld?.pinned');
  await evaluate("window.engine.setInput('fire',false)");await wait('!window.hud.grenadeHeld');
  await wait('window.peak[1]>0 && window.peak[2]>0 && window.peak[11]>0',30000).catch(async error=>{await screenshot(id+'-failure');console.log(await evaluate(`({peak:window.peak,phase:window.hud.phase,health:window.hud.health,grenade:window.hud.grenadeHeld,message:window.hud.message,dataset:{...document.querySelector('#world canvas').dataset}})`));throw error;});
  cues.push({id,peak:await evaluate('window.peak')});await screenshot(id+'-real-range');
  await evaluate('window.engine.dispose()');
 }
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({frames,cues,errors,mapRequests},null,2));
 console.log('PASS: all 13 throwable visual paths plus OICW; smoke/gas/markers/fireworks, delayed mortar and bomblet bursts, real-engine stun/whistle without arena snapshots; no shader/runtime errors.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
