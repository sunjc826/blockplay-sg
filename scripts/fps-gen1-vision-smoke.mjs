// Compare Gen 1 shadow readability with a baseline Vite server and Chrome CDP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-gen1-vision/', import.meta.url);
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
  while(!await evaluate('!!window.visionReview?.ready')){
    if(Date.now()-start>60000)throw Error('Fixture did not load');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}

const before=process.env.FPS_BEFORE_ORIGIN||'http://127.0.0.1:5201';
const after=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5203';
async function patch(device) {
 return evaluate(`(()=>{
  const v=visionReview, point=new v.camera.position.constructor(-18,.02,-14), q=point.project(v.camera);
  v.draw('${device}',{noise:0});const ideal=v.pixels(),w=ideal.width,h=ideal.height;
  v.draw('${device}');const actual=v.pixels();
  const sx=Math.floor((q.x+1)*w/2),sy=Math.floor((1-q.y)*h/2);let signal=0,squaredError=0,count=0;
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
   const i=((sy+dy)*w+sx+dx)*4;
   const a=ideal.data[i+1],b=actual.data[i+1];
   // Rare photocathode flashes are separate from the sustained grain floor.
   if(b-a>80)continue;
   signal+=a;squaredError+=(a-b)**2;count++;
  }
  return {signal:signal/count,noise:Math.sqrt(squaredError/count),count};
 })()`);
}
try {
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
 const results={};
 for(const [name,origin] of [['before',before],['after',after]]) {
  await load(origin+'/scripts/fixtures/vision-render.html?yard&shelter&people&device=none');
  results[name]={};
  for(const device of ['none','nvg-gen1','nvg-gen2','nvg-gen3'])results[name][device]=await patch(device);
  await load(origin+'/scripts/fixtures/vision-render.html?yard&shelter&people&device=nvg-gen1&cam=-18,1.65,7&look=-18,1.65,-14');
  await screenshot(name+'-gen1-shelter');
  if(name==='after') {
   await evaluate("visionReview.draw('none')");await screenshot('unaided-shelter');
   await evaluate("visionReview.draw('nvg-gen2')");await screenshot('gen2-shelter');
   await evaluate("visionReview.draw('nvg-gen3')");await screenshot('gen3-shelter');
   await load(origin+'/scripts/fixtures/vision-render.html?region=queenstown&device=nvg-gen1');await screenshot('gen1-queenstown');
   await load(origin+'/scripts/fixtures/vision-render.html?region=marina-bay&device=nvg-gen1');await screenshot('gen1-marina');
  }
 }
 console.log(JSON.stringify(results,null,2));
 const a=results.after,b=results.before;
 assert(a['nvg-gen1'].signal>b['nvg-gen1'].signal*1.2,'Gen 1 reveals more sheltered detail');
 assert(a['nvg-gen1'].signal>a.none.signal*3,'Gen 1 has useful amplification over bare eyes');
 assert(a['nvg-gen1'].noise<b['nvg-gen1'].noise*.6,'grain no longer overwhelms shadow signal');
 assert(a['nvg-gen1'].noise<a['nvg-gen1'].signal*.5,'faint detail stays above sustained noise');
 assert(a['nvg-gen2'].signal>a['nvg-gen1'].signal,'Gen 2 retains better low-light reach');
 assert(a['nvg-gen3'].signal>a['nvg-gen2'].signal,'Gen 3 retains best low-light reach');
 assert.equal(a.none.signal,b.none.signal,'bare-eye lighting is unchanged');
 assert.deepEqual(errors,[],'no runtime or shader errors');
 await fs.writeFile(new URL('validation.json',output),JSON.stringify({results,errors},null,2));
 console.log('PASS Gen 1 sheltered detail, signal above grain, stronger higher tiers and unchanged unaided lighting.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
