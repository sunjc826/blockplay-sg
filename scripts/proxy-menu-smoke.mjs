// Real engine, real mouse capture, native clicks and touch. Start Vite and CDP Chrome first.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5268',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9433';
const out=new URL('../.cache/proxy-menu/',import.meta.url);await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=30000){const end=Date.now()+timeout;while(!await evaluate(expression)){assert.deepEqual(errors,[]);if(Date.now()>end)throw Error('Timeout '+expression+' '+await evaluate('JSON.stringify({phase:window.hud?.phase,reach:window.hud?.proxyReach,menu:window.hud?.proxyMenu,op:window.hud?.arena?.proxies?.operation,position:[window.hud?.x,window.hud?.z],route:window.walkRoute})'));await delay(100);}}
async function point(selector){return evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);}
async function click(selector){const p=await point(selector);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
async function tap(selector){const p=await point(selector);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
async function key(key,code,modifiers=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',out),Buffer.from(r.data,'base64'));}
async function resume(){await wait('!hud.proxyMenu');if(await evaluate("hud.phase==='paused'")){await delay(350);await click('#enter');}await wait("hud.phase==='playing'");}
async function open(){await key('e','KeyE');await wait('hud.proxyMenu && !document.pointerLockElement');await delay(150);assert.equal(await evaluate('hud.phase'),'playing');assert(await evaluate("document.querySelector('.proxy-choice-card').contains(document.activeElement)"));}
const untouched=async()=>{assert.equal(await evaluate('hud.arena.proxies.operation.cargo'),'sealed');assert.deepEqual(await evaluate('hud.arena.proxies.favor'),{'freedom-force':0,'collective-cops':0});};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*api.openai.com/*','*api.elevenlabs.io/*','*/api/adventure/*','*maps.googleapis.com/*']});
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
 await send('Browser.setPermission',{permission:{name:'pointer-lock'},setting:'granted',origin});await send('Page.navigate',{url:origin+'/scripts/fixtures/proxy-menu.html'});await send('Page.bringToFront');
 await wait("window.hud?.phase==='ready'",90000);await click('#enter');await wait("hud.phase==='playing' && !!document.pointerLockElement");
 await evaluate('engine.skipDeployment()');await wait('hud.arenaStarted && hud.elapsed>.25');await evaluate("engine.triggerCombatEvent('proxy-cargo')");await wait('!!hud.arena?.proxies?.operation');await evaluate('walkToCargo()');await wait('window.arrived',60000);await wait('hud.proxyReach',30000);
 await open();assert(await evaluate("document.querySelector('.proxy-choice-footer>button').getBoundingClientRect().width>document.querySelector('.proxy-choice-card').getBoundingClientRect().width*.85"));await screenshot('desktop-menu');
 const before=await evaluate('({x:hud.x,z:hud.z,shots:hud.shots,yaw:hud.yaw})');
 await evaluate("engine.setInput('w',true);engine.setInput('fire',true)");await delay(250);
 const after=await evaluate('({x:hud.x,z:hud.z,shots:hud.shots,yaw:hud.yaw})');assert(Math.hypot(after.x-before.x,after.z-before.z)<.1);assert.equal(after.shots,before.shots);
 for(let i=0;i<8;i++){await key('Tab','Tab');assert(await evaluate("document.querySelector('.proxy-choice-card').contains(document.activeElement)"));}
 await click('[aria-label="Close cargo choices"]');await resume();await untouched();assert(await evaluate('!!document.pointerLockElement'));
 await open();await click('.proxy-choice-footer>button');await resume();await untouched();
 await open();await key('Escape','Escape');await resume();await untouched();
 await open();await key('e','KeyE');await resume();await untouched();
 await open();await send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});await resume();await untouched();
 await open();await evaluate("window.originalCapture=document.querySelector('canvas').requestPointerLock;document.querySelector('canvas').requestPointerLock=()=>Promise.reject(new DOMException('Review denial','NotAllowedError'))");
 await click('.proxy-choice-footer>button');await wait("!hud.proxyMenu && hud.phase==='paused'");assert(await evaluate("!document.querySelector('#enter').hidden"));await screenshot('capture-denied-resume');
 await evaluate("document.querySelector('canvas').requestPointerLock=window.originalCapture");await resume();await untouched();
 await open();await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await delay(150);
 const bounds=await evaluate("(()=>{const r=document.querySelector('.proxy-choice-footer>button').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:document.documentElement.scrollWidth>innerWidth}})()");assert(bounds.x>=0&&bounds.x+bounds.w<=390&&bounds.w>300&&bounds.y>=0&&bounds.y+bounds.h<=844&&!bounds.overflow,JSON.stringify(bounds));await screenshot('portrait-menu');
 await tap('.proxy-choice-footer>button');await wait("!hud.proxyMenu && hud.phase==='playing'");await untouched();
 await evaluate('engine.openProxyMenu()');await wait('hud.proxyMenu');await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(100);await screenshot('landscape-menu');
 assert(await evaluate("(()=>{const r=document.querySelector('.proxy-choice-footer>button').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight})()"));
 await tap('.proxy-choice-footer>button');await wait("!hud.proxyMenu && hud.phase==='playing'");await untouched();
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:50,y:850});await wait("hud.phase==='paused'");await resume();await open();
 await click('.proxy-choice-list>button:nth-child(3)');
 await wait("!hud.proxyMenu && hud.arena.proxies.operation.decision==='keep'");assert.equal(await evaluate("hud.arena.proxies.favor['freedom-force']"),-20);assert.equal(await evaluate("hud.arena.proxies.favor['collective-cops']"),0);
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',out),JSON.stringify({passed:true,checks:['real pointer lock released for menu','native close clicks','Tab focus containment','no movement or shots while choosing','Escape and E close','backdrop closes','leave preserves cargo and favor','denied recapture leaves Resume','portrait and landscape full-width exit stays visible','native touch cancellation','native mouse choice resolves cargo'],errors},null,2));console.log('PASS real engine crate mouse choices, keyboard, cancellation, capture denial and portrait/landscape touch exit.');
}catch(error){await screenshot('failure').catch(()=>{});console.error(errors);throw error;}finally{await evaluate('engine?.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
