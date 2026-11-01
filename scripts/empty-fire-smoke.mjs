// Vite + isolated Chrome, --autoplay-policy=no-user-gesture-required. No paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5204';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9364';
const output = new URL('../.cache/empty-fire-work/', import.meta.url);
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
  const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 120000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Timed out: ' + expression);
}
try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.clicks=[];window.pulses=[];
    const start=AudioBufferSourceNode.prototype.start, labels=new WeakMap();
    AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.emptyLabel)window.clicks.push({label:this.buffer.emptyLabel,rate:this.playbackRate.value});return start.apply(this,args);};
    const originalFetch=window.fetch;
    window.fetch=async(...args)=>{const r=await originalFetch(...args);if(String(args[0]).includes('/audio/empty-fire/')){const read=r.arrayBuffer.bind(r);r.arrayBuffer=async()=>{const b=await read();labels.set(b,String(args[0]));return b;};}return r;};
    const decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=async function(data){const b=await decode.call(this,data);if(labels.has(data))b.emptyLabel=labels.get(data);return b;};
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){if(this.matches('.fps-ammo strong'))window.pulses.push({frames,options,at:performance.now()});return animate.call(this,frames,options);};
  `});
  await send('Page.navigate', { url: origin + '/scripts/fixtures/range-drills.html' });
  await wait("window.hud?.phase==='ready'");
  await evaluate(`(async()=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {default:Hud}=await import('/src/components/FpsWeaponHud.tsx');
    const {FPS_WEAPONS}=await import('/src/game/fps-rules.ts');
    await import('/src/styles.css');await import('/src/components/fps-hud-layout.css');
    const host=document.createElement('div');host.className='fps-game';host.style.cssText='position:absolute;inset:0;pointer-events:none';document.body.append(host);
    const root=createRoot(host);window.hudRoot=root;
    window.drawHud=()=>root.render(React.createElement(Hud,{hud:{...window.hud},weapon:FPS_WEAPONS[window.hud.weapon],canFight:window.hud.phase==='playing'}));
    window.hudTimer=setInterval(window.drawHud,16);
    window.engine.startPilot();window.action={fire:true};
  })()`);
  await wait('window.hud.emptyFires===1');
  await new Promise(r=>setTimeout(r,600));
  assert.equal(await evaluate('window.hud.emptyFires'),1,'held empty trigger produces one event');
  assert.equal(await evaluate('window.clicks.length'),1,'one recorded click');
  assert.equal(await evaluate('window.pulses.length'),1,'one visual pulse');
  const shots=await evaluate('window.hud.shots');
  await evaluate('window.action={fire:false}');await new Promise(r=>setTimeout(r,200));
  await evaluate('window.action={fire:true}');await wait('window.hud.emptyFires===2');
  await wait('window.pulses.length===2');
  const frame=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('counter-pulse.png',output),Buffer.from(frame.data,'base64'));
  assert.equal(await evaluate('window.hud.shots'),shots,'dry fire does not count as a shot');
  await evaluate('window.action={fire:false};window.engine.toggleSound()');await new Promise(r=>setTimeout(r,200));
  await evaluate('window.action={fire:true}');await wait('window.hud.emptyFires===3');await wait('window.pulses.length===3');
  assert.equal(await evaluate('window.clicks.length'),2,'mute keeps visual feedback and suppresses audio');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('window.action={fire:false}');await new Promise(r=>setTimeout(r,200));
  await evaluate('window.action={fire:true}');await wait('window.hud.emptyFires===4');await new Promise(r=>setTimeout(r,150));
  assert.equal(await evaluate('window.pulses.length'),3,'reduced motion suppresses vibration and scaling');
  await evaluate('window.action={fire:false};window.engine.toggleSound();window.engine.reload()');
  await wait('window.hud.reloading>0');const before=await evaluate('window.hud.emptyFires');
  await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate('window.hud.emptyFires'),before,'no click during reload');
  await wait('window.hud.reloading===0');
  await evaluate('window.action={fire:true}');await wait(`window.hud.shots>${shots}`);
  await evaluate('window.action={fire:false};window.engine.switchWeapon(2)');await new Promise(r=>setTimeout(r,200));
  await evaluate('window.action={fire:true}');await wait('window.hud.weapon===2 && window.hud.magazine===0');
  await wait('window.clicks.some(c=>c.label.includes("empty-fire-pistol"))');
  const result=await evaluate('({clicks:window.clicks,pulses:window.pulses,shots:window.hud.shots,emptyFires:window.hud.emptyFires})');
  assert(result.clicks.every(c=>c.rate===1));assert.equal(paidRequests,0);assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('browser-results.json',output),JSON.stringify({...result,errors,paidRequests},null,2));
  console.log('PASS real engine rifle/pistol dry fire, one event per hold, repeated press, natural audio speed, actual HUD shake/scale, mute, reduced motion, reload and resumed firing.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
