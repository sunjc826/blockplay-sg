// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9228.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
let rig = 'rig-atlas';
const output = new URL('../.cache/ammo-placement/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
const canvas=`document.querySelector('#world canvas')`, animation=`JSON.parse(${canvas}.dataset.ammoPlacement||'{}')`;
const results=[];
async function start(width,height,mobile,url){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
 await send('Page.navigate',{url});await wait("window.hud?.phase==='ready'",90000);
 if(mobile){const p=await point("document.querySelector('#start')");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await click("document.querySelector('#start')");
 await wait("window.hud?.phase==='playing'");await delay(400);
}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.bringToFront');await send('Browser.setPermission',{permission:{name:'pointer-lock'},setting:'granted',origin});await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 for(const [width,height,mobile,label,family] of [[1280,800,false,'rifle',0],[1280,800,false,'drum',1],[1280,800,false,'belt',4],[390,844,true,'phone',0],[844,390,true,'landscape',0]].filter(v=>!process.env.FPS_AMMO_PICKUP_ONLY && (!process.env.FPS_AMMO_VIEW || v[3]===process.env.FPS_AMMO_VIEW))){
  console.log('Checking carrier placement',label);
  await start(width,height,mobile,`${origin}/scripts/fixtures/ammo-placement.html?rig=rig-encik&family=${family}`);
  await evaluate('window.engine.lookBy(0,230)');
  const shots=await evaluate('window.hud.shots');await evaluate("window.engine.setInput('fire',true)");await wait(`window.hud.shots>${shots}`);await evaluate("window.engine.setInput('fire',false);window.engine.reload()");await wait('window.hud.reloading>0');await wait('window.hud.reloading===0',30000);await delay(350);
  const before=await evaluate('window.hud.reserveCarrier.used');
  const emptySlots=await evaluate(`JSON.parse(${canvas}.dataset.magazineInventory).slots.flatMap((slot,i)=>slot?[]:[i])`);
  if(mobile){await wait("!!document.querySelector('[data-touch-action=reserve-transfer]')");const p=await point("document.querySelector('[data-touch-action=reserve-transfer]')");await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});}else await evaluate("window.engine.setInput('reserve-transfer',true)");
  await wait(`${animation}.animation?.phase==='carry' && window.hud.reserveCarrier.progress>.47 && window.hud.reserveCarrier.progress<.6`);
  const middle=await evaluate(animation);assert(middle.animation.hand.every(Number.isFinite));assert(middle.animation.magazine.every(Number.isFinite));assert(emptySlots.includes(middle.animation.slot),'container goes into a previously empty compatible pouch');
  await evaluate('window.freezeMotion=true');await screenshot(label+'-placing');await evaluate('window.freezeMotion=false');
  await wait(`window.hud.reserveCarrier.used<${before}`);
  if(mobile)await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await evaluate("window.engine.setInput('reserve-transfer',false)");
  await wait(`!${animation}.animation`);assert.equal(await evaluate(`${animation}.visible`),false);await screenshot(label+'-filled');results.push({label,middle});
 }
 if(!process.env.FPS_AMMO_VIEW){
 console.log('Checking actual field pickup');
 await start(1280,800,false,`${origin}/scripts/fixtures/ammo-placement.html?rig=rig-atlas&pickup=1`);
 await wait('window.hud.arenaSelf?.alive && window.hud.fieldLoot.some(l=>l.kind==="ammo" && l.caliberMm===5.56)',90000);
 await evaluate(`(()=>{const h=window.hud,p=h.fieldLoot.find(l=>l.kind==='ammo'&&l.caliberMm===5.56),dx=p.x-h.x,dz=p.z-h.z,yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(-1.5,Math.hypot(dx,dz));window.engine.lookBy(-(yaw-h.yaw)/(.0023*2.6),(h.pitch-pitch)/(.0023*2.6*620/900));})()`);
 await wait('window.hud.lootCard?.kind==="ammo"');await evaluate('window.engine.interactLoot()');await wait(`${animation}.queued>0`);
 const batch=await evaluate(animation);assert(batch.queued>=2);assert(batch.hiddenSlots.length>=2);
 await screenshot('pickup-reaching');await wait(`${animation}.animation?.phase==='carry'`);await screenshot('pickup-to-rig');
 await wait(`${animation}.queued===0`,15000);assert.equal(await evaluate('window.hud.spareMagazines'),10);await evaluate('window.engine.lookBy(0,80)');await delay(250);await screenshot('pickup-rig-filled');
 results.push({label:'field-pickup',batch});}
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL(process.env.FPS_AMMO_VIEW ? `${process.env.FPS_AMMO_VIEW}-results.json` : 'results.json',output),JSON.stringify({passed:true,results,errors},null,2));console.log(`PASS ${results.map(result=>result.label).join(', ')}: ammo pickup / real-pouch placement; no runtime or shader errors.`);
}catch(error){console.log('ERROR',error,errors);await screenshot('failure');console.log(await evaluate(`({phase:window.hud?.phase,message:window.hud?.message,loot:window.hud?.lootPrompt,animation:document.querySelector('#world canvas')?.dataset.ammoPlacement})`));throw error;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
