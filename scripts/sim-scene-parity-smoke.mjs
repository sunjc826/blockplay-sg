// Does the simulation worker's own copy of a district stand as the same cover as the drawn one?
//
// With the worker switch on (development only; see src/game/sim-remote.ts) bots see and shoot through the
// worker's copy while the player looks at the engine's. This holds the simulation still, asks both copies the
// same sight and bullet rays, and compares what each counts as cover part by part. It does so soon after the
// match starts and again later, so something the engine adds or moves mid-match is caught as well.
//
//   FPS_APP_ORIGIN       Vite dev server (default http://127.0.0.1:5192)
//   FPS_CHROME_ORIGIN    Chrome remote debugging (default http://127.0.0.1:9357)
//   PARITY_DISTRICTS     comma-separated zone ids (default: every world zone)
//   PARITY_SECONDS       play time between the two looks (default 30)
import assert from 'node:assert/strict';
import http from 'node:http';

const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5192', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9357';
const seconds = Number(process.env.PARITY_SECONDS || 30);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// An explicit agent: with a proxy in the environment, Node's default one sends loopback requests to it.
const request = (url, method = 'GET') => new Promise((resolve, reject) => {
  const q = http.request(url, { method, agent: new http.Agent() }, r => { let body = ''; r.on('data', d => body += d); r.on('end', () => resolve(body)); });
  q.on('error', reject); q.end();
});
const tab = JSON.parse(await request(chrome + '/json/new?about:blank', 'PUT'));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { const p = pending.get(message.id); if (p) { pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(Error(message.error.message)) : p.resolve(message.result); } }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error('Timeout ' + method)); }, 180000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = async (expression, limit = 120000) => { const start = Date.now(); while (!await evaluate(expression)) { if (Date.now() - start > limit) throw Error('Timeout ' + expression + ' ' + errors.join(' | ').slice(0, 1500)); await delay(200); } };

// Every living actor's line to every other, and a fan of rays from each: where bots look and shoot.
const look = `(async () => {
  const actors = hud.arena.actors.filter(a => a.alive), rays = []; let seed = 7; const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (const a of actors) for (const b of actors) if (a !== b) { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz); if (l > 1) rays.push({ origin: { x: a.x, y: a.y, z: a.z }, direction: { x: dx / l, y: dy / l, z: dz / l }, range: l }); }
  for (const a of actors) for (let i = 0; i < 24; i++) { const t = random() * Math.PI * 2, p = (random() - .6) * .5; rays.push({ origin: { x: a.x, y: a.y, z: a.z }, direction: { x: Math.cos(t) * Math.cos(p), y: Math.sin(p), z: Math.sin(t) * Math.cos(p) }, range: 150 }); }
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  // Held still, the engine draws the simulation's last state within a frame or two; then both copies stand at one instant.
  let main, worker, tries = 0; blockplaySimRun(false);
  try { do { await new Promise(resolve => setTimeout(resolve, 150)); await frame(); await frame(); main = blockplayMainCover(rays); worker = await blockplaySimCover(rays); } while (worker.elapsed !== main.elapsed && ++tries < 20); }
  finally { blockplaySimRun(true); }
  const out = { elapsed: main.elapsed, sameInstant: worker.elapsed === main.elapsed, rays: rays.length, differ: 0, examples: [], census: {} };
  for (let i = 0; i < rays.length; i++) if (Math.abs(main.sight[i] - worker.sight[i]) > .05 || Math.abs(main.bullet[i] - worker.bullet[i]) > .05) {
    out.differ++; if (out.examples.length < 5) out.examples.push({ drawn: +main.sight[i].toFixed(2), worker: +worker.sight[i].toFixed(2), drawnStruck: main.struck[i], workerStruck: worker.struck[i] });
  }
  for (const part of new Set([...Object.keys(main.census), ...Object.keys(worker.census)])) { const a = main.census[part] || [0, 0], b = worker.census[part] || [0, 0]; if (a[0] !== b[0] || a[1] !== b[1]) out.census[part] = { drawn: a, worker: b }; }
  return out;
})()`;

const failures = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Network.setBlockedURLs', { urls: ['*maps.googleapis.com*', '*api.elevenlabs.io*', '*/api/adventure/*'] });
  // A touch device: starting a match by mouse needs pointer lock, which a headless Chrome may not grant.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.blockplayWorkerSim=true;' });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/battlefield.html' }); await wait('window.ready===true');
  const districts = process.env.PARITY_DISTRICTS?.split(',') ?? await evaluate(`import('/src/game/world-zones.ts').then(m => m.WORLD_ZONES.map(zone => zone.id))`);
  for (const district of districts) {
    await evaluate(`loadTrial(${JSON.stringify(district)},32)`);
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.simulationThread`), 'worker', `${district}: the simulation did not start in a worker`);
    const point = await evaluate(`(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }); await delay(80); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(`hud.phase==='playing'||hud.phase==='deploying'`); await evaluate(`engine.skipDeployment();window.healthTimer=setInterval(()=>engine.refillHealth(),250)`); await wait(`hud.phase==='playing'`);
    for (const after of [6, seconds]) {
      await delay(after * 1000);
      const result = await evaluate(look);
      console.log(JSON.stringify({ district, ...result }));
      if (!result.sameInstant || result.differ || Object.keys(result.census).length) failures.push({ district, ...result });
    }
    const host = await evaluate(`clearInterval(window.healthTimer);({errors:blockplaySimStats.errors,droppedMs:blockplaySimStats.droppedMs})`);
    if (host.errors.length) failures.push({ district, hostErrors: host.errors });
    await evaluate('engine.pause()');
  }
  assert.deepEqual(failures, [], 'The worker\'s district and the drawn one differ as cover');
  assert.deepEqual(errors, []);
  console.log(`Scene parity held in ${districts.length} district${districts.length === 1 ? '' : 's'}.`);
} finally { await evaluate('clearInterval(window.healthTimer);window.engine?.dispose()').catch(() => {}); ws.close(); await request(chrome + '/json/close/' + tab.id).catch(() => {}); }
