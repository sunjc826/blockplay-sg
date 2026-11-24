// Does a game carry on when its simulation worker cannot start, crashes, or goes silent?
//
// With Settings › Video › Background simulation on, an Open World district's bots run in a worker
// (src/game/sim-remote.ts). This starts a district that way three times: with no worker to be had, with one that
// is then ended as a crash would end it, and with one that is ended without a word. Each time the district must
// end up playing with its simulation on the main thread, the player where they stood, and bots alive and moving.
// A solo match has no checkpoint to return to: when its worker is lost it must start again on the main thread.
//
//   FALLBACK_MATCH       mode:area of the solo match (default team-deathmatch:smith-street)
//
//   FPS_APP_ORIGIN       Vite dev server (default http://127.0.0.1:5192)
//   FPS_CHROME_ORIGIN    Chrome remote debugging (default http://127.0.0.1:9357)
//   FALLBACK_DISTRICT    zone id (default toa-payoh)
import assert from 'node:assert/strict';
import http from 'node:http';

const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5192', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9357';
const district = process.env.FALLBACK_DISTRICT || 'toa-payoh', [matchMode, matchArea] = (process.env.FALLBACK_MATCH || 'team-deathmatch:smith-street').split(':');
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
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error('Timeout ' + method)); }, 120000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = async (expression, limit = 90000) => { const start = Date.now(); while (!await evaluate(expression)) { if (Date.now() - start > limit) throw Error('Timeout ' + expression + ' ' + errors.join(' | ').slice(0, 1500)); await delay(200); } };
const thread = `document.querySelector('canvas')?.dataset.simulationThread`;
const self = `(()=>{const me=hud.arenaSelf;return me&&{x:me.x,z:me.z,alive:me.alive}})()`;
const bots = `hud.arena.actors.filter(a=>a.bot&&a.alive).map(a=>[a.id,a.x,a.z])`;

let script = null;
/** A fresh page each time: a worker that failed is not tried again until the page is reloaded. */
async function enter(before, load = `loadTrial(${JSON.stringify(district)},32)`) {
  if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  script = (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.blockplayWorkerSim=true;' + before })).identifier;
  await send('Page.navigate', { url: origin + '/scripts/fixtures/battlefield.html' }); await wait('window.ready===true');
  await evaluate(load);
}
async function play() {
  const point = await evaluate(`(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }); await delay(80); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(`hud.phase==='playing'||hud.phase==='deploying'`); await evaluate(`engine.skipDeployment();clearInterval(window.healthTimer);window.healthTimer=setInterval(()=>window.engine.refillHealth(),250)`); await wait(`hud.phase==='playing'&&!!hud.arenaSelf?.alive`);
}
/** Playing on the main thread, with bots that move. */
async function carriesOn(label, least = 8) {
  await wait(`${thread}==='main'&&hud?.phase==='playing'&&!!hud.arenaSelf?.alive`);
  const before = await evaluate(bots); await delay(4000); const after = new Map((await evaluate(bots)).map(([id, x, z]) => [id, { x, z }]));
  assert(before.length > least, `${label}: only ${before.length} bots alive`);
  const moved = before.filter(([id, x, z]) => { const now = after.get(id); return now && Math.hypot(now.x - x, now.z - z) > .2; }).length;
  assert(moved > least / 3, `${label}: only ${moved} of ${before.length} bots moved in four seconds`);
  return { bots: before.length, moved };
}

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Network.setBlockedURLs', { urls: ['*maps.googleapis.com*', '*api.elevenlabs.io*', '*/api/adventure/*'] });
  // A touch device: starting a match by mouse needs pointer lock, which a headless Chrome may not grant.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.bringToFront');

  // No worker to be had: the district loads on the main thread and says why.
  await enter(`globalThis.Worker=class{constructor(){throw new Error('Workers are switched off for this trial')}};`);
  assert.equal(await evaluate(thread), 'main', 'A district whose worker cannot be made still loads');
  assert.match(await evaluate(`import('/src/game/sim-thread-setting.ts').then(m=>m.simWorkerFailure())`), /switched off for this trial/);
  await play(); console.log(JSON.stringify({ case: 'cannot start', ...await carriesOn('cannot start') }));

  for (const [label, silently, limit] of [['crashed', false, 30000], ['went silent', true, 45000]]) {
    await enter('');
    assert.equal(await evaluate(thread), 'worker', `${label}: the simulation did not start in a worker`);
    await play(); await delay(3000);
    const stood = await evaluate(self), started = Date.now();
    await evaluate(`blockplaySimKill(${silently})`);
    await wait(`window.recoveries===1&&${thread}==='main'&&hud?.phase==='playing'&&!!hud.arenaSelf?.alive`, limit);
    const seconds = (Date.now() - started) / 1000, stands = await evaluate(self);
    assert(Math.hypot(stands.x - stood.x, stands.z - stood.z) < 6, `${label}: the player came back ${Math.hypot(stands.x - stood.x, stands.z - stood.z).toFixed(1)} m from where they stood`);
    assert.match(await evaluate(`import('/src/game/sim-thread-setting.ts').then(m=>m.simWorkerFailure())`), silently ? /stopped answering/ : /development probe/);
    console.log(JSON.stringify({ case: label, secondsToPlayingAgain: +seconds.toFixed(1), ...await carriesOn(label) }));
    assert.equal(await evaluate('window.recoveries'), 1, `${label}: the district reloaded more than once`);
  }
  // A match: lost mid-match, it is back at its start card on the main thread, saying why, and plays from there.
  await enter('', `loadMatch(${JSON.stringify(matchMode)},${JSON.stringify(matchArea)},9)`);
  assert.equal(await evaluate(thread), 'worker', 'match: the simulation did not start in a worker');
  await play(); await delay(3000); await evaluate('blockplaySimKill()');
  await wait(`window.recoveries===1&&${thread}==='main'&&hud?.phase==='ready'`, 45000);
  assert.equal(await evaluate('hud.message'), 'restarted', 'A restarted match says why on its start card');
  await play(); console.log(JSON.stringify({ case: 'match crashed', ...await carriesOn('match crashed', 3) }));
  assert.equal(await evaluate('window.recoveries'), 1, 'match: restarted more than once');
  assert.deepEqual(errors, []);
  console.log('Each game carried on when its simulation worker failed.');
} finally { await evaluate('clearInterval(window.healthTimer);window.engine?.dispose()').catch(() => {}); ws.close(); await request(chrome + '/json/close/' + tab.id).catch(() => {}); }
