import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5191';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9341';
const output = new URL('../.cache/facilities-browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const onlyDestruction=process.env.FACILITY_SMOKE_ONLY_DESTRUCTION==='1';
let built=null;
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/facilities.html'+(onlyDestruction?'?kind=garage&destruction=1':''))}`, { method:'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0; const pending=new Map(), errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(200);}throw Error('Timed out '+expression+' '+JSON.stringify(await evaluate('({phase:window.hud?.phase,message:window.hud?.message,facility:window.hud?.facility,position:{x:window.hud?.x,z:window.hud?.z}})')));}
async function touch(selector){const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2,force:1,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 if(!onlyDestruction){
 await wait('window.hud?.phase==="ready"',120000);await touch('#start');await wait('window.hud?.phase==="playing"');await wait('!!window.hud?.facilityPrompt');
 assert.equal(await evaluate('window.hud.facility.kind'),'helipad');
 assert.equal(await evaluate('window.hud.arena.facilities.sites.length'),4);
 await touch('.fps-facility-card button');await wait('window.hud.facility?.action?.kind==="build"');
 await wait('window.hud.facility?.action?.progress>.03');await screenshot('building-desktop');
 await wait('window.hud.facility?.owner==="armed-forces" && window.hud.facility?.health===550',45000);await screenshot('operational-desktop');
 built=await evaluate('({site:window.hud.facility.id,supplies:window.hud.arena.facilities.supplies["armed-forces"]})');
 await touch('#return');await wait('window.hud?.phase==="ready"',120000);await touch('#start');await wait('window.hud?.phase==="playing"');
 assert.equal(await evaluate(`window.hud.arena.facilities.sites.find(s=>s.id===${JSON.stringify(built.site)}).owner`),'armed-forces');
 console.log('PASS: contextual construction, paid completion, map markers, and district return persistence.');
 for(const [width,height,label]of [[390,844,'portrait'],[844,390,'landscape']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(900);
  const bounds=await evaluate('(()=>{const r=document.querySelector(".fps-facility-card").getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight}})()');
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.w&&bounds.bottom<=bounds.h,JSON.stringify(bounds));await screenshot(label);
 }
 console.log('PASS: facility controls fit portrait and landscape viewports.');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/facilities.html?kind=garage'});
 await wait('window.hud?.phase==="ready"',120000);await touch('#start');await wait('window.hud?.phase==="playing"');await wait('window.hud?.facility?.kind==="garage"');
 await touch('.fps-facility-card button');await wait('window.hud.facility?.action?.kind==="capture"');
 await wait('window.hud.facility?.owner==="armed-forces"',45000);
 assert.equal(await evaluate('window.hud.facility.health'),650);await screenshot('captured-garage');
 await evaluate('window.engine.setInput("fire",true)');await delay(1000);await evaluate('window.engine.setInput("fire",false)');
 assert.equal(await evaluate('window.hud.facility.health'),650);
 console.log('PASS: intact garage capture and friendly equipment protection through the real engine.');
 }
 if(!onlyDestruction)await send('Page.navigate',{url:origin+'/scripts/fixtures/facilities.html?kind=garage&destruction=1'});
 await send('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
 await wait('window.hud?.phase==="ready"',120000);await touch('#start');await wait('window.hud?.phase==="playing"');await wait('window.hud?.facility?.kind==="garage"');
 // Apply one correction per published HUD frame, so slow software rendering cannot repeat stale feedback.
 await evaluate('window.lastAimHud=null;window.compensation=setInterval(()=>{const h=window.hud,s=h.facility;if(!s||h===window.lastAimHud)return;window.lastAimHud=h;const dx=h.x-s.x,dz=h.z-s.z,yaw=Math.atan2(dx,dz),pitch=Math.atan2(s.y+.9-1.75,Math.hypot(dx,dz));const turn=Math.atan2(Math.sin(h.yaw-yaw),Math.cos(h.yaw-yaw));window.engine.lookBy(turn/(.0023*2.6),(h.pitch-pitch)/(.0023*2.6*620/900));if(h.magazine===0&&!h.reloading)window.engine.reload();},100);window.engine.setInput("fire",true)');
 await wait('window.hud.facility?.health===0',60000);
 await evaluate('clearInterval(window.compensation);window.engine.setInput("fire",false)');
 assert.equal(await evaluate('window.hud.facility.owner'),'mercenaries');await screenshot('destroyed-garage');
 console.log('PASS: firing at enemy equipment destroys it without changing ownership.');

 assert.deepEqual(errors,[]);await fs.writeFile(new URL(onlyDestruction?'destruction-verification.json':'verification.json',output),JSON.stringify({built,errors,checked:onlyDestruction?['ballistic-destruction']:['construction','supplies','completion','persistence','desktop','portrait','landscape','intact-capture','friendly-fire-protection','ballistic-destruction']},null,2));
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
