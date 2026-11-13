// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/water-calibre/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
const results={impacts:[],gameplay:[]};
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await load();await evaluate('window.move(0,4,8,0,0,0)');
 for(const family of [0,3,4]){
  await evaluate('window.waveReset()');const weapon=await evaluate(`window.waveCalibre(${family})`);
  await evaluate('window.waveAdvance(.1)');const early=await evaluate('window.waveRead()');
  await evaluate('window.waveAdvance(.4)');const later=await evaluate('window.waveRead()');results.impacts.push({weapon,early,later});
 }
 for(let i=1;i<3;i++){
  assert(Math.abs(results.impacts[i].early.min)>Math.abs(results.impacts[i-1].early.min)*1.2,'Heavier calibre creates a higher initial wave');
  assert(results.impacts[i].later.energy>results.impacts[i-1].later.energy*1.5,'Stronger travelling wave survives rebound');
 }
 await evaluate('window.waveReset();window.waveCalibre(4,0,0,.6);window.waveAdvance(.1)');results.skip=await evaluate('window.waveRead()');assert(results.skip.energy<results.impacts[2].early.energy,'Skipped heavy round transfers less energy');
 await evaluate('window.waveReset();(()=>{for(let i=0;i<240;i++){if(i%8===0)window.waveCalibre(4);window.waveAdvance(1/60);}})()');results.burst=await evaluate('window.waveRead()');assert(results.burst.max<=.251&&results.burst.min>=-.251&&results.burst.glError===0,'Sustained .50 fire stays bounded');
 await load('?marina&time=noon');await evaluate('window.move(-30,2,26,-30,-.24,19)');
 for(const family of [0,3,4]){await evaluate(`window.waveReset();window.waveCalibre(${family},-30,20);window.waveAdvance(.5)`);await screenshot('marina-calibre-'+family);}
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 for(const family of [0,3,4]){
  await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?water-effects&boat-wakes&calibre='+family});await wait("window.hud?.phase==='ready'");
  const point=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("window.hud?.phase==='playing'");
  assert.equal(await evaluate('window.hud.weapon'),family);
  await evaluate("window.engine.setInput('fire',true)");await wait('window.hud.shots>=1');await evaluate("window.engine.setInput('fire',false)");
  await wait("JSON.parse(document.querySelector('#world canvas').dataset.waterWaves).impulses>=3");
  results.gameplay.push(await evaluate("({weapon:window.hud.weapon,shots:window.hud.shots,waves:JSON.parse(document.querySelector('#world canvas').dataset.waterWaves)})"));
  await screenshot('live-calibre-'+family);await evaluate('window.engine.dispose()');
 }
 assert.deepEqual(errors,[]);console.log('PASS actual GPU calibre amplitude/energy, skip attenuation, sustained .50 stability and live rifle/MAG/.50 shots.',JSON.stringify(results.impacts.map(r=>({weapon:r.weapon,peak:-r.early.min,energy:r.later.energy}))));
}finally{results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));ws.close();await fetch(chrome+'/json/close/'+tab.id);}
