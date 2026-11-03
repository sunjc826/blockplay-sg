import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5198', chrome=process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9348';
const output=new URL('../.cache/beam-hover/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*api.openai.com/*','*api.elevenlabs.io/*','*/api/adventure/*','*maps.googleapis.com/*']});await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',celebration:'none',reducedEffects:false,shadows:false,occlusion:false}))`});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/player-respawn-panel.html?initial=1'});await wait('window.hud?.phase==="ready"',180000);
 await wait('document.querySelectorAll("[data-deployment-id]").length>0');await screenshot('rest');
 async function hover(available){
  const candidates=await evaluate(`(async()=>{const THREE=await import('/node_modules/three/build/three.module.js');const el=document.querySelector('canvas'),r=el.getBoundingClientRect(),d=JSON.parse(el.dataset.deploymentCamera),camera=new THREE.PerspectiveCamera(d.fov,el.clientWidth/el.clientHeight,d.near??.08,d.far??10000);camera.position.set(d.x,d.y,d.z);camera.rotation.set(d.pitch,d.yaw,0,'YXZ');camera.updateMatrixWorld(true);return hud.deployment.points.filter(p=>(p.available!==false)===${available}).map(p=>{const v=new THREE.Vector3(p.x,(p.y??0)+130,p.z).project(camera);return{id:p.id,x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2}}).filter(p=>p.x>80&&p.x<innerWidth-80&&p.y>160&&p.y<innerHeight-200&&document.elementFromPoint(p.x,p.y)===el)})()`);
  for(const p of candidates){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await delay(400);if(await evaluate(`document.querySelector('canvas').dataset.deploymentHover===${JSON.stringify(p.id)}`))return p;}
  throw Error('No pickable '+(available?'available':'unavailable')+' sky beam: '+JSON.stringify(candidates));
 }
 const locked=await hover(false);assert(await evaluate(`document.querySelector('[data-deployment-id="${locked.id}"]').disabled`));await screenshot('unavailable-hover');
 const choice=await evaluate('hud.deployment.choice');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:locked.x,y:locked.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:locked.x,y:locked.y,button:'left',clickCount:1});
 assert.equal(await evaluate('hud.deployment.choice'),choice,'Hover does not unlock an unavailable location');
 const available=await hover(true);await screenshot('available-hover');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:available.x,y:available.y,button:'left',clickCount:1});
 assert.equal(await evaluate('hud.deployment.choice'),available.id,'The sky portion of a beam selects on the first press');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:available.x,y:available.y,button:'left',clickCount:1});await delay(400);await screenshot('selected-hover');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:30,y:200});await wait('document.querySelector("canvas").dataset.deploymentHover===""');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('verification.json',output),JSON.stringify({passed:true,locked,available,errors,checks:['hover actual sky column','unavailable grey highlight remains disabled','available cyan highlight','selected gold highlight','sky column selects on first press','hover clears on exit']},null,2));
 console.log('PASS real 3D beam hover, unavailable protection, selected highlight, first-press sky selection and hover exit.');
}catch(error){console.error(errors);await screenshot('failure').catch(()=>{});throw error;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
