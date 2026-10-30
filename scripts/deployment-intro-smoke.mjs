import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.DEPLOYMENT_APP_ORIGIN||'http://127.0.0.1:5193';
const chrome=process.env.DEPLOYMENT_CHROME_ORIGIN||'http://127.0.0.1:9351';
const output=new URL('../.cache/deployment-intro/',import.meta.url);await fs.mkdir(output,{recursive:true});
const url=origin+'/scripts/fixtures/expedition-deployment.html';
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=120000){const t=Date.now();while(Date.now()-t<timeout){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression+' '+JSON.stringify(await evaluate('({phase:document.querySelector(".expedition-game")?.dataset.phase,text:document.body.innerText.slice(0,1000)})')));}
async function touch(expression){const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2,force:1,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
const button=text=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const game='document.querySelector(".expedition-game")';
const points=()=>evaluate('[...document.querySelectorAll("[data-deployment-id]")].map(e=>({id:e.dataset.deploymentId,x:Number(e.dataset.worldX),z:Number(e.dataset.worldZ)}))');
async function screenshot(name){const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(name+'.png',output),Buffer.from(s.data,'base64'));}
try {
 await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await wait(`${game}?.dataset.phase==='ready'`);
 await touch(button('Enter district')); await wait(`${game}.dataset.phase==='deploying'`);
 const start = await evaluate(`({x:${game}.dataset.playerX,z:${game}.dataset.playerZ,health:${game}.dataset.health,point:${game}.dataset.deploymentPoint})`);
 const aerial = await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 assert.ok(aerial.y>60 && aerial.pitch < -1.3,JSON.stringify(aerial));
 assert.equal(await evaluate(`${game}.dataset.arenaStarted`),'false');
 await screenshot('overhead');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
 await wait(`${game}.dataset.phase==='paused'`);
 const paused=await evaluate(`document.querySelector('canvas').dataset.deploymentCamera`);
 await delay(700); assert.equal(await evaluate(`document.querySelector('canvas').dataset.deploymentCamera`),paused);
 assert.equal(await evaluate(`${game}.dataset.arenaStarted`),'false');
 await touch(button('Resume expedition')); await wait(`${game}.dataset.phase==='deploying'`);
 await wait(`document.querySelector('canvas').dataset.deploymentIntro==='ready' && Number(document.querySelector('canvas').dataset.readyAction)>.8`);
 await screenshot('weapon-rack');
 assert.equal(await evaluate(`${game}.dataset.arenaStarted`),'false');
 await wait(`${game}.dataset.phase==='playing'`); await wait(`${game}.dataset.arenaStarted==='true'`);
 const finish=await evaluate(`({x:${game}.dataset.playerX,z:${game}.dataset.playerZ,health:${game}.dataset.health,point:${game}.dataset.deploymentPoint})`);
 assert.deepEqual(finish,start);
 await screenshot('control');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
 await wait(`${game}.dataset.phase==='paused'`);
 await touch(button('Resume expedition')); await wait(`${game}.dataset.phase==='playing'`);
 console.log('PASS: overhead descent, mechanical rack, frozen host, intro pause/resume, and no replay.');
 await send('Page.navigate',{url}); await wait(`${game}?.dataset.phase==='ready'`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await touch(button('Enter district')); await wait(`${game}.dataset.phase==='deploying'`);
 await screenshot('phone');
 await touch(`[...document.querySelectorAll('.expedition-intro-actions button')].find(b=>b.textContent.includes('Skip intro'))`);
 await wait(`${game}.dataset.phase==='playing'`);
 console.log('PASS: phone intro and skip.');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await send('Page.navigate',{url}); await wait(`${game}?.dataset.phase==='ready'`);
 await touch(button('Enter district')); await wait(`${game}.dataset.phase==='deploying'`);
 const reduced=await evaluate(`JSON.parse(document.querySelector('canvas').dataset.deploymentCamera)`);
 assert.ok(reduced.y<2 && reduced.ready!==null,JSON.stringify(reduced));
 await wait(`${game}.dataset.phase==='playing'`);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Page.navigate',{url}); await wait(`${game}?.dataset.phase==='ready'`);
 const click=await evaluate(`(()=>{const b=${button('Enter district')};b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...click});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...click});
 await wait(`${game}.dataset.phase==='deploying' && ${game}.dataset.pointerLocked==='true'`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
 await wait(`${game}.dataset.phase==='playing' && ${game}.dataset.pointerLocked==='true'`);
 console.log('PASS: desktop mouse capture survives intro; Space skips without losing capture.');
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('verification.json',output),JSON.stringify({start,aerial,finish,reduced,errors},null,2));
 console.log('PASS: reduced motion starts at ground level; no runtime errors.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
