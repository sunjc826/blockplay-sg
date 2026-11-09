// Vite + hardware Chrome/Metal. Compares the previous shaders, High and optional SMAA/Ultra.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5364',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9594';
const output=new URL('../.cache/marina-aa/',import.meta.url);await fs.mkdir(output,{recursive:true});
const baseline=process.env.AA_BASELINE||'de5e391';
// Preserve an actual pre-change shader for the comparison. Never access paid services.
const waterSource=execFileSync('git',['show',baseline+':src/game/water.ts'],{encoding:'utf8'});
const shader=waterSource.split('const fragmentShader = /* glsl */ `')[1].split('`;')[0].replaceAll('${MAX_WATER_RIPPLES}','12').replaceAll('${RIPPLE_LIFE.toFixed(2)}','2.60').replaceAll('${RIPPLE_SPEED.toFixed(2)}','1.60');
assert(!shader.includes('${'));
const writeChanged=async(name,text)=>{const file=new URL(name,output);if(await fs.readFile(file,'utf8').catch(()=>null)!==text)await fs.writeFile(file,text);};
await writeChanged('baseline-water.ts',waterSource);
const oldScene=execFileSync('git',['show',baseline+':src/game/marina-scene.ts'],{encoding:'utf8'})
 .replaceAll("from './water'", "from '/.cache/marina-aa/baseline-water.ts'")
 .replaceAll("from './", "from '/src/game/").replaceAll("from '../data/", "from '/src/data/");
await writeChanged('baseline-scene.ts',oldScene);
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.j(Error(m.error.message)):p.r(m.result);}}
if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error' && m.params.args.some(a=>/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(a.value||'')))errors.push(m.params);
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((r,j)=>{const n=++id,timer=setTimeout(()=>j(Error(method+' timeout')),120000);pending.set(n,{r,j,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+expression);}
async function shot(name){const {data}=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(data,'base64'));}
const result={baseline,benchmarks:[],errors};
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/marina-aliasing.html'});await wait('window.ready===true && !!window.review');
 result.gpu=await evaluate('review.gpu');assert(!/swiftshader|software/i.test(result.gpu),'Must measure hardware rendering');
 await evaluate(`review.setBaseline(${JSON.stringify(shader)})`);
 for(const view of ['bay','hotel','rails','museum','water']){
  for(const [label,config] of Object.entries({before:{density:1.35,filter:false,smaa:false},high:{density:1.5,filter:true,smaa:false},smaa:{density:1.5,filter:true,smaa:true},ultra:{density:2,filter:true,smaa:true}})){
   await evaluate(`review.configure(${JSON.stringify({...config,view})});review.settle()`);await shot(view+'-'+label);
  }
 }
 // Screen-static frames must not retain stale edge detections from earlier views.
 result.stability=await evaluate('review.stability()');assert.equal(result.stability,0);
 for(const config of [
  {name:'before',density:1.35,smaa:false,filter:false},
  {name:'filtered-only',density:1.35,smaa:false,filter:true},
  {name:'high',density:1.5,smaa:false,filter:true},
  {name:'high-smaa',density:1.5,smaa:true,filter:true},
  {name:'ultra',density:2,smaa:true,filter:true},
  {name:'native-phone',density:1,smaa:false,filter:true,width:390,height:844},
 ]){
  const measured=await evaluate(`review.benchmark(${JSON.stringify({...config,view:'bay'})})`);result.benchmarks.push(measured);console.log(config.name,JSON.stringify(measured));
 }
 // SMAA must work on its own, resize with the canvas, preserve the sky, and free buffers on toggle off.
 result.standalone=await evaluate(`(async()=>{review.configure({width:640,height:420,density:1,smaa:true,ao:false,bloom:false,view:'museum'});await review.settle();const on=review.render(),a=Array.from(review.pixels().slice(0,4));review.configure({smaa:false});const off=review.render(),b=Array.from(review.pixels().slice(0,4));return {on,off,a,b};})()`);
 assert(result.standalone.on.smaa);assert(!result.standalone.off.smaa);assert(result.standalone.on.textures>result.standalone.off.textures);assert.deepEqual(result.standalone.a,result.standalone.b);
 // Also measure the actual pre-change scene/batching, not only disabled shaders on the new scene.
 await send('Page.navigate',{url:origin+'/scripts/fixtures/marina-aliasing.html?baseline'});await wait('window.ready===true && !!window.review');
 for(const view of ['bay','hotel','rails','museum','water']){await evaluate(`review.configure({view:${JSON.stringify(view)},density:1.35,smaa:false});review.settle()`);await shot(view+'-before');}
 const previous=await evaluate("review.benchmark({name:'previous-build',view:'bay',density:1.35,smaa:false,filter:true})");result.benchmarks.push(previous);console.log('previous-build',JSON.stringify(previous));
 await evaluate(`localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({timeOfDay:'noon',weather:'sunny',celebration:'none',shadows:true,occlusion:true,reducedEffects:false}))`);
 await send('Page.navigate',{url:origin+'/scripts/fixtures/marina-access.html'});await wait('window.hud?.phase==="ready"');
 await send('Page.bringToFront');const click=await evaluate(`(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...click});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...click});await wait('hud.phase==="playing"');
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:2,mobile:false});
 await evaluate(`import('/src/game/graphics-settings.ts').then(m=>{window.graphics=m;m.setGraphicsSettings({scale:1,pixelDensity:1.5,smaa:true});})`);
 await wait('document.querySelector("canvas").width===1440 && document.querySelector("canvas").dataset.smaa==="true"');await shot('fps-high-smaa');
 await evaluate('graphics.setGraphicsSettings({pixelDensity:2})');await wait('document.querySelector("canvas").width===1920');
 await evaluate('graphics.setGraphicsSettings({pixelDensity:1.35,scale:.7,smaa:false})');await wait('document.querySelector("canvas").width===907 && document.querySelector("canvas").dataset.smaa==="false"');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await evaluate('graphics.setGraphicsSettings({pixelDensity:1.5,scale:1,smaa:true})');await wait('document.querySelector("canvas").width===585');await shot('fps-phone-smaa');
 result.gameplay=await evaluate('({phase:hud.phase,width:document.querySelector("canvas").width,height:document.querySelector("canvas").height,smaa:document.querySelector("canvas").dataset.smaa})');
 assert.equal(result.gameplay.phase,'playing');
 await evaluate("engine.dispose();localStorage.setItem('blockplay-sg-settings-tab-v1','video')");
 await send('Page.navigate',{url:origin+'/settings'});await wait('!!document.querySelector(".graphics-settings")');
 for(const preset of ['ultra','high','balanced']){
  const point=await evaluate(`(()=>{const e=document.querySelector('[data-preset="${preset}"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await wait(`document.querySelector('[data-preset="${preset}"]').getAttribute('aria-pressed')==='true'`);
  const saved=await evaluate("JSON.parse(localStorage.getItem('blockplay-sg-graphics-v1'))");assert.equal(saved.pixelDensity,preset==='ultra'?2:preset==='high'?1.5:1.35);assert.equal(saved.smaa,preset==='ultra');
 }
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 await evaluate(`document.querySelector('.graphics-rows').scrollIntoView({block:'start'})`);await shot('settings-phone');
 assert.deepEqual(errors,[]);
 console.log('PASS Marina anti-aliasing: screenshots, hardware timing, stable edges, sky, resize, optional buffer release, live FPS changes and phone view.');
}finally{
 await fs.writeFile(new URL('results.json',output),JSON.stringify(result,null,2));
 await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id);
}
