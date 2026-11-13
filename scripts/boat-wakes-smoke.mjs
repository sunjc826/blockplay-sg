// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/boat-wakes/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
 await load();await evaluate('window.move(0,8,0,0,0,-1);window.boats();window.boatPose(0,6);window.boatPose(60,60,0,0,1);window.waveReset()');
 results.rates=[];
 for(const fps of [30,60,144]){
  await evaluate(`window.boatPose(0,6);window.waveReset();window.boatRun(3,${fps})`);
  results.rates.push(await evaluate('window.waveRead()'));
 }
 assert(results.rates.every(r=>r.energy>.01&&r.glError===0),'Actual GPU boat waves');
 assert(results.rates.every(r=>r.hash===results.rates[0].hash&&r.foam>0),'Identical GPU waves at 30/60/144 fps, with stern froth');
 await screenshot('boat-field');
 const before=await evaluate('window.review.post.waterWaves.stats.boatImpulses');
 await evaluate('window.boatPose(0,-6,0,0);window.waveAdvance(1)');
 assert.equal(await evaluate('window.review.post.waterWaves.stats.boatImpulses'),before,'No wake from stopped hull');
 await evaluate('window.waveAdvance(4)');assert((await evaluate('window.waveRead()')).foam<results.rates[2].foam*.02,'Stern froth dissipates after stopping');
 await evaluate('window.boatPose(0,0);window.waveReset();window.boatPose(80,80);window.waveAdvance(.1)');
 assert.equal((await evaluate('window.waveRead()')).energy,0,'Teleport does not cut a wake across bay');
 assert.equal((await evaluate('window.waveRead()')).foam,0,'No foam across teleport');
 assert.equal(await evaluate('window.review.post.waterWaves.stats.boats'),0,'Distant boats culled');
 await evaluate('window.boatPose(0,0);window.waveReset();window.draw({detail:"high"});window.boatPose(0,0)');
 assert((await evaluate('window.boatState()')).opacity>.3,'High fallback wake');
 await evaluate('window.draw({detail:"ultra"});window.boatPose(0,0)');
 assert.equal((await evaluate('window.boatState()')).opacity,0,'No double wake inside Ultra coverage');
 await evaluate('window.draw({reduced:true});window.boatPose(0,0)');
 assert((await evaluate('window.boatState()')).opacity>.3,'Reduced fallback');
 await load('?marina&time=noon');
 const video=await evaluate('window.boatPreview(true)');await fs.writeFile(new URL('marina-boat-wakes.webm',output),Buffer.from(video.split(',')[1],'base64'));await screenshot('marina-boat-wakes');
 results.combined=await evaluate('window.waveRead(-29,5)');assert(results.combined.stats.boatImpulses>50);assert.equal(results.combined.glError,0);
 results.performance=await evaluate('window.boatBenchmark()');
 assert.equal(results.performance[2].calls,results.performance[3].calls,'Moving wakes add no draw calls');
 assert.equal(results.performance[2].textures,results.performance[3].textures,'Moving wakes add no textures');
 assert.equal(results.performance[2].triangles,results.performance[3].triangles,'Moving wakes add no geometry');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?boat-wakes'});await wait("window.hud?.phase==='ready'");
 const point=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("window.hud?.phase==='playing'");
 await evaluate('window.engine.interactVehicle()');await wait("window.hud?.vehicle==='dragon-boat-red'");
 await evaluate("window.engine.setInput('w',true)");await wait('window.hud.z<15');
 results.gameplay=await evaluate("({hud:{x:window.hud.x,z:window.hud.z,speed:window.hud.vehicleSpeed},waves:JSON.parse(document.querySelector('#world canvas').dataset.waterWaves)})");
 assert(results.gameplay.waves.active&&results.gameplay.waves.boatImpulses>20,'Actual FPS boat drives the wave field');await screenshot('live-boat-wake');
 await evaluate("window.engine.setInput('w',false);window.engine.setInput(' ',true)");await wait('window.hud.vehicleSpeed<.05');
 await evaluate("window.engine.setInput(' ',false)");await new Promise(r=>setTimeout(r,250));
 const stopped=await evaluate("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).boatImpulses");await new Promise(r=>setTimeout(r,600));
 assert.equal(await evaluate("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).boatImpulses"),stopped,'Actual boat stops emitting when braked');
 await evaluate('window.engine.dispose()');
 assert.deepEqual(errors,[]);console.log('PASS boat GPU waves, frame rates, stop/teleport/distance, fallbacks, combined effects, real FPS gameplay and performance.',JSON.stringify(results.performance));
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
