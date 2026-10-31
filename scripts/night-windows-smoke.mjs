// Real WebGL pixel checks for facade-aligned windows and authored panes.
// Requires Vite and Chrome DevTools on 9228; no remote reference requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const timeoutMs = Number(process.env.NIGHT_WINDOWS_TIMEOUT_MS || 30000);
const output = new URL('../.cache/night-windows/', import.meta.url);
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
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value || a.description || '').join(' '));
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id:n, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format:'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {width:800,height:800,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/night-windows.html'});
  const start=Date.now();
  while(!await evaluate('!!window.windowReview?.ready')) {
    if(Date.now()-start>timeoutMs*2)throw new Error('window fixture did not load');
    await new Promise(r=>setTimeout(r,100));
  }
  const results=[];
  for(const material of ['standard','lambert','phong']) for(const yaw of [0,.63,1.57]) {
    await evaluate(`window.windowReview.show('box',${yaw},'${material}')`);
    const result=await evaluate(`(() => {
      const {data,width}=window.windowReview.pixels();
      const at=(x,y)=>Math.max(...data.slice((y*width+x)*4,(y*width+x)*4+3));
      // Front face width 11.2 m => three columns, each wholly inset from both edges.
      // Height 17.4 m => four complete storeys within the ground/parapet margins.
      const lit=[],unlit=[];
      for(let col=0;col<3;col++)for(let row=0;row<4;row++){
        const x=Math.round((10-5.6+(col+.5)*11.2/3)*40);
        const worldY=1.3+2.6+(row+.5)*(17.4-3.7)/4;
        lit.push(at(x,Math.round((20-worldY)*40)));
        unlit.push(at(Math.round((10-5.6+(col+.03)*11.2/3)*40),Math.round((20-worldY)*40)));
      }
      return {lit,unlit};
    })()`);
    assert(result.lit.every(v=>v>150),'all complete procedural window centres shine');
    assert(result.unlit.every(v=>v<10),'window columns leave dark edges on the actual facade');
    results.push({material,yaw,...result});
  }
  await screenshot('rotated-procedural');
  for(const material of ['standard','lambert','phong']) {
    await evaluate(`window.windowReview.show('pane',.63,'${material}')`);
    const result=await evaluate(`(() => {
      const {data,width}=window.windowReview.pixels();let low=255,high=0;
      for(let y=330;y<470;y++)for(let x=290;x<510;x++){
        const k=(y*width+x)*4, value=Math.max(data[k],data[k+1],data[k+2]);low=Math.min(low,value);high=Math.max(high,value);
      }
      return {low,high};
    })()`);
    assert(result.low>150 && result.high-result.low<3,'the whole authored pane shines without stripes or a second grid');
    results.push({material,pane:result});
  }
  await screenshot('authored-pane');
  for(const [time,blackout] of [['day',0],['night',1]]) {
    await evaluate(`window.windowReview.draw('${time}',${blackout})`);
    const max=await evaluate(`(() => { const {data,width}=window.windowReview.pixels(); let max=0;for(let y=330;y<470;y++)for(let x=290;x<510;x++){const i=(y*width+x)*4;max=Math.max(max,data[i],data[i+1],data[i+2]);}return max;})()`);
    assert(max<10,`${time}/${blackout}: window emission switches off`);
  }
  // Exercise real authored/batched districts as well as the calibrated facade.
  for(const [region,cam,look,label] of [
    ['queenstown','-73,20,-123','-73,19,-83','queenstown-back'],
    ['queenstown','-73,18,-4','-73,17,-44','queenstown-gallery'],
    ['marina-bay','0,2,18','0,30,-100','marina'],
    ['marina-bay','-15,48,80','151,53,-15','sands-bayfront'],
    ['marina-bay','285,60,65','151,53,-15','sands-rear'],
    ['raffles-place','0,2,18','0,30,-100','raffles'],
  ]) {
    await evaluate('window.visionReview=undefined');
    await send('Page.navigate',{url:`${origin}/scripts/fixtures/vision-render.html?region=${region}&device=none&cam=${cam}&look=${look}`});
    const start=Date.now();
    while(!await evaluate('!!window.visionReview?.ready')) {
      if(Date.now()-start>timeoutMs*2)throw new Error(region+' fixture did not load');
      await new Promise(r=>setTimeout(r,100));
    }
    await evaluate("window.visionReview.draw('none')");
    await screenshot(label);
    if (label.startsWith('sands-')) {
      const bright = () => evaluate(`(() => {
        const {data,width,height}=window.visionReview.pixels(); let count=0;
        for(let y=height*.15|0;y<height*.8;y++)for(let x=width*.2|0;x<width*.8;x++){
          const i=(y*width+x)*4;if(Math.max(data[i],data[i+1],data[i+2])>150)count++;
        }
        return count;
      })()`);
      const on = await bright();
      await evaluate(`(() => {
        window.visionReview.world.scene.traverse(o => {
          if(o.isMesh && o.material?.userData.nightWindow) o.visible=false;
        });
        window.visionReview.draw('none');
      })()`);
      const off = await bright();
      assert(on > off + 500, `${label}: authored tower windows visibly shine at night (${on} vs ${off})`);
      results.push({view:label,on,off});
    }
  }
  assert.deepEqual(errors,[],'no page/shader errors');
  await fs.writeFile(new URL('validation.json',output),JSON.stringify({results,errors},null,2));
  console.log('Night windows: facade bounds, rotated instancing, whole panes, all lit material types, daylight and blackout passed.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
