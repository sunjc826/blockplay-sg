// How much the grass shimmers at each distance (scripts/fixtures/grass-shimmer.html). Needs Vite and a Chrome with
// remote debugging; SwiftShader will do, since this measures pictures and not frame time.
//   FPS_APP_ORIGIN=http://127.0.0.1:5391 FPS_CHROME_ORIGIN=http://127.0.0.1:9591 node scripts/grass-shimmer-smoke.mjs [label]
// Writes .cache/grass-shimmer/<label>-<detail>.png and <label>.json. GRASS_SHIMMER_MAX (optional) fails the run
// if the 15-28 m band changes by more than that between frames as the camera slides.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5391', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9591';
const label = process.argv[2] || 'run', output = new URL('../.cache/grass-shimmer/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(chrome + '/json/new?about:blank', { method: 'PUT' })).json(), ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
async function wait(expression) { for (let i = 0; i < 600; i++) { if (errors.length) throw Error(errors.join('\n')); if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 250)); } throw Error('Timed out: ' + expression); }
const result = {};
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  for (const view of (process.env.GRASS_SHIMMER_VIEWS || 'high,ultra,high&aa=0').split(',')) {
    await send('Page.navigate', { url: `${origin}/scripts/fixtures/grass-shimmer.html?detail=${view}` }); await wait('window.grassTest?.ready === true');
    const name = view.replace(/[&=]/g, '-');
    await evaluate('grassTest.render(20, 2)');
    const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${label}-${name}.png`, output), Buffer.from(data, 'base64'));
    result[name] = { still: await evaluate('grassTest.measure({ wind: 2 })'), count: await evaluate('grassTest.grass.count') };
    console.log(name, result[name].count, 'instances'); console.table(result[name].still);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL(`${label}.json`, output), JSON.stringify(result, null, 1));
  const limit = Number(process.env.GRASS_SHIMMER_MAX);
  if (limit) assert(result.high.still[2].slide <= limit, `15-28 m changes ${result.high.still[2].slide} a frame as the camera slides; the limit is ${limit}`);
} finally { await send('Target.closeTarget', { targetId: tab.id }).catch(() => {}); ws.close(); }
