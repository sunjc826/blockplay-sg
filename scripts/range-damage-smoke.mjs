// Actual Training UI + engine, with a deterministic aiming pilot in a scratch copy.
// Run Vite and an isolated Chrome; no paid APIs or personal browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/range-damage/', import.meta.url); await fs.mkdir(output, { recursive: true });
let source = await fs.readFile(new URL('../src/components/FpsGame.tsx', import.meta.url), 'utf8');
source = source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, q, p) => q + new URL(p, 'file:///src/components/source.tsx').pathname + q);
source = source.replace('useState(initialFpsHud), [epoch, setEpoch] = useState(0);', 'useState(initialFpsHud), [epoch, setEpoch] = useState(0); window.damageHud = hud;');
source = source.replace('rangeDrill: drill, loadScreen,', 'rangeDrill: drill, loadScreen, playerPilot: window.damagePilot,');
source = source.replace('encik: () => speaking.current });', 'encik: () => speaking.current }); window.damageEngine = engine.current;');
await fs.writeFile(new URL('FpsGame.tsx', output), source);
let html = await fs.readFile(new URL('fixtures/range-drills-ui.html', import.meta.url), 'utf8');
html = html.replace("'/src/components/FpsGame.tsx'", "'./FpsGame.tsx'");
html = html.replace('<body><div id="root"></div>', '<body><div class="game-screen game-screen-play"><div id="root" class="game-screen-body"></div></div>');
html = html.replace('function App()', `window.damageAim=1;window.stopAt=0;
window.rangeTargets=()=>JSON.parse(document.querySelector('canvas').dataset.rangeTargets||'[]');
window.damageLabels={};
const labelCanvases=new WeakMap(),fillText=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(text,...args){
 const title=/^Dummy (\\d+) · Tier /.exec(text);
 if(title){
  labelCanvases.set(this.canvas,title[1]);
  window.damageLabels[title[1]]=[text];
 }else{
  const id=labelCanvases.get(this.canvas);
  if(id)window.damageLabels[id].push(text);
 }
 return fillText.call(this,text,...args);
};
window.damagePilot={reset(){},decide(o){
 const t=rangeTargets()[window.damageAim];
 if(!t?.alive)return {goal:'engage',status:'Waiting',action:{}};
 const dx=t.x-o.position.x,dz=t.z-o.position.z,yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(t.y-1.75,Math.hypot(dx,dz));
 const ex=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),ey=pitch-o.pitch;
 return {goal:'engage',status:'Dummy check',action:{lookX:-ex/.0023*.8,lookY:-ey/.0023*.8,aim:true,fire:window.damageHud.landed<window.stopAt&&Math.abs(ex)<.008&&Math.abs(ey)<.008,reload:!o.magazine&&o.reserve>0}};
}};
function App()`);
await fs.writeFile(new URL('fixture.html', output), html);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/range-damage/fixture.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r,j) => { ws.onopen=r;ws.onerror=j; });
let serial=0;const pending=new Map(),errors=[],results=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error(method)),45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,timeout=90000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(100);}throw Error('Waiting for '+expression);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
const meter=index=>`rangeTargets()[${index}].damage`;
async function fireAt(index){await evaluate(`damageAim=${index};stopAt=damageHud.landed+1`);await wait(`damageHud.landed>=stopAt`);await delay(400);results.push(await evaluate(meter(index)));}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Page.bringToFront');
 await wait(`window.damageHud?.phase==='ready'`);assert.equal(await evaluate(`new Set(rangeTargets().map(t=>t.tier)).size`),5);
 assert.equal(await evaluate('damageLabels[3].length'),1);
 await evaluate('damageEngine.startPilot()');await wait(`damageHud.phase==='playing'`);
 await fireAt(2);const first=results.at(-1);assert(first.last>0&&first.lastArmor>0);assert.equal(first.last,first.total);assert(first.dps>0);
 await fireAt(2);assert(results.at(-1).total>first.total);await shot('desktop');
 const [title,health,armor]=await evaluate('damageLabels[3]');
 assert.match(title,/Dummy 3 · Tier 2/);assert.match(health,/Last .+ Total .+ DPS /);assert.match(armor,/Armor .+ last \/ .+ total/);
 assert.equal(await evaluate("document.querySelector('.range-damage-panel')"),null);
 const dpsBefore=await evaluate(`${meter(2)}.dps`);await wait(`${meter(2)}.dps<${dpsBefore}`,5000);
 await evaluate('damageEngine.pause()');const pausedDps=await evaluate(`${meter(2)}.dps`);await delay(500);assert.equal(await evaluate(`${meter(2)}.dps`),pausedDps);await evaluate('damageEngine.startPilot()');
 await fireAt(0);assert.equal(results.at(-1).lastArmor,0);assert.equal(results.at(-1).last,results.at(-1).total);
 // Every dummy has its own idle clock, and the display updates without another shot.
 await wait(`${meter(0)}.total===0 && damageLabels[1].length===1`,20000);assert.equal(await evaluate(`${meter(0)}.dps`),0);await shot('idle-reset');
 await fireAt(3);assert(results.at(-1).lastArmor>0);
 for(const [name,width,height] of [['phone',390,844],['landscape',844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await delay(300);
  if(name==='phone'){
   await evaluate('damageEngine.pause()');
   const p=await evaluate(`(()=>{const r=document.querySelector('.fps-start-card .primary-button').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await wait(`damageHud.phase==='playing'&&damageHud.inputMode==='touch'&&!damageHud.pilotEnabled`);
  }
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth && !document.querySelector('.range-damage-panel')"));
  assert.match(await evaluate('damageLabels[4][1]'),/DPS/);await shot(name);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate('damageEngine.startPilot(); damageAim=3; stopAt=Infinity');
 await wait('!rangeTargets()[3].alive && rangeTargets()[3].visible && rangeTargets()[3].tilt < 0',15000);
 await wait('rangeTargets()[3].visible && rangeTargets()[3].tilt === -Math.PI/2',4000);
 await shot('dummy-dropped');
 await wait('!rangeTargets()[3].visible',4000);
 await evaluate('damageEngine.pause();damageEngine.reset()');await wait(`damageHud.phase==='ready'`);
 assert(await evaluate('rangeTargets().every(t=>t.alive && t.visible && t.tilt===0 && t.damage.total===0)'));
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors,ok:true},null,2));console.log('PASS actual training: overhead damage labels, five tiers, separate totals, armor loss, live DPS, pause, idle expiry, desktop and touch layouts, dummy drop/despawn, exercise reset.');
}catch(error){await shot('failure').catch(()=>{});console.log(errors);throw error;}finally{await evaluate('damageEngine.dispose()').catch(()=>{});ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
