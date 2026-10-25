// Combat events in a real expedition: a debug truck and helicopter arrive, a
// called-in barrage lands and leaves craters, every other event is called in
// once and must draw and announce itself, and with the AI pilot playing the
// director and reinforcements run unattended. Run a local Vite server and an
// isolated Chrome with --remote-debugging-port=9228, as the other smokes do.
// COMBAT_SMOKE_ONLY=mortar,drone limits the new-event pass to those buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.EXPEDITION_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.EXPEDITION_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const soak = Number(process.env.COMBAT_SMOKE_SOAK || 150);
const output = new URL('../.cache/combat-events-smoke/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
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
/** events / fire / smoke / craters / transports / flyers / raiders / pits / crates / puffs, as the engine writes it. */
const census = async () => (await evaluate(`document.querySelector('canvas')?.dataset.combatEvents ?? ''`)).split('/').map(Number);
const banner = () => evaluate(`document.querySelector('.fps-combat-banner')?.textContent ?? ''`);
const comms = () => evaluate(`[...document.querySelectorAll('.fps-comms-entry')].map(p=>p.textContent)`);
/** Pause, press a debug button, and hand back to the AI pilot. */
async function call(name) {
  // Events that hunt a player need one on their feet.
  await wait(`!document.querySelector('.expedition-respawn')`, 30000);
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

  // Every other event once. Each waits until the earlier ones have cleared enough
  // to make room, then must both draw something and say what it is.
  const only = (process.env.COMBAT_SMOKE_ONLY || '').split(',').filter(Boolean);
  const room = async () => { for (let i = 0; i < 400; i++) { if ((await census())[0] <= 1) return; await delay(500); } };
  const jammed = () => evaluate(`!!document.querySelector('[data-map-jammed]')`);
  const checks = [
    ['Mortar', 'mortar pit', c => c[7] >= 1, /MORTAR/], ['Air raid', 'jets', c => c[5] >= 1, /AIR RAID/],
    ['Gunship', 'raid helicopter', c => c[6] >= 1, /HELICOPTER/], ['Drone', 'drone', c => c[6] >= 1, /DRONE/],
    ['Sniper', null, null, /SNIPER/], ['Tear gas', 'gas cloud', c => c[9] > 0, /GAS/], ['Smoke', 'smoke cloud', c => c[9] > 0, /SMOKE/],
    ['Supply drop', 'cargo plane or crate', c => c[5] + c[8] >= 1, /SUPPLY/], ['Blackout', 'jammed map', null, /JAMM|BLACKOUT/],
  ].filter(([name]) => !only.length || only.includes(name.toLowerCase().replace(' ', '-')) || only.includes(name.toLowerCase()));
  for (const [name, what, drawn, said] of checks) {
    await room(); await call(name);
    let shown = !drawn, heard = '';
    for (let i = 0; i < 70 && !(shown && heard); i++) {
      await delay(500);
      if (drawn && drawn(await census())) shown = true;
      if (name === 'Blackout' && await jammed()) shown = true;
      const text = [await banner(), ...(await comms()).slice(-6)].find(line => said.test(line)); if (text) heard = text;
      if (i === 24) await screenshot(name.toLowerCase().replace(' ', '-'));
    }
    const message = await evaluate(`document.querySelector('.fps-message, .fps-start-card p')?.textContent ?? ''`);
    assert.ok(shown, `${name}: ${what} drawn (census ${await census()}, ${message})`);
    assert.ok(heard, `${name}: announced (${message})`);
    console.log(`${name}: ${heard}`);
  }

  // Unattended: the director's own events, reinforcements for fallen patrols,
  // and transports that bring the district up to the headcount its heat calls for.
  const before = new Set(await comms()), seen = new Set(); let most = garrison;
  for (let t = 0; t < soak; t += 5) { await delay(5000); most = Math.max(most, await bots()); (await comms()).filter(line => /Fire control|Intel/.test(line) && !before.has(line)).forEach(line => seen.add(line)); }
  const lines = [...seen];
  console.log(JSON.stringify({ lines, garrison, most, errors }, null, 2));
  assert.ok(lines.filter(l => !/REINFORCEMENTS/.test(l)).length >= 1, 'the director called an event of its own');
  assert.ok(most > garrison, `transports brought fresh troops in (garrison ${garrison}, most ${most})`);
  assert.deepEqual(errors, []);
  console.log('combat events smoke passed');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {}); }
