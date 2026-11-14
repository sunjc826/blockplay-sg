// Isolated Chrome (default 9369) and Vite (5175). Measures real training entry
// and three kills; guards deferred shader use and whole-world bounds rescans,
// rather than imposing hardware-dependent frame-time thresholds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9369';
const output = new URL('../.cache/hitch-fix/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 120000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 120000) { const at = Date.now(); while (Date.now() - at < timeout) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Timeout: ${expression}`); }
const game = `document.querySelector('.fps-game')`, canvas = `document.querySelector('.fps-viewport canvas')`;
async function touch(selector, hold = 0) {
  const point = await evaluate(`(()=>{const b=${selector};if(!b)throw Error('Missing control');const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  if (hold) await delay(hold);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const button = text => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const reset = () => evaluate(`audit.frames=[];audit.events=[];audit.bounds=[];true`);
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({scale:.85,frameCap:0,shadowDetail:'low',lensEffects:true,sightReflections:false,antialias:true}));
    localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({weather:'sunny',celebration:'none',timeOfDay:'afternoon',reducedEffects:true,shadows:false,occlusion:false}));
    window.audit={frames:[],events:[],bounds:[]};
    const phase=()=>document.querySelector('.fps-game')?.dataset.phase;
    const raf=requestAnimationFrame;
    window.requestAnimationFrame=cb=>raf(t=>{const at=performance.now();try{cb(t)}finally{if(audit.frames.length<30000)audit.frames.push({at,t,ms:performance.now()-at,phase:phase()})}});
    for(const name of ['getProgramInfoLog','linkProgram']){const orig=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){const at=performance.now();const r=orig.apply(this,args);audit.events.push({kind:name,at,ms:performance.now()-at,phase:phase(),weaponVisible:document.querySelector('.fps-viewport canvas')?.dataset.weaponVisible==='true'});return r}}
  ` });
  await send('Page.navigate', { url: origin + '/training' }); await send('Page.bringToFront');
  await wait(`!!${button('Continue to training')}`);
  await touch(button('List'));
  await touch(`[...document.querySelectorAll('.starting-list-items button')].find(b=>b.querySelector('span')?.textContent.startsWith('Marina Bay'))`);
  await touch(button('Continue to training'));
  await wait(`${game}?.dataset.phase==='ready'`);
  const source = await (await fetch(origin + '/src/game/scene-ray-index.ts')).text();
  const threeUrl = /from "([^"]*\/three\.js[^"]*)"/.exec(source)?.[1]; assert(threeUrl, 'Resolved Three module');
  await evaluate(`(async()=>{const T=await import(${JSON.stringify(threeUrl)});const orig=T.Box3.prototype.setFromBufferAttribute;T.Box3.prototype.setFromBufferAttribute=function(a){const at=performance.now(),r=orig.call(this,a);audit.bounds.push({at,ms:performance.now()-at,vertices:a.count,...(audit.bounds.length<3?{stack:new Error().stack}:{})});return r};new MutationObserver(()=>audit.events.push({kind:'kills',at:performance.now(),value:${game}.dataset.rangeEliminations})).observe(${game},{attributes:true,attributeFilter:['data-range-eliminations']})})()`);
  await reset(); await touch(button('Enter range')); await wait(`${game}.dataset.phase==='playing'`); await delay(1000);
  const deployment = await evaluate('structuredClone(audit)');
  await fs.writeFile(new URL('deployment.json', output), JSON.stringify(deployment));
  const kills = [];
  for (let target = 0; target < 3; target++) {
    // Correct the heading from the engine's public diagnostic camera; real touch
    // input retains aim assist, recoil, bullet flight and all reward callbacks.
    for (let step = 0; step < 4; step++) {
      const delta = await evaluate(`(()=>{const c=JSON.parse(${canvas}.dataset.deploymentCamera),t=JSON.parse(${canvas}.dataset.rangeTargets)[${target}];const y=Math.atan2(-(t.x-c.x),-(t.z-c.z)),p=Math.atan2(t.y-c.y,Math.hypot(t.x-c.x,t.z-c.z));return{dx:-Math.atan2(Math.sin(y-c.yaw),Math.cos(y-c.yaw))/.0023/2.6,dy:-(p-c.pitch)/.0023/(2.6*620/900)}})()`);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640, y: 300, id: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 640 + delta.dx, y: 300 + delta.dy, id: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(100);
    }
    await reset(); await touch(`document.querySelector('.touch-fire')`, 900);
    await wait(`Number(${game}.dataset.rangeEliminations)>=${target + 1}`); await delay(500);
    kills.push(await evaluate('structuredClone(audit)'));
  }
  await fs.writeFile(new URL('kills.json', output), JSON.stringify(kills));
  const summary = rows => ({ worstCallbackMs: Math.max(0, ...rows.frames.map(f => f.ms)), boundReads: rows.bounds.length, verticesRead: rows.bounds.reduce((sum, b) => sum + b.vertices, 0), shaderFirstUses: rows.events.filter(e => e.kind === 'getProgramInfoLog'), links: rows.events.filter(e => e.kind === 'linkProgram') });
  const result = { deployment: summary(deployment), kills: kills.map(summary), errors };
  await fs.writeFile(new URL('results.json', output), JSON.stringify(result, null, 2));
  // Keep hardware timing descriptive. Deterministic work counts detect the regression.
  for (const kill of result.kills) assert(kill.verticesRead < 100000, `Unchanged district rescanned: ${kill.verticesRead} vertices`);
  assert.equal(result.deployment.shaderFirstUses.filter(e => e.weaponVisible).length, 0, 'Weapon reveal still initializes shaders on first use');
  assert.equal(result.deployment.links.length, 0, 'Deployment links a new shader');
  assert.deepEqual(errors, []);
  const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL('after-kills.png', output), Buffer.from(shot.data, 'base64'));
  console.log('PASS training deployment and three real dummy kills:', JSON.stringify(result));
} catch (error) { console.error('Browser errors:', errors); throw error; } finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {}); }
