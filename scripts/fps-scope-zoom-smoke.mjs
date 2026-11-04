// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/intervention-zoom/browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/scope-zoom.html`)}`, { method: 'PUT' })).json();
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
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const ammo = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
const zoom = value => `window.hud?.scopeZoom?.value===${value}`;
const canvas = `document.querySelector('#world canvas')`;
const plus = `document.querySelector('[aria-label="Increase scope magnification"]')`;
const minus = `document.querySelector('[aria-label="Decrease scope magnification"]')`;
async function wheel(deltaY) { await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:400,deltaX:0,deltaY}); }
async function settled(value) { await wait(`${canvas}.dataset.scopeMagnification==='${value}'`); }
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,60000);await click(`document.querySelector('#start')`);
 await wait(`window.hud.phase==='playing'`);await evaluate('window.engine.switchWeapon(12)');await wait(zoom(6));
 await key('q','KeyQ');await wait(`${canvas}.dataset.scopeActive==='true'`);await settled(6);await screenshot('desktop-6x');
 await wheel(-100);await wait(zoom(9));await wheel(-100);await wait(zoom(12));await settled(12);
 await wheel(-100);assert(await evaluate(zoom(12)));await screenshot('desktop-12x');
 for(const value of [9,6,3]) {await key('[','BracketLeft');await wait(zoom(value));}
 await settled(3);await key('[','BracketLeft');assert(await evaluate(zoom(3)));await screenshot('desktop-3x');
 // Hip scrolling cannot change the optic, but the explicit bracket keys can preset it.
 await key('q','KeyQ');await wait('!window.hud.aiming');await wheel(-100);assert(await evaluate(zoom(3)));
 await key(']','BracketRight');await wait(zoom(6));await key(']','BracketRight');await wait(zoom(9));
 await evaluate('window.engine.switchWeapon(2)');await wait('window.hud.weapon===2 && window.hud.scopeZoom===null');
 await key(']','BracketRight');assert.equal(await evaluate('window.hud.scopeZoom'),null);
 // A switch request is ignored until the stow and draw have finished, so keep asking.
 await wait(`window.hud.weapon===12||(window.engine.switchWeapon(12),false)`);await wait(zoom(9));
 await wait(`${canvas}.dataset.weaponSwitch!==''`);await wait(`${canvas}.dataset.weaponSwitch===''`);
 // Reload and pause gate every path, including the direct engine method used by touch.
 await evaluate("window.engine.setInput('fire',true)");await delay(80);await evaluate("window.engine.setInput('fire',false);window.engine.reload()");
 await wait('window.hud.reloading>0');await key(']','BracketRight');await evaluate('window.engine.adjustScopeZoom(1)');assert(await evaluate(zoom(9)));
 await wait('window.hud.reloading===0');await key(']','BracketRight');await wait(zoom(12));
 await evaluate('window.engine.pause();window.engine.adjustScopeZoom(-1)');await wait("window.hud.phase==='paused'");assert(await evaluate(zoom(12)));
 // A fresh touch session starts at 6× and uses the same live HUD controls.
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html'});await wait("window.hud?.phase==='ready'",60000);
 const start=await point(`document.querySelector('#start')`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing' && window.hud.inputMode==='touch'");await evaluate('window.engine.switchWeapon(12);window.engine.toggleAim()');await wait(zoom(6));await wait('window.hud.aiming');
 const aim=await point(plus),stick=await point(`document.querySelector('.touch-move')`);
 const shots=await evaluate('window.hud.shots');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1},{...aim,id:2}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...stick,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(zoom(9));await delay(300);assert(await evaluate(zoom(9)),'Synthetic follow-up click must not double-step');
 assert.equal(await evaluate('window.hud.shots'),shots,'Zooming never fires');await settled(9);await screenshot('touch-landscape-9x');
 const geometry=await evaluate(`(()=>{const buttons=[${plus},${minus}],fire=document.querySelector('.touch-fire').getBoundingClientRect();return buttons.map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,visible:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,overlap:r.left<fire.right&&r.right>fire.left&&r.top<fire.bottom&&r.bottom>fire.top};});})()`);
 assert(geometry.every(r=>r.width>=44&&r.height>=44&&r.visible&&!r.overlap),'Touch controls fit the viewport and clear Fire');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(400);await screenshot('touch-portrait-9x');
 const down=await point(minus);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...down,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(zoom(6));
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 console.log('PASS: Intervention 3/6/9/12× live scope; wheel/brackets, bounds, hip gating, weapon-switch memory, reload/pause gating, multi-touch controls, no accidental shots or shader errors.');
} finally { ws.close();await fetch(`${chrome}/json/close/${tab.id}`); }
