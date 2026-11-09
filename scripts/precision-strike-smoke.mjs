// Real FPS renderer and guest runtime backed by an in-memory authoritative match.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5231';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9391';
const output=new URL('../.cache/precision-strike/',import.meta.url);await fs.mkdir(output,{recursive:true});
for(const variant of (process.env.STREAK_MODES?.split(',')??['hardpoint&support','tdm&support'])) {
const mode=variant.split('&')[0],support=variant.includes('support');
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/scripts/fixtures/match-streaks.html?mode='+variant+'&precision'),{method:'PUT'})).json();
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
async function click(selector, touch = true) {
  const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(touch){
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
}
async function deploy() {
  if(mode==='tdm'){
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:400,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:600,y:400,button:'left',clickCount:1});
  }else await click('.streak-placement button');
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(new URL(mode + '-' + name + '.png', output), Buffer.from(shot.data, 'base64'));
}
try {
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await wait(`window.hud?.phase==='ready'`,90000);
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await click('#enter',mode!=='tdm');if(mode==='tdm')await wait('document.pointerLockElement');await wait(`hud.phase==='playing'`);
 assert.equal((await evaluate('earn()')).ready.length,3);
 await wait(`document.querySelectorAll('.match-streak-hud button[data-ready]').length===3`);
 const shots=await evaluate('hud.shots');
 await key('5','Digit5');await wait(`hud.streakPlacement==='strike'`);
 await evaluate('engine.lookBy(0,-500)');await delay(200);await deploy();
 assert.equal(await evaluate(`hud.arena.streaks.players.guest.ready.includes('strike')`),true);
 assert.match(await evaluate('hud.streakNotice'),/Aim at an enemy/);
 await screenshot('precision-invalid');
 // Move a real networked opponent onto the street and aim at the torso.
 // A body hit used to fail the horizontal-ground placement check.
 await evaluate(`(()=>{
   sim.setPlayerVitals('donor',{health:100});
   for(let i=0;i<400;i++){
     const a=sim.snapshot().actors.find(a=>a.id==='donor');
     sim.setInput('donor',{...a,x:-5,z:77,playing:true});sim.step(.05);
   }
   publish();
 })()`);
 await delay(300);
 await evaluate(`(()=>{
   const a=hud.arenaSelf,b=hud.arena.actors.find(a=>a.id==='donor');
   const dx=b.x-a.x,dz=b.z-a.z,pitch=Math.atan2(b.y-.15-a.y,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
   window.aimedAt={x:b.x,z:b.z,distance:Math.hypot(dx,dz)};
   engine.lookBy((hud.yaw-yaw)/(.0023*2.6),(hud.pitch-pitch)/(.0023*2.6*620/900));
 })()`);
 await delay(300);
 console.log('target',JSON.stringify(await evaluate('({aimedAt,notice:hud.streakNotice,yaw:hud.yaw,pitch:hud.pitch})')));
 assert((await evaluate('aimedAt.distance'))>15);
 await wait(`hud.streakNotice===''`);
 await screenshot('precision-enemy-target');
 if(mode==='hardpoint'){
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await evaluate('touchMode(true)');await delay(200);
   assert.match(await evaluate(`document.querySelector('.streak-placement').textContent`),/250m range · 8m blast radius/);
   await screenshot('precision-touch');
 }
 await deploy();await wait(`hud.streakPlacement===null`);
 assert.equal(await evaluate('accepted'),true);
 const request=await evaluate('lastStreakRequest.p');
 const aimedAt=await evaluate('aimedAt');
 assert(Math.hypot(request.at.x-aimedAt.x,request.at.z-aimedAt.z)<.5,'Enemy torso designates their ground position: '+JSON.stringify(request));
 assert.equal(await evaluate('hud.shots'),shots);
 await wait(`!hud.arena.streaks.players.guest.ready.includes('strike')`);
 await wait(`hud.mapDangers.some(d=>d.id.startsWith('streak-')&&d.radius===8)`);
 assert.equal(await evaluate('valid'),true);
 await screenshot('precision-deployed');
 assert.deepEqual(errors,[]);console.log(mode+' precision strike smoke passed');
} finally {await evaluate('engine.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
}
