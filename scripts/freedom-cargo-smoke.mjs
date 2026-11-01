// Real-engine cargo weapon, mode, physical magazine, ADS and bolt-cycle smoke.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5183',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9237';
const output=new URL('../.cache/freedom-cargo-v2/browser/',import.meta.url);await fs.mkdir(output,{recursive:true});
const fixture=new URL('fixture.html',output);
await fs.writeFile(fixture,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#17231e;color:white;font:16px sans-serif}.fps-game{position:relative;padding:0;margin:0;max-width:none;width:100vw;height:calc(100dvh - 40px)}#world{width:100%;height:100%}#enter{height:40px}</style><button id="enter">Enter range</button><div class="fps-game"><div id="world"></div><div id="hud"></div></div><script type="module">
import React from '/node_modules/.vite-freedom-cargo/deps/react.js';import ReactDOM from '/node_modules/.vite-freedom-cargo/deps/react-dom_client.js';
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const {default:FpsWeaponHud}=await import('/src/components/FpsWeaponHud.tsx');await import('/src/styles.css');
const {createFpsEngine}=await import('/src/game/fps-engine.ts');const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');const {recoverProxyWeapon}=await import('/src/game/proxy-equipment.ts');
const root=ReactDOM.createRoot(document.querySelector('#hud'));window.touchMode=false;
window.choose=id=>{window.engine?.dispose();window.equipment=resolveLoadout(recoverProxyWeapon(createProfile(),id,0));window.engine=createFpsEngine(document.querySelector('#world'),hud=>{window.hud=hud;root.render(React.createElement(FpsWeaponHud,{hud,weapon:equipment.weapons[hud.weapon],canFight:hud.phase==='playing',touch:window.touchMode,onToggleMode:()=>engine.toggleWeaponMode(),onInspect:()=>engine.inspectWeapon()}));},{tutorial:true,loadout:equipment});engine.configureDebug({regeneration:false,combatEvents:false});};
document.querySelector('#enter').onclick=()=>engine.start();choose('ff-oicw');
</script>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/@fs' + decodeURIComponent(fixture.pathname))}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  }
  if (message.method === 'Network.loadingFailed' && message.params.errorText !== 'net::ERR_ABORTED') errors.push(message.params.errorText);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a=>a.value??a.description).join(' '));
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Timed out waiting for ' + expression + ' ' + await evaluate('JSON.stringify({phase:window.hud?.phase,message:window.hud?.message,body:document.body.innerText.slice(0,800)})'));
}

async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
async function enter(){await wait("window.hud?.phase==='ready'",60000);await evaluate("document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));document.querySelector('#enter').click()");await wait("hud.phase==='playing'");await delay(1700);}
async function fire(ms=120){await evaluate("engine.setInput('fire',true)");await delay(ms);await evaluate("engine.setInput('fire',false)");}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Page.reload',{ignoreCache:true});await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 await enter();assert.equal(await evaluate('hud.weapon'),11);await screenshot('peace-rifle-ready');
 await evaluate('engine.toggleAim()');await wait('hud.aimProgress>.95');await screenshot('peace-rifle-ads');await evaluate('engine.toggleAim()');
 const before=await evaluate('({shots:hud.shots,ammo:hud.magazine})');await fire();await wait('hud.shots>'+before.shots);const rifleAmmo=await evaluate('hud.magazine');assert(rifleAmmo<before.ammo);await delay(250);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'u',code:'KeyU'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'u',code:'KeyU'});await wait('hud.weapon===13');
 assert.equal(await evaluate('hud.magazineCapacity'),6);assert.equal(await evaluate('JSON.parse(document.querySelector("canvas").dataset.magazineInventory).slots.filter(m=>m?.caliberMm===20).length'),2);await screenshot('peace-launcher-ready');
 await evaluate('engine.toggleAim()');await wait('hud.aimProgress>.95');await screenshot('peace-launcher-ads');await evaluate('engine.toggleAim()');
 const grenadeCount=await evaluate('hud.shots');await fire();await wait('hud.shots>'+grenadeCount);assert.equal(await evaluate('hud.magazine'),6);await wait('Number(document.querySelector("canvas").dataset.grenadeEvents)>0',15000);await delay(950);
 await evaluate("document.querySelector('.fps-mode-select').click()");await wait('hud.weapon===11');assert.equal(await evaluate('hud.magazine'),rifleAmmo);
 await evaluate("document.querySelector('.fps-mode-select').click()");await wait('hud.weapon===13');await evaluate('engine.reload()');await wait('hud.reloading>0');await wait('hud.reloading>.25&&hud.reloading<.6');await screenshot('peace-launcher-reload');await wait('hud.reloading===0',12000);assert.equal(await evaluate('hud.magazine'),7);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('window.touchMode=true');await delay(250);
 const b=await evaluate("(()=>{const r=document.querySelector('.fps-mode-select').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:document.documentElement.scrollWidth>innerWidth};})()");assert(b.x>=0&&b.x+b.w<=390&&b.y>=0&&b.y+b.h<=844&&!b.overflow,JSON.stringify(b));await screenshot('peace-mobile-mode');await evaluate("document.querySelector('.fps-mode-select').click()");await wait('hud.weapon===11');
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});await evaluate("window.touchMode=false;choose('ff-intervention')");await enter();assert.equal(await evaluate('hud.weapon'),12);await screenshot('intervention-ready');
 await evaluate('engine.toggleAim()');await wait('hud.aimProgress>.95');await screenshot('intervention-ads');await evaluate('engine.toggleAim()');
 const shots=await evaluate('hud.shots');await evaluate("engine.setInput('fire',true)");await wait('JSON.parse(document.querySelector("canvas").dataset.boltCycle)?.travel>.04');await screenshot('intervention-bolt-cycle');await delay(1600);await evaluate("engine.setInput('fire',false)");assert.equal(await evaluate('hud.shots'),shots+1);
 await evaluate('engine.reload()');await wait('hud.reloading>.25&&hud.reloading<.65');await screenshot('intervention-reload');await wait('hud.reloading===0',12000);assert.equal(await evaluate('hud.magazine'),8);
 for(const [id,family]of [['ff-scar-l',8],['ff-scar-h',9],['ff-longwatch',10]]){await evaluate('choose('+JSON.stringify(id)+')');await enter();assert.equal(await evaluate('hud.weapon'),family);}
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,checks:['five cargo weapons','rifle and launcher selection via keyboard and touch','separate physical magazines','launcher impact event','both live sights','rear launcher reload','sniper bolt cycle and semi trigger','mobile layout'],exceptions:errors},null,2));console.log('PASS: five cargo weapons, separate rifle/launcher magazines, U and touch mode selection, impact grenade, ADS, reloads, manual bolt cycle and portrait HUD; no browser exceptions.');
}catch(error){console.log('Browser exceptions:',errors);throw error;}finally{await evaluate('engine?.dispose()').catch(()=>{});ws.close();await fetch(chrome+'/json/close/'+tab.id).catch(()=>{});}
