// The field kit in a real browser: the M district map, hit-direction arcs from
// counter-fire, a field dressing used (and put away when the trigger is pulled),
// times of day with sun shadows, and an expedition with healing, burst-firing
// patrols. Run a local Vite server and an isolated Chrome with
// --remote-debugging-port=9228, as the other smokes do.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-field-kit/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
async function click(expression) { const p = await point(expression); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const canvasData = name => evaluate(`document.querySelector('.fps-game canvas')?.dataset[${JSON.stringify(name)}] ?? ''`);
const hp = `Number(document.querySelector('.fps-game').dataset.health)`;
const supplies = `Number(document.querySelector('[data-testid="quick-item"] .fps-selected')?.textContent.replace('x', ''))`;
/** Picks a time of day from the pause menu's World conditions, the way a player would. */
async function timeOfDay(value) {
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Time of day"]');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  // A clean afternoon and two field dressings in the quick slot.
  await wait(`document.querySelectorAll('.location-card').length>0`);
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables['kit-dressing']=2;p.quickItem='kit-dressing';localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));
    localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({weather:'sunny',celebration:'none',timeOfDay:'afternoon',reducedEffects:false,shadows:true}));})()`);
  await send('Page.reload'); await delay(1500); await wait(`document.readyState==='complete' && document.querySelectorAll('.location-card').length>0`);
  await click(`[...document.querySelectorAll('.location-card')].find(b=>b.querySelector('strong')?.textContent==='Marina Bay')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000);
  await click(button('Counter-fire · +100 CR')); await wait(phase('ready'));
  await click(button('Enter range')); await wait(phase('playing'));
  assert(await evaluate('!!document.pointerLockElement'), 'mouse is captured');
  console.log(`sun shadows: ${await canvasData('sunShadows')} · sun elevation ${await canvasData('timeOfDay')}°`);

  // M opens the whole district and closes it again.
  await key('m', 'KeyM'); await wait(`!!document.querySelector('.fps-minimap.is-expanded')`);
  assert(await evaluate(`document.querySelectorAll('.fps-minimap.is-expanded [data-minimap-marker]').length>=8`), 'the district map shows every target and vehicle');
  await screenshot('map-expanded');
  await key('m', 'KeyM'); await wait(`!document.querySelector('.fps-minimap.is-expanded') && !!document.querySelector('.fps-minimap')`);
  console.log('PASS map: M opens the whole-district map over the scene and closes it.');

  // Counter-fire: every hit draws an arc towards the target that fired it.
  const full = await evaluate(hp);
  await wait(`${hp}<${full}`, 20000);
  await wait(`Number(document.querySelector('.fps-hit-directions')?.dataset.count)>=1`, 3000);
  const arc = await evaluate(`(()=>{const a=[...document.querySelectorAll('.fps-hit-direction')].find(a=>!a.hidden);return a&&{t:a.style.transform,o:Number(a.style.opacity)}})()`);
  assert(arc && /rotate\(-?[\d.]+deg\)/.test(arc.t) && arc.o > .2, `an arc is drawn (${JSON.stringify(arc)})`);
  await screenshot('hit-direction');
  console.log(`PASS hit directions: counter-fire drew an arc (${arc.t}).`);

  // G raises a dressing: the weapon goes down, the cue counts up, and health comes back when it commits.
  assert.equal(await evaluate(supplies), 2);
  await key('g', 'KeyG');
  await wait(`(document.querySelector('.fps-game canvas').dataset.supplyUse||'').startsWith('bandage')`, 3000);
  await wait(`Number((document.querySelector('.fps-game canvas').dataset.supplyUse||':0').split(':')[1])>.5`, 4000);
  assert(await evaluate(`!!document.querySelector('.fps-supply-cue')`), 'the HUD shows the dressing being applied');
  await screenshot('supply-dressing');
  const before = await evaluate(hp);
  await wait(`${supplies}===1`, 4000);
  assert((await evaluate(hp)) > before, 'the dressing restored health');
  await wait(`!document.querySelector('.fps-game canvas').dataset.supplyUse`, 3000);
  console.log('PASS supply: a dressing lowers the weapon, applies over time and restores health.');

  // A fresh trigger pull puts the next one away without spending it.
  await wait(`${hp}<Number(document.querySelector('.fps-vitals small')?.textContent.replace(/\D/g, '') || 100)`, 20000);
  await key('g', 'KeyG'); await wait(`(document.querySelector('.fps-game canvas').dataset.supplyUse||'').startsWith('bandage')`, 3000);
  await delay(500);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'left', clickCount: 1 }); await delay(120);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'left', clickCount: 1 });
  await wait(`!document.querySelector('.fps-game canvas').dataset.supplyUse`, 1500);
  assert.equal(await evaluate(supplies), 1, 'an interrupted dressing is kept');
  console.log('PASS supply: firing puts a dressing away and keeps it.');

  // Times of day, from the pause menu.
  for (const time of ['dawn', 'noon', 'dusk', 'night']) {
    await key('Escape', 'Escape'); await wait(phase('paused'));
    await timeOfDay(time); await delay(200);
    await click(button('Resume exercise')); await wait(phase('playing'));
    await delay(3500); await screenshot(`time-${time}`);
    console.log(`time ${time}: sun elevation ${await canvasData('timeOfDay')}° · shadows ${await canvasData('sunShadows')}`);
  }
  assert.equal(Number(await canvasData('timeOfDay')) < 0, true, 'night puts the sun below the horizon');

  // An expedition: patrols fire their own weapons and the district runs clean.
  if (await evaluate(phase('playing'))) { await key('Escape', 'Escape'); await wait(phase('paused')); }
  await timeOfDay('afternoon');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Open world').click()`);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enter district')&&!b.disabled)`, 60000);
  await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enter district'))`); await wait(phase('playing'));
  await key('m', 'KeyM'); await wait(`!!document.querySelector('.fps-minimap.is-expanded .fps-map-sector')`);
  await screenshot('expedition-map'); await key('m', 'KeyM');
  await delay(8000); await screenshot('expedition');
  assert.deepEqual(errors, []);
  console.log('PASS expedition: the district map names its sectors and the patrols run without errors.');
} catch (error) {
  console.log(errors, await evaluate(`({ phase: document.querySelector('.fps-game')?.dataset.phase, message: document.querySelector('.fps-capture-error, .fps-message')?.textContent })`).catch(() => null));
  await screenshot('field-kit-failure'); throw error;
}
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
