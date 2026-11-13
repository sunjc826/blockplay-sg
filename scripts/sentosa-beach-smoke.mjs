// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/sentosa-beach/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/WebGL|Shader Error|GL_INVALID/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/ultra-water.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true && typeof window.move==="function" && location.search==='+JSON.stringify(query)))return;}throw Error('Fixture failed to load: '+JSON.stringify(errors));}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
const results={};
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source: `for(const type of ['pointerdown','pointermove'])window.addEventListener(type,e=>{if(e.pointerType==='mouse')e.stopImmediatePropagation();},true);`});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 for(const weather of ['day','night','rain']){
  await load('?sentosa&time='+(weather==='night'?'night':'noon')+(weather==='rain'?'&weather=monsoon':''));
  await evaluate('window.move(0,2,196,0,-.2,204)');results[weather]=await evaluate('window.shallowDiff()');await screenshot('shelf-'+weather);
  assert.equal(results[weather].state.refraction,1);assert.equal(results[weather].state.glError,0);
  if(weather==='day'){
   assert(results.day.changed>1000,'Visible caustics on the shallow sand');
   await evaluate('window.move(-40,9,185,10,0,208)');await screenshot('beach-overview');await evaluate('window.move(0,4,207,20,1,189)');await screenshot('beach-shore');
   await evaluate('window.move(0,1.4,204,0,-.4,207)');await screenshot('wading');
   const warm=await evaluate('window.draw()');for(let i=0;i<3;i++){assert.equal((await evaluate('window.draw({detail:"high"})')).refraction,0);assert.equal((await evaluate('window.draw({detail:"ultra"})')).refraction,1);}assert.equal((await evaluate('window.draw()')).textures,warm.textures);
   assert.equal((await evaluate('window.draw({reduced:true})')).refraction,0);await evaluate('window.draw({reduced:false})');
   await evaluate('window.waveReset();window.waveImpact(0,204,1.5);window.waveAdvance(.3)');results.waves=await evaluate('window.waveRead(0,204)');assert(results.waves.energy>0);assert.equal(results.waves.glError,0);await screenshot('shelf-ripple');
   await evaluate('window.density(2)');assert.equal((await evaluate('window.draw()')).glError,0);await screenshot('shelf-retina');await evaluate('window.density(1)');
   assert.equal((await evaluate('window.move(0,0,204,0,-1,207)')).refraction,0,'Underwater disables screen-space refraction');
  }else if(weather==='night')assert.equal(results.night.changed,0,'No caustics at night');
  else assert(results.rain.mean<results.day.mean*.2,'Storm suppresses caustics');
 }
 await evaluate('window.dispose()');
 // Registered FPS scene: wade out, stop at deep water, shoot and return.
 // Ignore host mouse movement in this touch-driven review tab.
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?sentosa-beach&calibre=4'});
 await wait("window.hud?.phase==='ready'");
 const start=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing'&&document.querySelector('#world canvas').dataset.waterRefraction==='true'");
 await evaluate("window.engine.setInput('w',true)");await wait('window.hud.z>204');await evaluate("window.engine.setInput('w',false)");
 await screenshot('live-wading');
 await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.shots>=2');await evaluate("window.engine.setInput('fire',false)");
 await wait("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).impulses>0");await screenshot('live-splash');
 results.gameplay=await evaluate("({x:window.hud.x,z:window.hud.z,swimming:window.hud.swimming,shots:window.hud.shots,waves:JSON.parse(document.querySelector('#world canvas').dataset.waterWaves)})");
 assert(!results.gameplay.swimming,'Shelf uses supported wading');
 await evaluate("window.engine.setInput('w',true)");await new Promise(r=>setTimeout(r,2500));await evaluate("window.engine.setInput('w',false)");
 const limit=await evaluate('window.hud.z');assert(limit<209,'Deep water remains blocked');assert(limit>207,'Can reach the end of the shelf');
 await evaluate("window.engine.setInput('s',true)");await wait('window.hud.z<195');await evaluate("window.engine.setInput('s',false)");await screenshot('live-back-on-sand');
 await evaluate('window.engine.dispose()');
 assert.deepEqual(errors,[]);console.log('PASS Sentosa shelf depth, caustics, sun/rain/night, wave impulses, High/reduced/underwater fallbacks, retina, resource lifetime, FPS wading/return, deep-water stop and live bullet waves.');
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
