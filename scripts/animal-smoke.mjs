// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5186';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9233';
const output = new URL('../.cache/animals/', import.meta.url); await fs.mkdir(output, { recursive: true });
const browser = await (await fetch(`${chrome}/json/version`)).json();
const ws = new WebSocket(browser.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); }); }
const { browserContextId } = await send('Target.createBrowserContext');
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { const start = Date.now(); while (Date.now() - start < 30000) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const kinds=['javan-myna','zebra-dove','community-cat','plantain-squirrel','water-monitor','smooth-coated-otter'];
  const report={models:[],districts:[]};
  async function open(query){await cdp('Page.navigate',{url:origin+'/scripts/fixtures/singapore-animals.html?'+query});await wait('window.ready===true');}
  async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
  for(const kind of kinds){await open('animal='+kind);await delay(150);const stats=await evaluate(`(()=>{const {model,THREE,renderer}=review;const b=new THREE.Box3().setFromObject(model),size=b.getSize(new THREE.Vector3());return {size:size.toArray(),min:b.min.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}})()`);assert(stats.size.every(n=>n>0&&Number.isFinite(n)));await shot(kind);report.models.push({kind,...stats});}
  for(const region of ['queenstown','bishan','upper-thomson','jurong-lake']){
    await open('region='+region+'&freeze=1');
    const result=await evaluate(`({placements:review.world.scene.userData.animalPlacements,audit:review.world.scene.userData.animalSiteAudit})`);
    assert(result.placements.length>0,region);assert(result.audit.every(a=>a.reason==='placed'),region+' rejected a named site');
    console.log(region,JSON.stringify(result));
    for(const site of [...new Set(result.placements.map(p=>p.site))]){await open('region='+region+'&site='+site+'&freeze=1');await delay(150);await shot(region+'-'+site);
      const cost=await evaluate(`(()=>{const {world,renderer,camera}=review,root=world.scene.getObjectByName('Singapore habitat animals');renderer.render(world.scene,camera);const withAnimals={...renderer.info.render};root.visible=false;renderer.render(world.scene,camera);const without={...renderer.info.render};root.visible=true;return {calls:withAnimals.calls-without.calls,triangles:withAnimals.triangles-without.triangles}})()`);
      (result.cost??=[]).push({site,...cost});}
    report.districts.push({region,...result});
  }
  await fs.writeFile(new URL('report.json',output),JSON.stringify(report,null,2));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: six animal models and habitat district views captured.');
}finally{await send('Target.disposeBrowserContext',{browserContextId}).catch(()=>{});ws.close();}
