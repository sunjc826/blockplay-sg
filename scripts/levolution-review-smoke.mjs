// The Levolution strip on the level review board: opens Tuas in the 3D layout, scrubs and plays the gantry
// collapse, toggles an event and an overlay, and repeats at phone width. Needs Vite and Chrome with remote debugging:
//   LEVOLUTION_APP_ORIGIN=http://127.0.0.1:5197 LEVOLUTION_CHROME_ORIGIN=http://127.0.0.1:9477 node scripts/levolution-review-smoke.mjs
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.LEVOLUTION_APP_ORIGIN??'http://127.0.0.1:5197',chrome=process.env.LEVOLUTION_CHROME_ORIGIN??'http://127.0.0.1:9477',out=process.env.LEVOLUTION_SMOKE_OUTPUT??'.cache/levolution-review';
await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let serial=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async(e,tries=300)=>{for(let i=0;i<tries;i++){if(await ev(`Boolean(${e})`))return;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+e+'\n'+(await ev('document.querySelector(".lr-stage")?.innerText ?? document.body.innerText')).slice(0,600));};
const shot=async name=>fs.writeFile(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const press=text=>ev(`(()=>{const b=[...document.querySelectorAll('.lr-stage button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('No button '+${JSON.stringify(text)});b.scrollIntoView({block:'center'});b.click();})()`);
const stage=()=>ev('document.querySelector(".lr-model-canvas")?.dataset.stage ?? ""'),time=async()=>Number((await stage()).split('/')[1]);
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
try {
  for (const [name,width,height] of [['desktop',1440,1000],['phone',390,844]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:name==='phone'});
    await send('Page.navigate',{url:base+'/debug?review=tuas&view=3d'});
    await wait('document.querySelector(".lr-model-canvas")?.dataset.ready==="true" && document.querySelector(".lr-stage")');
    assert.equal(await ev('[...document.querySelectorAll(".lr-stage-chips button")].map(b=>b.textContent).join()'),'West gantry,East gantry');
    await press('Frame arena');await wait('(document.querySelector(".lr-model-canvas").dataset.stage||"").startsWith("2/0.00")');await shot(name+'-as-built');
    await press('Settled');await wait('Number(document.querySelector(".lr-model-canvas").dataset.stage.split("/")[1])>=15.9');
    assert.match(await ev('document.querySelector(".lr-stage-scrub").textContent'),/Settled/);await shot(name+'-settled');
    // A tick jumps to its moment: the west gantry starts to go at the end of its six-second warning.
    await ev(`[...document.querySelectorAll('.lr-stage-ticks li')].find(li=>li.textContent.includes('stacking-crane-west → falling')).querySelector('button').click()`);
    await wait('document.querySelector(".lr-model-canvas").dataset.stage==="2/6.00"');
    await press('Resume');const started=await time();await new Promise(r=>setTimeout(r,2500));const later=await time();
    assert.ok(later>started+.3,`playing advances the timeline (${started} to ${later})`);await shot(name+'-coming-down');
    await press('Pause');const held=await time();await new Promise(r=>setTimeout(r,600));assert.equal(await time(),held);
    await press('+0.1 s');await wait(`Math.abs(Number(document.querySelector(".lr-model-canvas").dataset.stage.split("/")[1])-${(held+.1).toFixed(2)})<.011`);
    // One event alone: the other half stays as built.
    await press('East gantry');await wait('document.querySelector(".lr-model-canvas").dataset.stage==="1/0.00"');
    await press('Settled');await wait('Number(document.querySelector(".lr-model-canvas").dataset.stage.split("/")[1])>=12.9');
    await ev(`[...document.querySelectorAll('.lr-stage-overlays label')].find(l=>l.textContent.includes('Colliders')).querySelector('input').click()`);
    await new Promise(r=>setTimeout(r,500));await shot(name+'-west-only-colliders');
    await press('As built');await wait('document.querySelector(".lr-model-canvas").dataset.stage==="1/0.00"');
    if(name==='phone')assert.ok(await ev('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),'no sideways scroll on a phone');
  }
  assert.deepEqual(errors,[]);await fs.writeFile(out+'/browser-results.json',JSON.stringify({passed:true,errors},null,2));console.log('Levolution review strip: scrub, play, pause, step, single event and overlays passed at desktop and phone widths.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
