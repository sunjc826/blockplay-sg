import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9348',origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5198';
const output=new URL('../.cache/paratroopers/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/paratroopers.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},90000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try {
 await send('Runtime.enable'); await send('Page.enable');
 const end=Date.now()+60000; while(!await evaluate('typeof window.reviewParatroopers === "function"')){assert(Date.now()<end,'fixture ready');assert.deepEqual(errors,[]);await new Promise(r=>setTimeout(r,200));}
 const results=[];
 for(const [phase,friendly,phone] of [['warning',false,false],['descent',false,false],['landed',false,false],['descent',true,false],['descent',false,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width:phone?390:1200,height:phone?844:800,deviceScaleFactor:1,mobile:phone});
  const r=await evaluate(`window.reviewParatroopers(${JSON.stringify(phase)},${friendly})`);results.push({...r,phone});assert.equal(r.glError,0);assert(r.accepted);
  if(phase==='warning')assert.equal(r.canopies,0);
  if(phase==='descent'){assert.equal(r.canopies,4);assert(r.actors.every(a=>a.parachuting&&a.y>5&&a.shots===0));}
  if(phase==='landed'){assert.equal(r.canopies,0);assert.equal(r.actors.length,4);assert(r.actors.every(a=>!a.parachuting&&a.y<2.3));}
  if(friendly)assert(r.actors.every(a=>a.faction==='armed-forces'));
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${phase}${friendly?'-friendly':''}${phone?'-phone':''}.png`,output),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors},null,2));console.log('PASS five real Queenstown rendered host/guest drops: warning, descent, landing, friendly and portrait.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
