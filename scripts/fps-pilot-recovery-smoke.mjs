// Run Vite and an isolated Chrome exposing DevTools (same defaults as the other FPS checks).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-pilot-recovery/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const fixture = new URL('fixture.html', output);
await fs.writeFile(fixture, `<!doctype html><style>body{margin:0}#world{height:700px;width:100vw}</style><div id="world"></div><script type="module">
import {createFpsEngine} from '/src/game/fps-engine.ts';
import {createPlayerPilot} from '/src/game/fps-pilot.ts';
import {createProfile,resolveLoadout} from '/src/game/armory-state.ts';
import {createSoloSession} from '/src/game/lan-peer.ts';
window.mount=(kind)=>{
  window.engine?.dispose();window.session?.close();
  const profile=createProfile();profile.consumables=kind==='food'?{'food-chicken-rice':1}:{'kit-first-aid':1};
  window.consumed=[];window.decisions=[];window.forceThreat=false;
  const pilot=createPlayerPilot();window.session=createSoloSession('Recovery');
  // Inject a threat cue on demand, through the public observation contract.
  const controller={reset:()=>pilot.reset(),decide(o){const d=pilot.decide({...o,underThreat:o.underThreat||window.forceThreat});window.decisions.push({time:o.time,health:o.health,usingSupply:o.usingSupply,action:d.action});return d;}};
  window.engine=createFpsEngine(document.querySelector('#world'),hud=>window.hud=hud,{
    loadout:resolveLoadout(profile),playerPilot:controller,onConsume:id=>window.consumed.push(id),
    arena:{session:window.session,botCount:0,profile,initialVitals:{health:kind==='food'?50:25,armor:0}}
  });
  window.engine.configureDebug({regeneration:false,combatEvents:false});
};
window.mount('food');
</script>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/@fs' + decodeURIComponent(fixture.pathname))}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [];
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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Timed out waiting for ' + expression);
}
const count = kind => `hud.belt.find(slot=>slot.kind===${JSON.stringify(kind)})?.count`;
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait(`window.hud?.phase==='ready' && hud.arenaSelf && hud.health===50`, 60000);
  await evaluate('engine.startPilot()');
  await wait(`hud.supplyUse?.style==='eat'`);
  assert(await evaluate('decisions.filter(d=>d.action.useSupply).every(d=>d.time-decisions[0].time>=4)'), 'waits four quiet seconds');
  await wait(`hud.health===100 && ${count('food')}===0 && !hud.supplyUse`);
  assert.deepEqual(await evaluate('consumed'), ['food-chicken-rice'], 'one real meal consumed at commit');
  console.log('PASS: AI waits for safety, eats carried food, restores health and spends it once.');

  await evaluate(`window.mount('first-aid')`);
  await wait(`hud.phase==='ready' && hud.arenaSelf && hud.health===25`, 60000);
  await evaluate('engine.startPilot()');
  await wait(`hud.supplyUse?.style==='medkit'`);
  await evaluate('window.forceThreat=true');
  await wait('!hud.supplyUse');
  assert.equal(await evaluate('hud.health'), 25);
  assert.equal(await evaluate(count('first-aid')), 1, 'interrupted kit remains on belt');
  assert.deepEqual(await evaluate('consumed'), []);
  await delay(500); assert.equal(await evaluate('!!hud.supplyUse'), false, 'does not restart under threat');
  await evaluate('window.forceThreat=false');
  await wait(`hud.supplyUse?.style==='medkit'`);
  await wait(`hud.health===100 && ${count('first-aid')}===0 && !hud.supplyUse`);
  assert.deepEqual(await evaluate('consumed'), ['kit-first-aid']);
  assert.deepEqual(errors, []);
  console.log('PASS: AI cancels first aid on danger without spending it, then treats after another lull.');
} catch (error) {
  console.log(errors, await evaluate('({phase:window.hud?.phase,health:window.hud?.health,status:window.hud?.pilotStatus,observation:window.engine?.getPilotObservation()})').catch(() => null));
  throw error;
} finally {
  await evaluate('window.engine?.dispose();window.session?.close()').catch(() => {});
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); await fs.rm(fixture, { force: true });
}
