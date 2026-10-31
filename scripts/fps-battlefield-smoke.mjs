import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5192',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9357';
const output=new URL('../.cache/battlefield-browser/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/battlefield.html'),{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const pending=new Map(),errors=[],results=[];let paidRequests=0;
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&/maps\.googleapis|elevenlabs|\/api\/adventure\/pilot-plan/.test(m.params.request.url))paidRequests++;};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const start=Date.now();while(!await evaluate(expression)){if(Date.now()-start>60000)throw Error('Timeout '+expression);await new Promise(r=>setTimeout(r,100));}};
try{
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await wait('window.ready===true');
 const trials=process.env.BATTLEFIELD_BROWSER_TRIALS?.split(',').map(s=>{const [id,size]=s.split(':');return [id,Number(size)];})||[['queenstown',32],['queenstown',48],['queenstown',64],['marina-bay',32],['raffles-place',32],['raffles-place',48],['raffles-place',64]];
 for(const [id,size] of trials){
  const initial=await evaluate(`loadTrial(${JSON.stringify(id)},${size})`);assert.equal(initial.bots,size);assert.equal(initial.sites.length,7);
  const point=await evaluate(`(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await wait(`window.hud?.phase==='playing'`);
  const result=await evaluate(`measureTrial(${Number(process.env.BATTLEFIELD_BROWSER_SECONDS||10)})`);assert.equal(result.phase,'playing');assert.equal(result.sites,7);assert(result.objectives.length>=3);
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${id}-${size}.png`,output),Buffer.from(shot.data,'base64'));
  results.push({id,size,initial,...result});console.log(JSON.stringify({id,size,...result}));await evaluate('engine.pause()');
 }
 assert.deepEqual(errors,[]);assert.equal(paidRequests,0);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors,paidRequests},null,2));
}catch(error){await fs.writeFile(new URL('failure.json',output),JSON.stringify({errors,results},null,2));throw error;}finally{await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
