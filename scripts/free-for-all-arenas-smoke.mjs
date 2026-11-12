import ARENA_CATALOG from '../src/game/arena-catalog.json' with {type:'json'};
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.ARENA_APP_ORIGIN??'http://127.0.0.1:5327',chrome=process.env.ARENA_CHROME_ORIGIN??'http://127.0.0.1:9361',out=process.env.ARENA_SMOKE_OUTPUT??'.cache/ffa-arenas/browser';
await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let serial=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async e=>{for(let i=0;i<600;i++){if(await ev(`Boolean(${e})`))return;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+e+'\n'+await ev('document.body.innerText'));};
const shot=async name=>fs.writeFile(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const click=async selector=>{await send('Page.bringToFront');const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({scale:.7,frameCap:30,shadowDetail:'low',lensEffects:false,sightReflections:false,antialias:false}));localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',shadows:false,occlusion:false,reducedEffects:true}));`});
try {
 for(const id of process.env.ARENA_SKIP_LAYOUTS?[]:Object.keys(ARENA_CATALOG)){await send('Page.navigate',{url:base+'/scripts/fixtures/free-for-all-arenas.html?area='+id});await wait('window.reviewReady');await shot(id+'-layout');}
 for(const region of ['marina-bay','tampines','pulau-ubin'])for(const mode of ['free-for-all']){
  await send('Page.navigate',{url:base+'/play/'+mode});await wait('document.querySelector(".starting-picker")');
  assert.equal(await ev('document.querySelectorAll("[data-start-region]:not([aria-disabled])").length'),Object.keys(ARENA_CATALOG).length);
  await click(`[data-start-region="${region}"]`);await wait(`document.querySelector('[data-start-region="${region}"]')?.getAttribute('aria-pressed')==='true'`);await shot(region+'-'+mode+'-picker');await click('.starting-deploy');
  await wait('document.querySelector(".fps-game")?.dataset.phase==="ready" && !document.querySelector(".play-loading")');
  assert.equal(await ev('document.querySelector(".fps-game").dataset.mapZone'),region);assert.equal(await ev('document.querySelector(".fps-game").dataset.matchMode'),mode);
  await shot(region+'-'+mode+'-ready');
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start match').dataset.smokeStart='true'`);await click('[data-smoke-start]');await wait('document.querySelector(".fps-game")?.dataset.phase==="playing"');
  await new Promise(r=>setTimeout(r,2000));await shot(region+'-'+mode+'-playing');
 }
 await send('Page.navigate',{url:base+'/play/multiplayer/free-for-all'});await wait('document.querySelector(".starting-picker")');assert.equal(await ev('document.querySelectorAll("[data-start-region]:not([aria-disabled])").length'),23);await shot('hosted-picker');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:base+'/play/free-for-all'});await wait('document.querySelector(".starting-picker")');const before=await ev("document.querySelector('.starting-place h2').textContent");await click('[aria-label="Previous arena"]');await wait(`document.querySelector('.starting-place h2')?.textContent!==${JSON.stringify(before)}`);await shot('free-for-all-picker-mobile');assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/browser-results.json',JSON.stringify({passed:true,errors},null,2));console.log('All FFA layouts, 23-region solo/hosted pickers, Marina/Tampines/Ubin gameplay and mobile passed.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
