// Real Training/Open World components with an initial occupied crossing approach.
// Fixtures expose observations; all subsequent travel and controls use production code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5203';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9363';
const output = new URL('../.cache/vehicle-crossing/', import.meta.url); await fs.mkdir(output, { recursive: true });
const absolute = s => s.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, q, p) => q + new URL(p, 'file:///src/components/source.tsx').pathname + q);
for (const name of ['FpsGame', 'ExpeditionGame']) {
  let source = absolute(await fs.readFile(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'));
  source = source.replace('({ region: initialRegion })', '({ region: initialRegion, ...window.entry })');
  source = source.replace('({ zone: initialZone, revision: 0 })', '({ zone: initialZone, revision: 0, ...window.entry })');
  source = source.replace('useState(initialFpsHud)', '(useState(initialFpsHud))');
  if (name === 'FpsGame') source = source.replace('const debug = useDebugMode();', 'window.hud = hud; const debug = useDebugMode();');
  else source = source.replace('const eliminationCallback = useRef(onElimination);', 'window.hud = hud; const eliminationCallback = useRef(onElimination);');
  if(name==='ExpeditionGame') source = source.replace('const [scene, setScene]', 'window.fleetCache = infrastructure; const [scene, setScene]');
  source = source.replace('onTravel: (transition, checkpoint) => {', 'onTravel: (transition, checkpoint) => { window.crossings.push({transition,checkpoint});');
  source = source.replace('    catch {', '    catch {');
  source = source.replace('    return () => { engine.current?.dispose();', '    window.engine = engine.current; return () => { engine.current?.dispose();');
  await fs.writeFile(new URL(`${name}.tsx`, output), source);
}
await fs.writeFile(new URL('fixture.html', output), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.fps-game .fps-viewport{height:100vh!important;min-height:0!important}</style></head><body style="margin:0"><div id="root"></div>
<script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import Training from './FpsGame.tsx';import Expedition from './ExpeditionGame.tsx';
import {createProfile} from '/src/game/armory-state.ts';import {createVehicle} from '/src/game/vehicle-rules.ts';import {createSharedVehicle} from '/src/game/vehicle-seats.ts';import {createArena} from '/src/game/arena-rules.ts';import {createRegionMovement} from '/src/game/region-collision.ts';import {DebugMode} from '/src/lib/debug-mode.ts';import {setEnvironmentSettings} from '/src/game/environment-settings.ts';import '/src/styles.css';
setEnvironmentSettings({weather:'sunny',celebration:'none',timeOfDay:'noon'});
const root=createRoot(document.querySelector('#root')),profile=createProfile(),noop=()=>{},vendor=()=>({purchased:false,profile,message:'Fixture'});let revision=0;
window.mountCase=(mode='training',kind='car',zone='harbourfront',desktop=false)=>{
 const direction=zone==='harbourfront'?1:-1,x=zone==='harbourfront'?109:108,seam=zone==='harbourfront'?210:-205,yaw=direction>0?Math.PI:0;
 const state={...createVehicle(kind,{x,z:seam-direction*3,yaw}),y:kind==='car'?.13:15,health:103,ammo:51};
 let crew;
 if(mode==='world'){
  const bounds={minX:-150,maxX:150,minZ:-150,maxZ:150},spawns={car:{x:0,z:0,yaw:0},helicopter:{x:40,z:0,yaw:0}},bx=spawns[kind].x;
  const a=createArena([],0,'assault',{bounds,move:createRegionMovement(bounds).move,spawns:[{x:bx+10,z:0}],playerSpawn:{x:bx+3.5,z:0},endless:true,facilities:{sites:[{id:'command',name:'Command',kind:'command',x:bx+10,y:0,z:0,initialOwner:'armed-forces',deployment:{x:bx+7,z:0,yaw:0}}],savedVehicles:['car','helicopter'].map(k=>({...createSharedVehicle(k,spawns[k]),faction:'armed-forces'}))}},{spawns,openWorld:true});
  a.addPlayer('fixture-player','Explorer',0,0,[],undefined,true);a.callout('fixture-player','gather');a.vehicleAction('fixture-player','enter',kind);for(let t=0;t<6;t+=.05)a.step(.05);
  crew=a.vehicleTravel('fixture-player',zone);crew.vehicle={...crew.vehicle,...state};crew.crew[0].actor.health=47;crew.crew[0].actor.armor=13;
 }
 const checkpoint={health:64,armor:21,weapon:0,ammunition:[{magazine:7,reserve:40,cooldown:0,reloadRemaining:0}],vehicleTravel:{state,seat:0,view:'first-person',crew},...(desktop?{}:{continuation:{inputMode:'touch',keys:[],muted:true}})};
 window.crossings=[];window.entry={spawn:{x:state.x,z:state.z,yaw,pitch:-.12},checkpoint};window.expectedCrew=crew?.crew.map(m=>({id:m.actor.id,name:m.actor.name,health:m.actor.health,armor:m.actor.armor,role:m.actor.role,weapon:m.actor.weapon,faction:m.actor.faction}))??[];
 const props=mode==='world'?{initialZone:zone,profile,onExit:noop,onVendorPurchase:vendor,onConsume:noop}:{region:zone,profile,onReward:noop,onConsume:noop,onElimination:noop};
 root.render(React.createElement(DebugMode.Provider,{value:false},React.createElement(mode==='world'?Expedition:Training,{key:++revision,...props})));
};window.mountCase();
</script></body></html>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/vehicle-crossing/fixture.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let serial=0;const pending=new Map(),errors=[],results=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error(method)),30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=120000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(80);}throw Error('Waiting for '+expression);}
const zone=z=>`(document.querySelector('.fps-game')?.dataset.mapZone||document.querySelector('.fps-game')?.dataset.zone)==='${z}'`;
async function record(label){const r=await evaluate(`({label:${JSON.stringify(label)},phase:hud.phase,zone:document.querySelector('.fps-game').dataset.mapZone||document.querySelector('.fps-game').dataset.zone,vehicle:hud.vehicle,health:hud.vehicleHealth,ammo:hud.vehicleAmmo,seat:hud.vehicleSeat,seats:hud.vehicleSeats,altitude:hud.altitude,x:hud.x,z:hud.z,yaw:hud.yaw,pitch:hud.pitch,view:hud.vehicleView,crew:expectedCrew.map(m=>hud.arena?.actors.find(a=>a.id===m.id))})`);results.push(r);console.log(JSON.stringify(r));}
async function checkCrew(){assert.equal(await evaluate('hud.vehicleSeats.filter(s=>s.occupied).length'),4);for(const m of await evaluate('expectedCrew')){const actual=await evaluate(`hud.arena.actors.find(a=>a.id===${JSON.stringify(m.id)})`);for(const k of Object.keys(m))assert.equal(actual[k],m[k],`${m.id}.${k}`);}}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.bringToFront');
 if(process.env.FPS_MOBILE!=='1')await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 if(process.env.FPS_MOBILE==='1'){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});}
 await wait('typeof window.mountCase==="function"');
 for(const mode of ['training','world'])for(const kind of ['car','helicopter']){
  await evaluate(`mountCase('${mode}','${kind}','harbourfront',${process.env.FPS_DESKTOP==='1'})`);
  if(process.env.FPS_DESKTOP==='1'){
   await wait(`hud?.phase==='ready' && hud.vehicle==='${kind}'`);
   const point=await evaluate(`(()=>{const e=document.querySelector('.fps-start-card .primary-button');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  await wait(`hud?.phase==='playing' && hud.vehicle==='${kind}'`);
  if(mode==='world')await checkCrew();
  await evaluate('window.firstCanvas=document.querySelector("canvas");engine.setInput("w",true)');
  if(kind==='helicopter')await evaluate('engine.setInput(" ",true)');
  await wait(`${zone('sentosa')} && hud.phase==='playing'`);
  await wait('hud.vehicleSpeed > crossings[0].checkpoint.vehicleTravel.state.speed*3.6+.2',20000);
  await evaluate('engine.setInput("w",false)');
  if(kind==='helicopter'){assert(await evaluate('crossings[0].checkpoint.vehicleTravel.state.climb>0'));assert(await evaluate('crossings[0].checkpoint.continuation.keys.includes(" ")'));await evaluate('engine.setInput(" ",false)');}
  assert.equal(await evaluate('document.querySelector("canvas")===firstCanvas'),true);
  if(process.env.FPS_DESKTOP==='1')assert(await evaluate('document.pointerLockElement===firstCanvas'));
  assert.equal(await evaluate('hud.vehicleHealth'),103);assert.equal(await evaluate('hud.vehicleAmmo'),51);
  assert.equal(await evaluate('hud.vehicleView'),'first-person'); assert(Math.abs(await evaluate('hud.pitch')+.12)<.01);
  if(mode==='world'){await checkCrew();assert.equal(await evaluate(`fleetCache.get('harbourfront').vehicles.some(v=>v.kind==='${kind}')`),false);}
  assert(await evaluate(`crossings[0].checkpoint.vehicleDepartures.harbourfront.kinds.includes('${kind}')`));
  await record(mode+'-'+kind+'-outbound');await screenshot(mode+'-'+kind+'-sentosa');
  await evaluate('engine.setInput("s",true)');await wait(`${zone('harbourfront')} && hud.phase==='playing'`);await evaluate('engine.setInput("s",false)');
  assert.equal(await evaluate('hud.vehicleHealth'),103);assert.equal(await evaluate('hud.vehicleAmmo'),51);
  assert.equal(await evaluate('hud.vehicleView'),'first-person'); assert(Math.abs(await evaluate('hud.pitch')+.12)<.01);
  if(mode==='world')await checkCrew();
  assert(await evaluate(`!crossings[1].checkpoint.vehicleDepartures.harbourfront.kinds.includes('${kind}')`));
  assert.equal(await evaluate('crossings.length'),2);await record(mode+'-'+kind+'-return');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL(process.env.FPS_MOBILE==='1'?'mobile-browser-results.json':process.env.FPS_DESKTOP==='1'?'desktop-browser-results.json':'browser-results.json',output),JSON.stringify({ok:true,results,errors},null,2));
}catch(e){console.log(await evaluate('({hud:window.hud,crossings:window.crossings})').catch(()=>null));console.log(errors);await screenshot('failure');throw e;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
