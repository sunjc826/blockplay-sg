// Build first. Uses genuine browser input + WebRTC, two isolated Chrome processes.
// A guest's supplies in a shared arena: the host spends what the guest brought,
// heals them, runs their meal and shows them busy to everyone else.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLanServer } from './lan-server.mjs';
const directory = await mkdtemp(join(tmpdir(), 'blockplay-arena-food-'));
const output = new URL('../.cache/arena-lan-food/', import.meta.url); await mkdir(output, { recursive:true });
const server = createLanServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const browsers=[], pages=[];
async function page(port) {
  const child=spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-proxy-server','--disable-features=WebRtcHideLocalIpsWithMdns','--allow-loopback-in-peer-connection','--enable-unsafe-swiftshader','--use-angle=swiftshader',`--user-data-dir=${join(directory,String(port))}`,`--remote-debugging-port=${port}`,'--window-size=1440,1100','about:blank'],{stdio:'ignore'});browsers.push(child);
  for(let i=0;;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{if(i>80)throw Error('Chrome startup failed');await delay(100);}}
  const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(`CDP timeout ${method}`));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async(expression,timeout=20000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(100);}throw Error(`Timed out: ${expression}`);};
  const click=async expression=>{await send('Page.bringToFront');const p=await evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
  const key=async(key,code,hold=0)=>{await send('Page.bringToFront');await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});if(hold)await delay(hold);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});if(key==='Escape')await wait('!document.pointerLockElement');};
  const screenshot=async name=>{const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(new URL(name+'.png',output),Buffer.from(result.data,'base64'));};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  // Observe outbound authoritative snapshots; do not alter game or network state.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.captureErrors=[];const capture=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=function(options){const p=capture.call(this,options);return p?.catch(e=>{window.captureErrors.push({name:e.name,message:e.message,focus:document.hasFocus(),hidden:document.hidden});throw e;});};const original=RTCDataChannel.prototype.send;RTCDataChannel.prototype.send=function(data){try{const p=JSON.parse(data).payload;if(p?.type==='arena-state')window.lastArenaSnapshot=p.snapshot;}catch{}return original.call(this,data);};})()`});
  await send('Page.navigate',{ url: `${origin}/debug` });
  const p={send,evaluate,wait,click,key,screenshot,errors,close:()=>ws.close()};pages.push(p);return p;
}
const button=name=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
const phase=value=>`document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const game=`document.querySelector('.fps-game')`;
const position=`({x:Number(${game}.dataset.playerX),z:Number(${game}.dataset.playerZ)})`;
async function field(p,selector,value){await p.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
try{
  const host=await page(9246),guest=await page(9247);
  // The guest brings a bandage and the Mythic set, pinned to the food slot from the armory.
  // A partial save is restored over the defaults (armory-state restoreProfile).
  await guest.wait(`document.querySelectorAll('.location-card').length>0`);
  await guest.evaluate(`localStorage.setItem('blockplay.armory.v1',JSON.stringify({version:1,consumables:{'kit-bandage':1,'food-smoking-corner':1},quickItem:'food-smoking-corner'}))`);
  await guest.send('Page.reload');await delay(1500);
  for(const p of [host,guest]){await p.wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);await p.click(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('LAN arena'))`);}
  await field(host,'input[autocomplete="nickname"]','Alpha');await field(host,'#lan-bot-count','0');
  await host.click(button('Create LAN room'));await host.wait(`!!document.querySelector('output[aria-label="Room code"]')`);
  const code=await host.evaluate(`document.querySelector('output[aria-label="Room code"]').textContent`);
  await guest.click(`[...document.querySelectorAll('.lan-mode-picker button')].find(b=>b.textContent.includes('Join LAN'))`);
  await field(guest,'input[autocomplete="nickname"]','Bravo');await field(guest,'.lan-code-input',code);await guest.click(button('Connect to room'));
  await guest.wait(`!!${button('Enter multiplayer match')}`);await host.wait(`document.querySelector('.lan-roster').textContent.includes('Bravo')`);
  await host.click(button('Deploy squad'));await guest.click(button('Enter multiplayer match'));
  await Promise.all([host.wait(phase('ready')),guest.wait(phase('ready'))]);
  await host.click(button('Start match'));await host.wait(phase('playing'));
  await guest.click(button('Enter match'));await guest.wait(phase('playing'));
  await host.wait(`window.lastArenaSnapshot?.actors.length===2`);
  const bravo=`window.lastArenaSnapshot.actors.find(a=>a.name==='Bravo')`;
  assert(await guest.evaluate(`document.querySelector('.fps-belt-slot[data-kind="food"]')?.hasAttribute('data-chosen')`),'the armory pin reaches the food slot');
  // One shot from the host, so the guest has something to patch up.
  await guest.key('Escape','Escape');await guest.wait(phase('paused'));await guest.wait('!document.pointerLockElement');
  await host.key('Escape','Escape');await host.wait(phase('paused'));await host.wait('!document.pointerLockElement');
  await host.click(button('Resume match'));await host.wait(phase('playing'));
  const shooter=await host.evaluate(position),victim=await guest.evaluate(position);
  const yaw=Math.atan2(-(victim.x-shooter.x),-(victim.z-shooter.z));const pitch=Math.atan2(-.65,Math.hypot(victim.x-shooter.x,victim.z-shooter.z));
  await host.evaluate(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:${-yaw/.0023},movementY:${-pitch/.0023}}))`);await delay(300);
  await host.send('Page.bringToFront');await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:550,button:'left',clickCount:1});
  await delay(70);await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:700,y:550,button:'left',clickCount:1});
  await host.wait(`${bravo}.health<100 && ${bravo}.alive`,8000);
  const hurt=await host.evaluate(`${bravo}.health`);
  console.log(`Guest hit, on ${hurt} health`);
  await host.key('Escape','Escape');await host.wait(phase('paused'));await host.wait('!document.pointerLockElement');
  await guest.click(button('Resume match'));await guest.wait(phase('playing'));
  // A bandage: the host heals the guest, and shows them patching up meanwhile.
  await host.evaluate(`window.sawBravoBusy=false;window.busyWatch=setInterval(()=>{const a=window.lastArenaSnapshot?.actors.find(a=>a.name==='Bravo');if(a?.healing!==undefined)window.sawBravoBusy=true;},30)`);
  await guest.key('5','Digit5');
  await host.wait(`${bravo}.health>=${Math.min(100,hurt+25)-.5}`,8000);
  await guest.wait(`Number(${game}.dataset.health)>=${Math.min(100,hurt+25)-.5}`,4000);
  assert(await host.evaluate('window.sawBravoBusy'),'the host saw the guest patching up');
  console.log('PASS: a guest bandage heals on the host and the guest is seen patching up.');
  // The Mythic set, eaten at full health from the pinned slot.
  await guest.wait(`!document.querySelector('.fps-game canvas')?.dataset.supplyUse`,4000);
  await guest.key('4','Digit4');
  await host.wait(`Object.keys(${bravo}.food??{}).length===4`,12000);
  assert.deepEqual(await host.evaluate(`Object.keys(${bravo}.food).sort()`),['energised','steady','well-fed','wired']);
  await guest.wait(`document.querySelectorAll('.fps-food-effects li').length===4`,4000);
  await guest.screenshot('guest-fed');
  const remaining=await guest.evaluate(`parseInt(document.querySelector('.fps-food-effects li[data-kind="energised"] b').textContent)`);
  assert(remaining>200 && remaining<=240,`the guest's timer is the host's (${remaining}s)`);
  console.log('PASS: the host runs the guest\'s Mythic meal and the guest sees its four timers.');
  // Nothing more was brought, so nothing more is served.
  await guest.key('4','Digit4');await delay(800);
  assert((await guest.evaluate(`document.querySelector('.fps-message')?.textContent??''`)).length>0);
  assert.equal(await host.evaluate(`${bravo}.food.energised.remaining<=240`),true);
  for(const p of pages)assert.deepEqual(p.errors,[],'No browser errors');
  console.log('PASS: shared-arena supplies run on the host for a guest.');
}catch(error){for(let i=0;i<pages.length;i++){console.log('Browser exceptions',i,pages[i].errors);console.log('Client diagnostic',i,await pages[i].evaluate('JSON.stringify({captureErrors:window.captureErrors,phase:document.querySelector(".fps-game")?.dataset.phase,lock:!!document.pointerLockElement,snapshot:window.lastArenaSnapshot})').catch(()=>null));await pages[i].screenshot(`failure-${i}`).catch(()=>{});}throw error;}
finally{for(const p of pages)p.close();await Promise.all(browsers.map(b=>new Promise(resolve=>{if(b.exitCode!==null||b.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{b.kill('SIGKILL');resolve();},5000);b.once('exit',()=>{clearTimeout(timer);resolve();});b.kill('SIGTERM');})));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(error=>console.warn('Could not remove browser test profile:',error.code));}
