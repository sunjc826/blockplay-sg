// Run Vite and an isolated Chrome with remote debugging; this fixture uses the real FPS engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL('../.cache/merlion-effects/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
  await send('Page.navigate',{url:origin+'/scripts/fixtures/merlion-effects.html'});await wait('window.ready');
  const views={};
  for(const mode of ['cannon','mist','clear'])for(const view of ['side','operator']){
    const state=await evaluate(`window.show(${JSON.stringify(mode)},${JSON.stringify(view)})`);views[mode+'-'+view]=state;
    await shot(mode+'-'+view);
    const active=state.tags.filter(t=>t.visible);
    assert.equal(active.length,mode==='clear'?0:1);
    if(active.length){assert.equal(active[0].actor,'bot-1');assert.equal(active[0].strength,mode==='cannon'?1:.48);}
    assert.equal(state.mist,mode==='mist');
    assert.ok(Math.hypot(state.impact[0]-state.end.x,state.impact[1]-state.end.y,state.impact[2]-state.end.z)<.2);
  }
  const reactions={};
  for(const mode of ['cannon','mist','clear']){
    const samples=[];
    for(let i=0;i<8;i++){
      const state=await evaluate(`window.show(${JSON.stringify(mode)},'reaction',.25)`);
      samples.push(state.pose);if(i===2||i===5)await shot(mode+'-reaction-'+i);
    }
    const distances=samples.map(p=>Math.hypot(...p.hand.map((v,i)=>v-p.head[i])));
    if(mode==='cannon')assert.ok(distances.slice(2).every(d=>d<.34),'cannon hand shields face');
    if(mode==='mist'){assert.ok(distances.some(d=>d<.34),'mist wipes face');assert.ok(distances.some(d=>d>.4),'mist releases the wipe');}
    if(mode==='clear')assert.ok(distances.at(-1)>.4,'normal weapon hold restored');
    if(mode!=='clear')assert.notDeepEqual(samples[2].headRotation,samples[5].headRotation,'head reaction animates');
    reactions[mode]={samples,distances};
  }
  views.reactions=reactions;
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,views,errors},null,2));
  console.log('PASS: forward cone and cannon conditions drive visible bot status; rear bot stays clear; tags clear on recovery; impact matches host endpoint; cannon shields, mist wipes and normal poses recover.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
