// Requires local Vite and an isolated Chrome with remote debugging enabled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9231';
const output=new URL('../.cache/fps-body/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error(`CDP timeout: ${method}`));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(150);}throw new Error(`Timed out: ${expression}`);}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
const body=`JSON.parse(document.querySelector('canvas').dataset.body||'null')`;
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`${origin}/scripts/fixtures/fps-body-render.html`});
 await wait('window.ready');
 assert.deepEqual(await evaluate('window.bodies'),[{slots:6,magazines:0},{slots:6,magazines:3},{slots:8,magazines:8},{slots:9,magazines:9},{slots:8,magazines:5},{slots:9,magazines:9}]);
 await screenshot('equipment-comparison');
 await send('Page.navigate',{url:`${origin}/scripts/fixtures/fps-body-render.html?feeds`});
 await wait('window.ready && window.feeds?.length===6');
 assert.deepEqual(await evaluate('window.feeds'),['magazine','pistol-magazine','drum','ammo-box','ammo-box','ammo-box']);
 await screenshot('reserve-feed-types');
 if(process.env.FPS_BODY_RENDER_ONLY){console.log('PASS: equipment comparison.');process.exitCode=0;}
 else {
 await send('Page.navigate',{url:`${origin}/scripts/fixtures/fps-body-engine.html`});
 await wait(`window.hud?.phase==='ready'`);
 await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));window.engine.start();`);
 await wait(`window.hud?.phase==='playing'`);
 assert.equal((await evaluate(body)).magazines,0);
 await evaluate(`window.engine.lookBy(0,900);window.engine.useQuickItem();`);
 await wait(`${body}?.magazines===3`);
 await screenshot('ammo-supply-equipped');
 await evaluate(`window.engine.setInput('fire',true)`);await delay(4300);await evaluate(`window.engine.setInput('fire',false);window.engine.reload()`);
 await wait(`${body}?.magazines<3`);
 await wait(`window.hud.reloading===0`);
 await evaluate(`window.engine.setInput('c',true)`);await delay(1000);await screenshot('crouching');
 await evaluate(`window.engine.setInput('c',false);window.engine.setInput('z',true)`);await delay(1500);await screenshot('prone');
 const report=await evaluate(`({body:${body},stance:JSON.parse(document.querySelector('canvas').dataset.movement),reserve:window.hud.reserve,phase:window.hud.phase})`);
 console.log(JSON.stringify(report));
 assert.equal(report.stance.stance,'prone');assert.equal(report.body.slots,9);
 await evaluate('window.engine.reset()');await wait(`${body}?.magazines===0`);
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('report.json',output),JSON.stringify({report,errors},null,2));
 console.log('PASS: equipment variants, live ammo supply/reload/reset, crouch/prone, no browser exceptions.');
 }
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
