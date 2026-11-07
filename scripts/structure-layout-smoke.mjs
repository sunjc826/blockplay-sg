// Run Vite and isolated Chrome; validates the fixture without paid API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.STRUCTURE_APP_ORIGIN||'http://127.0.0.1:5311',chrome=process.env.STRUCTURE_CHROME_ORIGIN||'http://127.0.0.1:9497';
const output='.cache/structure-extraction';await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async expression=>{const start=Date.now();while(!await ev(expression)){if(Date.now()-start>60000)throw Error('Timeout '+expression);await new Promise(r=>setTimeout(r,150))}};
const screenshot=async name=>{const image=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${output}/${name}.png`,Buffer.from(image.data,'base64'))};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/structure-layout-proof.html'});await wait('window.ready===true');
 const results=[];
 for(const empty of [false,true,false]){
  const result=await ev(`mountProof(${empty})`);results.push(result);
  assert.equal(result.blocked,!empty);assert.equal(result.rayBlocked,!empty);
  assert.equal(result.addedObstacles,empty?0:1);assert.equal(result.structures,empty?0:1);
  assert.equal(result.facilities,null);assert.equal(result.reinforcements,null);assert.equal(result.actors,1);
  assert.equal(result.facilityAction,false);assert.equal(result.zoneOccupied,true);assert.equal(result.zoneWalkable,true);assert.equal(result.respawned,true);assert.equal(result.resetHasFacilities,false);
  await screenshot(empty?'proof-empty':'proof-alternative');
 }
 assert.deepEqual(await ev('disposeProof()'),{obstacles:0,structures:0});
 assert.deepEqual(await ev('disposeProof()'),{obstacles:0,structures:0});
 assert.deepEqual(errors,[]);await fs.writeFile(`${output}/alternative-browser.json`,JSON.stringify({passed:true,results,errors},null,2));
 console.log('Alternative and empty layouts passed: collision, cover, zone independence, respawn, reset and disposal.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id)}
