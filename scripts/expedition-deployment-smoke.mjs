import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.DEPLOYMENT_APP_ORIGIN||'http://127.0.0.1:5193';
const chrome=process.env.DEPLOYMENT_CHROME_ORIGIN||'http://127.0.0.1:9351';
const output=new URL('../.cache/aerial-deployment/',import.meta.url);await fs.mkdir(output,{recursive:true});
const url=origin+'/scripts/fixtures/expedition-deployment.html';
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=240000){const t=Date.now();while(Date.now()-t<timeout){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression+' '+JSON.stringify({state:await evaluate('({phase:document.querySelector(".expedition-game")?.dataset.phase,text:document.body.innerText.slice(0,1000)})'),errors}));}
async function touch(expression){const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2,force:1,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
const button=text=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const game='document.querySelector(".expedition-game")';
const points=()=>evaluate('[...document.querySelectorAll("[data-deployment-id]:not(:disabled)")].map(e=>({id:e.dataset.deploymentId,x:Number(e.dataset.worldX),z:Number(e.dataset.worldZ)}))');
async function screenshot(name){const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(name+'.png',output),Buffer.from(s.data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*api.openai.com/*','*api.elevenlabs.io/*','*/api/adventure/*','*maps.googleapis.com/*']});await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',celebration:'none',reducedEffects:false,shadows:false,occlusion:false}));
  localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({bloom:true,frameCap:0}));
 `});
 await send('Page.navigate',{url}); await wait(`${game}?.dataset.phase==='ready'`);const entries=await points();assert.ok(entries.length>=1);assert.equal(await evaluate(`${game}.dataset.deploymentChoice`),'random');
 assert.equal(await evaluate('document.querySelectorAll(".deployment-pins select,.deployment-pins svg").length'),0);
 const before=await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 assert.ok(before.y>150 && before.pitch > -1.3 && before.pitch < -1.1 && before.fov===38);assert.equal(await evaluate(`document.querySelector('canvas').dataset.weaponVisible`),'false');
 assert.equal(await evaluate(`${game}.dataset.arenaStarted`),'false');
 assert(await evaluate('document.querySelectorAll("[data-deployment-id]:disabled").length>0'),'Non-allied locations remain visible and unavailable');
 // Inspect the map itself. HTML pins can remain visible over a black render.
 const litFraction=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2');
  const width=Math.floor(gl.drawingBufferWidth/2),height=Math.floor(gl.drawingBufferHeight/2);
  const pixels=new Uint8Array(width*height*4);
  gl.readPixels(Math.floor(width/2),Math.floor(height/2),width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let lit=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>96)lit++;
  resolve(lit/(width*height));
 }))`);
 assert(litFraction>.25,`The daylight landing map must stay visible with bloom enabled (${litFraction} lit fraction)`);
 // Cursor orbit stays bounded, preserves the long lens and follows native mouse
 // motion. Pins must match the rendered camera between React HUD snapshots.
 await screenshot('desktop-neutral');
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:150,y:220});
 await wait(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).yaw<-.015`);
 await screenshot('desktop-cursor-left');
 const left=await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:560});
 await wait(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).yaw>.015`);
 const right=await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 assert.equal(right.fov,38);assert(Math.abs(right.pitch-left.pitch)<.06);assert(Math.abs(right.yaw-left.yaw)<.075);
 await screenshot('desktop-cursor-right');
 const pinError=await evaluate(`(async()=>{const THREE=await import('/node_modules/three/build/three.module.js');const el=document.querySelector('canvas'),d=JSON.parse(el.dataset.deploymentCamera),camera=new THREE.PerspectiveCamera(d.fov,el.clientWidth/el.clientHeight,.08,10000);camera.position.set(d.x,d.y,d.z);camera.rotation.set(d.pitch,d.yaw,0,'YXZ');camera.updateMatrixWorld(true);return Math.max(...[...document.querySelectorAll('[data-deployment-id]')].map(pin=>{const p=new THREE.Vector3(Number(pin.dataset.worldX),Number(pin.dataset.worldY)+.4,Number(pin.dataset.worldZ)).project(camera);return Math.hypot((parseFloat(pin.style.left)-(p.x+1)*50)*el.clientWidth/100,(parseFloat(pin.style.top)-(1-p.y)*50)*el.clientHeight/100)}))})()`);
 assert(pinError<1,`Pins must track the rendered camera: ${pinError}px`);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:200,y:250});
 await wait(`Math.abs(JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).yaw)<.0001`);
 const reduced=await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1000,y:500});await delay(250);
 assert.deepEqual(await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`),reduced);
 await send('Emulation.setEmulatedMedia',{features:[]});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});

 await touch(`document.querySelector('[aria-label="Zoom in on district"]')`);
 await wait(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).y<${before.y}`);
 await touch(button('View all'));await wait(`Math.abs(JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).y-${before.y})<.1`);
 const surface=await evaluate(`(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();for(const [u,v]of [[.35,.3],[.5,.2],[.7,.3],[.3,.45]]){const x=r.left+r.width*u,y=r.top+r.height*v;if(document.elementFromPoint(x,y)===c)return{x,y}}throw Error('No map pan surface')})()`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...surface,radiusX:2,radiusY:2,force:1,id:9}]});
 await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:surface.x+50,y:surface.y+25,radiusX:2,radiusY:2,force:1,id:9}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(`Math.abs(JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).x-${before.x})>1`);
 await touch(button('View all'));await wait(`Math.abs(JSON.parse(document.querySelector('canvas').dataset.deploymentCamera).x-${before.x})<.1`);
 const chosen=entries.at(-1);
 // A press selects immediately, even if release happens away from the marker.
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 const hit=await evaluate(`(()=>{const r=document.querySelector('[data-deployment-id="${chosen.id}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hit});
 const beforePress=await evaluate(`(()=>{const r=document.querySelector('[data-deployment-id="${chosen.id}"]').getBoundingClientRect();return{x:r.x,y:r.y}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...hit,button:'left',clickCount:1});
 assert.equal(await evaluate(`${game}.dataset.deploymentChoice`),chosen.id,'First press selects before mouse release');
 const duringPress=await evaluate(`(()=>{const r=document.querySelector('[data-deployment-id="${chosen.id}"]').getBoundingClientRect();return{x:r.x,y:r.y}})()`);
 assert(Math.hypot(duringPress.x-beforePress.x,duringPress.y-beforePress.y)<1,'Pressed-button styling must preserve the world anchor');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:200,button:'left',clickCount:1});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});

 await touch(`document.querySelector('[data-deployment-id="${chosen.id}"]')`);
 await wait(`${game}.dataset.deploymentChoice===${JSON.stringify(chosen.id)}`);
 await wait(`Math.hypot(Number(${game}.dataset.playerX)-(${chosen.x}),Number(${game}.dataset.playerZ)-(${chosen.z}))<.1`);
 assert.equal(await evaluate('document.querySelectorAll("canvas").length'),1);await screenshot('desktop-choice');
 await touch(button('Enter district'));await wait(`${game}.dataset.phase==='playing'`);
 assert.equal(await evaluate(`${game}.dataset.deploymentPoint`),chosen.id);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait(`${game}.dataset.phase==='paused'`);
 assert.equal(await evaluate('document.querySelectorAll(".expedition-deployment").length'),0);
 await touch(button('Resume expedition'));await wait(`${game}.dataset.phase==='playing'`);
 assert.equal(await evaluate(`${game}.dataset.deploymentPoint`),chosen.id);
 console.log('PASS: long-lens cursor orbit, reduced motion, frame-synchronous pins, real aerial camera, zoom/reset, world-marker selection, authoritative placement and no redeployment on resume.');
 await send('Page.navigate',{url});await wait(`${game}?.dataset.phase==='ready'`);const randomEntries=await points();
 await touch(button('Enter district'));await wait(`${game}.dataset.phase==='playing'`);
 const randomId=await evaluate(`${game}.dataset.deploymentPoint`);assert.ok(randomEntries.some(p=>p.id===randomId));
 const actual=await evaluate(`({x:Number(${game}.dataset.playerX),z:Number(${game}.dataset.playerZ)})`),selected=randomEntries.find(p=>p.id===randomId);
 assert.ok(Math.hypot(actual.x-selected.x,actual.z-selected.z)<.2);
 console.log('PASS: default random resolves to an approved entry when play starts.');
 await send('Page.navigate',{url});await wait(`${game}?.dataset.phase==='ready'`);
 for(const [width,height,label]of [[390,844,'portrait'],[844,390,'landscape']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(300);
  const r=await evaluate('(()=>{const r=document.querySelector(".deployment-dock").getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom,w:innerWidth,h:innerHeight}})()');
  assert.ok(r.x>=0&&r.right<=r.w&&r.y>=0&&r.bottom<=r.h,JSON.stringify(r));await screenshot(label);
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('verification.json',output),JSON.stringify({entries,chosen,randomId,left,right,pinError,reduced,errors},null,2));
 console.log('PASS: portrait/landscape controls fit; no runtime errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
