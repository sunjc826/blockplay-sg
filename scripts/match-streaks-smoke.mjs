// Real FPS renderer and guest runtime backed by an in-memory authoritative match.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5231';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9391';
const output=new URL('../.cache/match-streaks/',import.meta.url);await fs.mkdir(output,{recursive:true});
for(const variant of (process.env.STREAK_MODES?.split(',')??['ffa','tdm','hardpoint','hardpoint&support'])) {
const mode=variant.split('&')[0],support=variant.includes('support');
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/match-streaks.html?mode='+variant),{method:'PUT'})).json();
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
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,90000);
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:45,y:20,id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait(`hud.phase==='playing'`);
 const earned=await evaluate('earn()');assert.equal(earned.ready.length,3,JSON.stringify(await evaluate('earnTrace')));
 await wait(`document.querySelectorAll('.match-streak-hud button[data-ready]').length===3`);
 await screenshot(variant.replace('&','-')+'-ready');
 await key('4','Digit4');
 if(!support){
  await wait(`hud.arena.streaks.effects.some(e=>e.kind==='recon')`);
  assert.equal(await evaluate('accepted'),true);
  await key('5','Digit5');await wait(`hud.streakPlacement==='jammer'`);
  const shots=await evaluate('hud.shots');await key('Escape','Escape');await wait(`hud.streakPlacement===null`);assert.equal(await evaluate('hud.shots'),shots);
  await key('6','Digit6');await wait(`hud.arena.raiders?.some(r=>r.kind==='drone')`);
  assert.equal(await evaluate('valid'),true);
  await screenshot(mode+'-active');
 }else{
  await wait(`hud.streakPlacement==='interceptor'`);
  await evaluate('engine.lookBy((hud.yaw+Math.PI/2)/.0023,0)');
  for(let i=0;i<12;i++){await evaluate('engine.lookBy(0,20)');await delay(40);}
  await screenshot('hardpoint-placement');
  await evaluate('engine.confirmStreak()');await delay(500);
  // Authored spawn protection may reject this first point. Walk away from it, then retry with the real placement control.
  if(!await evaluate('accepted')){
    await evaluate('engine.cancelStreak();engine.lookBy((hud.yaw+Math.PI/2)/.0023,0);engine.setInput("w",true)');await delay(2500);await evaluate('engine.setInput("w",false);engine.useStreak(0)');await delay(100);
    await evaluate('engine.confirmStreak()');await delay(300);
  }
  assert.equal(await evaluate('accepted'),true,JSON.stringify(await evaluate('({request:lastStreakRequest,hud:{x:hud.x,z:hud.z,pitch:hud.pitch,message:hud.message}})')));
  await evaluate('engine.cancelStreak()');
  // Render the other authored devices through the same authority; the GUI path was verified above.
  assert.equal(await evaluate('place("sentry")'),true);
  await evaluate('place("strike")');await delay(300);
  await screenshot('hardpoint-devices');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await evaluate('touchMode(true)');await delay(250);await screenshot(variant.replace('&','-')+'-touch');
 const rects=await evaluate(`Array.from(document.querySelectorAll('.match-streak-hud button')).map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})`);
 assert(rects.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=844&&r.y+r.h<=390));
 assert.equal(await evaluate('valid'),true);assert.deepEqual(errors,[]);console.log(variant+' streak smoke passed');
} finally {await evaluate('engine.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
}
