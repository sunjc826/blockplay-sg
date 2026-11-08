// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9230';
const output=new URL('../.cache/water-interactions/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/weather-quality.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
async function canvasShot(name){const url=await evaluate("new Promise(resolve=>requestAnimationFrame(()=>resolve(document.querySelector('#world canvas').toDataURL('image/png'))))");await fs.writeFile(new URL(name+'.png',output),Buffer.from(url.split(',')[1],'base64'));}
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await load('?district=marina-bay&weather=sunny');
 await evaluate('window.move(-10,1.2,27,-10,-.24,24)');
 const high=await evaluate("window.draw({detail:'high'});window.impact()");assert(high.ripples>=2);await screenshot('high-raised-shot-ripples');
 const low=await evaluate("window.draw({detail:'low'})");assert.equal(low.ripples,0);
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?water-effects'});await wait("window.hud?.phase==='ready'");
 const p=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing'");
 await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.shots>=2');await evaluate("window.engine.setInput('fire',false)");
 await wait("Number(document.querySelector('#world canvas').dataset.lens.split(':')[2])>0");
 const shot=await evaluate("({shots:window.hud.shots,lens:document.querySelector('#world canvas').dataset.lens,ripples:document.querySelector('#world canvas').dataset.waterRipples})");
 assert(Number(shot.ripples)>0);await canvasShot('nearby-bullet-splash-on-lens');
 await evaluate("window.engine.setInput('w',true)");await wait('window.hud.swimming===true');
 await wait("Number(document.querySelector('#world canvas').dataset.lens.split(':')[2])>20");
 await evaluate("window.engine.setInput('w',false)");await canvasShot('swimming-streaks');
 const swim=await evaluate("({lens:document.querySelector('#world canvas').dataset.lens,swimming:window.hud.swimming})");
 await evaluate('window.engine.dispose()');assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({high,low,shot,swim,errors},null,2));
 console.log('PASS:',JSON.stringify({high,low,shot,swim}));
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
