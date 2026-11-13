// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/shallow-water/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
 await load('?shallow');await evaluate('window.shallowLighting();window.draw()');
 results.day=await evaluate('window.shallowDiff()');results.contact=await evaluate('window.shallowDiff("contact")');console.log('Day',results.day,'Contact',results.contact);await screenshot('steps-day');
 await evaluate('window.review.water.uniforms.uShallowDetail.value=0;window.draw()');await screenshot('steps-before');await evaluate('window.review.water.uniforms.uShallowDetail.value=1;window.draw()');
 assert(results.day.changed>500,'Visible restrained caustics');assert.equal(results.day.foregroundChanged,0);assert.equal(results.day.dryChanged,0,'No caustics on dry treads');
 assert(results.contact.changed>results.day.changed,'Contact transitions change submerged stair edges');assert.equal(results.contact.foregroundChanged,0);
 results.motion=await evaluate('window.shallowMotion()');assert(results.motion>500,'Caustics move with still water');
 await evaluate('window.shallowLighting(13,.18,1)');results.rain=await evaluate('window.shallowDiff()');await screenshot('steps-rain');assert(results.rain.mean<results.day.mean*.2,'Storms suppress caustics');
 await evaluate('window.shallowLighting(22.5)');results.night=await evaluate('window.shallowDiff()');await screenshot('steps-night');assert.equal(results.night.changed,0,'No moonlit caustics');
 await evaluate('window.shallowLighting();window.draw({detail:"high"})');assert.equal((await evaluate('window.shallowDiff("contact")')).changed,0,'High unchanged');
 await evaluate('window.draw({detail:"ultra",reduced:true})');assert.equal((await evaluate('window.shallowDiff("contact")')).changed,0,'Reduced effects unchanged');await evaluate('window.draw({reduced:false})');
 const warm=await evaluate('window.draw()');for(let i=0;i<4;i++){await evaluate('window.draw({detail:"high"});window.draw({detail:"ultra"})');}assert.equal((await evaluate('window.draw()')).textures,warm.textures);
 for(const query of ['?marina&time=noon','?marina&time=night','?marina&time=noon&weather=monsoon']){
  await load(query);const name=query.includes('night')?'night':query.includes('monsoon')?'rain':'day';
  await evaluate('window.move(-45,2,27,-47,-.8,24)');results[name+'Quay']=await evaluate('window.shallowDiff()');await screenshot('marina-quay-'+name);
  await evaluate('window.move(-3,1.5,1,0,-.4,-3.4)');await screenshot('marina-ladder-'+name);
  if(name==='day'){results.performance=await evaluate('window.shallowBenchmark()');assert.equal(results.performance[0].calls,results.performance[1].calls);assert.equal(results.performance[0].textures,results.performance[1].textures);assert.equal(results.performance[0].triangles,results.performance[1].triangles);await evaluate('window.density(2)');assert.equal((await evaluate('window.draw()')).glError,0);await screenshot('marina-retina');await evaluate('window.density(1)');}
 }
 assert.deepEqual(errors,[]);console.log('PASS shallow caustics, dry/foreground exclusion, transitions, animation, weather/night, fallbacks and resource lifecycle.');
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
