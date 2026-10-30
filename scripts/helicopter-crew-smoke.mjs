import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9228',origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5175';
const output=new URL('../.cache/helicopter-crew/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/helicopter-crew.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 const until=Date.now()+60000;while(!await evaluate('typeof window.reviewHelicopter === "function"')){assert(Date.now()<until,'fixture ready');await new Promise(r=>setTimeout(r,150));}
 const results=[];
 for(const [kind,scenario,view] of [['helicopter-raid','intact','front'],['helicopter-raid','intact','side'],['helicopter-raid','rifle','side'],['helicopter-raid','pilot-air','front'],['helicopter-raid','pilot-land','front'],['transport-air','intact','wide'],['transport-air','rifle','side'],['transport-air','pilot-land','front'],['transport-air','depart','front']]){
  const r=await evaluate(`window.reviewHelicopter(${JSON.stringify(kind)},${JSON.stringify(scenario)},${JSON.stringify(view)})`);results.push({...r,view});assert.equal(r.glError,0);assert(r.seatError<.01,'crew follows the exact seat pose');
  if(scenario==='intact'){assert(r.crew.some(a=>a.role==='pilot'&&a.alive));assert.equal(r.rendered,r.crew.filter(a=>a.alive).length);}
  if(scenario==='rifle'){assert(r.crew.some(a=>a.role?.startsWith('door')&&!a.alive));assert(r.crew.some(a=>a.role==='pilot'&&a.alive));assert.equal(r.health,kind==='helicopter-raid'?700:1000);}
  if(scenario==='pilot-air'){assert.equal(r.state,'landing');assert.equal(r.shots,r.stoppedShots);assert.equal(r.foot.length,0);}
  if(scenario==='pilot-land'){assert.equal(r.state,kind==='helicopter-raid'?'landed':'stopped');assert(r.foot.length>=1);assert(r.foot.every(a=>a.y<2));}
  if(scenario==='depart')assert.equal(r.crew.length,0);
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${kind}-${scenario}-${view}.png`,output),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors,passed:true},null,2));console.log('PASS nine helicopter crew scenarios: actual host, validated guest renderer, visible occupants, separate hits, emergency descent/evacuation, departure, exact seats and no WebGL/runtime errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
