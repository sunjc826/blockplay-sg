// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/ultra-water/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/WebGL|Shader Error|GL_INVALID/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/ultra-water.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Fixture failed to load: '+JSON.stringify(errors));}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
const results={};
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await load();results.initial=await evaluate('window.draw()');console.log('Initial',results.initial);assert(results.initial.supported,'Hardware WebGL2 required');assert.equal(results.initial.refraction,1);assert.equal(results.initial.glError,0);
 results.pixels=await evaluate('window.compare()');console.log('Pixels',results.pixels);
 for(const detail of ['high','ultra']){await evaluate(`window.draw({detail:'${detail}',reflections:true})`);await screenshot('fixture-'+detail);}
 assert(results.pixels.changed>10000);assert(results.pixels.foreground>1000);assert(results.pixels.foregroundChanged<100,'Foreground stays above the water');assert.equal(results.pixels.restored,0,'High is restored exactly');
 const warm=await evaluate('window.draw()');for(let i=0;i<4;i++){assert.equal((await evaluate("window.draw({detail:'high'})")).refraction,0);assert.equal((await evaluate("window.draw({detail:'ultra'})")).refraction,1);}assert.equal((await evaluate('window.draw()')).textures,warm.textures);
 assert.equal((await evaluate('window.draw({reduced:true})')).refraction,0);await evaluate('window.draw({reduced:false})');
 assert.equal((await evaluate('window.move(0,-.2,8,0,-1,0)')).refraction,0);
 for(const query of ['?marina&time=noon','?marina&time=night','?marina&time=noon&weather=monsoon']){
  await load(query);const name=query.includes('monsoon')?'rain':query.includes('night')?'night':'day';
  results[name]=await evaluate('window.draw({ao:true,bloom:true})');assert.equal(results[name].refraction,1);assert.equal(results[name].glError,0);
  for(const detail of ['high','ultra']){await evaluate(`window.draw({detail:'${detail}'})`);await screenshot('marina-'+name+'-'+detail);}
  if(name==='day'){
   results.performance=await evaluate('window.benchmark()');console.log('Performance',results.performance);
   await evaluate("window.draw({smaa:true,rays:'high'})");
   results.retina=await evaluate('window.density(2)');assert.equal(results.retina.refraction,1);assert.equal(results.retina.glError,0);
   await screenshot('marina-retina-ultra');await evaluate("window.density(1);window.draw({smaa:false,rays:'off'})");
   await evaluate('window.move(-32,.45,14,0,-.24,-20)');await screenshot('marina-swimming');
   await evaluate('window.move(-25,65,55,0,-.24,-16)');await screenshot('marina-overview');
   await evaluate('window.move(-30,2,29)');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
   assert.equal((await evaluate('window.resize(390,844)')).glError,0);await screenshot('marina-portrait');
   await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
  }
 }
 await evaluate('window.dispose()');
 // Exercise the actual FPS pipeline, including its separate scope camera and swimming.
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?water-effects'});
 await wait("window.hud?.phase==='ready'");
 await evaluate("(async()=>{const {setGraphicsSettings,GRAPHICS_PRESETS}=await import('/src/game/graphics-settings.ts');const {setEnvironmentSettings}=await import('/src/game/environment-settings.ts');setGraphicsSettings(GRAPHICS_PRESETS[0].values);setEnvironmentSettings({reducedEffects:false,occlusion:true,shadows:true});})()");
 const start=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing'&&document.querySelector('#world canvas').dataset.waterRefraction==='true'");
 await screenshot('live-ultra');await evaluate('window.engine.toggleAim()');
 await wait("document.querySelector('#world canvas').dataset.scopeActive==='true'&&window.hud.aimProgress>.99");
 await screenshot('live-ultra-scope');await evaluate('window.engine.toggleAim()');
 await wait("document.querySelector('#world canvas').dataset.scopeActive==='false'");
 await evaluate("import('/src/game/graphics-settings.ts').then(m=>m.setGraphicsSettings({waterDetail:'high'}))");
 await wait("document.querySelector('#world canvas').dataset.waterRefraction==='false'");
 await evaluate("import('/src/game/graphics-settings.ts').then(m=>m.setGraphicsSettings({waterDetail:'ultra'}))");
 await wait("document.querySelector('#world canvas').dataset.waterRefraction==='true'");
 await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.shots>=2');await evaluate("window.engine.setInput('fire',false)");
 await wait("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).pending===0");
 const beforeSwim=await evaluate("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).impulses");assert(beforeSwim>0,'Actual bullet hits reach the simulation');
 await evaluate("window.engine.setInput('w',true)");
 await wait('window.hud.swimming===true');
 await wait(`JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).impulses>${beforeSwim+6}`);
 await evaluate("window.engine.setInput('w',false)");await screenshot('live-ultra-swimming');
 results.gameplay=await evaluate("({swimming:window.hud.swimming,shots:window.hud.shots,waves:JSON.parse(document.querySelector('#world canvas').dataset.waterWaves),refraction:document.querySelector('#world canvas').dataset.waterRefraction})");
 await evaluate('window.engine.dispose()');assert.deepEqual(errors,[]);
 console.log('PASS Ultra water: depth/refraction, foreground preservation, presets, resize, day/night/rain, hardware timings, FPS scope and swimming.');
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));ws.close();await fetch(chrome+'/json/close/'+tab.id);}
