// Vite (FPS_APP_ORIGIN, default :5193); isolated Chrome/Metal CDP (FPS_CHROME_ORIGIN, default :9357).
// Through the real GameMenu and FpsGame: walks the bay, aims at every rack weapon, takes it with E and
// fires it, then checks the saved profile never changed. Run with NODE_USE_ENV_PROXY unset here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5193';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9357';
const district = process.env.ARMORY_DISTRICT || 'harbourfront';
const output = new URL('../.cache/range-armory/', import.meta.url); await fs.mkdir(output, { recursive: true });
const absoluteImports = source => source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, q, p) => q + new URL(p, 'file:///src/components/source.tsx').pathname + q);
let source = absoluteImports(await fs.readFile(new URL('../src/components/FpsGame.tsx', import.meta.url), 'utf8'));
source = source.replace('useState(() => resolveLoadout(profile))', 'useState(() => window.fixtureLoadout ?? resolveLoadout(profile))');
source = source.replace('({ region: initialRegion })', '({ region: initialRegion, ...window.fixtureEntry })');
source = source.replace('useState(initialFpsHud), [epoch, setEpoch] = useState(0);', 'useState(initialFpsHud), [epoch, setEpoch] = useState(0); window.trainingHud = hud;');
source = source.replace('encik: () => speaking.current });', 'encik: () => speaking.current }); window.trainingEngine = engine.current;');
await fs.writeFile(new URL('FpsGame.tsx', output), source);
let menu = absoluteImports(await fs.readFile(new URL('../src/components/GameMenu.tsx', import.meta.url), 'utf8'));
menu = menu.replace("from '/src/components/FpsGame'", "from './FpsGame.tsx'");
await fs.writeFile(new URL('GameMenu.tsx', output), menu);
const bought = ['sar-vanguard', 'ult-lights', 'p30-silent', 'mag-chope', 'cis50-merlion'];
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div>
<script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import GameMenu from './GameMenu.tsx';
import {createProfile,STORAGE_KEY} from '/src/game/armory-state.ts';import {setEnvironmentSettings} from '/src/game/environment-settings.ts';import '/src/styles.css';
const counted=WebGL2RenderingContext.prototype;window.draws=0;for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const draw=counted[name];counted[name]=function(...a){window.draws++;return draw.apply(this,a);};}
setEnvironmentSettings({weather:'sunny',celebration:'none',timeOfDay:'noon'});
const p=createProfile();for(const id of ${JSON.stringify(bought)})p.rentals[id]=36e5;localStorage.setItem(STORAGE_KEY,JSON.stringify(p));localStorage.setItem('blockplay.menu.training',${JSON.stringify(district)});
window.savedProfile=localStorage.getItem(STORAGE_KEY);
const root=createRoot(document.querySelector('#root'));let revision=0;
window.mountTraining=entry=>{window.fixtureEntry=entry;window.trainingHud=null;root.render(React.createElement(GameMenu,{key:++revision,screen:'training'}));};window.mountTraining({});
</script></body></html>`);
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let serial = 0; const pending = new Map(), errors = [], logs = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled') { const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' '); if (m.params.type === 'error') errors.push(text); else if (text.startsWith('[range-armory]')) logs.push(text); }
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(Error(method)), 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || expression); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 90000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(60); } throw Error('Waited for ' + expression); }
async function press(key) { const code = 'Key' + key.toUpperCase(); await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(r.data, 'base64')); }
async function click(selector) {
  const p = await evaluate(`(()=>{const e=${selector};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
}
let mouse = { x: 640, y: 400 };
/** Turn to a heading through the real pointer lock, correcting from what the HUD reports. */
async function aim(yaw, pitch) {
  for (let i = 0; i < 40; i++) {
    const now = await evaluate('({yaw:trainingHud.yaw,pitch:trainingHud.pitch})');
    const dy = Math.atan2(Math.sin(yaw - now.yaw), Math.cos(yaw - now.yaw)), dp = pitch - now.pitch;
    if (Math.abs(dy) < .008 && Math.abs(dp) < .008) return true;
    // Half a step per pixel is an estimate; the loop corrects it.
    const mx = Math.max(-200, Math.min(200, Math.round(-dy * 500))) || Math.sign(-dy), my = Math.max(-200, Math.min(200, Math.round(-dp * 500))) || Math.sign(-dp);
    // Under pointer lock only the difference counts, so the cursor is never brought back.
    mouse = { x: mouse.x + mx, y: mouse.y + my };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...mouse });
    await delay(60);
  }
  return false;
}
const bay = local => evaluate(`(()=>{const {plot}=trainingEngine.rangeArmoryState();const c=Math.cos(plot.yaw),s=Math.sin(plot.yaw),[x,z]=${JSON.stringify(local)};return {x:plot.x+x*c+z*s,z:plot.z-x*s+z*c,yaw:plot.yaw};})()`);
async function enter(entry) {
  await wait('!!window.mountTraining');
  await evaluate(`mountTraining(${JSON.stringify(entry)})`);
  await wait(`!!document.querySelector('.starting-deploy')`); await click(`document.querySelector('.starting-deploy')`);
  await wait(`window.trainingHud?.phase==='ready' && !document.querySelector('.play-loading')`, 180000);
  await click(`document.querySelector('.fps-start-card .primary-button')`); await wait(`trainingHud.phase==='playing'`);
  await wait(`document.pointerLockElement===document.querySelector('.fps-game canvas') && !!trainingEngine.rangeArmoryState()?.items.length`);
}
const results = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  // Another edit to the working tree must not reload the page mid-run: Vite's client gets a socket that never opens.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol);};Stub.OPEN=1;Stub.CLOSED=3;Stub.CONNECTING=0;window.WebSocket=Stub;}` });
  await send('Page.navigate', { url: origin + '/.cache/range-armory/fixture.html' });
  await enter({});
  const state = await evaluate('trainingEngine.rangeArmoryState()');
  assert.equal(state.items.length, 27 + bought.length, 'Every issued, captured and bought weapon is on the rack');
  for (const id of bought) assert(state.items.some(item => item.id === id), id);
  assert.deepEqual(state.carried.sort(), ['p30-issued', 'sar-issued']);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.fps-loot-card')].length`), 0, 'No card until a gun is looked at');
  await screenshot('spawn-view');
  // A wide view, from past the table.
  const wide = await bay([0, 9]);
  await enter({ spawn: { x: wide.x, z: wide.z, yaw: wide.yaw, pitch: .04 } }); await delay(500); await screenshot('bay-wide');
  const taken = new Set();
  for (const across of [-2.7, 0, 2.7]) {
    const at = await bay([across, 1.35]);
    await enter({ spawn: { x: at.x, z: at.z, yaw: at.yaw, pitch: 0 } }); await delay(500);
    if (across === 0) { await screenshot('in-aisle'); const before = await evaluate('draws'); await new Promise(r => setTimeout(r, 1000)); const after = await evaluate('draws'); results.push({ drawsPerSecondInAisle: after - before }); }
    for (let round = 0; round < 2; round++) {
      const here = await evaluate('(()=>{const s=trainingEngine.rangeArmoryState();return {items:s.items,carried:s.carried,x:trainingHud.x,z:trainingHud.z,y:trainingHud.tutorial?.feet??0}})()');
      for (const item of here.items) {
        if (taken.has(item.id) || Math.hypot(item.x - here.x, item.z - here.z) > 3.2) continue;
        const { carried } = await evaluate('trainingEngine.rangeArmoryState()'); if (carried.includes(item.id)) continue;
        const dx = item.x - here.x, dz = item.z - here.z, eye = 1.74;
        await aim(Math.atan2(-dx, -dz), Math.atan2(item.y - eye, Math.hypot(dx, dz)));
        await wait(`trainingEngine.rangeArmoryState().focused===${JSON.stringify(item.id)}`, 3000);
        await wait(`!!document.querySelector('.fps-loot-card')`, 3000);
        if (!taken.size) await screenshot('card');
        const card = await evaluate(`document.querySelector('.fps-loot-card strong').textContent`), shots = await evaluate('trainingHud.shots');
        await press('e');
        await wait(`trainingEngine.rangeArmoryState().carried.includes(${JSON.stringify(item.id)})`, 3000);
        taken.add(item.id);
        await delay(1100); // The swap, then the first shot.
        const after = await evaluate('({weapon:trainingHud.weapon,reserve:trainingHud.reserve,magazine:trainingHud.magazine,name:document.querySelector(".fps-weapon-hud")?.textContent?.slice(0,40)})');
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 }); await delay(120); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 });
        await delay(250);
        const fired = (await evaluate('trainingHud.shots')) - shots;
        results.push({ id: item.id, card, family: after.weapon, reserve: after.reserve, magazine: after.magazine, fired });
        assert(after.magazine > 0, `${item.id} comes loaded`); assert(after.reserve > 0, `${item.id} comes with spares`);
        assert(!errors.length, `${item.id}: ${errors.join('; ')}`);
      }
    }
  }
  const missing = state.items.map(item => item.id).filter(id => !taken.has(id));
  assert.deepEqual(missing, [], 'Every rack weapon was taken');
  // Rental clocks run during play, as they always do; what is owned and chosen must not move.
  const kit = json => { const { owned, guns, carry, plate, rig } = JSON.parse(json); return { owned, guns, carry, plate, rig }; };
  assert.deepEqual(kit(await evaluate(`localStorage.getItem('blockplay.armory.v1')`)), kit(await evaluate('savedProfile')), 'The saved kit never changed');
  // Facing the table from the aisle.
  const aisle = await bay([0, 1.3]);
  await enter({ spawn: { x: aisle.x, z: aisle.z, yaw: aisle.yaw + Math.PI, pitch: -.5 } }); await delay(500); await screenshot('table');
  await screenshot('table-aisle');
  const front = await bay([0, 7.2]);
  await enter({ spawn: { x: front.x, z: front.z, yaw: front.yaw, pitch: -.42 } }); await delay(500); await screenshot('table-front');
  if (district === 'harbourfront') {
    // A taken gun walks across a physical border, to the Sentosa boardwalk, and is still in hand there.
    const end = await bay([3.4, 1.35]);
    await enter({ spawn: { x: end.x, z: end.z, yaw: end.yaw, pitch: 0 } }); await delay(400);
    const h = await evaluate('({x:trainingHud.x,z:trainingHud.z})');
    const pick = await evaluate(`trainingEngine.rangeArmoryState().items.filter(i=>Math.hypot(i.x-${h.x},i.z-${h.z})<3&&i.y>1.2&&i.y<2.4)[0]`);
    const dx = pick.x - h.x, dz = pick.z - h.z;
    await aim(Math.atan2(-dx, -dz), Math.atan2(pick.y - 1.74, Math.hypot(dx, dz)));
    await wait(`!!trainingEngine.rangeArmoryState().focused`, 3000);
    const chosen = await evaluate('trainingEngine.rangeArmoryState().focused'); await press('e');
    await wait(`trainingEngine.rangeArmoryState().carried.includes(${JSON.stringify(chosen)})`, 3000);
    // The bay is far from the border, so carry that equipment to the boardwalk's end, then walk over it.
    await evaluate('window.fixtureLoadout=trainingEngine.getLoadout()');
    const key = (type, k) => send('Input.dispatchKeyEvent', { type, key: k, code: 'Key' + k.toUpperCase(), ...(type === 'keyDown' ? { text: k } : {}) });
    await enter({ spawn: { x: 110.5, z: 208.5, yaw: Math.PI, pitch: -.12 } });
    assert((await evaluate('trainingEngine.rangeArmoryState()')).carried.includes(chosen), 'A rebuilt engine keeps the rack gun');
    let crossed = false; const started = Date.now();
    await key('keyDown', 'w');
    while (Date.now() - started < 60000) {
      if (await evaluate(`document.querySelector('.fps-game').dataset.mapZone==='sentosa'`)) { crossed = true; break; }
      await delay(100);
    }
    await key('keyUp', 'w');
    assert(crossed, 'Walked across the border');
    await wait(`trainingHud.phase==='playing'`, 60000); await delay(600);
    const there = await evaluate('trainingEngine.rangeArmoryState()');
    assert(there.carried.includes(chosen), `${chosen} crossed with the player`);
    const shots = await evaluate('trainingHud.shots');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse, button: 'left', clickCount: 1 }); await delay(120); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse, button: 'left', clickCount: 1 }); await delay(250);
    results.push({ crossed: chosen, carriedThere: there.carried, firedThere: (await evaluate('trainingHud.shots')) - shots });
    await screenshot('after-crossing');
  }
  assert(!errors.length, errors.join('; '));
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ district, logs, results }, null, 1));
  console.log('range-armory smoke: passed', results.filter(result => result.id).length, 'weapons');
} catch (error) {
  await screenshot('failure').catch(() => {});
  console.log(JSON.stringify({ logs, results, errors }, null, 1));
  throw error;
} finally {
  ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`, { method: 'PUT' }).catch(() => {});
}
