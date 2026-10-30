// Real WebGL pixel checks for the three circular NVG lenses. Same Vite/Chrome
// prerequisites as fps-lens-vision-smoke.mjs; no remote reference requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-night-vision/', import.meta.url);
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
async function load(width, height, chart) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false });
  await send('Page.navigate', { url:`${origin}/scripts/fixtures/vision-render.html${chart ? '?chart' : ''}` });
  const start = Date.now();
  while (!await evaluate('!!window.visionReview?.ready')) {
    if (Date.now() - start > 60000) throw new Error('Fixture did not load');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  // The chart stays lit right up to the aperture; measure its actual pixel mask,
  // including all four margins, rather than trusting shader uniforms.
  for (const [width, height] of [[1280, 760], [390, 844], [844, 390], [1920, 800]]) {
    await load(width, height, true);
    let previous = 0;
    for (const [index, aperture] of [.76, .88, .98].entries()) {
      const device = `nvg-gen${index + 1}`;
      const result = await evaluate(`(() => {
        const v=window.visionReview; v.draw('${device}', {noise:0});
        const {data,width:w,height:h}=v.pixels();
        let minX=w,minY=h,maxX=-1,maxY=-1,count=0,leaks=0;
        const radius=${aperture}*Math.min(w,h)/2;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4,lit=Math.max(data[i],data[i+1],data[i+2])>2;
          if(lit){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;
            if(Math.hypot(x+.5-w/2,y+.5-h/2)>radius+1)leaks++;}
        }
        return {diameterX:maxX-minX+1,diameterY:maxY-minY+1,minX,minY,count,leaks};
      })()`);
      assert(Math.abs(result.diameterX - result.diameterY) <= 2, `${device}: circular at ${width}x${height}`);
      assert(Math.abs(result.diameterX - aperture * Math.min(width, height)) <= 4, `${device}: correct radius`);
      assert(result.minX > 0 && result.minY > 0, `${device}: complete rim visible`);
      assert.equal(result.leaks, 0, `${device}: black outside the lens`);
      assert(result.count > previous, `${device}: higher tier sees more`); previous = result.count;
      await screenshot(`${width}x${height}-${device}-chart`);
    }
    console.log(`PASS ${width}x${height}: all three circles, increasing view, complete rims, no picture leakage.`);
  }
  await load(1280, 760, true);
  const refraction = await evaluate(`(() => {
    const v=window.visionReview, results=[];
    for(const id of ['nvg-gen1','nvg-gen2','nvg-gen3']){
      v.draw(id,{noise:0,distortion:0}); const a=v.pixels();
      v.draw(id,{noise:0}); const b=v.pixels();
      let centre=0,edge=0,nc=0,ne=0;
      const radius=({ 'nvg-gen1':.76,'nvg-gen2':.88,'nvg-gen3':.98 })[id]*Math.min(a.width,a.height)/2;
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
        const r=Math.hypot(x+.5-a.width/2,y+.5-a.height/2)/radius,i=(y*a.width+x)*4;
        const d=Math.abs(a.data[i+1]-b.data[i+1]);
        if(r<.3){centre+=d;nc++;}if(r>.75&&r<.95){edge+=d;ne++;}
      }
      results.push({id,centre:centre/nc,edge:edge/ne});
    }
    return results;
  })()`);
  for (const result of refraction) {
    assert(result.edge > 1, `${result.id}: refraction changes actual edge pixels`);
    assert(result.edge > result.centre * 4, `${result.id}: refraction stays peripheral`);
  }
  console.log('PASS peripheral refraction:', refraction);
  await load(1280, 760, false);
  for (const device of ['nvg-gen1', 'nvg-gen2', 'nvg-gen3']) {
    await evaluate(`window.visionReview.draw('${device}')`); await screenshot(device);
  }
  // The same renderer still compiles/presents both thermal cores after the NVG changes.
  for (const device of ['thermal-t1', 'thermal-t2']) {
    await evaluate(`window.visionReview.draw('${device}')`); await screenshot(device);
  }
  assert.deepEqual(errors, [], 'no page or shader errors');
  await fs.writeFile(new URL('validation.json', output), JSON.stringify({ refraction, errors }, null, 2));
  console.log(`PASS city views and thermal regressions. Screenshots in ${output.pathname}`);
} finally {
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
}
