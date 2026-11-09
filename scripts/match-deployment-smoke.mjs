// Vite + local Wrangler (8787) + isolated Chrome; real UI and WebSocket gameplay.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.MATCHES_APP_ORIGIN||'http://127.0.0.1:5231',chrome=process.env.MATCHES_CHROME_ORIGIN||'http://127.0.0.1:9391';
const out='.cache/menu-order';await fs.mkdir(out,{recursive:true});const pages=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const button=name=>`[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width && b.textContent.trim()===${JSON.stringify(name)}).at(-1)`;
async function page(){
 const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let serial=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}if(m.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true});if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},90000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=90000)=>{const start=Date.now();while(!await ev(`Boolean(${expression})`)){if(Date.now()-start>timeout)throw Error('Timeout '+expression+'\n'+await ev('document.body.innerText'));await delay(150);}};
 const click=async name=>{await send('Page.bringToFront');const p=await ev(`(()=>{const e=${button(name)};if(!e)throw Error('Missing button ${name}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
 const field=(selector,value)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const select=(selector,value)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const screenshot=async name=>fs.writeFile(`${out}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const close=async()=>{ws.close();await fetch(chrome+'/json/close/'+tab.id,{signal:AbortSignal.timeout(5000)}).catch(()=>{});};
 const p={send,ev,wait,click,field,select,screenshot,errors,close};pages.push(p);
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('blockplay-sg-graphics-v1',JSON.stringify({scale:.5,frameCap:30,shadowDetail:'low',lensEffects:false,sightReflections:false,antialias:false}));localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({shadows:false,occlusion:false,reducedEffects:true}));`});
 await send('Page.navigate',{url:origin+'/play'});await wait(`document.querySelector('.activity-grid')`);return p;
}

const ready=`document.querySelector('.fps-game')?.dataset.phase==='ready'`,playing=`document.querySelector('.fps-game')?.dataset.phase==='playing'`,room=`document.querySelector('.public-lobby')?.getBoundingClientRect().width>0`;
async function choose(p, path) {
 await p.ev(`document.querySelector('.activity-card[href="${path}"]').click()`);
 await p.wait(`location.pathname===${JSON.stringify(path)}`);
}

try {
 const p = await page();
 const modes = ['hardpoint', 'team-deathmatch', 'free-for-all'].filter(mode => !process.env.DEPLOYMENT_MODES || process.env.DEPLOYMENT_MODES.split(',').includes(mode));
 for (const mode of modes) {
   await p.send('Page.navigate', {url: origin + '/play/single-player'});
   await p.wait(`document.querySelector('.activity-card[href="/play/${mode}"]')`);
   await choose(p, '/play/' + mode);
   if (mode === 'team-deathmatch') { await p.wait(`document.querySelector('.starting-deploy')`); await p.click('Load arena'); }
   console.log('Loading',mode);
   await p.wait(ready);
   console.log('Ready',mode);
   await p.wait(`!document.querySelector('.play-loading')`);
   assert(await p.ev(`document.querySelector('canvas')?.dataset.deploymentOverview==='true'`), 'Aerial camera after loading');
   assert(!await p.ev(`!!document.querySelector('.solo-setup,.deployment-pins')`), 'No pre-load setup or spawn selection');
   await p.screenshot(mode+'-ready');
   await p.ev(`window.loadedCanvas=document.querySelector('canvas');true`);
   await p.click('Choose starting loadout');
   await p.select('[aria-label="Main weapon platform"]', '1');
   await p.click('Use for this match');
   await p.wait(`!document.querySelector('.respawn-loadout-screen')`);
   assert(await p.ev(`window.loadedCanvas===document.querySelector('canvas')`), 'Loadout does not reload terrain');
   if (mode === 'free-for-all') {
     await p.ev(`document.querySelector('.deployment-settings').open=true;document.querySelector('.public-options').open=true`);
     await p.field('.lan-bot-control input', '0');
     await p.wait(`document.querySelector('.lan-bot-control output').textContent==='0'`);
     await p.ev(`document.querySelector('.deployment-settings').open=false`);
   }
   await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await delay(800);
   await p.screenshot(mode+'-mobile');
   assert(await p.ev(`document.documentElement.scrollWidth<=innerWidth`));
   await p.send('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});await delay(800);
   await p.click('Start match');
   await p.wait(`document.querySelector('.fps-game')?.dataset.phase==='deploying'`);
   assert(await p.ev(`!!document.querySelector('.deployment-briefing') && !document.querySelector('.arena-start-card,.match-deployment')`), 'Intro with text and no ready overlay');
   await delay(850);
   await p.screenshot(mode+'-intro');
   await p.wait(playing);
   assert(await p.ev(`document.querySelector('canvas').dataset.deploymentOverview==='false'`));
   assert(await p.ev(`document.querySelector('.fps-game').dataset.arenaAlive==='true'`));
   await p.screenshot(mode+'-playing');
   console.log('PASS',mode);
 }
 // Training uses the same loaded-map setup and insertion, with no landing pins.
 await p.send('Page.navigate',{url:origin+'/training'});
 await p.wait(`document.querySelector('.starting-deploy')`);
 await p.click('Continue to training');await p.wait(ready);await p.wait(`!document.querySelector('.play-loading')`);
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(800);
 await p.screenshot('training-mobile');
 assert(!await p.ev(`!!document.querySelector('.deployment-pins')`));
 await p.click('Choose starting loadout');await p.select('[aria-label="Main weapon platform"]','1');await p.click('Use for this match');await p.wait(`!document.querySelector('.respawn-loadout-screen')`);
 await p.send('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});await delay(800);
 await p.click('Enter range');await p.wait(`document.querySelector('.fps-game')?.dataset.phase==='deploying'`);
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});await p.wait(playing);console.log('PASS training and skip intro');
 assert.deepEqual(p.errors, []);
 await fs.writeFile(out+'/browser-results.json',JSON.stringify({passed:true,modes:[...modes,'training'],errors:p.errors}));
} catch (error) { console.error(error); throw error; } finally { for (const p of pages) await p.close(); }
