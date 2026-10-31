// Vite and isolated Chrome with autoplay enabled; renders real recorded bursts offline.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5194';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9254';
const output = new URL('../.cache/gunshot-bursts/', import.meta.url);
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
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.played=[];window.labels=new WeakMap();
    const fetchOriginal=window.fetch;window.fetch=async (...args)=>{const r=await fetchOriginal(...args),url=String(args[0]);
      if(url.includes('/audio/sfx/')){const original=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await original();window.labels.set(b,url);return b;};}return r;};
    const decode=BaseAudioContext.prototype.decodeAudioData;BaseAudioContext.prototype.decodeAudioData=async function(data){const b=await decode.call(this,data);const url=window.labels.get(data);if(url)window.labels.set(b,url);return b;};
    const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const url=window.labels.get(this.buffer);if(url)window.played.push({url,rate:this.playbackRate.value,at:args[0]||this.context.currentTime});return start.apply(this,args);};
  ` });
  await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html' });
  await wait("window.hud?.phase==='ready'"); await evaluate('window.engine.startPilot();window.action={fire:true}');
  await wait("window.played.filter(p=>p.url.includes('/rifle-556-')).length>=12");
  const live = await evaluate("window.played.filter(p=>p.url.includes('/rifle-556-')).slice(-10)");
  assert.equal(new Set(live.map(p => p.url)).size, 1, 'Live automatic fire has a consistent report');
  assert(live.every(p => p.rate >= .996 && p.rate <= 1.004));
  await evaluate('window.engine.toggleSound()'); const mutedCount = await evaluate('window.played.length');
  await new Promise(r => setTimeout(r, 400));
  assert.equal(await evaluate('window.played.length'), mutedCount, 'Mute schedules no sounds');
  await evaluate('window.engine.dispose()');
  const baseline = process.env.GUNSHOT_BASELINE_MODULE || null;
  const measurements = await evaluate(`(async()=>{
    const current=await import('/src/game/gunshot-audio.ts');
    const baseline=${baseline ? `await import(${JSON.stringify(baseline)})` : 'null'};
    const {createSfxBank}=await import('/src/game/sfx-bank.ts');
    const context=new AudioContext(),bank=createSfxBank();bank.load(context);
    const groups=['rifle-556','pistol-9','mg-762','hmg-127','suppressed','distant-rifle','distant-heavy'];
    const until=performance.now()+20000;
    while(!groups.every(g=>bank.get(g))){if(performance.now()>until)throw Error('Samples did not decode');await new Promise(r=>setTimeout(r,50));}
    const cases=[['rifle',5.56,36,.12,0],['ultimax',5.56,30,.085,0],['mg4',5.56,31,.075,0],['pistol',9,28,.22,0],['gpmg',7.62,60,.12,0],['hmg',12.7,160,.14,0],['suppressed',5.56,36,.1,0,'suppressor'],['distant',5.56,36,.1,160]];
    const all=[];window.renderedAudio={};
    for(const [version,module] of [['before',baseline],['after',current]]){if(!module)continue;
      for(const [name,calibre,power,interval,distance,muzzle] of cases){
        const rate=44100,count=12,length=4,offline=new OfflineAudioContext(2,length*rate,rate);
        Object.defineProperty(offline,'state',{get:()=> 'running'});
        const audio=module.createGunshotAudio(()=>offline,()=>false,bank),tone=module.gunshotTone(calibre,power,distance,distance===0,muzzle);
        const recorded=window.played.length,random=Math.random;let seed=4521;
        Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
        try{for(let i=0;i<count;i++)audio.fire(tone,0,.15+i*interval,'test');}finally{Math.random=random;}
        const takes=window.played.slice(recorded),buffer=await offline.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
        const energy=(from,to)=>{let sum=0;const a=Math.floor(from*rate),b=Math.min(left.length,Math.floor(to*rate));for(let i=a;i<b;i++)sum+=left[i]**2;return sum/Math.max(1,b-a);};
        const attacks=Array.from({length:count},(_,i)=>energy(.15+tone.delay+i*interval,.15+tone.delay+i*interval+.035));
        const db=attacks.map(e=>10*Math.log10(e));let peak=0;for(const v of left)peak=Math.max(peak,Math.abs(v));
        const last=.15+tone.delay+(count-1)*interval;
        all.push({version,name,peak,attackSpreadDb:Math.max(...db)-Math.min(...db),takes:[...new Set(takes.map(t=>t.url))],tailEnergy:energy(last+.1,last+.5),lateEnergy:energy(3.5,4)});
        if(name==='rifle'||name==='mg4'){
          const bytes=new Uint8Array(buffer.length*4),view=new DataView(bytes.buffer);
          for(let i=0;i<buffer.length;i++)for(let c=0;c<2;c++)view.setInt16(i*4+c*2,Math.round(Math.max(-1,Math.min(1,(c?right:left)[i]))*32767),true);
          let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
          window.renderedAudio[version+'-'+name]=btoa(binary);
        }
        audio.dispose();
      }
    }
    bank.dispose();await context.close();return all;
  })()`);
  for (const m of measurements.filter(m => m.version === 'after')) {
    assert(m.peak > .01 && m.peak < .98, m.name + ' audible without clipping');
    assert(m.attackSpreadDb < 2.5, m.name + ' stable consecutive attack levels');
    assert(m.lateEnergy < 1e-10, m.name + ' voices expire');
    assert(m.takes.length <= (m.name === 'distant' ? 2 : 1), m.name + ' consistent timbre');
  }
  for (const name of await evaluate('Object.keys(window.renderedAudio)')) {
    const pcm = Buffer.from(await evaluate(`window.renderedAudio[${JSON.stringify(name)}]`), 'base64');
    const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(44100, 24); header.writeUInt32LE(176400, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    await fs.writeFile(new URL(name + '.wav', output), Buffer.concat([header, pcm]));
  }
  assert.equal(paidRequests, 0); assert.deepEqual(errors, []);
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ live, measurements, paidRequests, errors }, null, 2));
  console.log('PASS live automatic-fire consistency and mute; eight rendered weapon/distance cases with stable attacks, clean tails and no clipping or paid API requests.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
