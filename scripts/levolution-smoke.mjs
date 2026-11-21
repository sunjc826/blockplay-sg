// Plays a real solo Team Deathmatch on Tuas until the clock starts the container yard's Levolution events
// (60% of the way through, by time or score), and checks the warning banner and the changed map. Needs Vite and Chrome with remote
// debugging (software rendering is fine):
//   LEVOLUTION_APP_ORIGIN=http://127.0.0.1:5197 LEVOLUTION_CHROME_ORIGIN=http://127.0.0.1:9477 node scripts/levolution-smoke.mjs
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.LEVOLUTION_APP_ORIGIN??'http://127.0.0.1:5197',chrome=process.env.LEVOLUTION_CHROME_ORIGIN??'http://127.0.0.1:9477',out=process.env.LEVOLUTION_SMOKE_OUTPUT??'.cache/levolution';
await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let serial=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async(e,tries=600)=>{for(let i=0;i<tries;i++){if(await ev(`Boolean(${e})`))return;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+e+'\n'+await ev('document.body.innerText'));};
const shot=async name=>fs.writeFile(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const click=async selector=>{await send('Page.bringToFront');const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
const key=async k=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:k,code:k,windowsVirtualKeyCode:27});};
const stage=()=>ev('document.querySelector(".fps-game canvas")?.dataset.levolution ?? document.querySelector("canvas[data-levolution]")?.dataset.levolution ?? ""');
const banner=()=>ev('[...document.querySelectorAll("*")].filter(e=>!e.children.length).map(e=>e.textContent).find(t=>/GANTRY COMING DOWN/.test(t)) ?? ""');
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({scale:.7,frameCap:30,shadowDetail:'low',lensEffects:false,sightReflections:false,antialias:false}));localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',shadows:false,occlusion:false,reducedEffects:true}));`});
try {
  await send('Page.navigate',{url:base+'/play/team-deathmatch'});await wait('document.querySelector(".starting-picker")');
  await click('[data-start-region="tuas"]');await wait(`document.querySelector('[data-start-region="tuas"]')?.getAttribute('aria-pressed')==='true'`);await click('.starting-deploy');
  await wait('document.querySelector(".fps-game")?.dataset.phase==="ready" && !document.querySelector(".play-loading")');
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start match').dataset.smokeStart='true'`);await click('[data-smoke-start]');await wait('document.querySelector(".fps-game")?.dataset.phase==="playing"');
  await new Promise(r=>setTimeout(r,1500));
  // Nothing in a /play match can start it early, so wait for the clock: 60% of the match by time or by score.
  assert.equal(await stage()||'0/0','0/0');
  await wait('document.querySelector("canvas[data-levolution]")?.dataset.levolution==="2/0"',1500);
  let warned='';for(let i=0;i<40&&!warned;i++){warned=await banner();await new Promise(r=>setTimeout(r,150));}
  assert.match(warned,/(WEST|EAST) GANTRY · GANTRY COMING DOWN · GET CLEAR · \d+s/);await shot('warning');
  await wait('document.querySelector("canvas[data-levolution]")?.dataset.levolution==="2/6"',300);
  await shot('toppled');await new Promise(r=>setTimeout(r,2500));await shot('dust');
  assert.equal(await ev('document.querySelector(".fps-game").dataset.phase'),'playing');
  assert.equal(await banner(),'');
  assert.deepEqual(errors,[]);await fs.writeFile(out+'/browser-results.json',JSON.stringify({passed:true,warned,errors},null,2));console.log('Levolution: warning shown, both gantries and all four stacks down in a live match. '+warned);
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
