import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9352',origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5198';
const output=new URL('../.cache/helicopter-tilt/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/helicopter-view.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push({text:m.params.entry.text,url:m.params.entry.url});};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const until=Date.now()+180000;while(!await evaluate(expression)){assert(Date.now()<until,expression);await new Promise(r=>setTimeout(r,150));}};
const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));};
const states=[];
try {
 await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await wait('window.hud?.phase === "ready"');
 const p=await evaluate('(()=>{const r=document.querySelector("#start").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
 await wait('hud.phase === "playing"'); await evaluate('engine.interactVehicle()');
 await wait('hud.vehicle === "helicopter"'); await evaluate('engine.toggleVehicleView()');
 await wait('hud.vehicleView === "first-person"');
 await evaluate('engine.setInput(" ",true)'); await wait('hud.altitude > 12'); await evaluate('engine.setInput(" ",false)');
 for (const [name,dx,steer] of [['left',200,'a'],['right',-400,'d']]) {
   await evaluate(`engine.lookBy(${dx},0);engine.setInput("${steer}",true)`);
   await new Promise(r=>setTimeout(r,550));
   await evaluate(`engine.setInput("${steer}",false);engine.setInput("w",true)`);
   await wait('hud.vehicleSpeed > 25 && hud.vehiclePitch < -.03');
   await new Promise(r=>setTimeout(r,300));
   const state=await evaluate('({yaw:hud.yaw,heading:hud.vehicleHeading,tilt:hud.vehiclePitch,camera:JSON.parse(document.querySelector("canvas").dataset.vehicleCamera),impact:JSON.parse(document.querySelector("canvas").dataset.vehicleImpact)})');
   assert(Math.abs(state.yaw-state.heading)>.2,'side look was retained for regression');
   assert(Math.abs(state.camera.roll)<1e-5,`${name}: forward pitch must not become a bank: ${state.camera.roll}`);
   assert(state.camera.pitch < -.08,`${name}: view tilts forward: ${JSON.stringify(state)}`);
   states.push({name,...state}); await capture(name+'-forward');
   await evaluate('engine.setInput("w",false)'); await wait('hud.vehicleSpeed < 2');
 }
 await evaluate('engine.toggleVehicleView()'); await wait('hud.vehicleView === "third-person"'); await capture('exterior');
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,states,errors},null,2));
 console.log('PASS pilot left/right look and steering followed by forward flight: forward pitch, zero bank, view switching; no runtime/WebGL errors.');
} catch(error) { await capture('failure').catch(()=>{}); console.error({errors}); throw error; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{}); }
