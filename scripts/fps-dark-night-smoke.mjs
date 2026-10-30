// Compare old/new nighttime lighting in the same WebGL calibration yard,
// then review real districts. Vite on 5187 (before) / 5188 (candidate), Chrome
// DevTools on 9228. Both servers need the current vision-render.html fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-dark-night/', import.meta.url);
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
const before = process.env.FPS_BEFORE_ORIGIN || 'http://127.0.0.1:5187';
const after = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5188';
async function sample(device) {
  return evaluate(`(() => {
    const v=window.visionReview;v.draw('${device}',{noise:0});
    const image=v.pixels(),w=image.width,h=image.height;
    const groups={dark:[],lit:[]};
    for(let x=-22;x<=22;x+=2)for(let z=-16;z<=14;z+=2){
      // Skip the three calibration boxes; all samples should be the same grey floor.
      if([[-12,-6],[2,-10],[12,-6]].some(([bx,bz])=>Math.abs(x-bx)<3&&Math.abs(z-bz)<3))continue;
      const point=new v.camera.position.constructor(x,.02,z),p=point.clone().project(v.camera);
      const sx=Math.floor((p.x+1)*w/2),sy=Math.floor((1-p.y)*h/2);
      if(Math.hypot(sx-w/2,sy-h/2)>Math.min(w,h)*.76*.38)continue;
      const strength=v.lights.lightAt(point),group=strength<.001?'dark':strength>.3?'lit':null;
      if(!group)continue;
      let value=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const i=((sy+dy)*w+sx+dx)*4;
        value+=(.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2])/9;
      }
      groups[group].push(value);
    }
    return Object.fromEntries(Object.entries(groups).map(([key,values])=>[key,{count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length}]));
  })()`);
}
try {
  await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
  const measurements={};
  for(const [label,url] of [['before',before],['after',after]]){
    await load(url+'/scripts/fixtures/vision-render.html?yard&device=none');
    const normal=await sample('none');await screenshot(label+'-night-yard');
    const basic=await sample('nvg-gen1');await screenshot(label+'-basic-yard');
    const advanced=await sample('nvg-gen3');await screenshot(label+'-advanced-yard');
    await evaluate("window.visionReview.conditions({timeOfDay:'noon'})");
    const noon=await sample('none');await screenshot(label+'-noon-yard');
    measurements[label]={normal,basic,advanced,noon};
  }
  console.log(JSON.stringify(measurements,null,2));
  const a=measurements.after,b=measurements.before;
  assert(a.normal.dark.count>10&&a.normal.lit.count>10,'samples cover unlit and lamplit ground');
  assert(a.normal.dark.mean<b.normal.dark.mean*.5,'unlit night ground is at least twice as dark');
  assert(a.normal.lit.mean>a.normal.dark.mean*3,'streetlighting keeps strong local contrast');
  assert(a.normal.lit.mean>b.normal.lit.mean*.6,'streetlight pools retain useful brightness');
  assert(a.basic.dark.mean>a.normal.dark.mean*1.2,'basic NVG improves shadow visibility');
  assert(a.advanced.dark.mean>a.basic.dark.mean*1.4,'advanced NVG resolves darker areas better');
  assert(Math.abs(a.noon.dark.mean-b.noon.dark.mean)<5,'daytime floor lighting remains consistent');
  const water = {};
  for(const [label,url] of [['before',before],['after',after]]){
    await load(url+'/scripts/fixtures/vision-render.html?device=none');
    water[label]=await evaluate(`(() => {
      const {data,width:w,height:h}=window.visionReview.pixels();let total=0,n=0;
      for(let y=Math.floor(h*.75);y<h*.9;y++)for(let x=Math.floor(w*.25);x<w*.75;x++){
        const i=(y*w+x)*4;total+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];n++;
      }return total/n;
    })()`);
    await screenshot(label+'-night-water');
  }
  assert(water.after<water.before*.25,'night water loses its fixed daylight brightness');
  measurements.water=water;
  for(const region of ['marina-bay','queenstown','bishan']){
    await load(after+'/scripts/fixtures/vision-render.html?region='+region+'&device=none');
    for(const device of ['none','nvg-gen1','nvg-gen2','nvg-gen3']){
      await evaluate(`window.visionReview.draw('${device}')`);await screenshot(region+'-'+device);
    }
  }
  await load(after+'/scripts/fixtures/vision-render.html?device=none',390,844);
  await screenshot('portrait-night');await evaluate("window.visionReview.draw('nvg-gen3')");await screenshot('portrait-advanced');
  await evaluate("window.visionReview.conditions({timeOfDay:'dusk'})");await screenshot('portrait-dusk');
  await evaluate("window.visionReview.conditions({timeOfDay:'night',weather:'thunderstorm'})");await screenshot('portrait-storm-night');
  assert.deepEqual(errors,[],'no page/shader errors');
  await fs.writeFile(new URL('validation.json',output),JSON.stringify({measurements,errors},null,2));
  console.log('PASS darker shadows, preserved streetlight pools, useful NVG tiers, daytime, three districts and portrait.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
