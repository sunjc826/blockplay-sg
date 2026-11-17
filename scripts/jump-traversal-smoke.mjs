// Run a local Vite server and an isolated Chrome with remote debugging; set FPS_APP_ORIGIN and FPS_CHROME_ORIGIN
// (defaults 5225 and 9385).
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5225';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9385';
const output = new URL('../.cache/jump-traversal/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
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
 await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
 await wait(`document.readyState==='complete'`,60000);
 await evaluate(`(async()=>{
  const {getFpsDistrict}=await import('/src/game/fps-districts.ts');
  const {createFpsEngine}=await import('/src/game/fps-engine.ts');
  // The engine builds its own world, so the sandbag wall is read from the range's prop list (asset 4) and
  // the player's place from the HUD, rather than from a hook on the region builder that no longer runs.
  const district=getFpsDistrict('orchard'),[,x,z,width,depth]=district.props.find(p=>p[0]===4);
  window.jumpBag={minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2};
  document.body.innerHTML='<button id="start">Enter jump test</button><div id="stage" style="width:640px;height:400px"></div>';
  window.engine=createFpsEngine(document.querySelector('#stage'),hud=>{window.hud=hud;window.jumpCamera={x:hud.x,z:hud.z};},{region:'orchard',rangeTravel:{spawn:{x:x-2,z,yaw:-Math.PI/2,pitch:.15},onTravel(){}}});
  document.querySelector('#start').onclick=()=>window.engine.start();
 })()`);
 await wait(`window.hud?.phase==='ready'`,60000);
 const bag=await evaluate(`window.jumpBag`); assert(bag&&bag.maxX>bag.minX,'the Orchard range lists a sandbag wall');
 console.log('Sandbag footprint',bag);
 await click(`document.querySelector('#start')`); await wait(`window.hud.phase==='playing'`);
 await evaluate(`window.engine.setInput('w',true)`);
 await wait(`window.jumpCamera.x>${bag.minX-1.2}`); await delay(1200);
 const wall=await evaluate(`window.jumpCamera.x`);assert(wall<bag.minX,'walking is blocked by the sandbags');
 await screenshot('before-jump');
 await evaluate(`window.peak=0;window.sawAir=false;window.jumpObserver=setInterval(()=>{const m=JSON.parse(document.querySelector('#stage canvas').dataset.movement||'{}');window.peak=Math.max(window.peak,m.feet||0);if(!m.grounded&&m.feet>.3)window.sawAir=true;if(window.jumpCamera.x>${(bag.minX+bag.maxX)/2-.3})window.engine.setInput('w',false);},5);window.engine.jump()`);
 await wait(`window.sawAir&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet>.4`,60000);
 await evaluate(`clearInterval(window.jumpObserver);window.engine.setInput('w',false)`);await delay(1000);
 const landed=await evaluate(`({camera:window.jumpCamera,motion:JSON.parse(document.querySelector('#stage canvas').dataset.movement),peak:window.peak})`);
 // The wall's height comes from its model, so it is measured here: cover, and within a mantle's reach.
 bag.maxY=landed.motion.feet;
 assert(landed.motion.grounded&&bag.maxY>.4&&bag.maxY<1.6,JSON.stringify(landed));
 assert(landed.camera.x>bag.minX-.36&&landed.camera.x<bag.maxX+.36,'stands on the wall, not past it '+JSON.stringify(landed));
 // A 1.05 m hop or a mantle: either way the feet never rise far above the top they land on.
 assert(landed.peak>=bag.maxY-.01&&landed.peak<bag.maxY+1.2,JSON.stringify(landed));
 await screenshot('on-sandbags');
 await evaluate(`window.engine.jump()`);await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet>${bag.maxY}+.4`);
 await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded`,60000);
 assert(Math.abs((await evaluate(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet`))-bag.maxY)<.01,'can jump again from the top');
 // Step off the wall's long side. Walking its length is not asserted: the test spawn puts other range
 // furniture beyond the far end, and the movement kernel's own tests cover walking along a top.
 await evaluate(`window.engine.setInput('d',true)`);await wait(`window.jumpCamera.z>${bag.maxZ+.6}`,60000);await evaluate(`window.engine.setInput('d',false)`);
 await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet<.1`,60000);
 await screenshot('after-drop');
 assert.equal(mapRequests,0);assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('browser-result.json',output),JSON.stringify({passed:true,bag,wall,landed,errors,mapRequests},null,2));
 console.log('PASS: real FPS input is blocked by the sandbag wall, gets onto it with a jump, stays on top, jumps again and steps off to the ground. No runtime errors or Google requests.');
 await evaluate(`window.engine.dispose()`);
} catch(error){console.log(await evaluate(`({hud:window.hud?.phase,camera:window.jumpCamera,movement:document.querySelector('#stage canvas')?.dataset.movement,peak:window.peak})`));console.log(errors);await screenshot('failure').catch(()=>{});throw error;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
