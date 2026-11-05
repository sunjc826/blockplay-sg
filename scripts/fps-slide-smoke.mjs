// The combat slide on the real engine: real keys, then real touches in an emulated phone.
// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9229.
// On a slow renderer, frames clamp and speeds read low; use the real GPU (see docs/PROJECT-GUIDE.md).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9229';
const output = new URL('../.cache/fps-slide/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); });
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
const down = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
const up = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
const tapKey = async (key, code) => { await down(key, code); await up(key, code); };
const screenshot = async name => fs.writeFile(new URL(name + '.png', output), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const motion = `JSON.parse(document.querySelector('.fps-viewport canvas').dataset.movement)`;
const shots = `Number(document.querySelector('.fps-ammo strong')?.firstChild.textContent)`;
const record = ms => evaluate(`new Promise(resolve=>{const rows=[],end=performance.now()+${ms};function sample(){rows.push({...${motion},t:performance.now(),ammo:${shots},fov:0});if(performance.now()<end)requestAnimationFrame(sample);else resolve(rows)}sample()})`);
const W = ['w', 'KeyW'], SHIFT = ['Shift', 'ShiftLeft'], C = ['c', 'KeyC'], CTRL = ['Control', 'ControlLeft'], SPACE = [' ', 'Space'];
const settle = async () => { for (const k of [W, SHIFT, C, CTRL]) await up(...k); await delay(1200); if ((await evaluate(motion)).stance !== 'stand') await tapKey(...C); await delay(600); };
// Each run goes back along the last one, so the lane stays open.
const about = Math.PI / .0013;
const look = dx => evaluate(`(()=>{const event=new MouseEvent('mousemove');Object.defineProperties(event,{movementX:{value:${dx}},movementY:{value:0}});document.dispatchEvent(event)})()`);
const atPace = async () => { try { await wait(`${motion}.speed>6.3`, 1600); return true; } catch { return false; } };
// Scenery can be in the way of any one line, so a blocked run tries another heading.
const runUp = async () => {
  await look(about); await delay(100); await down(...SHIFT); await down(...W);
  for (let turn = 0; turn < 8 && !await atPace(); turn++) await look(about / 3);
  await wait(`${motion}.speed>6.3`, 2000);
};
const slid = rows => rows.filter(r => r.slide);
try {
  await send('Runtime.enable'); await send('Page.enable');
  // Other sessions' saves must not reload the page mid-run.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{const Real=WebSocket;const Stub=function(url,protocol){if(protocol==='vite-hmr'||protocol==='vite-ping')return{addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Real(url,protocol);};Stub.OPEN=1;Stub.CLOSED=3;Stub.CONNECTING=0;window.WebSocket=Stub;}` });
  await send('Page.navigate', { url: `${origin}/debug` }); await delay(800);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready')); await click(button('Enter range')); await wait(phase('playing'));
  await delay(800);

  await runUp();
  const running = await record(250);
  const sampling = record(1600); await tapKey(...C); const full = await sampling;
  await up(...W); await up(...SHIFT);
  const during = slid(full);
  assert(during.length > 5, 'crouch during a sprint slides');
  const slideTime = during.at(-1).t - during[0].t;
  assert(slideTime > 700 && slideTime < 1800, `a slide lasts about a second (slower if frames clamp), not ${slideTime}`);
  assert(Math.max(...during.map(r => r.speed)) > Math.max(...running.map(r => r.speed)) + .3, `the slide kicks past the run: ${Math.max(...running.map(r => r.speed))} to ${during.map(r => r.speed).slice(0, 8)}`);
  assert(during.at(-1).speed < during[1].speed, 'friction slows it');
  assert(Math.min(...full.map(r => r.eye)) < 1.1, 'the body drops below a crouch');
  assert(Math.max(...during.map(r => r.spread)) > Math.max(...running.map(r => r.spread)), 'a slide is looser than a run');
  const handover = full.slice(full.lastIndexOf(during.at(-1)) + 1);
  assert(Math.min(...handover.map(r => r.speed)) > 2, 'no dead stop as walking takes over');
  assert.equal(full.at(-1).stance, 'stand', 'still holding run, it comes up standing');
  assert(Math.max(...handover.map(r => r.speed)) > 6, 'and running');
  await settle();

  await look(about); await tapKey(...C); await down(...W); const crouchWalk = await record(700); await up(...W); await tapKey(...C);
  assert(!crouchWalk.some(r => r.slide), 'a crouch walk is not a slide');
  await delay(700);
  await down(...W); await wait(`${motion}.speed>3.5`, 3000); await tapKey(...C); const jogCrouch = await record(400); await up(...W); await tapKey(...C);
  assert(!jogCrouch.some(r => r.slide), 'crouching out of a jog is not a slide');
  await delay(700);

  await runUp(); await tapKey(...C); await wait(`${motion}.slide`, 1000); await delay(150); await up(...W); await up(...SHIFT);
  const stays = await record(1800);
  assert(!stays.at(-1).slide && stays.at(-1).stance === 'crouch', 'let go of the run and a toggled slide stays down');
  assert(Math.abs(stays.at(-1).eye - 1.15) < .02, 'at crouch height');
  await tapKey(...C); await delay(700);

  await runUp(); await down(...CTRL); await wait(`${motion}.slide`, 1000); await up(...CTRL); const tapped = await record(1500); await up(...W); await up(...SHIFT);
  assert(tapped.some(r => r.slide && r.t - tapped[0].t > 500), 'a tap of the hold key still gets the whole slide');
  assert.equal(tapped.at(-1).stance, 'stand');
  await delay(1000);

  await runUp(); await tapKey(...C); await wait(`${motion}.slide`, 1000); await delay(200); await tapKey(...C); const cancelled = await record(500); await up(...W); await up(...SHIFT);
  assert(!cancelled.at(-1).slide, 'a second press stands up');
  assert.equal(cancelled.at(-1).stance, 'stand');
  await delay(1000);

  await runUp(); await tapKey(...C); await wait(`${motion}.slide`, 1000); await delay(150); await tapKey(...SPACE); const leap = await record(900); await up(...W); await up(...SHIFT);
  const air = leap.filter(r => !r.grounded);
  assert(air.some(r => r.feet > .4), `a slide jumps: ${Math.max(...leap.map(r => r.feet))}`);
  assert(!leap.at(-1).slide && leap.at(-1).stance === 'stand', 'and stands up to do it');
  assert(air.some(r => r.speed > 5), 'keeping its speed');
  await delay(1000);

  await runUp(); await tapKey(...C); await wait(`${motion}.slide`, 1000);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 450, button: 'left', clickCount: 1 });
  const firing = await record(350);
  await screenshot('sliding-firing');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 450, button: 'left', clickCount: 1 });
  assert(firing.some(r => r.slide && r.ammo < firing[0].ammo), `the gun works mid-slide: ${firing[0].ammo} to ${firing.at(-1).ammo}`);
  await delay(1300); await up(...W); await up(...SHIFT); await delay(1000);

  await runUp(); await tapKey(...C); await wait(`${motion}.slide`, 1000); await tapKey(...C); await delay(60); await tapKey(...C); const again = await record(300); await up(...W); await up(...SHIFT); await delay(500);
  assert(!again.some(r => r.slide), 'cooling down, crouch is only a crouch');
  if ((await evaluate(motion)).stance !== 'stand') await tapKey(...C);
  await delay(800);

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await runUp(); await tapKey(...C); const calm = await record(600); await up(...W); await up(...SHIFT);
  assert(calm.some(r => r.slide), 'reduced motion keeps the slide itself');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await delay(1500);
  assert.deepEqual(errors, []);
  console.log('PASS keys: kick, friction, low eye, loose aim, comes up into a run, stays down without one, no slide from a walk or jog, hold-key tap, cancel, jump out, fires, cooldown, reduced motion.');

  // The same slide from a thumb: the stick at the rim, then Crouch with the other thumb.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.reload'); await delay(800);
  const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, index) => ({ ...p, id: index + 1 })) });
  const lift = () => touch('touchEnd', []).catch(() => {});
  const tap = async expression => { const p = await point(expression); await touch('touchStart', [p]); await delay(40); await lift(); await delay(80); };
  await wait(`document.querySelectorAll('.mode-card').length>2`);
  await tap(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Marina FPS'))`);
  await wait(phase('ready')); await tap(button('Enter range')); await wait(phase('playing')); await delay(800);
  const crouchButton = `document.querySelector('[data-touch-action=crouch]')`, latched = `${crouchButton}.getAttribute('aria-pressed')==='true'`;
  const hub = await point(`document.querySelector('[data-touch-stick]')`), crouchAt = await point(crouchButton);
  const yaw = `Number(document.querySelector('[data-minimap-player]')?.dataset.yaw)`;
  // No pointer lock on a phone: turn round the way a thumb does, by dragging the scene.
  const turnRound = async () => {
    const from = await evaluate(yaw);
    for (let i = 0; i < 14; i++) {
      const now = await evaluate(yaw); if (Math.abs(Math.atan2(Math.sin(now - from), Math.cos(now - from))) > 2.7) return;
      await touch('touchStart', [{ x: 300, y: 110 }]); await delay(30); await touch('touchMove', [{ x: 480, y: 110 }]); await delay(30); await lift(); await delay(60);
    }
    throw new Error('Could not turn round');
  };
  const thumbRun = async () => { await turnRound(); await delay(100); await touch('touchStart', [hub]); await touch('touchMove', [{ x: hub.x, y: hub.y - 90 }]); await wait(`${motion}.speed>6.3`, 3000); };
  const thumbCrouch = async () => { const rim = { x: hub.x, y: hub.y - 90 }; await touch('touchStart', [rim, crouchAt]); };

  // Scenery can stop any one slide short, so a run that was cut off goes again from a new heading.
  const onClearLane = async body => {
    for (let i = 0; i < 6; i++) {
      const done = await body().catch(() => null); if (done) return done;
      await lift(); await delay(200); if (await evaluate(latched)) await tap(crouchButton);
      await delay(900);
    }
    throw new Error('No clear lane for a slide');
  };

  const thumbSlide = await onClearLane(async () => {
    await thumbRun(); const sampling = record(1500); await thumbCrouch(); await delay(250);
    assert.equal(await evaluate(latched), true, 'the button shows crouch held during the slide');
    const rows = await sampling, during = slid(rows);
    return during.length > 5 && during.at(-1).t - during[0].t > 700 ? rows : null;
  });
  assert.equal(thumbSlide.at(-1).stance, 'stand', 'comes up into the run');
  await delay(100); assert.equal(await evaluate(latched), false, 'and the button lets go with it');
  await lift(); await delay(900);

  const stayDown = await onClearLane(async () => {
    await thumbRun(); const sampling = record(1500); await thumbCrouch(); await wait(`${motion}.slide`, 1000); await lift();
    const rows = await sampling;
    return slid(rows).length > 3 ? rows : null;
  });
  assert.equal(stayDown.at(-1).stance, 'crouch', 'thumb off the stick, it stays down');
  assert.equal(await evaluate(latched), true, 'with the button still lit');
  await tap(crouchButton); await delay(700); assert.equal((await evaluate(motion)).stance, 'stand', 'and the button stands up');

  const thumbCancel = await onClearLane(async () => {
    await thumbRun(); await thumbCrouch(); await wait(`${motion}.slide`, 1000); await delay(150);
    if (!(await evaluate(motion)).slide) return null;
    // CDP cannot lift one finger of two, so both come off for this tap.
    await lift(); await tap(crouchButton);
    return record(300);
  });
  await lift();
  assert(!thumbCancel.at(-1).slide && thumbCancel.at(-1).stance === 'stand', 'a second tap stands up out of the slide');
  assert.deepEqual(errors, []);
  console.log('PASS touch: stick at the rim plus Crouch slides, comes up into the run and releases the latch; stays down without the stick; second tap cancels.');
} catch (e) { console.log(errors, await evaluate(`[${motion},document.querySelector('.fps-game')?.dataset.playerX,document.querySelector('.fps-game')?.dataset.playerZ]`).catch(() => null)); await screenshot('failure').catch(() => {}); throw e; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
