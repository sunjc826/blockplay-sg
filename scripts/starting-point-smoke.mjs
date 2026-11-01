// Vite + isolated Chrome CDP; never uses a personal browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5199';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9361';
const output = new URL('../.cache/starting-point-fit/', import.meta.url);
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
  const point = await evaluate(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');if(getComputedStyle(e).display==='none')e=e.parentElement.querySelector('.starting-region-number');if(!e.closest('.starting-picker'))e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
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
async function assertFits() {
  const layout = await evaluate(`(()=>{const root=document.documentElement,view=document.querySelector('.starting-map-viewport'),button=document.querySelector('.starting-deploy'),name=document.querySelector('.starting-place'),svg=view.querySelector('svg');const fits=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};const controls=[button,name,...document.querySelectorAll('.starting-browse button'),document.querySelector('.starting-header a')];return{width:innerWidth,height:innerHeight,scrollX,scrollY,pageFits:root.scrollWidth<=innerWidth+1&&root.scrollHeight<=innerHeight+1,mapFits:view.scrollWidth<=view.clientWidth+1&&view.scrollHeight<=view.clientHeight+1,controlsFit:controls.every(fits),svgFits:fits(svg)}})()`);
  assert(layout.pageFits && layout.mapFits && layout.controlsFit && layout.svgFits && layout.scrollX===0 && layout.scrollY===0, JSON.stringify(layout));
}
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.pickerAudio=[];window.pickerTracks=[];const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.pickerTracks.push(a);return a;};window.Audio.prototype=NativeAudio.prototype;const nativePlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const src=this.src;if(src.includes('/audio/menu/'))window.pickerAudio.push({event:'play',src,rate:this.playbackRate});const p=nativePlay.call(this);p.then(()=>{if(src.includes('/audio/menu/'))window.pickerAudio.push({event:'started',src})},()=>{});return p;};` });
  await send('Page.navigate', { url: origin + '/training' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await assertPicker('training');
  await assertFits();
  await wait(`window.pickerTracks?.length===2&&window.pickerTracks.every(a=>a.readyState>=2)`);
  const savedProfile = await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
  const ids = await evaluate(`[...document.querySelectorAll('[data-start-region]')].map(e=>e.dataset.startRegion)`);
  for (const id of ids) {
    await click(`[data-start-region="${id}"] .starting-region-label`);
    assert.equal(await evaluate(`document.querySelector('[data-start-region][aria-pressed=true]').dataset.startRegion`), id, 'Every region has a working map hit area');
  }
  assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 0);
  await click('[data-start-region="queenstown"] .starting-region-label');
  await screenshot('training-desktop');
  await delay(300);
  const beforeClick = await evaluate(`window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('click')).length`);
  await click('[aria-label="Next district"]');
  assert.equal(await evaluate(`window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('click')).length`), beforeClick+1, 'One click cue for a district step');
  assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`), 'chinatown');
  await click('[aria-label="Previous district"]');
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:10, y:10 });
  await delay(300);
  const point = await evaluate(`(()=>{const r=document.querySelector('[data-start-region="woodlands"] .starting-region-label').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', ...point });
  await wait(`window.pickerAudio.some(e=>e.event==='started'&&e.src.includes('hover'))`);
  await wait(`window.pickerAudio.some(e=>e.event==='started'&&e.src.includes('click'))`);
  assert(await evaluate(`window.pickerAudio.filter(e=>e.event==='play').every(e=>e.rate===1)`), 'Published ElevenLabs recordings play at natural speed');
  const audioEvidence = await evaluate(`window.pickerAudio`);
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
  const sizes = [[1440,900],[1280,720],[1024,600],[768,1024],[390,844],[360,640],[320,568],[844,390],[667,375],[568,320]];
  for (const [width,height] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:width<=844 });
    await assertFits();
    for (const id of ids) {
      await click(`[data-start-region="${id}"] .starting-region-label`);
      assert.equal(await evaluate(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion`),id,`${width}x${height}: all regions selectable without scrolling`);
      await assertFits();
    }
    await click('[data-start-region="katong-joo-chiat"] .starting-region-label');
    await assertFits();
    await screenshot(`fit-${width}x${height}`);
  }
  await send('Input.dispatchMouseEvent', { type:'mouseWheel',x:200,y:200,deltaY:400,deltaX:300 });
  await delay(100);await assertFits();
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touchPoint = await evaluate(`(()=>{const r=document.querySelector('[data-start-region="pulau-ubin"] .starting-region-number').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const beforeTouch = await evaluate(`({hover:window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('hover')).length,click:window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('click')).length})`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPoint,radiusX:4,radiusY:4,force:1,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(`document.querySelector('[aria-pressed=true][data-start-region]').dataset.startRegion==='pulau-ubin'`);
  const afterTouch = await evaluate(`({hover:window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('hover')).length,click:window.pickerAudio.filter(e=>e.event==='play'&&e.src.includes('click')).length})`);
  assert.equal(afterTouch.hover,beforeTouch.hover,'Touch selection has no hover cue');
  assert.equal(afterTouch.click,beforeTouch.click+1,'Touch selection has one click cue');
  await assertFits();
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
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
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ passed: true, districts: ids.length, sizes, audioEvidence, touch: {beforeTouch,afterTouch}, errors, mapRequests, checks: ['direct entry', 'all region hit areas', 'keyboard', 'explicit training deployment', 'change district', 'menu world entry', 'world deployment', 'remembered choices', 'portrait', 'landscape', 'store entry', 'no premature renderer', 'no profile mutations', 'ten viewport sizes without scrolling', 'all region hit areas at every size', 'natural-speed ElevenLabs hover and click playback', 'touch selection without hover audio'] }, null, 2));
  console.log('PASS: all 23 regions at ten viewport sizes without scrolling, visible deploy and district controls, keyboard, ElevenLabs hover/click playback, deployment in both modes, remembered choices, menu/Store/direct entry, cleanup and no map requests.');
} catch (error) { await screenshot('failure'); console.error('Browser errors:', errors); throw error; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
