// Run Vite and Chrome with remote debugging. Uses real HUD components with
// deterministic speech; no renderer, paid APIs or external map requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9228';
const output = new URL('../.cache/hud-overlap/', import.meta.url);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('preview.html', output), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
await import('/src/styles.css');await import('/src/components/expedition.css');await import('/src/components/fps-hints.css');
const {default:Layout}=await import('/src/components/FpsHudLayout.tsx');
const {default:Map}=await import('/src/components/FpsMinimap.tsx');
const {default:Weapon}=await import('/src/components/FpsWeaponHud.tsx');
const {default:Slider}=await import('/src/components/FpsWeaponSlider.tsx');
const {default:Touch}=await import('/src/components/TouchControls.tsx');
const {initialFpsHud}=await import('/src/game/fps-engine.ts');
const {createProfile,resolveLoadout}=await import('/src/game/armory-state.ts');
const h=React.createElement,equipment=resolveLoadout(createProfile());
function Preview(){
 const [config,set]=React.useState({mode:'expedition',touch:false,expanded:false,hints:true});window.setHudLayoutTest=set;
 const hud={...initialFpsHud,phase:'playing',magazine:30,reserve:120,
  encikCallout:{id:1,event:'start',text:'Section, move towards the command post. Stay together and watch the road for enemy patrols.'},
  chatter:[{id:3,source:'Allies',tone:'friend',text:'Older line waiting to expire.'},{id:4,source:'Allies',tone:'friend',text:'Another older line waiting to expire.'},{id:1,source:'Section leader',tone:'friend',text:'Enemy infantry moving across the road. Find cover and watch the left flank.'},{id:2,source:'You',tone:'self',text:'Moving to the command post. Cover me while I cross the open ground.'}],
  comms:Array.from({length:16},(_,id)=>({id,at:1000+id*1000,channel:id%2?'chatter':'radio',source:'Section leader',text:'Hold this position and watch the approach to the command post.'}))};
 return h('div',{className:'fps-game is-immersive '+(config.mode==='expedition'?'expedition-game':''),'data-phase':'playing','data-touch':config.touch?'on':undefined,'data-hud-hints':config.hints?'on':'off'},
  h('div',{className:'viewport fps-viewport'},
   h('div',{className:'fps-top'},h('span',{className:'fps-badge'},'MARINA BAY / '+config.mode.toUpperCase()),h('span',{className:'fps-score'},'0 K / 0 D')),
   h(Layout,{hud,history:true},config.mode==='expedition'&&h('div',{className:'expedition-sector'},h('span',null,'LOCATION'),h('strong',null,'Waterfront command post'),h('div',{className:'expedition-heat'},h('div',null,h('small',null,'ENEMY'),h('i',{style:{width:'80%',background:'#e89b80'}})),h('div',null,h('small',null,'ALLIES'),h('i',{style:{width:'40%',background:'#8fd1e8'}})))),
    h(Map,{zone:'marina-bay',player:hud,mode:config.mode,expanded:config.expanded,onToggle:config.touch?()=>set({...config,expanded:!config.expanded}):undefined})),
   h(Slider,{hud,names:equipment.weapons.map(w=>w.name),canSwitch:true,onSwitch:()=>{}}),
   h(Weapon,{hud,weapon:equipment.weapons[0],canFight:true,touch:config.touch,onUtility:()=>{},onInspect:()=>{}}),
   config.touch&&h(Touch,{hud,engine:null,mode:'range',onMenu:()=>{}})));
}
createRoot(document.querySelector('#root')).render(h(Preview));
</script>`);
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin + '/.cache/hud-overlap/preview.html')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { const job = pending.get(message.id); if (job) { pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(Error(message.error.message)) : job.resolve(message.result); } }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error(method + ' timed out')), 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const boxes = `(()=>{const box=s=>{const e=document.querySelector(s);if(!e||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return Object.fromEntries(['.fps-minimap','.fps-radio-message','.fps-chatter','.fps-comms','.fps-comms>header','.expedition-sector','.fps-combat-hud','.touch-move','.touch-fire'].map(s=>[s,box(s)]));})()`;
const overlaps = (a,b) => a && b && a.x < b.right-1 && a.right > b.x+1 && a.y < b.bottom-1 && a.bottom > b.y+1;
const results = [];
async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(name + '.png', output), Buffer.from(result.data, 'base64')); }
try {
 await send('Page.enable');await send('Runtime.enable');
 for(let attempt=0;attempt<100&&!await evaluate('!!window.setHudLayoutTest');attempt++)await delay(100);
 assert(await evaluate('!!window.setHudLayoutTest'),errors.join('\n'));
 for(const [name,width,height,touch] of [['desktop',1280,900,false],['desktop-short',1280,720,false],['tablet',768,1024,true],['portrait',390,844,true],['portrait-small',360,640,true],['landscape',844,390,true],['landscape-small',667,375,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
  for(const mode of ['practice','arena','expedition']){
   await evaluate('window.setHudLayoutTest('+JSON.stringify({mode,touch,expanded:false,hints:true})+')');await delay(150);
   const layout=await evaluate(boxes);
   for(const a of ['.fps-minimap','.fps-comms','.expedition-sector']) for(const b of ['.fps-radio-message','.fps-chatter']) assert(!overlaps(layout[a],layout[b]),name+' '+mode+': '+a+' overlaps '+b+' '+JSON.stringify(layout));
   assert(!overlaps(layout['.fps-minimap'],layout['.fps-comms']),name+': history covers map');
   if(layout['.fps-comms'])assert(layout['.fps-comms'].height>=layout['.fps-comms>header'].height,name+': history controls are clipped');
   assert(!overlaps(layout['.fps-chatter'],layout['.fps-radio-message']),name+': speech lines overlap');
   for(const s of ['.fps-radio-message','.fps-chatter'])assert(!overlaps(layout[s],layout['.fps-combat-hud']),name+': speech covers combat status '+JSON.stringify(layout));
   for(const selector of ['.fps-minimap','.fps-radio-message','.fps-chatter']) {const b=layout[selector];assert(b&&b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.right<=width+1&&b.bottom<=height+1,name+' '+selector+' is outside the screen '+JSON.stringify(layout));}
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),name+': horizontal overflow');
   results.push({name,mode,layout});
   if(mode==='expedition')await screenshot(name);
  }
  await evaluate('window.setHudLayoutTest('+JSON.stringify({mode:'expedition',touch,expanded:true,hints:true})+')');await delay(150);
  const expanded=await evaluate(boxes),map=expanded['.fps-minimap'];
  assert(Math.abs((map.x+map.right)/2-width/2)<1&&Math.abs((map.y+map.bottom)/2-height/2)<1,name+': expanded map is not centered');
  assert(!expanded['.fps-chatter']&&!expanded['.fps-radio-message']&&!expanded['.fps-comms'],name+': text covers expanded map');
  if(name==='portrait')await screenshot('portrait-expanded');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
 console.log('PASS: map, sector, history, nearby chatter and radio do not overlap across 21 mode/viewport combinations; expanded maps stay centered and unobstructed. No runtime errors.');
}catch(error){await screenshot('failure');throw error;}
finally{ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
