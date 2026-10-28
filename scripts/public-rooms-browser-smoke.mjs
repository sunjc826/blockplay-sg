// Start pnpm preview:cloudflare first. Two isolated browsers use public room UI and WebSockets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'blockplay-public-room-check-'));
const output = new URL('../.cache/public-rooms/', import.meta.url); await mkdir(output, { recursive:true });
const origin = process.env.CLOUDFLARE_APP_ORIGIN || 'http://127.0.0.1:8787';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const browsers=[], pages=[];
async function page(port) {
  const child=spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-proxy-server',`--user-data-dir=${join(directory,String(port))}`,`--remote-debugging-port=${port}`,'--window-size=1440,1100','about:blank'],{stdio:'ignore'});browsers.push(child);
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.captureErrors=[];const capture=HTMLCanvasElement.prototype.requestPointerLock;HTMLCanvasElement.prototype.requestPointerLock=function(options){const p=capture.call(this,options);return p?.catch(e=>{window.captureErrors.push({name:e.name,message:e.message,focus:document.hasFocus(),hidden:document.hidden});throw e;});};const original=WebSocket.prototype.send;WebSocket.prototype.send=function(data){try{const p=JSON.parse(data).payload;if(p?.type==='arena-state')window.lastArenaSnapshot=p.snapshot;}catch{}return original.call(this,data);};})()`});
  await send('Page.navigate',{ url: `${origin}/multiplayer` });
  const p={send,evaluate,wait,click,key,screenshot,errors,close:()=>ws.close()};pages.push(p);return p;
}
const button=name=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
const phase=value=>`document.querySelector('.fps-game')?.dataset.phase===${JSON.stringify(value)}`;
const game=`document.querySelector('.fps-game')`;
const position=`({x:Number(${game}.dataset.playerX),z:Number(${game}.dataset.playerZ)})`;
async function field(p,selector,value){await p.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
try{
  const host=await page(9246),guest=await page(9247);
  await host.wait(`!!document.querySelector('.public-lobby')`);
  await host.click(`[...document.querySelectorAll('.lan-mode-picker button')].find(b=>b.textContent.includes('Create room'))`);
  await field(host,'input[autocomplete="nickname"]','Alpha');
  await field(host,'input[maxlength="40"]','Public browser test');
  await field(host,'input[type="password"]','browser-secret');
  await field(host,'#public-bots','0');
  await host.click(button('Create public room'));
  await host.wait(`!!document.querySelector('output[aria-label="Room code"]')`);
  const code=await host.evaluate(`document.querySelector('output[aria-label="Room code"]').textContent`);
  const invite=await host.evaluate(`document.querySelector('input[aria-label="Invite link"]').value`);
  assert(new URL(invite).pathname==='/multiplayer' && new URL(invite).searchParams.get('room')===code);
  assert(!invite.includes('browser-secret'));
  // Exercise actual JavaScript suspension beyond the ordinary heartbeat timeout.
  // Lifecycle events are simulated; real iOS/Android app switching still needs a phone.
  await host.evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))`);
  await host.send('Page.setWebLifecycleState',{state:'frozen'});
  await guest.wait(`!!document.querySelector('.public-lobby')`);
  await guest.click(`document.querySelector('[aria-label="Refresh rooms"]')`);
  await guest.wait(`!!document.querySelector('[data-room-code="'+${JSON.stringify(code)}+'"]')`);
  await guest.screenshot('room-browser');
  await guest.click(`document.querySelector('[data-room-code="'+${JSON.stringify(code)}+'"] button')`);
  await field(guest,'input[autocomplete="nickname"]','Bravo');
  await field(guest,'input[type="password"]','wrong-password');await guest.click(button('Join room'));
  await guest.wait(`document.querySelector('[role="alert"]')?.textContent.includes('Incorrect room password')`);
  await field(guest,'input[type="password"]','browser-secret');await guest.click(button('Join room'));
  await guest.wait(`!!${button('Enter multiplayer match')}`);
  console.log('Host frozen while invite is used; waiting beyond the normal heartbeat timeout');
  await delay(70_000);
  await host.send('Page.setWebLifecycleState',{state:'active'});
  await host.evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
  await host.wait(`document.querySelector('.lan-roster').textContent.includes('Bravo')`);
  assert.equal(await host.evaluate(`document.querySelector('input[aria-label="Invite link"]').value`),invite);
  await host.wait(`!${button('Enter multiplayer match')}.disabled`);
  await host.screenshot('host-roster');
  await host.click(button('Enter multiplayer match'));await guest.click(button('Enter multiplayer match'));
  await Promise.all([host.wait(phase('ready')),guest.wait(phase('ready'))]);
  console.log('Starting match');await host.click(button('Start match'));await host.wait(phase('playing'));
  await guest.click(button('Enter match'));await guest.wait(phase('playing'));
  await host.wait(`window.lastArenaSnapshot?.actors.length===2`);
  assert(await guest.evaluate(`${game}.dataset.arenaConnected==='true'`));
  for(const p of [host,guest]){assert(await p.evaluate(`!!document.querySelector('[data-minimap-player]')`));}
  // The guest's keyboard movement must appear in a host-owned outgoing snapshot.
  const before=await guest.evaluate(position);await guest.key('w','KeyW',1400);await delay(350);const after=await guest.evaluate(position);
  assert(after.z<before.z-.3,'Guest moved using keyboard');
  // Wait for authoritative simulation and guest prediction to converge. A
  // larger viewport can render more slowly than the old embedded debug scene.
  let replicated=false;
  for(let i=0;i<50;i++){
    const [remote,current]=await Promise.all([host.evaluate(`window.lastArenaSnapshot.actors.find(a=>a.name==='Bravo')`),guest.evaluate(position)]);
    if(Math.abs(remote.z-current.z)<.25){replicated=true;break;}
    await delay(100);
  }
  assert(replicated,'Movement replicated to authoritative host');
  console.log('Guest movement replicated');
  // A single physical desktop has one native mouse capture owner. Hand it back to the host.
  await guest.key('Escape','Escape');await guest.wait(phase('paused'));await guest.wait('!document.pointerLockElement');
  await host.key('Escape','Escape');await host.wait(phase('paused'));await host.wait('!document.pointerLockElement');
  await host.click(button('Resume match'));await host.wait(phase('playing'));
  // Approach through normal movement before testing fire, rather than relying
  // on distant spawn points being in range and clear of scenery.
  await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD'});
  try { await host.wait(`Number(${game}.dataset.playerX)>-8`,40000); }
  finally { await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD'}); }
  await delay(300);
  // Record DOM transitions as they happen; slow VM/CDP polling can miss a 3s respawn.
  await guest.evaluate(`(()=>{window.arenaLifeEvents=[];const game=document.querySelector('.fps-game');const record=()=>{const alive=game.dataset.arenaAlive;if(window.arenaLifeEvents.at(-1)?.alive!==alive)window.arenaLifeEvents.push({alive,health:Number(game.dataset.health)});};record();window.arenaLifeObserver=new MutationObserver(record);window.arenaLifeObserver.observe(game,{attributes:true,attributeFilter:['data-arena-alive','data-health']});})()`);
  // Aim through normal mouse movement and fire at the actual guest position.
  const shooter=await host.evaluate(position),victim=await guest.evaluate(position);
  const yaw=Math.atan2(-(victim.x-shooter.x),-(victim.z-shooter.z));const pitch=Math.atan2(-.65,Math.hypot(victim.x-shooter.x,victim.z-shooter.z));
  await host.evaluate(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:${-yaw/.0023},movementY:${-pitch/.0023}}))`);await delay(300);
  await host.send('Page.bringToFront');await host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:550,button:'left',clickCount:1});
  await host.wait(`${game}.dataset.arenaKills==='1'`,10000);await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:700,y:550,button:'left',clickCount:1});
  await guest.wait(`window.arenaLifeEvents.some(event=>event.alive==='false')`);
  await guest.wait(`window.arenaLifeEvents.some((event,index)=>event.alive==='true' && window.arenaLifeEvents[index-1]?.alive==='false')`,7000);assert.equal(await guest.evaluate(`Number(${game}.dataset.health)`),100);await guest.screenshot('guest-respawned');await guest.evaluate('window.arenaLifeObserver.disconnect()');
  console.log('Kill and respawn verified');await host.key('Escape','Escape');await host.wait(phase('paused'));await host.wait('!document.pointerLockElement');await host.screenshot('host-scoreboard');
  assert(await host.evaluate(`document.querySelector('.arena-scoreboard').textContent.includes('Bravo')`));
  assert(await host.evaluate(`window.lastArenaSnapshot.actors.find(a=>a.name==='Bravo').deaths===1`));
  // Host reset is shared and returns a living guest to its ready screen.
  await host.click(`document.querySelector('[aria-label="Reset arena match"]')`);await host.wait(phase('ready'));await guest.wait(phase('ready'));
  console.log('Starting match');await host.click(button('Start match'));await host.wait(phase('playing'));await guest.click(button('Enter match'));await guest.wait(phase('playing'));
  await host.key('Escape','Escape');await host.click(button('Leave match · return to lobby →'));
  await guest.wait(`${game}.dataset.arenaConnected==='false'`,10000);await guest.screenshot('host-disconnected');
  assert(await guest.evaluate(`document.querySelector('.arena-start-card h2').textContent==='Host disconnected.'`));
  await host.wait(`!!document.querySelector('.public-lobby')`);
  await host.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await host.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile lobby has no horizontal overflow');
  await host.screenshot('mobile-room-browser');
  for(const p of pages)assert.deepEqual(p.errors,[],'No browser errors');
  console.log('PASS: two real browser clients, public browser, password rejection, invite link, 70-second host suspension and recovery, host/join room, roster, shared movement, pointer capture, hitscan kill, guest death/respawn, scoreboard, shared reset and host disconnect. No state mutation used.');
}catch(error){for(let i=0;i<pages.length;i++){console.log('Browser exceptions',i,pages[i].errors);console.log('Client diagnostic',i,await pages[i].evaluate('JSON.stringify({captureErrors:window.captureErrors,phase:document.querySelector(".fps-game")?.dataset.phase,lock:!!document.pointerLockElement,snapshot:window.lastArenaSnapshot})').catch(()=>null));await pages[i].screenshot(`failure-${i}`).catch(()=>{});}throw error;}
finally{for(const p of pages)p.close();await Promise.all(browsers.map(b=>new Promise(resolve=>{if(b.exitCode!==null||b.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{b.kill('SIGKILL');resolve();},5000);b.once('exit',()=>{clearTimeout(timer);resolve();});b.kill('SIGTERM');})));await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(error=>console.warn('Could not remove browser test profile:',error.code));}
