// Run Vite and isolated Chrome (headless is supported) with remote debugging.
// Exercise actual movement: a large manually offset fixture alone misses ADS sway suppression.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/scope-strafe/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [], results = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && /Shader Error|THREE.WebGLProgram/.test(m.params.entry.text)) errors.push(m.params.entry.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(method+' timed out')); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id:n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const started = Date.now(); while (Date.now()-started < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error('Timed out: '+expression); }
const canvas = "document.querySelector('#world canvas')";
const read = `({shadow:JSON.parse(${canvas}.dataset.scopeShadow),movement:JSON.parse(${canvas}.dataset.movement),x:window.hud.x,z:window.hud.z,phase:window.hud.phase})`;
/** Furthest horizontal swing over a window, sampled in the page each frame. */
async function swing(ms) { return evaluate(`new Promise(resolve=>{const started=performance.now();let peak=0;(function frame(){const x=JSON.parse(${canvas}.dataset.scopeShadow)?.[0]??0;if(Math.abs(x)>Math.abs(peak))peak=x;performance.now()-started<${ms}?requestAnimationFrame(frame):resolve({peak})})()})`); }
async function shot(name) { const r = await send('Page.captureScreenshot',{format:'png'}); await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64')); }
async function move(key, mobile) { return evaluate(mobile ? `window.engine.setMoveAxis(${key ? JSON.stringify({x:key==='a'?-1:key==='d'?1:0,y:key==='w'?-1:0,magnitude:1}) : 'null'})` : `['a','d','w'].forEach(key=>window.engine.setInput(key,key===${JSON.stringify(key)}))`); }
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  for (const [width,height,mobile,label] of [[1280,800,false,'desktop'],[844,390,true,'touch']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
    for (const weapon of ['ff-longwatch','ff-intervention']) {
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?weapon='+weapon});
      await wait("window.hud?.phase==='ready'",60000);
      await send('Page.bringToFront');
      const point = await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      if (mobile) { await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]}); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
      else { await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1}); await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1}); }
      await wait("window.hud.phase==='playing'"); await evaluate('window.engine.toggleAim()');
      await wait(`window.hud.aimProgress>.999&&${canvas}.dataset.scopeActive==='true'`); await delay(250);
      const idle = await evaluate(read); assert(Math.abs(idle.shadow[0])<.02,'Centred at rest'); await shot(label+'-'+weapon+'-idle');
      const samples = {};
      for (const [key,name,sign] of [['a','left',1],['d','right',-1]]) {
        await move(key,mobile); const start = await swing(900);
        const state = await evaluate(read); assert(state.movement.speed>1.5,'Player actually strafes');
        assert(start.peak*sign>.08,name+' strafe swings the shadow in as it starts: '+start.peak);
        assert(state.shadow[0]*sign>.015&&state.shadow[0]*sign<.08,name+' strafe eases to a slight lean while held: '+state.shadow[0]);
        assert.equal(state.phase,'playing'); samples[name]={...state,peak:start.peak};
        await shot(label+'-'+weapon+'-'+name);
        await move(null,mobile); const stop = await swing(900);
        assert(stop.peak*sign<-.05,'Stopping throws the shadow the other way: '+stop.peak);
        assert(Math.abs((await evaluate(read)).shadow[0])<.02,'Shadow settles after stopping');
      }
      await move('w',mobile); await delay(650); const forward=await evaluate(read);
      assert(Math.abs(forward.shadow[0])<.04,'Forward travel does not create the sideways crescent');
      await move(null,mobile); await delay(650);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await move('d',mobile); await delay(650); const reduced=await evaluate(read);
      assert(Math.abs(reduced.shadow[0])<.02,'Reduced motion suppresses the added strafe cue'); await move(null,mobile);
      results.push({label,weapon,idle,left:samples.left,right:samples.right,forward,reduced});
    }
  }
  assert.deepEqual(errors,[]); await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors},null,2));
  console.log('PASS: actual left/right movement swings opposite scope shadows in on desktop and touch, eases to a lean while held and rebounds on stopping; forward motion and reduced motion remain clear.');
} finally { await evaluate('window.engine?.dispose()').catch(()=>{}); ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
