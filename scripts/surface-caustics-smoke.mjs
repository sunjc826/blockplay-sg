// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/surface-caustics/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
 await load('?caustics');await evaluate('window.waveReset()');results.flat=await evaluate('window.causticRead()');await screenshot('plain-flat');
 assert(results.flat.layers.every(l=>l.max<=1.001),'A flat surface has no focused light pattern');
 assert.equal((await evaluate('window.causticResponse()')).changed,0);
 await evaluate('window.waveImpact(0,-1,2.7);window.waveAdvance(.2)');results.early=await evaluate('window.causticRead()');
 await evaluate('window.waveAdvance(.2)');results.shot=await evaluate('window.causticRead()');results.response=await evaluate('window.causticResponse()');await screenshot('plain-shot');
 assert(results.response.wallChanged>1000,'A real above-water receiver has focused light');
 assert(results.response.floorChanged>1000,'A submerged receiver has focused light');
 assert(results.shot.layers[1].max>2 && results.shot.layers[4].max>2,'Both refracted and reflected rays concentrate');
 for(let i=0;i<6;i++)assert(Math.abs(results.shot.layers[i].mean-results.flat.layers[i].mean)<.02,'Light is redistributed, not globally brightened');
 await evaluate('window.causticBlock()');results.blocked=await evaluate('window.causticResponse()');await screenshot('plain-blocked');
 assert(results.blocked.wallChanged<results.response.wallChanged*.2,'Visible intervening geometry blocks wall light');
 await evaluate('window.causticBlock(false)');
 await evaluate('window.waveAdvance(.5)');results.late=await evaluate('window.causticRead()');await screenshot('plain-late');
 assert(results.late.layers[1].radius>results.early.layers[1].radius+.3,'The focused light propagates with the wave');
 await evaluate('window.draw({detail:"high"})');assert.equal(await evaluate('!!window.review.post.waterCaustics.target'),false);
 await evaluate('window.draw({detail:"ultra",reduced:true})');assert.equal(await evaluate('!!window.review.post.waterCaustics.target'),false);
 await evaluate('window.draw({reduced:false});window.shallowLighting(22.5)');assert.equal((await evaluate('window.shallowDiff()')).changed,0);
 await evaluate('window.shallowLighting();window.density(2)');assert.equal((await evaluate('window.draw()')).glError,0);
 await evaluate('window.density(1)');results.performance=await evaluate('window.shallowBenchmark()');
 assert.equal(results.performance[1].calls-results.performance[0].calls,7);
 console.log(JSON.stringify(results));assert.deepEqual(errors,[]);
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
