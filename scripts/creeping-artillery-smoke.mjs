// Vite + isolated Chrome required; uses the same origins as test:combat-events.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5175',chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9228';
const output=new URL('../.cache/creeping-artillery/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/combat-events.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(`Timeout ${method}`));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 const deadline=Date.now()+60000;while(!await evaluate('typeof window.show === "function"')){assert(Date.now()<deadline,'fixture ready');await new Promise(r=>setTimeout(r,150));}
 const results=[];
 for(const [kind,time,terraced] of [['artillery',2,false],['artillery-creeping',2,false],['artillery-creeping',12,false],['artillery-creeping',16,false],['artillery-creeping',20,false],['artillery-creeping',24,false],['artillery-creeping',2,true]]){
  const r=await evaluate(`window.show(${JSON.stringify(kind)},${time},'high',${terraced})`);assert.equal(r.glError,0);results.push({kind,time,terraced,...r});
  if(kind==='artillery')assert.equal(r.rings.length,1);
  else if(time===2){assert.equal(r.rings.length,3);assert.deepEqual(r.rings.map(m=>m.z),[0,-18,-36]);assert.deepEqual(r.rings.map(m=>m.colour),['#ff4a3a','#f2b84b','#f2b84b']);if(terraced){assert(Math.abs(r.rings[0].y-.12)<.01);assert(Math.abs(r.rings[2].y-6.12)<.01);}}
  else if(time===16){assert.deepEqual(r.rings.map(m=>m.z),[-18,-36]);assert(r.blasts>=3);}
  else if(time===20){assert.deepEqual(r.rings.map(m=>m.z),[-36]);assert(r.blasts>=6);}
  else if(time===24){assert.equal(r.rings.length,0);assert.equal(r.blasts,8);}
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${kind}-${time}${terraced?'-terrace':''}.png`,output),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors,passed:true},null,2));console.log('PASS stationary and moving artillery: warning path, advancing salvos, terrain heights, impacts, cleanup and no WebGL/runtime errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
