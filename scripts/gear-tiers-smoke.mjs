// Local Vite + isolated Chrome. Uses actual catalog data and real pointer/touch clicks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/gear-tiers/store/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0, touch = false; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(method)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Timed out: ${expression}`); }
async function click(selector) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});})()`);
  await delay(150);
  const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();if(!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))throw Error('Covered '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(touch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  await delay(150);
}
const view = name => `document.querySelector('.loadout-store')?.dataset.loadoutView===${JSON.stringify(name)}`;
const wallet = `JSON.parse(localStorage.getItem('blockplay.armory.v1'))`;
async function home() { if (!await evaluate(view('home'))) { await click('[data-loadout-home]'); await wait(view('home')); } }
async function slot(name) { await home(); await click(`[data-loadout-slot="${name}"]`); await wait(view('browse')); }
async function inspect(name) { await click(`[data-item="${name}"]`); await wait(view('detail')); }
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function geometry(name) { const result = await evaluate(`(()=>{const root=document.querySelector('.loadout-store');return {page:document.documentElement.scrollWidth<=innerWidth+1,root:root.scrollWidth<=root.clientWidth+1}})()`); assert(result.page && result.root, `${name}: no horizontal overflow ${JSON.stringify(result)}`); }
const items = [
  ['rig', 'rig-pathfinder', 'Ultra', 10, 26],
  ['rig', 'rig-expedition', 'Legendary', 22, 36],
  ['rig', 'rig-encik', 'Legendary', 30, 40],
  ['rig', 'rig-atlas', 'Mythic', 36, 48],
  ['plate', 'plate-strider', 'Ultra', 14, 24],
  ['plate', 'plate-guardian', 'Legendary', 28, 34],
];
const results = [];
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass:true });
  await send('Emulation.setFocusEmulationEnabled', { enabled:true });
  await send('Page.navigate', { url:origin+'/store' }); await wait(`!!document.querySelector('.loadout-store')`,60000);
  for (const [width,height] of [[1440,1000],[390,844],[320,568],[844,390]]) {
    console.log(`Checking ${width} × ${height}`);
    touch=width<900;
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:touch });
    await send('Emulation.setTouchEmulationEnabled', { enabled:touch,maxTouchPoints:5 });
    await evaluate(`(()=>{const p=${wallet};p.xp=0;p.tokens=10000;p.rentals={};p.rig='rig-ilbv';p.plate='plate-none';localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));window.oldGearPage=true;})()`);
    await send('Page.reload', { ignoreCache:true }); await wait(`!window.oldGearPage && !!document.querySelector('.loadout-store')`); await delay(700);
    for (const [category,id,tier,level] of items) {
      await slot(category);
      assert((await evaluate(`document.querySelector('[data-item="${id}"]').textContent`)).includes(tier));
      await inspect(id);
      assert((await evaluate(`document.querySelector('.loadout-store').textContent`)).includes(`Reach level ${level}`));
      assert(!await evaluate(`!!document.querySelector('[data-choose-rental]')`));
      await geometry(`${width}-${id}-locked`);
    }
    await evaluate(`(()=>{const p=${wallet};p.xp=1000000;localStorage.setItem('blockplay.armory.v1',JSON.stringify(p));window.oldGearPage=true;})()`);
    await send('Page.reload', { ignoreCache:true }); await wait(`!window.oldGearPage && !!document.querySelector('.loadout-store')`); await delay(700);
    for (const [category,id,tier,level,price] of items) {
      await slot(category);
      await wait(`Array.from(document.querySelectorAll('.loadout-items img')).every(i=>i.complete && i.naturalWidth>0)`);
      if(id==='rig-atlas'||id==='plate-guardian')await screenshot(`${width}-${category}-catalog`);
      await inspect(id); await geometry(`${width}-${id}-detail`);
      await screenshot(`${width}-${id}-detail`);
      const before=await evaluate(wallet);
      await click('[data-choose-rental]');await click('[data-rental-term="1h"]');
      if(!await evaluate(`document.querySelector('.loadout-checkbox input').checked`))await click('.loadout-checkbox input');
      await click('[data-confirm-rental]');
      await wait(`${wallet}.${category}==='${id}' && ${wallet}.rentals['${id}']===3600000`);
      assert.equal((await evaluate(wallet)).tokens,before.tokens-price);
      results.push({width,id,tier,level,price});
    }
    await slot('plate');
    for(const [id,tier] of [['plate-composite','Ultra'],['plate-durian','Legendary'],['plate-pillbox','Legendary']]) {
      assert((await evaluate(`document.querySelector('[data-item="${id}"]').textContent`)).includes(tier));
    }
    await geometry(`${width}-plates`);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,results,errors},null,2));
  console.log('PASS: six expanded gear items and three reclassified inserts; unlocks, tier labels, thumbnails, hourly rent/equip and wallet charges at desktop, 390, 320 and landscape; no overflow or runtime exceptions.');
} catch(error) { await screenshot('failure'); console.log(await evaluate(`({width:innerWidth,view:document.querySelector('.loadout-store')?.dataset.loadoutView,text:document.querySelector('.loadout-store')?.textContent})`)); throw error; } finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
