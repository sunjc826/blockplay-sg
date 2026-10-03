// Run Vite and an isolated Chrome with --remote-debugging-port=9228.
// The fixture separates rear scenery reflections from the forward aiming view.
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
  await send('Page.navigate', { url: origin + '/scripts/fixtures/reflex-render.html' });
  let readyFrames = 0;
  for (let i = 0; i < 100 && readyFrames < 2; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const ready = await evaluate("window.ready === true && typeof window.show === 'function'").catch(() => false);
    readyFrames = ready ? readyFrames + 1 : 0;
  }
  assert.equal(readyFrames, 2, 'Fixture must finish loading');
  const states = {};
  for (const mode of ['ads', 'partial', 'aligned-hip', 'hip', 'offset', 'beyond-aperture', 'no-buildings', 'turn']) {
    states[mode] = await evaluate(`window.show('${mode}')`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(new URL(mode + '.png', output), Buffer.from(shot.data, 'base64'));
  }
  for (const mode of ['ads', 'partial', 'aligned-hip', 'offset']) {
    assert(states[mode].redPixels >= 6, `${mode}: powered visible dot`);
    assert(Math.abs(states[mode].x - states.ads.x) < 1 && Math.abs(states[mode].y - states.ads.y) < 1, `${mode}: collimated dot stays on the aiming ray`);
  }
  assert(Math.abs(states['aligned-hip'].redPixels - states.ads.redPixels) <= 3, 'Dot keeps its angular size at a different eye distance');
  assert.equal(states.hip.redPixels, 0); assert.equal(states['beyond-aperture'].redPixels, 0);
  const reflected = await evaluate('window.verifyReflections()');
  assert(reflected.inside > 200, 'Rear scenery changes the glass reflection');
  assert.equal(reflected.outside, 0, 'Reflected objects are behind the player, not in the forward scene');
  const bloom = await evaluate('window.verifyBloom()');
  for (const mode of ['ads', 'aligned-hip']) {
    assert(bloom[mode].halo > 60, `${mode}: bloom lights pixels beyond the crisp aiming core`);
    assert.equal(bloom[mode].dimmed, 0, `${mode}: bloom adds light without darkening scenery`);
    assert.equal(bloom[mode].outside, 0, `${mode}: bloom stays local to the aiming dot`);
  }
  assert.equal(bloom['beyond-aperture'].halo, 0, 'Bloom clips with the dot outside the aperture');
  assert.deepEqual(errors, []);
  console.log('PASS: additive holographic bloom, live scenery reflections, constant-size collimated dot before ADS, off-axis clipping and clear forward view');
} finally {
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
