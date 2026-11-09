// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5257';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9457';
const output=new URL('../.cache/sun-rays-lens/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/sun-rays-lens.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
 await load();const results=[];
 const check=async options=>{const r=await evaluate('window.check('+JSON.stringify(options)+')');results.push(r);return r;};
 const baseline=await check({quality:'off'});assert(baseline.energy>1000000,'Clear sky shows a strong lens flare');
 const regression=await check({quality:'high',compensate:false});assert(regression.energy<baseline.energy*.1,'Reproduce the old god-ray false obstruction');
 for(const quality of ['off','low','high'])for(const bright of [false,true]){
  const open=await check({quality,bright});assert(open.changed>10000,quality+' visible flare over sky');await screenshot(quality+(bright?'-bright':''));
  for(const block of ['wall','weapon']){const closed=await check({quality,bright,block});assert(closed.energy<open.energy*.005,block+' still blocks flare with '+quality+' rays');}
  const partial=await check({quality,bright,block:'partial'});assert(partial.changed>10000,'Partial cover retains flare');if(!bright)assert(partial.energy>open.energy*.1&&partial.energy<open.energy*.9,'Partial cover dims flare');
 }
 for(const quality of ['high','off','low','off']){
  const r=await check({quality,ao:true,bloom:true});assert(r.changed>10000,'AO/bloom and quality toggles retain flare');assert.equal(r.overlay,quality!=='off');
 }
 for(const options of [{elevation:-10},{reduced:true}]){const r=await check(options);assert.equal(r.overlay,false,'Inactive rays never expose stale overlay');if(options.elevation)assert.equal(r.energy,0,'Night has no flare');else assert(r.changed>10000,'Reduced rays preserve existing flare behavior');}
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
 console.log('PASS: reproduced regression, restored flares for Low/High, world/weapon/partial occlusion, saturated sky, AO/bloom, quality transitions and inactive-ray gates.');
 console.log(JSON.stringify({baseline,regression,low:results.find(r=>r.quality==='low'&&r.block==='none'),high:results.find(r=>r.quality==='high'&&r.compensate&&r.block==='none')}));
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
