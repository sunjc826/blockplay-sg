// Loads every district's FPS range in the real game and checks that it gets into play cleanly.
// For each district: open the debug workspace's deep link, enter the range, let it run, then record
// runtime errors, console errors (three reports shader failures there), frame times and a screenshot.
// It does not shoot or move, so it stays valid when gunplay changes; fps-district-smoke covers that.
//
// Needs Vite and a Chrome with remote debugging. On the VM's real GPU start Chrome with
// --use-angle=metal --enable-gpu --ignore-gpu-blocklist; frame times from SwiftShader mean little.
//   FPS_APP_ORIGIN (default http://127.0.0.1:5175)   FPS_CHROME_ORIGIN (default http://127.0.0.1:9228)
//   SWEEP_DISTRICTS=bishan,tuas   SWEEP_TIME=night   SWEEP_SECONDS=4   SWEEP_OUT=.cache/district-sweep
//   SWEEP_SCALE=3 draws at three times the pixel density: frames are capped at the display rate, so comparing
//   the cost of two builds needs a load neither can hold 60 fps under.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const seconds = Number(process.env.SWEEP_SECONDS) || 4, time = process.env.SWEEP_TIME || '', scale = Number(process.env.SWEEP_SCALE) || 1;
const output = new URL(`../${process.env.SWEEP_OUT || '.cache/district-sweep'}/`, import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(); let errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 600));
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 60000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 60000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression).catch(() => false)) return; await delay(200); } throw new Error(`Timed out waiting for ${expression}`); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const results = [], failures = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: scale, mobile: false });
  await wait(`document.readyState==='complete'`);
  const all = await evaluate(`import('/src/game/regions.ts').then(m=>m.REGIONS.map(r=>r.id))`);
  const wanted = process.env.SWEEP_DISTRICTS ? process.env.SWEEP_DISTRICTS.split(',') : all;
  for (const district of wanted) {
    assert(all.includes(district), `unknown district ${district}`);
    errors = [];
    try {
      if (time) await evaluate(`localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({...JSON.parse(localStorage.getItem('blockplay-sg-environment-v1')||'{}'),timeOfDay:${JSON.stringify(time)},weather:'sunny'}))`);
      await send('Page.navigate', { url: `${origin}/debug?tool=fps&district=${district}` });
      await wait(`document.querySelector('.fps-game')?.dataset.mapZone===${JSON.stringify(district)} && ${phase('ready')}`);
      const start = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Enter range');if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      assert(start, 'no Enter range button');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...start, button: 'left', clickCount: 1 });
      // A deployment intro may play first; Space skips it.
      for (let i = 0; i < 40 && !await evaluate(phase('playing')); i++) { if (await evaluate(phase('deploying'))) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space' }); } await delay(500); }
      await wait(phase('playing'), 20000);
      await delay(1500);
      const frames = await evaluate(`new Promise(done=>{const t=[];let last=performance.now();const end=last+${seconds * 1000};const tick=now=>{t.push(now-last);last=now;now<end?requestAnimationFrame(tick):done(t)};requestAnimationFrame(tick)})`);
      const sorted = frames.slice(1).sort((a, b) => a - b), at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
      const canvas = await evaluate(`(()=>{const c=document.querySelector('.fps-viewport canvas');return {width:c.width,height:c.height,lens:c.dataset.lens,viewOcclusion:c.dataset.viewOcclusion}})()`);
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); await fs.writeFile(new URL(`${district}${time ? `-${time}` : ''}.jpg`, output), Buffer.from(shot.data, 'base64'));
      const row = { district, frames: sorted.length, medianMs: +at(.5).toFixed(1), p95Ms: +at(.95).toFixed(1), worstMs: +sorted[sorted.length - 1].toFixed(1), canvas, errors: [...errors] };
      results.push(row); if (errors.length) failures.push(`${district}: ${errors[0]}`);
      console.log(`${errors.length ? 'FAIL' : 'ok  '} ${district.padEnd(18)} median ${String(row.medianMs).padStart(5)} ms  p95 ${String(row.p95Ms).padStart(5)} ms  worst ${String(row.worstMs).padStart(6)} ms${errors.length ? `  ${errors.length} error(s): ${errors[0].slice(0, 160)}` : ''}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    } catch (error) {
      failures.push(`${district}: ${error.message}`); results.push({ district, failed: error.message, errors: [...errors] });
      console.log(`FAIL ${district.padEnd(18)} ${error.message.slice(0, 200)}`);
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }).catch(() => null); if (shot) await fs.writeFile(new URL(`${district}-failure.jpg`, output), Buffer.from(shot.data, 'base64'));
    }
  }
  await fs.writeFile(new URL(`results${time ? `-${time}` : ''}.json`, output), JSON.stringify(results, null, 2));
  assert.deepEqual(failures, []);
  console.log(`PASS: ${results.length} district ranges load into play with no runtime or console errors.`);
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
