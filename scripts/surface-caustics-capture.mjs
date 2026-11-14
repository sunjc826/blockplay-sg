// Run Vite plus hardware Chrome with remote debugging; no software override.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/surface-caustics/',import.meta.url);await fs.mkdir(output,{recursive:true});
const wall=process.argv.includes('--wall'),label=wall?'wall-shooting':'sentosa-shooting';
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
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression+' '+JSON.stringify(errors));}
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:`for(const type of ['pointerdown','pointermove'])window.addEventListener(type,e=>{if(e.pointerType==='mouse')e.stopImmediatePropagation();},true);`});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/dragon-boats.html?'+(wall?'caustics-wall':'sentosa-beach')+'&calibre=4'});await wait("window.hud?.phase==='ready'");
 const hook=await evaluate(`(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/three.js?')).name;
  const THREE=await import(url),original=THREE.Mesh.prototype.onBeforeRender;
  window.proofHits=[];
  THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material,group){
   original.call(this,renderer,scene,camera,geometry,material,group);
   if(material.userData.fpsWater && material.uniforms?.uCausticResponse && material.uniforms.uRefractionReady.value>0)window.proofDraw={light:material.uniforms.uCausticLight.value,response:material.uniforms.uCausticResponse.value,ultra:material.uniforms.uUltra.value,refraction:material.uniforms.uRefractionReady.value};
   if(material.userData.fpsWater && material.uniforms?.uCausticResponse&&!window.proofWater){
    window.proofWater=material;
    const ripple=material.userData.ripple;
    material.userData.ripple=function(x,z,strength){
     window.proofHits.push({x,z,strength,time:material.uniforms.uTime.value,light:material.uniforms.uCausticLight.value,response:material.uniforms.uCausticResponse.value,ultra:material.uniforms.uUltra.value,refraction:material.uniforms.uRefractionReady.value});
     ripple.call(this,x,z,strength);window.engine.setInput('fire',false);
    };
   }
  };return url;
 })()`);
 const start=await evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing'&&!!window.proofWater");
 await evaluate("window.engine.setInput('w',true)");await wait('window.hud.z>202');await evaluate("window.engine.setInput('w',false)");await new Promise(r=>setTimeout(r,500));await screenshot(label+'-before');
 const recording=await evaluate(`(async()=>{
  const canvas=document.querySelector('#world canvas'),stream=canvas.captureStream(30),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:7000000});
  recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  await new Promise(r=>setTimeout(r,1000));window.engine.setInput('fire',true);
  await new Promise(r=>setTimeout(r,3500));window.engine.setInput('fire',true);
  await new Promise(r=>setTimeout(r,4500));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
 })()`);
 await fs.writeFile(new URL(label+'.webm',output),Buffer.from(recording.split(',')[1],'base64'));
 await evaluate("window.engine.setInput('fire',true)");await new Promise(r=>setTimeout(r,450));await screenshot(label+'-early');
 await new Promise(r=>setTimeout(r,800));await screenshot(label+'-late');
 const stats=await evaluate("({hits:window.proofHits,draw:window.proofDraw,hud:{x:window.hud.x,z:window.hud.z,shots:window.hud.shots,phase:window.hud.phase},waves:JSON.parse(document.querySelector('#world canvas').dataset.waterWaves),shaderLight:window.proofWater.uniforms.uCausticLight.value,shaderUltra:window.proofWater.uniforms.uUltra.value,sun:window.proofWater.uniforms.uSun.value.toArray()})");
 await fs.writeFile(new URL(label+'.json',output),JSON.stringify({hook,...stats,errors},null,2));console.log(JSON.stringify({hook,...stats,errors}));assert(stats.hits.length>=3);assert.deepEqual(errors,[]);
}finally{try{await evaluate('window.engine.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);}
