// Vite + isolated Chrome with --autoplay-policy=no-user-gesture-required. No paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5193';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9253';
const output = new URL('../.cache/flyby-weight/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0, paidRequests = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /elevenlabs\.io/.test(m.params.request.url)) paidRequests++;
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 45000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.playedSfx=[]; window.sfxLabels=new WeakMap();window.sfxLinks=new WeakMap();
    const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(to,...args){const links=window.sfxLinks.get(this)||[];links.push(to);window.sfxLinks.set(this,links);return connect.call(this,to,...args);};
    const fetchOriginal=window.fetch; window.fetch=async (...args)=>{
      const response=await fetchOriginal(...args), url=String(args[0]);
      if(url.includes('/audio/sfx/')){const original=response.arrayBuffer.bind(response);response.arrayBuffer=async()=>{const data=await original();window.sfxLabels.set(data,url);return data;};}return response;
    };
    const decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=async function(data){const buffer=await decode.call(this,data);const url=window.sfxLabels.get(data);if(url)window.sfxLabels.set(buffer,url);return buffer;};
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){const url=window.sfxLabels.get(this.buffer);if(url){const filter=window.sfxLinks.get(this)?.[0],gain=window.sfxLinks.get(filter)?.[0];window.playedSfx.push({url,at:args[0]||this.context.currentTime,level:gain?.gain?.value,rate:this.playbackRate.value});}return start.apply(this,args);};
  ` });
  await send('Page.navigate',{url:origin+'/connection-check.html'});
  await evaluate(`(async()=>{
    const {createFpsEngine}=await import('/src/game/fps-engine.ts');
    const {createArena}=await import('/src/game/arena-rules.ts');
    const {createProfile}=await import('/src/game/armory-state.ts');
    const {getRegion}=await import('/src/game/regions.ts');
    const THREE=await import('/node_modules/three/build/three.module.js');
    localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({weather:'sunny',celebration:'none',timeOfDay:'afternoon',reducedEffects:true,shadows:false,occlusion:false}));
    document.body.innerHTML='<div id="stage" style="width:900px;height:650px"></div>';
    const sim=createArena([],0);sim.addPlayer('you','Test');window.snapshot=sim.snapshot();window.serial=0;
    let receive;const session={id:'you',name:'Test',role:'guest',send(){},subscribe(fn){receive=fn;return()=>{};},getPeers:()=>[{id:'host',name:'Host'}],onPeers:()=>()=>{},close(){}};
    const region=getRegion('marina-bay'),build=region.build,actor=window.snapshot.actors[0];
    region.build=()=>{const world=build();window.cover=new THREE.Mesh(new THREE.BoxGeometry(.5,4,.3),new THREE.MeshBasicMaterial());window.cover.position.set(actor.x+2,actor.y,actor.z-2);window.cover.visible=false;world.scene.add(window.cover);return world;};
    window.engine=createFpsEngine(document.querySelector('#stage'),hud=>window.hud=hud,{arena:{session,profile:createProfile(),botCount:0},playerPilot:{reset(){},decide(){return{goal:'engage',status:'Audio test',action:{}};}}});
    region.build=build;
    window.push=(rounds=[])=>receive('host',{type:'arena-state',snapshot:{...window.snapshot,tick:++window.serial,elapsed:window.serial*.05,rounds},started:true});
    window.round=(id,extra={})=>{const p=window.hud.arenaSelf;return{id,origin:{x:p.x+1,y:p.y,z:p.z-10},direction:{x:0,y:0,z:1},velocity:500,drop:0,limit:40,time:0,shooter:'enemy',calibre:5.56,power:36,...extra};};
    window.receiving=()=>!!receive;
  })()`);
  await wait("window.hud?.phase==='ready'&&window.receiving()");await evaluate('window.push();window.engine.startPilot()');
  await wait("window.hud?.phase==='playing'&&window.hud.arenaSelf");
  await new Promise(r=>setTimeout(r,1000));
  await evaluate('window.push([window.round(1)])');
  await wait("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length===2",15000);
  await evaluate('window.push([window.round(1)])');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length"),2,'Duplicate snapshot does not replay pass');
  await evaluate('window.push([window.round(2,{time:.04})])');
  await wait("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length===4",15000);
  await evaluate("window.push([window.round(3,{shooter:'you'}),window.round(4,{velocity:100}),window.round(5,{origin:{x:window.hud.arenaSelf.x+25,y:window.hud.arenaSelf.y,z:window.hud.arenaSelf.z-10}})])");
  await new Promise(r=>setTimeout(r,1000));
  assert.equal(await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length"),4,'Own, subsonic and distant passes are silent');
  await evaluate("window.cover.visible=true;window.push([window.round(6,{origin:{x:window.hud.arenaSelf.x+2,y:window.hud.arenaSelf.y,z:window.hud.arenaSelf.z-10},time:.04})])");
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length"),4,'Cover before the listener stops the pass');
  await evaluate('window.cover.visible=false');
  for(const [id,calibre,power] of [[7,7.62,36],[8,5.56,65],[9,12.7,145]]){
    const count=await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length");
    await evaluate(`window.push([window.round(${id},{calibre:${calibre},power:${power},time:.04})])`);
    await wait(`window.playedSfx.filter(s=>s.url.includes('/bullet-pass-')).length===${count+2}`,15000);
    const levels=await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-'))");
    assert(levels.at(-2).level>levels[0].level,'Published source bore/power makes the crack stronger');
    assert(levels.at(-1).level>levels[1].level,'Published source bore/power makes the echo stronger');
    assert.equal(levels.at(-2).rate,1,'Recorded speed remains natural');
  }
  const passes=await evaluate("window.playedSfx.filter(s=>s.url.includes('/bullet-pass-'))");
  await evaluate('window.engine.dispose()');
  assert.deepEqual(errors,[]);assert.equal(paidRequests,0);
  await fs.writeFile(new URL('remote-browser-results.json',output),JSON.stringify({passes,errors,paidRequests},null,2));
  console.log('PASS actual guest FPS engine foreign flight, caught-up snapshot, duplicate suppression, own/subsonic/distant exclusions, cover, source calibre/power scaling at playback and disposal.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
