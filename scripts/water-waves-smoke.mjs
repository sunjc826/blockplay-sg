// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/water-waves/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
 await load();await evaluate("window.review.water.uniforms.uChop.value=0;window.move(0,4,8,0,0,0);window.waveReset();window.waveImpact()");
 await evaluate('window.waveAdvance(.25)');results.early=await evaluate('window.waveRead()');console.log('Early',results.early);await screenshot('impact-early');
 assert.equal(results.early.glError,0);assert(results.early.min<-.001&&results.early.max>.001,'Crest and trough');
 await evaluate('window.waveAdvance(.75)');results.later=await evaluate('window.waveRead()');await screenshot('impact-spreading');
 assert(results.later.radius>results.early.radius+.6,'Wavefront propagates');
 const paused=await evaluate('window.waveRead()');await evaluate('window.draw()');assert.equal((await evaluate('window.waveRead()')).hash,paused.hash);
 await evaluate('window.move(2,4,8,0,0,0)');results.scroll=await evaluate('window.waveRead()');assert(Math.abs(results.scroll.sample-paused.sample)<.0001,'World-space wave survives scrolling');
 await evaluate('window.waveAdvance(7)');results.decayed=await evaluate('window.waveRead()');assert(results.decayed.energy<results.later.energy*.35,'Waves dissipate');
 results.rates=[];for(const fps of [30,60,144]){await evaluate(`window.waveReset();window.waveImpact();window.waveAdvance(2,${fps})`);results.rates.push(await evaluate('window.waveRead()'));}
 assert(results.rates.every(r=>r.hash===results.rates[0].hash),'Same simulation at 30/60/144 fps');
 await evaluate('window.waveReset();window.waveImpact(-.8,0);window.waveImpact(.8,0);window.waveAdvance(.35)');results.overlap=await evaluate('window.waveRead()');assert(Math.abs(results.overlap.sample)>.0001,'Overlapping waves reach midpoint');await screenshot('overlapping-ripples');
 await evaluate('window.move(12,4,5,13,0,0);window.waveReset();window.waveImpact(14.7,0);window.waveAdvance(1)');results.quay=await evaluate('window.waveRead(14,0)');assert.equal(results.quay.outside,0,'Solid quay contains waves');assert(results.quay.energy>.001);
 await evaluate('window.move(0,4,8,0,0,0);window.waveReset();window.waveSwimmer(-2,0);window.waveAdvance(.1)');
 await evaluate('(()=>{for(let i=0;i<180;i++){window.waveSwimmer(-2+i/60*1.25,0);window.waveAdvance(1/60);}})()');results.wake=await evaluate('window.waveRead()');assert(results.wake.stats.impulses>20);assert(results.wake.energy>.001);await screenshot('swimmer-wake');
 await evaluate('window.waveSwimmer(0,0,false);window.move(100,4,8,100,0,0);window.waveAdvance(1)');assert.equal((await evaluate('window.review.post.waterWaves.stats')).active,false);
 await evaluate('window.move(0,4,8,0,0,0);window.waveAdvance(1)');assert((await evaluate('window.waveRead()')).energy<.00001,'Teleport clears old waves');
 await load('?marina&time=noon');await evaluate('window.move(-30,2,26,-30,-.24,19);window.waveReset();window.waveImpact(-30,20,2);window.waveAdvance(.6)');await screenshot('marina-ripples');
 await evaluate('window.waveImpact(-28.7,19.5);window.waveAdvance(.5)');await screenshot('marina-overlap');
 const video=await evaluate('window.recordWaves()');await fs.writeFile(new URL('marina-ripples.webm',output),Buffer.from(video.split(',')[1],'base64'));
 results.performance=await evaluate('window.waveBenchmark()');
 assert.deepEqual(errors,[]);console.log('PASS GPU wave propagation, overlap, damping, frame rate, scrolling, boundaries, wakes and video.');
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));ws.close();await fetch(chrome+'/json/close/'+tab.id);}
