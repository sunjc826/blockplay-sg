// Vite + Chrome with remote debugging: staged desktop and portrait renders for every food.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/utility-animation/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); await delay(300); }
try {
 await send('Runtime.enable');await send('Page.enable');await size(1000,720);
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-animation.html'});await wait('window.ready===true');
 const ids=await evaluate('window.review.ids');
 for(const id of ids){
   for(const p of [.2,.38,.6,.78,.9]){await evaluate(`window.review.frame(${JSON.stringify(id)},${p})`);await shot(id+'-'+p);}
   await evaluate(`window.review.frame(${JSON.stringify(id)},0)`);
   const before=await evaluate('JSON.stringify([window.review.supply.root.toJSON(),window.review.grenades.root.toJSON()])');
   for(const p of [.3,.6,.9,1])await evaluate(`window.review.frame(${JSON.stringify(id)},${p})`);
   await evaluate(`window.review.frame(${JSON.stringify(id)},0)`);
   assert.equal(await evaluate('JSON.stringify([window.review.supply.root.toJSON(),window.review.grenades.root.toJSON()])'),before);
 }
 await size(390,844,true);for(const id of ids){await evaluate(`window.review.frame(${JSON.stringify(id)},.38)`);await shot(id+'-portrait');}
 await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 for(const id of ids.filter(id=>id.startsWith('kit-'))){
  await size(390,844,true);
  await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-use.html'});await wait("window.hud?.phase==='ready'",90000);
  const point=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("window.hud.phase==='playing'");
  const meta=await evaluate(`window.utilityMeta.find(item=>item.id===${JSON.stringify(id)})`),kind=meta.kind;
  const count=()=>evaluate(`window.hud.belt.find(slot=>slot.kind===${JSON.stringify(kind)}).count`),before=await count();
  const use=`window.engine.useUtility(${JSON.stringify(kind)},${JSON.stringify(id)})`;
  await evaluate(use);await wait('!!window.hud.supplyUse');
  await evaluate("window.engine.setInput('fire',true)");await wait('!window.hud.supplyUse');await evaluate("window.engine.setInput('fire',false)");assert.equal(await count(),before);
  await delay(300);await evaluate(use);await wait('!!window.hud.supplyUse');
  await wait("JSON.parse(document.querySelector('#world canvas').dataset.utilityView||'{}').supplyVisible===true");
  assert(await evaluate("JSON.parse(document.querySelector('#world canvas').dataset.utilityView).supplyDepth<-.1"));
  await delay(600);await shot(id+'-gameplay');
  await wait(`window.hud.belt.find(slot=>slot.kind===${JSON.stringify(kind)}).count===${before-1}`,15000);await wait('!window.hud.supplyUse');
  if(meta.effect.health)assert((await evaluate('window.hud.health'))>10);
  if(meta.effect.armor)assert((await evaluate('window.hud.armor'))>0);
  await wait("!JSON.parse(document.querySelector('#world canvas').dataset.ammoPlacement||'{}').visible",20000);
  console.log('PASS use/cancel/commit/portrait '+id);
 }
 await size(390,844,true);await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html?full'});await wait("window.hud?.phase==='ready'",90000);
 const point=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("window.hud.phase==='playing'");
 await evaluate('window.engine.configureDebug({healthMultiplier:10,regeneration:false,combatEvents:false})');
 for(const id of ids.filter(id=>id.startsWith('grenade-'))){
  await evaluate(`window.engine.chooseGrenade(${JSON.stringify(id)});window.engine.useSelectedUtility('combat')`);await wait('!!window.hud.grenadeHeld');
  const count=await evaluate('window.hud.combatItem.count');
  await evaluate(`window.engine.chooseGrenade(${JSON.stringify(id)})`);assert.equal(await evaluate('window.hud.combatItem.count'),count);await wait('!window.hud.grenadeHeld');
  await delay(300);await evaluate("window.engine.useSelectedUtility('combat')");await wait('!!window.hud.grenadeHeld');await delay(400);
  assert(await evaluate("JSON.parse(document.querySelector('#world canvas').dataset.utilityView).grenadeDepth<-.3"));
  await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.grenadeHeld?.pinned');await delay(120);await evaluate("window.engine.setInput('fire',false)");
  await wait(`window.hud.combatItem.count===${count-1}`);await wait("!JSON.parse(document.querySelector('#world canvas').dataset.utilityView).grenadeVisible");await delay(1000);
  console.log('PASS ready/stow/throw/portrait '+id);
 }
 assert.deepEqual(errors,[]);console.log('All 7 utility supplies and 13 throwables render and replay on desktop and portrait without runtime errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
