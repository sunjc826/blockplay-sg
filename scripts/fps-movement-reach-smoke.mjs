// Requires local Vite and an isolated Chrome with remote debugging enabled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome=process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9244';
const output=new URL('../.cache/movement-reach-audit/browser/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error(`CDP timeout: ${method}`));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(150);}throw new Error(`Timed out: ${expression}`);}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
const motion=`JSON.parse(document.querySelector('canvas').dataset.movement||'null')`;
const reports=[];
try {
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 for (const fps of [60,10]) {
  await send('Page.navigate',{url:`${origin}/scripts/fixtures/movement-reach.html?fps=${fps}`});
  await wait(`window.hud?.phase==='ready'`);
  await send('Page.bringToFront');
  await evaluate(`window.engine.start();`);
  await wait(`window.hud?.phase==='playing'`);
  const report=await evaluate(`new Promise(resolve=>{
   const samples=[],start={x:hud.x,z:hud.z,time:performance.now()};engine.setInput('w',true);engine.setInput('shift',true);
   const timer=setInterval(()=>samples.push(${motion}),25);
   setTimeout(()=>{engine.setInput('w',false);engine.setInput('shift',false);clearInterval(timer);
    setTimeout(()=>resolve({start,end:{x:hud.x,z:hud.z,time:performance.now()},samples}),250);},3000);
  })`);
  report.fps=fps;report.distance=Math.hypot(report.end.x-report.start.x,report.end.z-report.start.z);reports.push(report);
  assert(report.distance>23&&report.distance<28,`sprint distance at ${fps} FPS: ${report.distance}`);
  assert(report.samples.some(s=>s.sprint>.95&&s.speed>8), 'sprint reaches new speed and pose');
  const xs=report.samples.filter(s=>s.sprint>.95).map(s=>s.run.x);assert(Math.max(...xs)-Math.min(...xs)>.035,'weapon swings with footfalls');
  await evaluate(`engine.setInput('w',true);engine.setInput('shift',true)`);await delay(450);await screenshot(`sprint-${fps}`);
  await evaluate(`engine.setInput('w',false);engine.setInput('shift',false)`);await delay(600);
  if(fps===60){
   await evaluate(`engine.useUtility('grenade','grenade-smoke')`);await wait(`document.querySelector('canvas').dataset.grenade.includes('ready')`);
   await evaluate(`engine.setInput('w',true);engine.setInput('shift',true)`);await delay(500);await screenshot('running-smoke-in-hand');
   await evaluate(`engine.setInput('w',false);engine.setInput('shift',false);engine.setInput('fire',true)`);await delay(150);await evaluate(`engine.setInput('fire',false)`);
   await wait(`Number(document.querySelector('canvas').dataset.grenades)>0`);
   await wait(`Number(document.querySelector('canvas').dataset.grenadeEvents)>0`);await screenshot('smoke-landed');
   await evaluate(`engine.setInput('shift',true);engine.setInput('w',true)`);await delay(500);
   await evaluate(`engine.setInput('fire',true)`);await delay(450);
   assert((await evaluate('hud.shots'))>0,'firing breaks sprint and raises gun');
   await evaluate(`engine.setInput('fire',false);engine.setInput('w',false);engine.setInput('shift',false)`);
  }
 }
 assert(Math.abs(reports[0].distance-reports[1].distance)<1.2,'slow renderer preserves real travel');
 await send('Page.navigate',{url:`${origin}/scripts/fixtures/character-render.html?pose=1,2,5&t=1.1`});await wait('window.ready');await screenshot('bot-walk-run-strafe');
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('report.json',output),JSON.stringify({reports,errors},null,2));
 console.log(JSON.stringify(reports.map(({fps,distance})=>({fps,distance}))));
 console.log('PASS: real-engine sprint timing, weapon running motion, held smoke, landed smoke, sprint-to-fire and bot poses.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
