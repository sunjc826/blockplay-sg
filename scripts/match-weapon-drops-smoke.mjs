// Real FPS renderer and guest runtime backed by an in-memory authoritative match.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9387';
const output=new URL('../.cache/match-weapon-drops/',import.meta.url);await fs.mkdir(output,{recursive:true});
for(const mode of ['ffa','tdm','hardpoint']) {
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/match-weapon-drops.html?mode='+mode),{method:'PUT'})).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw new Error('Timed out waiting for ' + expression);
}
async function key(key, code) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(new URL(name + '.png', output), Buffer.from(shot.data, 'base64'));
}
try {
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,90000);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:45,y:20,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:45,y:20,button:'left',clickCount:1});
 await wait(`hud.phase==='playing'`);
 await evaluate(`makeDrop()`);
 for(let i=0;i<35 && !await evaluate('!!hud.lootCard');i++){await evaluate('engine.lookBy(0,5)');await delay(100);}
 await wait(`hud.lootCard?.name==='G36'`);
 assert.match(await evaluate('hud.lootCard.note'),/Full magazine.*spare ammo/);
 await screenshot(mode+'-keyboard');
 await key('e','KeyE');await wait(`hud.weapon===6 && hud.arenaSelf.weaponPickup?.catalogId==='g36-rifle'`);
 assert(await evaluate('hud.magazine>0 && hud.reserve>0'));
 assert.equal(await evaluate('JSON.stringify(profile)===original'),true);
 assert.equal(await evaluate('hud.fieldLoot.length'),0);
 const full=await evaluate('hud.magazine');await evaluate(`engine.setInput('fire',true)`);await delay(250);await evaluate(`engine.setInput('fire',false)`);
 await wait(`hud.magazine<${full}`);const spent=await evaluate('hud.magazine');await delay(500);assert.equal(await evaluate('hud.magazine'),spent);
 await evaluate('engine.reload()');await wait(`hud.reloading>0`);await wait(`hud.reloading===0 && hud.magazine>=${full}`,15000);
 // Another variant through the actual touch pickup button.
 await evaluate(`window.touch=true;makeDrop('g36c');renderHud()`);
 await wait(`hud.lootCard?.name==='G36C' && document.querySelector('[data-touch-action="loot"]')`);
 await screenshot(mode+'-touch');
 const point=await evaluate(`(()=>{const r=document.querySelector('[data-touch-action="loot"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:3,radiusY:3}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(`hud.arenaSelf.weaponPickup?.catalogId==='g36c' && hud.fieldLoot.length===0`);
 assert(await evaluate('hud.magazine>0 && hud.reserve>0'));
 await evaluate('die()');await wait('hud.arenaSelf?.alive===false');
 await wait('hud.arenaSelf?.alive===true',20000);await wait('hud.weapon===0 && !hud.arenaSelf.weaponPickup');
 assert.equal(await evaluate('JSON.stringify(profile)===original'),true);
 assert.deepEqual(errors,[]);console.log('PASS '+mode+': keyboard, touch, full magazine/reserve, host receipt, original profile, respawn');
} finally { ws.close();await fetch(chrome+'/json/close/'+tab.id); }
}
