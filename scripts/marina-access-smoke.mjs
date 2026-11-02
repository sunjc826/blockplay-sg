import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5224',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9384';
const output=new URL('../.cache/marina-access/',import.meta.url);await fs.mkdir(output,{recursive:true});await fs.rm(new URL('results.json',output),{force:true});
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
 await evaluate('walkTo(90.6,-36)');await wait('hud.arenaSelf.lift && hud.arenaSelf.y>25');await shot('fps-ascending');
 await wait('hud.arenaSelf.y>68');await evaluate('walkTo(90.6,-42)');assert.ok(await evaluate('hud.arenaSelf.y>68'));await shot('fps-skypark');
 await evaluate('walkTo(90.6,-36)');await wait('hud.arenaSelf.y<2',60000);await evaluate('walkTo(90.6,-43)');await shot('fps-returned');
 const lift=await evaluate('({x:hud.x,z:hud.z,y:hud.arenaSelf.y,time:hud.elapsed})');
 await enter('?spiral');await evaluate('walkTo(spiralRoute[0].x,spiralRoute[0].z)');
 for(let i=1;i<=32;i++)await evaluate(`walkTo(spiralRoute[${i}].x,spiralRoute[${i}].z)`);
 await evaluate('walkTo(179.2,13)');await evaluate('walkTo(188,13)');assert.ok(await evaluate('hud.arenaSelf.y>8.7'));await shot('fps-canopy');
 const canopy=await evaluate('({x:hud.x,z:hud.z,y:hud.arenaSelf.y})');assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,lift,canopy,errors},null,2));console.log('PASS: real engine lift boarding, ascent, rooftop exit, return and disembark; full spiral ascent and canopy exit.');
}finally{await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
