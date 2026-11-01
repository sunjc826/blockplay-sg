// Run Vite and an isolated Chrome with remote debugging; this fixture uses the real FPS engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL('../.cache/dragon-boats/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=60000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await delay(200);}throw Error('Waiting for '+expression);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
try{
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?gallery'});await wait('window.ready');
  for(const view of ['overview','camp','boat']){await evaluate(`window.show(${JSON.stringify(view)})`);await shot(view);}
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html'});await wait("window.hud?.phase==='ready'");
  const point=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait("window.hud?.phase==='playing'");assert.match(await evaluate('window.hud.interact'),/Red Dragon/);
  await evaluate('window.engine.interactVehicle()');await wait("window.hud?.vehicle==='dragon-boat-red'");
  assert.equal(await evaluate('window.hud.vehicleCanFire'),false);assert.equal(await evaluate('window.hud.vehicleAmmo'),0);await shot('fps-boarded');
  await evaluate("window.engine.setInput('w',true)");await wait('window.hud.z<22',60000);await evaluate("window.engine.setInput('w',false);window.engine.interactVehicle()");
  assert.equal(await evaluate('window.hud.vehicle'),'dragon-boat-red');assert.match(await evaluate('window.hud.vehicleNotice'),/landing/);
  await evaluate("window.engine.setInput(' ',true)");await wait('window.hud.vehicleSpeed<.1');await evaluate("window.engine.setInput(' ',false)");
  const crossing=await evaluate('({x:window.hud.x,z:window.hud.z,speed:window.hud.vehicleSpeed,notice:window.hud.vehicleNotice})');
  await evaluate('window.engine.toggleVehicleView()');await shot('fps-first-person');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);await shot('fps-phone');
  await evaluate('window.engine.switchVehicleSeat()');await wait('window.hud.vehicleSeat===1');assert.equal(await evaluate('window.hud.vehicleSeats[1].label'),'Paddler 1');
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,crossing,errors},null,2));
  console.log('PASS real FPS: jetty prompt, boarding, paddle motion, braking, refused moving exit, cameras, phone HUD and seats; three rendered scene views.');
}finally{try{await evaluate('window.engine?.dispose()');}catch{}ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
