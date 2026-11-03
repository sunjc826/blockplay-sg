// Requires Vite and Chrome with remote debugging. Uses local scenes; no paid APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9432',origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5267';
const output=new URL('../.cache/proxy-arrivals/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:origin+'/scripts/fixtures/proxy-operations.html'});
 const deadline=Date.now()+60000;
 while(!await evaluate('typeof reviewProxyOperation === "function"')){assert(Date.now()<deadline,'fixture ready');assert.deepEqual(errors,[]);await new Promise(resolve=>setTimeout(resolve,200));}
 const results=[];
 for(const [district,phase,phone] of [['queenstown','warning',false],['queenstown','descent',false],['queenstown','landed',false],['queenstown','withdrawal',false],['marina-bay','descent',false],['orchard','descent',false],['queenstown','descent',true]]){
  await send('Emulation.setDeviceMetricsOverride',{width:phone?390:1200,height:phone?844:800,deviceScaleFactor:1,mobile:phone});
  const r=await evaluate(`reviewProxyOperation(${JSON.stringify(district)},${JSON.stringify(phase)})`);results.push({...r,phone});assert.equal(r.glError,0);assert(r.accepted);
  if(phase==='warning'){assert.equal(r.actors.length,0);assert.equal(r.canopies.length,0);}
  if(phase==='descent'){assert.equal(r.canopies.length,4);assert.equal(r.actors.length,4);assert(r.actors.every(a=>a.parachuting&&a.y>20&&a.shots===0));assert.equal(r.canopies.filter(c=>c==='#d7c8a0').length,2);assert.equal(r.canopies.filter(c=>c==='#75968a').length,2);}
  if(phase==='landed'){assert.equal(r.canopies.length,0);assert.equal(r.actors.length,4);assert(r.actors.every(a=>a.alive&&!a.parachuting));}
  if(phase==='withdrawal'){assert.equal(r.operation,'withdrawing');assert(r.actors.some(a=>a.alive&&a.objective==='Withdraw'));}
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${district}-${phase}${phone?'-phone':''}.png`,output),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('browser-results.json',output),JSON.stringify({passed:true,results,errors},null,2));console.log('PASS: real district host/guest cargo warning, colored parachute arrivals, landing, withdrawal and portrait rendering.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
