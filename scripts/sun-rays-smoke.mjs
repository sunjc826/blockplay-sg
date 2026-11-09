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
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await load();const results={hardware:await evaluate('window.hardware'),visual:await evaluate('window.compare()')};
 console.log('Visual',results);
 assert(results.visual.changed>1000,'Visible sun shafts');assert(results.visual.restored,'Off restores exact image');
 for(const quality of ['off','low','high']){const state=await evaluate(`window.draw({quality:'${quality}'})`);assert.equal(state.sceneDraws,1);await screenshot(quality);}
 results.blocked=await evaluate('window.block()');assert.equal(results.blocked.changed,0,'Opaque cover blocks the scattering mask');
 results.gates=await evaluate('window.gates()');for(const state of Object.values(results.gates))assert.equal(state.enabled,false);
 results.benchmarks=[];
 for(const [w,h]of[[1280,720],[1920,1080],[780,1688]]){
  await evaluate(`window.resize(${w},${h})`);
  const measured=await evaluate('window.benchmark(true,true,45)');results.benchmarks.push(measured);console.log('Timing',JSON.stringify(measured));
 }
 await evaluate('window.resize(1920,1080)');results.standalone=await evaluate('window.benchmark(false,false,30)');console.log('Standalone',JSON.stringify(results.standalone));
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await load('?district=marina-bay');await evaluate('window.resize(1920,1080)');
 results.districtVisual=await evaluate('window.compare()');console.log('District visual',JSON.stringify(results.districtVisual));
 for(const quality of ['off','high']){await evaluate(`window.draw({quality:'${quality}'})`);await screenshot('marina-'+quality);}
 results.districtTiming=await evaluate('window.benchmark(true,true,45)');console.log('District timing',JSON.stringify(results.districtTiming));
 results.rayPassTiming=await evaluate('window.passBenchmark()');console.log('Isolated ray passes',JSON.stringify(results.rayPassTiming));
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));console.log('PASS god rays visual, gates, resizing, district and performance checks');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
