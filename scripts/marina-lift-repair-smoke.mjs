import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5224',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9384';
const output=new URL('../.cache/lift-repair/',import.meta.url);await fs.mkdir(output,{recursive:true});await fs.rm(new URL('results.json',output),{force:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let touchMode=false,serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=60000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await delay(100);}throw Error('Waiting for '+expression+'; state='+JSON.stringify(await evaluate('({phase:window.hud?.phase,self:window.hud?.arenaSelf,state:window.hud?.arena?.merlion})')));}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
async function click(selector){await send('Page.bringToFront');const box=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);if(touchMode){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...box,radiusX:3,radiusY:3,force:1,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return;}await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});}
async function key(key,code){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});}
async function enter(query=''){touchMode=query.includes('touch');await send('Emulation.setTouchEmulationEnabled',{enabled:touchMode});await send('Page.navigate',{url:origin+'/scripts/fixtures/marina-access.html'+query});await wait('window.hud?.phase==="ready"');await click('#start');await wait('window.hud?.phase==="playing"');await wait('window.hud?.arenaSelf?.alive');await wait('(window.hud.arenaSelf.rentalTimeMs??0)>100');}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await enter();await shot('fps-lobby');
 await evaluate('window.roofMin=Infinity;window.roofWatch=setInterval(()=>{if(window.watchRoof)roofMin=Math.min(roofMin,hud.arenaSelf.y);},50)');
 await evaluate('walkTo(90.6,-36)');await wait('hud.arenaSelf.lift && hud.arenaSelf.y>12 && hud.arenaSelf.y<40');
 const before=await evaluate('({x:hud.x,z:hud.z,y:hud.arenaSelf.y,time:hud.elapsed})');
 await evaluate('walkTo(91.7,-35.5)');await evaluate('walkTo(89.5,-36.5)');
 const moved=await evaluate('({x:hud.x,z:hud.z,y:hud.arenaSelf.y,time:hud.elapsed})');
 assert.ok(Math.abs(moved.x-before.x)>.8 && moved.y>before.y,'must walk across a rising cabin');await shot('fps-moving-cabin');
 await evaluate("engine.setInput('c',true)");await delay(450);const crouch=await evaluate('hud.arenaSelf.y-(Math.max(0,Math.min(1,(hud.elapsed%38-7)/12))*66.4)');
 assert.ok(crouch<1.5 && crouch>.9,'crouch while moving');await evaluate("engine.setInput('c',false)");await delay(350);
 await evaluate('engine.jump()');await delay(200);await shot('fps-cabin-jump');await evaluate('walkTo(90.6,-36)');
 await wait('hud.arenaSelf.y>68');await evaluate('walkTo(90.6,-42)');assert.ok(await evaluate('hud.arenaSelf.y>68'));await shot('fps-skypark');await evaluate('window.watchRoof=true');
 // Walk the formerly unsupported boat-shaped ends, then jump onto and off a roof planter.
 await evaluate('walkTo(90.6,-61)');assert.ok(await evaluate('hud.arenaSelf.y>68'));await shot('fps-roof-end');
 await evaluate('walkTo(85.5,-53).then(()=>walkTo(85.5,-24)).then(()=>walkTo(92.9,-24))');await evaluate('engine.jump()');await evaluate('walkTo(94,-24)');await delay(700);
 assert.ok(await evaluate('hud.arenaSelf.y>68.65'),'planter must support the player');await shot('fps-planter');
 await evaluate('walkTo(92,-24)');await delay(600);assert.ok(await evaluate('hud.arenaSelf.y>68'));
 await evaluate('walkTo(85.5,-24).then(()=>walkTo(85.5,39))');await evaluate('walkTo(90.6,43)');assert.ok(await evaluate('hud.arenaSelf.y>68'));await shot('fps-roof-other-end');
 // Return using the other lift, so both services and their thresholds are exercised.
 await evaluate('walkTo(85.5,39).then(()=>walkTo(85.5,18))');await evaluate('walkTo(90.6,18)');assert.ok(await evaluate('roofMin>68.13'),'roof route lost support');await evaluate('window.watchRoof=false');await evaluate('walkTo(90.6,24)');
 await evaluate('window.watchRoof=false');
 await wait('hud.arenaSelf.lift && hud.arenaSelf.y<55 && hud.arenaSelf.y>15');await evaluate('walkTo(91.7,24.5)');await evaluate('walkTo(89.5,23.5)');await evaluate('walkTo(90.6,24)');
 await wait('hud.arenaSelf.y<2',60000);await evaluate('walkTo(90.6,17)');await shot('fps-returned');
 const returned=await evaluate('({x:hud.x,z:hud.z,y:hud.arenaSelf.y,time:hud.elapsed})');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,before,moved,crouch,returned,errors},null,2));console.log('PASS: walking/crouching/jumping in moving cabin, both roof ends, planter landing and step-off, second lift descent and exit.');

}finally{await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
