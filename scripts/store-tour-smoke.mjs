// Run a local Vite server and an isolated Chrome with --remote-debugging-port=9224.
// No browser automation dependency or remote map requests are needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/store-tour-browser/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/store`)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { const timer=setTimeout(()=>reject(new Error('Chrome connection timeout')),20000); ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=reject; });
let id = 0; const pending = new Map(), errors = []; let mapRequests = 0;
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /maps\.googleapis|streetviewpixels|maps\.google\.com/.test(m.params.request.url)) mapRequests++;
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); } throw new Error(`Timed out waiting for ${expression}`); }
const button = name => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
async function point(expression) { return evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');let r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth){e.scrollIntoView({block:'center'});r=e.getBoundingClientRect();}return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); }
let useTouch = false;
async function click(expression) { const p = await point(expression); if(useTouch){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return;} await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); }
async function key(key, code, held = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code }); if (held) await delay(held); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); }
async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64')); }
const tourText = () => `document.querySelector('.loadout-guide')?.textContent`;
try {
 await send('Runtime.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Page.enable');
 for(const [name,width,height,touch] of [['desktop',1440,1000,false],['mobile',390,844,true],['landscape',844,390,true]]) {
  useTouch=touch;await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
  await send('Page.navigate',{url:origin+'/store'});await wait(`!!document.querySelector('.store-tour-trigger')`);
  const wallet=await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
  await click(`document.querySelector('.store-tour-trigger')`);await wait(`!!document.querySelector('.loadout-guide')`);
  for(const title of ['Choose a slot','Compare before spending','Rent one item at a time','Pack, review and play']){
   await wait(`${tourText()}?.includes(${JSON.stringify(title)})`);
   assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
   await evaluate(`document.querySelector('.loadout-guide').scrollIntoView({block:'start'})`);await screenshot(name+'-'+title.split(' ')[0]);
   await click(`document.querySelector('.loadout-guide .loadout-primary')`);
  }
  await wait(`!document.querySelector('.loadout-guide')`);
  assert.equal(await evaluate(`localStorage.getItem('blockplay.armory.v1')`),wallet,'Tour never purchases or changes loadout');
  await click(`document.querySelector('.store-tour-trigger')`);await wait(`!!document.querySelector('.loadout-guide')`);await key('Escape','Escape');await wait(`!document.querySelector('.loadout-guide')`);
  assert(await evaluate(`document.activeElement.matches('.store-tour-trigger')`),'Close restores focus');
  console.log('PASS '+name+' loadout tour, no purchases, replay, Escape and mobile fit');
 }
 assert.deepEqual(errors,[]);assert.equal(mapRequests,0);
} catch(error){console.error(error);await screenshot('failure').catch(()=>{});process.exitCode=1;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
