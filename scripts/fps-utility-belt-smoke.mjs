// Run a local Vite server and isolated Chrome with --remote-debugging-port=9228.
// Covers number-row/keypad belt shortcuts, actual supply use, repeat and pause guards.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/fps-utility-belt/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/debug`)}`, { method: 'PUT' })).json();
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
async function key(key, code, keypad = false) { const params = { key, code, isKeypad: keypad, location: keypad ? 3 : 0 }; await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const phase = value => `document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;

const slot = kind => `document.querySelector('.fps-belt-slot[data-kind="${kind}"]')`;
const selected = kind => `${slot(kind)}?.getAttribute('aria-pressed')==='true'`;
const count = kind => `Number(${slot(kind)}?.dataset.count)`;
const idle = `!document.querySelector('.fps-game canvas')?.dataset.supplyUse`;
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await wait(`document.querySelectorAll('.location-card').length>0`);
  await evaluate(`(async()=>{const m=await import('/src/game/armory-state.ts');const p=m.createProfile();p.consumables={'kit-ammo':3};p.quickItem='kit-ammo';localStorage.setItem(m.STORAGE_KEY,JSON.stringify(p));})()`);
  await send('Page.reload'); await delay(1500);
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await click(`[...document.querySelectorAll('button')].find(b=>b.querySelector('strong')?.textContent==='Marina FPS')`);
  await wait(phase('ready'), 60000);
  await click(button('Enter range')); await wait(phase('playing'));
  assert(await evaluate('!!document.pointerLockElement'), 'mouse is captured');
  for (const keypad of [false, true]) {
    for (const [digit, kind] of [['4', 'food'], ['5', 'bandage'], ['6', 'first-aid'], ['7', 'plates'], ['8', 'ammo']]) {
      await key(digit, `${keypad ? 'Numpad' : 'Digit'}${digit}`, keypad);
      await wait(selected(kind), 3000);
      if (kind === 'ammo') {
        await wait(`!(${idle})`, 3000);
        await wait(`${count('ammo')}===${keypad ? 1 : 2}`, 6000);
        await wait(idle, 4000);
      } else {
        assert(await evaluate(`document.querySelector('.fps-message')?.textContent.includes('No ${kind === 'first-aid' ? 'first aid' : kind} on the belt.')`), `${kind} reports an empty slot`);
      }
    }
    console.log(`PASS: ${keypad ? 'numeric keypad' : 'number row'} 4–8 selects every belt slot and uses ammo.`);
  }
  // Held keys must not select another slot or spend supplies repeatedly.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '4', code: 'Digit4', autoRepeat: true });
  assert(await evaluate(selected('ammo')), 'repeated number key does not change selection');
  await key('g', 'KeyG');
  await wait(`${count('ammo')}===0`, 6000); await wait(idle, 4000);
  console.log('PASS: G reuses the last numbered slot and held number keys are ignored.');
  await key('Escape', 'Escape'); await wait(phase('paused'));
  await key('4', 'Numpad4', true);
  assert(await evaluate(phase('paused')), 'number keys leave the game paused');
  await click(button('Resume')); await wait(phase('playing'));
  assert(await evaluate(selected('ammo')), 'paused number keys do not change selection');
  assert.deepEqual(errors, []);
} catch (error) {
  console.log(errors, await evaluate(`({phase:document.querySelector('.fps-game')?.dataset.phase,message:document.querySelector('.fps-message')?.textContent})`).catch(()=>null));
  await screenshot('failure'); throw error;
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
