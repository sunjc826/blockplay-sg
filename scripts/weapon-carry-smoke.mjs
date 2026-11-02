// Vite plus isolated Chrome CDP, matching the other FPS smoke checks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5193',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9353';
const output=new URL('../.cache/weapon-carry/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/weapon-carry.html?extra='+ (process.env.CARRY_EXTRA||1))}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(message.error.message)):request.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(12);}throw Error('Timed out: '+expression);}
async function capture(name){await fs.writeFile(new URL(name+'.png',output),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await wait("window.hud?.phase==='ready'",180000);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:40,y:20,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:40,y:20,button:'left',clickCount:1});
 await wait("hud.phase==='playing'");await evaluate('engine.lookBy(0,650)');await delay(100);await capture('equipped-rifle');
 const initial=await evaluate('({shots:hud.shots,magazine:hud.magazine})');
 await evaluate('samples=[];engine.switchWeapon(2);engine.reload();engine.setInput("fire",true);');
 await wait("JSON.parse(document.querySelector('canvas').dataset.weaponSwitch||'null')?.phase==='stow'");await capture('stow-rifle');
 assert.equal(await evaluate('hud.reloading'),0);
 await wait("JSON.parse(document.querySelector('canvas').dataset.weaponSwitch||'null')?.phase==='draw'");await capture('draw-pistol');await evaluate('engine.setInput("fire",false)');
 await wait("!document.querySelector('canvas').dataset.weaponSwitch");await capture('equipped-pistol');
 const samples=await evaluate('window.samples');
 assert(samples.some(s=>s.switch.phase==='stow'&&s.switch.family===0));assert(samples.some(s=>s.switch.phase==='draw'&&s.switch.family===2));
 for(const sample of samples){assert.equal(sample.shots,initial.shots);assert.equal(sample.carried.filter(g=>!g.visible).length,1);assert.equal(sample.carried.find(g=>!g.visible).family,sample.switch.family);}
 await evaluate('engine.setInput("fire",true)');await wait(`hud.shots>${initial.shots}`);await evaluate('engine.setInput("fire",false)');
 await evaluate('engine.switchWeapon(Number(new URLSearchParams(location.search).get("extra")))');await wait("JSON.parse(document.querySelector('canvas').dataset.weaponSwitch||'null')?.phase==='draw'");await capture('draw-secondary');
 await wait("!document.querySelector('canvas').dataset.weaponSwitch");await evaluate('engine.setInput("prone",true)');await delay(500);await capture('prone');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('evidence-'+(process.env.CARRY_EXTRA||1)+'.json',output),JSON.stringify({passed:true,errors,samples,final:await evaluate('JSON.parse(document.querySelector("canvas").dataset.carriedWeapons)')},null,2));
 console.log('PASS: body mounts, stow/draw handoff, reload gate, firing after draw and stance; no browser errors.');
}finally{await evaluate('window.engine?.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
