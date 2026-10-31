import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.EXPEDITION_CHROME_ORIGIN||'http://127.0.0.1:9346',origin=process.env.EXPEDITION_APP_ORIGIN||'http://127.0.0.1:5196';
const output=new URL('../.cache/naval-landings/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/naval-landings.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},90000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 const until=Date.now()+60000;while(!await evaluate('typeof window.reviewNaval === "function"')){assert(Date.now()<until,'fixture ready');assert.deepEqual(errors,[]);await new Promise(r=>setTimeout(r,150));}
 const results=[];
 const scenarios=process.env.NAVAL_ENGINE_ONLY?[]:[['approach',false],['ramping',false],['unloading',false],['unloading',true],['depart',false],['complete',false],['blocked',false],['driver',false],['destroyed',false],['unloading',false]];
 for(const [scenario,friendly] of scenarios){
  const phone=results.length===9;if(phone)await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const r=await evaluate(`window.reviewNaval(${JSON.stringify(scenario)},${friendly})`);results.push({...r,phone});assert.equal(r.glError,0);assert(r.accepted);
  if(scenario==='ramping'){assert.equal(r.state,'ramping');assert(r.ramp>0&&r.ramp<1);assert(r.craftVisible);}
  if(scenario==='unloading'){assert(r.infantry.length>0);assert(r.infantry.some(a=>a.z>193&&a.z<198));assert(r.renderedRamp<0);}
  if(scenario==='depart'){assert.equal(r.passengers,0);assert.equal(r.state,'leaving');assert.equal(r.infantry.length,4);}
  if(scenario==='complete'){assert.equal(r.state,'departed');assert(!r.craftVisible);}
  if(scenario==='blocked'){assert.equal(r.infantry.length,0);assert.equal(r.passengers,0);}
  if(scenario==='driver'){assert.equal(r.driverAlive,false);assert.equal(r.state,'stopped');assert.equal(r.infantry.length,0);}
  if(scenario==='destroyed'){assert.equal(r.health,0);assert.equal(r.passengers,0);assert.equal(r.infantry.length,0);}
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(`${scenario}${friendly?'-friendly':''}${phone?'-phone':''}.png`,output),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);if(results.length)await fs.writeFile(new URL('scenarios.json',output),JSON.stringify({results,errors,passed:true},null,2));
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 console.log('Loading full expedition engine.');
 await send('Page.navigate',{url:origin+'/scripts/fixtures/naval-engine.html'});
 const waitFor=async expression=>{const end=Date.now()+60000;while(!await evaluate('!!('+expression+')')){if(Date.now()>=end)throw Error(expression+' · '+await evaluate('JSON.stringify({phase:window.hud?.phase,message:window.hud?.message})'));assert.deepEqual(errors,[]);await new Promise(r=>setTimeout(r,250));}};
 await waitFor('!!window.hud');console.log('Initial engine HUD:',await evaluate('({phase:hud.phase,message:hud.message})'));
 await waitFor('window.hud?.phase === "ready"');console.log('Expedition ready; starting naval mission.');
 const startButton=await evaluate('(()=>{const r=document.querySelector("#start").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...startButton,id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await waitFor('window.hud?.arena?.transports?.some(t=>t.mode === "sea" && t.visible)');
 const engineStart=await evaluate('({phase:hud.phase,mode:hud.inputMode,events:hud.arena.events,markers:hud.mapMarkers.filter(m=>m.kind === "boat"),comms:hud.comms})');
 console.log('Incoming boat and ETA accepted by the real HUD.');
 assert.equal(engineStart.phase,'playing');assert(engineStart.markers.length);assert(engineStart.markers[0].label.includes('ETA'));
 assert(engineStart.comms.some(c=>c.text?.includes('Southern beach')||JSON.stringify(c).includes('Southern beach')));
 console.log('Checking the district map.');
 await evaluate('window.engine.toggleMap()');await waitFor('document.querySelector("[data-marker-kind=boat]")');
 let shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('engine-map-desktop.png',output),Buffer.from(shot.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await new Promise(r=>setTimeout(r,350));shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('engine-map-phone.png',output),Buffer.from(shot.data,'base64'));
 await evaluate('window.engine.toggleMap()');
 await waitFor('window.hud?.arena?.transports?.some(t=>t.mode === "sea" && t.state === "unloading" && t.ramp === 1) && window.hud?.arena?.actors?.some(a=>a.bot && !a.transport && a.z>185 && a.z<198)');
 const before=await evaluate('({elapsed:hud.arena.elapsed,clocks:hud.arena.reinforcementClocks})');
 await evaluate('window.engine.dispose()');
 const saved=await evaluate('window.infrastructure.get("sentosa")');for(const family of ['naval','external'])for(const faction of ['mercenaries','armed-forces'])assert(Math.abs(saved.reinforcementClocks[family][faction]-before.clocks[family][faction])<.5);
 assert(saved.reinforcementClocks.naval.mercenaries>120);assert(saved.reinforcementClocks.external.mercenaries>50);
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({results,engine:{start:engineStart,elapsed:before.elapsed,saved},errors,passed:true},null,2));console.log(`PASS ${results.length} rendered naval scenarios and the actual expedition engine: real coast, validated guests, ramp crossing, interception, cleanup, desktop/phone map warnings and saved travel cooldowns.`);
}finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});}
