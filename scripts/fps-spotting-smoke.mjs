// Run Vite and an isolated Chrome first. The fixture uses the real authority,
// rendered cover and character rigs, with accelerated simulation ticks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5207',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9367';
const output=new URL('../.cache/gradual-spotting/browser/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/spotting.html'),{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];let paidRequests=0;
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&/maps\.googleapis|elevenlabs|\/api\/adventure\/pilot-plan/.test(m.params.request.url))paidRequests++;};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const results=[];const trial=async(name,options)=>{const result=await evaluate('runTrial('+JSON.stringify(options)+')');results.push({name,...result});const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));return result;};
try{
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 const until=Date.now()+60000;while(!await evaluate('window.ready===true')){assert(Date.now()<until,'Fixture did not load');await new Promise(r=>setTimeout(r,150));}
 const near=await trial('near',{distance:25}),far=await trial('far',{distance:150}),moving=await trial('moving',{speed:4.2});
 const crouch=await trial('crouch',{crouch:true}),prone=await trial('prone',{prone:true});
 const bare=await trial('flash',{firing:true}),suppressed=await trial('suppressed',{firing:true,muzzle:'suppressor'});
 const hidden=await trial('occluded',{firing:true,occluded:true});
 assert(far.firstShot>near.firstShot+2);assert(moving.firstShot<far.firstShot-.5);assert(crouch.firstShot>far.firstShot+1);assert(prone.firstShot>crouch.firstShot+2);
 assert(bare.firstShot<suppressed.firstShot);assert(suppressed.firstShot<far.firstShot);assert.equal(hidden.firstShot,null);
 const mission=await trial('capture-under-fire',{mission:true,harassment:true});assert.equal(mission.owner,'mercenaries');assert(mission.bot.z<10);assert(mission.bot.shots>0);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await trial('portrait-capture',{mission:true});
 assert.deepEqual(errors,[]);assert.equal(paidRequests,0);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors,paidRequests},null,2));
 console.log('PASS rendered authority: distance, movement, crouch/prone, muzzle signatures, solid cover, capture under harassment, portrait; no runtime errors or paid requests.');
}catch(error){await fs.writeFile(new URL('failure.json',output),JSON.stringify({errors,results},null,2));throw error;}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
