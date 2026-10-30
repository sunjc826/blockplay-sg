// Local GPU checks for fitted optics and laser response through all intensifier tiers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/nv-aiming/', import.meta.url);
await fs.mkdir(output, { recursive:true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method:'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const p = pending.get(message.id);
    if (p) { pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id:n, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function load(url, width=1280, height=760) {
  await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  const start=Date.now();
  while(!await evaluate('!!window.nvAiming?.ready')){
    if(Date.now()-start>60000)throw Error('Fixture did not load');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}


const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5204';
async function measure(options){return evaluate(`(()=>{
 const v=nvAiming,options=${JSON.stringify(options)};
 v.draw({...options,reticle:false,laser:false});const bg=v.pixels();
 const state=v.draw(options),p=v.pixels(),w=p.width,h=p.height,q=v.laserPoint.clone().project(v.camera);
 const laser={x:(q.x+1)*w/2,y:(1-q.y)*h/2};
 let peak=0,core=0,scatter=0,spill=0,laserPeak=0,laserSum=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,l=.2126*p.data[i]+.7152*p.data[i+1]+.0722*p.data[i+2],b=.2126*bg.data[i]+.7152*bg.data[i+1]+.0722*bg.data[i+2],d=Math.max(0,l-b),r=Math.hypot(x+.5-w/2,y+.5-h/2);
  if(r<2)peak=Math.max(peak,d);
  if(r<3)core+=d;
  if(r>=4&&r<24)scatter+=d;
  if(r>=24&&r<40)spill+=d;
  if(Math.hypot(x+.5-laser.x,y+.5-laser.y)<12){laserPeak=Math.max(laserPeak,d);laserSum+=d;}
 }
 return {state,peak,core,scatter,spill,laserPeak,laserSum};
})()`);}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
 await load(origin+'/scripts/fixtures/nv-aiming.html',1200,800);
 const results={};
 for(const optic of ['dot','holo']){
  results[optic]={};
  for(const device of ['none','nvg-gen1','nvg-gen2','nvg-gen3']){
   const off=await measure({device,optic,profile:false,laser:false});
   const on=await measure({device,optic,profile:true,laser:false});results[optic][device]={off,on};
   assert.equal(on.state.glError,0,'live NV framebuffer refresh has no GL errors');
   assert.equal(off.state.glError,0,'baseline frame has no GL errors');
   await screenshot(optic+'-'+device);
   if(device==='none')assert.deepEqual(on,off,'bare-eye optic unchanged');
   else{
    assert(on.peak>25,device+' keeps a visible central aiming point');
    assert(on.core>0,device+' core remains present');
    assert(on.state.reticleProfile===1,'NV setting active');
    assert(on.spill<120,device+' does not wash out the target');
    if(optic==='dot')assert(on.scatter<off.scatter*.75,device+' reduces broad dot scatter');
   }
  }
 }
 results.laser={};
 for(const device of ['none','nvg-gen1','nvg-gen2','nvg-gen3']){
  const off=await measure({device,profile:false,laser:true,reticle:false});
  const on=await measure({device,profile:true,laser:true,reticle:false});results.laser[device]={off,on};
  assert.equal(on.state.glError,0,'laser framebuffer refresh has no GL errors');
  await screenshot('laser-'+device);
  if(device==='none')assert.deepEqual(on,off,'bare-eye laser unchanged');
  else assert(on.laserPeak>off.laserPeak*1.25,device+' laser spot stands out through the tube');
 }
 // Raising/switching off restores the day setting; thermal never enters it.
 for(const [device,state] of [['nvg-gen1',{on:true,mount:.5,warm:1}],['nvg-gen1',{on:false,mount:1,warm:1,fading:1}],['thermal-t2',{on:true,mount:1,warm:1,palette:0,calibrating:0}]]){
  assert.equal(await evaluate(`nvAiming.draw({device:'${device}',state:${JSON.stringify(state)}}).reticleProfile`),0,'NV illumination gated by device and mount');
 }
 await evaluate("nvAiming.draw({device:'nvg-gen1',optic:'holo',noise:.42})");await screenshot('combined-gen1');
 assert.deepEqual(errors,[],'no page or shader errors');
 await fs.writeFile(new URL('validation.json',output),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify(results,null,2));console.log('PASS NV laser response, controlled reticles, normal-light restoration and device gating.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
