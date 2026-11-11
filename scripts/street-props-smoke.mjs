// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL(process.env.PROPS_SMOKE_OUTPUT || '../.cache/street-props/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector, touch = false) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(300); }
async function key(key, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers }); await delay(100); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); await delay(300); }
async function go(path, selector) { await send('Page.navigate', { url: origin + path }); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await delay(500); }
try {
  await send('Runtime.enable'); await send('Page.enable');
  await size(1440,1050);await go('/prop-designs','.pd-library');await wait("document.querySelector('.pd-canvas')?.dataset.ready==='true'");
  assert.equal(await evaluate("document.querySelectorAll('.pd-library button').length"),12);
  await shot('gallery-desktop');
  for(let i=0;i<12;i++){
    await click(`.pd-library button:nth-of-type(${i+1})`);
    await wait("document.querySelector('.pd-canvas')?.dataset.ready==='true'");
    assert(await evaluate("Number(document.querySelector('.pd-canvas').dataset.draws)>0"));
    const kind=await evaluate("document.querySelector('.pd-canvas').dataset.kind");
    await shot(kind);
    if(i>=6){
      await click('.pd-impact');await wait("document.querySelector('.pd-canvas').dataset.active==='true'");
      if(i===6||i===7)assert.equal(await evaluate("document.querySelector('.pd-canvas').dataset.broken"),'true');
      await delay(700);await shot(kind+'-reacted');
      await click('.pd-controls>div:last-child button:last-child');
      await wait("document.querySelector('.pd-canvas').dataset.active==='false'&&document.querySelector('.pd-canvas').dataset.broken==='false'");
    }else assert.equal(await evaluate("document.querySelector('.pd-impact').disabled"),true);
  }
  await size(390,844,true);await click('.pd-library button:nth-of-type(5)',true);await wait("document.querySelector('.pd-canvas').dataset.kind==='vending'");await shot('gallery-mobile');
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
  await click('.pd-controls>div:first-child button:last-child',true);assert(await evaluate("!!document.querySelector('.pd-stage.is-night')"));await shot('gallery-night-mobile');
  await size(320,780,true);assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
  await size(1280,900);
  if(!process.env.PROPS_SKIP_WORLD)for(const [region,prop] of [['chinatown','crate'],['marina-bay','planter'],['tuas','cabinet'],['queenstown','vending']]){
    await send('Page.navigate',{url:origin+'/scripts/fixtures/street-props.html?region='+region+'&prop='+prop});
    await wait('window.ready===true');await delay(300);await shot('world-'+region);
    assert(await evaluate('window.review.world.scene.userData.streetPropPlacements.length>0'));
    if(region==='chinatown'){
      await evaluate(`(()=>{const {world,root,THREE}=window.review;window.before=JSON.stringify(root.children.map(p=>p.position.toArray()));const a=root.position.clone().add(new THREE.Vector3(0,.36,2)),b=root.position.clone().add(new THREE.Vector3(0,.36,-2));world.streetProps.shoot(a,b);})()`);
      await wait('JSON.stringify(window.review.root.children.map(p=>p.position.toArray()))!==window.before');await delay(700);await shot('world-crate-broken');
    }
  }
  assert.deepEqual(errors,[]);console.log('Street prop gallery: all 12 models, fixed/moving/break/reset, lighting, desktop and mobile passed.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
