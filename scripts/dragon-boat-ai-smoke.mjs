import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL('../.cache/boat-ai/',import.meta.url);await fs.mkdir(output,{recursive:true});await fs.rm(new URL('results.json',output),{force:true});
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
async function enter(query=''){touchMode=query.includes('touch');await send('Emulation.setTouchEmulationEnabled',{enabled:touchMode});await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boat-ai.html'+query});await wait('window.hud?.phase==="ready"');await click('#start');await wait('window.hud?.phase==="playing"');await wait('window.hud?.arenaSelf?.alive');await wait('(window.hud.arenaSelf.rentalTimeMs??0)>100');}
const boat='window.hud.arena.vehicles.find(v=>v.kind==="dragon-boat-red")';
const records=[];
async function record(label){const state=await evaluate('({elapsed:window.hud.arena.elapsed,actors:structuredClone(window.hud.arena.actors),boat:structuredClone('+boat+'),merlion:structuredClone(window.hud.arena.merlion)})');records.push({label,...state});await fs.writeFile(new URL('progress.json',output),JSON.stringify(records,null,2));}
async function waitBoat(expression,timeout=180000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await evaluate('window.watchBoat()');await delay(250);}throw Error('Boat progress timeout: '+expression+'; '+JSON.stringify(await evaluate('({actors:window.hud.arena.actors,boats:window.hud.arena.vehicles})')));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1,mobile:false});
 await enter();await waitBoat(boat+'.occupants.filter(Boolean).length>=2');await evaluate('window.watchBoat()');await delay(100);await record('boarded');await shot('boarded');
 await waitBoat(boat+'.z<15');await record('crossing');await shot('crossing');
 await waitBoat('window.hud.arena.actors.some(a=>a.bot&&!a.vehicle&&Math.hypot(a.x,a.z+12)<10)');await record('landed');await shot('landed');
 await waitBoat('window.hud.arena.merlion.operator?.startsWith("bot-") && window.hud.arenaSelf?.alive && window.hud.arenaSelf.conditions?.["water-eyes"]?.strength===1');await wait('!!document.querySelector(".merlion-water-screen.cannon")');await record('contesting');await shot('cannon-victim');
 await waitBoat('!'+boat+'.occupants.some(Boolean)&&Math.hypot('+boat+'.x+17,'+boat+'.z-24)<1');await record('returned');await shot('returned');
 assert(records.every(r=>r.actors.filter(a=>a.bot).length===3));assert(records.every(r=>r.actors.filter(a=>a.bot).every(a=>!a.swimming)));assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,records,errors},null,2));console.log('PASS: real FPS engine bot crew boards, crosses, lands, operates the Merlion and returns the pilot/boat to shore without adding bots.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
