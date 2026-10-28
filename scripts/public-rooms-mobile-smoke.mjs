// Start pnpm preview:cloudflare first. Two isolated browsers use public room UI and WebSockets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'blockplay-mobile-room-check-'));
const output = new URL('../.cache/public-rooms-mobile/', import.meta.url); await mkdir(output, { recursive:true });
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
const tap = async (p, expression) => {
  const at = await p.evaluate(`(()=>{const e=${expression};if(!e)throw Error('Missing touch target');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1}]});
  await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
};
const phone = async (p,width,height) => {
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
};
const fits = async (p,label) => {
  assert(await p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),label+': no horizontal overflow');
};
const fullScene = async (p,width,height) => {
  const layout=await p.evaluate(`(()=>{const c=document.querySelector('.fps-viewport canvas').getBoundingClientRect();return {x:c.x,y:c.y,w:c.width,h:c.height,page:document.documentElement.scrollHeight,inner:innerHeight};})()`);
  assert.deepEqual({x:layout.x,y:layout.y,w:layout.w,h:layout.h},{x:0,y:0,w:width,h:height},'The canvas fills the viewport without native fullscreen');
  assert(layout.page<=layout.inner+1,'The match has no page scrolling');
  assert(await p.evaluate(`!document.querySelector('.fps-toolbar,.fps-inputs,.fps-loadout,.fps-pilot-panel,.fps-debug-panel,.arena-session-footer')`),'No developer panels or duplicate controls');
};
try{
  const host=await page(9248),guest=await page(9249);
  for(const p of [host,guest]){
    // iPhone-style path: the game must fit even without browser fullscreen.
    await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined,configurable:true});`});
    await phone(p,390,844);await p.send('Page.reload');await p.wait(`!!document.querySelector('.public-lobby')`);
  }
  await fits(host,'Room browser');await host.screenshot('01-browse');
  await tap(host,`[...document.querySelectorAll('.lan-mode-picker button')].find(b=>b.textContent.includes('Create room'))`);
  await host.wait(`!!document.querySelector('input[autocomplete="nickname"]')`);
  assert(await host.evaluate(`parseFloat(getComputedStyle(document.querySelector('input')).fontSize)>=16`),'Form text avoids mobile input zoom');
  await host.screenshot('02-create');
  await field(host,'input[autocomplete="nickname"]','Mobile host');
  await tap(host,`[...document.querySelectorAll('.public-options summary')].find(s=>s.textContent.includes('Room name'))`);
  await field(host,'input[maxlength="40"]','Phone squad');await field(host,'input[type="password"]','mobile-secret');
  await field(host,'#public-bots','0');
  await tap(host,button('Create public room'));await host.wait(`!!document.querySelector('output[aria-label="Room code"]')`);
  const code=await host.evaluate(`document.querySelector('output[aria-label="Room code"]').textContent`);
  const invite=await host.evaluate(`document.querySelector('input[aria-label="Invite link"]').value`);
  assert(!invite.includes('mobile-secret'));await fits(host,'Room');await host.screenshot('03-invite');
  await guest.send('Page.navigate',{url:invite});await guest.wait(`!!document.querySelector('.lan-code-input')`);
  assert.equal(await guest.evaluate(`document.querySelector('.lan-code-input').value`),code);
  await field(guest,'input[autocomplete="nickname"]','Mobile guest');await field(guest,'input[type="password"]','mobile-secret');
  await fits(guest,'Invite join');await guest.screenshot('04-join');
  await tap(guest,button('Join room'));await guest.wait(`!!${button('Enter multiplayer match')}`);
  await host.wait(`document.querySelector('.lan-roster').textContent.includes('Mobile guest')`);
  await tap(host,button('Enter multiplayer match'));await tap(guest,button('Enter multiplayer match'));
  await Promise.all([host.wait(phase('ready')),guest.wait(phase('ready'))]);
  assert.equal(await host.evaluate(`${game}.dataset.touch`),'on');
  await fullScene(host,390,844);await host.screenshot('05-ready-portrait');
  assert(await host.evaluate(`document.querySelector('.arena-start-card .primary-button').getBoundingClientRect().height>=44`));
  await tap(host,button('Start match'));await host.wait(phase('playing'));
  await tap(guest,button('Enter match'));await guest.wait(phase('playing'));
  await fullScene(host,390,844);
  assert(await host.evaluate(`![...document.querySelectorAll('.fps-belt-slot[data-empty]')].some(e=>e.getBoundingClientRect().height>0)`),'Empty supplies do not clutter the phone HUD');
  assert(await host.evaluate(`document.querySelector('.touch-chip').getBoundingClientRect().width>=44`),'Menu is a thumb-sized target');
  await host.screenshot('06-playing-portrait');
  // Simulate the shell's notch/home-indicator padding; CDP has no safe-area emulation.
  await host.evaluate(`document.querySelector('.game-screen-body').style.padding='47px 0px 34px'`);
  await host.wait(`document.querySelector('.fps-viewport canvas').getBoundingClientRect().height===innerHeight-81`);
  const safe=await host.evaluate(`(()=>{const c=document.querySelector('.fps-viewport canvas').getBoundingClientRect(),s=document.querySelector('[data-touch-stick="move"]').getBoundingClientRect(),m=document.querySelector('.touch-chip').getBoundingClientRect();return{top:c.top,bottom:c.bottom,stickBottom:s.bottom,menuTop:m.top};})()`);
  assert.equal(safe.top,47);assert.equal(safe.bottom,810);assert(safe.stickBottom<=810&&safe.stickBottom>=790);assert(safe.menuTop>=47&&safe.menuTop<=65);
  await host.screenshot('06-playing-safe-area');
  await host.evaluate(`document.querySelector('.game-screen-body').style.padding=''`);
  await host.wait(`document.querySelector('.fps-viewport canvas').getBoundingClientRect().height===innerHeight`);
  // Move using the thumb stick and verify the real player position changes.
  const before=await host.evaluate(position);
  const stick=await host.evaluate(`(()=>{const r=document.querySelector('[data-touch-stick="move"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await host.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,id:1}]});
  await host.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:stick.x,y:stick.y-50,id:1}]});
  await delay(900);await host.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await host.evaluate(position);assert(Math.hypot(after.x-before.x,after.z-before.z)>.2,'Touch stick moves the player');
  const ammo=()=>host.evaluate(`Number(document.querySelector('.fps-ammo strong').firstChild.textContent)`);
  const rounds=await ammo();
  const trigger=await host.evaluate(`(()=>{const r=document.querySelector('[data-touch-action="fire"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await host.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...trigger,id:1}]});await delay(350);await host.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(await ammo()<rounds,'Touch trigger fires the equipped weapon');
  for(const [label,width,height] of [['landscape',844,390],['small',320,640]]){
    await phone(host,width,height);await delay(400);await fullScene(host,width,height);await fits(host,label);await host.screenshot('07-playing-'+label);
    await tap(host,`document.querySelector('.touch-chip')`);await host.wait(phase('paused'));
    await fullScene(host,width,height);
    assert(await host.evaluate(`!document.querySelector('.arena-start-card .fps-control-guide')`),'Phone menu has no keyboard cheat sheet');
    const card=await host.evaluate(`(()=>{const r=document.querySelector('.arena-start-card').getBoundingClientRect();return{top:r.top,bottom:r.bottom};})()`);
    assert(card.top>=0&&card.bottom<=height+1,'Pause menu stays inside the viewport');
    await host.screenshot('08-menu-'+label);
    await tap(host,button('Resume match'));await host.wait(phase('playing'));
  }
  await tap(host,`document.querySelector('.touch-chip')`);await host.wait(phase('paused'));
  await tap(host,`[...document.querySelectorAll('.arena-menu-section summary')].find(s=>s.textContent.includes('Sound'))`);
  assert(await host.evaluate(`document.querySelector('.fps-player-tools button').getBoundingClientRect().height>=44`));
  await host.screenshot('09-settings');
  await tap(host,`document.querySelector('[aria-label="Reset arena match"]')`);await host.wait(phase('ready'));
  await tap(host,button('Leave match · return to lobby →'));await host.wait(`!!document.querySelector('.public-lobby')`);
  await fits(host,'Returned lobby');
  for(const p of pages)assert.deepEqual(p.errors,[],'No browser errors');
  console.log('PASS mobile multiplayer: room browser/create/invite/join, readable inputs, full-screen canvas without native fullscreen, portrait/landscape/320px, no developer panels, real touch movement/fire, pause/resume, scores, settings, reset and leave.');
}catch(error){for(let i=0;i<pages.length;i++){console.log('Browser exceptions',i,pages[i].errors);await pages[i].screenshot(`failure-${i}`).catch(()=>{});}throw error;}
finally{for(const p of pages)p.close();await Promise.all(browsers.map(b=>new Promise(resolve=>{if(b.exitCode!==null||b.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{b.kill('SIGKILL');resolve();},5000);b.once('exit',()=>{clearTimeout(timer);resolve();});b.kill('SIGTERM');})));await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(error=>console.warn('Could not remove browser test profile:',error.code));}
