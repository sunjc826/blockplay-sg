// Vite + local Wrangler (8787) + isolated Chrome; real UI and WebSocket gameplay.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.HARDPOINT_APP_ORIGIN||'http://127.0.0.1:5313',chrome=process.env.HARDPOINT_CHROME_ORIGIN||'http://127.0.0.1:9499';
const out='.cache/hardpoint';await fs.mkdir(out,{recursive:true});const pages=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const button=name=>`[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width && b.textContent.trim()===${JSON.stringify(name)}).at(-1)`;
async function page(path='/multiplayer'){
 const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let serial=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},90000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=90000)=>{const start=Date.now();while(!await ev(`Boolean(${expression})`)){if(Date.now()-start>timeout)throw Error('Timeout '+expression+'\n'+await ev('document.body.innerText'));await delay(150);}};
 const click=async name=>{await send('Page.bringToFront');const p=await ev(`(()=>{const e=${button(name)};if(!e)throw Error('Missing button ${name}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
 const field=(selector,value)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const select=(selector,value)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const screenshot=async name=>fs.writeFile(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const close=async()=>{ws.close();await fetch(chrome+'/json/close/'+tab.id);};
 const p={send,ev,wait,click,field,select,screenshot,errors,close};pages.push(p);
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});
 // Read-only observation of real authority packets, including deaths/respawns between frames.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({scale:.5,frameCap:30,shadowDetail:'low',lensEffects:false,sightReflections:false,antialias:false}));localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({shadows:false,occlusion:false,reducedEffects:true}));const send=WebSocket.prototype.send;window.objectives=new Set();window.previews=new Set();window.contests=0;window.matchDeaths=new Set();window.matchRespawns=new Set();WebSocket.prototype.send=function(data){try{const p=JSON.parse(data).payload;if(p?.type==='arena-state'){window.lastArenaSnapshot=p.snapshot;if(p.snapshot.hardpoint){window.objectives.add(p.snapshot.hardpoint.active);if(p.snapshot.hardpoint.next)window.previews.add(p.snapshot.hardpoint.next);if(p.snapshot.hardpoint.contested)window.contests++;}for(const a of p.snapshot.actors){if(!a.alive)window.matchDeaths.add(a.id);else if(window.matchDeaths.has(a.id))window.matchRespawns.add(a.id);}}}catch{}return send.call(this,data);};})()`});
 await send('Page.navigate',{url:origin+path});await wait(`document.querySelector('[aria-label="Public multiplayer lobby"]')`);return p;
}
const ready=`document.querySelector('.fps-game')?.dataset.phase==='ready'`,playing=`document.querySelector('.fps-game')?.dataset.phase==='playing'`;
try{
 const host=await page('/play/multiplayer/hardpoint');await host.field('input[autocomplete="nickname"]','Hardpoint Host');await host.click('Create public room');await host.wait(`document.querySelector('output[aria-label="Room code"]')`);const code=await host.ev(`document.querySelector('output[aria-label="Room code"]').textContent`);
 const listing=await(await fetch(origin+'/api/rooms')).json();assert.equal(listing.rooms.find(r=>r.code===code).mode,'Hardpoint');assert.match(listing.rooms.find(r=>r.code===code).map,/Smith Street/);
 const guest=await page();await guest.field('input[autocomplete="nickname"]','Hardpoint Guest');await guest.field('.lan-code-input',code);await guest.click('Join room');await guest.wait(`document.querySelector('output[aria-label="Room code"]')`);await guest.click('Enter match');await guest.wait(ready);
 await host.click('Enter match');await host.wait(ready);await guest.wait(ready);
 for(const p of [host,guest]){await p.wait(`document.querySelectorAll('.arena-scoreboard tr[data-actor-id]').length===8`);assert.equal(await p.ev(`document.querySelector('.fps-game').dataset.mapZone`),'chinatown');assert.equal(await p.ev(`document.querySelector('.fps-game').dataset.matchMode`),'hardpoint');assert.equal(await p.ev(`document.querySelectorAll('.arena-scoreboard tr[data-actor-id]').length`),8);}
 assert.equal(await host.ev(`document.querySelector('.fps-game').dataset.team`),'alpha');assert.equal(await guest.ev(`document.querySelector('.fps-game').dataset.team`),'bravo');
 await host.click('Start match');await host.wait(playing);await guest.click('Enter match');await guest.wait(playing);
 const before=await guest.ev(`({x:Number(document.querySelector('.fps-game').dataset.playerX),z:Number(document.querySelector('.fps-game').dataset.playerZ)})`);await guest.send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});await delay(1800);await guest.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});await delay(400);const after=await guest.ev(`({x:Number(document.querySelector('.fps-game').dataset.playerX),z:Number(document.querySelector('.fps-game').dataset.playerZ)})`);assert(Math.hypot(after.x-before.x,after.z-before.z)>2,'Guest moves inside the authored area');
 await host.wait(`window.lastArenaSnapshot?.hardpoint.scores.alpha+window.lastArenaSnapshot?.hardpoint.scores.bravo>=2`,90000);
 await host.wait(`window.matchRespawns.size>0`,60000);
 await host.wait(`window.objectives.has('east') && window.previews.has('east')`,120000);await guest.wait(`document.querySelector('.fps-game').dataset.hardpointActive==='east'`);
 const snapshot=await host.ev('window.lastArenaSnapshot');assert.equal(snapshot.actors.length,8);assert(snapshot.actors.filter(a=>a.bot).some(a=>a.shots>0));for(const key of ['facilities','vehicles','transports','heat'])assert.equal(snapshot[key],undefined);
 await guest.wait(`Number(document.querySelector('.fps-game').dataset.alphaScore)+Number(document.querySelector('.fps-game').dataset.bravoScore)>=2`);
 for(const [p,name] of [[host,'hardpoint-online-host'],[guest,'hardpoint-online-guest']]){await p.send('Page.bringToFront');if(await p.ev(`document.querySelector('.fps-game')?.dataset.phase==='paused'`))await p.click('Resume match');await p.wait(playing);await p.screenshot(name);}
 // Pause only the local view; restart requires the existing confirmation dialog.
 await host.send('Page.bringToFront');if(await host.ev(playing)){await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});}
 await host.wait(`document.querySelector('.fps-game')?.dataset.phase==='paused'`);await host.click('Restart match');await host.wait(`document.querySelector('[role="alertdialog"]')`);await host.click('Restart match');await host.wait(ready);await guest.wait(`document.querySelector('.fps-game')?.dataset.alphaScore==='0' && document.querySelector('.fps-game')?.dataset.bravoScore==='0'`);
 assert.equal(await host.ev(`document.querySelector('.fps-game').dataset.hardpointActive`),'market');
 await fs.writeFile(`${out}/browser-results.json`,JSON.stringify({passed:true,area:'smith-street',scoreBeforeReset:snapshot.hardpoint,actors:snapshot.actors.map(({id,team,bot,kills,deaths})=>({id,team,bot,kills,deaths})),errors:pages.flatMap(p=>p.errors)},null,2));
 assert.deepEqual(pages.flatMap(p=>p.errors),[]);
 console.log('Hardpoint: real WebSocket host/guest, host-owned map, balanced teams, bot combat, scoring, respawn and rematch passed.');
}finally{for(const p of pages)await p.close();}
