// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/verticality-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
 await send('Emulation.setFocusEmulationEnabled', { enabled: true });
 await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
 await wait(`document.querySelectorAll('.location-card').length>=3`);
 await evaluate(`(async()=>{
  const {getRegion}=await import('/src/game/regions.ts');
  const {getVerticalRoutes}=await import('/src/game/vertical-routes.ts');
  const region=getRegion('orchard'), build=region.build;
  const sample=build(); const route=getVerticalRoutes(sample.scene).find(r=>r.id==='somerset-seating-terrace');
  if(!route) throw Error('Missing authored Orchard terrace'); sample.dispose();
  const [a,b,c]=route.points; const yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));
  window.verticalFixture={start:{x:a.x,z:a.z,yaw,pitch:0},height:b.y,target:{x:b.x+(c.x-b.x)*.2,z:b.z+(c.z-b.z)*.2}};
  region.build=()=>{const world=build();world.scene.onBeforeRender=(_renderer,_scene,camera)=>{
   if(camera.isPerspectiveCamera&&camera.far>100)window.renderedCamera={x:camera.position.x,y:camera.position.y,z:camera.position.z,frames:(window.renderedCamera?.frames??0)+1};
  };return world;};
  Object.assign(region.spawn,window.verticalFixture.start);
  const {getFpsDistrict}=await import('/src/game/fps-districts.ts'); Object.assign(getFpsDistrict('orchard').spawn,window.verticalFixture.start);
  const {createFpsEngine}=await import('/src/game/fps-engine.ts'); const {createSoloSession}=await import('/src/game/lan-peer.ts'); const {createProfile}=await import('/src/game/armory-state.ts');
  document.body.innerHTML='<button id="start">Enter verticality test</button><div id="stage" style="width:320px;height:200px"></div>';
  window.verticalSession=createSoloSession('Verticality test');
  window.testEngine=createFpsEngine(document.querySelector('#stage'),hud=>window.testHud=hud,{region:'orchard',arena:{session:window.verticalSession,profile:createProfile(),botCount:0,environment:{bounds:region.bounds,move:region.move,spawns:[window.verticalFixture.start],playerSpawn:window.verticalFixture.start}}});
  document.querySelector('#start').onclick=()=>window.testEngine.start();
 })()`);
 if(process.env.VERTICALITY_SMOKE_MODE!=='exploration') {
 await wait(`window.testHud?.phase==='ready'`, 40000);
 await click(`document.querySelector('#start')`); await wait(`window.testHud.phase==='playing'`);
 console.log('FPS ready; walking actual ramp');
 await evaluate(`window.testEngine.setInput('w',true)`);
 await wait(`(window.testEngine.setInput('w',true),Math.hypot(window.testHud.x-window.verticalFixture.target.x,window.testHud.z-window.verticalFixture.target.z)<1)`, 120000);
 await evaluate(`window.testEngine.setInput('w',false)`); await delay(250);
 console.log('FPS ascended; checking elevated jump');
 const fps=await evaluate(`({camera:window.renderedCamera,actor:window.testHud.arenaSelf,height:window.verticalFixture.height})`);
 assert(Math.abs(fps.camera.y-fps.height-1.75)<.15, JSON.stringify(fps));
 assert(Math.abs(fps.actor.y-fps.height-1.75)<.1, 'Authoritative actor ascends with the rendered camera');
 await evaluate(`window.jumpPeak=window.renderedCamera.y;window.jumpTimer=setInterval(()=>window.jumpPeak=Math.max(window.jumpPeak,window.renderedCamera.y),10);window.testEngine.jump()`);
 await wait(`window.jumpPeak>window.verticalFixture.height+2.1`, 60000);
 await wait(`Math.abs(window.renderedCamera.y-window.verticalFixture.height-1.75)<.05`, 60000);
 await evaluate(`clearInterval(window.jumpTimer);window.testEngine.setInput('z',true)`);
 await wait(`window.testHud.prone&&window.testHud.arenaSelf.prone&&Math.abs(window.renderedCamera.y-window.verticalFixture.height-.55)<.05`);
 await screenshot('fps-elevated-prone');
 console.log('PASS FPS: actual Orchard ramp ascent, authoritative elevated actor, jump/landing and elevated prone.');
 }
 await evaluate(`window.testEngine.dispose();window.verticalSession.close();window.renderedCamera=null`);
 await evaluate(`(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=ReactDOM;const {default:RegionGame}=await import('/src/components/RegionGame.tsx');
  document.body.innerHTML='<style>.region-viewport{width:320px;height:200px}canvas{width:320px;height:200px}</style><div id="explore"></div>';
  window.exploreRoot=createRoot(document.querySelector('#explore'));window.exploreRoot.render(React.createElement(RegionGame,{region:'orchard'}));
 })()`);
 await wait(`!!window.renderedCamera&&!!document.querySelector('canvas')`);
 await evaluate(`document.querySelector('canvas').focus();document.querySelector('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'w',bubbles:true}))`);
 await wait(`Math.hypot(window.renderedCamera.x-window.verticalFixture.target.x,window.renderedCamera.z-window.verticalFixture.target.z)<1`,120000);
 await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w',bubbles:true}))`);await delay(150);
 const explore=await evaluate(`({camera:window.renderedCamera,height:window.verticalFixture.height})`);
 assert(Math.abs(explore.camera.y-explore.height-1.75)<.05,JSON.stringify(explore));
 await screenshot('exploration-elevated');
 await evaluate(`window.exploreRoot.unmount()`);
 assert.equal(mapRequests,0);assert.deepEqual(errors,[]);
 console.log('PASS exploration: actual RegionGame camera follows the same authored terrace; zero Google calls and runtime errors.');
} catch(error) { console.log(errors); console.log(await evaluate('({phase:window.testHud?.phase,x:window.testHud?.x,z:window.testHud?.z,actor:window.testHud?.arenaSelf,camera:window.renderedCamera,fixture:window.verticalFixture})')); await screenshot('failure'); throw error; }
finally {ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);}
