// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
let rig = 'rig-atlas';
const output = new URL('../.cache/reserve-carriers/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
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
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}: ${await evaluate('JSON.stringify({phase:window.hud?.phase,weapon:window.hud?.weapon,zoom:window.hud?.scopeZoom,switch:document.querySelector("canvas")?.dataset.weaponSwitch})')}`); }
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const canvas = `document.querySelector('#world canvas')`;
const carrier = `JSON.parse(${canvas}.dataset.reserveCarrier)`;
const results=[];
async function key(type,key,code){await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:key==='e'?69:0});}
async function drainPouch() {
 const shots=await evaluate('window.hud.shots');await evaluate("window.engine.setInput('fire',true)");await wait(`window.hud.shots>${shots}`);
 await evaluate("window.engine.setInput('fire',false);window.engine.reload()");await wait('window.hud.reloading>0');await wait('window.hud.reloading===0',30000);await delay(300);
}
try {
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Browser.setPermission',{permission:{name:'pointer-lock'},setting:'granted',origin});await send('Network.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 for(const [width,height,mobile,label] of [[1280,800,false,'desktop'],[390,844,true,'portrait'],[844,390,true,'landscape']].filter(v=>!process.env.FPS_SMOKE_VIEW || v[3]===process.env.FPS_SMOKE_VIEW)) for(rig of ['rig-encik','rig-atlas']) {
  console.log('Checking',label,rig);
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  await send('Page.navigate',{url:`${origin}/scripts/fixtures/reserve-carrier.html?rig=${rig}`});await wait("window.hud?.phase==='ready'",60000);
  if(mobile){const p=await point("document.querySelector('#start')");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else await click("document.querySelector('#start')");
  await wait("window.hud?.phase==='playing' && !!window.hud.reserveCarrier");
  const full=await evaluate('window.hud.reserveCarrier.used'), initialWeight=await evaluate('window.hud.carriedKg');
  assert.equal(full,rig==='rig-atlas'?48:24);assert.equal(await evaluate('window.hud.reserveCarrier.canTransfer'),false);
  await drainPouch();await wait('window.hud.reserveCarrier.canTransfer');
  const before=await evaluate('window.hud.carriedKg');
  // A short hold must not grant a magazine.
  if(!mobile)await key('keyDown','e','KeyE');else await evaluate("window.engine.setInput('reserve-transfer',true)");
  await wait('window.hud.reserveCarrier.progress>0');
  if(!mobile)await key('keyUp','e','KeyE');else await evaluate("window.engine.setInput('reserve-transfer',false)");
  await delay(250);assert.equal(await evaluate('window.hud.reserveCarrier.used'),full);
  // A completed hold uses a real keyboard event or actual captured touch pointer.
  if(!mobile)await key('keyDown','e','KeyE');else {const p=await point("document.querySelector('[data-touch-action=reserve-transfer]')");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});}
  await wait(`window.hud.reserveCarrier.used===${full-1}`,15000);
  if(!mobile)await key('keyUp','e','KeyE');else await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(250);
  const after=await evaluate('window.hud.carriedKg');assert(Math.abs(after-before-(rig==='rig-atlas'?.36:0))<.0001);
  assert.equal(await evaluate('window.hud.reserveCarrier.used'),full-1);
  await screenshot(`${label}-${rig}-transferred`);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  if(label==='desktop' && rig==='rig-atlas') {
    await drainPouch();
    await evaluate("window.engine.setInput('w',true);window.engine.setInput('shift',true)");await delay(4000);
    await evaluate("window.engine.setInput('w',false);window.engine.setInput('shift',false)");
    const gap=await evaluate('window.hud.reserveCarrier.distance');assert(gap>3,`maid left behind: ${gap}`);
    assert.equal(await evaluate('window.hud.reserveCarrier.canTransfer'),false);
    await screenshot('maid-catching-up');
    await wait('window.hud.reserveCarrier.canTransfer',40000);
    const close=await evaluate('window.hud.reserveCarrier.distance');assert(close<=2.8);
    await evaluate(`(()=>{const c=${carrier}, dx=c.position.x-window.hud.x, dz=c.position.z-window.hud.z; const target=Math.atan2(-dx,-dz); window.engine.lookBy(-(target-window.hud.yaw)/(.0023*2.6), (window.hud.pitch+.18)/(.0023*2.6*620/900));})()`);
    await delay(400);await screenshot('maid-in-world');
    results.push({label,rig,gap,close,initialWeight,before,after});
  } else results.push({label,rig,initialWeight,before,after});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors},null,2));console.log('PASS: finite stock, timed transfers, cancellation, pack/maid weight, walking catch-up and captured touch controls at three viewport sizes.');
} catch(error) {console.log('ERRORS',errors);console.log('FAILED',error);await screenshot('failure');console.log(await evaluate(`({hud:window.hud,carrier:document.querySelector('#world canvas')?.dataset.reserveCarrier})`));throw error;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
