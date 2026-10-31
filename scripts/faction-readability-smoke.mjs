// Vite + isolated Chrome CDP, default ports 5183 / 9237. No paid requests.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const chrome=process.env.FACTION_CHROME_ORIGIN || 'http://127.0.0.1:9237',origin=process.env.FACTION_APP_ORIGIN || 'http://127.0.0.1:5183';
const out=new URL('../.cache/faction-readability/',import.meta.url);await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/faction-readability.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const all=[];
for(const [name,query]of [['front',''],['gray-front','gray=1&labels=0'],['gray-back','gray=1&yaw=3.14&labels=0'],['gray-side','gray=1&yaw=1.57&labels=0'],['recruits','rank=1'],['veterans','rank=3'],['distance','gray=1&distance=12&labels=0'],['run','pose=run'],['crouch','pose=crouch'],['prone','pose=prone']]){
 await send('Page.navigate',{url:`${origin}/scripts/fixtures/faction-readability.html?${query}`});
 let ready=false;for(let i=0;i<100;i++){if(await evaluate('window.ready===true')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ready,name);
 await new Promise(r=>setTimeout(r,150));const results=await evaluate('window.results');assert.equal(results.length,8);assert(results.every(r=>r.finite&&r.draws<=20),name+JSON.stringify(results));all.push({name,results});
 const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',out),Buffer.from(shot.data,'base64'));
}
assert.equal(errors.length,0);await fs.writeFile(new URL('browser-results.json',out),JSON.stringify({all,errors},null,2));console.log('PASS: '+all.length+' faction/role views, 80 rendered soldiers, finite combat poses, <=20 draws per figure, no browser errors.');ws.close();await fetch(`${chrome}/json/close/${tab.id}`);
