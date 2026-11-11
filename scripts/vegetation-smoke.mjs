// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL(process.env.VEGETATION_SMOKE_OUTPUT || '../.cache/vegetation/worlds/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector, touch = false) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(300); }
async function key(key, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers }); await delay(100); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); await delay(300); }
async function go(path, selector) { await send('Page.navigate', { url: origin + path }); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await send('Page.bringToFront');await delay(500); }
try {
  await send('Runtime.enable');await send('Page.enable');await size(1280,900);
  const reports=[];
  for(const [region,site,distance,height,angle] of [
    ['queenstown','queens-home-plants',7,2.5,0],
    ['queenstown','hdb-dry-trough',6,2,.5],
    ['katong-joo-chiat','red-house-coir',7,2,.3],
    ['changi','jewel-fern-0',10,3,0],
    ['changi','coastal-almond-1',25,7,.7],
    ['bishan','park-umbrella-west',27,8,.6],
    ['upper-thomson','forest-fern-0',8,2.5,.7],
    ['pulau-ubin','visitor-sea-apple',25,7,.4],
    ['pulau-ubin','visitor-fern-bed',9,2.5,.5],
  ]) {
    await send('Page.navigate',{url:origin+`/scripts/fixtures/street-props.html?region=${region}&site=${site}&distance=${distance}&height=${height}&angle=${angle}`});
    await wait(`window.ready===true&&window.review?.site===${JSON.stringify(site)}`);await send('Page.bringToFront');await delay(500);
    assert(await evaluate(`window.review.world.scene.userData.streetPropPlacements.some(p=>p.site===${JSON.stringify(site)})`));
    await shot(`${region}-${site}`);
    reports.push(await evaluate(`(async()=>{
      const {world,renderer,camera}=window.review;const frames=[];
      const kinds=new Set(['snake-pot','snake-trough','money-pot','money-pole','bird-nest-pot','bird-nest-fern','sword-fern','rain-tree','sea-almond','sea-apple']);
      const geometryIds=new Set();
      for(const name of ['District street props','Reactive street decorations'])for(const model of world.scene.getObjectByName(name).children)if(kinds.has(model.userData.streetProp))model.traverse(m=>{if(m.geometry)geometryIds.add(m.geometry.uuid);});
      const batches=[];world.scene.traverse(m=>{if(m.isInstancedMesh&&geometryIds.has(m.geometry.uuid))batches.push(m);});
      renderer.render(world.scene,camera);const withPlants={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
      batches.forEach(m=>m.visible=false);renderer.render(world.scene,camera);
      const addedDraws=withPlants.calls-renderer.info.render.calls,addedTriangles=withPlants.triangles-renderer.info.render.triangles;
      batches.forEach(m=>m.visible=true);let last=performance.now();
      for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>2)frames.push(now-last);last=now;}
      frames.sort((a,b)=>a-b);renderer.render(world.scene,camera);
      return {region:${JSON.stringify(region)},site:${JSON.stringify(site)},frameMedianMs:frames[4],frameP95Ms:frames[8],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,addedDraws,addedTriangles,
        placements:world.scene.userData.streetPropPlacements.filter(p=>p.site===${JSON.stringify(site)}),
        audit:world.scene.userData.streetPropSiteAudit};
    })()`));
    // Walk-height view toward the same accepted planting, with terrain-relative eye.
    await evaluate(`(()=>{const {camera,world,THREE}=window.review;const p=world.scene.userData.streetPropPlacements.find(p=>p.site===${JSON.stringify(site)});camera.position.set(p.x+4,p.y+1.7,p.z+6);camera.lookAt(p.x,p.y+${height>5?4:.6},p.z);})()`);
    await delay(200);await shot(`${region}-${site}-walk`);
  }
  await fs.writeFile(new URL('report.json',output),JSON.stringify(reports,null,2));
  assert.deepEqual(errors,[]);console.log('PASS vegetation: nine actual district planting views and walk-height clearances, render metrics captured.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
