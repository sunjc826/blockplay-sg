// Compare old/new nighttime lighting in the same WebGL calibration yard,
// then review real districts. Vite on 5187 (before) / 5188 (candidate), Chrome
// DevTools on 9228. Both servers need the current vision-render.html fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-moonlight/', import.meta.url);
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
const before=process.env.FPS_BEFORE_ORIGIN||'http://127.0.0.1:5200',after=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5201';
async function sample(device){return evaluate(`(()=>{
 const v=window.visionReview;v.draw('${device}',{noise:0});const image=v.pixels(),w=image.width,h=image.height;
 const result={};
 for(const [name,x,z] of [['open',0,-14],['roof',-18,-14],['alley',18,-14]]){
  const p=new v.camera.position.constructor(x,.02,z),q=p.clone().project(v.camera),sx=Math.floor((q.x+1)*w/2),sy=Math.floor((1-q.y)*h/2);let luma=0;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const i=((sy+dy)*w+sx+dx)*4;luma+=(.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2])/25;}
  result[name]={luma,exposure:v.atmosphere.exposure?.sample(p)};
 }
 return {...result,bakeMs:v.exposureBakeMs,blockers:v.atmosphere.exposure?.blockerCount};
})()`);}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
 const measurements={};
 for(const [name,origin] of [['before',before],['after',after]]){
  await load(origin+'/scripts/fixtures/vision-render.html?yard&shelter&device=none');
  const normal=await sample('none');await screenshot(name+'-moonlight');
  const basic=await sample('nvg-gen1');await screenshot(name+'-basic');
  const advanced=await sample('nvg-gen3');await screenshot(name+'-advanced');
  await evaluate("window.visionReview.conditions({weather:'thunderstorm'})");const storm=await sample('none');await screenshot(name+'-storm');
  await evaluate("window.visionReview.conditions({weather:'sunny',timeOfDay:'noon'})");const noon=await sample('none');await screenshot(name+'-noon');
  measurements[name]={normal,basic,advanced,storm,noon};
 }
 console.log(JSON.stringify(measurements,null,2));
 const a=measurements.after,b=measurements.before;
 assert(a.normal.open.luma>=20&&a.normal.open.luma<65,'direct moonlight supports navigation while staying visibly nocturnal');
 assert(a.normal.open.luma>b.normal.open.luma*1.7,'open moonlight is meaningfully restored');
 assert(a.normal.roof.luma<a.normal.open.luma*.4,'sheltered space stays much darker than open street');
 assert(a.advanced.roof.luma>a.normal.roof.luma*2,'NVG retains a strong advantage in shelter');
 assert(a.advanced.roof.luma>=8,'sheltered detail still has enough signal for NVG to reveal');
 assert(a.advanced.open.luma>a.normal.open.luma*1.5,'NVG still resolves moonlit surfaces better');
 assert(a.storm.open.luma<a.normal.open.luma*.7,'cloud and rain reduce moonlit visibility');
 assert(Math.abs(a.noon.open.luma-b.noon.open.luma)<3,'daylight remains unchanged');
 await load(after+'/scripts/fixtures/vision-render.html?yard&shelter&people&device=none&cam=0,1.65,8&look=0,1.65,-12');
 await screenshot('eye-level-moonlight');await evaluate("visionReview.draw('nvg-gen3')");await screenshot('eye-level-advanced');
 await evaluate("visionReview.camera.lookAt(-18,1.65,-14);visionReview.camera.updateMatrixWorld();visionReview.draw('none')");await screenshot('eye-level-shelter');
 await evaluate("visionReview.draw('nvg-gen3')");await screenshot('eye-level-shelter-advanced');
 for(const region of ['marina-bay','queenstown','bishan']){
  await load(after+'/scripts/fixtures/vision-render.html?region='+region+'&device=none');
  measurements[region]={bakeMs:await evaluate('visionReview.exposureBakeMs')};
  await screenshot(region+'-moonlight');await evaluate("visionReview.draw('nvg-gen3')");await screenshot(region+'-advanced');
 }
 assert.deepEqual(errors,[],'no page or shader errors');
 await fs.writeFile(new URL('validation.json',output),JSON.stringify({measurements,errors},null,2));
 console.log('PASS usable direct moonlight, dark shelter, NVG advantage, weather contrast and unchanged daylight.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
