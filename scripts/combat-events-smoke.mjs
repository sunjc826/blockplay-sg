// Combat events in a real expedition: a debug truck and helicopter arrive, a
// called-in barrage lands and leaves craters, and with the AI pilot playing the
// director and reinforcements run unattended. Run a local Vite server and an
// isolated Chrome with --remote-debugging-port=9228, as the other smokes do.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.EXPEDITION_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.EXPEDITION_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const soak = Number(process.env.COMBAT_SMOKE_SOAK || 150);
const output = new URL('../.cache/combat-events-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const press = name => evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(name)})).click()`);
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
/** events / fire / smoke / craters / transports, as the engine writes it. */
const census = async () => (await evaluate(`document.querySelector('canvas')?.dataset.combatEvents ?? ''`)).split('/').map(Number);
const banner = () => evaluate(`document.querySelector('.fps-combat-banner')?.textContent ?? ''`);
const comms = () => evaluate(`[...document.querySelectorAll('.fps-comms-entry')].map(p=>p.textContent)`);
/** Pause, press a debug button, and hand back to the AI pilot. */
async function call(name) {
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await wait(phase('paused'));
  await press(name); await delay(200); await press('Watch AI play'); await wait(phase('playing'));
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Open world')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Open world').click()`);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Watch AI play') && ${phase('ready')}`, 60000);
  await evaluate(`document.querySelector('canvas').scrollIntoView({block:'center'})`);
  await press('Watch AI play'); await wait(phase('playing'));
  const bots = () => evaluate(`Number(document.querySelector('[data-bot-count]')?.dataset.botCount ?? 0)`), garrison = await bots();

  await call('Truck');
  let truck = 0, notice = '';
  for (let i = 0; i < 40 && !truck; i++) { await delay(500); truck = (await census())[4]; notice ||= await banner(); }
  assert.ok(truck >= 1, 'a debug truck is drawn'); assert.match(notice, /TRUCK INBOUND|DISMOUNTING/);
  await screenshot('truck');

  await call('Helicopter');
  let rotor = 0; for (let i = 0; i < 40 && rotor < 1; i++) { await delay(500); rotor = (await census())[4]; }
  assert.ok(rotor >= 1, 'a debug helicopter is drawn');
  await delay(9000); await screenshot('helicopter');

  await call('Artillery');
  assert.match(await banner(), /ARTILLERY INBOUND/);
  let craters = 0; for (let i = 0; i < 40; i++) { await delay(500); craters = Math.max(craters, (await census())[3]); if (i === 25) await screenshot('artillery'); }
  assert.ok(craters >= 4, `a barrage leaves craters (saw ${craters})`);

  // Unattended: the director's own strikes, reinforcements for fallen patrols,
  // and transports that bring the district up to its contractor headcount.
  const seen = new Set(); let most = garrison;
  for (let t = 0; t < soak; t += 5) { await delay(5000); most = Math.max(most, await bots()); (await comms()).filter(line => /Fire control|Intel/.test(line)).forEach(line => seen.add(line)); }
  const lines = [...seen];
  console.log(JSON.stringify({ lines, garrison, most, errors }, null, 2));
  assert.ok(lines.filter(l => /ARTILLERY/.test(l)).length >= 2, 'the director called a strike of its own');
  assert.ok(most > garrison, `transports brought fresh contractors in (garrison ${garrison}, most ${most})`);
  assert.deepEqual(errors, []);
  console.log('combat events smoke passed');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {}); }
