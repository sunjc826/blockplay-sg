// Start Vite with HMR disabled and isolated Chrome CDP, as for verticality-smoke.
// Ordinary WASD input crosses a void deck, takes both return flights to level 2,
// crosses the access gallery, and retraces the route without position injection.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9228';
const output=new URL('../.cache/queenstown-housing-smoke/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const fixture=new URL('fixture.html',output);
await fs.writeFile(fixture,`<!doctype html><style>body{margin:0}button{padding:12px}#stage{width:640px;height:420px}.marina-viewport{width:640px;height:420px}</style>
<button id="enter">Enter Queenstown housing check</button><div id="stage"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {getRegion}=await import('/src/game/regions.ts');
const {getFpsDistrict}=await import('/src/game/fps-districts.ts');
const {createFpsEngine}=await import('/src/game/fps-engine.ts');
const {createSoloSession}=await import('/src/game/lan-peer.ts');
const {createProfile}=await import('/src/game/armory-state.ts');
const region=getRegion('queenstown'),build=region.build,start={x:-79,z:-44,yaw:0,pitch:0};
Object.assign(region.spawn,start);Object.assign(getFpsDistrict('queenstown').spawn,start);
region.build=()=>{const world=build();world.scene.onBeforeRender=(_r,_s,camera)=>{if(camera.isPerspectiveCamera&&camera.far>100)window.hdbCamera={x:camera.position.x,y:camera.position.y,z:camera.position.z};};return world;};
window.session=createSoloSession('Housing check');
window.engine=createFpsEngine(document.querySelector('#stage'),hud=>window.hud=hud,{region:'queenstown',arena:{session,profile:createProfile(),botCount:0,environment:{bounds:region.bounds,move:region.move,spawns:[start],playerSpawn:start}}});
engine.configureDebug({combatEvents:false});
document.querySelector('#enter').onclick=()=>engine.start();
</script>`);
const tab=await(await fetch(chrome+'/json/new?'+encodeURIComponent(origin+'/@fs'+decodeURIComponent(fixture.pathname)),{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];let googleRequests=0;
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
 if(m.method==='Network.requestWillBeSent'&&/maps\.googleapis|streetviewpixels/.test(m.params.request.url))googleRequests++;
};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(errors.length)throw Error(errors.join('\n'));if(await evaluate(expression))return;await delay(150);}throw Error('Timeout: '+expression);}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
// All waypoints are actual standing positions, with the 4.5 m flights and
// proper turning landings in the authored building. The controller only presses keys.
const path=[{x:-79,y:0,z:-44},{x:-101,y:0,z:-44},{x:-101,y:0,z:-36.5},{x:-108.8,y:0,z:-36.5},{x:-108.8,y:0,z:-37.5}];
let base=0;
for(const y of [3.4,6.2]){
 const mid=(base+y)/2;
 path.push({x:-108.8,y:base,z:-39.5},{x:-108.8,y:mid,z:-44},{x:-108.8,y:mid,z:-45.25},
  {x:-104.6,y:mid,z:-45.25},{x:-104.6,y:mid,z:-44},{x:-104.6,y,z:-39.5},{x:-104.6,y,z:-37.5});
 if(y===3.4)path.push({x:-108.8,y,z:-37.5});base=y;
}
path.push({x:-79,y:6.2,z:-37.5});
async function walk(mode,points){
 await evaluate(`window.walkProbe={mode:${JSON.stringify(mode)},points:${JSON.stringify(points)},index:0,hits:[],error:null};
 (()=>{const held=new Set();const press=(key,on)=>{if(walkProbe.mode==='fps'){engine.setInput(key,on);return;}
  if(held.has(key)===on)return;on?held.add(key):held.delete(key);
  const e=new KeyboardEvent(on?'keydown':'keyup',{key,bubbles:true});(on?document.querySelector('canvas'):window).dispatchEvent(e);};
 const tick=()=>{const p=window.hdbCamera,w=walkProbe;if(!p){w.frame=requestAnimationFrame(tick);return;}
  let target=w.points[w.index];const dx=target.x-p.x,dz=target.z-p.z;
  if(Math.abs(dx)<.14&&Math.abs(dz)<.14){const feet=p.y-1.75;
   if(Math.abs(feet-target.y)>.18)w.error=JSON.stringify({at:w.index,target,feet});
   w.hits.push({target,camera:{...p},actor:window.hud?.arenaSelf&&{y:hud.arenaSelf.y}});w.index++;
   if(w.error||w.index===w.points.length){for(const key of ['w','a','s','d'])press(key,false);return;}
  }else{press('a',dx<-.14);press('d',dx>.14);press('w',dz<-.14);press('s',dz>.14);}
  w.frame=requestAnimationFrame(tick);
 };tick();})();`);
 await wait('walkProbe.error||walkProbe.index===walkProbe.points.length',180000);
 const probe=await evaluate('walkProbe');assert.equal(probe.error,null);return probe;
}
const reports=[];
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Network.setBlockedURLs',{urls:['*://*.googleapis.com/*','*://streetviewpixels-pa.googleapis.com/*']});
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
 await wait("window.hud?.phase==='ready'");
 await send('Page.bringToFront');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:80,y:20,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:80,y:20,button:'left',clickCount:1});
 await wait("hud.phase==='playing'&&!!window.hdbCamera");
 reports.push(await walk('fps',path));await screenshot('fps-upper-corridor');
 assert(Math.abs(await evaluate('hud.arenaSelf.y')-7.95)<.15,'Host actor must reach the same second corridor');
 reports.push(await walk('fps',[...path].reverse()));await screenshot('fps-void-deck');
 await evaluate('engine.dispose();session.close();window.hdbCamera=null');
 await evaluate(`(async()=>{const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {default:RegionGame}=await import('/src/components/RegionGame.tsx');document.body.innerHTML='<style>.marina-viewport{width:640px;height:420px}</style><div id="explore"></div>';window.exploreRoot=ReactDOM.createRoot(document.querySelector('#explore'));exploreRoot.render(React.createElement(RegionGame,{region:'queenstown'}));})();`);
 await wait("!!window.hdbCamera&&!!document.querySelector('canvas')");
 await evaluate("document.querySelector('canvas').focus()");
 reports.push(await walk('exploration',path));await screenshot('exploration-upper-corridor');
 reports.push(await walk('exploration',[...path].reverse()));await screenshot('exploration-void-deck');
 assert.equal(googleRequests,0);assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('report.json',output),JSON.stringify({reports,googleRequests,errors},null,2));
 console.log('PASS Queenstown FPS and wider exploration walker: void-deck crossing, both return-stair levels, residential gallery, descent, host elevation; no runtime errors or Google requests.');
}catch(error){console.log(await evaluate('({probe:window.walkProbe,camera:window.hdbCamera,phase:window.hud?.phase})'));await screenshot('failure');throw error;}
finally{await evaluate('cancelAnimationFrame(window.walkProbe?.frame);window.engine?.dispose();window.exploreRoot?.unmount();window.session?.close()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id);await fs.rm(fixture,{force:true});}
