// Vite plus isolated Chrome CDP. Captures the actual models, hands and run sampler.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5175', chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9357';
const output=new URL('../.cache/weapon-running/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function capture(name){await fs.writeFile(new URL(name+'.png',output),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/scripts/fixtures/weapon-running.html'});
 for(let i=0;i<300&&!await evaluate('window.ready===true');i++)await new Promise(r=>setTimeout(r,100));
 assert(await evaluate('window.ready===true'),errors.join('\n')||'Fixture failed to load');await evaluate('review.pause()');
 const count=await evaluate('review.models.length'), samples=[];
 for(let i=0;i<count;i++){
  const name=await evaluate(`document.querySelector('#weapon').options[${i}].text`);
  for(const [label,phase]of [['left',Math.PI/2],['right',Math.PI*1.5]]){
   const pose=await evaluate(`review.frame(${i},${phase})`);assert(pose.y<0);assert(pose.yaw>0);assert(pose.roll>0);
   await capture(`${i}-${label}`);samples.push({index:i,name,label,pose});
  }
 }
 await evaluate('review.frame(0,0,0)');await capture('rifle-ready');
 await evaluate('review.frame(0,0,1,true)');await capture('rifle-reduced');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 for(const i of [0,2,4,12]){await evaluate(`review.frame(${i},0)`);await capture(`${i}-portrait`);}
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('evidence.json',output),JSON.stringify({passed:true,errors,samples},null,2));
 console.log(`PASS: ${count} weapon modes, both stride extremes, ready/reduced poses and portrait captures; no browser errors.`);
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
