// Requires Vite and isolated Chrome with remote debugging, like the other FPS smokes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/magazine-ammo/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [], evidence = {};
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(`${message.params.entry.url ?? ''}: ${message.params.entry.text}`);
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
async function wait(expression, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(20); }
  throw new Error('Timed out: ' + expression);
}
const screenshot = async name => fs.writeFile(new URL(name + '.png', output), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const state = `JSON.parse(document.querySelector('canvas').dataset.magazineAmmo)`;
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 960, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/magazine-ammo.html' });
  await wait('window.ready===true', 90000);
  evidence.grid = await evaluate('fixture.states()');
  console.log('Rendered full/half/empty magazine grid.');
  for (let row = 0; row < 3; row++) assert.deepEqual(evidence.grid.slice(row * 3, row * 3 + 3).map(cell => cell.stacks[0].rounds), [30,15,0]);
  await screenshot('full-half-empty');
  // Render the magazine alone with and without its internals: a bounded draw
  // cost comparison, independent of the rest of the gun's geometry.
  evidence.draws = await evaluate(`(()=>{
    const {root,camera}=fixture.cells[0],magazine=root.getObjectByName('sar21-inspired__magazine'),ammo=root.getObjectByName('magazine-ammunition');
    const scene=new (root.parent.constructor)(); scene.add(magazine); fixture.renderer.setScissorTest(false);
    fixture.renderer.render(scene,camera); const full=fixture.renderer.info.render.calls;
    ammo.visible=false; fixture.renderer.render(scene,camera); const shell=fixture.renderer.info.render.calls;
    ammo.visible=true; root.add(magazine); fixture.renderer.setScissorTest(true); fixture.draw();
    return {full,shell,extra:full-shell};
  })()`);
  assert.equal(evidence.draws.extra, 3);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.ready=false');
  await send('Page.reload'); await wait('window.ready===true', 60000); await screenshot('mobile-grid');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  const fixture = new URL('engine.html', output);
  await fs.writeFile(fixture, `<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#17231e;color:white;font:16px system-ui}#world{height:740px;width:100vw}button{height:40px}</style><button id="enter">Enter range</button><div class="fps-game"><div id="world"></div></div><script type="module">
    import {createFpsEngine} from '/src/game/fps-engine.ts';
    import {createProfile,resolveLoadout,equip} from '/src/game/armory-state.ts';
    const params=new URLSearchParams(location.search),family=Number(params.get('family')),variant=params.get('variant');
    const base=createProfile();base.owned.push(variant);const profile=equip(base,variant,family);profile.carry={main:family,extra:null};
    const equipment=resolveLoadout(profile);window.capacity=equipment.weapons[family].capacity;
    window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;if(window.stopAt!==undefined&&hud.magazine<=window.stopAt)engine.setInput('fire',false);},{tutorial:true,loadout:equipment});
    engine.configureDebug({regeneration:false,combatEvents:false});document.querySelector('#enter').onclick=()=>engine.start();
  </script>`);
  evidence.engine = [];
  for (const [family, variant] of [[0,'sar-issued'],[5,'xm8-sharpshooter'],[6,'g36-rifle']]) {
    await send('Page.navigate', { url: origin + '/@fs' + decodeURIComponent(fixture.pathname) + `?family=${family}&variant=${variant}` });
    await wait(`window.hud?.phase==='ready'`, 180000);
    await send('Page.bringToFront');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 20, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 20, button: 'left', clickCount: 1 });
    await wait(`hud.phase==='playing'`);
    console.log('Checking live firing and reloads:', variant);
    await wait(`${state}[0]?.rounds===capacity`);
    const full = await evaluate(state);
    await evaluate(`engine.lookBy(0,400);engine.setInput('fire',true)`);
    await wait('hud.magazine<=capacity-5'); await evaluate(`engine.setInput('fire',false)`);
    await wait(`${state}[0]?.rounds===hud.magazine-1`);
    const fired = await evaluate(`({ammo:hud.magazine,visual:${state}})`);
    assert(fired.visual[0].followerY > full[0].followerY);
    await evaluate('engine.switchWeapon(2)'); await wait('hud.weapon===2');
    await evaluate(`engine.switchWeapon(${family})`); await wait(`hud.weapon===${family}&&${state}[0]?.rounds===${fired.ammo-1}`);
    await evaluate('engine.reload()'); await wait('hud.reloading>0');
    await wait(`!hud.reloading&&${state}[0]?.rounds===capacity`);
    await evaluate(`window.stopAt=1;engine.setInput('fire',true)`); await wait('hud.magazine===1');
    await evaluate(`engine.setInput('fire',false)`); await wait(`${state}[0]?.rounds===0`);
    const chamberOnly = await evaluate(`({ammo:hud.magazine,chamber:hud.chambered,visual:${state}})`);
    assert(chamberOnly.chamber); assert.equal(chamberOnly.ammo, 1);
    await screenshot(variant + '-chamber-only');
    await delay(200); await evaluate(`window.stopAt=0;engine.setInput('fire',true)`); await wait('hud.magazine===0'); await evaluate(`engine.setInput('fire',false);window.stopAt=undefined`);
    await evaluate('engine.reload()'); await wait('hud.reloading>0');
    await wait(`!hud.reloading&&${state}[0]?.rounds===capacity-1`);
    const reloaded = await evaluate(`({ammo:hud.magazine,visual:${state}})`);
    evidence.engine.push({variant,full,fired,chamberOnly,reloaded});
    await evaluate('engine.dispose()');
  }
  assert.deepEqual(errors, []);
  evidence.errors = errors;
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify(evidence, null, 2));
  console.log('PASS: SAR/XM8/G36 full/half/empty rendering, mobile viewport, three extra magazine draws, firing, chamber-only, switching, tactical and empty reloads; no browser errors.');
} catch (error) {
  console.error('Browser diagnostics:', errors, await evaluate(`({hud:window.hud,button:document.querySelector('#enter')?.getBoundingClientRect().toJSON(),lock:!!document.pointerLockElement})`).catch(() => null));
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
}
