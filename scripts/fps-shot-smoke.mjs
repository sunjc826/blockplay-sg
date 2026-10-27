// Run Vite and an isolated Chrome with --remote-debugging-port=9234.
// Check subtle shot wakes using actual GPU pixels, including cover and expiry.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9234';
const output = new URL('../.cache/shot-smoke-review/', import.meta.url);
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
  await send('Page.navigate', { url: origin + '/scripts/fixtures/shot-smoke.html' });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    ready = await evaluate('window.ready === true').catch(() => false);
  }
  assert(ready, 'Fixture loads');
  const states = {};
  for (const mode of ['day', 'night', 'reduced', 'occluded']) {
    states[mode] = await evaluate(`window.show('${mode}')`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(new URL(mode + '.png', output), Buffer.from(shot.data, 'base64'));
  }
  assert(states.day.changed > 100, 'Smoke is visible in daylight');
  assert(states.night.changed > 100, 'Smoke is visible against a dark sky');
  assert(states.day.maximum < 45, 'Smoke remains translucent during a burst');
  assert(states.reduced.total < states.day.total * .7, 'Reduced effects soften the wake');
  assert.equal(states.occluded.changed, 0, 'Opaque cover hides the smoke');
  const expired = await evaluate("window.show('day', 1)");
  assert.equal(expired.count, 0); assert.equal(expired.changed, 0);
  assert.deepEqual(errors, [], 'No exceptions or shader errors');
  console.log('PASS: visible, translucent shot smoke by day and night; reduced effects, occlusion, expiry and shaders.', states);
} finally {
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
