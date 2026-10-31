import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5198', chrome=process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9348';
const output=new URL('../.cache/player-respawn/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/player-respawn-panel.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method));},120000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(150);}throw Error('Waiting for '+expression);}
async function click(selector,touch=false){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await wait('window.hud?.phase==="ready"',180000);await click('#start');await wait('!!document.querySelector(".respawn-card")');
 await wait('window.hud.arenaSelf.respawnIn===0');await delay(500);
 assert.equal(await evaluate('window.hud.arenaSelf.alive'),false);assert.equal(await evaluate('!!document.pointerLockElement'),false);
 assert.equal(await evaluate('document.querySelector(".respawn-automatic input").checked'),false);
 assert(await evaluate('document.querySelectorAll(".respawn-zones button:not(:disabled)").length>0'));
 await screenshot('desktop-manual');
 await click('.respawn-menu');await wait('window.hud.phase==="paused"');await click('#start');await wait('!!document.querySelector(".respawn-card")');
 const target=await evaluate('window.hud.respawn.zones.find(z=>z.available)');
 await click('.respawn-zones button:not(:disabled)');await wait('window.hud.arenaSelf.alive');
 assert(await evaluate(`Math.hypot(window.hud.arenaSelf.x-(${target.x}),window.hud.arenaSelf.z-(${target.z}))<5`));
 console.log('PASS desktop authority/UI: manual wait at zero, menu/resume, selected allied respawn.');
 // A fresh authority starts dead for portrait/landscape and the auto checkbox.
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/player-respawn-panel.html'});await wait('window.hud?.phase==="ready"',180000);await click('#start',true);await wait('!!document.querySelector(".respawn-card")');
 for(const [width,height] of [[390,844],[844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(300);
  assert(await evaluate('(()=>{const r=document.querySelector(".respawn-card").getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'));
  if(width===390) await screenshot(`touch-${width}`);
 }
 await click('.respawn-automatic input',true);await wait('window.hud.arenaSelf.alive');assert.equal(await evaluate('window.hud.respawn.automatic'),true);
 assert.deepEqual(errors,[]);console.log('PASS touch: portrait/landscape fit, auto checkbox deploys at an allied zone; zero runtime errors.');
}catch(error){console.log(errors,await evaluate('({phase:window.hud?.phase,alive:window.hud?.arenaSelf?.alive,respawn:window.hud?.respawn,text:document.body.innerText})').catch(()=>null));await screenshot('failure').catch(()=>{});throw error;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
