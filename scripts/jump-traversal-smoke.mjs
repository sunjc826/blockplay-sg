// Run a local Vite server with server.hmr=false and an isolated Chrome with --remote-debugging-port=9228.
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
  const {getRegion}=await import('/src/game/regions.ts');
  const {getFpsDistrict}=await import('/src/game/fps-districts.ts');
  const {createFpsEngine}=await import('/src/game/fps-engine.ts');
  const region=getRegion('orchard'),build=region.build;
  region.build=()=>{const world=build();window.jumpWorld=world;world.scene.onBeforeRender=(_r,_s,c)=>{if(c.isPerspectiveCamera&&c.far>100){window.jumpCamera={x:c.position.x,y:c.position.y,z:c.position.z};window.jumpFrames=(window.jumpFrames||0)+1;}};return world;};
  Object.assign(getFpsDistrict('orchard').spawn,{x:207,z:153,yaw:-Math.PI/2,pitch:.15});
  document.body.innerHTML='<button id="start">Enter jump test</button><div id="stage" style="width:640px;height:400px"></div>';
  window.engine=createFpsEngine(document.querySelector('#stage'),hud=>window.hud=hud,{region:'orchard'});
  document.querySelector('#start').onclick=()=>window.engine.start();
 })()`);
 await wait(`window.hud?.phase==='ready'`,60000);
 const tops=await evaluate(`window.jumpWorld.obstacles.filter(o=>o.supportsTop)`);
 assert(tops.length>=3,'resupply, crate and sandbags have authored tops');
 const bag=tops.find(o=>Math.abs((o.minX+o.maxX)/2-209)<.1); assert(bag);
 console.log('Rendered sandbag collider',bag);
 await click(`document.querySelector('#start')`); await wait(`window.hud.phase==='playing'`);
 await evaluate(`window.engine.setInput('w',true)`);
 await wait(`window.jumpCamera.x>207.6`); await delay(1200);
 const wall=await evaluate(`window.jumpCamera.x`);assert(wall<bag.minX,'walking is blocked by the sandbags');
 await screenshot('before-jump');
 await evaluate(`window.peak=0;window.sawAir=false;window.jumpObserver=setInterval(()=>{const m=JSON.parse(document.querySelector('#stage canvas').dataset.movement||'{}');window.peak=Math.max(window.peak,m.feet||0);if(!m.grounded&&m.feet>.3)window.sawAir=true;if(window.jumpCamera.x>208.65)window.engine.setInput('w',false);},5);window.engine.jump()`);
 await wait(`window.sawAir&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet>.4`,60000);
 await evaluate(`clearInterval(window.jumpObserver);window.engine.setInput('w',false)`);await delay(1000);
 const landed=await evaluate(`({camera:window.jumpCamera,motion:JSON.parse(document.querySelector('#stage canvas').dataset.movement),peak:window.peak})`);
 assert(Math.abs(landed.motion.feet-bag.maxY)<.01,JSON.stringify(landed));assert(landed.motion.grounded);
 assert(landed.peak>1.3,JSON.stringify(landed));
 await screenshot('on-sandbags');
 await evaluate(`window.engine.jump()`);await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet>${bag.maxY}+.4`);
 await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded`,60000);
 assert(Math.abs((await evaluate(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet`))-bag.maxY)<.01,'can jump again from the top');
 await evaluate(`window.engine.setInput('w',true)`);await wait(`window.jumpCamera.x>${bag.maxX+.6}`,60000);await evaluate(`window.engine.setInput('w',false)`);
 await wait(`JSON.parse(document.querySelector('#stage canvas').dataset.movement).grounded&&JSON.parse(document.querySelector('#stage canvas').dataset.movement).feet<.1`,60000);
 await screenshot('after-drop');
 assert.equal(mapRequests,0);assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('browser-result.json',output),JSON.stringify({passed:true,bag,wall,landed,errors,mapRequests},null,2));
 console.log('PASS: real FPS input blocks walking, jumps onto rendered sandbags, stays on top, jumps again and drops to ground. No runtime errors or Google requests.');
 await evaluate(`window.engine.dispose()`);
} catch(error){console.log(await evaluate(`({hud:window.hud?.phase,camera:window.jumpCamera,movement:document.querySelector('#stage canvas')?.dataset.movement,peak:window.peak})`));console.log(errors);await screenshot('failure').catch(()=>{});throw error;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
