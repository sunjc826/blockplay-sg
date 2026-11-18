// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9331.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9331';
const output = new URL('../.cache/fps-districts/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0, voiceApiRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Network.requestWillBeSent' && /elevenlabs\.io/.test(m.params.request.url)) voiceApiRequests++;
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
try {
 await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await wait(`document.readyState==='complete'`,60000);
 // Every registered district is exercised, so a new map needs no edit here.
 const regions=await evaluate(`import('/src/game/regions.ts').then(async m=>{const d=await import('/src/game/fps-districts.ts');return m.REGIONS.map(r=>[r.id,r.name,d.getFpsDistrict(r.id).label])})`);
 assert(regions.length>=3,'the developed districts are selectable');
 for(const [index,[id,name,label]] of regions.entries()) {
   // The debug workspace opens a tool and district from its URL; the old district and mode cards are gone.
   await send('Page.navigate',{url:`${origin}/debug?tool=fps&district=${id}`});
   await wait(`document.querySelector('.fps-game')?.dataset.mapZone===${JSON.stringify(id)} && ${phase('ready')}`,60000);
   assert.equal(await evaluate(`document.querySelectorAll('.experience canvas').length`),1);
   assert((await evaluate(`document.querySelector('.fps-toolbar h3').textContent`)).includes(label));
   await click(`document.querySelector('.fps-shop-link')`);
   await wait(`!!document.querySelector('.armory-deploy button')`);
   assert.equal(await evaluate(`document.querySelector('.armory-deploy button').textContent.trim()`),`Deploy to ${label}`);
   await click(`document.querySelector('.armory-deploy button')`);
   await wait(`document.querySelector('.fps-game')?.dataset.mapZone===${JSON.stringify(id)} && ${phase('ready')}`,60000);
   const config=await evaluate(`import('/src/game/fps-districts.ts').then(m=>m.getFpsDistrict(${JSON.stringify(id)}))`);
   await click(button('Enter range')); await wait(phase('playing'));
   assert(await evaluate('!!document.pointerLockElement'));
   await wait(`document.querySelector('.fps-minimap')?.dataset.mapZone===${JSON.stringify(id)}`);
   await screenshot(`${id}-playing`);
   let yaw=config.spawn.yaw,pitch=config.spawn.pitch;
   await key('q','KeyQ'); await wait(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)>.98`);
   for(const [n,target] of config.targets.entries()) {
     // A dummy takes several rounds and the trigger is held until it falls, so top up early. A reload from
     // empty ends one round short of a full gun (the chamber takes it), so wait for most of a magazine.
     if(await evaluate(`Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`)<16) {
       await key('r','KeyR'); await wait(`Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)>=29`,15000);
       // The magazine count fills before the reload's last stage ends, and Q is ignored until it does: try until the sights come up.
       for(let attempt=0;attempt<6&&await evaluate(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)<.98`);attempt++){
         await delay(700); if(await evaluate(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)<.05`)) await key('q','KeyQ'); await delay(700);
       }
       await wait(`Number(document.querySelector('.fps-viewport canvas').dataset.aimProgress)>.98`);
     }
     const nextYaw=Math.atan2(-(target.x-config.spawn.x),-(target.z-config.spawn.z));
     const nextPitch=Math.atan2(-.32,Math.hypot(target.x-config.spawn.x,target.z-config.spawn.z));
     // Close the loop on the engine's own aim: recoil moves it and hands only part back, and a magnified
     // sight scales the mouse, so one reckoned move lands short on a wide turn.
     for(let step=0;step<6;step++){
       ({yaw,pitch}=await evaluate(`(()=>{const d=document.querySelector('.fps-game').dataset;return {yaw:Number(d.playerYaw),pitch:Number(d.playerPitch)}})()`));
       let turn=nextYaw-yaw; turn=Math.atan2(Math.sin(turn),Math.cos(turn));
       if(Math.abs(turn)<.002&&Math.abs(nextPitch-pitch)<.002)break;
       await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperties(e,{movementX:{value:${-turn/.0013}},movementY:{value:${-(nextPitch-pitch)/.0013}}});document.dispatchEvent(e)})()`);
       await delay(120);
     }
     await delay(300);
     await send('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:550,button:'left',clickCount:1});
     await wait(`document.querySelector('.fps-score').textContent.startsWith('${n+1} /')`,7000);
     await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:700,y:550,button:'left',clickCount:1});
     await delay(500);
   }
   await wait(phase('complete'));
   assert((await evaluate(`document.querySelector('.fps-score').textContent`)).includes('8 / 8'));
   assert(await evaluate(`document.querySelectorAll('.fps-comms-entry.channel-kills').length===8`));
   assert(!await evaluate(`!!document.querySelector('[data-marker-kind="target"]')`));
   await screenshot(`${id}-complete`);
   console.log(`PASS ${id}: selected-map FPS, armory return, minimap, captured mouse fire clears all eight targets and receives completion rewards.`);
 }
 assert.equal(mapRequests,0);assert.equal(voiceApiRequests,0);assert.deepEqual(errors,[]);
 console.log('PASS: switching maps preserves FPS mode; one scene canvas at a time; no live map/TTS API calls or runtime errors.');
} catch(error) {console.log(errors); await screenshot('district-failure'); throw error;}
finally {ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);}
