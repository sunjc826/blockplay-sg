// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/smart-power/browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/scope-zoom.html?weapon=ff-longwatch`)}`, { method: 'PUT' })).json();
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
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
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
 await wait("window.hud?.phase==='ready'",60000);await click("document.querySelector('#start')");
 await wait("window.hud?.phase==='playing' && window.hud.weapon===10");await wait(zoom(4));
 assert.equal(await evaluate('window.hud.magazineCapacity'),20);
 await key('q','KeyQ');await wait(`${canvas}.dataset.scopeActive==='true'`);await settled(4);await screenshot('desktop-4x');
 await wheel(100);await wait(zoom(2));await settled(2);await screenshot('desktop-2x');
 await wheel(100);assert(await evaluate(zoom(2)));
 await key(']','BracketRight');await wait(zoom(4));await key(']','BracketRight');assert(await evaluate(zoom(4)));
 await key('[','BracketLeft');await wait(zoom(2));
 await evaluate('window.engine.switchWeapon(2)');await wait('window.hud.weapon===2 && window.hud.scopeZoom===null');await wait(`${canvas}.dataset.weaponSwitch!==''`);await wait(`${canvas}.dataset.weaponSwitch===''`);
 await evaluate('window.engine.switchWeapon(10)');await wait(zoom(2));await wait(`${canvas}.dataset.weaponSwitch!==''`);await wait(`${canvas}.dataset.weaponSwitch===''`);
 // Holding the trigger still fires one round; releasing allows the next shot.
 const before=await evaluate('window.hud.shots');
 await evaluate("window.engine.setInput('fire',true)");await delay(700);await evaluate("window.engine.setInput('fire',false)");
 assert.equal(await evaluate('window.hud.shots'),before+1);
 await evaluate("window.engine.setInput('fire',true)");await delay(100);await evaluate("window.engine.setInput('fire',false);window.engine.reload()");
 await wait('window.hud.reloading>0');await key(']','BracketRight');assert(await evaluate(zoom(2)));
 await wait('window.hud.reloading===0');assert.equal(await evaluate('window.hud.magazine'),21);
 await key(']','BracketRight');await wait(zoom(4));
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?weapon=ff-longwatch'});await wait("window.hud?.phase==='ready'",60000);
 const start=await point("document.querySelector('#start')");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing' && window.hud.inputMode==='touch'");await evaluate('window.engine.toggleAim()');await wait(zoom(4));await wait('window.hud.aiming');
 const down=await point(minus),shots=await evaluate('window.hud.shots');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...down,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(zoom(2));await settled(2);await screenshot('touch-landscape-2x');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(400);
 const up=await point(plus);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...up,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(zoom(4));await settled(4);await screenshot('touch-portrait-4x');
 assert.equal(await evaluate('window.hud.shots'),shots);
 const geometry=await evaluate(`(()=>{const fire=document.querySelector('.touch-fire').getBoundingClientRect();return [${plus},${minus}].map(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!(r.left<fire.right&&r.right>fire.left&&r.top<fire.bottom&&r.bottom>fire.top);});})()`);
 assert(geometry.every(Boolean),'Zoom controls fit and clear Fire');
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,errors,mapRequests,checks:['2x/4x live scope','wheel and brackets','bounds and switch memory','20-round magazine and reload','semi-auto trigger','reload zoom gating','landscape/portrait touch controls']},null,2));
 console.log('PASS: Smart Power 2×/4× scope, desktop and touch, 20-round magazine, semi-auto fire and reload; no shader errors or map requests.');
} finally { await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`); }
