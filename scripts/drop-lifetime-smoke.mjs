import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9358',origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5198';
const out=new URL('../.cache/drop-lifetime/',import.meta.url);await fs.mkdir(out,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/drop-lifetime.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push({text:m.params.entry.text,url:m.params.entry.url});};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error(method+' timeout')),30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',out),Buffer.from(shot.data,'base64'));};
try{
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1200,height:760,deviceScaleFactor:1,mobile:false});
const deadline=Date.now()+30000;while(!await evaluate('window.ready===true')){assert(Date.now()<deadline,'fixture ready');await new Promise(r=>setTimeout(r,150));}
await capture('full');
await evaluate('isolateFade()');const isolated=await evaluate('inspect()');assert.equal(isolated.uniform,.5);assert(isolated.patched);assert(isolated.otherHasOpaque,'fading one gun leaves the other opaque');await evaluate('restore()');
const before=await evaluate('advance(285)');assert.equal(before.fading.length,0);assert.equal(before.expired.length,0);
const half=await evaluate('advance(7.5)');assert(half.fading.length>2);assert(half.fading.every(item=>item.opacity===.5));await capture('half');
const focus=await evaluate('inspect()');assert(focus.focusOpacity>0&&focus.focusOpacity<=.45,'focus ring fades too');
assert(await evaluate('collect()'),'fading ammo remains collectible');
const final=await evaluate('advance(7)');assert(final.fading.every(item=>item.opacity<.01));await capture('almost-gone');
const expired=await evaluate('advance(.5)');assert.equal(expired.remaining.length,0);assert.equal(expired.groups.length,0);assert.equal(expired.focus,false);await capture('expired');
await evaluate('cleanup()');assert.deepEqual(errors,[]);
await fs.writeFile(new URL('results.json',out),JSON.stringify({passed:true,isolated,before,half,focus,final,expired,errors},null,2));
console.log('PASS: actual WebGL weapon/kit fading, independent materials, focus-ring fade, final-second pickup, expiry and zero browser/shader errors.');
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
