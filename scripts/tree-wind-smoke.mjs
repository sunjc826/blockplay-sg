// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5221';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9381';
const output=new URL('../.cache/tree-wind/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/tree-wind.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1000,height:750,deviceScaleFactor:1,mobile:false});
 await load();
 const results={};
 for(const weather of ['sunny','showers','thunderstorm','squall']){
  results[weather]=await evaluate(`window.motion('${weather}')`);
  await evaluate(`window.draw('${weather}',1)`);await screenshot(weather);
 }
 results.reduced=await evaluate("window.motion('thunderstorm',true)");
 results.thermal=await evaluate("window.motion('thunderstorm',false,true)");
 assert(results.sunny>100,'Leaves move in clear weather');
 assert(results.showers>results.sunny*1.5,'Rain increases motion');
 assert(results.thunderstorm>results.showers*1.2,'Thunderstorms increase motion further');
 assert(results.reduced<results.sunny,'Reduced effects limits motion');
 assert(results.thermal>100,'Thermal preserves wind animation');
 for(const district of ['marina-bay','queenstown','raffles-place','sentosa','changi','kampong-glam']){
  await load('?district='+district);results[district]=await evaluate("window.draw('thunderstorm',2)");
  await screenshot(district+'-storm');
  assert(results[district].trees>0);
 }
 // Exercise the real FPS material/occlusion pipeline and weather settings.
 await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?district=marina-bay'});
 await wait("window.hud?.phase==='ready'");
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const point=await evaluate("(()=>{const b=document.querySelector('#start').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("window.hud?.phase==='playing'");
 await evaluate("import('/src/game/environment-settings.ts').then(m=>m.setEnvironmentSettings({weather:'thunderstorm',timeOfDay:'noon',celebration:'none',reducedEffects:false}))");
 await wait("window.hud.elapsed>3");await screenshot('live-fps-storm');
 results.engine={phase:await evaluate('window.hud.phase')};await evaluate('window.engine.dispose()');
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));console.log('PASS',results);
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
