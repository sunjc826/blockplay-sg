// Start Vite and an isolated Chrome with remote debugging. No paid services are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9228';
const output=new URL('../.cache/range-drills/',import.meta.url);await fs.mkdir(output,{recursive:true});
const target=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/range-drills.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let n=0;const pending=new Map(),errors=[];let maps=0;
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&/maps\.googleapis|streetviewpixels/.test(m.params.request.url))maps++;};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++n,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(150);}throw new Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate('({hud:window.hud,errors:window.records})'))}`);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${name}.png`,output),Buffer.from(r.data,'base64'));}
async function mount(mode){await evaluate(`window.mount(${JSON.stringify(mode)})`);await wait(`window.hud?.phase==='ready'`);await evaluate('window.engine.startPilot()');await wait(`window.hud?.phase==='playing'`);}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,90000);await evaluate('window.engine.startPilot()');await wait(`window.hud?.phase==='playing'`);await wait(`!!window.hud?.rangeSupplyPrompt`);
 const inventory=await evaluate('JSON.stringify(window.profile.consumables)');
 await evaluate('window.engine.resupplyRange()');await wait(`window.hud?.belt.find(s=>s.kind==='grenade').count===4`);await screenshot('resupply');
 const stocked=await evaluate('window.hud.belt');await evaluate('window.engine.resupplyRange()');assert.deepEqual(await evaluate('window.hud.belt'),stocked,'restocking never stacks extra supplies');
 await evaluate('window.engine.useUtility("ammo")');await wait(`!!window.hud?.supplyUse`);await wait(`!window.hud?.supplyUse`);assert.equal(await evaluate('window.hud.belt.find(s=>s.kind==="ammo").count'),1);assert.deepEqual(await evaluate('window.records.consumed'),[]);
 await evaluate('window.level=true;window.engine.useUtility("grenade")');await wait(`!!window.hud.grenadeHeld`);await delay(500);await evaluate('window.action={fire:true}');await wait(`window.hud.grenadeHeld?.pinned===true`);await evaluate('window.action={}');await wait(`!window.hud.grenadeHeld`);assert.equal(await evaluate('window.hud.belt.find(s=>s.kind==="grenade").count'),3);assert.equal(await evaluate('JSON.stringify(window.profile.consumables)'),inventory);
 await evaluate('window.engine.resupplyRange()');await wait(`window.hud.belt.find(s=>s.kind==='grenade').count===4`);
 await evaluate('window.engine.pause()');const paused=await evaluate('window.hud.elapsed');await delay(1100);assert.equal(await evaluate('window.hud.elapsed'),paused,'pause freezes the drill clock');
 await evaluate('window.engine.startPilot();window.control="hunt"');await wait('window.hud.hits>8',120000);assert.equal(await evaluate('window.hud.phase'),'playing');assert.equal(await evaluate('window.records.completions.length'),0);await screenshot('continuous');
 await evaluate('window.engine.pause();window.engine.endDrill()');assert.equal(await evaluate('window.hud.phase'),'complete');assert.equal(await evaluate('window.records.completions.length'),0);
 await mount('classic');await evaluate('window.control="hunt"');await wait(`window.hud.phase==='complete'`,120000);assert.equal(await evaluate('window.hud.hits'),8);assert.equal(await evaluate('window.records.completions.length'),1);await screenshot('classic-complete');
 await mount('timed');await evaluate('window.control="hunt"');await wait('window.hud.hits>=1',60000);await evaluate('window.control="idle";window.action={}');await wait(`window.hud.phase==='complete'`,115000);assert.equal(await evaluate('window.hud.elapsed'),90);assert.equal(await evaluate('window.records.completions.length'),2);await screenshot('timed-complete');
 await mount('timed');await evaluate('window.engine.pause();window.engine.endDrill()');assert.equal(await evaluate('window.records.completions.length'),2,'ending early pays no completion bonus');
 const records=await evaluate('window.records');assert.equal(new Set(records.eliminations).size,records.eliminations.length);assert.deepEqual(records.consumed,[]);assert.deepEqual(errors,[]);assert.equal(maps,0);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({records,errors,maps},null,2));console.log('PASS range drills: reusable targets, classic/timed/continuous completion, pause, equipment resupply, session-only consumption, unique rewards and no runtime/map errors.');
}catch(e){await screenshot('failure').catch(()=>{});console.log('Browser errors:',errors);throw e;}finally{ws.close();await fetch(`${chrome}/json/close/${target.id}`);}
