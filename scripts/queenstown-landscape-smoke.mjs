// Start Vite with HMR disabled and isolated Chrome CDP, as for verticality-smoke.
// Actual WASD terrain ascent/descent in FPS and RegionGame, including host height.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9228';
const output=new URL('../.cache/queenstown-landscape-smoke/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const fixture=new URL('fixture.html',output), fixtureModule=new URL('fixture.mjs',output);
const fixtureHtml=`<!doctype html><style>body{margin:0}button{padding:12px}#stage{width:640px;height:420px}.marina-viewport{width:640px;height:420px}</style>
<button id="enter">Enter Queenstown landscape check</button><div id="stage"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {getRegion}=await import('/src/game/regions.ts');
const {getFpsDistrict}=await import('/src/game/fps-districts.ts');
const {createFpsEngine}=await import('/src/game/fps-engine.ts');
const {createSoloSession}=await import('/src/game/lan-peer.ts');
const {createProfile}=await import('/src/game/armory-state.ts');
const {queenstownTerrainHeight}=await import('/src/game/queenstown-terrain.ts');window.terrainHeight=queenstownTerrainHeight;
window.mountExplore=async()=>{const {default:RegionGame}=await import('/src/components/RegionGame.tsx');document.body.innerHTML='<style>.marina-viewport{width:640px;height:420px}</style><div id="explore"></div>';window.exploreRoot=createRoot(document.querySelector('#explore'));exploreRoot.render(React.createElement(RegionGame,{region:'queenstown'}));};
const region=getRegion('queenstown'),build=region.build,start={x:-119,z:14,yaw:0,pitch:0};
Object.assign(region.spawn,start);Object.assign(getFpsDistrict('queenstown').spawn,start);
region.build=()=>{const world=build();world.scene.onBeforeRender=(_r,_s,camera)=>{if(camera.isPerspectiveCamera&&camera.far>100)window.hdbCamera={x:camera.position.x,y:camera.position.y,z:camera.position.z};};return world;};
window.session=createSoloSession('Landscape check');
window.engine=createFpsEngine(document.querySelector('#stage'),hud=>window.hud=hud,{region:'queenstown',arena:{session,profile:createProfile(),botCount:0,environment:{bounds:region.bounds,move:region.move,spawns:[start],playerSpawn:start}}});
engine.configureDebug({combatEvents:false});
document.querySelector('#enter').onclick=()=>engine.start();
</script>`;
const fixtureSource=fixtureHtml.match(/<script type="module">([\s\S]*)<\/script>/)[1];
await fs.writeFile(fixtureModule,fixtureSource);
await fs.writeFile(fixture,fixtureHtml.replace(/<script type="module">[\s\S]*<\/script>/,'<script type="module" src="./fixture.mjs"></script>'));
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
// Waypoints follow the actual ground planes. The controller only presses keys.
let path;

async function walk(mode,points){
 await evaluate(`window.walkProbe={mode:${JSON.stringify(mode)},points:${JSON.stringify(points)},index:0,hits:[],error:null};
 (()=>{const held=new Set();const press=(key,on)=>{if(walkProbe.mode==='fps'){engine.setInput(key,on);return;}
  if(held.has(key)===on)return;on?held.add(key):held.delete(key);
  const e=new KeyboardEvent(on?'keydown':'keyup',{key,bubbles:true});(on?document.querySelector('canvas'):window).dispatchEvent(e);};
 press('shift',true);
 const tick=()=>{const p=window.hdbCamera,w=walkProbe;if(!p){w.frame=requestAnimationFrame(tick);return;}
  let target=w.points[w.index];const dx=target.x-p.x,dz=target.z-p.z;press('shift',Math.hypot(dx,dz)>2);
  if(Math.abs(dx)<.14&&Math.abs(dz)<.14){const feet=p.y-1.75;
   if(Math.abs(feet-target.y)>.18)w.error=JSON.stringify({at:w.index,target,feet});
   w.hits.push({target,camera:{...p},actor:window.hud?.arenaSelf&&{y:hud.arenaSelf.y}});w.index++;
   if(w.error||w.index===w.points.length){for(const key of ['w','a','s','d','shift'])press(key,false);return;}
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
 await wait("window.hud?.phase==='playing'&&!!window.hdbCamera");
 path=await evaluate('[[ -119,14],[-119,4],[-119,-22],[-119,-59],[-119,-68],[-119,-101]].map(([x,z])=>({x,z,y:terrainHeight(x,z)}))');
 reports.push(await walk('fps',path));await screenshot('fps-hillside-crossed');
 assert(reports[0].hits.some(hit=>hit.target.y>5&&Math.abs(hit.actor?.y-hit.target.y-1.75)<.2),'Host actor must follow the hillside');
 reports.push(await walk('fps',[...path].reverse()));await screenshot('fps-hillside-return');
 await fs.writeFile(new URL('fps-report.json',output),JSON.stringify({reports,googleRequests,errors},null,2));
 await evaluate('engine.dispose();session.close();window.hdbCamera=null');
 await evaluate('window.mountExplore()');
 await wait("!!window.hdbCamera&&!!document.querySelector('canvas')");
 await evaluate("document.querySelector('canvas').focus()");
 reports.push(await walk('exploration',path));await screenshot('exploration-hillside-crossed');
 reports.push(await walk('exploration',[...path].reverse()));await screenshot('exploration-hillside-return');
 assert.equal(googleRequests,0);assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('report.json',output),JSON.stringify({reports,googleRequests,errors},null,2));
 console.log('PASS Queenstown FPS and exploration: ordinary WASD ascent, terrace approach and descent in both directions, host terrain elevation; no runtime errors or Google requests.');
}catch(error){console.log(await evaluate('({probe:window.walkProbe,camera:window.hdbCamera,phase:window.hud?.phase})'));await screenshot('failure');throw error;}
finally{await evaluate('cancelAnimationFrame(window.walkProbe?.frame);window.engine?.dispose();window.exploreRoot?.unmount();window.session?.close()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id);await fs.rm(fixture,{force:true});await fs.rm(fixtureModule,{force:true});}
