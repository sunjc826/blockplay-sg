// Start Vite and an isolated hardware-accelerated Chrome with remote debugging.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9230';
const output=new URL('../.cache/graphics-quality/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/graphics-quality.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Graphics fixture failed to load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function wait(expression){for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);}
try{
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
  await load();const checked=await evaluate('window.verify()');console.log('Pixel checks:',JSON.stringify(checked));
  for(const bloom of [false,true]){await evaluate(`window.draw({ao:false,bloom:${bloom}})`);await screenshot('fixture-bloom-'+bloom);}
  for(const r of checked.results){assert(r.glow>50,'Bright light has a visible halo');assert(r.whiteChange<=3,'Ordinary white surfaces stay clear');assert.equal(r.reticleChange,0);assert(r.dimmed<100,'No scene-wide dimming; only MSAA silhouette differences');assert.deepEqual(r.skyBefore,r.skyAfter);}
  assert(checked.restored,'Disabling bloom restores the original picture');
  for(const shadow of [2048,4096]){const state=await evaluate(`window.draw({shadow:${shadow},bloom:true})`);assert.equal(state.shadow,shadow);await screenshot('shadows-'+shadow);}
  await evaluate('window.resize(390,844)');await screenshot('portrait');await evaluate('window.resize(1200,800)');
  const performance=[];
  for(const time of ['night','noon']){
    await load('?district=marina-bay&time='+time);
    const difference=await evaluate('window.compareBloom()');
    if(time==='night')assert(difference.changed>500,'Bloom is visible around actual district lights');
    for(const bloom of [false,true]){await evaluate(`window.draw({bloom:${bloom},shadow:2048})`);await screenshot('marina-'+time+'-bloom-'+bloom);}
    performance.push({time,difference,measurements:await evaluate('window.benchmark()')});
    await screenshot('marina-'+time+'-ultra');
  }
  // Real settings component, live engine, and a magnified scope on touch input.
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/scope-zoom.html?weapon=ff-oicw'});
  await wait("window.hud?.phase==='ready'");
  await evaluate(`(async()=>{const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');const {default:Settings}=await import('/src/components/GraphicsSettings.tsx');const host=document.createElement('div');host.id='graphics-review-settings';host.style='position:absolute;z-index:30;right:0;top:0;width:450px;background:#172436;color:white';document.body.append(host);createRoot(host).render(React.createElement(Settings));})()`);
  await wait("!!document.querySelector('[data-preset=ultra]')");
  await evaluate("document.querySelector('[data-preset=ultra]').click()");
  await wait("document.querySelector('#world canvas').dataset.shadowMapSize==='4096'");
  assert.equal(await evaluate("document.querySelector('[data-preset=ultra]').getAttribute('aria-pressed')"),'true');
  await screenshot('settings-ultra');await evaluate("document.querySelector('#graphics-review-settings').style.display='none'");
  const button=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...button,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait("window.hud?.phase==='playing'");await evaluate('window.engine.toggleAim()');
  await wait("document.querySelector('#world canvas').dataset.scopeActive==='true'&&window.hud.aimProgress>.99");
  assert.equal(await evaluate("document.querySelector('#world canvas').dataset.bloom"),'true');
  await evaluate("[...document.querySelectorAll('#graphics-review-settings label')].find(l=>l.textContent.includes('Light bloom')).querySelector('input').click()");
  await wait("document.querySelector('#world canvas').dataset.bloom==='false'");
  assert.equal(await evaluate("document.querySelector('#world canvas').dataset.scopeActive"),'true',await evaluate('JSON.stringify({phase:window.hud.phase,aim:window.hud.aimProgress,message:window.hud.message})'));await screenshot('live-ultra-scope');
  await evaluate("document.querySelector('[data-preset=balanced]').click()");
  await wait("document.querySelector('#world canvas').dataset.shadowMapSize==='1024'");
  await evaluate("document.querySelector('[data-preset=high]').click()");
  await wait("document.querySelector('#world canvas').dataset.shadowMapSize==='2048'&&document.querySelector('#world canvas').dataset.bloom==='true'");
  await evaluate('window.engine.dispose()');
  assert.deepEqual(errors,[]);console.log('Performance:',JSON.stringify(performance));
  await fs.writeFile(new URL('results.json',output),JSON.stringify({checked,performance,errors},null,2));
  console.log('PASS: bloom selectivity, sky/reticle preservation, runtime toggles, resizing and Ultra shadows; Marina day/night performance.');
}finally{ws.close();await fetch(chrome+'/json/close/'+tab.id);}
