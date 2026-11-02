// Run Vite and an isolated Chrome with remote debugging; this fixture uses the real FPS engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5219',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9379';
const output=new URL(process.env.SWIM_SHARED?'../.cache/swimming-shared/':'../.cache/swimming/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=60000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await delay(200);}throw Error('Waiting for '+expression);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
try{
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?gallery'});await wait('window.ready');
  for(const view of ['overview','camp','boat']){await evaluate(`window.show(${JSON.stringify(view)})`);await shot(view);}
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?swim'+(process.env.SWIM_SHARED?'&shared':'')});await wait("window.hud?.phase==='ready'");
  const point=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait("window.hud?.phase==='playing'");
  await evaluate("window.engine.setInput('w',true);window.engine.setInput('shift',true)");await wait('window.hud.swimming===true');
  await evaluate("window.engine.setInput('fire',true)");await delay(500);assert.equal(await evaluate('window.hud.shots'),0);
  await shot('swimming-rifle-stowed');
  await evaluate("window.engine.setInput('w',false);window.engine.setInput('shift',false);window.engine.setInput('fire',false);window.engine.switchWeapon(2)");
  await wait('window.hud.weapon===2 && window.hud.swimCanFire===true');
  if(process.env.SWIM_SHARED) assert.equal(await evaluate('window.hud.arenaSelf?.swimming'),true);
  await evaluate('window.engine.toggleAim()');await delay(250);assert.equal(await evaluate('window.hud.aiming'),false);
  await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.shots>0');await evaluate("window.engine.setInput('fire',false)");
  const crossing=await evaluate('({x:window.hud.x,z:window.hud.z,swimming:window.hud.swimming,weapon:window.hud.weapon,shots:window.hud.shots,aiming:window.hud.aiming,spread:window.hud.crosshairSpread})');
  await shot('treading-sidearm');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);await shot('swimming-phone');
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,crossing,errors},null,2));
  console.log('PASS real FPS swimming: shoreline entry, sprint held, rifle fire refused, stationary sidearm, ADS refused, wide spread, touch HUD; three rendered Merlion views.');
}finally{try{await evaluate('window.engine?.dispose()');}catch{}ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
