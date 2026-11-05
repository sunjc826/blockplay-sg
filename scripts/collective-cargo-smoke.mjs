// Real-engine Collective Corps cargo smoke: each weapon loads, aims, fires and reloads; the QTS-11 switches modes
// and fires its launcher. Needs Vite (FPS_APP_ORIGIN) and Chrome with remote debugging (FPS_CHROME_ORIGIN). Pictures go to .cache.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5293', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9457';
const output = new URL('../.cache/collective-cargo/', import.meta.url); await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#17231e}.fps-game{position:relative;width:100vw;height:100vh}#world{width:100%;height:100%}#hud{position:fixed;inset:0;pointer-events:none}#enter{position:fixed;top:0;left:0;z-index:9}</style><div class="fps-game"><div id="world"></div><div id="hud"></div></div><button id="enter">Enter</button><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const React=(await import('react')).default,ReactDOM=(await import('react-dom/client')).default;
const {default:FpsWeaponHud}=await import('/src/components/FpsWeaponHud.tsx');await import('/src/styles.css');
const {createFpsEngine}=await import('/src/game/fps-engine.ts');const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {recoverProxyWeapon}=await import('/src/game/proxy-equipment.ts');
const root=ReactDOM.createRoot(document.querySelector('#hud'));
window.choose=id=>{window.engine?.dispose();window.hud=null;window.equipment=resolveLoadout(recoverProxyWeapon(createProfile(),id,0));window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;root.render(React.createElement(FpsWeaponHud,{hud,weapon:equipment.weapons[hud.weapon],canFight:hud.phase==='playing',onToggleMode:()=>engine.toggleWeaponMode()}))},{tutorial:true,loadout:equipment});engine.configureDebug({regeneration:false,combatEvents:false});};
document.querySelector('#enter').onclick=()=>engine.start();
window.fixtureReady=true;
</script>`);
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let serial = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(Error(method)), 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || expression); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 120000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(80); } throw Error('Timed out: ' + expression); }
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(r.data, 'base64')); };
const key = async (k, code = 'Key' + k.toUpperCase()) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
const fire = async ms => { await evaluate(`engine.setInput('fire',true)`); await delay(ms); await evaluate(`engine.setInput('fire',false)`); };
const aimed = async () => { await evaluate('engine.toggleAim()'); await wait('hud.aimProgress>.95', 8000); await delay(150); };
const results = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol)};Stub.prototype=Real.prototype;Stub.OPEN=1;Stub.CLOSED=3;Stub.CONNECTING=0;window.WebSocket=Stub}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const real=performance.now.bind(performance);let scale=1,base=real(),at=base;window.setClock=next=>{at=performance.now();base=real();scale=next};performance.now=()=>at+(real()-base)*scale;const frame=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>frame(()=>f(performance.now()))}` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/.cache/collective-cargo/fixture.html' });
  await wait('window.fixtureReady===true');
  for (const id of ['cc-gatekeeper', 'cc-network', 'cc-qts11']) {
    await evaluate(`choose(${JSON.stringify(id)})`);
    await wait(`window.hud?.phase==='ready'`);
    await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));document.querySelector('#enter').click()`);
    await wait(`hud.phase==='playing'`); await delay(1800);
    const family = await evaluate('hud.weapon');
    assert.equal(await evaluate('equipment.weapons[hud.weapon].equipment.variant'), id);
    await shot(`${id}-hip`);
    await aimed(); await shot(`${id}-aim`); await evaluate('engine.toggleAim()'); await delay(500);
    const before = await evaluate('({magazine:hud.magazine,shots:hud.shots})');
    await fire(450); await wait(`hud.shots>${before.shots}`, 5000); await delay(200);
    const left = await evaluate('hud.magazine');
    assert(left < before.magazine, `${id} fires`);
    // A screenshot can outlast a whole reload, so the page clock crawls while the pictures are taken. hud.reloading counts down.
    await evaluate('setClock(.06);engine.reload()');
    for (const [name, at] of [['out', .2], ['pouch', .4], ['in', .58], ['charge', .8]]) { await wait(`hud.reloading<${1 - at}`, 60000); await shot(`${id}-reload-${name}`); }
    await evaluate('setClock(1)'); await wait('hud.reloading===0', 12000); assert(await evaluate(`hud.magazine>${left}`), `${id} reloads`);
    const after = await evaluate('hud.magazine');
    results.push({ id, family, magazine: before.magazine, left, after });
    if (id === 'cc-qts11') {
      await key('u'); await wait('hud.weapon===17', 6000); await delay(1400);
      assert.equal(await evaluate('hud.magazineCapacity'), 5);
      assert.equal(await evaluate('document.querySelector(".fps-mode-select")?.textContent?.includes("SELECT RIFLE")'), true, 'The mode button offers the rifle back');
      assert.equal(await evaluate('JSON.parse(document.querySelector("canvas").dataset.magazineInventory).slots.filter(m=>m?.caliberMm===20).length'), 2, 'The launcher came with two spares');
      await shot('cc-qts11-launcher-hip');
      await aimed(); await shot('cc-qts11-launcher-aim'); await evaluate('engine.toggleAim()'); await delay(400);
      const launcher = await evaluate('({magazine:hud.magazine,shots:hud.shots})');
      await fire(120); await wait(`hud.shots>${launcher.shots}`, 5000);
      assert.equal(await evaluate('hud.magazine'), launcher.magazine - 1, 'A launcher round left the magazine');
      await wait('Number(document.querySelector("canvas").dataset.grenadeEvents)>0', 15000); await shot('cc-qts11-launcher-burst'); await delay(950);
      await evaluate(`document.querySelector('.fps-mode-select').click()`); await wait('hud.weapon===16', 6000);
      assert.equal(await evaluate('hud.magazine'), after, 'The rifle magazine waited unchanged');
      results.push({ launcher: launcher.magazine, spares: 2 });
    }
    assert.deepEqual(errors, [], id);
  }
  // Both launchers share one code path: Peace Offering must behave as it did.
  await evaluate(`choose('ff-oicw')`); await wait(`window.hud?.phase==='ready'`);
  await evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));document.querySelector('#enter').click()`);
  await wait(`hud.phase==='playing'`); await delay(1800);
  assert.equal(await evaluate('hud.weapon'), 11);
  await key('u'); await wait('hud.weapon===13', 6000); await delay(1400);
  assert.equal(await evaluate('hud.magazineCapacity'), 6);
  const peace = await evaluate('({magazine:hud.magazine,shots:hud.shots})');
  await fire(120); await wait(`hud.shots>${peace.shots}`, 5000);
  assert.equal(await evaluate('hud.magazine'), peace.magazine - 1);
  await wait('Number(document.querySelector("canvas").dataset.grenadeEvents)>0', 15000); await delay(950);
  await evaluate(`document.querySelector('.fps-mode-select').click()`); await wait('hud.weapon===11', 6000);
  assert.deepEqual(errors, [], 'ff-oicw');
  results.push({ peaceOffering: peace.magazine });
  console.log('collective cargo smoke: passed', JSON.stringify(results));
} catch (error) { await shot('failure').catch(() => {}); console.log(JSON.stringify({ results, errors }, null, 1)); throw error; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`, { method: 'PUT' }).catch(() => {}); }
