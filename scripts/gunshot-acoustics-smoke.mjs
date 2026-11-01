// Vite and isolated Chrome with autoplay enabled; renders real recorded bursts offline.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5213';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9373';
const output = new URL('../.cache/gunshot-acoustics/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let serial = 0, paidRequests = 0;
const pending = new Map(), errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.requestWillBeSent' && /elevenlabs\.io/.test(m.params.request.url)) paidRequests++;
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 60000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 90000) {
  const from = Date.now();
  while (Date.now() - from < timeout) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 150)); }
  throw Error('Timed out: ' + expression);
}
try {
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.bringToFront');
  await send('Page.navigate',{url:origin+'/scripts/fixtures/gunshot-acoustics.html'});
  await wait('!!window.acousticThree');
  const rendered=await evaluate(`(async()=>{
    const THREE=window.acousticThree;
    const {createSceneGunshotAcoustics}=await import('/src/game/gunshot-acoustics.ts');
    const {createGunshotAudio,gunshotTone}=await import('/src/game/gunshot-audio.ts');
    const {createSfxBank}=await import('/src/game/sfx-bank.ts');
    const {createImpactAudio}=await import('/src/game/impact-audio.ts');
    const {impactProfile}=await import('/src/game/fps-impact-profile.ts');
    const {combatOutput}=await import('/src/game/combat-output.ts');
    const {buildQueenstownScene}=await import('/src/game/queenstown-scene.ts');
    const {queenstownTerrainHeight}=await import('/src/game/queenstown-terrain.ts');
    const ear={x:0,y:1.75,z:0},spaces={};
    for(const kind of ['open','facade','covered','corridor']){
      const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial();
      const box=(x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);scene.add(m);};
      if(kind==='facade')box(8,4,0,.3,8,30);
      if(kind==='covered')box(0,3.4,0,24,.3,24);
      if(kind==='corridor'){box(-1.6,1.6,0,.3,3.2,30);box(1.6,1.6,0,.3,3.2,30);box(0,3.2,0,3.5,.3,30);}
      spaces[kind]=createSceneGunshotAcoustics(scene).at('test',ear,true);
      scene.traverse(o=>o.geometry?.dispose());material.dispose();
    }
    const queenstown=buildQueenstownScene(),base=queenstownTerrainHeight(-73,-44),probe=createSceneGunshotAcoustics(queenstown.scene);
    spaces['hdb-deck']=probe.at('deck',{x:-79,y:base+1.75,z:-44},true);
    spaces['hdb-gallery']=probe.at('gallery',{x:-79,y:base+5.15,z:-37.5},true);queenstown.dispose();
    const context=new AudioContext(),bank=createSfxBank();bank.load(context);const until=performance.now()+20000;
    while(!['rifle-556','hmg-127','suppressed','impact-concrete'].every(g=>bank.get(g,1))){if(performance.now()>until)throw Error('Audio did not load');await new Promise(r=>setTimeout(r,40));}
    const result=[],random=Math.random;Math.random=()=>.5;window.acousticWavs={};
    try{
      for(const [name,space] of Object.entries(spaces))for(const [weapon,calibre,power,muzzle] of [['rifle',5.56,36],['heavy',12.7,160],['suppressed',5.56,36,'suppressor']])for(const count of [1,8]){
        const offline=new OfflineAudioContext(2,5*44100,44100);Object.defineProperty(offline,'state',{get:()=> 'running'});
        const guns=createGunshotAudio(()=>offline,()=>false,bank,combatOutput),tone=gunshotTone(calibre,power,0,true,muzzle,space);
        for(let i=0;i<count;i++)guns.fire(tone,0,.1+i*.14);
        const buffer=await offline.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
        let peak=0;for(let i=0;i<left.length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
        const energy=(from,to)=>{let total=0;const end=Math.floor(to*44100);for(let i=Math.floor(from*44100);i<end;i++)total+=(left[i]**2+right[i]**2)/2;return total/((to-from)*44100);};
        const last=.1+(count-1)*.14;
        result.push({name,weapon,count,kind:space.kind,peak,attack:energy(.1,.15),tail:energy(last+.15,last+.8),late:energy(last+.8,last+1.1),expired:energy(4.5,5)});
        if(weapon==='rifle'&&count===1&&['open','covered','corridor'].includes(name)){
          const bytes=new Uint8Array(buffer.length*4),view=new DataView(bytes.buffer);
          for(let i=0;i<buffer.length;i++)for(let c=0;c<2;c++)view.setInt16(i*4+c*2,Math.round(Math.max(-1,Math.min(1,(c?right:left)[i]))*32767),true);
          let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));window.acousticWavs[name]=btoa(binary);
        }
        guns.dispose();
      }
      const mixed=[];
      for(const name of ['open','covered','corridor'])for(const [weapon,calibre,power] of [['rifle',5.56,36],['heavy',12.7,160]])for(const distance of [3,50]){
        const offline=new OfflineAudioContext(2,3*44100,44100);Object.defineProperty(offline,'state',{get:()=> 'running'});
        const guns=createGunshotAudio(()=>offline,()=>false,bank,combatOutput),impacts=createImpactAudio(()=>offline,()=>false,bank,combatOutput);
        for(let i=0;i<4;i++)guns.fire(gunshotTone(calibre,power,0,true,undefined,spaces[name]),0,i*.14);
        impacts.hit('concrete',distance,-.75,1,impactProfile(calibre,power));
        const buffer=await offline.startRendering();let peak=0;for(let c=0;c<2;c++)for(const v of buffer.getChannelData(c))peak=Math.max(peak,Math.abs(v));
        mixed.push({name,weapon,distance,peak});guns.dispose();impacts.dispose();
      }
      bank.dispose();await context.close();return{spaces,result,mixed};
    }finally{Math.random=random;}
  })()`);
  await fs.writeFile(new URL('renders.json',output),JSON.stringify(rendered,null,2));
  for(const r of rendered.result){assert(r.peak>.005&&r.peak<.95,`${r.name}/${r.weapon}/${r.count} has headroom`);assert(r.expired<1e-12,'Convolution tail releases completely');}
  for(const r of rendered.mixed)assert(r.peak<.98,`${r.name}/${r.weapon}/${r.distance} m mixed impact has headroom`);
  for(const weapon of ['rifle','heavy']){
    const row=name=>rendered.result.find(r=>r.name===name&&r.weapon===weapon&&r.count===1);
    assert(row('corridor').tail>row('open').tail*1.3,weapon+' corridor has a stronger room tail');
    assert(row('corridor').late>row('open').late*1.5+1e-12,weapon+' indoor tail carries beyond the open-area decay');
    assert(rendered.spaces['hdb-gallery'].decay>rendered.spaces['hdb-deck'].decay,'Gallery has a longer diffuse response');
    assert(Math.abs(row('hdb-gallery').tail-row('hdb-deck').tail)>row('hdb-deck').tail*.1,weapon+' actual HDB gallery differs from void deck');
  }
  for(const name of await evaluate('Object.keys(window.acousticWavs)')){
    const pcm=Buffer.from(await evaluate(`window.acousticWavs[${JSON.stringify(name)}]`),'base64'),header=Buffer.alloc(44);
    header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(44100,24);header.writeUInt32LE(176400,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);await fs.writeFile(new URL(name+'.wav',output),Buffer.concat([header,pcm]));
  }
  // Actual engine, controlled geometry around the authoritative spawn. World
  // geometry is replaced only in this private QA fixture; production maps are
  // independently checked above and in the authored HDB unit regression.
  await evaluate(`(async()=>{
    const THREE=window.acousticThree;
    const {getRegion}=await import('/src/game/regions.ts');const {createFpsEngine}=await import('/src/game/fps-engine.ts');
    const {createSoloSession}=await import('/src/game/lan-peer.ts');const {createProfile}=await import('/src/game/armory-state.ts');
    document.body.innerHTML='<div id="stage" style="width:900px;height:600px"></div>';
    localStorage.setItem('blockplay-sg-environment-v1',JSON.stringify({weather:'sunny',celebration:'none',timeOfDay:'afternoon',reducedEffects:true,shadows:false,occlusion:false}));
    window.mountAcoustic=kind=>{
      window.engine?.dispose();document.querySelector('#stage').replaceChildren();window.hud=null;window.fire=false;
      const region=getRegion('marina-bay'),build=region.build;
      region.build=()=>{const world=build();world.scene.clear();world.scene.add(new THREE.HemisphereLight(0xffffff,0x333333,2));
        const box=(x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:'#bcbcb8'}));m.position.set(-44+x,y,68+z);world.scene.add(m);};
        box(0,-.1,0,120,.2,120);
        if(kind==='facade')box(8,4,0,.3,8,30);
        if(kind==='covered')box(0,3.4,0,24,.3,24);
        if(kind==='corridor'){box(-1.6,1.6,0,.3,3.2,30);box(1.6,1.6,0,.3,3.2,30);box(0,3.2,0,3.5,.3,30);}
        return world;};
      try{window.engine=createFpsEngine(document.querySelector('#stage'),hud=>window.hud=hud,{region:'marina-bay',arena:{session:createSoloSession('Acoustics'),profile:createProfile(),botCount:0},playerPilot:{reset(){},decide(){return{goal:'engage',status:'Acoustic test',action:{fire:window.fire&&window.hud.shots<3}};}}});}finally{region.build=build;}
    };
  })()`);
  const live=[];
  for(const [name,expected] of [['open','open'],['facade','facade'],['covered','covered'],['corridor','enclosed']]){
    await evaluate(`window.mountAcoustic(${JSON.stringify(name)})`);await wait("window.hud?.phase==='ready'");
    await evaluate('window.engine.startPilot()');await wait("window.hud?.phase==='playing'");
    await evaluate('window.fire=true');await wait('window.hud.shots>=3');
    const read=await evaluate("({kind:document.querySelector('canvas[data-gunshot-acoustics]')?.dataset.gunshotAcoustics,shots:window.hud.shots})");
    assert.equal(read.kind,expected,'Actual engine uses the firing position geometry');live.push({name,...read});
    await evaluate('window.engine.toggleSound();window.engine.pause()');
    const shots=await evaluate('window.hud.shots');await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate('window.hud.shots'),shots);
  }
  await evaluate('window.engine.dispose()');
  assert.deepEqual(errors,[]);assert.equal(paidRequests,0);
  await fs.writeFile(new URL('browser-results.json',output),JSON.stringify({live,rendered,errors,paidRequests},null,2));
  console.log('PASS source-geometry acoustics in actual FPS engine; open/facade/void-deck/corridor and authored HDB samples; 36 rifle/heavy/suppressed single/burst renders, 12 impact mixes, room-tail lifetime, headroom, pause/mute and zero paid requests.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
