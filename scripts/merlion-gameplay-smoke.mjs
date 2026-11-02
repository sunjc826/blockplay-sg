import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL('../.cache/merlion-gameplay/',import.meta.url);await fs.mkdir(output,{recursive:true});await fs.rm(new URL('results.json',output),{force:true});
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
async function enter(query=''){touchMode=query.includes('touch');await send('Emulation.setTouchEmulationEnabled',{enabled:touchMode});await send('Page.navigate',{url:origin+'/scripts/fixtures/merlion-gameplay.html'+query});await wait('window.hud?.phase==="ready"');await click('#start');await wait('window.hud?.phase==="playing"');await wait('window.hud?.arenaSelf?.alive');await wait('(window.hud.arenaSelf.rentalTimeMs??0)>100');}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:1,mobile:false});
 await enter();await shot('controls');await key('e','KeyE');await wait('window.hud.arena.merlion.operator===window.hud.arenaSelf.id');
 await evaluate('window.engine.setInput("fire",true)');await wait('window.hud.arena.merlion.firing');await shot('cannon-operator');
 const firing=await evaluate('structuredClone(window.hud.arena.merlion)');assert.ok(firing.pressure<1);const oldYaw=firing.yaw;await evaluate('window.engine.lookBy(160,0)');await wait('Math.abs(window.hud.arena.merlion.yaw-('+oldYaw+'))>.1');await evaluate('window.engine.setInput("fire",false)');await wait('!window.hud.arena.merlion.firing');
 await key('q','KeyQ');await wait('window.hud.arena.merlion.mist>0');await wait('!!document.querySelector(".merlion-water-screen.mist")');await shot('mist');
 await key('e','KeyE');await wait('!window.hud.arena.merlion.operator');
 await enter('?mode=cache');await wait('!!document.querySelector(".merlion-hud")');await key('e','KeyE');await wait('window.hud.arena.merlion.packs===2');assert.equal(await evaluate('window.hud.health'),75);await shot('cache');
 await enter('?mode=bot');await wait('window.hud.arena.merlion.operator==="bot-1"');await wait('window.hud.arenaSelf.conditions?.["water-eyes"]?.strength===1');await wait('!!document.querySelector(".merlion-water-screen.cannon")');await shot('cannon-victim');
 const bot=await evaluate('({self:structuredClone(window.hud.arenaSelf),state:structuredClone(window.hud.arena.merlion)})');assert.equal(bot.self.health,50);
 await wait('!window.hud.arenaSelf.conditions?.["water-eyes"]',15000);await shot('vision-restored');
 await send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:true});await enter('?touch');await wait('!!document.querySelector(".merlion-hud button")');await click('.merlion-hud button');await wait('window.hud.arena.merlion.operator===window.hud.arenaSelf.id');await wait('!!document.querySelector("[data-touch-action=aim]")');
 await click('[data-touch-action=aim]');await wait('window.hud.arena.merlion.mist>0');await wait('!!document.querySelector(".merlion-water-screen.mist")');await shot('touch-mist');
 await click('[data-touch-action=vehicle]');await wait('!window.hud.arena.merlion.operator');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,firing,bot,errors},null,2));console.log('PASS: real engine desktop/touch controls, rotating cannon, bot operation and player blindness/recovery, mist, finite supplies.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
