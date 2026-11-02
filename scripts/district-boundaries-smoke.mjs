// Run Vite and an isolated Chrome with remote debugging; this fixture uses the real FPS engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL('../.cache/district-boundaries/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=60000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await delay(200);}throw Error('Waiting for '+expression);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
try{
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/district-boundaries.html'});await wait('window.ready');
  const views={};
  const cases=[['queenstown','east'],['yishun','north'],['chinatown','west'],['orchard','north'],['bukit-timah','north'],['tuas','east'],['punggol','south'],['sentosa','south'],['marina-bay','west']];
  for(const [id,side] of cases) for(const elevated of [false,true]){
    const name=id+'-'+side+(elevated?'-high':'');views[name]=await evaluate(`window.show(${JSON.stringify(id)},${JSON.stringify(side)},${elevated})`);await shot(name);
  }
  for(const [id,side,sample] of [['punggol','south',215],['woodlands','north',0],['raffles-place','north',0]]){const name='coast-'+id;views[name]=await evaluate(`window.show(${JSON.stringify(id)},${JSON.stringify(side)},true,false,${sample})`);await shot(name);}
  for(const id of ['queenstown','yishun','sentosa','punggol','woodlands']){const name='rail-'+id;views[name]=await evaluate(`window.showRail(${JSON.stringify(id)})`);await shot(name);}
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,views,errors},null,2));
  console.log('PASS: twenty-six rendered boundary and rail views without browser exceptions.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
