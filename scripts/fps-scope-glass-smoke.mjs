// Run Vite and an isolated Chrome with --remote-debugging-port=9228.
// The magnified scope must retain PiP and its etched crosshair beneath the coating.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/reflex-review/', import.meta.url);
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
    assert(reflected.inside>200,`${optic}: rear scenery reflects in the scope`);
    assert.equal(reflected.outside,0,'Reflection stays inside glass');
    assert(reflected.centre.every(channel=>channel<100),'Etched centre crosshair stays dark through the coating');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: SAR 1.5x and 1.75x PiP, hip coating, actual scenery reflections and clear etched crosshairs');
} finally {
  ws.close();await fetch(`${chrome}/json/close/${tab.id}`);
}
