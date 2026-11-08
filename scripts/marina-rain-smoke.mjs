// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9230';
const output=new URL('../.cache/marina-rain/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/weather-quality.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 const results=[];
 for(const weather of ['sunny','monsoon']){
  await load('?district=marina-bay&weather='+weather);
  const check=await evaluate('window.compareWater()');console.log(weather,JSON.stringify(check));results.push({weather,...check});
  assert(check.enabled);assert(check.changed>3000,'Actual scenery is reflected in bay water');assert.equal(check.upper,0);assert(check.restored);
  for(const water of [false,true]){await evaluate(`window.draw({detail:'ultra',water:${water},reflections:true})`);await screenshot(weather+'-water-'+water);}
 }
 await evaluate('window.move(-10,1.3,32,-10,-.1,27)');await evaluate('window.advance()');await screenshot('quay-rail-rain');
 await evaluate('window.move(-10,.65,27,-10,-.24,24)');await evaluate('window.advance()');await screenshot('water-surface-ripples');
 console.log('Water pass cost:',JSON.stringify(await evaluate('window.benchmarkWater()')));
 await evaluate('window.resize(390,844)');await screenshot('portrait-water');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors},null,2));
 console.log('PASS: real Marina bay scene reflections in sunshine and rain, toggle restoration, water ripples and rail review.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
