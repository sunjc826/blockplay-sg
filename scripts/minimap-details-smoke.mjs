// Run Vite :5175 and Chrome --headless=new --remote-debugging-port=9228.
// Local-only checks: map selection, jamming, responsive layout and native capture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/map-details/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const previewHtml = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
await import('/src/styles.css');await import('/src/components/expedition.css');await import('/src/components/fps-hud-layout.css');
const {default:Map}=await import('/src/components/FpsMinimap.tsx');
const {default:Game}=await import('/src/components/FpsGame.tsx');
const {createProfile}=await import('/src/game/armory-state.ts');
const {getRegion,REGIONS}=await import('/src/game/regions.ts');
const {zoneSectors}=await import('/src/game/zone-sectors.ts');
const h=React.createElement;
const markers=[
 ...['command','garage','helipad','supply'].map((facilityType,i)=>({id:'site-'+i,kind:'facility',facilityType,label:['Forward camp · Capturing 42%','Utility garage · Operational','Falcon pad · Deployment suppressed','Supply depot · Under attack'][i],side:i%2?'enemy':'ally',active:i===0,x:-90+i*50,z:0})),
 ...['weapon','ammo','medical','armor','food'].map((lootType,i)=>({id:'loot-'+i,kind:'loot',lootType,label:lootType+' crate · Field tier',x:-90+i*45,z:55})),
 {id:'boat',kind:'boat',side:'enemy',label:'Hostile landing craft · Southern beach west · ETA 17s · 8 aboard',x:0,z:300},
 {id:'drop',kind:'parachute',side:'ally',label:'Friendly paratroopers · Drop in 12s',x:0,z:-120},
 {id:'exit',kind:'checkpoint',label:'Next district · Walk to checkpoint',active:true,x:250,z:0},
 {id:'enemy',kind:'enemy',label:'Visible hostile',x:20,z:20},
];
function App(){
 const [config,set]=React.useState({zone:'marina-bay',expanded:true,jammed:false,touch:false,game:new URLSearchParams(location.search).has('game')});window.setMapTest=set;window.mapRegions=REGIONS.map(r=>({id:r.id,decor:r.decor.length,sectors:zoneSectors(r.id).length}));
 if(config.game)return h(Game,{region:'marina-bay',profile:createProfile()});
 return h('div',{className:'fps-game expedition-game',style:{height:'100dvh',margin:0},'data-touch':config.touch?'on':undefined},h('div',{className:'viewport fps-viewport',style:{height:'100%',minHeight:0,background:'#162820'}},h('div',{className:'fps-hud-layout'},h('div',{className:'fps-hud-navigation'},h(Map,{zone:config.zone,player:{x:0,z:0,yaw:.5},markers,mode:'expedition',expanded:config.expanded,jammed:config.jammed,onToggle:()=>set(c=>({...c,expanded:!c.expanded}))})))));
}createRoot(document.querySelector('#root')).render(h(App));
</script>`;
const previewPath=new URL('preview.html',output);
if(await fs.readFile(previewPath,'utf8').catch(()=>null)!==previewHtml){await fs.writeFile(previewPath,previewHtml);await new Promise(resolve=>setTimeout(resolve,500));}
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/map-details/preview.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0; const pending = new Map(), errors = [], results = [];
ws.onmessage = event => {
 const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=30000){const at=Date.now();while(Date.now()-at<timeout){if(await evaluate(expression))return;await delay(100);}throw Error('Wait: '+expression);}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
async function key(key,code,held=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});if(held)await delay(held);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});}
async function screenshot(name){console.log('Screenshot:',name);const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function configure(config){await evaluate(`window.setMapTest(c=>({...c,...${JSON.stringify(config)}}))`);await delay(120);}
const phase=p=>`document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(p)}`;
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.bringToFront');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await wait('!!window.setMapTest&&!!document.querySelector(".fps-map-inspector")');
 await click('[data-minimap-marker="site-0"]');
 await wait('document.querySelector(".fps-map-inspector").textContent.includes("Capturing 42%")');
 await click('[data-minimap-marker="boat"]');
 assert((await evaluate('document.querySelector(".fps-map-inspector").textContent')).includes('ETA 17s'));
 const before=await evaluate('document.querySelector(".fps-map-inspector strong").textContent');await key(']','BracketRight');
 assert.notEqual(await evaluate('document.querySelector(".fps-map-inspector strong").textContent'),before);
 const all=await evaluate('window.mapRegions');
 for(const region of all){await configure({zone:region.id});const n=await evaluate('({decor:document.querySelectorAll("[data-map-decor]").length,sectors:document.querySelectorAll("[data-sector-boundary]").length})');assert.equal(n.decor,region.decor,region.id);assert.equal(n.sectors,region.sectors,region.id);}
 await configure({zone:'queenstown'});await screenshot('queenstown-expanded');
 await configure({zone:'marina-bay'});await click('[data-minimap-marker="site-0"]');await screenshot('desktop-expanded');
 await configure({jammed:true});assert.equal(await evaluate('document.querySelectorAll("[data-minimap-marker=site-0],[data-marker-kind=enemy],[data-sector-control],[data-map-danger]").length'),0);
 assert(await evaluate('!!document.querySelector("[data-sector-boundary]")&&!!document.querySelector("[data-marker-kind=landmark]")'));
 assert(!(await evaluate('document.querySelector(".fps-map-inspector").textContent')).includes('Capturing'));await screenshot('jammed');
 await configure({jammed:false,touch:true});
 for(const [name,width,height]of[['phone-portrait',390,844],['phone-landscape',844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(150);
  const layout=await evaluate('(()=>{const p=document.querySelector(".fps-minimap"),r=p.getBoundingClientRect(),svg=p.querySelector("svg").getBoundingClientRect(),ins=p.querySelector(".fps-map-inspector").getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,svgHeight:svg.height,insBottom:ins.bottom,scroll:p.scrollHeight,client:p.clientHeight}})()');
  assert(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height,JSON.stringify(layout));assert(layout.svgHeight>100,JSON.stringify(layout));assert(layout.scroll<=layout.client+2,JSON.stringify(layout));
  await screenshot(name);results.push({name,layout});
 }
 // Real touch selection: markers do not close the expanded map.
 await click('[aria-label="Next map marker"]');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const pt=await evaluate('(()=>{const r=document.querySelector("[data-minimap-marker=site-0]>g").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...pt,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(120);
 assert(await evaluate('!!document.querySelector(".fps-minimap.is-expanded")'));assert((await evaluate('document.querySelector(".fps-map-inspector strong").textContent')).includes('Forward camp'));await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 // Actual FPS engine: opening releases the mouse without pausing, inspection allows movement while keeping the mouse free,
 // closing reacquires capture, and capture denial still offers the standard Resume path.
 await send('Emulation.clearDeviceMetricsOverride');await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Page.navigate',{url:origin+'/.cache/map-details/preview.html?game=1'});
 await wait(phase('ready'),180000);await send('Page.bringToFront');await evaluate('window.captureErrors=[];const original=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=function(...args){try{return Promise.resolve(original.apply(this,args)).catch(e=>{window.captureErrors.push(e.name+": "+e.message+" connected="+this.isConnected+" root="+this.getRootNode().nodeName+" visibleCanvas="+(document.querySelector("canvas")===this));throw e;});}catch(e){window.captureErrors.push(e.name+": "+e.message+" connected="+this.isConnected+" root="+this.getRootNode().nodeName+" visibleCanvas="+(document.querySelector("canvas")===this));throw e;}}');await click('.fps-start-card .primary-button');await wait('document.querySelector(".fps-game")?.dataset.phase==="playing"||window.captureErrors.length>0');assert(await evaluate(phase('playing')),'Capture: '+JSON.stringify(await evaluate('window.captureErrors')));
 assert(await evaluate('!!document.pointerLockElement'));await key('z','KeyZ');await wait('[...document.querySelectorAll("button")].some(b=>b.textContent==="Stand")');
 await key('m','KeyM');await wait('!!document.querySelector(".fps-minimap.is-expanded")');await delay(250);
 assert(await evaluate('!document.pointerLockElement'));assert(await evaluate(phase('playing')));
 const position=()=>evaluate('(()=>{const d=document.querySelector(".fps-game").dataset;return{x:+d.playerX,z:+d.playerZ}})()');
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const pos=await position();await key('w','KeyW',800);await delay(250);assert(distance(await position(),pos)>.1,'W moves while the map close button holds focus');
 assert(await evaluate('!!document.querySelector(".fps-minimap.is-expanded")&&!document.pointerLockElement'));
 await click('[aria-label="Next map marker"]');const arrowPos=await position();await key('ArrowDown','ArrowDown',800);await delay(250);assert(distance(await position(),arrowPos)>.1,'Arrow movement works from inspector focus');
 await key(' ','Space');assert(await evaluate('!!document.querySelector(".fps-minimap.is-expanded")'),'Space does not activate the focused map button');
 for(let i=0;i<20;i++){await click('[data-marker-kind=target]');await delay(80);if((await evaluate('document.querySelector(".fps-map-inspector").textContent')).includes('Practice target'))break;}assert((await evaluate('document.querySelector(".fps-map-inspector").textContent')).includes('Practice target'));await screenshot('in-game-expanded');
 await click('.fps-map-close');await wait(phase('playing'));await wait('!!document.pointerLockElement&&document.activeElement===document.pointerLockElement');assert(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Stand")'));
 await key('m','KeyM');await wait('!!document.querySelector(".fps-minimap.is-expanded")');await delay(200);await key('Escape','Escape');await wait('!!document.pointerLockElement&&document.activeElement===document.pointerLockElement');
 await key('m','KeyM');await wait('!!document.querySelector(".fps-minimap.is-expanded")');await delay(200);
 await evaluate('window.mapRequestPointerLock=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException("Denied for smoke test","NotAllowedError"))');
 await click('.fps-map-close');await wait(phase('paused'));await evaluate('HTMLCanvasElement.prototype.requestPointerLock=window.mapRequestPointerLock');
 assert.equal(await evaluate('!!document.pointerLockElement'),false);await screenshot('capture-denied-safe');
 // Start a fresh touch session, then walk with the map open in both orientations.
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 async function tap(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);}
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.reload');await wait(phase('ready'),180000);
 await tap('.fps-start-card .primary-button');await wait(phase('playing'));await wait('!!document.querySelector("[data-touch-stick=move]")');
 for(const [name,width,height] of [['portrait-movement',390,844],['landscape-movement',844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(250);
  await tap('.fps-minimap');await wait('!!document.querySelector(".fps-minimap.is-expanded")');await delay(250);
  const stick=await evaluate('(()=>{const e=document.querySelector("[data-touch-stick=move]"),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,visible:getComputedStyle(e).visibility,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("[data-touch-stick]")===e}})()');
  assert.equal(stick.visible,'visible');assert(stick.hit,'Stick is reachable over the expanded map');
  const from=await position();await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x,y:stick.y,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x,y:stick.y+45,id:1}]});await delay(900);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(250);
  assert(distance(await position(),from)>.1,'Touch stick moves with expanded map');assert(await evaluate('!!document.querySelector(".fps-minimap.is-expanded")'));
  await screenshot(name);await tap('.fps-map-close');await wait('!document.querySelector(".fps-minimap.is-expanded")');
  results.push({name,movement:true,stickReachable:true});
 }
 assert.deepEqual(errors,[]);results.push({name:'desktop-engine',capture:true,selection:true,movement:true,denialSafe:true});
 await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors,districts:all.length},null,2));
 console.log('PASS map details: all 23 districts, all schematic shapes and sector outlines, mouse/touch/keyboard selection, visible status/ETA, jamming privacy, portrait/landscape layout, actual FPS pointer release/recapture, keyboard/touch movement with the map open and capture-denial recovery.');
}catch(error){console.error(error);console.log(await evaluate('({phase:document.querySelector(".fps-game")?.dataset.phase,captureErrors:window.captureErrors,focus:document.hasFocus(),errors:window.mapSmokeErrors})'));await screenshot('failure');throw error;}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
