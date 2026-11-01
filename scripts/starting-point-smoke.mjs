// Vite + isolated Chrome CDP; never uses a personal browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5199';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9361';
const output = new URL('../.cache/starting-point/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/training')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [], mapRequests = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(message.params.request.url)) mapRequests.push(message.params.request.url);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(200); }
  throw Error(`Timed out: ${expression}`);
}
async function click(selector) {
  await wait(`!document.querySelector('.route-wipe')`);
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}
async function key(key, code = key) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
async function screenshot(name) {
  await delay(200); // Let the selection colour transition finish.
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(shot.data, 'base64'));
}
const picker = mode => `document.querySelector('.starting-picker')?.dataset.mode==='${mode}'`;
async function assertPicker(mode) {
  await wait(picker(mode));
  assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 0, 'No game is constructed before deployment');
  assert.equal(await evaluate(`document.querySelectorAll('.starting-picker select').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-start-region]').length`), 23);
}
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await assertPicker('training');
  const savedProfile = await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
  const ids = await evaluate(`[...document.querySelectorAll('[data-start-region]')].map(e=>e.dataset.startRegion)`);
  for (const id of ids) {
    await click(`[data-start-region="${id}"] .starting-region-label`);
    assert.equal(await evaluate(`document.querySelector('[data-start-region][aria-pressed=true]').dataset.startRegion`), id, 'Every region has a working map hit area');
  }
  assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 0);
  await click('[data-start-region="queenstown"] .starting-region-label');
  await screenshot('training-desktop');
  await evaluate(`document.querySelector('[data-start-region="changi"]').focus()`);
  await key('Enter');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'changi');
  await key('ArrowRight');
  assert.equal(await evaluate(`document.activeElement.dataset.startRegion`), 'upper-thomson');
  await key(' ', 'Space');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'upper-thomson');
  await click('[data-start-region="queenstown"] .starting-region-label');
  await click('.starting-deploy');
  await wait(`document.querySelector('.fps-game')?.dataset.phase==='ready'`, 120000);
  await wait(`!document.querySelector('.play-loading:not(.is-leaving)')`);
  assert.equal(await evaluate(`localStorage.getItem('blockplay.menu.training')`), 'queenstown');
  assert.equal(await evaluate(`document.querySelector('.fps-game').dataset.mapZone`), 'queenstown');
  await click('[aria-label="Change starting district"]');
  await assertPicker('training');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'queenstown');
  await click('.starting-header a');
  await wait(`!!document.querySelector('.game-menu')`);
  await click('a[href="/world"]');
  await assertPicker('world');
  await click('[data-start-region="yishun"] .starting-region-label');
  assert(await evaluate(`document.querySelector('.starting-brief').textContent.includes('HIGH THREAT')`));
  await screenshot('world-desktop');
  await click('[data-start-region="kampong-glam"] .starting-region-label');
  await click('.starting-deploy');
  await wait(`document.querySelector('.expedition-game')?.dataset.zone==='kampong-glam'`, 120000);
  await wait(`document.querySelector('.expedition-game')?.dataset.phase==='ready'`, 120000);
  assert.equal(await evaluate(`localStorage.getItem('blockplay.menu.world')`), 'kampong-glam');
  await send('Page.navigate', { url: origin + '/world' });
  await assertPicker('world');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'kampong-glam');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('[data-start-region="pulau-ubin"] .starting-region-label');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'pulau-ubin');
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Phone has no horizontal page overflow');
  assert(await evaluate(`(()=>{const e=document.querySelector('.starting-details'),r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&document.querySelector('.starting-layout').scrollLeft===0})()`), 'Panning the map never clips the details or deploy button');
  await screenshot('world-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await screenshot('world-landscape');
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Landscape has no horizontal page overflow');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/store' });
  await wait(`!!document.querySelector('[data-deploy="training"]')`);
  await click('[data-deploy="training"]');
  await assertPicker('training');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'queenstown', 'Training and World remember separate choices');
  // Merely browsing does not overwrite the remembered deployment.
  await click('[data-start-region="changi"] .starting-region-label');
  assert.equal(await evaluate(`localStorage.getItem('blockplay.menu.training')`), 'queenstown');
  assert.equal(await evaluate(`localStorage.getItem('blockplay.armory.v1')`), savedProfile, 'Choosing a starting district does not change the loadout');
  assert.deepEqual(mapRequests, [], 'No external map requests');
  assert.deepEqual(errors, [], 'No browser exceptions');
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ passed: true, districts: ids.length, errors, mapRequests, checks: ['direct entry', 'all region hit areas', 'keyboard', 'explicit training deployment', 'change district', 'menu world entry', 'world deployment', 'remembered choices', 'portrait', 'landscape', 'store entry', 'no premature renderer', 'no profile mutations'] }, null, 2));
  console.log('PASS: region picker, 23 map hit areas, keyboard, explicit deployment in both modes, remembered choices, menu/Store/direct entry, mobile layouts, renderer cleanup and no external map requests.');
} catch (error) { await screenshot('failure'); console.error('Browser errors:', errors); throw error; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
