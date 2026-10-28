// Run Vite and an isolated Chrome with remote debugging. No external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9228';
const output=new URL('../.cache/holo-reticle/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/holo-reticle.html`)}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error(`Timeout: ${method}`));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const draw=options=>evaluate(`window.draw(${JSON.stringify(options||{})})`);
try{
  await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
  let ready=false;for(let i=0;i<100;i++){if(await evaluate('window.ready===true')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}
  assert(ready,'fixture loads');
  const centred=await draw();assert(centred.centre>55,'subpixel centre dot remains readable');
  // Include outward ticks: their span is 1.2 times the 68 MOA ring diameter.
  const expected=800*Math.tan(68/120*Math.PI/180)/Math.tan(65/2*Math.PI/180)*1.2;
  assert(Math.abs(centred.maxX-centred.minX+1-expected)<3,'68 MOA angular scale');
  for(const options of [{x:.012},{y:-.008},{distance:.15},{distance:.5}]){
    const moved=await draw(options);
    // Interpolated ray precision may change a color channel by one byte.
    for(const key of ['minX','maxX','minY','maxY'])assert(Math.abs(moved[key]-centred[key])<=1,`stable ${key}: ${JSON.stringify(options)}`);
    assert(Math.abs(moved.count-centred.count)<centred.count*.1,'pattern coverage remains steady');
    assert(moved.centre>55,'centre remains on the aiming axis');
  }
  const clipped=await draw({x:.022});
  assert(clipped.count>0&&clipped.count<centred.count*.8,'window edge reveals a partial hologram');
  assert.equal((await draw({x:.04})).count,0,'no reticle beyond the physical window');
  await draw();assert.equal((await draw()).hash,centred.hash,'no animated grain flicker');
  const zoomed=await draw({fov:27});
  assert(zoomed.maxX-zoomed.minX>2*(centred.maxX-centred.minX),'camera zoom preserves angular scale');
  const highDpi=await draw({width:2400,height:1600});
  assert(Math.abs((highDpi.maxX-highDpi.minX)/(centred.maxX-centred.minX)-2)<.2,'high DPI preserves shape');
  for(const [name,options] of [['centred',{}],['clipped',{x:.022}],['detail',{fov:8}]]){
    await draw(options);const shot=await send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(new URL(`${name}.png`,output),Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(errors,[]);console.log('PASS: hologram angular size, eye translation, eye relief, aperture clipping, stable texture, zoom, high DPI and shader compilation');
  console.log(JSON.stringify({centred,clipped,zoomed,highDpi}));
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
