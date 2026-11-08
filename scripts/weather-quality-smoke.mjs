// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9230';
const output=new URL('../.cache/weather-quality/',import.meta.url);await fs.mkdir(output,{recursive:true});
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
try{
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await load();const checked=await evaluate('window.compare()');console.log('Reflection pixels:',JSON.stringify(checked));
 for(const reflections of [false,true]){await evaluate(`window.draw({rain:false,reflections:${reflections}})`);await screenshot('wet-pavement-'+reflections);}
 assert(checked.solidRows>95,'Continuous reflection without horizontal depth-normal bands');
 assert(checked.changed>2000,'Pavement visibly reflects scenery');assert(checked.color>500,'Reflected colors remain visible');assert.equal(checked.top,0,'Sky and buildings unchanged');assert(checked.restored);
 const performance=[];
 for(const district of ['', 'marina-bay']){
  if(district)await load('?district='+district);
  const result=await evaluate('window.benchmark()');performance.push({district:district||'fixture',result,movement:await evaluate('window.movementCost()')});console.log('Performance:',JSON.stringify(performance.at(-1)));
  assert.equal(result[1].rain.radius,80);assert.equal(result[2].rain.radius,130);assert.equal(result[1].grassRadius,60);assert.equal(result[2].grassRadius,100);assert(result[3].reflections);
  if(district)console.log('Marina reflections:',JSON.stringify(await evaluate('window.compare()')));
  for(const detail of ['low','high','ultra']){await evaluate(`window.draw({detail:'${detail}',rain:true,reflections:${detail==='ultra'}})`);await screenshot((district||'fixture')+'-'+detail);}
 }
 await load();await evaluate('window.resize(390,844)');await evaluate("window.draw({detail:'ultra',reflections:true})");await screenshot('portrait-ultra');

 // Real engine and settings UI: rain presets, reflection toggle, and scoped view.
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?weapon=ff-oicw&district=marina-bay'});
 await wait("window.hud?.phase==='ready'");
 await evaluate(`(async()=>{const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');const {default:Settings}=await import('/src/components/GraphicsSettings.tsx');const host=document.createElement('div');host.id='weather-settings';host.style='position:absolute;z-index:30;right:0;top:0;width:450px;height:800px;overflow:auto;background:#172436;color:white';document.body.append(host);createRoot(host).render(React.createElement(Settings));const {setEnvironmentSettings}=await import('/src/game/environment-settings.ts');setEnvironmentSettings({weather:'monsoon',timeOfDay:'noon',celebration:'none'});})()`);
 await wait("!!document.querySelector('[data-preset=ultra]')");
 await evaluate("document.querySelector('[data-preset=ultra]').click()");
 await wait("JSON.parse(document.querySelector('#world canvas').dataset.rain).radius===130");
 await screenshot('live-settings-ultra');await evaluate("document.querySelector('#weather-settings').style.display='none'");
 const button=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...button,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await wait("window.hud?.phase==='playing'");await wait("document.querySelector('#world canvas').dataset.rainReflections==='true'");await evaluate('window.engine.toggleAim()');
 await wait("document.querySelector('#world canvas').dataset.scopeActive==='true'&&window.hud.aimProgress>.99");
 await evaluate("[...document.querySelectorAll('#weather-settings label')].find(l=>l.textContent.includes('Wet-ground reflections')).querySelector('input').click()");
 await wait("document.querySelector('#world canvas').dataset.rainReflections==='false'");
 assert.equal(await evaluate("document.querySelector('#world canvas').dataset.scopeActive"),'true');
 await evaluate("document.querySelector('[data-preset=high]').click()");
 await wait("JSON.parse(document.querySelector('#world canvas').dataset.rain).radius===80");
 await evaluate("document.querySelector('[data-preset=low]').click()");
 await wait("JSON.parse(document.querySelector('#world canvas').dataset.rain).drops<=216");
 await evaluate("document.querySelector('[data-preset=ultra]').click()");
 await wait("document.querySelector('#world canvas').dataset.rainReflections==='true'");
 await screenshot('live-ultra-scope');await evaluate('window.engine.dispose()');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({checked,performance,errors},null,2));
 console.log('PASS: wet-ground reflection pixels, restored output, rain/grass detail transitions, resizing and district performance.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
