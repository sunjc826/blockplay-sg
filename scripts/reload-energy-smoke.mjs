// Vite + isolated Chrome; no paid APIs or persistent profile changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/reload-energy/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [], samples = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/reload-energy.html' });
  const deadline = Date.now() + 60000;
  while (!await evaluate('window.ready')) { assert(Date.now() < deadline, 'fixture startup'); await new Promise(r => setTimeout(r, 100)); }
  const families = await evaluate(`document.querySelector('#family').options.length`);
  for (let family = 0; family < families; family++) for (const empty of [false, true]) {
    await evaluate(`document.querySelector('#empty').checked=${empty};fixture.select(${family})`);
    const start = await evaluate('fixture.setTime(0).pose');
    for (const time of [.035, .12, .225, .47, .52, .62, .654, .70, .7399, .754, .82, .92, ...(empty ? [1.04, 1.185, 1.39] : [])]) {
      const sample = await evaluate(`fixture.setTime(${time})`);
      assert(sample.pose.every(Number.isFinite));
      if (sample.belt) {
        assert(sample.belt.spacingError < 1e-6, 'belt link spacing');
        if (sample.belt.handError !== null) assert(sample.belt.handError < 1e-6, 'hand contact');
      }
      samples.push({ family, empty, time, ...sample });
      if ([.12, .62, .754, 1.185].includes(time)) {
        await fs.writeFile(new URL(`${family}-${empty ? 'empty' : 'tactical'}-${time}.png`, output), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      }
    }
    assert.deepEqual(await evaluate(`fixture.setTime(${empty ? 1.5 : 1}).pose`), start);
    // Reduced motion scales only the cosmetic energy, with the same base pose.
    const baseline = await evaluate(`document.querySelector('#energy').checked=false;fixture.setTime(.12).pose`);
    const full = await evaluate(`document.querySelector('#energy').checked=true;fixture.setTime(.12).pose`);
    const reduced = await evaluate(`document.querySelector('#reduced').checked=true;fixture.setTime(.12).pose`);
    baseline.forEach((value, i) => assert(Math.abs(reduced[i] - value - (full[i] - value) * .25) < 1e-10));
    await evaluate(`document.querySelector('#reduced').checked=false`);
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-result.json', output), JSON.stringify({ passed: true, families, errors, samples }, null, 2));
  console.log(`PASS ${families} weapons, tactical + empty: finite poses, exact return, reduced motion, belt contact; no browser exceptions.`);
} finally {
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
