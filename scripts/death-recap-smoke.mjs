// The scene of death in the real engine. Needs Vite (FPS_APP_ORIGIN) and Chrome
// with remote debugging (FPS_CHROME_ORIGIN) and, without a GPU, swiftshader flags.
// An arena match where real bots do the killing, then an expedition, where the
// window hands over to the respawn map by itself and on Space, at phone sizes too.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5311', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9451';
const output = new URL('../.cache/death-recap/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 120000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 60000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(name)}))`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(shot.data, 'base64')); }
const size = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const cam = 'JSON.parse(document.querySelector("canvas").dataset.deathCam||"null")';
const fits = '(()=>{const r=e=>e.getBoundingClientRect();return [...document.querySelectorAll(".death-recap-card,.death-recap-foot,.death-recap-head")].every(e=>{const b=r(e);return b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1})})()';
const results = {};
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.bringToFront'); // Mouse capture needs the tab in front.
  await send('Network.setBlockedURLs', { urls: ['*api.openai.com/*', '*api.elevenlabs.io/*', '*/api/adventure/*', '*maps.googleapis.com/*'] });
  // A software renderer takes longer to screenshot than the window lasts, so the page runs on a slowed clock.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const scale=${Number(process.env.DEATH_RECAP_TIME_SCALE || .2)},real=performance.now.bind(performance),raf=window.requestAnimationFrame.bind(window);performance.now=()=>real()*scale;window.requestAnimationFrame=f=>raf(()=>f(performance.now()));})()` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',celebration:'none',reducedEffects:true,shadows:false,occlusion:false}))` });

  if (!process.env.DEATH_RECAP_SKIP_ARENA) {
    await size(1280, 800);
    await send('Page.navigate', { url: `${origin}/debug` });
    await wait(`!!${button('LAN arena')}`, 120000); await click(button('LAN arena'));
    await wait(`!!document.querySelector('.lan-lobby')`); await click(button('Solo vs bots'));
    await click(button('Deploy against bots')); await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`, 180000);
    await click(button('Start match')); await wait(`document.querySelector('.fps-game')?.dataset.phase==='playing'`);
    await wait(`!!document.querySelector('.death-recap')`, 300000);
    results.arena = { text: await evaluate(`document.querySelector('.death-recap').innerText`) };
    await screenshot('arena-collapse');
    await wait(`(${cam})?.age>2.4`); await delay(300); await screenshot('arena-settled');
    const settled = await evaluate(cam); results.arena.settled = settled;
    assert.equal(await evaluate(`!!document.querySelector('.death-recap-skip')`), false, 'An arena match has no respawn map to skip to');
    assert(await evaluate(`document.querySelector('.death-recap-foot strong').textContent.startsWith('Back in')`));
    assert(await evaluate(fits), 'Arena recap fits');
    await wait(`!document.querySelector('.death-recap')`, 60000);
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.deathCam`), '');
    assert(await evaluate(`!document.querySelector('.arena-respawn')`), 'Respawned straight from the recap');
    console.log('PASS arena: bot kill, recap, countdown, respawn.');
  }

  const kill = process.env.DEATH_RECAP_EVENT || 'drone';
  // A fresh page each time: the fixture's checkpoint leaves the player one hit from death.
  async function fallOnce(width = 1280, height = 800, mobile = false) {
    await size(width, height, mobile);
    await send('Page.navigate', { url: `${origin}/scripts/fixtures/death-recap.html` });
    await wait(`window.hud?.phase==='ready'`, 180000); await click(`document.querySelector('#start')`); await wait(`window.hud?.phase==='playing'`, 60000);
    await wait(`window.hud?.combatEventsAvailable`, 30000);
    await evaluate(`engine.triggerCombatEvent(${JSON.stringify(kill)})`); await wait(`!!document.querySelector('.death-recap')`, 120000);
  }
  await fallOnce();
  assert(!(await evaluate(`!!document.querySelector('.respawn-card')`)), 'No spawn select during the window');
  assert.equal(await evaluate(`document.querySelector('canvas').dataset.deploymentOverview`), 'false', 'Camera stays at the scene');
  await delay(300); await screenshot('expedition-collapse');
  const early = await evaluate(cam);
  await wait(`(${cam})?.age>2.4`); await screenshot('expedition-settled');
  const late = await evaluate(cam);
  assert(late.y > early.y, 'The camera lifts off the ground'); assert(Math.abs(late.roll) < .01, 'The horizon levels');
  assert(await evaluate(`hud.deathRecap.windowLeft<2`));
  results.expedition = { text: await evaluate(`document.querySelector('.death-recap').innerText`), early, late };
  await wait(`!!document.querySelector('.respawn-card')`, 40000);
  assert.equal(await evaluate(`document.querySelector('canvas').dataset.deploymentOverview`), 'true', 'The map follows');
  assert.equal(await evaluate(`hud.arenaSelf.alive`), false);
  assert(await evaluate(`hud.arenaSelf.respawnIn>0`), 'Time left to choose after the window');
  await screenshot('expedition-respawn-map');
  console.log('PASS expedition: window hands over to the respawn map by itself.');

  // Space skips, and the respawn timer is not shortened by it.
  await fallOnce();
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await wait(`!!document.querySelector('.respawn-card')`, 10000);
  assert(await evaluate(`hud.arenaSelf.respawnIn>2`), 'Skipping keeps the timer');
  console.log('PASS skip: Space goes straight to the map and keeps the timer.');

  // Automatic respawn: with the window over, nothing further is asked of the player.
  await evaluate(`engine.setAutoRespawn(true)`); await wait(`hud.arenaSelf.alive`, 60000);
  await wait(`document.querySelector('canvas').dataset.deathCam===''`); assert.equal(await evaluate(`hud.deathRecap`), null);
  console.log('PASS auto-respawn: back in the fight, scene cleared.');

  // Phones: what remains on screen fits either way up.
  await fallOnce(390, 844, true);
  await screenshot('touch-390');
  assert(await evaluate(fits), 'Fits 390x844');
  await size(844, 390, true); await delay(250); assert(await evaluate(fits), 'Fits 844x390'); await screenshot('touch-844');
  await size(1280, 800);
  console.log('PASS touch: recap fits portrait and landscape.');

  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('verification.json', output), JSON.stringify({ passed: true, ...results }, null, 1));
  console.log(JSON.stringify(results, null, 1));
} catch (error) {
  console.log(errors, await evaluate(`({phase:window.hud?.phase,alive:window.hud?.arenaSelf?.alive,health:window.hud?.health,message:window.hud?.message,available:window.hud?.combatEventsAvailable,recap:window.hud?.deathRecap,text:document.body.innerText.slice(0,500)})`).catch(() => null));
  await screenshot('failure').catch(() => {});
  throw error;
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {}); }
