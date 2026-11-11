// Vite + Chrome with remote debugging: staged desktop and portrait renders for every food.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/food-animation/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
 await send('Page.navigate',{url:origin+'/scripts/fixtures/food-animation.html'});await wait('window.ready===true');
 const ids=await evaluate('window.review.ids');
 for(const id of ids){
   for(const p of [.2,.38,.51,.7,.84]){await evaluate(`window.review.frame(${JSON.stringify(id)},${p})`);await shot(id+'-'+p);}
   await evaluate(`window.review.frame(${JSON.stringify(id)},0)`);
   const before=await evaluate('JSON.stringify(window.review.supply.root.toJSON())');
   for(const p of [.3,.6,.9,1])await evaluate(`window.review.frame(${JSON.stringify(id)},${p})`);
   await evaluate(`window.review.frame(${JSON.stringify(id)},0)`);
   assert.equal(await evaluate('JSON.stringify(window.review.supply.root.toJSON())'),before);
 }
 await size(390,844,true);for(const id of ids){await evaluate(`window.review.frame(${JSON.stringify(id)},.38)`);await shot(id+'-portrait');}
 await size(1000,720);await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/utility-wheels.html?full'});await wait("window.hud?.phase==='ready'",60000);
 const start=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...start,button:'left',clickCount:1});await wait("window.hud.phase==='playing'");
 for(const id of ids){
   await evaluate(`window.engine.chooseRecovery(${JSON.stringify(id)});window.engine.useSelectedUtility('recovery')`);await wait('!!window.hud.supplyUse');
   await evaluate("window.engine.setInput('fire',true)");await wait('!window.hud.supplyUse');await evaluate("window.engine.setInput('fire',false)");
   assert.equal(await evaluate(`window.consumed.filter(id=>id===${JSON.stringify(id)}).length`),0);
   await delay(250);await evaluate("window.engine.useSelectedUtility('recovery')");await wait('!!window.hud.supplyUse');
   await wait(`window.consumed.includes(${JSON.stringify(id)})`,20000);await wait('!window.hud.supplyUse',10000);
   assert.equal(await evaluate(`window.consumed.filter(id=>id===${JSON.stringify(id)}).length`),1);
   assert.equal(await evaluate('window.hud.recoveryItem.count'),1);
 }
 await shot('gameplay-completed');
 console.log('All eight foods cancel without spending a charge, restart, then consume exactly one charge in the real engine.');
 assert.deepEqual(errors,[]);console.log('All eight food animations render, reset deterministically and render in portrait without browser errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
