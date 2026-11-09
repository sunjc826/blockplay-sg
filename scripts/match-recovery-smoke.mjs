// Real FPS renderer and guest runtime backed by an in-memory authoritative match.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9389';
const output=new URL('../.cache/match-recovery/',import.meta.url);await fs.mkdir(output,{recursive:true});
for(const mode of ['ffa','tdm','hardpoint']) {
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/match-recovery.html?mode='+mode),{method:'PUT'})).json();
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
  console.error('TIMEOUT STATE',await evaluate(`({health:hud?.health,max:hud?.maxHealth,phase:hud?.phase,alive:hud?.arenaSelf?.alive,html:document.querySelector('#hud')?.innerHTML})`),errors);
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
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,90000);
 // Touch entry avoids requiring desktop pointer capture; keyboard events still
 // exercise the real E and held movement bindings below.
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:45,y:20,id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(`hud.phase==='playing'`);
 await evaluate('hurt()');await wait('hud.health===20');
 await evaluate('advance(6)');assert.equal(await evaluate('hud.health'),20);
 await evaluate('advance(4)');await wait('hud.health>20 && hud.health<65');
 assert.equal(await evaluate('hud.armor'),0);
 await evaluate('hurt(40)');await wait(`document.querySelector('.fps-blood-border')?.dataset.healthBand==='low'`);await delay(500);
 const low=await evaluate(`Number(getComputedStyle(document.querySelector('.fps-blood-border')).opacity)`);await screenshot(mode+'-low-health');
 await evaluate('hurt(5)');await wait(`document.querySelector('.fps-blood-border')?.dataset.healthBand==='critical'`);await delay(500);
 assert(await evaluate(`Number(getComputedStyle(document.querySelector('.fps-blood-border')).opacity)>${low}`));await screenshot(mode+'-critical-health');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.fps-blood-border'),'::after').animationName`),'none');
 await send('Emulation.setEmulatedMedia',{features:[]});
 await evaluate('hurt(100)');await wait(`getComputedStyle(document.querySelector('.fps-blood-border')).opacity==='0'`);

 const drop=await evaluate('makeArmorDrop()');assert(drop,'bot leaves armor');
 for(let i=0;i<35 && !await evaluate("hud.lootCard?.kind==='armor'");i++){await evaluate('engine.lookBy(0,5)');await delay(100);}
 await wait("hud.lootCard?.kind==='armor'");assert.equal(await evaluate('hud.lootCard.action'),'Equip');
 await screenshot(mode+'-armor-keyboard');await key('e','KeyE');
 await wait('hud.arenaSelf.armorPickup && hud.armor>0 && hud.fieldLoot.filter(l=>l.kind==="armor").length===0');
 assert.equal(await evaluate('JSON.stringify(profile)===original'),true);
 await evaluate('breakArmor()');await wait(`!!document.querySelector('.fps-armor-break')`);await screenshot(mode+'-armor-break');
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.fps-armor-break')).pointerEvents`),'none');
 await wait(`!document.querySelector('.fps-armor-break')`);
 await evaluate('die()');await wait('hud.arenaSelf?.alive===false');
 assert.equal(await evaluate(`!!document.querySelector('.fps-blood-border')`),false);

 await wait('hud.arenaSelf?.alive===true',20000);await wait('hud.armor===0 && !hud.arenaSelf.armorPickup');
 await evaluate('window.touch=true;makeArmorDrop();renderHud()');
 for(let i=0;i<35 && !await evaluate("hud.lootCard?.kind==='armor'");i++){await evaluate('engine.lookBy(0,5)');await delay(100);}
 await wait(`hud.lootCard?.kind==='armor' && document.querySelector('[data-touch-action="loot"]')`);
 await screenshot(mode+'-armor-touch');
 const point=await evaluate(`(()=>{const r=document.querySelector('[data-touch-action="loot"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:3,radiusY:3}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait('hud.arenaSelf.armorPickup && hud.armor>0');
 assert.equal(await evaluate('JSON.stringify(profile)===original'),true);
 assert.deepEqual(errors,[]);console.log('PASS '+mode+': delayed health regen, no armor regen, keyboard/touch armor pickup, host receipt, original profile, respawn armor, low/critical blood borders, reduced motion and armor-break flash');
} finally { ws.close();await fetch(chrome+'/json/close/'+tab.id); }
}
