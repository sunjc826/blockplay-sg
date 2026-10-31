import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5201',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9251';
const output=new URL('../.cache/command-camps/browser/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/command-camp.html'),{method:'PUT'})).json();
await new Promise(r=>setTimeout(r,1200));
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let serial=0;const pending=new Map(),errors=[],results=[];let paidRequests=0;
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.requestWillBeSent'&&/maps\.googleapis|elevenlabs|\/api\/adventure\/pilot-plan/.test(m.params.request.url))paidRequests++;};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},90000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const start=Date.now();while(true){try{if(await evaluate(expression))return;}catch(e){if(!/navigated|context was destroyed/.test(e.message))throw e;}if(Date.now()-start>60000)throw Error('Timeout '+expression);await new Promise(r=>setTimeout(r,100));}};
const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name,output),Buffer.from(shot.data,'base64'));};
try{
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await wait('window.ready===true');
 for(const side of ['armed-forces','mercenaries']) {
  const initial=await evaluate(`loadTrial('marina-bay',${JSON.stringify(side)})`);
  assert(initial.site.camp.props.some(p=>p.kind==='canopy'));assert(initial.site.camp.props.length>=4);assert(initial.site.camp.patrol.length>=8);
  await screenshot(`marina-${side}-overview.png`);
  await evaluate("viewCamp('ground')");await screenshot(`marina-${side}-ground.png`);
  const positions=await evaluate('advance(65)');
  const initialGuardIds=new Set(positions[0].guards.map(g=>g.id));assert(initialGuardIds.size>0);
  const guards=positions.flatMap(s=>s.guards).filter(g=>initialGuardIds.has(g.id));
  assert(guards.some(g=>Math.hypot(g.x-initial.site.x,g.z-initial.site.z)>18),'guards leave the console');
  assert(new Set(guards.map(g=>`${Math.floor(g.x/8)},${Math.floor(g.z/8)}`)).size>=6,'rear guard visits different ground');
  for(const id of initialGuardIds) {
    const samples=guards.filter(g=>g.id===id);
    assert(samples.some(g=>Math.hypot(g.x-initial.site.x,g.z-initial.site.z)>18),`${id} leaves the center`);
    assert(new Set(samples.map(g=>`${Math.floor(g.x/8)},${Math.floor(g.z/8)}`)).size>=4,`${id} patrols multiple stops`);
  }
  await evaluate("viewCamp('overview')");await screenshot(`marina-${side}-patrol.png`);
  results.push({side,initial,positions});console.log(JSON.stringify({side,sections:initial.site.camp.props.length,stops:initial.site.camp.patrol.length,guardCells:new Set(guards.map(g=>`${Math.floor(g.x/8)},${Math.floor(g.z/8)}`)).size}));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("viewCamp('overview')");await screenshot('marina-mobile.png');
 assert.deepEqual(errors,[]);assert.equal(paidRequests,0);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors,paidRequests},null,2));
}catch(error){await fs.writeFile(new URL('failure.json',output),JSON.stringify({error:error.message,errors,results},null,2));throw error;}finally{await evaluate('window.dispose?.()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
