// Run Vite and an isolated Chrome with --remote-debugging-port=9228.
// The magnified scope must retain PiP and its etched reticle beneath the coating.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/reflex-review/', import.meta.url);
const depthResults = {};
async function verifyDepth(label) {
  const depth = await evaluate('window.verifyScopeDepth()');
  depthResults[label] = depth;
  for (const [pose, result] of Object.entries(depth)) {
    assert.equal(result.centralMax, 0, label+' '+pose+': central scene and reticle stay pixel-identical');
    assert(result.darkLeft + result.darkRight > 100, label+' '+pose+': alignment visibly shadows the periphery');
  }
  assert(depth.left.darkRight > depth.left.darkLeft * 3, label+': left eye offset shadows the right edge');
  assert(depth.right.darkLeft > depth.right.darkRight * 3, label+': right eye offset shadows the left edge');
  assert(depth.up.darkBottom > depth.up.darkTop * 3, label+': upward offset shadows the bottom edge');
  assert(depth.down.darkTop > depth.down.darkBottom * 3, label+': downward offset shadows the top edge');
  for (const [pose, x, y] of [['centred',0,0],['shifted',.45,.15]]) {
    await evaluate(`window.showScopeDepth(${x},${y})`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(new URL(label+'-depth-'+pose+'.png', output), Buffer.from(shot.data, 'base64'));
  }
}
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const p = pending.get(message.id); if (!p) return;
    pending.delete(message.id); clearTimeout(p.timer);
    message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
  if (message.method === 'Log.entryAdded' && /THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(message.params.entry.text)) errors.push(message.params);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  for (const optic of ['sar-issued','sar-match']) {
    await send('Page.navigate', { url: origin + '/scripts/fixtures/reflex-render.html?optic=' + optic });
    let readyFrames = 0;
    for (let i=0;i<100 && readyFrames<2;i++) {
      await new Promise(resolve=>setTimeout(resolve,250));
      const ready=await evaluate("window.ready===true && typeof window.show==='function'").catch(()=>false);
      readyFrames=ready?readyFrames+1:0;
    }
    assert.equal(readyFrames,2,'Scope fixture loads');
    for(const mode of ['hip','ads','turn']) {
      const state=await evaluate(`window.show('${mode}')`);
      assert.equal(state.coatingVisible,true);
      assert.equal(state.pip,mode!=='hip');
      assert(Math.abs(state.magnification-(optic==='sar-match'?1.75:1.5))<.001);
      const shot=await send('Page.captureScreenshot',{format:'png'});
      await fs.writeFile(new URL(optic+'-'+mode+'.png',output),Buffer.from(shot.data,'base64'));
    }
    const reflected=await evaluate('window.verifyReflections()');
    assert.equal(reflected.outside,0,'Reflection stays inside glass');
    assert(reflected.centre.every(channel=>channel<100),'Etched reticle at the aim point stays dark through the coating');
    const coating=await evaluate('window.verifyScopeCoating()');
    console.log(optic,coating);
    assert.equal(coating.ads.centralMax,0,'ADS centre is unaffected by reflected scenery');
    assert(coating.ads.rimMax>0&&coating.ads.rimMax<35,'ADS keeps only a faint reflected border');
    assert(coating.hip.centralMax>coating.ads.rimMax*3,'Lowered lens has a much stronger reflection');
    assert(coating.hip.changed>20,'Lowered lens visibly reflects scenery');
    assert.equal(coating.ads.outside+coating.hip.outside,0,'Both reflections stay within the lens');
    for(const result of Object.values(await evaluate('window.verifyScopeCoverage()'))) assert.equal(result.missing,0,optic+' reflects through the centre');
    await verifyDepth(optic);
  }
  for(const variant of ['p30-kiasu','mag-lepak','g36-rifle','xm8-sharpshooter','ff-longwatch','ff-intervention','ff-oicw']) {
    await send('Page.navigate',{url:origin+'/scripts/fixtures/reflex-render.html?variant='+variant});
    let ready=false;
    for(let i=0;i<100&&!ready;i++) {
      await new Promise(resolve=>setTimeout(resolve,250));
      ready=await evaluate('window.ready===true').catch(()=>false);
    }
    assert(ready,variant+' fixture loads');
    const coverage=await evaluate('window.verifyScopeCoverage()');
    console.log(variant,coverage);
    for(const [mode,result] of Object.entries(coverage)) {
      assert(result.samples>50);
      assert.equal(result.missing,0,variant+' '+mode+' reflects across the entire inner lens');
    }
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(new URL(variant+'-hip.png',output),Buffer.from(shot.data,'base64'));
    await verifyDepth(variant);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('scope-depth-results.json',output),JSON.stringify(depthResults,null,2));
  console.log('PASS: clear PiP and reticles, directional peripheral shadows and unbroken lowered-lens reflections across nine scope configurations');
} finally {
  ws.close();await fetch(`${chrome}/json/close/${tab.id}`);
}
