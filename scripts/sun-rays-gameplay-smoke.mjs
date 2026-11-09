// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5257';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9457';
const output=new URL('../.cache/sun-rays/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/sun-rays.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const results=[];
 for(const device of ['nvg-gen2','thermal-t2']){
  await send('Page.navigate',{url:origin+'/scripts/fixtures/sun-rays-gameplay.html?device='+device});await wait("window.hud?.phase==='ready'");
  const point=await evaluate("(()=>{const b=document.querySelector('#start').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait("window.hud?.phase==='playing'&&document.querySelector('canvas').dataset.godRays==='true'");
  for(const quality of ['off','high','low']){
   await evaluate(`(()=>{const s=[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith('God rays')).querySelector('select');s.value='${quality}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   await wait(`window.settings().godRays==='${quality}'&&document.querySelector('canvas').dataset.godRays==='${quality!=='off'}'`);
  }
  await screenshot('gameplay-settings-'+device);
  await evaluate("document.querySelector('#settings').style.display='none';window.engine.toggleVision()");
  await wait("document.querySelector('canvas').dataset.godRays==='false'");
  await evaluate('window.engine.toggleVision()');await wait("document.querySelector('canvas').dataset.godRays==='true'");
  await evaluate("window.environment({reducedEffects:true})");await wait("document.querySelector('canvas').dataset.godRays==='false'");
  await evaluate("window.environment({reducedEffects:false,timeOfDay:'night'})");await wait("document.querySelector('canvas').dataset.godRays==='false'");
  results.push({device,qualityControl:true,visionGate:true,reducedGate:true,nightGate:true});await evaluate('window.engine.dispose()');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('gameplay-results.json',output),JSON.stringify(results,null,2));console.log('PASS real FPS god rays controls, NVG/thermal and reduced effects',results);
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
