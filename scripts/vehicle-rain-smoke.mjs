// Bounded browser fixture using the actual vehicle models and world atmosphere.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5193';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9243';
const output = new URL('../.cache/vehicle-rain/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/vehicle-rain.html`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && m.params.entry.source === 'rendering') errors.push(m.params.entry.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 60000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 740, deviceScaleFactor: 1, mobile: false });
  const deadline = Date.now() + 60000;
  while (!await evaluate('window.ready === true')) { if (Date.now() > deadline) throw Error('Fixture did not become ready'); await new Promise(r => setTimeout(r, 100)); }
  const results = [];
  for (const [view, moving, reduced] of [['outside', true, false], ['driver', true, false], ['pilot', true, false], ['outside', false, false], ['outside', true, true]]) {
    const result = await evaluate(`window.show(${JSON.stringify(view)},${moving},${reduced})`);
    assert(result.counts.splashes > 0); assert(result.roughness < .51);
    assert.equal(result.sheltered, view !== 'outside');
    assert(result.counts.drops <= (reduced ? 225 : 1200));
    if (process.env.FPS_SCREENSHOTS !== '0') {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(new URL(`${view}-${moving ? 'moving' : 'parked'}-${reduced ? 'reduced' : 'full'}.png`, output), Buffer.from(shot.data, 'base64'));
    }
    results.push(result); console.log(JSON.stringify(result));
  }
  assert.deepEqual(errors, []); await fs.writeFile(new URL('results.json', output), JSON.stringify({ results, errors }, null, 2));
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
