// Vite + isolated Chrome CDP, default ports 5181 / 9231. No paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.ELITE_APP_ORIGIN || 'http://127.0.0.1:5181';
const chrome=process.env.ELITE_CHROME_ORIGIN || 'http://127.0.0.1:9231';
const out=new URL('../.cache/elite-squads/',import.meta.url);await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/scripts/fixtures/elite-squads.html`)}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[],results=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(`CDP timeout: ${method}`)),30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function ready(){for(let i=0;i<100;i++){if(await evaluate('window.ready===true'))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Fixture did not load');}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${name}.png`,out),Buffer.from(shot.data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await ready();
 for(const kind of ['elite-sweep','command-hunt'])for(const age of [9.9,10.1,14]){
   const result=await evaluate(`window.reviewElite(${JSON.stringify(kind)},${age})`);assert.equal(result.valid,true);assert.equal(result.actors.length,age<10?0:4);
   if(age>=10){assert.ok(result.actors.every(a=>a.rank===3&&a.armor>=110));assert.equal(result.actors.filter(a=>a.role==='elite-commander').length,kind==='command-hunt'?1:0);}
   assert.ok(result.draws>0);results.push(result);if(age!==14)await screenshot(`${kind}-${age}`);
 }
 const ids='xm8-spectre,g36-sentinel,mg4-bastion,xm8-sovereign,g36-regent';
 for(const view of ['side','sight']){
   await send('Page.navigate',{url:`${origin}/scripts/fixtures/enemy-weapons.html?only=${ids}&view=${view}`});await ready();
   assert.equal(await evaluate("document.querySelectorAll('.labels span').length"),5);await screenshot(`ultra-weapons-${view}`);
 }
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('browser-results.json',out),JSON.stringify({results,errors},null,2));console.log('PASS: six host/render squad scenarios and all five dressed weapon models, side and sight views.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
