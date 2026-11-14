// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/dynamic-caustics/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/WebGL|Shader Error|GL_INVALID/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/ultra-water.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true && location.search==='+JSON.stringify(query)))return;}throw Error('Fixture failed to load: '+JSON.stringify(errors));}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
const results={};
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await load('?sentosa');await evaluate('window.move(0,2.3,196,0,-.2,202);window.waveReset()');
 results.calm=await evaluate('window.causticResponse()');assert.equal(results.calm.changed,0,'A flat simulation does not change caustic focus');
 results.motion=await evaluate('window.shallowMotion()');assert(results.motion>500,'Light bands flow with time');
 await evaluate('window.waveReset();window.waveImpact(0,200,3);window.waveAdvance(.3)');
 results.ripple=await evaluate('window.causticResponse()');assert(results.ripple.changed>100,'Wave curvature changes bottom light with frozen surface/refraction');await screenshot('sentosa-ripple');
 results.day=await evaluate('window.shallowDiff()');assert(results.day.changed>1000);
 results.wave=await evaluate('window.waveRead(0,200)');assert.equal(results.wave.dryEnergy,0,'No simulated wave crosses dry sand');
 await evaluate('window.waveReset();window.waveImpact(0,197.2,3);window.waveAdvance(.05)');results.shore=await evaluate('window.waveRead(0,197.2)');
 assert.equal(results.shore.dryEnergy,0);assert(results.shore.energy>0,'Shallow waves remain visible');await screenshot('sentosa-shore-ripple');
 await evaluate('window.waveReset();window.waveImpact(0,204,3);window.waveAdvance(.05)');results.deep=await evaluate('window.waveRead(0,204)');
 assert(results.shore.energy<results.deep.energy*.3,'Waves soften through the sandy shallows');
 await evaluate('window.waveReset();window.waveImpact(0,195,3);window.waveAdvance(.3)');results.dry=await evaluate('window.waveRead(0,195)');assert.equal(results.dry.energy,0,'Dry-ground impulses cannot form waves');
 await evaluate('window.shallowLighting(22.5)');results.night=await evaluate('window.shallowDiff()');assert.equal(results.night.changed,0);
 await evaluate('window.shallowLighting(13,.18,1)');results.rain=await evaluate('window.shallowDiff()');assert(results.rain.mean<results.day.mean*.2);
 await evaluate('window.shallowLighting();window.draw({detail:"high"})');assert.equal((await evaluate('window.shallowDiff()')).changed,0);
 await evaluate('window.draw({detail:"ultra",reduced:true})');assert.equal((await evaluate('window.shallowDiff()')).changed,0);await evaluate('window.draw({reduced:false})');
 const warm=await evaluate('window.draw()');for(let i=0;i<3;i++)await evaluate('window.draw({detail:"high"});window.draw({detail:"ultra"})');assert.equal((await evaluate('window.draw()')).textures,warm.textures);
 await evaluate('window.move(0,4,207,20,1,189)');await screenshot('sentosa-beach');
 await evaluate('window.density(2)');assert.equal((await evaluate('window.draw()')).glError,0);await screenshot('sentosa-retina');await evaluate('window.density(1)');
 results.performance=await evaluate('window.shallowBenchmark()');assert.equal(results.performance[0].calls,results.performance[1].calls);assert.equal(results.performance[0].textures,results.performance[1].textures);
 await load('?shallow');await evaluate('window.shallowLighting()');results.steps=await evaluate('window.shallowDiff()');assert.equal(results.steps.foregroundChanged,0);assert.equal(results.steps.dryChanged,0);await screenshot('steps');
 await evaluate('window.waveReset();window.waveImpact(-1,1,3);window.waveAdvance(.3)');results.stepRipple=await evaluate('window.causticResponse()');assert(results.stepRipple.changed>50);await screenshot('steps-ripple');
 await load('?marina');await evaluate('window.move(-26,5,25,-30,-1,19);window.waveReset();for(let i=0;i<120;i++){window.boatPose(-30,23-i*.05,0,3);window.waveAdvance(1/60)}');results.boatWaves=await evaluate('window.waveRead(-30,19)');results.wake=await evaluate('window.causticResponse()');assert(results.wake.changed>50,'Boat wake changes caustic light');await screenshot('marina-wake');
 assert.deepEqual(errors,[]);console.log('PASS dynamic caustic motion, wave/boat light focusing, shoreline damping/dry exclusion, sun/weather, fallbacks, dry steps, retina and resource lifetime.');
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
