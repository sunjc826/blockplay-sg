import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
// Start Vite and an isolated Chrome with remote debugging, as for test:combat-events.
const chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9228',origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5175';
const target=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/transports.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let n=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
for(let i=0;i<150&&!await evaluate('!!window.reviewTransport');i++)await new Promise(r=>setTimeout(r,200));
await fs.mkdir('.cache/transport-review',{recursive:true});const results=[];
for(const [scenario,mode,close]of [['intact','land',false],['intact','land',true],['critical','land',false],['driver','land',false],['wreck','land',false],['intact','air',true],['driver','air',false],['critical','air',false],['wreck','air',false]]){
 const result=await evaluate(`window.reviewTransport(${JSON.stringify(scenario)},${JSON.stringify(mode)},${close})`);results.push(result);
 if(scenario==='critical')assert.equal(result.passengers,mode==='land'?4:3);
 if(scenario==='driver'){assert.equal(result.driverAlive,false);assert.equal(result.passengers,0);assert.equal(result.soldiers,mode==='land'?8:6);}
 if(scenario==='wreck'){assert.equal(result.health,0);assert.equal(result.soldiers,0);}
 const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`.cache/transport-review/${mode}-${scenario}${close?'-cab':''}.png`,Buffer.from(shot.data,'base64'));
}
assert.deepEqual(errors,[]);await fs.writeFile('.cache/transport-review/results.json',JSON.stringify({results,errors},null,2));console.log(`Passed ${results.length} rendered transport scenarios; no runtime errors. Screenshots: .cache/transport-review/`);await send('Page.close');ws.close();
